"""Location endpoints.

- GET /api/locations                -> array (contract shape) + geometry extras
- GET /api/locations/geojson        -> GeoJSON FeatureCollection (map layer)
- GET /api/locations/{id}           -> single location
- GET /api/risk-map                 -> {features, legend, regions, meta}
- GET /api/risk/{location_id}       -> {location, current, history}
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from app import config
from app.database.db import get_db
from app.models.entities import Location, Prediction
from app.prediction_engine import heuristic_confidence, score_features
from app.services.common import (
    RISK_LEVEL_COLORS,
    get_bands,
    iso,
    location_dict,
    naive_utc,
    utcnow,
)
from app.services.weather import weather_meta

router = APIRouter(prefix="/api", tags=["Locations"])


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
    except ValueError:
        return None


def _find_location(db, location_id) -> Location:
    loc = None
    if str(location_id).isdigit():
        loc = db.get(Location, int(location_id))
    if loc is None:
        loc = db.query(Location).filter(Location.name == str(location_id)).first()
    if loc is None:
        raise HTTPException(status_code=404, detail=f"Location {location_id} not found")
    return loc


@router.get("/locations")
def list_locations(db=Depends(get_db)):
    locations = db.query(Location).order_by(Location.id).all()
    return [location_dict(loc) for loc in locations]


@router.get("/locations/geojson")
def locations_geojson(db=Depends(get_db)):
    """GeoJSON FeatureCollection with lowercase risk categories for markers."""
    features = []
    for loc in db.query(Location).order_by(Location.id).all():
        item = location_dict(loc)
        features.append(
            {
                "type": "Feature",
                "id": item["id"],
                "geometry": item["geometry"],
                "properties": {k: v for k, v in item.items() if k != "geometry"},
            }
        )
    meta = weather_meta(config.DASHBOARD_REFRESH_SECONDS)
    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": meta,
        "categories": ["low", "moderate", "high", "very_high", "critical"],
    }


@router.get("/locations/{location_id}")
def get_location(location_id: str, db=Depends(get_db)):
    return location_dict(_find_location(db, location_id))


@router.get("/risk-map")
def risk_map(
    region: str | None = Query(None),
    level: str | None = Query(None),
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    db=Depends(get_db),
):
    query = db.query(Location).order_by(Location.risk_score.desc())
    if region:
        query = query.filter(Location.state.ilike(f"%{region}%"))
    if level:
        query = query.filter(Location.risk_level == level.upper())
    from_dt = _parse_dt(from_)
    to_dt = _parse_dt(to)
    locations = query.all()
    features = []
    for loc in locations:
        assessed_at = naive_utc(loc.assessed_at)
        if from_dt and (assessed_at is None or assessed_at < from_dt):
            continue
        if to_dt and (assessed_at is None or assessed_at > to_dt):
            continue
        features.append(location_dict(loc))

    configured = get_bands(db)
    legend = [
        {
            "level": config.LEVEL_FOR_BAND[name],
            "min": configured[name]["min"],
            "max": configured[name]["max"],
            "color": RISK_LEVEL_COLORS[config.LEVEL_FOR_BAND[name]],
        }
        for name in config.BAND_ORDER
    ]

    regions = sorted({loc.state for loc in db.query(Location).all()})
    return {
        "features": features,
        "legend": legend,
        "regions": regions,
        "meta": weather_meta(config.DASHBOARD_REFRESH_SECONDS),
    }


@router.get("/risk/{location_id}")
def location_risk(location_id: str, db=Depends(get_db)):
    loc = _find_location(db, location_id)
    bands = get_bands(db)
    result = score_features(
        rainfall=float(loc.rainfall_mm_24h or 0),
        soil_moisture=float(loc.soil_moisture or 0),
        slope=float(loc.slope or 0),
        elevation=float(loc.elevation or 0),
        land_cover=loc.land_cover or "mixed",
        temperature=float(loc.temperature_c or 25),
        boost=float(loc.scenario_boost or 0),
        bands=bands,
    )
    provided = {
        "recent_rainfall": True,
        "land_cover": loc.land_cover,
        "elevation": loc.elevation,
        "temperature": loc.temperature_c,
    }
    history = (
        db.query(Prediction)
        .filter(Prediction.location_id == loc.id)
        .order_by(Prediction.created_at.desc())
        .limit(48)
        .all()
    )
    return {
        "location": location_dict(loc),
        "current": {
            "risk_score": round(float(loc.risk_score or 0), 1),
            "risk_level": loc.risk_level,
            "confidence": heuristic_confidence(provided),
            "model_version": config.MODEL_VERSION,
            "model_status": config.MODEL_STATUS,
            "assessed_at": iso(loc.assessed_at),
            "contributions": result["contributions"],
        },
        "history": [
            {
                "assessed_at": iso(row.created_at),
                "risk_score": float(row.risk_score),
                "risk_level": row.risk_level,
            }
            for row in history
        ],
    }
