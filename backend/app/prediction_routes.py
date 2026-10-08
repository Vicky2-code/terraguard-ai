from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.prediction_engine import generate_prediction


router = APIRouter(
    prefix="/prediction",
    tags=["Prediction"],
)


class PredictionRequest(BaseModel):

    rainfall: float = Field(
        ...,
        ge=0,
        le=200,
        description="Rainfall in millimetres",
    )

    soil_moisture: float = Field(
        ...,
        ge=0,
        le=100,
        description="Soil moisture percentage",
    )

    slope: float = Field(
        ...,
        ge=0,
        le=90,
        description="Slope angle in degrees",
    )

    temperature: float = Field(
        ...,
        ge=-50,
        le=60,
        description="Temperature in Celsius",
    )


@router.post("")
def predict_risk(data: PredictionRequest):

    result = generate_prediction(
        rainfall=data.rainfall,
        soil_moisture=data.soil_moisture,
        slope=data.slope,
        temperature=data.temperature,
    )

    return {
        "input": {
            "rainfall": data.rainfall,
            "soil_moisture": data.soil_moisture,
            "slope": data.slope,
            "temperature": data.temperature,
        },
        "prediction": result,
    }