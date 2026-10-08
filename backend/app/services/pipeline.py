"""Background pipeline: APScheduler jobs + health state.

Jobs (interval cadence from app.config.JOB_INTERVALS):

    weather_ingestion  every 15 min  Open-Meteo fetch -> DB (fallback flags)
    risk_prediction    every 10 min  deterministic re-score of all locations
    alert_evaluation   every  5 min  threshold alerts with (location, level) dedup
    health_check       every  60 s   db / weather / worker liveness snapshot
    data_cleanup       every 60 min  prune old telemetry, keep DB lean
    scenario_tick      every   3 s   advance the emergency simulation if RUNNING

Every job (except the 3s tick) is logged into `pipeline_jobs` so
/api/pipeline, /api/pipeline/status and /api/pipeline/jobs can report real run
history. All alerting is local & simulated - this app never sends SMS/email.
"""

from datetime import timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from app import config
from app.events import broker
from app.models.entities import EnvironmentalData, PipelineJob, Prediction, ScenarioEvent
from app.services import alerts as alerts_service
from app.services import scenario as scenario_service
from app.services import weather as weather_service
from app.services.common import iso, utcnow
from sqlalchemy import text

scheduler = BackgroundScheduler(timezone="UTC")
PROCESS_STARTED_AT = utcnow()

HEALTH = {
    "last_checked": None,
    "checks": {},
}

JOB_LABELS = {
    "weather_ingestion": "Weather ingestion (Open-Meteo)",
    "risk_prediction": "Risk prediction (prototype engine)",
    "alert_evaluation": "Alert evaluation (thresholds)",
    "health_check": "Health check",
    "data_cleanup": "Data cleanup",
    "scenario_tick": "Scenario tick (simulation)",
}


# ---------------------------------------------------------------------------
# Job logging
# ---------------------------------------------------------------------------

def _log_job(job_name, func):
    from app.database.db import SessionLocal

    with SessionLocal() as db:
        started = utcnow()
        row = PipelineJob(job_name=job_name, status="RUNNING", started_at=started, message="")
        db.add(row)
        db.commit()
        try:
            message = func(db) or "ok"
            row.status = "SUCCESS"
            row.finished_at = utcnow()
            row.message = str(message)[:500]
        except Exception as exc:  # noqa: BLE001 - jobs must never kill the scheduler
            db.rollback()
            row.status = "FAILED"
            row.finished_at = utcnow()
            row.message = f"{type(exc).__name__}: {exc}"[:500]
        finally:
            try:
                db.commit()
            except Exception:  # pragma: no cover
                db.rollback()
        _prune_job_log(db)
        broker.publish(
            "pipeline_status",
            {
                "job_name": job_name,
                "status": row.status,
                "message": row.message,
                "started_at": iso(row.started_at),
                "finished_at": iso(row.finished_at),
            },
        )
    return row


def _prune_job_log(db, keep: int = 120):
    try:
        ids = [
            row.id
            for row in db.query(PipelineJob)
            .order_by(PipelineJob.id.desc())
            .offset(keep)
            .all()
        ]
        if ids:
            db.query(PipelineJob).filter(PipelineJob.id.in_(ids)).delete(synchronize_session=False)
            db.commit()
    except Exception:  # pragma: no cover
        db.rollback()


# ---------------------------------------------------------------------------
# Job bodies
# ---------------------------------------------------------------------------

def job_weather_ingestion(db) -> str:
    summary = weather_service.ingest(db)
    return f"source_status={summary['source_status']} weather_ok={summary['weather_ok']} soil_ok={summary['soil_ok']}"


def job_risk_prediction(db) -> str:
    from app.models.entities import Location
    from app.services.common import get_bands, recompute_location_risk

    bands = get_bands(db)
    locations = db.query(Location).order_by(Location.id).all()
    now = utcnow()
    for loc in locations:
        recompute_location_risk(db, loc, bands=bands)
        db.add(
            Prediction(
                location_id=loc.id,
                probability=round(float(loc.risk_score or 0) / 100.0, 3),
                risk_score=float(loc.risk_score or 0),
                risk_level=loc.risk_level or "LOW",
                model_version=config.MODEL_VERSION,
                created_at=now,
            )
        )
    db.commit()
    avg = round(sum(float(loc.risk_score or 0) for loc in locations) / max(1, len(locations)), 1)
    broker.publish(
        "risk_update",
        {
            "locations": [
                {
                    "id": loc.id,
                    "name": loc.name,
                    "risk_score": round(float(loc.risk_score or 0), 1),
                    "risk_level": loc.risk_level,
                    "simulation": bool(loc.scenario_boost),
                }
                for loc in locations
            ],
            "avg_risk_score": avg,
        },
    )
    return f"rescored {len(locations)} locations, avg_risk={avg}"


def job_alert_evaluation(db) -> str:
    result = alerts_service.evaluate_alerts(db)
    return f"created={result['created']} resolved={result['resolved']}"


def job_health_check(_db) -> str:
    snapshot = run_health_checks()
    summary = snapshot["summary"]
    return f"summary={summary}"


