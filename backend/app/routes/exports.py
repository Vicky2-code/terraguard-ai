"""Export + report endpoints (real file downloads from DB rows).

- GET /api/export/incidents.csv                      -> CSV attachment
- GET /api/export?dataset=&format=csv|json&from=&to=&region=
- GET /api/reports/summary                           -> JSON operations summary
"""

import csv
import io
import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, or_

from app import config
from app.database.db import get_db
from app.models.entities import Alert, Corridor, Incident, Infrastructure, Location
from app.services.common import (
    ALERT_STATUS_TO_API,
    alert_status_to_db,
    get_bands,
    iso,
    utcnow,
)
from app.services.weather import weather_meta

router = APIRouter(prefix="/api", tags=["Exports"])

INCIDENT_COLUMNS = [
    "id", "public_id", "type", "description", "location_name", "latitude",
    "longitude", "severity", "status", "reporter", "region", "assigned_to",
    "created_at", "updated_at",
]
LOCATION_COLUMNS = [
    "id", "name", "state", "district", "latitude", "longitude", "elevation_m",
    "slope_deg", "land_cover", "category", "population", "risk_score",
    "risk_level", "rainfall_mm_1h", "rainfall_mm_6h", "rainfall_mm_24h",
    "soil_moisture", "temperature_c", "status", "assessed_at",
]
ALERT_COLUMNS = [
    "id", "location_id", "location_name", "risk_level", "risk_score", "trigger",
    "message", "status", "delivery_status", "simulation", "created_at", "updated_at",
]


def _parse_bound(value: str | None, end: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        parsed = parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid date '{value}'")
    if len(value) <= 10 and end:
        parsed = parsed + timedelta(days=1) - timedelta(seconds=1)
    return parsed


def _incident_query(db, date_from, date_to, region, severity, status, search):
    query = db.query(Incident)
    if date_from:
        query = query.filter(Incident.created_at >= date_from)
    if date_to:
        query = query.filter(Incident.created_at <= date_to)
    if region:
        query = query.filter(Incident.region.ilike(f"%{region}%"))
    if severity:
        query = query.filter(Incident.severity == severity.strip().upper())
    if status:
        query = query.filter(Incident.status == status.strip().upper())
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(Incident.description.ilike(pattern), Incident.location_name.ilike(pattern))
        )
    return query.order_by(Incident.created_at.desc())


def _csv_response(filename: str, header: list[str], rows: list[list]) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows(rows)
    content = buffer.getvalue().encode("utf-8")
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/incidents.csv")
def export_incidents_csv(
    dateFrom: str | None = Query(None),
    dateTo: str | None = Query(None),
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    region: str | None = Query(None),
    severity: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    db=Depends(get_db),
):
    query = _incident_query(
        db, _parse_bound(dateFrom or from_), _parse_bound(dateTo or to, end=True),
        region, severity, status, search,
    )
    rows = []
    for inc in query.all():
        rows.append(
            [
                inc.id, inc.public_id, inc.type, inc.description, inc.location_name,
                inc.latitude, inc.longitude, inc.severity, inc.status, inc.reporter,
                inc.region, inc.assigned_to or "", iso(inc.created_at), iso(inc.updated_at),
            ]
        )
    return _csv_response("incidents.csv", INCIDENT_COLUMNS, rows)


