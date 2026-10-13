"""Analytics endpoints.

- GET /api/analytics?range=24h|7d|30d&region=
- GET /api/analytics/risk-trend
- GET /api/analytics/correlation
- GET /api/analytics/heatmap
- GET /api/analytics/model-performance   (honest: metrics not_available)
- GET /api/analytics/temporal  (alias of GET /api/temporal?range=&granularity=)
- GET /api/temporal?range=&granularity=hour|day|week

All numbers are computed from stored data - nothing is fabricated.
"""

import math
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func

from app import config
from app.database.db import get_db
from app.models.entities import Alert, EnvironmentalData, Incident, Location, Prediction
from app.services.common import get_bands, iso, naive_utc, utcnow
from app.services.weather import weather_meta

router = APIRouter(prefix="/api", tags=["Analytics"])


def _parse_range(range_value: str | None) -> tuple[timedelta, str]:
    raw = (range_value or "24h").strip().lower()
    if raw.endswith("h") and raw[:-1].isdigit():
        hours = max(1, min(int(raw[:-1]), 24 * 90))
        return timedelta(hours=hours), raw
    if raw.endswith("d") and raw[:-1].isdigit():
        days = max(1, min(int(raw[:-1]), 90))
        return timedelta(days=days), raw
    if raw.endswith("w") and raw[:-1].isdigit():
        weeks = max(1, min(int(raw[:-1]), 12))
        return timedelta(weeks=weeks), raw
    return timedelta(hours=24), "24h"


def _bucket_starts(start: datetime, end: datetime, granularity: str) -> list[datetime]:
    starts = []
    if granularity == "hour":
        cursor = start.replace(minute=0, second=0, microsecond=0)
        while cursor <= end:
            starts.append(cursor)
            cursor += timedelta(hours=1)
    elif granularity == "week":
        cursor = start.replace(hour=0, minute=0, second=0, microsecond=0)
        while cursor <= end:
            starts.append(cursor)
            cursor += timedelta(days=7)
    else:  # day
        cursor = start.replace(hour=0, minute=0, second=0, microsecond=0)
        while cursor <= end:
            starts.append(cursor)
            cursor += timedelta(days=1)
    return starts


def _bucket_of(starts: list[datetime], moment: datetime) -> datetime | None:
    """Return the bucket start covering `moment` (buckets are [start, next_start))."""
    moment = naive_utc(moment)
    if not starts or moment is None or moment < starts[0]:
        return None
    lo, hi = 0, len(starts) - 1
    if moment >= starts[-1]:
        return starts[-1]
    while lo <= hi:
        mid = (lo + hi) // 2
        if moment < starts[mid]:
            hi = mid - 1
        elif mid + 1 < len(starts) and moment >= starts[mid + 1]:
            lo = mid + 1
        else:
            return starts[mid]
    return starts[max(0, lo)]


def _meta(range_label: str, refresh: int = 300) -> dict:
    meta = weather_meta()
    meta["range"] = range_label
    meta["refresh_interval_seconds"] = refresh
    return meta


