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
