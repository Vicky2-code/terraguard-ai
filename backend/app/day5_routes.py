from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
from datetime import datetime

router = APIRouter()


# --------------------------------------------------
# DEMO LOCATION DATA
# --------------------------------------------------

LOCATIONS = [
    {
        "id": 1,
        "name": "Gangtok",
        "state": "Sikkim",
        "latitude": 27.3389,
        "longitude": 88.6065,
        "risk_score": 86,
        "risk_level": "HIGH",
        "rainfall_mm": 142,
        "soil_moisture": 78,
        "slope_degree": 38,
        "status": "Alert",
    },
    {
        "id": 2,
        "name": "Aizawl",
        "state": "Mizoram",
        "latitude": 23.7271,
        "longitude": 92.7176,
        "risk_score": 72,
        "risk_level": "HIGH",
        "rainfall_mm": 118,
        "soil_moisture": 71,
        "slope_degree": 32,
        "status": "Watch",
    },
    {
        "id": 3,
        "name": "Shillong",
        "state": "Meghalaya",
        "latitude": 25.5788,
        "longitude": 91.8933,
        "risk_score": 61,
        "risk_level": "MEDIUM",
        "rainfall_mm": 94,
        "soil_moisture": 64,
        "slope_degree": 27,
        "status": "Watch",
    },
    {
        "id": 4,
        "name": "Itanagar",
        "state": "Arunachal Pradesh",
        "latitude": 27.0844,
        "longitude": 93.6053,
        "risk_score": 48,
        "risk_level": "MEDIUM",
        "rainfall_mm": 82,
        "soil_moisture": 58,
        "slope_degree": 24,
        "status": "Normal",
    },
    {
        "id": 5,
        "name": "Kohima",
        "state": "Nagaland",
        "latitude": 25.6751,
        "longitude": 94.1086,
        "risk_score": 37,
        "risk_level": "LOW",
        "rainfall_mm": 58,
        "soil_moisture": 45,
        "slope_degree": 19,
        "status": "Normal",
    },
    {
        "id": 6,
        "name": "Imphal",
        "state": "Manipur",
        "latitude": 24.8170,
        "longitude": 93.9368,
        "risk_score": 31,
        "risk_level": "LOW",
        "rainfall_mm": 52,
        "soil_moisture": 42,
        "slope_degree": 16,
        "status": "Normal",
    },
    {
        "id": 7,
        "name": "Agartala",
        "state": "Tripura",
        "latitude": 23.8315,
        "longitude": 91.2868,
        "risk_score": 24,
        "risk_level": "LOW",
        "rainfall_mm": 46,
        "soil_moisture": 38,
        "slope_degree": 12,
        "status": "Normal",
    },
]


# --------------------------------------------------
# DEMO PREDICTIONS
# --------------------------------------------------

PREDICTIONS = [
    {
        "id": 1,
        "location": "Gangtok",
        "probability": 0.86,
        "risk_score": 86,
        "risk_level": "HIGH",
        "model": "XGBoost",
    },
    {
        "id": 2,
        "location": "Aizawl",
        "probability": 0.72,
        "risk_score": 72,
        "risk_level": "HIGH",
        "model": "XGBoost",
    },
    {
        "id": 3,
        "location": "Shillong",
        "probability": 0.61,
        "risk_score": 61,
        "risk_level": "MEDIUM",
        "model": "XGBoost",
    },
    {
        "id": 4,
        "location": "Itanagar",
        "probability": 0.48,
        "risk_score": 48,
        "risk_level": "MEDIUM",
        "model": "XGBoost",
    },
]


# --------------------------------------------------
# DEMO ALERTS
# --------------------------------------------------

ALERTS = [
    {
        "id": 1,
        "location": "Gangtok",
        "severity": "HIGH",
        "message": "Heavy rainfall and increased slope instability detected.",
        "timestamp": "10 min ago",
    },
    {
        "id": 2,
        "location": "Aizawl",
        "severity": "MEDIUM",
        "message": "Rainfall threshold approaching monitoring limit.",
        "timestamp": "32 min ago",
    },
    {
        "id": 3,
        "location": "Shillong",
        "severity": "MEDIUM",
        "message": "Soil moisture levels elevated.",
        "timestamp": "1 hour ago",
    },
]


# --------------------------------------------------
# DEMO SAFE ROUTES
# --------------------------------------------------

SAFE_ROUTES = [
    {
        "id": 1,
        "route": "NH-10",
        "from_location": "Siliguri",
        "to_location": "Gangtok",
        "status": "CAUTION",
        "distance_km": 114,
    },
    {
        "id": 2,
        "route": "NH-6",
        "from_location": "Shillong",
        "to_location": "Jowai",
        "status": "SAFE",
        "distance_km": 61,
    },
    {
        "id": 3,
        "route": "NH-2",
        "from_location": "Kohima",
        "to_location": "Dimapur",
        "status": "SAFE",
        "distance_km": 70,
    },
    {
        "id": 4,
        "route": "NH-44",
        "from_location": "Aizawl",
        "to_location": "Lunglei",
        "status": "CAUTION",
        "distance_km": 175,
    },
]


# --------------------------------------------------
# INCIDENT REPORT MODEL
# --------------------------------------------------

class IncidentReport(BaseModel):
    location: str
    description: str
    severity: str = "MEDIUM"


incident_reports: List[dict] = []


# --------------------------------------------------
# API ROUTES
# --------------------------------------------------

@router.get("/locations")
def get_locations():
    return LOCATIONS


@router.get("/predictions")
def get_predictions():
    return PREDICTIONS


@router.get("/alerts")
def get_alerts():
    return ALERTS


@router.get("/safe-routes")
def get_safe_routes():
    return SAFE_ROUTES


@router.get("/incident-reports")
def get_incident_reports():
    return incident_reports


@router.post("/incident-reports")
def create_incident_report(
    report: IncidentReport
):
    new_report = {
        "id": len(incident_reports) + 1,
        "location": report.location,
        "description": report.description,
        "severity": report.severity,
        "created_at": datetime.utcnow().isoformat(),
        "status": "RECEIVED",
    }

    incident_reports.append(new_report)

    return {
        "success": True,
        "message": "Incident report received",
        "report": new_report,
    }


@router.get("/day5-status")
def day5_status():
    return {
        "status": "ok",
        "module": "TerraGuard AI Day 5",
        "routes": [
            "/locations",
            "/predictions",
            "/alerts",
            "/safe-routes",
            "/incident-reports",
        ],
        "data_mode": "simulated",
    }