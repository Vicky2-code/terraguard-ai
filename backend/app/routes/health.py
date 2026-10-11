"""Health + system status endpoints.

- GET /api/health (contract) and GET /health (alias used by older clients)
- GET /api/status
"""

from fastapi import APIRouter

from app import config
from app.events import broker
from app.services import weather as weather_service
from app.services.common import iso, utcnow
from app.services.pipeline import HEALTH, PROCESS_STARTED_AT, run_health_checks, scheduler
from app.services.scenario import STATE as SCENARIO_STATE

router = APIRouter(tags=["Health"])


def _health_payload() -> dict:
    snapshot = run_health_checks()
    return {
        "status": snapshot["summary"],  # healthy | degraded
        "version": config.BACKEND_VERSION,
        "timestamp": iso(utcnow()),
        "checks": snapshot["checks"],
    }


@router.get("/api/health")
def api_health():
    return _health_payload()


@router.get("/health")
def root_health():
    payload = _health_payload()
    payload["service"] = "TerraGuard AI Backend"
    return payload


@router.get("/api/status")
def system_status():
    wstate = weather_service.STATE
    live = wstate.get("ok") is True
    now = utcnow()
    return {
        "system": "LIVE" if live else "DEMO",
        "last_sync": iso(wstate.get("last_success")),
        "uptime_seconds": int((now - PROCESS_STARTED_AT).total_seconds()),
        "backend_version": config.BACKEND_VERSION,
        "weather_source": weather_service.source_label() if live else "simulated_fallback",
        "demo_mode": not live,
        "connection": {
            "stream_url": "/api/stream",
            "stream_status": "CONNECTED",
            "clients": broker.subscriber_count,
            "last_event_at": broker.last_event_at,
            "polling_hint_seconds": 30,
        },
        "scenario_active": SCENARIO_STATE["state"] != "IDLE",
        "worker": "ONLINE" if scheduler.running else "OFFLINE",
        "timestamp": iso(now),
    }
