# TerraGuard AI — API Contract (v1)

Single source of truth for backend + frontend. Base URL: `VITE_API_BASE_URL` (default `http://127.0.0.1:8000`).
All endpoints below are prefixed with `/api` unless stated otherwise. All responses are JSON.

## Conventions

- Timestamps: ISO-8601 UTC strings (`2026-10-07T14:30:00Z`).
- Every list response that carries live/measured data includes a `meta` object:
  ```json
  { "source": "Open-Meteo", "source_status": "LIVE|STALE|UNAVAILABLE|DEMO",
    "last_updated": "<iso>", "data_age_seconds": 42, "refresh_interval_seconds": 600 }
  ```
- Risk levels: `LOW | MODERATE | HIGH | VERY_HIGH | CRITICAL` (score bands configurable, defaults 0-24/25-49/50-69/70-84/85-100).
- Errors: `{ "detail": "<human readable>" }` with proper HTTP status. Never return fabricated data;
  when a dependency is down return `source_status: "UNAVAILABLE"` plus last known values flagged `STALE`.

## Auth

- `POST /api/auth/login` body `{email, password}` → `{token, token_type: "bearer", user: {id, name, email, role}}`
- `GET /api/auth/me` (Bearer) → user object
- Roles: `VIEWER < FIELD_OFFICER < ANALYST < ADMIN`. Protected: `PATCH /api/settings`, `POST /api/admin/*`,
  `GET /api/models` mutations. Login required for those; public read endpoints stay open.
- Seed users (documented in README): `admin@terraguard.local / admin123` (ADMIN),
  `analyst@terraguard.local / analyst123` (ANALYST), `viewer@terraguard.local / viewer123` (VIEWER).

## Health / status

- `GET /api/health` → `{status: "healthy|degraded", version, timestamp, checks: {api, database, weather_provider, ml_engine, alert_service, worker}}`
  where each check = `{status: "ONLINE|DEGRADED|OFFLINE", detail, last_checked}`.
- `GET /api/status` → `{system: "LIVE|DEMO", last_sync, uptime_seconds, backend_version, weather_source, demo_mode, connection: {...}}`

## Dashboard

- `GET /api/dashboard` →
  ```json
  {
    "kpis": {
      "monitored_locations": {"value": 12, "status": "OK", "updated_at": "...", "source": "locations table"},
      "active_alerts": {...}, "high_risk_locations": {...},
      "critical_incidents": {...}, "population_at_risk": {...}
    },
    "timeline": [{"id","type","message","location","timestamp","severity"}],
    "priority_queue": [{"id","location","risk_score","population","priority":"P1|P2|P3","reason"}],
    "generated_at": "..."
  }
  ```
  KPIs with no data render as `value: null` + `status: "DATA UNAVAILABLE"` (frontend shows that string).

## Locations / risk map

- `GET /api/locations` → `[{id, name, state, district, latitude, longitude, elevation_m, slope_deg,
  land_cover, population, risk_score, risk_level, rainfall_mm_24h, soil_moisture, status, assessed_at}]`
- `GET /api/risk-map?region=&level=&from=&to=` → `{features: [...same shape as locations...], legend:
  [{level, min, max, color}], regions: [...], meta}` (colors: LOW `#22c55e`, MODERATE `#eab308`,
  HIGH `#f97316`, VERY_HIGH `#ef4444`, CRITICAL `#dc2626`).
- `GET /api/risk/{location_id}` → `{location, current: {risk_score, risk_level, confidence, model_version,
  assessed_at, contributions: [{feature, value, contribution}]}, history: [{assessed_at, risk_score, risk_level}]}`

## Weather & soil

- `GET /api/weather?location_id=` → `{location_id, temperature_c, humidity_pct, wind_kmh, pressure_hpa,
  rainfall_mm_1h, rainfall_mm_6h, rainfall_mm_24h, forecast_24h_mm, observed_at, meta}`. `meta.source`
  names the provider actually used (Open-Meteo, Open-Meteo historical-forecast, or MET Norway) and
  `meta.detail` discloses provider limitations — e.g. MET Norway publishes forecasts only, so its
  rainfall 1h/6h/24h values are short-range forecast sums.
- `GET /api/weather/history?location_id=&hours=24` → `{series: [{time, rainfall_mm, temperature_c}], meta}`
- `GET /api/soil-moisture?location_id=` → `{layers: [{label:"0–7 cm", moisture, saturation_pct, status}],
  trend: [{time, moisture}], observed_at, meta}` — Open-Meteo modelled reanalysis; when unavailable
  `meta.source_status = "DEMO"` and the UI must display DEMO DATA.

## Incidents

- `GET /api/incidents?severity=&status=&region=&search=&from=&to=` → `{items: [...], total, meta}`
  item = `{id, public_id, type, description, location_name, latitude, longitude, severity, status,
  reporter, region, created_at, updated_at}`
