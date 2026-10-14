"""Contract test-suite for the TerraGuard AI backend.

Covers the shapes and behaviours the frontend depends on:

- POST /api/predict response shape (PROTOTYPE labelling, honest metrics)
- incidents CRUD + filters + pagination
- alert threshold validation (out-of-range rejected 400)
- scenario state machine (IDLE -> RUNNING <-> PAUSED -> IDLE)
- dashboard KPIs are populated (non-zero) from seeded data
- alert de-duplication: one open alert per (location_id, risk_level)
- CSV export returns a real header row
"""

import csv
import io
import re

import pytest


# --------------------------------------------------------------------- auth

class TestAuth:
    def test_login_returns_bearer_token(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"email": "admin@terraguard.local", "password": "admin123"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["token_type"] == "bearer"
        assert body["token"]
        assert body["user"]["role"] == "ADMIN"
        assert body["user"]["email"] == "admin@terraguard.local"

    def test_bad_password_is_401(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"email": "admin@terraguard.local", "password": "nope"},
        )
        assert resp.status_code == 401

    def test_me_requires_token(self, client):
        assert client.get("/api/auth/me").status_code == 401

    def test_register_creates_viewer_and_can_login(self, client):
        resp = client.post(
            "/api/auth/register",
            json={"name": "Test User", "email": "tester@example.com", "password": "secret123"},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["token_type"] == "bearer"
        assert body["token"]
        assert body["user"]["role"] == "VIEWER"
        assert body["user"]["email"] == "tester@example.com"
        # normalised email can now log in
        login = client.post(
            "/api/auth/login",
            json={"email": "Tester@example.com", "password": "secret123"},
        )
        assert login.status_code == 200
        assert login.json()["user"]["role"] == "VIEWER"

    def test_register_duplicate_email_is_409(self, client):
        resp = client.post(
            "/api/auth/register",
            json={"name": "Dup", "email": "admin@terraguard.local", "password": "secret123"},
        )
        assert resp.status_code == 409

    def test_register_invalid_email_is_422(self, client):
        resp = client.post(
            "/api/auth/register",
            json={"name": "Bad", "email": "not-an-email", "password": "secret123"},
        )
        assert resp.status_code == 422

    def test_register_short_password_is_422(self, client):
        resp = client.post(
            "/api/auth/register",
            json={"name": "Short", "email": "short@example.com", "password": "abc"},
        )
        assert resp.status_code == 422

    def test_settings_mutation_requires_admin(self, client):
        resp = client.patch("/api/settings", json={"language": "en"})
        assert resp.status_code in (401, 403)

    def test_settings_patch_with_admin(self, client, admin_headers):
        resp = client.patch(
            "/api/settings", json={"language": "en"}, headers=admin_headers
        )
        assert resp.status_code == 200
        assert resp.json()["language"] == "en"


# ----------------------------------------------------------------- predict

class TestPredict:
    BODY = {
        "rainfall": 140.0,
        "soil_moisture": 80.0,
        "slope": 35.0,
        "elevation": 1600.0,
        "land_cover": "forest",
        "recent_rainfall": 260.0,
        "temperature": 22.0,
    }

    def test_predict_shape(self, client):
        resp = client.post("/api/predict", json=self.BODY)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        for key in (
            "risk_score",
            "risk_level",
            "model_version",
            "timestamp",
            "confidence",
            "feature_contributions",
            "model_status",
        ):
            assert key in body, f"missing {key}: {sorted(body)}"
        assert body["model_status"] == "PROTOTYPE"
        assert 0 <= body["risk_score"] <= 100
        assert body["risk_level"] in ("LOW", "MODERATE", "HIGH", "VERY_HIGH", "CRITICAL")
        assert body["feature_contributions"]
        first = body["feature_contributions"][0]
        assert "feature" in first and "contribution" in first
        # never fabricated metrics
        assert body.get("metrics") in (None, {"status": "not_available"})

    def test_predict_is_deterministic(self, client):
        a = client.post("/api/predict", json=self.BODY).json()
        b = client.post("/api/predict", json=self.BODY).json()
        assert a["risk_score"] == b["risk_score"]
        assert a["model_version"] == b["model_version"]

    def test_more_rain_scores_higher(self, client):
        dry = dict(self.BODY, rainfall=5.0, soil_moisture=20.0, recent_rainfall=8.0)
        wet = dict(self.BODY, rainfall=300.0, soil_moisture=95.0, recent_rainfall=520.0)
        low = client.post("/api/predict", json=dry).json()["risk_score"]
        high = client.post("/api/predict", json=wet).json()["risk_score"]
        assert high > low

    def test_missing_fields_is_422(self, client):
        resp = client.post("/api/predict", json={"rainfall": 10})
        assert resp.status_code == 422

    def test_out_of_range_is_rejected(self, client):
        resp = client.post(
            "/api/predict",
            json=dict(self.BODY, rainfall=-50),
        )
        # Pydantic range validation -> 422; endpoint-level checks would be 400
        assert resp.status_code in (400, 422)
        assert "detail" in resp.json()


# -------------------------------------------------------------- incidents

class TestIncidents:
    NEW = {
        "type": "LANDSLIDE",
        "description": "Debris flow blocking the hill road above the village",
        "location_name": "Gangtok",
        "latitude": 27.3314,
        "longitude": 88.6065,
        "severity": "HIGH",
        "reporter": "qa_suite",
        "region": "Sikkim",
    }

    def test_list_shape(self, client):
        resp = client.get("/api/incidents")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body["items"], list)
        assert isinstance(body["total"], int)
        assert "meta" in body
        item = body["items"][0]
        for key in (
            "id", "public_id", "type", "description", "location_name", "latitude",
            "longitude", "severity", "status", "reporter", "region", "created_at",
            "updated_at",
        ):
            assert key in item, f"missing {key}"
        assert re.match(r"INC-\d{4}-\d{4}$", item["public_id"])

    def test_create_returns_201_with_unique_public_id(self, client):
        first = client.post("/api/incidents", json=self.NEW)
        second = client.post("/api/incidents", json=dict(self.NEW, reporter="qa_suite_2"))
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text
        created = first.json()
        assert created["public_id"] != second.json()["public_id"]
        assert re.match(r"INC-\d{4}-\d{4}$", created["public_id"])
        assert created["id"]
        assert created["created_at"].endswith("Z")

    def test_create_validation(self, client):
        resp = client.post("/api/incidents", json={"type": "FLOOD"})
        assert resp.status_code == 422

    def test_patch_updates_status_and_severity(self, client):
        created = client.post("/api/incidents", json=self.NEW).json()
        resp = client.patch(
            f"/api/incidents/{created['id']}", json={"status": "RESOLVED", "severity": "LOW"}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "RESOLVED"
        assert body["severity"] == "LOW"
        assert body["id"] == created["id"]

    def test_patch_unknown_is_404(self, client):
        resp = client.patch("/api/incidents/999999", json={"status": "RESOLVED"})
        assert resp.status_code == 404

    def test_severity_filter(self, client):
        resp = client.get("/api/incidents", params={"severity": "CRITICAL"})
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert items
        assert all(i["severity"] == "CRITICAL" for i in items)

    def test_status_filter(self, client):
        resp = client.get("/api/incidents", params={"status": "OPEN"})
        assert resp.status_code == 200
        assert all(i["status"] == "OPEN" for i in resp.json()["items"])

    def test_search_filter(self, client):
        resp = client.get("/api/incidents", params={"search": "landslide"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"]
        assert all(
            "landslide" in (i["description"] + i["type"] + i["location_name"]).lower()
            for i in body["items"]
        )

    def test_pagination(self, client):
        resp = client.get("/api/incidents", params={"page": 1, "page_size": 5})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) <= 5
        resp2 = client.get("/api/incidents", params={"page": 2, "page_size": 5})
        assert resp2.status_code == 200
        ids_page1 = {i["id"] for i in body["items"]}
        ids_page2 = {i["id"] for i in resp2.json()["items"]}
        assert ids_page1.isdisjoint(ids_page2)


# -------------------------------------------------------------- thresholds

class TestThresholds:
    VALID_BANDS = {
        "thresholds": {
            "low": {"min": 0, "max": 24},
            "moderate": {"min": 25, "max": 49},
            "high": {"min": 50, "max": 69},
            "very_high": {"min": 70, "max": 84},
            "critical": {"min": 85, "max": 100},
        }
    }

    def test_get_thresholds_shape(self, client):
        resp = client.get("/api/alerts/thresholds")
        assert resp.status_code == 200
        body = resp.json()
        assert set(body["thresholds"]) == {
            "low", "moderate", "high", "very_high", "critical"
        }
        assert body["levels"] == ["LOW", "MODERATE", "HIGH", "VERY_HIGH", "CRITICAL"]

    def test_out_of_range_rejected_400(self, client):
        resp = client.put(
            "/api/alerts/thresholds",
            json={
                "thresholds": {
                    "low": {"min": 0, "max": 24},
                    "moderate": {"min": 25, "max": 49},
                    "high": {"min": 50, "max": 150},   # > 100
                    "very_high": {"min": 70, "max": 84},
                    "critical": {"min": 85, "max": 100},
                }
            },
        )
        assert resp.status_code == 400
        assert "detail" in resp.json()

    def test_negative_min_rejected_400(self, client):
        resp = client.put(
            "/api/alerts/thresholds",
            json={
                "thresholds": {
                    "low": {"min": -10, "max": 24},
                    "moderate": {"min": 25, "max": 49},
                    "high": {"min": 50, "max": 69},
                    "very_high": {"min": 70, "max": 84},
                    "critical": {"min": 85, "max": 100},
                }
            },
        )
        assert resp.status_code == 400

    def test_gap_rejected_400(self, client):
        resp = client.put(
            "/api/alerts/thresholds",
            json={
                "thresholds": {
                    "low": {"min": 0, "max": 24},
                    "moderate": {"min": 30, "max": 49},  # gap 25-29
                    "high": {"min": 50, "max": 69},
                    "very_high": {"min": 70, "max": 84},
                    "critical": {"min": 85, "max": 100},
                }
            },
        )
        assert resp.status_code == 400

    def test_valid_update_roundtrip(self, client):
        resp = client.put("/api/alerts/thresholds", json=self.VALID_BANDS)
        assert resp.status_code == 200, resp.text
        assert resp.json()["thresholds"]["high"]["max"] == 69
        # restore defaults for other tests
        restore = client.put("/api/alerts/thresholds", json=self.VALID_BANDS)
        assert restore.status_code == 200

    def test_cutoff_shape_accepted(self, client):
        resp = client.put(
            "/api/alerts/thresholds",
            json={"moderate": 25, "high": 50, "very_high": 70, "critical": 85},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["thresholds"]["low"]["max"] == 24


# --------------------------------------------------------------- scenario

class TestScenarioStateMachine:
    def test_full_state_machine(self, client):
        # IDLE
        resp = client.post("/api/scenario", json={"action": "reset"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["state"] == "IDLE"
        assert body["simulation"] is True
        assert body["active"] is False

        # step while IDLE -> 400
        resp = client.post("/api/scenario", json={"action": "step"})
        assert resp.status_code == 400

        # pause while IDLE -> 400
        resp = client.post("/api/scenario", json={"action": "pause"})
        assert resp.status_code == 400

        # IDLE -> RUNNING
        resp = client.post("/api/scenario", json={"action": "start"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["state"] == "RUNNING"
        assert body["started_at"]
        assert body["active"] is True
        assert body["events"], "start should create scenario events"
        assert body["delivery_status"] == "SIMULATED_LOCAL"

        # RUNNING -> PAUSED
        resp = client.post("/api/scenario", json={"action": "pause"})
        assert resp.status_code == 200
        assert resp.json()["state"] == "PAUSED"

        # PAUSED -> RUNNING (resume)
        resp = client.post("/api/scenario", json={"action": "start"})
        assert resp.status_code == 200
        assert resp.json()["state"] == "RUNNING"

        # step advances while running
        before = client.get("/api/scenario").json()["step"]
        resp = client.post("/api/scenario", json={"action": "step"})
        assert resp.status_code == 200
        assert resp.json()["step"] >= before

        # RUNNING -> IDLE
        resp = client.post("/api/scenario", json={"action": "reset"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["state"] == "IDLE"
        assert body["step"] == 0
        assert body["active"] is False

    def test_invalid_action_is_422(self, client):
        resp = client.post("/api/scenario", json={"action": "explode"})
        assert resp.status_code == 422

    def test_alias_routes(self, client):
        assert client.post("/api/scenario/reset").status_code == 200
        assert client.get("/api/scenario/status").status_code == 200

    def test_simulation_alerts_are_flagged(self, client):
        client.post("/api/scenario", json={"action": "reset"})
        client.post("/api/scenario", json={"action": "start"})
        alerts = client.get("/api/alerts").json()["items"]
        sim = [a for a in alerts if a["trigger"] == "scenario_simulation"]
        assert sim, "scenario start should create simulated alerts"
        for a in sim:
            assert a["delivery_status"] == "SIMULATED_LOCAL"
        client.post("/api/scenario", json={"action": "reset"})


# --------------------------------------------------------------- dashboard

class TestDashboard:
    def test_kpis_nonzero(self, client):
        resp = client.get("/api/dashboard")
        assert resp.status_code == 200
        body = resp.json()
        kpis = body["kpis"]
        for key in (
            "monitored_locations",
            "active_alerts",
            "high_risk_locations",
            "critical_incidents",
            "population_at_risk",
        ):
            assert key in kpis, f"missing KPI {key}"
            assert set(kpis[key]) >= {"value", "status", "updated_at", "source"}
        assert kpis["monitored_locations"]["value"] >= 12
        assert kpis["monitored_locations"]["status"] != "DATA UNAVAILABLE"
        assert kpis["population_at_risk"]["value"] not in (None, 0)
        assert isinstance(body["timeline"], list)
        assert body["priority_queue"]
        assert body["generated_at"]

    def test_kpi_statuses_are_known_strings(self, client):
        kpis = client.get("/api/dashboard").json()["kpis"]
        for key, kpi in kpis.items():
            assert kpi["status"] in (
                "OK", "WATCH", "ALERT", "CRITICAL", "DATA UNAVAILABLE"
            ), f"{key} has unexpected status {kpi['status']!r}"


# ------------------------------------------------------------------ alerts

class TestAlerts:
    def test_alerts_shape(self, client):
        resp = client.get("/api/alerts")
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body and "meta" in body
        for item in body["items"]:
            for key in (
                "id", "location_id", "location_name", "risk_level", "risk_score",
                "trigger", "message", "status", "delivery_status", "created_at",
                "updated_at",
            ):
                assert key in item, f"missing {key}"
            assert item["delivery_status"] == "SIMULATED_LOCAL"

    def test_dedup_one_open_alert_per_location_and_level(self, client):
        """Re-running evaluation must not duplicate open alerts."""
        from app.database.db import SessionLocal
        from app.services.alerts import evaluate_alerts

        # run evaluation twice more on top of the bootstrap evaluation
        for _ in range(2):
            with SessionLocal() as db:
                evaluate_alerts(db)

        resp = client.get("/api/alerts", params={"status": "active"})
        assert resp.status_code == 200
        items = resp.json()["items"]
        pairs = [(a["location_id"], a["risk_level"]) for a in items]
        assert len(pairs) == len(set(pairs)), (
            f"duplicate open alerts found: {sorted(p for p in pairs if pairs.count(p) > 1)}"
        )

    def test_status_filter(self, client):
        resp = client.get("/api/alerts", params={"status": "OPEN"})
        assert resp.status_code == 200
        assert all(a["status"] == "OPEN" for a in resp.json()["items"])
        # lowercase/legacy spellings map onto the same storage values
        resp2 = client.get("/api/alerts", params={"status": "active"})
        assert resp2.status_code == 200
        assert all(a["status"] == "OPEN" for a in resp2.json()["items"])

    def test_level_filter(self, client):
        resp = client.get("/api/alerts", params={"level": "CRITICAL"})
        assert resp.status_code == 200
        assert all(a["risk_level"] == "CRITICAL" for a in resp.json()["items"])

    def test_acknowledge(self, client):
        items = client.get("/api/alerts", params={"status": "OPEN"}).json()["items"]
        if not items:
            pytest.skip("no alerts to acknowledge")
        alert_id = items[0]["id"]
        resp = client.post(f"/api/alerts/{alert_id}/ack",
                           json={"acknowledged_by": "qa"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "ACKNOWLEDGED"

    def test_patch_status_open_to_acknowledged(self, client):
        """Frontend flow: PATCH /api/alerts/{id} {status: 'ACKNOWLEDGED'}."""
        items = client.get("/api/alerts", params={"status": "OPEN"}).json()["items"]
        if not items:
            pytest.skip("no open alerts")
        resp = client.patch(
            f"/api/alerts/{items[0]['id']}", json={"status": "ACKNOWLEDGED"}
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "ACKNOWLEDGED"
        assert body["acknowledged_by"]
        # it no longer appears in the OPEN filter
        again = client.get("/api/alerts", params={"status": "OPEN"}).json()["items"]
        assert all(a["id"] != body["id"] for a in again)

    def test_patch_invalid_status_is_422(self, client):
        items = client.get("/api/alerts").json()["items"]
        if not items:
            pytest.skip("no alerts")
        resp = client.patch(
            f"/api/alerts/{items[0]['id']}", json={"status": "NONSENSE"}
        )
        assert resp.status_code == 422

    def test_ack_unknown_is_404(self, client):
        resp = client.post("/api/alerts/999999/ack")
        assert resp.status_code == 404

    def test_dispatch_creates_simulated_alert_and_broadcasts(self, client):
        from app.events import broker

        before = client.get("/api/alerts").json()["items"]
        resp = client.post("/api/alerts/dispatch", json={"source": "manual_dispatch"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # honesty contract: manual dispatch is stored, labelled and simulated
        assert body["delivery_status"] == "SIMULATED_LOCAL"
        assert body["simulation"] is True
        assert body["risk_level"]
        assert body["message"]

        after = client.get("/api/alerts").json()["items"]
        assert len(after) == len(before) + 1
        assert any(a["id"] == body["id"] for a in after)

        # it reaches the real-time stream as an alert_created event
        events = broker.history_since(0)
        assert any(
            e["type"] == "alert_created" and e["data"].get("id") == body["id"]
            for e in events
        )

    def test_dispatch_accepts_location_name_and_level(self, client):
        first = client.post("/api/alerts/dispatch", json={}).json()
        name = first["location_name"]
        assert name
        resp = client.post(
            "/api/alerts/dispatch",
            json={"location_name": name, "risk_level": "CRITICAL"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["location_name"] == name
        assert resp.json()["risk_level"] == "CRITICAL"

    def test_dispatch_with_empty_body(self, client):
        resp = client.post("/api/alerts/dispatch")
        assert resp.status_code == 200, resp.text
        assert resp.json()["simulation"] is True


# ------------------------------------------------------------------ export

class TestExport:
    DATASETS = ("locations", "incidents", "alerts", "analytics")

    @pytest.mark.parametrize("dataset", DATASETS)
    def test_csv_download_with_header(self, client, dataset):
        resp = client.get(
            "/api/export", params={"dataset": dataset, "format": "csv"}
        )
        assert resp.status_code == 200, resp.text
        assert "attachment" in resp.headers.get("content-disposition", "")
        assert "text/csv" in resp.headers.get("content-type", "")
        rows = list(csv.reader(io.StringIO(resp.text)))
        assert rows, "CSV has no rows"
        header = rows[0]
        assert header, "CSV header is empty"
        # tabular datasets need several columns; analytics is a metric/value summary
        min_cols = 2 if dataset == "analytics" else 3
        assert len(header) >= min_cols, f"header too short: {header}"
        # real data rows, not just a header
        assert len(rows) > 1, "CSV has header but no data rows"

    def test_csv_incidents_header_fields(self, client):
        resp = client.get(
            "/api/export", params={"dataset": "incidents", "format": "csv"}
        )
        header = next(csv.reader(io.StringIO(resp.text)))
        assert "public_id" in header
        assert "severity" in header

    def test_json_format(self, client):
        resp = client.get(
            "/api/export", params={"dataset": "locations", "format": "json"}
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), (list, dict))

    def test_unknown_dataset_is_400(self, client):
        resp = client.get(
            "/api/export", params={"dataset": "nope", "format": "csv"}
        )
        assert resp.status_code == 400


# -------------------------------------------------- read endpoints contract

class TestReadEndpoints:
    @pytest.mark.parametrize("path", [
        "/api/health",
        "/api/status",
        "/api/dashboard",
        "/api/locations",
        "/api/risk-map",
        "/api/incidents",
        "/api/alerts",
        "/api/alerts/thresholds",
        "/api/analytics",
        "/api/temporal",
        "/api/models",
        "/api/pipeline",
        "/api/settings",
        "/api/corridors",
        "/api/infrastructure",
        "/api/scenario",
    ])
    def test_public_reads_are_open(self, client, path):
        resp = client.get(path)
        assert resp.status_code == 200, f"{path} -> {resp.status_code}: {resp.text[:200]}"

    def test_locations_array_shape(self, client, sample_location):
        for key in (
            "id", "name", "state", "district", "latitude", "longitude",
            "elevation_m", "slope_deg", "land_cover", "population", "risk_score",
            "risk_level", "status", "assessed_at",
        ):
            assert key in sample_location, f"missing {key}"
        assert sample_location["risk_level"] in (
            "LOW", "MODERATE", "HIGH", "VERY_HIGH", "CRITICAL"
        )

    def test_risk_map_legend_colors(self, client):
        body = client.get("/api/risk-map").json()
        colors = {row["level"]: row["color"] for row in body["legend"]}
        assert colors["LOW"] == "#22c55e"
        assert colors["CRITICAL"] == "#dc2626"
        assert body["features"]
        assert "meta" in body

    def test_models_metrics_are_null(self, client):
        models = client.get("/api/models").json()["models"]
        assert models
        for model in models:
            assert model["metrics"] is None, (
                "unmeasured metrics must be null so the UI can show NOT AVAILABLE"
            )
            assert model["notes"]

    def test_weather_meta_honesty(self, client, sample_location):
        resp = client.get(
            "/api/weather", params={"location_id": sample_location["id"]}
        )
        assert resp.status_code == 200
        meta = resp.json()["meta"]
        assert meta["source_status"] in ("LIVE", "STALE", "UNAVAILABLE", "DEMO")
        assert meta["last_updated"]

    def test_health_checks_present(self, client):
        body = client.get("/api/health").json()
        assert body["status"] in ("healthy", "degraded")
        for name in ("api", "database", "weather_provider", "ml_engine",
                     "alert_service", "worker"):
            assert name in body["checks"]
            assert body["checks"][name]["status"] in ("ONLINE", "DEGRADED", "OFFLINE")

    def test_risk_detail_shape(self, client, sample_location):
        body = client.get(f"/api/risk/{sample_location['id']}").json()
        assert set(body) >= {"location", "current", "history"}
        current = body["current"]
        assert set(current) >= {
            "risk_score", "risk_level", "confidence", "model_version",
            "assessed_at", "contributions",
        }
        assert current["contributions"]
        assert {"feature", "value", "contribution"} <= set(
            current["contributions"][0]
        )

    def test_scenario_get_shape(self, client):
        body = client.get("/api/scenario").json()
        assert set(body) >= {"state", "started_at", "step", "events", "simulation"}
        assert body["state"] in ("IDLE", "RUNNING", "PAUSED")
