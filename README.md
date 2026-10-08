# TerraGuard AI — Disaster Response Command Center

Dark, high-density command-center web application for landslide / flood early warning across
Northeast India. Real backend (FastAPI + SQLAlchemy), persistent storage, real-time updates over
SSE with polling fallback, and an explainable **prototype** risk engine.

- **Frontend:** React 19 + TypeScript + Vite + Tailwind v4 + React Leaflet + Recharts (deploy: Vercel)
- **Backend:** FastAPI + SQLAlchemy (SQLite out of the box, Postgres-ready schema) + APScheduler
  background jobs (deploy: any persistent Python host)
- **API contract:** [`docs/api-contract.md`](docs/api-contract.md) — single source of truth

---

## Quick start (local)

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The first boot seeds ~45 Northeast India locations, road corridors, critical infrastructure,
incidents and demo users (idempotent).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — Vite proxies `/api` to `http://127.0.0.1:8000`.

```bash
npm run build     # type-check (tsc -b) + production bundle
npm run lint      # oxlint
```

---

## Demo credentials (JWT auth)

| Role          | Email                      | Password    |
| ------------- | -------------------------- | ----------- |
| ADMIN         | `admin@terraguard.local`   | `admin123`  |
| ANALYST       | `analyst@terraguard.local` | `analyst123`|
| VIEWER        | `viewer@terraguard.local`  | `viewer123` |

Public read endpoints (dashboard, map, incidents, alerts, predict, stream) work **without** login
so evaluators can explore immediately. Signing in unlocks role-aware controls
(e.g. saving Settings requires ADMIN). Sign in on **Settings → Access / Auth**.

---

## Evaluator demo path (5 minutes)

1. **Dashboard** (`/dashboard`) — KPIs stream from `GET /api/dashboard`; live clock, `LIVE` /
   `SYNCED` / `DATA STALE` header states, risk map, timeline, priority queue.
2. **Run Emergency Scenario** (top-right red button) — read the confirmation modal
   (**SIMULATION MODE**, no real notifications), confirm, watch risk changes, alerts and timeline
   events arrive live. Pause / resume / reset from the dashboard banner.
3. **GIS Monitor** — zoom, pan, hover tooltips, filter by 5 risk levels, click markers.
4. **Report Incident** — file an incident; it persists in the database and instantly appears on
   the Dashboard, Field Incidents and the map.
5. **Field Incidents** — search + filter + change a status (PATCH persisted).
6. **Early Alerts** — alert stream, acknowledge alerts, edit thresholds (validated 0–24 /
   25–49 / 50–69 / 70–84 / 85–100 bands).
7. **AI Prediction / Risk Simulator** — run the prototype engine, inspect feature contributions.
8. **Data Pipeline / Model Governance** — health checks, job runs, and honest
   `NOT AVAILABLE` model metrics.

---

## Environment variables

### Frontend (`frontend/.env`)

| Var                | Default | Purpose                                             |
| ------------------ | ------- | --------------------------------------------------- |
| `VITE_API_BASE_URL`| `""`    | Backend base URL. Empty = same-origin (`/api`).     |

No API secrets ever ship in the browser bundle — weather ingestion happens server-side.

### Backend (`backend/.env`)

| Var               | Default                       | Purpose                                    |
| ----------------- | ----------------------------- | ------------------------------------------ |
| `DATABASE_URL`    | `sqlite:///./terraguard.db`   | Any SQLAlchemy URL (Postgres in prod).     |
| `JWT_SECRET`      | dev secret                    | **Change in production.**                  |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60`              | JWT lifetime.                              |
| `CORS_ORIGINS`    | `http://localhost:5173,...`   | Comma-separated allowed origins.           |
| `TERRAGUARD_LIVE_WEATHER` | `1`                | `0` forces deterministic fallback (tests). |
| `WEATHER_TIMEOUT_SECONDS` | `12`               | Open-Meteo request timeout.                |

See `backend/.env.example`.

---

## Live vs. demo data — what is real

| Feature                            | Source                                                        |
| ---------------------------------- | ------------------------------------------------------------- |
| Weather observations & history     | **Live** Open-Meteo, ingested server-side every 15 min        |
| Locations, corridors, infrastructure | Seeded reference dataset (labeled `DEMO` in status strips)  |
| Incidents / alerts / thresholds    | **Real** — persisted in the database, full CRUD via API       |
| Risk scores                        | **PROTOTYPE heuristic** — explainable, never claimed accurate |
| Soil moisture                      | Modelled reanalysis; labeled `DEMO DATA` if unavailable       |
| Radar composite                    | **Not configured** — UI shows `RADAR DATA UNAVAILABLE`        |
| SMS / email delivery               | **Never sent** — `delivery_status: SIMULATED_LOCAL`           |
| Model accuracy / drift metrics     | **NOT AVAILABLE** — shown as null, never fabricated           |

Every module displays `SOURCE / LAST UPDATED / DATA AGE / STATUS`. Every API call renders
loading → success / empty / error + retry states. When a dependency is down the UI says
`DATA UNAVAILABLE` instead of inventing numbers.

---

## Real-time architecture

```
FastAPI → DB (risk + alert jobs) → GET /api/stream (SSE) → React hook
                                   ↘ polling fallback every 15 s if SSE drops
```

Header states: `CONNECTED` (SSE open), `RECONNECTING`, `OFFLINE`, `SYNCED <time>`,
`DATA STALE` (no contact for 90 s). Transport indicator shows `SSE` or `POLL`.

---

## Deployment

- **Frontend → Vercel:** root directory `frontend/` (framework: Vite). Set
  `VITE_API_BASE_URL` in Project Settings → Environment Variables to your backend URL.
  `vercel.json` handles SPA rewrites.
- **Backend → persistent host** (Railway / Render / Fly / VM): run
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, set `DATABASE_URL` to managed Postgres
  and `CORS_ORIGINS` to your Vercel domain.
- **Never** treat `localhost` as the production answer.

---

## Testing

```bash
cd frontend && npm install && npm run build && npm run lint   # must pass
cd backend  && pytest                                          # API contract tests
```

---

## Repository layout

```
backend/app/          FastAPI app, routers, engine, scheduler, models, seeds
frontend/src/
  components/         AppShell, Header, Sidebar, RiskMap, shared UI kit
  hooks/              useApi (load/error/retry), useLive (SSE+poll), useScenario, useClock
  lib/                api client, shared types
  pages/              one file per sidebar module (20 routes)
docs/api-contract.md  API contract
```

## Known limitations

- Prototype engine: no trained model, no accuracy claims, no drift metrics (stated in-product).
- Radar tiles and SMS/email providers are not configured for this deployment.
- Cross-browser realtime verification and Vercel publishing require deployment credentials.
