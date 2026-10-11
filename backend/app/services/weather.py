"""Weather + soil ingestion.

Live data is fetched SERVER-SIDE only, from keyless providers, using a
provider chain (Open-Meteo's free tier is limited PER IP, so shared cloud
egress ranges — e.g. Render's free tier — are frequently over quota):

1. Open-Meteo forecast API   : https://api.open-meteo.com/v1/forecast
                               (direct, or via OPENMETEO_PROXY_BASE_URL)
2. Open-Meteo historical-forecast API : same payload shape, separate quota
3. MET Norway locationforecast: https://api.met.no/weatherapi/locationforecast/2.0/compact
                               (keyless, no shared-IP quota; publishes
                               forecasts only, so its rainfall fields are
                               short-range forecast sums and are labeled as such)

Soil moisture (ERA5-Land modelled reanalysis) still comes from the Open-Meteo
archive API.

When every provider fails (or TERRAGUARD_LIVE_WEATHER=0) we keep the
deterministic seeded values already in the database and flag them honestly:

    source_status: "DEMO"      -> values are simulated/seeded (never live)
    source_status: "STALE"     -> last known live values, refresh failing
    source_status: "LIVE"      -> fresh from the provider named in meta.source

`meta.data_source` is always the lowercase machine value
("open-meteo" / "open-meteo-historical" / "met.no" / "simulated_fallback";
soil: "open-meteo-reanalysis" / "simulated").
"""

import math
import time
from datetime import datetime, timedelta, timezone

import httpx

from app import config
from app.events import broker
from app.models.entities import EnvironmentalData, Location, SoilSnapshot
from app.services.common import age_seconds, build_meta, get_setting, iso, utcnow

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HISTORICAL_FORECAST_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
MET_NO_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact"

# Every provider that can write LIVE weather: machine key -> display label.
PROVIDER_LABEL = {
    "open-meteo": "Open-Meteo",
    "open-meteo-historical": "Open-Meteo (historical-forecast)",
    "met.no": "MET Norway (api.met.no)",
}
LIVE_SOURCES = tuple(PROVIDER_LABEL)


def source_label() -> str:
    """Display name of the provider behind the current live values."""
    return PROVIDER_LABEL.get(STATE.get("source") or "", "Open-Meteo")


def _forecast_url() -> str:
    """Direct forecast endpoint, or via the configured egress proxy."""
    if config.OPENMETEO_PROXY_BASE_URL:
        return f"{config.OPENMETEO_PROXY_BASE_URL}/v1/forecast"
    return FORECAST_URL

SOIL_VARS = (
    "soil_moisture_0_to_1cm,"
    "soil_moisture_1_to_3cm,"
    "soil_moisture_3_to_9cm,"
    "soil_moisture_9_to_27cm,"
    "soil_moisture_27_to_81cm"
)

SOIL_LAYER_LABELS = ["0\u20137 cm", "7\u201328 cm", "28\u2013100 cm"]

# Shared mutable state (read by the health endpoint).
STATE = {
    "ok": None,               # True/False/None (not yet attempted)
    "last_attempt": None,     # datetime
    "last_success": None,     # datetime
    "error": None,
    "source": "simulated_fallback",
    "soil_ok": None,
    "soil_last_success": None,
    "soil_error": None,
}


