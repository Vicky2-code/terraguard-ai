"""Shared helpers: time, thresholds, serializers, risk recomputation.

All datetimes are stored as naive-UTC and serialized as ISO-8601 with a `Z`
suffix (contract convention).
"""

import json
import re
from datetime import datetime, timezone
from typing import Optional

from app import config
from app.models.entities import Alert, Corridor, Incident, Infrastructure, Location, SystemSetting

# Re-exported for route modules that import colour mapping from here.
RISK_LEVEL_COLORS = config.RISK_LEVEL_COLORS

# ---------------------------------------------------------------------------
# Time
# ---------------------------------------------------------------------------


def utcnow() -> datetime:
    """Naive UTC now (stored in SQLite / PostgreSQL as UTC)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def age_seconds(dt: Optional[datetime]) -> Optional[int]:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return max(0, int((utcnow() - dt).total_seconds()))


# ---------------------------------------------------------------------------
# Settings storage (JSON values in system_settings)
# ---------------------------------------------------------------------------


def get_setting(db, key: str, default=None):
    row = db.get(SystemSetting, key)
    if row is None:
        return default
    try:
        return json.loads(row.value)
    except (TypeError, json.JSONDecodeError):
        return default


def set_setting(db, key: str, value) -> None:
    row = db.get(SystemSetting, key)
    payload = json.dumps(value)
    if row is None:
        db.add(SystemSetting(key=key, value=payload, updated_at=utcnow()))
    else:
        row.value = payload
        row.updated_at = utcnow()


# ---------------------------------------------------------------------------
# Threshold bands
# ---------------------------------------------------------------------------


def get_bands(db) -> dict:
    """Configured score bands, e.g. {"low": {"min": 0, "max": 24}, ...}."""
    stored = get_setting(db, "thresholds")
    if not isinstance(stored, dict):
        return {k: dict(v) for k, v in config.DEFAULT_BANDS.items()}
    bands = {}
    for name in config.BAND_ORDER:
        entry = stored.get(name)
        if isinstance(entry, dict) and "min" in entry and "max" in entry:
            bands[name] = {"min": int(entry["min"]), "max": int(entry["max"])}
        else:
            bands[name] = dict(config.DEFAULT_BANDS[name])
    return bands


def validate_bands(bands: dict) -> Optional[str]:
    """Return an error string when bands are invalid, else None.

    Rules: all five bands required, integer bounds, 0 <= min <= max <= 100,
    bands contiguous and ascending, covering exactly 0..100.
    """
    missing = [k for k in config.BAND_ORDER if k not in bands]
    if missing:
        return f"Missing bands: {', '.join(missing)}"
    for name in config.BAND_ORDER:
        entry = bands[name]
        if not isinstance(entry, dict) or "min" not in entry or "max" not in entry:
            return f"Band '{name}' must be an object with 'min' and 'max'"
        lo, hi = entry["min"], entry["max"]
        if isinstance(lo, bool) or isinstance(hi, bool) or not isinstance(lo, int) or not isinstance(hi, int):
            return f"Band '{name}' bounds must be integers"
        if lo < 0 or hi > 100:
            return f"Band '{name}' out of range: bounds must be within 0-100 (got {lo}-{hi})"
        if lo > hi:
            return f"Band '{name}' invalid: min {lo} greater than max {hi}"
    first = bands[config.BAND_ORDER[0]]
    if first["min"] != 0:
        return "The 'low' band must start at 0"
    for prev, nxt in zip(config.BAND_ORDER, config.BAND_ORDER[1:]):
        if bands[prev]["max"] + 1 != bands[nxt]["min"]:
            return (
                f"Bands must be contiguous: '{prev}' ends at {bands[prev]['max']} "
                f"but '{nxt}' starts at {bands[nxt]['min']}"
            )
    if bands[config.BAND_ORDER[-1]]["max"] != 100:
        return "The 'critical' band must end at 100"
    return None


def bands_from_cutoffs(cutoffs: dict) -> dict:
    """Build bands from cutoff-style thresholds {moderate, high, very_high, critical}."""
    moderate = int(cutoffs["moderate"])
    high = int(cutoffs["high"])
    very_high = int(cutoffs["very_high"])
    critical = int(cutoffs["critical"])
    return {
        "low": {"min": 0, "max": moderate - 1},
        "moderate": {"min": moderate, "max": high - 1},
        "high": {"min": high, "max": very_high - 1},
        "very_high": {"min": very_high, "max": critical - 1},
        "critical": {"min": critical, "max": 100},
    }


def cutoffs_from_bands(bands: dict) -> dict:
    return {
        "moderate": bands["moderate"]["min"],
        "high": bands["high"]["min"],
        "very_high": bands["very_high"]["min"],
        "critical": bands["critical"]["min"],
    }


def validate_cutoffs(cutoffs: dict) -> Optional[str]:
    required = ["moderate", "high", "very_high", "critical"]
    missing = [k for k in required if k not in cutoffs]
    if missing:
        return f"Missing thresholds: {', '.join(missing)}"
    for key in required:
        value = cutoffs[key]
        if isinstance(value, bool) or not isinstance(value, int):
            return f"Threshold '{key}' must be an integer"
        if value < 0 or value > 100:
            return f"Threshold '{key}' out of range: must be within 0-100 (got {value})"
    if not (0 < cutoffs["moderate"] < cutoffs["high"] < cutoffs["very_high"] < cutoffs["critical"] < 100):
        return (
            "Thresholds must satisfy 0 < moderate < high < very_high < critical < 100 "
            "(e.g. 25/50/70/85)"
        )
    return None


def level_for_score(score, bands: Optional[dict] = None) -> str:
    """Map a 0-100 score onto LOW | MODERATE | HIGH | VERY_HIGH | CRITICAL."""
    bands = bands or {k: dict(v) for k, v in config.DEFAULT_BANDS.items()}
    try:
        score = float(score)
    except (TypeError, ValueError):
        return "LOW"
    for name in config.BAND_ORDER:
        entry = bands[name]
        if entry["min"] <= score <= entry["max"]:
            return config.LEVEL_FOR_BAND[name]
    return "CRITICAL" if score > 100 else "LOW"


# ---------------------------------------------------------------------------
# Meta block (contract convention for live/measured data)
# ---------------------------------------------------------------------------


def build_meta(source: str, source_status: str, last_updated, refresh: int) -> dict:
    return {
        "source": source,
        "source_status": source_status,  # LIVE | STALE | UNAVAILABLE | DEMO
        "last_updated": iso(last_updated) if isinstance(last_updated, datetime) else last_updated,
        "data_age_seconds": age_seconds(last_updated) if isinstance(last_updated, datetime) else None,
        "refresh_interval_seconds": refresh,
    }


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

STATUS_BY_LEVEL = {"LOW": "NORMAL", "MODERATE": "NORMAL", "HIGH": "WATCH", "VERY_HIGH": "ALERT", "CRITICAL": "CRITICAL"}

# ---------------------------------------------------------------------------
# Alert status vocabulary
#
# Alerts are stored lowercase (active|acknowledged|resolved) but the API and
# the frontend use uppercase OPEN|ACKNOWLEDGED|RESOLVED (same convention as
# incidents). Both directions are normalised here so filters accept either.
# ---------------------------------------------------------------------------

ALERT_STATUS_TO_API = {
    "active": "OPEN",
    "acknowledged": "ACKNOWLEDGED",
    "resolved": "RESOLVED",
}
ALERT_STATUS_TO_DB = {
    "OPEN": "active",
    "ACTIVE": "active",
    "ACKNOWLEDGED": "acknowledged",
    "RESOLVED": "resolved",
}


def alert_status_to_db(value: str) -> str:
    """Map an API status (OPEN/ACKNOWLEDGED/RESOLVED or lowercase) to storage."""
    raw = (value or "").strip().upper()
    return ALERT_STATUS_TO_DB.get(raw, raw.lower())


def location_risk_category(score) -> str:
    return level_for_score(score).lower()


def location_dict(loc: Location) -> dict:
    risk_level = loc.risk_level or level_for_score(loc.risk_score)
    return {
        "id": loc.id,
        "name": loc.name,
        "state": loc.state,
        "district": loc.district,
        "latitude": loc.latitude,
        "longitude": loc.longitude,
        "elevation_m": loc.elevation or 0,
        "slope_deg": loc.slope or 0,
        "land_cover": loc.land_cover or "mixed",
        "population": loc.population or 0,
        "risk_score": round(float(loc.risk_score or 0), 1),
        "risk_level": risk_level,
        "risk_category": risk_level.lower(),
        "rainfall_mm_24h": round(float(loc.rainfall_mm_24h or 0), 1),
        "soil_moisture": round(float(loc.soil_moisture or 0), 1),
        "status": loc.status or STATUS_BY_LEVEL.get(risk_level, "NORMAL"),
        "assessed_at": iso(loc.assessed_at),
        # --- additional (informational) fields ---
        "category": loc.category or "landslide",
        "region": loc.region or loc.state,
        "rainfall_mm_1h": round(float(loc.rainfall_mm_1h or 0), 1),
        "rainfall_mm_6h": round(float(loc.rainfall_mm_6h or 0), 1),
        "forecast_24h_mm": round(float(loc.forecast_24h_mm or 0), 1),
        "temperature_c": round(float(loc.temperature_c or 0), 1),
        "humidity_pct": round(float(loc.humidity_pct or 0), 1),
        "wind_kmh": round(float(loc.wind_kmh or 0), 1),
        "pressure_hpa": round(float(loc.pressure_hpa or 0), 1),
        "people_at_risk": (loc.population or 0) if level_for_score(loc.risk_score) in ("HIGH", "VERY_HIGH", "CRITICAL") else 0,
        "weather_source": loc.weather_source or "simulated_fallback",
        "weather_updated_at": iso(loc.weather_updated_at),
        "simulation": bool(loc.scenario_boost),
        "geometry": {"type": "Point", "coordinates": [loc.longitude, loc.latitude]},
    }


def alert_dict(alert: Alert, location_name: str = "") -> dict:
    return {
        "id": alert.id,
        "location_id": alert.location_id,
        "location_name": location_name,
        "risk_level": alert.risk_level or alert.severity,
        "risk_score": float(alert.risk_score or 0),
        "trigger": alert.trigger or "risk_threshold_exceeded",
        "message": alert.message,
        "status": ALERT_STATUS_TO_API.get(alert.status or "active", alert.status),
        "delivery_status": alert.delivery_status or "SIMULATED_LOCAL",
        "created_at": iso(alert.created_at),
        "updated_at": iso(alert.updated_at or alert.created_at),
        # --- additional ---
        "simulation": bool(alert.simulation),
        "acknowledged_by": alert.acknowledged_by,
        "acknowledged_at": iso(alert.acknowledged_at),
    }


def incident_dict(inc: Incident) -> dict:
    return {
        "id": inc.id,
        "public_id": inc.public_id,
        "type": inc.type,
        "description": inc.description,
        "location_name": inc.location_name,
        "latitude": inc.latitude,
        "longitude": inc.longitude,
        "severity": inc.severity,
        "status": inc.status,
        "reporter": inc.reporter,
        "region": inc.region or "",
        "created_at": iso(inc.created_at),
        "updated_at": iso(inc.updated_at or inc.created_at),
        # --- additional ---
        "assigned_to": inc.assigned_to,
        "zone": inc.region or "",
    }


def corridor_dict(c: Corridor) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "route": c.route,
        "from": c.from_location,
        "to": c.to_location,
        "status": c.status,
        "risk_level": c.risk_level,
        "blockage": c.blockage or "",
        "incident_count": c.incident_count or 0,
        "last_update": iso(c.last_update),
        "demo": bool(c.demo),
    }


def infrastructure_dict(item: Infrastructure) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "type": item.type,
        "region": item.region,
        "latitude": item.latitude,
        "longitude": item.longitude,
        "criticality": item.criticality,
        "status": item.status,
        "risk_score": round(float(item.risk_score or 0), 1),
    }


# ---------------------------------------------------------------------------
# Incident public ids: INC-YYYY-0001
# ---------------------------------------------------------------------------


def next_incident_public_id(db, year: Optional[int] = None) -> str:
    year = year or utcnow().year
    prefix = f"INC-{year}-"
    rows = db.query(Incident.public_id).filter(Incident.public_id.like(f"{prefix}%")).all()
    max_seq = 0
    for (public_id,) in rows:
        match = re.match(r"INC-\d{4}-(\d+)$", public_id or "")
        if match:
            max_seq = max(max_seq, int(match.group(1)))
    return f"{prefix}{max_seq + 1:04d}"


# ---------------------------------------------------------------------------
# Risk recomputation for a stored location
# ---------------------------------------------------------------------------


def recompute_location_risk(db, loc: Location, bands: Optional[dict] = None) -> dict:
    """Deterministic PROTOTYPE re-score for one location (see prediction_engine)."""
    from app.prediction_engine import score_features

    result = score_features(
        rainfall=float(loc.rainfall_mm_24h or 0),
        soil_moisture=float(loc.soil_moisture or 0),
        slope=float(loc.slope or 0),
        elevation=float(loc.elevation or 0),
        land_cover=loc.land_cover or "mixed",
        recent_rainfall=float(loc.rainfall_mm_24h or 0) + float(loc.rainfall_mm_6h or 0) * 2.0,
        temperature=float(loc.temperature_c or 0),
        boost=float(loc.scenario_boost or 0),
        bands=bands,
    )
    loc.risk_score = result["risk_score"]
    loc.risk_level = result["risk_level"]
    loc.status = STATUS_BY_LEVEL.get(result["risk_level"], "NORMAL")
    loc.assessed_at = utcnow()
    return result
