"""Scenario endpoints (SIMULATION MODE).

- GET  /api/scenario        -> {state, started_at, step, events, simulation, active, ...}
- POST /api/scenario        body {action: start|pause|reset|step} (contract)
- POST /api/scenario/{action}   convenience aliases: /start /pause /reset /step
- GET  /api/scenario/status -> alias of GET /api/scenario
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database.db import get_db
from app.services.scenario import ScenarioError, manual_step, pause, reset, start

router = APIRouter(prefix="/api/scenario", tags=["Scenario"])


class ScenarioAction(BaseModel):
    action: Literal["start", "pause", "reset", "step"]


def _dispatch(action: str, db) -> dict:
    try:
        if action == "start":
            return start(db)
        if action == "pause":
            return pause(db)
        if action == "reset":
            return reset(db)
        if action == "step":
            return manual_step(db)
    except ScenarioError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    raise HTTPException(status_code=404, detail=f"Unknown scenario action '{action}'")


@router.get("")
def scenario_status(db=Depends(get_db)):
    from app.services.scenario import scenario_dict

    return scenario_dict(db)


@router.get("/status")
def scenario_status_alias(db=Depends(get_db)):
    from app.services.scenario import scenario_dict

    return scenario_dict(db)


@router.post("")
def scenario_action(payload: ScenarioAction, db=Depends(get_db)):
    return _dispatch(payload.action, db)


@router.post("/{action}")
def scenario_action_alias(action: str, db=Depends(get_db)):
    if action not in {"start", "pause", "reset", "step"}:
        raise HTTPException(status_code=404, detail=f"Unknown scenario action '{action}'")
    return _dispatch(action, db)