@router.get("/export")
def export_dataset(
    dataset: str = Query("incidents"),
    format: str = Query("csv"),
    dateFrom: str | None = Query(None, alias="from"),
    dateTo: str | None = Query(None, alias="to"),
    region: str | None = Query(None),
    severity: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    db=Depends(get_db),
):
    dataset = (dataset or "").strip().lower()
    fmt = (format or "csv").strip().lower()
    if dataset not in {"locations", "incidents", "alerts", "analytics"}:
        raise HTTPException(
            status_code=400,
            detail="dataset must be one of: locations, incidents, alerts, analytics",
        )
    if fmt not in {"csv", "json"}:
        raise HTTPException(status_code=400, detail="format must be csv or json")

    date_from = _parse_bound(dateFrom)
    date_to = _parse_bound(dateTo, end=True)

    header: list[str] = []
    rows: list[list] = []
    payload = None

    if dataset == "incidents":
        header = INCIDENT_COLUMNS
        for inc in _incident_query(db, date_from, date_to, region, severity, status, search).all():
            rows.append(
                [
                    inc.id, inc.public_id, inc.type, inc.description, inc.location_name,
                    inc.latitude, inc.longitude, inc.severity, inc.status, inc.reporter,
                    inc.region, inc.assigned_to or "", iso(inc.created_at), iso(inc.updated_at),
                ]
            )
        payload = [dict(zip(header, row)) for row in rows]

    elif dataset == "locations":
        query = db.query(Location)
        if region:
            query = query.filter(Location.state.ilike(f"%{region}%"))
        header = LOCATION_COLUMNS
        for loc in query.order_by(Location.id).all():
            rows.append(
                [
                    loc.id, loc.name, loc.state, loc.district, loc.latitude, loc.longitude,
                    loc.elevation, loc.slope, loc.land_cover, loc.category, loc.population,
                    round(float(loc.risk_score or 0), 1), loc.risk_level, loc.rainfall_mm_1h,
                    loc.rainfall_mm_6h, loc.rainfall_mm_24h, loc.soil_moisture,
                    loc.temperature_c, loc.status, iso(loc.assessed_at),
                ]
            )
        payload = [dict(zip(header, row)) for row in rows]

    elif dataset == "alerts":
        query = db.query(Alert, Location.name).join(
            Location, Alert.location_id == Location.id, isouter=True
        )
        if date_from:
            query = query.filter(Alert.created_at >= date_from)
        if date_to:
            query = query.filter(Alert.created_at <= date_to)
        if region:
            query = query.filter(Location.state.ilike(f"%{region}%"))
        if status:
            query = query.filter(Alert.status == alert_status_to_db(status))
        if severity:
            query = query.filter(Alert.risk_level == severity.strip().upper())
        header = ALERT_COLUMNS
        for alert, location_name in query.order_by(Alert.created_at.desc()).all():
            rows.append(
                [
                    alert.id, alert.location_id, location_name or "", alert.risk_level,
                    float(alert.risk_score or 0), alert.trigger, alert.message,
                    ALERT_STATUS_TO_API.get(alert.status or "active", alert.status),
                    alert.delivery_status, bool(alert.simulation), iso(alert.created_at),
                    iso(alert.updated_at),
                ]
            )
        payload = [dict(zip(header, row)) for row in rows]

    else:  # analytics
        header = ["metric", "value"]
        bands = get_bands(db)
        high_min = bands["high"]["min"]
        metrics = [
            ("monitored_locations", db.query(Location).count()),
            ("active_alerts", db.query(Alert).filter(Alert.status == "active").count()),
            ("total_alerts", db.query(Alert).count()),
            ("incidents_total", db.query(Incident).count()),
            (
                "incidents_open",
                db.query(Incident).filter(Incident.status.notin_(["RESOLVED", "CLOSED"])).count(),
            ),
            ("high_risk_locations", db.query(Location).filter(Location.risk_score >= high_min).count()),
            ("blocked_corridors", db.query(Corridor).filter(Corridor.status == "blocked").count()),
            ("assets_at_risk", db.query(Infrastructure).filter(Infrastructure.risk_score >= high_min).count()),
            (
                "avg_risk_score",
                round(float(db.query(func.avg(Location.risk_score)).scalar() or 0), 1),
            ),
        ]
        rows = [[name, value] for name, value in metrics]
        payload = {name: value for name, value in metrics}
        payload["generated_at"] = iso(utcnow())

    filename = f"terraguard_{dataset}.{fmt}"
    if fmt == "csv":
        return _csv_response(filename, header, rows)
    return Response(
        content=json.dumps(payload, indent=2, default=str).encode("utf-8"),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/summary")
def reports_summary(
    range: str | None = Query(None),
    db=Depends(get_db),
):
    now = utcnow()
    bands = get_bands(db)
    high_min = bands["high"]["min"]

    raw_range = (range or "7d").strip().lower()
    if raw_range.endswith("d") and raw_range[:-1].isdigit():
        since = now - timedelta(days=int(raw_range[:-1]))
    else:
        since = now - timedelta(days=7)

    incident_rows = db.query(Incident).filter(Incident.created_at >= since).all()
    by_status: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for inc in incident_rows:
        by_status[inc.status] = by_status.get(inc.status, 0) + 1
        by_severity[inc.severity] = by_severity.get(inc.severity, 0) + 1
        by_type[inc.type] = by_type.get(inc.type, 0) + 1

    top_risks = [
        {
            "id": loc.id,
            "location": loc.name,
            "region": loc.state,
            "risk_score": round(float(loc.risk_score or 0), 1),
            "risk_level": loc.risk_level,
            "population": loc.population or 0,
        }
        for loc in db.query(Location)
        .filter(Location.risk_score >= high_min)
        .order_by(Location.risk_score.desc())
        .limit(10)
        .all()
    ]

    return {
        "title": "TerraGuard AI - Operations Summary",
        "period": {"from": iso(since), "to": iso(now), "range": raw_range},
        "kpis": {
            "monitored_locations": db.query(Location).count(),
            "active_alerts": db.query(Alert).filter(Alert.status == "active").count(),
            "incidents_in_period": len(incident_rows),
            "critical_incidents": sum(
                1
                for inc in incident_rows
                if inc.severity == "CRITICAL" and inc.status not in ("RESOLVED", "CLOSED")
            ),
            "high_risk_locations": db.query(Location).filter(Location.risk_score >= high_min).count(),
            "blocked_corridors": db.query(Corridor).filter(Corridor.status == "blocked").count(),
            "avg_risk_score": round(
                float(db.query(func.avg(Location.risk_score)).scalar() or 0), 1
            ),
        },
        "incidents": {
            "by_status": by_status,
            "by_severity": by_severity,
            "by_type": by_type,
        },
        "top_risk_locations": top_risks,
        "corridors": {
            "open": db.query(Corridor).filter(Corridor.status == "open").count(),
            "restricted": db.query(Corridor).filter(Corridor.status == "restricted").count(),
            "blocked": db.query(Corridor).filter(Corridor.status == "blocked").count(),
            "demo_data": True,
        },
        "model": {
            "version": config.MODEL_VERSION,
            "model_status": config.MODEL_STATUS,
            "label": config.MODEL_LABEL,
            "metrics": None,
            "metrics_status": "not_available",
        },
        "generated_at": iso(now),
        "meta": weather_meta(),
    }
