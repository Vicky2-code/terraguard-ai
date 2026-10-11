import { Database, RefreshCw, Server } from "lucide-react";
import { btnGhost, DataState, PageHeader, Panel, SourceStrip, StatusPill } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { formatDateTime, timeAgo } from "../hooks/useClock";
import { getJSON } from "../lib/api";
import type { HealthResponse, PipelineResponse } from "../lib/types";

const STATUS_TONE: Record<string, string> = {
  ONLINE: "text-emerald-400 border-emerald-700",
  DEGRADED: "text-amber-400 border-amber-700",
  OFFLINE: "text-red-400 border-red-700",
  OK: "text-emerald-400 border-emerald-700",
  HEALTHY: "text-emerald-400 border-emerald-700",
  DEGRADED2: "text-amber-400 border-amber-700",
  SUCCESS: "text-emerald-400 border-emerald-700",
  RUNNING: "text-sky-400 border-sky-700",
  FAILED: "text-red-400 border-red-700",
  ERROR: "text-red-400 border-red-700",
  COMPLETED: "text-emerald-400 border-emerald-700",
};

const JOBS = [
  { name: "weather_ingestion", desc: "Pulls live weather (Open-Meteo, MET Norway fallback) into weather tables" },
  { name: "risk_prediction", desc: "Re-scores every location with the prototype engine" },
  { name: "alert_evaluation", desc: "Applies thresholds, dedupes and stores alerts" },
  { name: "health_check", desc: "Probes API, DB, weather provider, ML engine, worker" },
  { name: "data_cleanup", desc: "Prunes stale operational records on schedule" },
];

export default function DataPipeline() {
  const pipeline = useApi<PipelineResponse>(() => getJSON<PipelineResponse>("/api/pipeline"), [], {
    pollMs: 30000,
  });
  const health = useApi<HealthResponse>(() => getJSON<HealthResponse>("/api/health"), [], {
    pollMs: 30000,
  });

  const p = pipeline.data;
  const h = health.data;

  return (
    <div>
      <PageHeader
        title="Data Pipeline"
        subtitle="SCHEDULED JOBS, INGESTION COMPONENTS AND SERVICE HEALTH"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => {
                pipeline.refetch();
                health.refetch();
              }}
              className={btnGhost}
              disabled={pipeline.refreshing || health.refreshing}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${pipeline.refreshing || health.refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        }
        badge={
          h ? (
            <StatusPill status={h.status === "healthy" ? "ONLINE" : "DEGRADED"} className="ml-1" />
          ) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="SCHEDULER JOBS" icon={<Server className="w-3.5 h-3.5" />} bodyClassName="p-0">
          <ul className="divide-y divide-line/60">
            {JOBS.map((j) => {
              const run = (p?.runs ?? []).find((r) => r.job_name === j.name);
              return (
                <li key={j.name} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-slate-200 font-bold">{j.name}</span>
                    <span
                      className={`px-1.5 py-[1px] rounded border text-[9px] font-mono font-bold ${
                        run
                          ? (STATUS_TONE[run.status?.toUpperCase()] ?? "text-slate-400 border-slate-600")
                          : "text-slate-600 border-slate-700"
                      }`}
                    >
                      {run ? run.status : "NO RUNS YET"}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{j.desc}</div>
                  {run && (
                    <div className="text-[9px] font-mono text-slate-600 mt-1">
                      STARTED {formatDateTime(run.started_at)}
                      {run.finished_at && ` → FINISHED ${formatDateTime(run.finished_at)}`}
                      {run.message && ` · ${run.message}`}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <SourceStrip meta={p?.meta ?? null} />
        </Panel>

        <Panel title="INGESTION COMPONENTS" icon={<Database className="w-3.5 h-3.5" />} bodyClassName="p-0">
          <DataState
            loading={pipeline.loading}
            error={pipeline.error}
            empty={!pipeline.loading && (p?.components.length ?? 0) === 0}
            onRetry={pipeline.refetch}
            loadingLabel="PROBING COMPONENTS…"
            emptyLabel="NO COMPONENTS REPORTED"
          >
            <ul className="divide-y divide-line/60">
              {(p?.components ?? []).map((c) => (
                <li key={c.name} className="px-3 py-2.5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-slate-200">{c.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{c.detail}</div>
                    <div className="text-[9px] font-mono text-slate-600">
                      CHECKED {timeAgo(c.last_checked)} AGO
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-1.5 py-[1px] rounded border text-[9px] font-mono font-bold ${
                      STATUS_TONE[c.status] ?? "text-slate-400 border-slate-600"
                    }`}
                  >
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          </DataState>
          <SourceStrip meta={p?.meta ?? null} />
        </Panel>

        <Panel title="SERVICE HEALTH (/api/health)" icon={<Server className="w-3.5 h-3.5" />} bodyClassName="p-0">
          <DataState
            loading={health.loading}
            error={health.error}
            empty={!health.loading && !h}
            onRetry={health.refetch}
            loadingLabel="CHECKING SERVICES…"
            emptyLabel="NO HEALTH DATA"
          >
            <div className="px-3 py-2 border-b border-line flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400">OVERALL</span>
              <span className="flex items-center gap-2">
                <StatusPill status={h?.status === "healthy" ? "ONLINE" : "DEGRADED"} />
                <span className="text-[10px] font-mono text-slate-500">v{h?.version ?? "—"}</span>
              </span>
            </div>
            <ul className="divide-y divide-line/60">
              {h &&
                Object.entries(h.checks).map(([name, check]) => (
                  <li key={name} className="px-3 py-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-slate-200">{name}</div>
                      <div className="text-[10px] text-slate-500 break-words">{check.detail}</div>
                      <div className="text-[9px] font-mono text-slate-600">
                        {formatDateTime(check.last_checked)}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 px-1.5 py-[1px] rounded border text-[9px] font-mono font-bold ${
                        STATUS_TONE[check.status] ?? "text-slate-400 border-slate-600"
                      }`}
                    >
                      {check.status}
                    </span>
                  </li>
                ))}
            </ul>
          </DataState>
          <SourceStrip
            meta={
              h
                ? {
                    source: "FastAPI health probes",
                    source_status: h.status === "healthy" ? "LIVE" : "STALE",
                    last_updated: h.timestamp,
                    data_age_seconds: Math.max(0, (Date.now() - Date.parse(h.timestamp)) / 1000),
                  }
                : null
            }
          />
        </Panel>
      </div>
    </div>
  );
}
