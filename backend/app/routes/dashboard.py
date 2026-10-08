"""GET /api/dashboard - KPIs, timeline and priority queue.

Every KPI is computed from the database (seeded + live-updated), never
fabricated. `delta` is the change versus the previous hour when that can be
derived from stored history; otherwise it is `null`.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func

from app.database.db import get_db
from app.events import broker
from app.models.entities import (
    Alert,
    Corridor,
    Incident,
    Infrastructure,
    Location,
    Prediction,
    ScenarioEvent,
)
from app.prediction_engine import score_features
from app.services.common import (
    get_bands,
    incident_dict,
    iso,
    utcnow,
)
from app.services.scenario import STATE as SCENARIO_STATE
from app.services.weather import weather_meta

router = APIRouter(prefix="/api", tags=["Dashboard"])

RESOLVED_STATUSES = ("RESOLVED", "CLOSED")


def _kpi(value, updated_at, source, delta=None, status="OK"):
    if value is None:
        return {
            "value": None,
            "status": "DATA UNAVAILABLE",
            "updated_at": iso(updated_at),
            "source": source,
            "delta": None,
        }
    return {
        "value": value,
        "status": status,
        "updated_at": iso(updated_at),
        "source": source,
        "delta": delta,
    }


def _active_alerts(db, cutoff):
    return (
        db.query(Alert)
        .filter(Alert.status == "active", Alert.created_at < cutoff)
        .count()
    )


def _risk_counts_at(db, since, until, bands):
    """Locations whose most recent prediction in [since, until) crosses HIGH."""
    query = (
        db.query(Prediction.location_id, func.max(Prediction.created_at))
        .filter(Prediction.created_at >= since, Prediction.created_at < until)
        .group_by(Prediction.location_id)
        .all()
    )
    high_ids = []
    scores = []
    if not query:
        return None, None
    high_threshold = bands["high"]["min"]
    for location_id, _moment in query:
        row = (
            db.query(Prediction)
            .filter(Prediction.location_id == location_id, Prediction.created_at < until)
            .order_by(Prediction.created_at.desc())
            .first()
        )
        if row is None:
            continue
        scores.append(float(row.risk_score))
        if float(row.risk_score) >= high_threshold:
            high_ids.append(location_id)
    population = 0
    if high_ids:
        population = (
            db.query(func.coalesce(func.sum(Location.population), 0))
            .filter(Location.id.in_(high_ids))
            .scalar()
            or 0
        )
    avg_score = round(sum(scores) / len(scores), 1) if scores else None
    return len(high_ids), {"population": int(population), "avg": avg_score}


@router.get("/dashboard")
def dashboard(db=Depends(get_db)):
    now = utcnow()
    hour_ago = now - timedelta(hours=1)
    two_hours_ago = now - timedelta(hours=2)
    bands = get_bands(db)

    locations_total = db.query(Location).count()
    assessed_at = db.query(func.max(Location.assessed_at)).scalar()

    active_alerts_now = db.query(Alert).filter(Alert.status == "active").count()
    active_alerts_prev = _active_alerts(db, hour_ago)
    active_alerts_delta = active_alerts_now - active_alerts_prev

    high_min = bands["high"]["min"]
    high_now = db.query(Location).filter(Location.risk_score >= high_min).count()
    high_then, high_extra = _risk_counts_at(db, two_hours_ago, hour_ago, bands)
    high_delta = (high_now - high_then) if high_then is not None else None

    critical_min = bands["critical"]["min"]
    critical_now = (
        db.query(Incident)
        .filter(
            Incident.severity == "CRITICAL",
            Incident.status.notin_(list(RESOLVED_STATUSES)),
        )
        .count()
    )
    critical_prev = (
        db.query(Incident)
        .filter(
            Incident.severity == "CRITICAL",
            Incident.status.notin_(list(RESOLVED_STATUSES)),
            Incident.created_at < hour_ago,
        )
        .count()
    )
    critical_delta = critical_now - critical_prev

    people_now = (
        db.query(func.coalesce(func.sum(Location.population), 0))
        .filter(Location.risk_score >= high_min)
        .scalar()
        or 0
    )
    if high_then is not None and high_extra:
        people_delta = int(people_now) - int(high_extra.get("population") or 0)
    else:
        people_delta = None

    assets_now = db.query(Infrastructure).filter(Infrastructure.risk_score >= high_min).count()
    blocked_now = db.query(Corridor).filter(Corridor.status == "blocked").count()
    blocked_prev = (
        db.query(Corridor)
        .filter(Corridor.status == "blocked", Corridor.last_update < hour_ago)
        .count()
    )
    blocked_delta = blocked_now - blocked_prev

    avg_risk = db.query(func.avg(Location.risk_score)).scalar()
    avg_risk = round(float(avg_risk), 1) if avg_risk is not None else None
    _, avg_extra = _risk_counts_at(db, two_hours_ago, hour_ago, bands)
    avg_delta = None
    if avg_extra and avg_extra.get("avg") is not None and avg_risk is not None:
        avg_delta = round(avg_risk - avg_extra["avg"], 1)

    generated_at = now
    kpis = {
        "monitored_locations": _kpi(locations_total, generated_at, "locations table", delta=0),
        "active_alerts": _kpi(active_alerts_now, generated_at, "alerts table", delta=active_alerts_delta),
        "high_risk_locations": _kpi(high_now, generated_at, "locations table", delta=high_delta),
        "critical_incidents": _kpi(critical_now, generated_at, "incidents table", delta=critical_delta),
        "population_at_risk": _kpi(int(people_now), generated_at, "locations table", delta=people_delta),
        # alias kept for the dashboard wording used by the ops UI
        "people_at_risk": _kpi(int(people_now), generated_at, "locations table", delta=people_delta),
        "assets_at_risk": _kpi(assets_now, generated_at, "infrastructure table", delta=None),
        "blocked_corridors": _kpi(blocked_now, generated_at, "corridors table", delta=blocked_delta),
        "avg_risk_score": _kpi(avg_risk, generated_at, "risk engine (prototype)", delta=avg_delta),
    }

    # ---- timeline: alerts + incidents + scenario events -------------------
    timeline = []
    for alert in db.query(Alert).order_by(Alert.created_at.desc()).limit(8).all():
        location = db.get(Location, alert.location_id)
        timeline.append(
            {
                "id": f"alert-{alert.id}",
                "type": "alert",
                "message": alert.message,
                "location": location.name if location else "",
                "timestamp": iso(alert.created_at),
                "severity": alert.risk_level or alert.severity,
            }
        )
    for inc in db.query(Incident).order_by(Incident.created_at.desc()).limit(8).all():
        item = incident_dict(inc)
        timeline.append(
            {
                "id": f"incident-{inc.public_id}",
                "type": "incident",
                "message": f"{inc.type}: {inc.description}",
                "location": inc.location_name,
                "timestamp": item["created_at"],
                "severity": inc.severity,
            }
        )
    for ev in db.query(ScenarioEvent).order_by(ScenarioEvent.id.desc()).limit(8).all():
        timeline.append(
            {
                "id": f"scenario-{ev.id}",
                "type": "scenario",
                "message": ev.message,
                "location": ev.location,
                "timestamp": iso(ev.created_at),
                "severity": ev.severity,
            }
        )
    timeline.sort(key=lambda entry: entry["timestamp"] or "", reverse=True)
    timeline = timeline[:15]

    # ---- priority queue ---------------------------------------------------
    priority_queue = []
    candidates = (
        db.query(Location).filter(Location.risk_score >= high_min)
        .order_by(Location.risk_score.desc())
        .limit(8)
        .all()
    )
    for loc in candidates:
        score = float(loc.risk_score or 0)
        if score >= bands["critical"]["min"]:
            priority = "P1"
        elif score >= bands["very_high"]["min"]:
            priority = "P2"
        else:
            priority = "P3"
        result = score_features(
            rainfall=float(loc.rainfall_mm_24h or 0),
            soil_moisture=float(loc.soil_moisture or 0),
            slope=float(loc.slope or 0),
            elevation=float(loc.elevation or 0),
            land_cover=loc.land_cover or "mixed",
            temperature=float(loc.temperature_c or 25),
            bands=bands,
        )
        top = max(result["contributions"], key=lambda entry: entry["contribution"])
        priority_queue.append(
            {
                "id": loc.id,
                "location": loc.name,
                "risk_score": round(score, 1),
                "population": loc.population or 0,
                "priority": priority,
                "reason": (
                    f"Top driver: {top['feature']} (+{top['contribution']} pts); "
                    f"rainfall {float(loc.rainfall_mm_24h or 0):.0f}mm/24h, "
                    f"soil {float(loc.soil_moisture or 0):.0f}%"
                ),
            }
        )

    meta = weather_meta()
    return {
        "kpis": kpis,
        "timeline": timeline,
        "priority_queue": priority_queue,
        "generated_at": iso(generated_at),
        "data_status": meta,
        "risk_bands": bands,
        "scenario_active": SCENARIO_STATE["state"] != "IDLE",
    }
