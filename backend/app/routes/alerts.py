"""Alert endpoints.

- GET  /api/alerts?status=&level=  -> {items, meta}   (deduped stored records)
- GET  /api/alerts/thresholds      -> configurable score bands
- PUT  /api/alerts/thresholds      -> update bands (0-24 / 25-49 / 50-69 /
                                      70-84 / 85-100 by default); out-of-range
                                      or non-contiguous values are rejected 400
- POST /api/alerts/{id}/ack        -> acknowledge an alert
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app import config
from app.database.db import get_db
from app.events import broker
from app.models.entities import Alert, Location
from app.services.alerts import evaluate_alerts
from app.services.common import (
    alert_dict,
    alert_status_to_db,
    bands_from_cutoffs,
    cutoffs_from_bands,
    get_bands,
    iso,
    set_setting,
    utcnow,
    validate_bands,
    validate_cutoffs,
)

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


class ThresholdsPayload(BaseModel):
    thresholds: dict | None = None
    # flat/compact shapes are accepted too
    low: dict | None = None
    moderate: dict | int | None = None
    high: dict | int | None = None
    very_high: dict | int | None = None
    critical: dict | int | None = None


class AckPayload(BaseModel):
    acknowledged_by: str = "operator"
    by: str | None = None
    note: str | None = None


class AlertPatch(BaseModel):
    status: str | None = None
    acknowledged_by: str | None = None
    note: str | None = None


def _thresholds_response(db) -> dict:
    from app.services.common import get_setting

    bands = get_bands(db)
    updated = get_setting(db, "thresholds_updated_at")
    return {
        "thresholds": bands,
        "levels": [config.LEVEL_FOR_BAND[name] for name in config.BAND_ORDER],
        "cutoffs": cutoffs_from_bands(bands),
        "updated_at": updated,
    }


@router.get("")
def list_alerts(
    status: str | None = Query(None),
    level: str | None = Query(None),
    location_id: int | None = Query(None),
    db=Depends(get_db),
):
    query = db.query(Alert)
    if status:
        query = query.filter(Alert.status == alert_status_to_db(status))
    if level:
        query = query.filter(Alert.risk_level == level.strip().upper())
    if location_id:
        query = query.filter(Alert.location_id == location_id)
    rows = query.order_by(Alert.created_at.desc(), Alert.id.desc()).all()
    names = {loc.id: loc.name for loc in db.query(Location).all()}
    return {
        "items": [alert_dict(row, names.get(row.location_id, "")) for row in rows],
        "meta": {
            "source": "alert_engine",
            "source_status": "LIVE",
            "last_updated": iso(utcnow()),
            "data_age_seconds": 0,
            "refresh_interval_seconds": config.JOB_INTERVALS["alert_evaluation"],
            "delivery_status": "SIMULATED_LOCAL",
            "dedupe_rule": "one open alert per (location_id, risk_level)",
        },
    }


@router.get("/thresholds")
def get_thresholds(db=Depends(get_db)):
    return _thresholds_response(db)


@router.put("/thresholds")
def put_thresholds(payload: ThresholdsPayload, db=Depends(get_db)):
    body = payload.model_dump(exclude_none=True)
    inner = body.get("thresholds")
    candidate = inner if isinstance(inner, dict) else body
    candidate = {k: v for k, v in candidate.items() if k != "thresholds"}
    if not candidate:
        raise HTTPException(status_code=400, detail="No thresholds supplied")

    values = list(candidate.values())
    if all(isinstance(v, dict) for v in values):
        # band shape: {"low": {"min": 0, "max": 24}, ...}
        bands = {}
        for name, entry in candidate.items():
            if not isinstance(entry, dict) or "min" not in entry or "max" not in entry:
                raise HTTPException(status_code=400, detail=f"Band '{name}' must have min and max")
            if isinstance(entry["min"], bool) or isinstance(entry["max"], bool):
                raise HTTPException(status_code=400, detail=f"Band '{name}' bounds must be integers")
            if not isinstance(entry["min"], int) or not isinstance(entry["max"], int):
                raise HTTPException(status_code=400, detail=f"Band '{name}' bounds must be integers (0-100)")
            bands[name] = {"min": entry["min"], "max": entry["max"]}
        error = validate_bands(bands)
    elif all(isinstance(v, int) and not isinstance(v, bool) for v in values):
        # cutoff shape: {"moderate": 25, "high": 50, "very_high": 70, "critical": 85}
        cutoffs = {k: int(v) for k, v in candidate.items()}
        error = validate_cutoffs(cutoffs)
        bands = bands_from_cutoffs(cutoffs) if error is None else None
    else:
        raise HTTPException(
            status_code=400,
            detail="Thresholds must be integer cutoffs (0-100) or band objects with min/max",
        )

    if error:
        raise HTTPException(status_code=400, detail=error)

    now = utcnow()
    set_setting(db, "thresholds", bands)
    set_setting(db, "thresholds_updated_at", iso(now))
    db.commit()
    broker.publish(
        "settings_changed",
        {"thresholds": bands, "cutoffs": cutoffs_from_bands(bands), "updated_at": iso(now)},
    )
    # re-evaluate alerts against the new thresholds immediately
    evaluate_alerts(db)
    return _thresholds_response(db)


@router.post("/{alert_id}/ack")
def acknowledge(alert_id: int, payload: AckPayload | None = None, db=Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
    who = "operator"
    if payload is not None:
        who = payload.by or payload.acknowledged_by or "operator"
    alert.status = "acknowledged"
    alert.acknowledged_by = who
    alert.acknowledged_at = utcnow()
    alert.updated_at = utcnow()
    db.commit()
    db.refresh(alert)
    location = db.get(Location, alert.location_id)
    return alert_dict(alert, location.name if location else "")


@router.patch("/{alert_id}")
def patch_alert(alert_id: int, payload: AlertPatch, db=Depends(get_db)):
    """Update alert status (frontend sends {status: "ACKNOWLEDGED"} etc.)."""
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")

    if payload.status is not None:
        new_status = alert_status_to_db(payload.status)
        if new_status not in {"active", "acknowledged", "resolved"}:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Invalid status '{payload.status}' "
                    "(expected OPEN, ACKNOWLEDGED or RESOLVED)"
                ),
            )
        alert.status = new_status
        if new_status == "acknowledged":
            alert.acknowledged_by = (
                payload.acknowledged_by or alert.acknowledged_by or "operator"
            )
            alert.acknowledged_at = alert.acknowledged_at or utcnow()
        if payload.note:
            alert.message = f"{alert.message}\n[note] {payload.note}"
    elif payload.acknowledged_by:
        alert.acknowledged_by = payload.acknowledged_by

    alert.updated_at = utcnow()
    db.commit()
    db.refresh(alert)
    location = db.get(Location, alert.location_id)
    return alert_dict(alert, location.name if location else "")