@router.get("/analytics")
def analytics(
    range: str | None = Query(None),
    region: str | None = Query(None),
    db=Depends(get_db),
):
    delta, range_label = _parse_range(range)
    since = utcnow() - delta
    bands = get_bands(db)
    high_min = bands["high"]["min"]

    # --- incident stats ---------------------------------------------------
    incident_query = db.query(Incident).filter(Incident.created_at >= since)
    alert_query = db.query(Alert).filter(Alert.created_at >= since)
    if region:
        pattern = f"%{region}%"
        incident_query = incident_query.filter(Incident.region.ilike(pattern))
        alert_query = alert_query.join(Location, Alert.location_id == Location.id).filter(
            Location.state.ilike(pattern)
        )
    incidents_total = incident_query.count()
    active_alerts = db.query(Alert).filter(Alert.status == "active").count()

    # --- response times (alert created -> acknowledged) -------------------
    acked = (
        db.query(Alert.created_at, Alert.acknowledged_at)
        .filter(Alert.acknowledged_at.isnot(None), Alert.acknowledged_at >= since)
        .all()
    )
    if acked:
        response_minutes = sum(
            (ack - created).total_seconds() / 60.0 for created, ack in acked if ack and created
        ) / len(acked)
        response_minutes = round(response_minutes, 1)
    else:
        response_minutes = None

    # --- regional risk ----------------------------------------------------
    regional_query = db.query(
        Location.state, func.avg(Location.risk_score), func.count(Location.id)
    )
    if region:
        regional_query = regional_query.filter(Location.state.ilike(f"%{region}%"))
    regional_rows = regional_query.group_by(Location.state).all()
    regional_risk = sorted(
        [
            {"region": state, "risk_score": round(float(avg or 0), 1), "locations": count}
            for state, avg, count in regional_rows
        ],
        key=lambda entry: entry["risk_score"],
        reverse=True,
    )
    risk_regions = sum(1 for entry in regional_risk if entry["risk_score"] >= high_min)

    # --- incident distribution -------------------------------------------
    dist_query = db.query(Incident.type, func.count(Incident.id)).filter(
        Incident.created_at >= since
    )
    if region:
        dist_query = dist_query.filter(Incident.region.ilike(f"%{region}%"))
    incident_distribution = [
        {"type": kind, "count": count}
        for kind, count in dist_query.group_by(Incident.type).all()
    ]

    # --- alert history buckets -------------------------------------------
    granularity = "hour" if delta <= timedelta(hours=48) else "day"
    starts = _bucket_starts(since, utcnow(), granularity)
    counts = {bucket: 0 for bucket in starts}
    for (created,) in db.query(Alert.created_at).filter(Alert.created_at >= since).all():
        if created is None:
            continue
        bucket = _bucket_of(starts, created)
        if bucket is not None and bucket in counts:
            counts[bucket] += 1
    alert_history = [{"time": iso(bucket), "count": counts[bucket]} for bucket in starts]

    return {
        "kpis": {
            "avg_response_minutes": response_minutes,
            "alert_response_minutes": response_minutes,
            "active_alerts": active_alerts,
            "incidents": incidents_total,
            "risk_regions": risk_regions,
        },
        "regional_risk": regional_risk,
        "incident_distribution": incident_distribution,
        "alert_history": alert_history,
        "meta": _meta(range_label),
    }


@router.get("/analytics/risk-trend")
def risk_trend(range: str | None = Query(None), db=Depends(get_db)):
    delta, range_label = _parse_range(range)
    since = utcnow() - delta
    granularity = "hour" if delta <= timedelta(hours=48) else "day"
    starts = _bucket_starts(since, utcnow(), granularity)

    buckets = {bucket: [] for bucket in starts}
    rows = (
        db.query(Prediction.risk_score, Prediction.created_at)
        .filter(Prediction.created_at >= since)
        .all()
    )
    for score, created in rows:
        if created is None:
            continue
        bucket = _bucket_of(starts, created)
        if bucket is not None and bucket in buckets:
            buckets[bucket].append(float(score))

    series = []
    for bucket in starts:
        values = buckets[bucket]
        series.append(
            {
                "time": iso(bucket),
                "avg_risk": round(sum(values) / len(values), 1) if values else None,
                "max_risk": round(max(values), 1) if values else None,
                "min_risk": round(min(values), 1) if values else None,
                "samples": len(values),
            }
        )
    return {"series": series, "granularity": granularity, "meta": _meta(range_label)}


def _pearson(xs, ys) -> float | None:
    n = len(xs)
    if n < 3:
        return None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    var_x = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    var_y = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    if var_x == 0 or var_y == 0:
        return None
    return round(cov / (var_x * var_y), 3)


@router.get("/analytics/correlation")
def correlation(range: str | None = Query(None), db=Depends(get_db)):
    delta, range_label = _parse_range(range)
    since = utcnow() - delta
    rows = (
        db.query(EnvironmentalData)
        .filter(EnvironmentalData.recorded_at >= since)
        .limit(20000)
        .all()
    )
    definitions = [
        ("rainfall", "soil_moisture"),
        ("rainfall", "temperature"),
        ("rainfall", "humidity"),
        ("soil_moisture", "humidity"),
        ("soil_moisture", "temperature"),
    ]
    pairs = []
    for x_name, y_name in definitions:
        xs, ys = [], []
        for row in rows:
            x = getattr(row, x_name, None)
            y = getattr(row, y_name, None)
            if x is None or y is None:
                continue
            xs.append(float(x))
            ys.append(float(y))
        pairs.append(
            {
                "x": x_name,
                "y": y_name,
                "r": _pearson(xs, ys),
                "n": len(xs),
            }
        )
    return {
        "pairs": pairs,
        "method": "pearson",
        "meta": _meta(range_label),
        "note": "Correlation is descriptive only - the prototype model is not trained on these series.",
    }


