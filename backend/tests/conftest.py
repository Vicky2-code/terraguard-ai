"""Pytest fixtures for the TerraGuard API suite.

Environment is configured BEFORE `app` (and therefore `app.database.db`)
is imported so tests never touch the real terraguard.db and never hit
the network:

    DATABASE_URL          -> throwaway sqlite file in the temp dir
    TERRAGUARD_LIVE_WEATHER=0 -> deterministic fallback weather
"""

import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

_TMP_DIR = tempfile.mkdtemp(prefix="terraguard-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DIR}/test_terraguard.db"
os.environ["TERRAGUARD_LIVE_WEATHER"] = "0"
os.environ.setdefault("JWT_SECRET", "test-secret")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from app.main import app

    # lifespan runs the bootstrap: schema + seed + first weather/alert pass
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def admin_headers(client):
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@terraguard.local", "password": "admin123"},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}


@pytest.fixture()
def sample_location(client):
    resp = client.get("/api/locations")
    assert resp.status_code == 200, resp.text
    locations = resp.json()
    assert locations, "seed should provide at least one location"
    return locations[0]
