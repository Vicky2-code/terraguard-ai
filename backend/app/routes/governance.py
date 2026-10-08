"""Governance endpoints: models, pipeline, admin stats, settings.

- GET  /api/models           -> registry with metrics: null (not measured)
- GET  /api/pipeline         -> {components, runs, meta}       (contract)
- GET  /api/pipeline/status  -> overall status + components + recent runs
- GET  /api/pipeline/jobs    -> scheduled jobs with next-run info
- GET  /api/admin/stats      -> aggregate admin counters
- GET  /api/settings         -> thresholds, region, language, refresh, ...
- PATCH /api/settings (ADMIN) -> validated update, persisted (also PUT alias)
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
import httpx
import time

from app import config
from app.database.db import get_db
from app.events import broker
from app.models.entities import (
    Alert,
    Corridor,
    EnvironmentalData,
    Incident,
    Infrastructure,
    Location,
    PipelineJob,
    Prediction,
    SoilSnapshot,
    SystemSetting,
    User,
)
from app.routes.health import _health_payload
from app.security import require_admin
from app.services.common import (
    cutoffs_from_bands,
    get_bands,
    get_setting,
    iso,
    set_setting,
    utcnow,
    validate_cutoffs,
)
from app.services.pipeline import JOB_LABELS, PROCESS_STARTED_AT, job_schedules, scheduler

router = APIRouter(prefix="/api", tags=["Governance"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

@router.get("/models")
def list_models(db=Depends(get_db)):
    seeded_at = get_setting(db, "seeded_at")
    return {
        "models": [
            {
                "name": "TerraGuard Risk Scoring Engine",
                "version": config.MODEL_VERSION,
                "status": config.MODEL_STATUS,
                "trained_at": None,
                "dataset_version": None,
                # contract: unmeasured metrics are null so the UI renders NOT AVAILABLE
                "metrics": None,
                "metrics_status": "not_available",
                "deployed_at": seeded_at,
                "drift_status": "not_available",
                "model_type": "deterministic_weighted_heuristic",
                "label": config.MODEL_LABEL,
                "notes": (
                    "PROTOTYPE MODEL: deterministic weighted heuristic over rainfall, "
                    "soil moisture, slope, elevation, land cover and temperature. "
                    "Not trained or validated - accuracy metrics are not available "
                    "(null) by design."
                ),
            }
        ],
        "meta": {
            "source": "model_registry",
            "source_status": "LIVE",
            "last_updated": iso(utcnow()),
            "data_age_seconds": 0,
            "refresh_interval_seconds": 3600,
        },
    }


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def _components(db) -> list[dict]:
    health = _health_payload()
    order = ["api", "database", "weather_provider", "ml_engine", "alert_service", "worker"]
    names = {
        "api": "api",
        "database": "database",
        "weather_provider": "weather_ingestion",
        "ml_engine": "risk_prediction",
        "alert_service": "alert_evaluation",
        "worker": "worker",
    }
    components = []
    for key in order:
        check = health["checks"].get(key, {"status": "OFFLINE", "detail": "unknown", "last_checked": None})
        components.append(
            {
                "name": names[key],
                "status": check["status"],
                "detail": check["detail"],
                "last_checked": check["last_checked"],
            }
        )
    return components


def _runs(db, limit: int = 20) -> list[dict]:
    rows = (
        db.query(PipelineJob)
        .order_by(PipelineJob.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": row.id,
            "job_name": row.job_name,
            "status": row.status,
            "started_at": iso(row.started_at),
            "finished_at": iso(row.finished_at),
            "message": row.message,
        }
        for row in rows
    ]


@router.get("/pipeline")
def pipeline(db=Depends(get_db)):
    components = _components(db)
    return {
        "components": components,
        "runs": _runs(db),
        "meta": {
            "source": "pipeline",
            "source_status": "LIVE",
            "last_updated": iso(utcnow()),
            "data_age_seconds": 0,
            "refresh_interval_seconds": config.JOB_INTERVALS["health_check"],
        },
    }


@router.get("/pipeline/status")
def pipeline_status(db=Depends(get_db)):
    components = _components(db)
    health = _health_payload()
    runs = _runs(db, limit=10)
    failed_recent = any(run["status"] == "FAILED" for run in runs)
    overall = health["status"]
    if failed_recent and overall == "healthy":
        overall = "degraded"
    return {
        "status": overall.upper(),
        "summary": health["status"],
        "components": components,
        "runs": runs,
        "jobs": list(JOB_LABELS.keys()),
        "worker": "ONLINE" if scheduler.running else "OFFLINE",
        "scenario_tick": "ONLINE" if scheduler.running else "OFFLINE",
        "meta": {
            "source": "pipeline",
            "source_status": "LIVE",
            "last_updated": iso(utcnow()),
            "data_age_seconds": 0,
            "refresh_interval_seconds": config.JOB_INTERVALS["health_check"],
        },
    }


@router.get("/pipeline/jobs")
def pipeline_jobs(db=Depends(get_db)):
    schedules = job_schedules()
    last_run: dict[str, PipelineJob] = {}
    for row in db.query(PipelineJob).order_by(PipelineJob.id.desc()).limit(200).all():
        last_run.setdefault(row.job_name, row)

    jobs = []
    for name, label in JOB_LABELS.items():
        row = last_run.get(name)
        schedule = schedules.get(name, {})
        jobs.append(
            {
                "job_name": name,
                "label": label,
                "interval_seconds": config.JOB_INTERVALS.get(name),
                "enabled": True,
                "next_run": schedule.get("next_run"),
                "last_run": iso(row.finished_at or row.started_at) if row else None,
                "last_status": row.status if row else None,
                "last_message": row.message if row else "",
            }
        )
    return {
        "jobs": jobs,
        "runs": _runs(db, limit=20),
        "meta": {
            "source": "scheduler",
            "source_status": "LIVE" if scheduler.running else "UNAVAILABLE",
            "last_updated": iso(utcnow()),
            "data_age_seconds": 0,
            "refresh_interval_seconds": 60,
        },
    }


@router.get("/pipeline/open-meteo-probe")
def open_meteo_probe(
    mode: str = "minimal",
    transport: str = "direct",
    db=Depends(get_db),
    _user=Depends(require_admin),
):
    """Forecast-API reachability diagnostics from THIS host (ADMIN).

    mode:
      minimal - 1 location, current temperature only (is the endpoint/IP OK?)
      batch   - first 40 locations with the production request shape
    transport:
      direct  - https://api.open-meteo.com
      proxy   - OPENMETEO_PROXY_BASE_URL (e.g. the Vercel rewrite), if configured

    Returns the upstream status code AND a body excerpt so rate-limit
    messages ("daily limit exceeded" etc.) are visible, not just "429".
    """
    if transport == "direct":
        base = "https://api.open-meteo.com/v1/forecast"
    elif transport == "proxy":
        if not config.OPENMETEO_PROXY_BASE_URL:
            raise HTTPException(status_code=400, detail="OPENMETEO_PROXY_BASE_URL is not configured")
        base = f"{config.OPENMETEO_PROXY_BASE_URL}/v1/forecast"
    else:
        raise HTTPException(status_code=400, detail="transport must be direct or proxy")

    if mode == "minimal":
        loc = db.query(Location).order_by(Location.id).first()
        if loc is None:
            raise HTTPException(status_code=400, detail="no locations seeded yet")
        params = {
            "latitude": f"{loc.latitude:.4f}",
            "longitude": f"{loc.longitude:.4f}",
            "current": "temperature_2m",
            "timezone": "GMT",
        }
    elif mode == "batch":
        rows = db.query(Location).order_by(Location.id).limit(40).all()
        if not rows:
            raise HTTPException(status_code=400, detail="no locations seeded yet")
        params = {
            "latitude": ",".join(f"{loc.latitude:.4f}" for loc in rows),
            "longitude": ",".join(f"{loc.longitude:.4f}" for loc in rows),
            "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,surface_pressure",
            "hourly": "precipitation",
            "past_days": 1,
            "forecast_days": 2,
            "timezone": "GMT",
        }
    else:
        raise HTTPException(status_code=400, detail="mode must be minimal or batch")

    started = time.perf_counter()
    try:
        response = httpx.get(base, params=params, timeout=config.WEATHER_TIMEOUT_SECONDS)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return {
            "transport": transport,
            "mode": mode,
            "endpoint_host": base.split("/")[2],
            "status_code": response.status_code,
            "ok": response.is_success,
            "elapsed_ms": elapsed_ms,
            "body_excerpt": response.text[:400],
            "checked_at": iso(utcnow()),
        }
    except httpx.HTTPError as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return {
            "transport": transport,
            "mode": mode,
            "endpoint_host": base.split("/")[2],
            "status_code": None,
            "ok": False,
            "elapsed_ms": elapsed_ms,
            "body_excerpt": str(exc)[:400],
            "checked_at": iso(utcnow()),
        }


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

@router.get("/admin/stats")
def admin_stats(db=Depends(get_db)):
    return {
        "users": db.query(User).count(),
        "roles": dict(db.query(User.role, func.count(User.id)).group_by(User.role).all()),
        "locations": db.query(Location).count(),
        "incidents": db.query(Incident).count(),
        "alerts": db.query(Alert).count(),
        "active_alerts": db.query(Alert).filter(Alert.status == "active").count(),
        "predictions": db.query(Prediction).count(),
        "environmental_records": db.query(EnvironmentalData).count(),
        "soil_snapshots": db.query(SoilSnapshot).count(),
        "corridors": db.query(Corridor).count(),
        "infrastructure": db.query(Infrastructure).count(),
        "pipeline_runs": db.query(PipelineJob).count(),
        "settings_keys": db.query(SystemSetting).count(),
        "uptime_seconds": int((utcnow() - PROCESS_STARTED_AT).total_seconds()),
        "backend_version": config.BACKEND_VERSION,
        "generated_at": iso(utcnow()),
    }


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class SettingsPatch(BaseModel):
    thresholds: dict | None = None
    region: str | None = None
    language: str | None = None
    refresh_interval_seconds: int | None = None
    notifications: dict | None = None


def _settings_payload(db) -> dict:
    bands = get_bands(db)
    notifications = get_setting(db, "notifications") or {}
    return {
        "thresholds": cutoffs_from_bands(bands),
        "bands": bands,
        "region": get_setting(db, "region", "Northeast India"),
        "language": get_setting(db, "language", "en"),
        "refresh_interval_seconds": get_setting(
            db, "refresh_interval_seconds", config.DASHBOARD_REFRESH_SECONDS
        ),
        "notifications": notifications,
        "updated_at": get_setting(db, "settings_updated_at"),
    }


def _apply_settings(db, payload: SettingsPatch) -> dict:
    if payload.thresholds is not None:
        error = validate_cutoffs(payload.thresholds)
        if error:
            raise HTTPException(status_code=400, detail=error)
        from app.services.common import bands_from_cutoffs

        set_setting(db, "thresholds", bands_from_cutoffs(payload.thresholds))
    if payload.region is not None:
        set_setting(db, "region", payload.region.strip()[:120])
    if payload.language is not None:
        set_setting(db, "language", payload.language.strip()[:16])
    if payload.refresh_interval_seconds is not None:
        value = payload.refresh_interval_seconds
        if value < 30 or value > 3600:
            raise HTTPException(status_code=400, detail="refresh_interval_seconds must be 30-3600")
        set_setting(db, "refresh_interval_seconds", value)
    if payload.notifications is not None:
        allowed = {"email", "sms", "in_app", "delivery_mode"}
        unknown = set(payload.notifications) - allowed
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown notification keys: {', '.join(sorted(unknown))}",
            )
        set_setting(db, "notifications", payload.notifications)
    set_setting(db, "settings_updated_at", iso(utcnow()))
    db.commit()
    result = _settings_payload(db)
    broker.publish("settings_changed", result)
    return result


@router.get("/settings")
def get_settings(db=Depends(get_db)):
    return _settings_payload(db)


@router.patch("/settings")
def patch_settings(
    payload: SettingsPatch,
    db=Depends(get_db),
    user=Depends(require_admin),
):
    return _apply_settings(db, payload)


@router.put("/settings")
def put_settings(
    payload: SettingsPatch,
    db=Depends(get_db),
    user=Depends(require_admin),
):
    return _apply_settings(db, payload)
