"""Weather & soil endpoints (Open-Meteo server-side ingest).

- GET /api/weather?location_id=&zone=
- GET /api/weather/history?location_id=&hours=
- GET /api/soil-moisture?location_id=

Every response carries the contract `meta` block
(source, source_status, last_updated, data_age_seconds,
refresh_interval_seconds) plus `data_source` so the UI can show
LIVE / STALE / DEMO honestly.
"""

import json
import math
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func

from app import config
from app.database.db import get_db
from app.models.entities import EnvironmentalData, Location, SoilSnapshot
from app.services import weather as weather_service
from app.services.common import build_meta, iso, utcnow
from app.services.weather import deterministic_history, soil_meta, weather_meta

router = APIRouter(prefix="/api", tags=["Weather"])


def _resolve_location(db, location_id: str | None) -> Location:
    if location_id is not None and str(location_id).strip() != "":
        loc = None
        if str(location_id).isdigit():
            loc = db.get(Location, int(location_id))
        if loc is None:
            loc = db.query(Location).filter(Location.name == str(location_id)).first()
        if loc is None:
            raise HTTPException(status_code=404, detail=f"Location {location_id} not found")
        return loc
    # default: highest-risk monitored location
    loc = db.query(Location).order_by(Location.risk_score.desc(), Location.id.asc()).first()
    if loc is None:
        raise HTTPException(status_code=404, detail="No locations configured")
    return loc


@router.get("/weather")
def current_weather(
    location_id: str | None = Query(None),
    zone: str | None = Query(None, description="Aggregate for a state/zone instead of one location"),
    db=Depends(get_db),
):
    meta = weather_meta()
    if zone:
        locations = db.query(Location).filter(Location.region.ilike(f"%{zone}%")).all()
        if not locations:
            locations = db.query(Location).filter(Location.state.ilike(f"%{zone}%")).all()
        if not locations:
            raise HTTPException(status_code=404, detail=f"No locations in zone {zone}")
        count = len(locations)
        return {
            "location_id": None,
            "zone": zone,
            "location_count": count,
            "temperature_c": round(sum(l.temperature_c or 0 for l in locations) / count, 1),
            "humidity_pct": round(sum(l.humidity_pct or 0 for l in locations) / count, 1),
            "wind_kmh": round(sum(l.wind_kmh or 0 for l in locations) / count, 1),
            "pressure_hpa": round(sum(l.pressure_hpa or 0 for l in locations) / count, 1),
            "rainfall_mm_1h": round(sum(l.rainfall_mm_1h or 0 for l in locations) / count, 1),
            "rainfall_mm_6h": round(sum(l.rainfall_mm_6h or 0 for l in locations) / count, 1),
            "rainfall_mm_24h": round(sum(l.rainfall_mm_24h or 0 for l in locations) / count, 1),
            "forecast_24h_mm": round(sum(l.forecast_24h_mm or 0 for l in locations) / count, 1),
            "observed_at": iso(max(l.weather_updated_at for l in locations if l.weather_updated_at) or utcnow()),
            "data_source": meta.get("data_source"),
            "meta": meta,
        }

    loc = _resolve_location(db, location_id)
    return {
        "location_id": loc.id,
        "location_name": loc.name,
        "latitude": loc.latitude,
        "longitude": loc.longitude,
        "temperature_c": loc.temperature_c or 0,
        "humidity_pct": loc.humidity_pct or 0,
        "wind_kmh": loc.wind_kmh or 0,
        "pressure_hpa": loc.pressure_hpa or 1013,
        "rainfall_mm_1h": loc.rainfall_mm_1h or 0,
        "rainfall_mm_6h": loc.rainfall_mm_6h or 0,
        "rainfall_mm_24h": loc.rainfall_mm_24h or 0,
        "forecast_24h_mm": loc.forecast_24h_mm or 0,
        "observed_at": iso(loc.weather_updated_at),
        "data_source": meta.get("data_source"),
        "meta": meta,
    }


@router.get("/weather/history")
def weather_history(
    location_id: str | None = Query(None),
    hours: int = Query(24, ge=1, le=168),
    db=Depends(get_db),
):
    loc = _resolve_location(db, location_id)
    cutoff = utcnow().replace(minute=0, second=0, microsecond=0) - timedelta(hours=hours)
    rows = (
        db.query(EnvironmentalData)
        .filter(EnvironmentalData.location_id == loc.id, EnvironmentalData.recorded_at >= cutoff)
        .order_by(EnvironmentalData.recorded_at.asc())
        .all()
    )
    if rows:
        series = [
            {
                "time": iso(row.recorded_at),
                "rainfall_mm": float(row.rainfall or 0),
                "temperature_c": float(row.temperature or 0),
            }
            for row in rows
        ]
        meta = weather_meta()
    else:
        series = deterministic_history(loc, hours)
        meta = build_meta("simulated_fallback", "DEMO", utcnow(), 3600)
        meta["data_source"] = "simulated_fallback"
        meta["detail"] = "No stored history - deterministic demo series"
    return {"series": series, "location_id": loc.id, "meta": meta}


@router.get("/soil-moisture")
def soil_moisture(
    location_id: str | None = Query(None),
    db=Depends(get_db),
):
    loc = _resolve_location(db, location_id)
    meta = soil_meta()
    snapshot = db.get(SoilSnapshot, loc.id)

    if snapshot is not None:
        try:
            layers = json.loads(snapshot.layers_json)
        except (TypeError, json.JSONDecodeError):
            layers = []
    else:
        layers = []
    if not layers:
        base = float(loc.soil_moisture or 40)
        layers = [
            {"label": "0\u20137 cm", "moisture": round(base, 1), "saturation_pct": round(min(100.0, base / 45 * 100), 1), "status": "MOIST"},
            {"label": "7\u201328 cm", "moisture": round(base * 0.92, 1), "saturation_pct": round(min(100.0, base * 0.92 / 45 * 100), 1), "status": "MOIST"},
            {"label": "28\u2013100 cm", "moisture": round(base * 0.80, 1), "saturation_pct": round(min(100.0, base * 0.80 / 45 * 100), 1), "status": "MOIST"},
        ]

    rows = (
        db.query(EnvironmentalData)
        .filter(EnvironmentalData.location_id == loc.id)
        .order_by(EnvironmentalData.recorded_at.desc())
        .limit(12)
        .all()
    )
    if len(rows) >= 3:
        trend = [
            {"time": iso(row.recorded_at), "moisture": float(row.soil_moisture or 0)}
            for row in reversed(rows)
        ]
    else:
        trend = []
        for step in range(6):
            wobble = math.sin(step * 0.9 + loc.id) * 3.0
            trend.append(
                {
                    "time": iso(utcnow() - timedelta(hours=(5 - step))),
                    "moisture": round(max(0.0, min(100.0, float(loc.soil_moisture or 40) + wobble)), 1),
                }
            )

    observed_at = snapshot.observed_at if snapshot is not None else loc.weather_updated_at
    return {
        "location_id": loc.id,
        "location_name": loc.name,
        "layers": layers,
        "trend": trend,
        "observed_at": iso(observed_at),
        "data_source": meta.get("data_source"),
        "meta": meta,
    }
