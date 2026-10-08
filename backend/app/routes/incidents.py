"""Incident endpoints (persisted in the database).

- GET  /api/incidents  filters: status, severity, type, zone, q, dateFrom/dateTo
                       (contract aliases: region, search, from, to), pagination
- POST /api/incidents  -> 201 with generated public_id (INC-2026-0001)
- GET  /api/incidents/{id}      (numeric id or public_id)
- PATCH /api/incidents/{id}     {status?, severity?, assigned_to?}
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_

from app.database.db import get_db
from app.events import broker
from app.models.entities import Incident
from app.services.common import incident_dict, iso, next_incident_public_id, utcnow

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])

SEVERITIES = {"LOW", "MEDIUM", "MODERATE", "HIGH", "CRITICAL"}
SEVERITY_ALIASES = {"MEDIUM": "MEDIUM", "MODERATE": "MEDIUM"}
STATUSES = {"OPEN", "INVESTIGATING", "IN_PROGRESS", "CONTAINED", "RESOLVED", "CLOSED"}
STATUS_ALIASES = {"IN_PROGRESS": "INVESTIGATING", "TRIAGE": "INVESTIGATING"}


class IncidentCreate(BaseModel):
    type: str = Field(..., min_length=2, max_length=60)
    description: str = Field(..., min_length=3, max_length=4000)
    location_name: str = Field(..., min_length=1, max_length=200)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    severity: str
    reporter: str = Field("field", max_length=120)
    region: str | None = Field(None, max_length=120)
    image_b64: str | None = None


class IncidentPatch(BaseModel):
    status: str | None = None
    severity: str | None = None
    assigned_to: str | None = None


def _normalize_severity(value: str) -> str:
    raw = (value or "").strip().upper()
    raw = SEVERITY_ALIASES.get(raw, raw)
    if raw not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid severity '{value}' (expected LOW, MEDIUM, HIGH or CRITICAL)",
        )
    return raw


def _normalize_status(value: str) -> str:
    raw = (value or "").strip().upper()
    raw = STATUS_ALIASES.get(raw, raw)
    if raw not in STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status '{value}' (expected one of {', '.join(sorted(STATUSES))})",
        )
    return raw


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid date '{value}' (use ISO-8601)")


def _resolve_incident(db, incident_id: str) -> Incident:
    incident = None
    if str(incident_id).isdigit():
        incident = db.get(Incident, int(incident_id))
    if incident is None:
        incident = db.query(Incident).filter(Incident.public_id == str(incident_id)).first()
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return incident


@router.get("")
def list_incidents(
    status: str | None = Query(None),
    severity: str | None = Query(None),
    type: str | None = Query(None),
    zone: str | None = Query(None),
    region: str | None = Query(None),
    q: str | None = Query(None),
    search: str | None = Query(None),
    dateFrom: str | None = Query(None),
    dateTo: str | None = Query(None),
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    page_size: int | None = Query(None, ge=1, le=500),
    db=Depends(get_db),
):
    query = db.query(Incident)

    if status:
        query = query.filter(Incident.status == _normalize_status(status))
    if severity:
        query = query.filter(Incident.severity == _normalize_severity(severity))
    if type:
        query = query.filter(Incident.type.ilike(type.strip()))
    zone_value = zone or region
    if zone_value:
        query = query.filter(Incident.region.ilike(f"%{zone_value.strip()}%"))
    text = (q or search or "").strip()
    if text:
        pattern = f"%{text}%"
        query = query.filter(
            or_(
                Incident.description.ilike(pattern),
                Incident.location_name.ilike(pattern),
                Incident.public_id.ilike(pattern),
                Incident.type.ilike(pattern),
                Incident.reporter.ilike(pattern),
            )
        )
    date_from = _parse_date(dateFrom or from_)
    date_to = _parse_date(dateTo or to)
    if date_from:
        query = query.filter(Incident.created_at >= date_from)
    if date_to:
        # treat a date-only bound as inclusive end of day
        if len((dateTo or to or "")) <= 10:
            date_to = date_to + timedelta(days=1) - timedelta(seconds=1)
        query = query.filter(Incident.created_at <= date_to)

    total = query.count()
    effective_limit = page_size or limit
    rows = (
        query.order_by(Incident.created_at.desc(), Incident.id.desc())
        .offset((page - 1) * effective_limit)
        .limit(effective_limit)
        .all()
    )
    return {
        "items": [incident_dict(row) for row in rows],
        "total": total,
        "meta": {
            "page": page,
            "limit": effective_limit,
            "pages": max(1, -(-total // effective_limit)),
            "source": "incidents table",
            "source_status": "LIVE",
            "last_updated": iso(utcnow()),
            "data_age_seconds": 0,
            "refresh_interval_seconds": 60,
        },
    }


@router.post("", status_code=201)
def create_incident(payload: IncidentCreate, db=Depends(get_db)):
    severity = _normalize_severity(payload.severity)
    now = utcnow()
    incident = Incident(
        public_id=next_incident_public_id(db),
        type=payload.type.strip().upper().replace(" ", "_"),
        description=payload.description.strip(),
        location_name=payload.location_name.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        severity=severity,
        status="OPEN",
        reporter=payload.reporter.strip() or "field",
        region=(payload.region or "").strip(),
        image_b64=payload.image_b64,
        created_at=now,
        updated_at=now,
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    item = incident_dict(incident)
    broker.publish("incident_created", item)
    return item


@router.get("/{incident_id}")
def get_incident(incident_id: str, db=Depends(get_db)):
    return incident_dict(_resolve_incident(db, incident_id))


@router.patch("/{incident_id}")
def patch_incident(incident_id: str, payload: IncidentPatch, db=Depends(get_db)):
    incident = _resolve_incident(db, incident_id)
    changed = False
    if payload.status is not None:
        incident.status = _normalize_status(payload.status)
        changed = True
    if payload.severity is not None:
        incident.severity = _normalize_severity(payload.severity)
        changed = True
    if payload.assigned_to is not None:
        incident.assigned_to = payload.assigned_to
        changed = True
    incident.updated_at = utcnow()
    db.commit()
    db.refresh(incident)
    return incident_dict(incident)
