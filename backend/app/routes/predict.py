"""POST /api/predict - explainable prototype risk scoring.

The engine is a deterministic weighted heuristic (PROTOTYPE MODEL). It is not
a trained ML model, so accuracy/precision/etc. are reported as `null` with
`model_metrics_status: "not_available"` - we never claim metrics we do not have.
"""

import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import config
from app.database.db import get_db
from app.prediction_engine import predict_response
from app.services.common import get_bands, get_setting

router = APIRouter(prefix="/api", tags=["Prediction"])


class PredictRequest(BaseModel):
    rainfall: float = Field(..., ge=0, le=1000, description="Rainfall in mm (last 24h)")
    soil_moisture: float = Field(..., ge=0, le=100, description="Soil moisture %")
    slope: float = Field(..., ge=0, le=90, description="Slope angle in degrees")
    elevation: float = Field(0, ge=-500, le=9000, description="Elevation in metres")
    land_cover: str | None = Field(None, max_length=40)
    recent_rainfall: float | None = Field(None, ge=0, le=2000, description="Antecedent 72h rainfall mm")
    temperature: float | None = Field(None, ge=-50, le=60, description="Temperature Celsius")
    location_id: int | None = Field(None, description="Optional: seed inputs from a monitored location")


@router.post("/predict")
def predict(payload: PredictRequest, db=Depends(get_db)):
    started = time.perf_counter()
    bands = get_bands(db)

    body = payload.model_dump()
    if payload.location_id is not None:
        from app.models.entities import Location

        loc = db.get(Location, payload.location_id)
        if loc is None:
            raise HTTPException(status_code=404, detail=f"Location {payload.location_id} not found")
        # optional inputs default to the stored location's current conditions
        if body.get("land_cover") is None:
            body["land_cover"] = loc.land_cover
        if body.get("temperature") is None:
            body["temperature"] = loc.temperature_c
        if body.get("recent_rainfall") is None:
            body["recent_rainfall"] = float(loc.rainfall_mm_24h or 0) + 2 * float(loc.rainfall_mm_6h or 0)
        if not body.get("elevation"):
            body["elevation"] = float(loc.elevation or 0)

    response = predict_response(body, bands=bands)

    # persist the call for the audit trail / trend analysis
    try:
        from app.models.entities import Prediction
        from app.services.common import utcnow

        if payload.location_id is not None:
            db.add(
                Prediction(
                    location_id=payload.location_id,
                    probability=round(response["risk_score"] / 100.0, 3),
                    risk_score=response["risk_score"],
                    risk_level=response["risk_level"],
                    model_version=response["model_version"],
                    created_at=utcnow(),
                )
            )
            db.commit()
    except Exception:  # pragma: no cover - audit write must not fail the API
        db.rollback()

    response["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
    response["model_status"] = config.MODEL_STATUS
    response["label"] = config.MODEL_LABEL
    return response
