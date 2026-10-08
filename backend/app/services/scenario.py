"""Emergency scenario simulator (SIMULATION MODE).

State machine: IDLE -> RUNNING <-> PAUSED, reset always returns to IDLE.

While RUNNING a background tick (every `JOB_INTERVALS["scenario_tick"]`
seconds) :
- advances `step`,
- applies a bounded risk boost to the target locations (clearly flagged in
  the API payload as `simulation: true`),
- writes timeline events,
- creates/updates test alerts - always with `delivery_status:
  "SIMULATED_LOCAL"` (no SMS/email is ever sent by this app).

`active` tells the frontend whether the SIMULATION ACTIVE banner should be
shown (any state other than IDLE).
"""

import threading
from datetime import timedelta

from app import config
from app.events import broker
from app.models.entities import Alert, Location, ScenarioEvent
from app.services.common import (
    alert_dict,
    get_bands,
    level_for_score,
    recompute_location_risk,
    utcnow,
)

MAX_BOOST = 10.0
MAX_STEPS_RECORDED = 200

_STATE_LOCK = threading.Lock()

STATE = {
    "state": "IDLE",       # IDLE | RUNNING | PAUSED
    "started_at": None,    # datetime
    "step": 0,
    "target_ids": [],
}

TEMPLATES = [
    ("SIMULATION: monsoon cell intensifying over {name} - rainfall +{amount}mm in 6h", "INFO"),
    ("SIMULATION: soil saturation rising near {name}; slope stability advisory issued", "WARNING"),
    ("SIMULATION: risk level at {name} escalated to {level} (simulated)", "HIGH"),
    ("SIMULATION: evacuation route review requested for {name} ({population} people)", "WARNING"),
    ("SIMULATION: field team {team} dispatched to {name} - simulated SMS only", "INFO"),
    ("SIMULATION: debris flow probability increasing on slopes above {name}", "HIGH"),
]


def scenario_dict(db) -> dict:
    events = (
        db.query(ScenarioEvent)
        .order_by(ScenarioEvent.id.desc())
        .limit(MAX_STEPS_RECORDED)
        .all()
    )
    events = list(reversed(events))
    targets = []
    for loc_id in STATE["target_ids"]:
        loc = db.get(Location, loc_id)
        if loc is not None:
            targets.append(
                {
                    "id": loc.id,
                    "name": loc.name,
                    "risk_score": round(float(loc.risk_score or 0), 1),
                    "risk_level": loc.risk_level,
                    "boost": round(float(loc.scenario_boost or 0), 1),
                }
            )
    return {
        "state": STATE["state"],
        "started_at": _iso(STATE["started_at"]),
        "step": STATE["step"],
        "events": [
            {
                "id": ev.id,
                "step": ev.step,
                "type": ev.type,
                "message": ev.message,
                "location": ev.location,
                "severity": ev.severity,
                "simulation": bool(ev.simulation),
                "timestamp": _iso(ev.created_at),
            }
            for ev in events
        ],
        "simulation": True,
        "active": STATE["state"] != "IDLE",
        "running": STATE["state"] == "RUNNING",
        "targets": targets,
        "delivery_status": "SIMULATED_LOCAL",
        "notifications": "SIMULATED_ONLY",
        "max_boost": MAX_BOOST,
        "updated_at": _iso(utcnow()),
    }


def _iso(dt):
    from app.services.common import iso

    return iso(dt)


def _add_event(db, step, message, location="", severity="INFO", event_type="scenario"):
    db.add(
        ScenarioEvent(
            step=step,
            type=event_type,
            message=message,
            location=location,
            severity=severity,
            simulation=True,
            created_at=utcnow(),
        )
    )


def start(db) -> dict:
    with _STATE_LOCK:
        if STATE["state"] == "RUNNING":
            return scenario_dict(db)
        if STATE["state"] == "PAUSED":
            STATE["state"] = "RUNNING"
            _add_event(db, STATE["step"], "SIMULATION: scenario resumed", severity="INFO")
            db.commit()
            broker.publish("scenario_step", {"action": "resume", "state": "RUNNING", "step": STATE["step"]})
            return scenario_dict(db)

        # fresh start
        bands = get_bands(db)
        targets = (
            db.query(Location)
            .order_by(Location.risk_score.desc(), Location.id.asc())
            .limit(3)
            .all()
        )
        STATE["state"] = "RUNNING"
        STATE["started_at"] = utcnow()
        STATE["step"] = 0
        STATE["target_ids"] = [loc.id for loc in targets]

        for loc in targets:
            loc.scenario_boost = 2.0
            recompute_location_risk(db, loc, bands=bands)
            _add_event(
                db,
                0,
                f"SIMULATION: emergency scenario activated for {loc.name} "
                f"({loc.population} people, category {loc.category})",
                location=loc.name,
                severity="WARNING",
            )
            _upsert_scenario_alert(db, loc, trigger_note="scenario start")
        _add_event(
            db,
            0,
            "SIMULATION: scenario STARTED - simulated alerts only, "
            "no real SMS/email will be sent",
            severity="HIGH",
        )
        db.commit()

    _publish_alerts(db, STATE["target_ids"])
    broker.publish(
        "scenario_step",
        {"action": "start", "state": "RUNNING", "step": 0, "targets": scenario_dict(db)["targets"]},
    )
    _publish_risk(db)
    return scenario_dict(db)


def pause(db) -> dict:
    with _STATE_LOCK:
        if STATE["state"] != "RUNNING":
            raise ScenarioError("Scenario is not running")
        STATE["state"] = "PAUSED"
        _add_event(db, STATE["step"], f"SIMULATION: scenario paused at step {STATE['step']}", severity="INFO")
        db.commit()
    broker.publish("scenario_step", {"action": "pause", "state": "PAUSED", "step": STATE["step"]})
    return scenario_dict(db)


