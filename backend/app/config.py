"""Central configuration for the TerraGuard AI backend.

All values are environment-overridable so the same build runs in local dev,
CI and production (see backend/.env).
"""

import json
import os

from dotenv import load_dotenv

load_dotenv()

BACKEND_VERSION = "1.0.0"

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
DEFAULT_CORS_ORIGINS = ",".join(
    [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:4173",
    ]
)


def _parse_origins(raw: str) -> list:
    raw = (raw or "").strip()
    if not raw:
        raw = DEFAULT_CORS_ORIGINS
    if raw.startswith("["):
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return [str(x) for x in data]
        except json.JSONDecodeError:
            pass
    return [part.strip() for part in raw.split(",") if part.strip()]


CORS_ORIGINS = _parse_origins(os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS))

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "terraguard-dev-secret-change-me")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
JWT_ALGORITHM = "HS256"

ROLE_ORDER = ["VIEWER", "FIELD_OFFICER", "ANALYST", "ADMIN"]

# ---------------------------------------------------------------------------
# Risk model / thresholds (PROTOTYPE heuristic - see prediction_engine.py)
# ---------------------------------------------------------------------------
MODEL_VERSION = "tg-prototype-v1.0"
MODEL_LABEL = "PROTOTYPE MODEL"
MODEL_STATUS = "PROTOTYPE"

# Default score bands: LOW 0-24, MODERATE 25-49, HIGH 50-69,
# VERY_HIGH 70-84, CRITICAL 85-100 (configurable at runtime).
DEFAULT_BANDS = {
    "low": {"min": 0, "max": 24},
    "moderate": {"min": 25, "max": 49},
    "high": {"min": 50, "max": 69},
    "very_high": {"min": 70, "max": 84},
    "critical": {"min": 85, "max": 100},
}

BAND_ORDER = ["low", "moderate", "high", "very_high", "critical"]
LEVEL_FOR_BAND = {
    "low": "LOW",
    "moderate": "MODERATE",
    "high": "HIGH",
    "very_high": "VERY_HIGH",
    "critical": "CRITICAL",
}
RISK_LEVEL_COLORS = {
    "LOW": "#22c55e",
    "MODERATE": "#eab308",
    "HIGH": "#f97316",
    "VERY_HIGH": "#ef4444",
    "CRITICAL": "#dc2626",
}

# ---------------------------------------------------------------------------
# Weather ingestion (Open-Meteo, server-side only, no API key)
# ---------------------------------------------------------------------------
# NE India bounding box used for zone aggregation / documentation.
WEATHER_BBOX = {"lat_min": 21.5, "lat_max": 29.6, "lon_min": 88.0, "lon_max": 97.5}
WEATHER_REFRESH_SECONDS = 900  # every 15 minutes
DASHBOARD_REFRESH_SECONDS = 600

# Set TERRAGUARD_LIVE_WEATHER=0 to force the deterministic fallback (used by
# the test-suite so it never touches the network).
LIVE_WEATHER_ENABLED = os.getenv("TERRAGUARD_LIVE_WEATHER", "1").strip().lower() not in (
    "0",
    "false",
    "no",
)

WEATHER_TIMEOUT_SECONDS = float(os.getenv("WEATHER_TIMEOUT_SECONDS", "12"))

# Optional egress proxy for the forecast API. Some shared datacenter egress
# IPs (Render free tier) are rate-limited by Open-Meteo's keyless free tier
# with HTTP 429. Set this to a same-app URL that rewrites to
# https://api.open-meteo.com (see frontend/vercel.json "/api/open-meteo/:path*")
# so forecast calls leave from a different egress IP. Empty = direct calls.
OPENMETEO_PROXY_BASE_URL = os.getenv("OPENMETEO_PROXY_BASE_URL", "").rstrip("/")

# Provider chain fallback. Open-Meteo's free tier is limited PER IP, so shared
# cloud egress ranges are frequently over quota even when this app is idle.
# With the fallback enabled, ingestion tries, in order:
#   1. Open-Meteo forecast API (direct or via OPENMETEO_PROXY_BASE_URL)
#   2. Open-Meteo historical-forecast API (a separate endpoint quota)
#   3. MET Norway locationforecast (keyless, no shared-IP quota)
# Every provider is labeled honestly in the UI meta; nothing is fabricated.
WEATHER_FALLBACK_ENABLED = os.getenv("WEATHER_FALLBACK_ENABLED", "1").strip().lower() not in (
    "0",
    "false",
    "no",
)

# MET Norway requires a descriptive User-Agent identifying the application
# (see https://api.met.no/doc/TermsOfService). Keep it in the env so operators
# can add their own contact details.
MET_NO_USER_AGENT = os.getenv(
    "MET_NO_USER_AGENT",
    "TerraGuard-AI/1.0 (+https://github.com/Vicky2-code/terraguard-ai)",
)

# MET Norway is queried per location; pace requests (their ToS asks for
# well under 20 req/s and no unnecessary bursts).
MET_NO_INGEST_DELAY_SECONDS = float(os.getenv("MET_NO_INGEST_DELAY_SECONDS", "0.4"))

# ---------------------------------------------------------------------------
# Pipeline cadence (seconds)
# ---------------------------------------------------------------------------
JOB_INTERVALS = {
    "weather_ingestion": WEATHER_REFRESH_SECONDS,
    "risk_prediction": 600,
    "alert_evaluation": 300,
    "health_check": 60,
    "data_cleanup": 3600,
    "scenario_tick": 3,
}