def job_data_cleanup(db) -> str:
    cutoff_env = utcnow() - timedelta(days=7)
    cutoff_pred = utcnow() - timedelta(days=7)
    removed_env = (
        db.query(EnvironmentalData)
        .filter(EnvironmentalData.recorded_at < cutoff_env)
        .delete(synchronize_session=False)
    )
    removed_pred = (
        db.query(Prediction)
        .filter(Prediction.created_at < cutoff_pred)
        .delete(synchronize_session=False)
    )
    removed_events = (
        db.query(ScenarioEvent)
        .filter(ScenarioEvent.created_at < utcnow() - timedelta(days=2))
        .delete(synchronize_session=False)
    )
    db.commit()
    return f"env=-{removed_env} predictions=-{removed_pred} scenario_events=-{removed_events}"


def job_scenario_tick(_db=None) -> None:
    from app.database.db import SessionLocal

    with SessionLocal() as db:
        scenario_service.tick(db)


# ---------------------------------------------------------------------------
# Health snapshot
# ---------------------------------------------------------------------------

def run_health_checks() -> dict:
    now = utcnow()
    checks = {}

    checks["api"] = {
        "status": "ONLINE",
        "detail": "FastAPI request handling",
        "last_checked": iso(now),
    }

    # database
    from app.database.db import SessionLocal

    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
        db_status, db_detail = "ONLINE", "database reachable"
    except Exception as exc:  # pragma: no cover
        db_status, db_detail = "OFFLINE", f"{type(exc).__name__}: {exc}"
    checks["database"] = {"status": db_status, "detail": db_detail, "last_checked": iso(now)}

    # weather provider
    wstate = weather_service.STATE
    if wstate.get("ok") is True:
        w_status, w_detail = "ONLINE", f"Open-Meteo live (last success {iso(wstate.get('last_success'))})"
    elif wstate.get("ok") is False:
        w_status = "DEGRADED"
        w_detail = (
            f"Open-Meteo unavailable - simulated_fallback values in use: {wstate.get('error')}"
        )
    else:
        w_status, w_detail = "DEGRADED", "first ingestion not attempted yet"
    checks["weather_provider"] = {"status": w_status, "detail": w_detail, "last_checked": iso(now)}

    checks["ml_engine"] = {
        "status": "ONLINE",
        "detail": (
            "deterministic weighted heuristic - PROTOTYPE MODEL; "
            "metrics status not_available"
        ),
        "last_checked": iso(now),
    }
    checks["alert_service"] = {
        "status": "ONLINE",
        "detail": "threshold evaluation active; delivery SIMULATED_LOCAL (no provider configured)",
        "last_checked": iso(now),
    }
    worker_online = scheduler.running
    checks["worker"] = {
        "status": "ONLINE" if worker_online else "OFFLINE",
        "detail": (
            f"APScheduler running ({len(scheduler.get_jobs())} jobs)"
            if worker_online
            else "scheduler not running"
        ),
        "last_checked": iso(now),
    }

    summary = "healthy" if all(c["status"] == "ONLINE" for c in checks.values()) else "degraded"
    HEALTH["last_checked"] = now
    HEALTH["checks"] = checks
    return {"summary": summary, "checks": checks}


# ---------------------------------------------------------------------------
# Scheduler lifecycle
# ---------------------------------------------------------------------------


def start_scheduler() -> None:
    if scheduler.running:
        return
    intervals = config.JOB_INTERVALS

    scheduler.add_job(
        _log_job, "interval", seconds=intervals["weather_ingestion"],
        args=["weather_ingestion", job_weather_ingestion],
        id="weather_ingestion", coalesce=True, max_instances=1, misfire_grace_time=30,
        replace_existing=True,
    )
    scheduler.add_job(
        _log_job, "interval", seconds=intervals["risk_prediction"],
        args=["risk_prediction", job_risk_prediction],
        id="risk_prediction", coalesce=True, max_instances=1, misfire_grace_time=30,
        replace_existing=True,
    )
    scheduler.add_job(
        _log_job, "interval", seconds=intervals["alert_evaluation"],
        args=["alert_evaluation", job_alert_evaluation],
        id="alert_evaluation", coalesce=True, max_instances=1, misfire_grace_time=30,
        replace_existing=True,
    )
    scheduler.add_job(
        run_health_checks, "interval", seconds=intervals["health_check"],
        id="health_check", coalesce=True, max_instances=1, misfire_grace_time=30,
        replace_existing=True,
    )
    scheduler.add_job(
        _log_job, "interval", seconds=intervals["data_cleanup"],
        args=["data_cleanup", job_data_cleanup],
        id="data_cleanup", coalesce=True, max_instances=1, misfire_grace_time=60,
        replace_existing=True,
    )
    scheduler.add_job(
        job_scenario_tick, "interval", seconds=intervals["scenario_tick"],
        id="scenario_tick", coalesce=True, max_instances=1, misfire_grace_time=5,
        replace_existing=True,
    )
    scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


def job_schedules() -> dict:
    """job_name -> {interval_seconds, next_run} for /api/pipeline/jobs."""
    result = {}
    for job in scheduler.get_jobs() if scheduler.running else []:
        next_run = getattr(job, "next_run_time", None)
        result[job.id] = {
            "interval_seconds": config.JOB_INTERVALS.get(job.id),
            "next_run": iso(next_run.replace(tzinfo=None)) if next_run else None,
        }
    return result
