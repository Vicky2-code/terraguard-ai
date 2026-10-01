from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.main import get_db
from app.api.auth import get_current_user
from app.models.models import SimulationSession

router = APIRouter(prefix="/simulation", tags=["Simulation"])

# Global simulation state (in-memory for prototype)
SIMULATION_STATE = {
    "is_running": False,
    "current_scenario": "NORMAL",
    "last_updated": None
}

@router.post("/start")
def start_simulation(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can control simulation")

    SIMULATION_STATE["is_running"] = True
    session = SimulationSession(scenario_name=SIMULATION_STATE["current_scenario"], status="ACTIVE")
    db.add(session)
    db.commit()
    return {"status": "Simulation started", "state": SIMULATION_STATE}

@router.post("/stop")
def stop_simulation(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can control simulation")

    SIMULATION_STATE["is_running"] = False
    return {"status": "Simulation stopped", "state": SIMULATION_STATE}

@router.post("/scenario/{scenario_name}")
def set_scenario(scenario_name: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can control simulation")

    valid_scenarios = ["NORMAL", "HEAVY_RAINFALL", "SOIL_SATURATION", "CRITICAL"]
    if scenario_name not in valid_scenarios:
        raise HTTPException(status_code=400, detail=f"Invalid scenario. Choose from {valid_scenarios}")

    SIMULATION_STATE["current_scenario"] = scenario_name
    return {"status": f"Scenario set to {scenario_name}", "state": SIMULATION_STATE}
