"""PROTOTYPE risk scoring engine.

Two layers live here:

1. The original prototype scorer (`calculate_risk_score` / `classify_risk` /
   `generate_prediction`) kept untouched for the legacy `/prediction` route.
2. The explainable, threshold-aware scorer used by `POST /api/predict` and the
   location risk pipeline (`score_features` / `predict_response`).

IMPORTANT: this is a deterministic weighted heuristic (a PROTOTYPE MODEL).
It has NOT been trained or validated against observed landslide data, therefore
no accuracy/precision/recall metrics are ever reported for it - model metrics
are exposed as `null` with status `not_available`.
"""

import time
from typing import Literal, Optional

from app import config

RiskLevel = Literal["LOW", "MODERATE", "HIGH", "VERY_HIGH", "CRITICAL"]

# Land-cover contribution points (max 10) - built-up and bare surfaces runoff
# faster and are cut more often, so they score higher.
LAND_COVER_POINTS = {
    "bare": 10,
    "urban": 9,
    "built_up": 9,
    "agriculture": 7,
    "wetland": 6,
    "water": 5,
    "grassland": 5,
    "shrub": 5,
    "mixed": 5,
    "forest": 3,
    "unknown": 5,
}


def calculate_risk_score(
    rainfall: float,
    soil_moisture: float,
    slope: float,
    temperature: float,
) -> int:
    """
    Prototype landslide risk scoring engine.

    Inputs:
        rainfall       : mm
        soil_moisture  : percentage
        slope          : degrees
        temperature    : Celsius

    Returns:
        Risk score from 0 to 100.
    """

    rainfall = max(0.0, min(rainfall, 200.0))
    soil_moisture = max(0.0, min(soil_moisture, 100.0))
    slope = max(0.0, min(slope, 90.0))

    rainfall_score = min((rainfall / 100.0) * 40.0, 40.0)

    moisture_score = (soil_moisture / 100.0) * 25.0

    slope_score = (slope / 45.0) * 25.0
    slope_score = min(slope_score, 25.0)

    temperature_factor = 0.0

    if temperature < 10:
        temperature_factor = 2.0
    elif temperature > 35:
        temperature_factor = 3.0

    score = (
        rainfall_score
        + moisture_score
        + slope_score
        + temperature_factor
    )

    return int(round(min(score, 100.0)))


def classify_risk(score: int) -> RiskLevel:

    if score >= 80:
        return "CRITICAL"

    if score >= 60:
        return "HIGH"

    if score >= 35:
        return "MODERATE"

    return "LOW"


def generate_prediction(
    rainfall: float,
    soil_moisture: float,
    slope: float,
    temperature: float,
):
    score = calculate_risk_score(
        rainfall=rainfall,
        soil_moisture=soil_moisture,
        slope=slope,
        temperature=temperature,
    )

    risk_level = classify_risk(score)

    if risk_level == "CRITICAL":
        recommendation = (
            "Immediate attention required. "
            "Review vulnerable slopes and initiate warning procedures."
        )

    elif risk_level == "HIGH":
        recommendation = (
            "High risk conditions detected. "
            "Increase monitoring and inspect vulnerable areas."
        )

    elif risk_level == "MODERATE":
        recommendation = (
            "Moderate risk conditions. "
            "Continue monitoring environmental conditions."
        )

    else:
        recommendation = (
            "Current conditions indicate relatively low "
            "landslide risk."
        )

    return {
        "risk_score": score,
        "risk_level": risk_level,
        "recommendation": recommendation,
        "model": "Prototype Risk Scoring Engine",
        "prototype": True,
    }


# ---------------------------------------------------------------------------
# Explainable, threshold-aware scorer used by POST /api/predict and the
# location risk pipeline.
# ---------------------------------------------------------------------------


def classify_score(score: float, bands: Optional[dict] = None) -> str:
    """Map a 0-100 score onto LOW | MODERATE | HIGH | VERY_HIGH | CRITICAL.

    `bands` uses the configurable shape
    {"low": {"min": 0, "max": 24}, ..., "critical": {"min": 85, "max": 100}}.
    """
    bands = bands or config.DEFAULT_BANDS
    try:
        score = float(score)
    except (TypeError, ValueError):
        return "LOW"
    for name in config.BAND_ORDER:
        entry = bands[name]
        if entry["min"] <= score <= entry["max"]:
            return config.LEVEL_FOR_BAND[name]
    return "CRITICAL" if score > 100 else "LOW"


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(value, high))


