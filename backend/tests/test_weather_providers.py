"""Provider-chain and MET Norway mapping tests (pure, never touch the network).

The chain exists because Open-Meteo's free tier is limited per IP and shared
cloud egress ranges are regularly over quota. These tests pin the ordering,
the honest fallback behaviour, and the MET Norway field mapping.
"""

import pytest

from app.services import weather


@pytest.fixture()
def db(client):
    """Session against the throwaway sqlite database seeded by the app."""
    from app.database.db import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def restore_state():
    saved = dict(weather.STATE)
    try:
        yield
    finally:
        weather.STATE.clear()
        weather.STATE.update(saved)


def _entry(hour, temp=20.0, humidity=60.0, wind_ms=3.0, pressure=1010.0, precip=0.0):
    return {
        "time": f"2026-10-11T{hour:02d}:00:00Z",
        "data": {
            "instant": {
                "details": {
                    "air_temperature": temp,
                    "relative_humidity": humidity,
                    "wind_speed": wind_ms,
                    "air_pressure_at_sea_level": pressure,
                }
            },
            "next_1_hours": {"details": {"precipitation_amount": precip}},
        },
    }


# ---------------------------------------------------------------------------
# MET Norway mapping
# ---------------------------------------------------------------------------


def test_met_no_metrics_maps_current_conditions_and_forecast_precipitation():
    series = [_entry(6, temp=21.3, humidity=42.3, wind_ms=2.2, pressure=1019.3, precip=1.0)]
    series += [_entry(hour, precip=0.5) for hour in range(7, 31)]

    metrics = weather.met_no_metrics(series)

    assert metrics["temperature_c"] == 21.3
    assert metrics["humidity_pct"] == 42.3
    assert metrics["pressure_hpa"] == 1019.3
    # MET reports m/s; TerraGuard stores km/h.
    assert metrics["wind_kmh"] == 7.9
    assert metrics["rainfall_mm_1h"] == 1.0
    assert metrics["rainfall_mm_6h"] == 3.5           # 1.0 + 5 x 0.5
    assert metrics["rainfall_mm_24h"] == 12.5         # 1.0 + 23 x 0.5
    assert metrics["forecast_24h_mm"] == 12.0         # entries 1..24
    assert metrics["observed_at"].startswith("2026-10-11T06")


def test_met_no_metrics_splits_longer_blocks_when_1h_is_missing():
    entry = _entry(6, precip=None)
    entry["data"]["next_1_hours"] = None
    entry["data"]["next_6_hours"] = {"details": {"precipitation_amount": 3.0}}

    metrics = weather.met_no_metrics([entry])

    assert metrics["rainfall_mm_1h"] == 0.5           # 3.0 / 6 hours


def test_met_no_metrics_rejects_empty_series():
    with pytest.raises(ValueError):
        weather.met_no_metrics([])


# ---------------------------------------------------------------------------
# Provider chain
# ---------------------------------------------------------------------------


def test_candidates_start_with_open_meteo_and_include_historical_fallback(monkeypatch):
    monkeypatch.setattr(weather.config, "OPENMETEO_PROXY_BASE_URL", "")
    monkeypatch.setattr(weather.config, "WEATHER_FALLBACK_ENABLED", True)

    providers = [provider for provider, _ in weather._forecast_candidates()]

    assert providers == ["open-meteo", "open-meteo-historical"]


def test_chain_falls_back_to_historical_host_when_primary_is_rate_limited(
    db, monkeypatch, restore_state
):
    calls = []

    def fake_ingest(session, url, provider):
        calls.append(provider)
        if provider == "open-meteo":
            raise RuntimeError("429 Too Many Requests")
        return None

    monkeypatch.setattr(weather, "_ingest_open_meteo", fake_ingest)
    monkeypatch.setattr(weather.config, "WEATHER_FALLBACK_ENABLED", True)
    monkeypatch.setattr(
        weather, "_ingest_met_no", lambda session: calls.append("met.no") or True
    )

    assert weather.fetch_open_meteo(db) is True
    assert calls == ["open-meteo", "open-meteo-historical"]
    assert weather.STATE["source"] == "open-meteo-historical"
    assert weather.STATE["ok"] is True
    assert weather.STATE["error"] is None


def test_chain_uses_met_no_only_after_every_open_meteo_host_fails(
    db, monkeypatch, restore_state
):
    calls = []

    def fake_ingest(session, url, provider):
        calls.append(provider)
        raise RuntimeError(f"{provider}: daily limit exceeded")

    def fake_met_no(session):
        calls.append("met.no")
        weather.STATE.update({"ok": True, "source": "met.no", "last_success": weather.utcnow()})
        return True

    monkeypatch.setattr(weather, "_ingest_open_meteo", fake_ingest)
    monkeypatch.setattr(weather, "_ingest_met_no", fake_met_no)
    monkeypatch.setattr(weather.config, "WEATHER_FALLBACK_ENABLED", True)

    assert weather.fetch_open_meteo(db) is True
    assert calls == ["open-meteo", "open-meteo-historical", "met.no"]
    assert weather.STATE["source"] == "met.no"


def test_chain_raises_combined_error_when_all_providers_fail(db, monkeypatch, restore_state):
    def boom(session, url, provider):
        raise RuntimeError(f"{provider} 429")

    monkeypatch.setattr(weather, "_ingest_open_meteo", boom)
    monkeypatch.setattr(
        weather,
        "_ingest_met_no",
        lambda session: (_ for _ in ()).throw(RuntimeError("met.no 503")),
    )
    monkeypatch.setattr(weather.config, "WEATHER_FALLBACK_ENABLED", True)

    with pytest.raises(RuntimeError) as excinfo:
        weather.fetch_open_meteo(db)

    message = str(excinfo.value)
    assert "open-meteo" in message and "open-meteo-historical" in message and "met.no" in message


# ---------------------------------------------------------------------------
# Honest labels
# ---------------------------------------------------------------------------


def test_weather_meta_labels_met_no_and_discloses_forecast_precipitation(restore_state):
    weather.STATE.update(
        {"ok": True, "source": "met.no", "last_success": weather.utcnow(), "error": None}
    )

    meta = weather.weather_meta()

    assert meta["source_status"] == "LIVE"
    assert meta["source"] == "MET Norway (api.met.no)"
    assert meta["data_source"] == "met.no"
    assert "forecast" in meta["detail"].lower()


def test_weather_meta_falls_back_to_simulated_label(restore_state):
    weather.STATE.update({"ok": False, "source": "simulated_fallback", "last_success": None})

    meta = weather.weather_meta()

    assert meta["source_status"] == "DEMO"
    assert meta["source"] == "simulated_fallback"
    assert meta["data_source"] == "simulated_fallback"