- `POST /api/incidents` body `{type, description, location_name, latitude, longitude, severity,
  reporter, region?, image_b64?}` → `201 {public_id, id, created_at, ...}` (public_id like `INC-2026-0042`)
- `PATCH /api/incidents/{id}` body `{status?, severity?, assigned_to?}` → updated item

## Alerts

- `GET /api/alerts?status=&level=` → `{items: [{id, location_id, location_name, risk_level, risk_score,
  trigger, message, status, delivery_status, created_at, updated_at}], meta}`
- Threshold evaluation happens server-side after each risk run; dedupe: one open alert per
  `(location_id, risk_level)` until it resolves. Delivery status is honestly reported
  (`SIMULATED_LOCAL` when no provider configured).

## Prediction

- `POST /api/predict` body `{rainfall, soil_moisture, slope, elevation, land_cover?, recent_rainfall?, temperature?}`
  → `{risk_score, risk_level, model_version, timestamp, confidence, feature_contributions:
  [{feature, contribution}], model_status: "PROTOTYPE"}`.
  Engine is a deterministic weighted scoring engine — must be labelled `PROTOTYPE MODEL`, never "validated".

## Scenario (emergency demo)

- `GET /api/scenario` → `{state: "IDLE|RUNNING|PAUSED", started_at, step, events: [...], simulation: true}`
- `POST /api/scenario` body `{action: "start"|"pause"|"reset"|"step"}` → same shape.
  Starting creates scenario events, boosts risk on affected locations, creates test alerts flagged
  `simulation: true`, and broadcasts over SSE. All alerts generated carry `delivery_status: "SIMULATED_LOCAL"`.

## Analytics / temporal / reports

- `GET /api/analytics?range=24h|7d|30d&region=` → `{kpis: {avg_response_minutes, alert_response_minutes,
  active_alerts, incidents, risk_regions}, regional_risk: [{region, risk_score}], incident_distribution:
  [{type, count}], alert_history: [{time, count}], meta}`
- `GET /api/temporal?range=&granularity=hour|day|week` → `{rainfall: [...], risk: [...], incidents: [...],
  alerts: [...], meta}`
- `GET /api/export?dataset=locations|incidents|alerts|analytics&format=csv|json&from=&to=&region=`
  → file download (Content-Disposition). CSV must be real rows from the DB.

## Governance / pipeline / settings

- `GET /api/models` → `{models: [{name, version, status, trained_at, dataset_version, metrics:
  {accuracy, precision, recall, f1, mae, rmse} | null, deployed_at, drift_status, model_type, notes}]}`
  Unmeasured metrics must be `null` (UI renders NOT AVAILABLE).
- `GET /api/pipeline` → `{components: [{name, status: ONLINE|DEGRADED|OFFLINE, detail, last_checked}],
  runs: [{job_name, status, started_at, finished_at, message}], meta}`
- `GET /api/pipeline/open-meteo-probe?mode=minimal|batch&transport=direct|proxy|historical|met-no` (ADMIN)
  → `{transport, mode, endpoint_host, status_code, ok, elapsed_ms, body_excerpt, checked_at}`.
  Server-side diagnostics: can THIS backend host reach each provider in the weather chain right now
  (returns the upstream status + body excerpt so rate-limit messages are visible). `direct` =
  api.open-meteo.com, `proxy` = OPENMETEO_PROXY_BASE_URL, `historical` = the Open-Meteo
  historical-forecast host, `met-no` = MET Norway (single location, ignores `mode`).
- `GET /api/settings` → `{thresholds: {critical, very_high, high, moderate}, region, language,
  refresh_interval_seconds, notifications: {...}, updated_at}`
- `PATCH /api/settings` (ADMIN) → updated settings (persisted in `system_settings` table).

## Corridors & infrastructure

- `GET /api/corridors` → `[{id, name, route, from, to, status, risk_level, blockage, incident_count,
  last_update, demo: true}]` — must be flagged as demo/reference route data.
- `GET /api/infrastructure` → `[{id, name, type, region, latitude, longitude, criticality, status, risk_score}]`

## Real-time transport

- `GET /api/stream` — SSE. Events: `heartbeat` (15s), `risk_update`, `alert_created`, `incident_created`,
  `scenario_step`, `pipeline_status`, `settings_changed`. Payload: `{type, data, ts}`.
- Frontend falls back to polling (`/api/status` + data endpoints) when SSE fails; UI states:
  `CONNECTED | RECONNECTING | OFFLINE`.

## Seed data

12 Northeast India locations (Gangtok, Mangan, Aizawl, Lunglei, Shillong, Jowai, Kohima, Dimapur,
Imphal, Churachandpur, Itanagar, Pasighat, Agartala... at least 12) with realistic coords/elevation/slope,
5 corridors, 8 infrastructure assets. Seeded on first boot inside `Base.metadata.create_all`.
