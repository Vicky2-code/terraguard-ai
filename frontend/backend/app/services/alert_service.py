import asyncio
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.main import SessionLocal
from app.models.models import Alert, RiskLevel, Prediction

logger = logging.getLogger("AlertService")

class AlertService:
    def __init__(self):
        self.thresholds = {
            "CRITICAL": 75,
            "HIGH": 50,
            "MODERATE": 25
        }

    async def process_prediction(self, prediction_id: int, location_id: int, risk_score: int, risk_level: str):
        db = SessionLocal()
        try:
            # Only trigger alerts for HIGH and CRITICAL
            if risk_score < self.thresholds["MODERATE"]:
                return None

            # Check if an active alert of this level already exists to avoid spam
            existing_alert = db.query(Alert).filter(
                Alert.location_id == location_id,
                Alert.status != "RESOLVED",
                Alert.risk_level == risk_level
            ).first()

            if existing_alert:
                return None

            # Create new alert
            new_alert = Alert(
                location_id=location_id,
                prediction_id=prediction_id,
                risk_level=risk_level,
                trigger_reason=f"Risk level escalated to {risk_level} with score {risk_score}",
                timestamp=datetime.utcnow(),
                status="NEW"
            )
            db.add(new_alert)
            db.commit()
            db.refresh(new_alert)

            logger.info(f"ALERT TRIGGERED: Location {location_id} is now {risk_level}")
            return new_alert
        finally:
            db.close()

alert_service = AlertService()