def reset(db) -> dict:
    with _STATE_LOCK:
        STATE["state"] = "IDLE"
        STATE["started_at"] = None
        STATE["step"] = 0
        target_ids = list(STATE["target_ids"])
        STATE["target_ids"] = []

        bands = get_bands(db)
        # remove simulation boosts and re-score honestly
        boosted = db.query(Location).filter(Location.scenario_boost > 0).all()
        for loc in boosted:
            loc.scenario_boost = 0.0
            recompute_location_risk(db, loc, bands=bands)
        # close simulated alerts (dedup rule: fresh evaluation may reopen real ones)
        for alert in db.query(Alert).filter(Alert.simulation.is_(True), Alert.status == "active").all():
            alert.status = "resolved"
            alert.updated_at = utcnow()
        db.query(ScenarioEvent).delete()
        db.commit()

    broker.publish(
        "scenario_step",
        {"action": "reset", "state": "IDLE", "step": 0, "targets": [], "resolved_simulation_alerts": True},
    )
    _publish_risk(db, only_ids=target_ids)
    return scenario_dict(db)


def manual_step(db) -> dict:
    with _STATE_LOCK:
        if STATE["state"] == "IDLE":
            raise ScenarioError("Scenario is not started")
    tick(db)
    return scenario_dict(db)


def tick(db) -> None:
    """Advance the simulation by one step (background scheduler)."""
    with _STATE_LOCK:
        if STATE["state"] != "RUNNING":
            return
        STATE["step"] += 1
        step = STATE["step"]
        bands = get_bands(db)
        targets = [db.get(Location, loc_id) for loc_id in STATE["target_ids"]]
        targets = [loc for loc in targets if loc is not None]
        if not targets:
            STATE["state"] = "IDLE"
            STATE["started_at"] = None
            db.commit()
            return

        for loc in targets:
            # bounded growth: saturates at MAX_BOOST
            loc.scenario_boost = min(MAX_BOOST, float(loc.scenario_boost or 0) + 1.5)
            recompute_location_risk(db, loc, bands=bands)

        template, severity = TEMPLATES[(step - 1) % len(TEMPLATES)]
        focus = targets[(step - 1) % len(targets)]
        message = template.format(
            name=focus.name,
            amount=6 + (step * 3) % 24,
            level=focus.risk_level,
            population=focus.population,
            team=f"T{step:02d}",
        )
        _add_event(db, step, message, location=focus.name, severity=severity, event_type="scenario")
        # alert evaluation for the boosted targets (dedup applies)
        _upsert_scenario_alert(db, focus, trigger_note=f"scenario step {step}")
        db.commit()

    broker.publish(
        "scenario_step",
        {"step": step, "state": "RUNNING", "message": message, "location": focus.name, "severity": severity},
    )
    _publish_alerts(db, [focus.id])
    _publish_risk(db, only_ids=[loc.id for loc in targets])


class ScenarioError(Exception):
    """Raised for invalid state-machine transitions (mapped to HTTP 400)."""


def _upsert_scenario_alert(db, loc: Location, trigger_note: str) -> None:
    """Create/refresh the simulated alert for (location, risk_level).

    Dedup rule stays intact: there is at most one OPEN alert per
    (location_id, risk_level).
    """
    level = loc.risk_level or level_for_score(loc.risk_score)
    existing = (
        db.query(Alert)
        .filter(
            Alert.location_id == loc.id,
            Alert.risk_level == level,
            Alert.status == "active",
        )
        .first()
    )
    message = (
        f"[SIMULATION] {level} risk at {loc.name}: score {float(loc.risk_score or 0):.0f} "
        f"({trigger_note}). Simulated advisory only - no real SMS/email sent."
    )
    if existing is not None:
        existing.simulation = True
        existing.trigger = "scenario_simulation"
        existing.message = message
        existing.risk_score = float(loc.risk_score or 0)
        existing.delivery_status = "SIMULATED_LOCAL"
        existing.updated_at = utcnow()
        return
    alert = Alert(
        location_id=loc.id,
        risk_score=float(loc.risk_score or 0),
        severity=level,
        risk_level=level,
        message=message,
        status="active",
        trigger="scenario_simulation",
        delivery_status="SIMULATED_LOCAL",
        simulation=True,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(alert)


def _publish_alerts(db, loc_ids) -> None:
    alerts = (
        db.query(Alert)
        .filter(Alert.location_id.in_(loc_ids), Alert.status == "active", Alert.simulation.is_(True))
        .all()
    )
    names = {loc.id: loc.name for loc in db.query(Location).filter(Location.id.in_(loc_ids)).all()}
    for alert in alerts:
        broker.publish("alert_created", alert_dict(alert, names.get(alert.location_id, "")))


def _publish_risk(db, only_ids=None) -> None:
    query = db.query(Location)
    if only_ids:
        query = query.filter(Location.id.in_(only_ids))
    locations = query.all()
    if not locations:
        return
    avg = round(sum(float(loc.risk_score or 0) for loc in locations) / len(locations), 1)
    broker.publish(
        "risk_update",
        {
            "locations": [
                {
                    "id": loc.id,
                    "name": loc.name,
                    "risk_score": round(float(loc.risk_score or 0), 1),
                    "risk_level": loc.risk_level,
                    "simulation": bool(loc.scenario_boost),
                }
                for loc in locations
            ],
            "avg_risk_score": avg,
        },
    )