def score_features(
    rainfall: float,
    soil_moisture: float,
    slope: float,
    elevation: float = 0.0,
    land_cover: str = "mixed",
    recent_rainfall: Optional[float] = None,
    temperature: float = 25.0,
    boost: float = 0.0,
    bands: Optional[dict] = None,
) -> dict:
    """Deterministic weighted risk score with per-feature contributions.

    PROTOTYPE heuristic - weights extend the original prototype engine
    (rainfall 40 / moisture 25 / slope 25 style weighting) but are re-balanced
    so every component fits inside a 0-100 score:

        rainfall_24h     up to 30 pts   storm intensity in the last 24h
        recent_rainfall  up to 15 pts   antecedent 72h rainfall (soil pre-wetting)
        soil_moisture    up to 20 pts   saturation of the slope material
        slope            up to 15 pts   steeper slopes fail at lower thresholds
        elevation        up to  8 pts   high Himalayan slopes are more exposed
        land_cover       up to 10 pts   bare/built-up surfaces score higher
        temperature      up to  3 pts   extreme heat / cold weathering
        scenario_boost     0-10 pts     simulation only (clearly labelled)

    Contributions are integers that sum exactly to `risk_score`, so every
    prediction is explainable. No ML inference is involved and no accuracy
    metrics are claimed.
    """
    rainfall = _clamp(float(rainfall or 0), 0, 1000)
    soil_moisture = _clamp(float(soil_moisture or 0), 0, 100)
    slope = _clamp(float(slope or 0), 0, 90)
    elevation = _clamp(float(elevation or 0), -500, 9000)
    temperature = _clamp(float(temperature or 0), -50, 60)
    if recent_rainfall is None:
        recent_rainfall = rainfall * 2.0
    recent_rainfall = _clamp(float(recent_rainfall or 0), 0, 2000)
    boost = _clamp(float(boost or 0), 0, 10)

    cover_key = (land_cover or "mixed").strip().lower()
    cover_points = float(LAND_COVER_POINTS.get(cover_key, LAND_COVER_POINTS["unknown"]))

    components = [
        ("rainfall_24h", rainfall, round(min(rainfall / 100.0, 1.0) * 30.0, 2)),
        ("recent_rainfall_72h", recent_rainfall, round(min(recent_rainfall / 250.0, 1.0) * 15.0, 2)),
        ("soil_moisture", soil_moisture, round(_clamp(soil_moisture / 100.0, 0, 1) * 20.0, 2)),
        ("slope", slope, round(min(slope / 45.0, 1.0) * 15.0, 2)),
        ("elevation", elevation, round(_clamp((elevation - 500.0) / 2000.0, 0, 1) * 8.0, 2)),
        ("land_cover", cover_key, cover_points),
        ("temperature", temperature, 2.0 if temperature < 10 else (3.0 if temperature > 35 else 0.0)),
    ]
    if boost:
        components.append(("scenario_simulation", boost, round(boost, 2)))

    raw_score = sum(entry[2] for entry in components)
    score = int(round(_clamp(raw_score, 0, 100)))

    # Round each contribution, then push the rounding residual onto the
    # largest component so contributions sum exactly to the score.
    contributions = [
        {"feature": name, "value": value, "contribution": int(round(points))}
        for name, value, points in components
    ]
    residual = score - sum(entry["contribution"] for entry in contributions)
    if residual and contributions:
        biggest = max(contributions, key=lambda entry: entry["contribution"])
        biggest["contribution"] += residual

    return {
        "risk_score": score,
        "risk_level": classify_score(score, bands),
        "contributions": contributions,
        "inputs": {
            "rainfall": rainfall,
            "recent_rainfall": recent_rainfall,
            "soil_moisture": soil_moisture,
            "slope": slope,
            "elevation": elevation,
            "land_cover": cover_key,
            "temperature": temperature,
        },
    }


def heuristic_confidence(provided: dict) -> float:
    """Input-completeness confidence (0.60-0.85).

    This is a deterministic coverage heuristic - it is NOT a measured model
    accuracy, which remains `not_available` for the prototype engine.
    """
    optional_fields = ("recent_rainfall", "land_cover", "elevation", "temperature")
    present = sum(1 for field in optional_fields if provided.get(field) is not None)
    return round(0.6 + 0.05 * present, 2)


def predict_response(payload: dict, bands: Optional[dict] = None) -> dict:
    """Build the POST /api/predict response (contract shape + prototype extras)."""
    from app.services.common import iso, utcnow

    started = time.perf_counter()

    land_cover = payload.get("land_cover")
    provided = {
        "recent_rainfall": payload.get("recent_rainfall"),
        "land_cover": land_cover,
        "elevation": payload.get("elevation"),
        "temperature": payload.get("temperature"),
    }
    result = score_features(
        rainfall=payload.get("rainfall", 0),
        soil_moisture=payload.get("soil_moisture", 0),
        slope=payload.get("slope", 0),
        elevation=payload.get("elevation") or 0,
        land_cover=land_cover or "mixed",
        recent_rainfall=payload.get("recent_rainfall"),
        temperature=payload.get("temperature") if payload.get("temperature") is not None else 25.0,
        bands=bands,
    )

    data_sources = ["user_input"]
    if land_cover in (None, ""):
        data_sources.append("default:land_cover=mixed")
    if payload.get("temperature") is None:
        data_sources.append("default:temperature=25C")
    if payload.get("recent_rainfall") is None:
        data_sources.append("derived:recent_rainfall=2x rainfall")

    latency_ms = round((time.perf_counter() - started) * 1000, 2)

    return {
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "model_version": config.MODEL_VERSION,
        "timestamp": iso(utcnow()),
        "confidence": heuristic_confidence(provided),
        "feature_contributions": [
            {"feature": entry["feature"], "value": entry["value"], "contribution": entry["contribution"]}
            for entry in result["contributions"]
        ],
        "model_status": config.MODEL_STATUS,   # "PROTOTYPE"
        "label": config.MODEL_LABEL,           # "PROTOTYPE MODEL"
        "latency_ms": latency_ms,
        "data_sources": data_sources,
        # Honest reporting: unmeasured metrics stay null.
        "model_metrics": None,
        "model_metrics_status": "not_available",
        "metrics": None,
        "disclaimer": (
            "Deterministic weighted heuristic - PROTOTYPE MODEL. "
            "No trained/validated ML model; accuracy metrics not available."
        ),
    }