@router.get("/analytics/heatmap")
def heatmap(db=Depends(get_db)):
    locations = db.query(Location).order_by(Location.risk_score.desc()).all()
    points = [
        {
            "location_id": loc.id,
            "name": loc.name,
            "latitude": loc.latitude,
            "longitude": loc.longitude,
            "risk_score": round(float(loc.risk_score or 0), 1),
            "risk_level": loc.risk_level,
            "intensity": round(float(loc.risk_score or 0) / 100.0, 3),
            "population": loc.population or 0,
            "category": loc.category,
        }
        for loc in locations
    ]
    return {
        "points": points,
        "scale": {"min": 0, "max": 100},
        "meta": _meta("current"),
    }


@router.get("/analytics/model-performance")
def model_performance():
    metrics = {
        "accuracy": None,
        "precision": None,
        "recall": None,
        "f1": None,
        "mae": None,
        "rmse": None,
    }
    return {
        "model": {
            "name": "TerraGuard Risk Scoring Engine",
            "version": config.MODEL_VERSION,
            "model_status": config.MODEL_STATUS,
            "label": config.MODEL_LABEL,
            "model_type": "deterministic_weighted_heuristic",
        },
        "status": "not_available",
        "metrics": metrics,
        "metrics_status": "not_available",
        "model_status": config.MODEL_STATUS,
        "evaluated_at": None,
        "note": (
            "PROTOTYPE MODEL: deterministic weighted heuristic, not trained or "
            "validated. Performance metrics have not been measured and are null."
        ),
        "meta": _meta("current"),
    }


def _temporal(range_value: str | None, granularity: str | None, db) -> dict:
    delta, range_label = _parse_range(range_value)
    granularity = (granularity or "hour").strip().lower()
    if granularity not in {"hour", "day", "week"}:
        granularity = "hour"
    since = utcnow() - delta
    starts = _bucket_starts(since, utcnow(), granularity)

    rainfall = {bucket: [] for bucket in starts}
    for value, created in (
        db.query(EnvironmentalData.rainfall, EnvironmentalData.recorded_at)
        .filter(EnvironmentalData.recorded_at >= since)
        .all()
    ):
        bucket = _bucket_of(starts, created) if created else None
        if bucket is not None and bucket in rainfall and value is not None:
            rainfall[bucket].append(float(value))

    risk = {bucket: [] for bucket in starts}
    for value, created in (
        db.query(Prediction.risk_score, Prediction.created_at)
        .filter(Prediction.created_at >= since)
        .all()
    ):
        bucket = _bucket_of(starts, created) if created else None
        if bucket is not None and bucket in risk and value is not None:
            risk[bucket].append(float(value))

    incidents = {bucket: 0 for bucket in starts}
    for (created,) in db.query(Incident.created_at).filter(Incident.created_at >= since).all():
        bucket = _bucket_of(starts, created) if created else None
        if bucket is not None and bucket in incidents:
            incidents[bucket] += 1

    alerts = {bucket: 0 for bucket in starts}
    for (created,) in db.query(Alert.created_at).filter(Alert.created_at >= since).all():
        bucket = _bucket_of(starts, created) if created else None
        if bucket is not None and bucket in alerts:
            alerts[bucket] += 1

    return {
        "rainfall": [
            {"time": iso(b), "value": round(sum(rainfall[b]) / len(rainfall[b]), 1) if rainfall[b] else None}
            for b in starts
        ],
        "risk": [
            {"time": iso(b), "value": round(sum(risk[b]) / len(risk[b]), 1) if risk[b] else None}
            for b in starts
        ],
        "incidents": [{"time": iso(b), "value": incidents[b]} for b in starts],
        "alerts": [{"time": iso(b), "value": alerts[b]} for b in starts],
        "granularity": granularity,
        "meta": _meta(range_label),
    }


@router.get("/temporal")
def temporal(
    range: str | None = Query(None),
    granularity: str | None = Query(None),
    db=Depends(get_db),
):
    return _temporal(range, granularity, db)


@router.get("/analytics/temporal")
def temporal_alias(
    range: str | None = Query(None),
    granularity: str | None = Query(None),
    db=Depends(get_db),
):
    return _temporal(range, granularity, db)
