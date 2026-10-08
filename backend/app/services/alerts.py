"""Server-side alert evaluation with deduplication.

Dedup rule (contract): at most ONE open alert per (location_id, risk_level)
until it resolves. Delivery status is reported honestly:
`SIMULATED_LOCAL` because no SMS/email provider is configured.
"""

from app.events import broker
from app.models.entities import Alert, Location
from app.services.common import alert_dict, get_bands, utcnow

LEVEL_RANK = {"LOW": 0, "MODERATE": 1, "HIGH": 2, "VERY_HIGH": 3, "CRITICAL": 4}
ALERT_MIN_LEVEL = "HIGH"  # alerts fire from the HIGH band upwards


def evaluate_alerts(db, publish: bool = True) -> dict:
    bands = get_bands(db)
    created, resolved = [], []
    now = utcnow()

    for loc in db.query(Location).order_by(Location.id).all():
        level = loc.risk_level or "LOW"
        score = float(loc.risk_score or 0)
        rank = LEVEL_RANK.get(level, 0)

        # 1) resolve open alerts that no longer apply
        open_alerts = (
            db.query(Alert)
            .filter(Alert.location_id == loc.id, Alert.status == "active")
            .all()
        )
        for alert in open_alerts:
            alert_rank = LEVEL_RANK.get(alert.risk_level or alert.severity or "LOW", 0)
            if rank < alert_rank:
                alert.status = "resolved"
                alert.updated_at = now
                resolved.append(alert)

        # 2) create an alert when risk reaches the alert threshold
        if rank >= LEVEL_RANK[ALERT_MIN_LEVEL]:
            already_open = (
                db.query(Alert)
                .filter(
                    Alert.location_id == loc.id,
                    Alert.risk_level == level,
                    Alert.status == "active",
                )
                .first()
            )
            if already_open is None:
                alert = Alert(
                    location_id=loc.id,
                    risk_score=score,
                    severity=level,
                    risk_level=level,
                    status="active",
                    trigger="risk_threshold_exceeded",
                    delivery_status="SIMULATED_LOCAL",
                    simulation=bool(loc.scenario_boost or 0),
                    message=(
                        f"{level} risk at {loc.name} ({loc.state}): risk score {score:.0f} - "
                        f"rainfall {float(loc.rainfall_mm_24h or 0):.0f}mm/24h, "
                        f"soil moisture {float(loc.soil_moisture or 0):.0f}%. "
                        f"Prototype threshold alert (SIMULATED_LOCAL delivery)."
                    ),
                    created_at=now,
                    updated_at=now,
                )
                db.add(alert)
                db.flush()
                created.append(alert)

    db.commit()

    if publish:
        names = {loc.id: loc.name for loc in db.query(Location).all()}
        for alert in created:
            broker.publish("alert_created", alert_dict(alert, names.get(alert.location_id, "")))

    return {"created": len(created), "resolved": len(resolved)}