def _chunked(items, size):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _get_json(url: str, params: dict, headers: dict | None = None, retries: int = 4):
    """GET JSON with retry + backoff for transient upstream failures.

    Open-Meteo rate-limits per IP. Shared datacenter ranges (cloud hosts)
    frequently get a 429 on the first back-to-back batched requests even
    though the daily quota is fine, so retry with increasing waits before
    giving up. 429/5xx are retryable; other 4xx fail immediately.
    """
    delay = 2.0
    last_error: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(delay)
            delay *= 2
        try:
            response = httpx.get(
                url,
                params=params,
                headers=headers,
                timeout=config.WEATHER_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            last_error = exc
            if exc.response.status_code not in (429, 500, 502, 503, 504):
                raise
        except httpx.HTTPError as exc:
            last_error = exc
    raise last_error if last_error else RuntimeError("weather fetch failed")


def _hour_index(hourly_times, current_time):
    prefix = current_time[:13]  # "2026-10-07T13"
    for idx, value in enumerate(hourly_times):
        if value[:13] == prefix:
            return idx
    # fall back to the closest past hour
    try:
        current = datetime.fromisoformat(current_time)
    except ValueError:
        return None
    best, best_delta = None, None
    for idx, value in enumerate(hourly_times):
        try:
            candidate = datetime.fromisoformat(value)
        except ValueError:
            continue
        delta = abs((current - candidate).total_seconds())
        if best_delta is None or delta < best_delta:
            best, best_delta = idx, delta
    return best


def _window_sum(values, start, end):
    total = 0.0
    seen = 0
    for idx in range(max(0, start), min(len(values), end)):
        value = values[idx]
        if value is None:
            continue
        total += float(value)
        seen += 1
    return round(total, 2) if seen else 0.0


def _forecast_candidates() -> list:
    """Ordered (provider_key, url) pairs for the Open-Meteo family.

    The first entry honours OPENMETEO_PROXY_BASE_URL; the historical-forecast
    host uses a separate upstream quota, so it is the preferred fallback when
    the primary forecast API returns 429 from a shared egress IP.
    """
    candidates = [("open-meteo", _forecast_url())]
    if config.WEATHER_FALLBACK_ENABLED:
        candidates.append(("open-meteo-historical", HISTORICAL_FORECAST_URL))
    return candidates


def _ingest_open_meteo(db, url: str, provider: str) -> None:
    """Batch-fetch current weather + precipitation history for every location."""
    locations = db.query(Location).order_by(Location.id).all()
    if not locations:
        return

    now = utcnow()
    batches = list(_chunked(locations, 40))
    for batch_idx, batch in enumerate(batches):
        params = {
            "latitude": ",".join(f"{loc.latitude:.4f}" for loc in batch),
            "longitude": ",".join(f"{loc.longitude:.4f}" for loc in batch),
            "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,surface_pressure",
            "hourly": "precipitation",
            "past_days": 1,
            "forecast_days": 2,
            "timezone": "GMT",
        }
        payload = _get_json(url, params)
        rows = payload if isinstance(payload, list) else [payload]

        for loc, row in zip(batch, rows):
            current = row.get("current") or {}
            hourly = row.get("hourly") or {}
            times = hourly.get("time") or []
            values = hourly.get("precipitation") or []
            current_time = current.get("time") or ""
            idx = _hour_index(times, current_time) if times else None

            loc.temperature_c = round(float(current.get("temperature_2m") or 0), 1)
            loc.humidity_pct = round(float(current.get("relative_humidity_2m") or 0), 1)
            loc.wind_kmh = round(float(current.get("wind_speed_10m") or 0), 1)
            loc.pressure_hpa = round(float(current.get("surface_pressure") or 1013), 1)
            if idx is not None:
                loc.rainfall_mm_1h = round(float(values[idx] or 0), 2)
                loc.rainfall_mm_6h = _window_sum(values, idx - 5, idx + 1)
                loc.rainfall_mm_24h = _window_sum(values, idx - 23, idx + 1)
                loc.forecast_24h_mm = _window_sum(values, idx + 1, idx + 25)
            loc.weather_source = provider
            loc.weather_updated_at = now

            db.add(
                EnvironmentalData(
                    location_id=loc.id,
                    rainfall=loc.rainfall_mm_24h,
                    soil_moisture=loc.soil_moisture,
                    temperature=loc.temperature_c,
                    humidity=loc.humidity_pct,
                    slope=loc.slope,
                    recorded_at=now,
                )
            )

        # commit per chunk: batches already fetched stay persisted even if a
        # later batch ultimately fails, and pace requests to stay under the
        # upstream burst limit.
        db.commit()
        if batch_idx < len(batches) - 1:
            time.sleep(1.0)


def _met_precipitation_series(timeseries: list) -> list:
    """Hourly precipitation amounts (mm) from a MET Norway timeseries.

    MET only publishes forecasts. Prefer the 1-hour block; when it is absent
    fall back to splitting the 6h / 12h block across its hours.
    """
    values = []
    for entry in timeseries:
        data = entry.get("data") or {}
        amount = ((data.get("next_1_hours") or {}).get("details") or {}).get(
            "precipitation_amount"
        )
        if amount is None:
            amount = ((data.get("next_6_hours") or {}).get("details") or {}).get(
                "precipitation_amount"
            )
            if amount is not None:
                amount = float(amount) / 6.0
        if amount is None:
            amount = ((data.get("next_12_hours") or {}).get("details") or {}).get(
                "precipitation_amount"
            )
            if amount is not None:
                amount = float(amount) / 12.0
        values.append(float(amount) if amount is not None else 0.0)
    return values


def met_no_metrics(timeseries: list) -> dict:
    """Map a MET Norway timeseries to TerraGuard weather fields (pure).

    Precipitation: 1h = current hour, 6h/24h = the NEXT 6/24 hours, because
    MET publishes no observed history. Callers must disclose this in the meta.
    """
    if not timeseries:
        raise ValueError("empty MET Norway timeseries")
    first = timeseries[0]
    details = ((first.get("data") or {}).get("instant") or {}).get("details") or {}
    precip = _met_precipitation_series(timeseries)
    return {
        "observed_at": first.get("time"),
        "temperature_c": round(float(details.get("air_temperature") or 0), 1),
        "humidity_pct": round(float(details.get("relative_humidity") or 0), 1),
        # MET reports wind speed in m/s; TerraGuard stores/display km/h.
        "wind_kmh": round(float(details.get("wind_speed") or 0) * 3.6, 1),
        "pressure_hpa": round(float(details.get("air_pressure_at_sea_level") or 1013), 1),
        "rainfall_mm_1h": round(precip[0], 2),
        "rainfall_mm_6h": round(sum(precip[:6]), 2),
        "rainfall_mm_24h": round(sum(precip[:24]), 2),
        "forecast_24h_mm": round(sum(precip[1:25]), 2),
    }


def _ingest_met_no(db) -> bool:
    """Per-location MET Norway ingest (keyless; paced to respect their ToS)."""
    locations = db.query(Location).order_by(Location.id).all()
    if not locations:
        return False

    now = utcnow()
    headers = {"User-Agent": config.MET_NO_USER_AGENT, "Accept": "application/json"}
    failures = 0
    last_error: Exception | None = None

    for index, loc in enumerate(locations):
        try:
            payload = _get_json(
                MET_NO_URL,
                {"lat": f"{loc.latitude:.4f}", "lon": f"{loc.longitude:.4f}"},
                headers=headers,
                retries=2,
            )
            timeseries = ((payload.get("properties") or {}).get("timeseries")) or []
            metrics = met_no_metrics(timeseries)

            loc.temperature_c = metrics["temperature_c"]
            loc.humidity_pct = metrics["humidity_pct"]
            loc.wind_kmh = metrics["wind_kmh"]
            loc.pressure_hpa = metrics["pressure_hpa"]
            loc.rainfall_mm_1h = metrics["rainfall_mm_1h"]
            loc.rainfall_mm_6h = metrics["rainfall_mm_6h"]
            loc.rainfall_mm_24h = metrics["rainfall_mm_24h"]
            loc.forecast_24h_mm = metrics["forecast_24h_mm"]
            loc.weather_source = "met.no"
            loc.weather_updated_at = now

            db.add(
                EnvironmentalData(
                    location_id=loc.id,
                    rainfall=loc.rainfall_mm_24h,
                    soil_moisture=loc.soil_moisture,
                    temperature=loc.temperature_c,
                    humidity=loc.humidity_pct,
                    slope=loc.slope,
                    recorded_at=now,
                )
            )
        except Exception as exc:  # one bad location must not sink the cycle
            failures += 1
            last_error = exc

        if index % 10 == 9:
            db.commit()
        time.sleep(config.MET_NO_INGEST_DELAY_SECONDS)

    db.commit()

    if failures == len(locations):
        raise RuntimeError(f"MET Norway failed for every location: {last_error}")

    STATE["ok"] = True
    STATE["last_success"] = now
    STATE["source"] = "met.no"
    STATE["error"] = (
        None
        if failures == 0
        else f"MET Norway partial ingest: {failures}/{len(locations)} locations failed"
    )
    return True


def fetch_open_meteo(db) -> bool:
    """Run the provider chain and return True as soon as one provider works.

    Raises a combined error only when every provider failed, so callers keep
    the existing "fallback values + honest flag" behaviour.
    """
    locations = db.query(Location).order_by(Location.id).all()
    if not locations:
        return False

    STATE["last_attempt"] = utcnow()
    errors: list = []

    for provider, url in _forecast_candidates():
        try:
            _ingest_open_meteo(db, url, provider)
            STATE["ok"] = True
            STATE["last_success"] = utcnow()
            STATE["error"] = None
            STATE["source"] = provider
            return True
        except Exception as exc:  # rate limit / network / payload
            db.rollback()
            errors.append(f"{provider}: {exc}")

    if config.WEATHER_FALLBACK_ENABLED:
        try:
            return _ingest_met_no(db)
        except Exception as exc:
            db.rollback()
            errors.append(f"met.no: {exc}")

    raise RuntimeError(" | ".join(errors) or "no weather provider configured")


def _soil_layers_from_values(v0, v1, v2, v3, v4):
    """Combine ERA5 layers into three display layers (thickness-weighted)."""
    m0, m1, m2, m3, m4 = (float(v or 0) * 100 for v in (v0, v1, v2, v3, v4))
    layers = [
        (m0 * 1 + m1 * 2 + m2 * 4) / 7.0,
        (m2 * 2 + m3 * 18 + m4 * 1) / 21.0,
        m4,
    ]
    return layers


def _layer_status(moisture: float) -> str:
    if moisture >= 90:
        return "SATURATED"
    if moisture >= 70:
        return "WET"
    if moisture >= 45:
        return "MOIST"
    return "DRY"


def _pack_layers(moistures) -> list:
    layers = []
    for label, moisture in zip(SOIL_LAYER_LABELS, moistures):
        moisture = round(max(0.0, min(100.0, moisture)), 1)
        layers.append(
            {
                "label": label,
                "moisture": moisture,
                "saturation_pct": round(min(100.0, moisture / 45.0 * 100.0), 1),
                "status": _layer_status(moisture),
            }
        )
    return layers


def _fallback_layers(loc: Location) -> list:
    base = float(loc.soil_moisture or 40)
    return _pack_layers([base, base * 0.92, base * 0.80])


def fetch_soil(db) -> bool:
    """Fetch ERA5-Land soil moisture reanalysis; deterministic fallback after."""
    now = utcnow()
    STATE["last_attempt"] = STATE.get("last_attempt") or now
    locations = db.query(Location).order_by(Location.id).all()
    if not locations:
        return False

    try:
        batches = list(_chunked(locations, 40))
        for batch_idx, batch in enumerate(batches):
            params = {
                "latitude": ",".join(f"{loc.latitude:.4f}" for loc in batch),
                "longitude": ",".join(f"{loc.longitude:.4f}" for loc in batch),
                "hourly": SOIL_VARS,
                "past_days": 2,
                "timezone": "GMT",
            }
            payload = _get_json(ARCHIVE_URL, params)
            rows = payload if isinstance(payload, list) else [payload]

            for loc, row in zip(batch, rows):
                hourly = row.get("hourly") or {}
                series = [
                    hourly.get("soil_moisture_0_to_1cm") or [],
                    hourly.get("soil_moisture_1_to_3cm") or [],
                    hourly.get("soil_moisture_3_to_9cm") or [],
                    hourly.get("soil_moisture_9_to_27cm") or [],
                    hourly.get("soil_moisture_27_to_81cm") or [],
                ]
                last = None
                for idx in range(len(series[0]) - 1, -1, -1):
                    if all(s[idx] is not None for s in series):
                        last = idx
                        break
                if last is None:
                    continue
                values = [s[last] for s in series]
                layers = _pack_layers(_soil_layers_from_values(*values))
                loc.soil_moisture = layers[0]["moisture"]
                # Provenance for soil lives on the snapshot, not on the
                # location row (which tracks the WEATHER provider chain label).
                _store_soil_snapshot(db, loc, layers, "open-meteo-reanalysis", "open-meteo-reanalysis", now)

            # persist per chunk + pace requests (see fetch_open_meteo)
            db.commit()
            if batch_idx < len(batches) - 1:
                time.sleep(1.0)

        STATE["soil_ok"] = True
        STATE["soil_last_success"] = now
        STATE["soil_error"] = None
        return True
    except Exception as exc:  # network / payload problems -> honest fallback
        db.rollback()
        STATE["soil_ok"] = False
        STATE["soil_error"] = str(exc)
        for loc in locations:
            snapshot = db.get(SoilSnapshot, loc.id)
            if snapshot is None:
                _store_soil_snapshot(
                    db, loc, _fallback_layers(loc), "demo", "simulated", now
                )
        db.commit()
        return False


def _store_soil_snapshot(db, loc, layers, source, data_source, observed_at):
    import json

    snapshot = db.get(SoilSnapshot, loc.id)
    payload = json.dumps(layers)
    if snapshot is None:
        db.add(
            SoilSnapshot(
                location_id=loc.id,
                layers_json=payload,
                source=source,
                data_source=data_source,
                observed_at=observed_at,
            )
        )
    else:
        snapshot.layers_json = payload
        snapshot.source = source
        snapshot.data_source = data_source
        snapshot.observed_at = observed_at


def ensure_soil_snapshots(db):
    """Guarantee every location has a soil snapshot (seeded first boot)."""
    now = utcnow()
    for loc in db.query(Location).all():
        if db.get(SoilSnapshot, loc.id) is None:
            _store_soil_snapshot(db, loc, _fallback_layers(loc), "demo", "simulated", now)
    db.commit()


def ingest(db) -> dict:
    """Run one full ingestion cycle (weather + soil) and broadcast the result."""
    weather_ok = False
    soil_ok = False

    if config.LIVE_WEATHER_ENABLED:
        try:
            weather_ok = fetch_open_meteo(db)
        except Exception as exc:
            db.rollback()
            STATE["ok"] = False
            STATE["error"] = str(exc)
            # Keep the last successful provider name so STALE data is still
            # attributed to the right upstream.
            if STATE["last_success"] is None:
                STATE["source"] = "simulated_fallback"
        try:
            soil_ok = fetch_soil(db)
        except Exception as exc:  # pragma: no cover - defensive
            db.rollback()
            STATE["soil_ok"] = False
            STATE["soil_error"] = str(exc)
    else:
        STATE["ok"] = False
        STATE["error"] = "live weather disabled (TERRAGUARD_LIVE_WEATHER=0)"
        STATE["source"] = "simulated_fallback"
        STATE["last_attempt"] = utcnow()
        ensure_soil_snapshots(db)

    if STATE["ok"] is not True:
        # Flag stored values honestly: they are the deterministic fallback.
        for loc in (
            db.query(Location).filter(Location.weather_source.notin_(LIVE_SOURCES)).all()
        ):
            loc.weather_source = "simulated_fallback"
        db.commit()

    status = weather_source_status()
    summary = {
        "source_status": status,
        "weather_ok": bool(weather_ok),
        "soil_ok": bool(soil_ok),
        "last_updated": iso(STATE["last_success"] or utcnow()),
    }
    broker.publish("weather_update", summary)
    return summary


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------


def weather_source_status() -> str:
    """LIVE | STALE | UNAVAILABLE | DEMO for the current weather dataset."""
    if STATE["ok"] is True:
        return "LIVE"
    if STATE["last_success"] is not None:
        age = age_seconds(STATE["last_success"])
        if age is not None and age <= config.WEATHER_REFRESH_SECONDS * 4:
            return "STALE"
        return "STALE"
    return "DEMO"


def _live_detail(provider: str) -> str:
    """Honest one-line description of where live values came from."""
    if provider == "met.no":
        return (
            "live MET Norway (api.met.no) ingest ok - this provider publishes forecasts "
            "only, so rainfall 1h/6h/24h are short-range forecast sums"
        )
    if provider == "open-meteo-historical":
        return (
            "live Open-Meteo historical-forecast ingest ok "
            "(primary Open-Meteo forecast API is over its daily IP quota)"
        )
    return "live Open-Meteo ingest ok"


def weather_meta(refresh: int = config.WEATHER_REFRESH_SECONDS) -> dict:
    status = weather_source_status()
    provider = STATE.get("source") or "open-meteo"
    if status in ("LIVE", "STALE"):
        source = PROVIDER_LABEL.get(provider, "Open-Meteo")
        updated = STATE["last_success"]
        data_source = provider if provider in LIVE_SOURCES else "simulated_fallback"
    else:
        source = "simulated_fallback"
        updated = STATE["last_attempt"]
        data_source = "simulated_fallback"
    meta = build_meta(source, status, updated, refresh)
    meta["data_source"] = data_source
    if status == "LIVE":
        meta["detail"] = STATE["error"] or _live_detail(provider)
    else:
        meta["detail"] = (
            STATE["error"]
            or "no live weather provider reachable - deterministic fallback values in use"
        )
    return meta


def soil_meta() -> dict:
    if STATE["soil_ok"] is True:
        source = "Open-Meteo"
        status = "LIVE"
        updated = STATE["soil_last_success"]
        data_source = "open-meteo-reanalysis"
    else:
        source = "simulated"
        status = "DEMO"
        updated = STATE["soil_last_success"] or STATE["last_attempt"]
        data_source = "simulated"
    meta = build_meta(source, status, updated, config.WEATHER_REFRESH_SECONDS)
    meta["data_source"] = data_source
    meta["detail"] = (
        "ERA5-Land modelled reanalysis via Open-Meteo"
        if status == "LIVE"
        else "Soil moisture reanalysis unavailable - DEMO/simulated values shown"
    )
    return meta


def deterministic_history(loc: Location, hours: int) -> list:
    """Deterministic synthetic series used only when no stored history exists.

    Clearly flagged DEMO by the caller's meta block.
    """
    now = utcnow().replace(minute=0, second=0, microsecond=0)
    base_rain = float(loc.rainfall_mm_24h or 0) / 24.0
    base_temp = float(loc.temperature_c or 25)
    series = []
    for offset in range(hours - 1, -1, -1):
        moment = now - timedelta(hours=offset)
        wobble = math.sin((loc.id * 13 + offset) * 0.7)
        series.append(
            {
                "time": iso(moment),
                "rainfall_mm": round(max(0.0, base_rain + wobble * max(0.5, base_rain * 0.4)), 2),
                "temperature_c": round(base_temp + wobble * 2.5, 1),
            }
        )
    return series
