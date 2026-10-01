from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.main import get_db
from app.api.auth import get_current_user
from app.models.models import Location, Prediction, Alert, UserRole, User

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/summary")
def get_summary(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    total_locations = db.query(Location).count()
    # We define high risk as score > 50, critical as score > 75
    high_risk_zones = db.query(Prediction).filter(Prediction.risk_score >= 50).count()
    critical_zones = db.query(Prediction).filter(Prediction.risk_score >= 75).count()
    active_alerts = db.query(Alert).filter(Alert.status != "RESOLVED").count()

    return {
        "total_monitored_locations": total_locations,
        "high_risk_zones": high_risk_zones,
        "critical_zones": critical_zones,
        "active_alerts": active_alerts,
        "system_status": "Operational"
    }

@router.get("/locations")
def list_locations(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(Location).all()
