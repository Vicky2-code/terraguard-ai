from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.main import get_db
from app.api.auth import get_current_user
from app.models.models import FieldReport
from pydantic import BaseModel

router = APIRouter(prefix="/field-reports", tags=["Field Reports"])

class ReportCreate(BaseModel):
    location_id: int
    observation: str
    severity: str
    description: str

@router.post("/")
def create_report(report_in: ReportCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    new_report = FieldReport(
        location_id=report_in.location_id,
        observation=report_in.observation,
        severity=report_in.severity,
        description=report_in.description,
        submitted_by=current_user.id
    )
    db.add(new_report)
    db.commit()
    return {"status": "Report submitted successfully"}

@router.get("/")
def list_reports(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(FieldReport).all()
