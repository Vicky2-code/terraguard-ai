"""TerraGuard AI backend - FastAPI application entrypoint.

Run from the backend/ directory:

    uvicorn app.main:app

Startup sequence:
  1. create/migrate the schema (SQLite by default, PostgreSQL via DATABASE_URL)
  2. idempotent seed data (users, 45 locations, corridors, infrastructure,
     incidents, history)
  3. first weather ingestion (Open-Meteo, deterministic fallback offline)
  4. first risk + alert evaluation
  5. start APScheduler background pipeline jobs
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.database.db import engine
from app.events import broker
from app.models.entities import Location
from app.routes import (
    alerts,
    analytics,
    auth_routes,
    corridors,
    dashboard,
    exports,
    governance,
    health,
    incidents,
    locations,
    predict,
    scenario,
    stream,
    weather_routes,
)
from app.schema import ensure_schema
from app.seed import seed_all
from app.services.alerts import evaluate_alerts
from app.services.common import get_bands, recompute_location_risk, utcnow
from app.services.pipeline import (
    _log_job,
    job_alert_evaluation,
    job_risk_prediction,
    run_health_checks,
    start_scheduler,
    stop_scheduler,
)
from app.services.weather import ingest as weather_ingest


def _bootstrap() -> None:
    ensure_schema(engine)

    from app.database.db import SessionLocal

    with SessionLocal() as db:
        seed_all(db)

        # initial weather ingestion (live Open-Meteo or honest fallback)
        weather_ingest(db)

        # re-score locations with whatever weather we actually got, then
        # derive alerts from the configured thresholds (dedup applied)
        bands = get_bands(db)
        for loc in db.query(Location).all():
            recompute_location_risk(db, loc, bands=bands)
        db.commit()
        evaluate_alerts(db)

        run_health_checks()
        _log_job("risk_prediction", job_risk_prediction)
        _log_job("alert_evaluation", job_alert_evaluation)


@asynccontextmanager
async def lifespan(app: FastAPI):
    broker.loop = asyncio.get_running_loop()
    _bootstrap()
    start_scheduler()
    # re-run health checks now that the worker is up (bootstrap ran them while
    # the scheduler was still stopped)
    run_health_checks()
    yield
    stop_scheduler()


app = FastAPI(
    title="TerraGuard AI API",
    description="AI-powered landslide risk monitoring and early warning prototype",
    version=config.BACKEND_VERSION,
    lifespan=lifespan,
)

# CORS - configurable for production via CORS_ORIGINS (comma separated or JSON)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# contract routers (/api/*)
app.include_router(health.router)
app.include_router(auth_routes.router)
app.include_router(dashboard.router)
app.include_router(locations.router)
app.include_router(weather_routes.router)
app.include_router(incidents.router)
app.include_router(alerts.router)
app.include_router(predict.router)
app.include_router(scenario.router)
app.include_router(analytics.router)
app.include_router(exports.router)
app.include_router(governance.router)
app.include_router(corridors.router)
app.include_router(stream.router)

# legacy prototype routers (kept for backwards compatibility)
from app.day5_routes import router as day5_router
from app.prediction_routes import router as prediction_router

app.include_router(day5_router)
app.include_router(prediction_router)


@app.get("/")
def root():
    return {
        "project": "TerraGuard AI",
        "status": "running",
        "version": config.BACKEND_VERSION,
        "docs": "/docs",
    }
