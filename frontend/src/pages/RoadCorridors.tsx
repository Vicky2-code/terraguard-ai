import { Route } from "lucide-react";
import { DataState, Notice, PageHeader, Panel, RiskBadge, SourceStrip } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { formatDateTime } from "../hooks/useClock";
import { getJSON } from "../lib/api";
import type { Corridor } from "../lib/types";

const STATUS_TONE: Record<string, string> = {
  OPEN: "text-emerald-400 border-emerald-700",
  BLOCKED: "text-red-400 border-red-700 bg-red-950/40",
  RESTRICTED: "text-amber-400 border-amber-700",
  DETOUR: "text-amber-400 border-amber-700",
};

export default function RoadCorridors() {
  const corridors = useApi<Corridor[]>(() => getJSON<Corridor[]>("/api/corridors"), [], {
    pollMs: 60000,
  });
  const items = corridors.data ?? [];
  const blocked = items.filter((c) => c.status === "BLOCKED").length;

  return (
    <div>
      <PageHeader
        title="Road Corridors"
        subtitle="STRATEGIC ROUTE STATUS FOR RESPONSE LOGISTICS · /api/corridors"
        badge={
          <span className="px-2 py-[2px] rounded bg-red-600/80 text-white text-[10px] font-mono font-bold tabular-nums">
            {corridors.error ? "—" : blocked} BLOCKED
          </span>
        }
      />

      <div className="mb-4">
        <Notice tone="amber" title="DEMO REFERENCE DATA">
          Corridor records are seeded reference data for demonstration — they are not fed from a live
          highway authority feed. Status changes are demo-scoped.
        </Notice>
      </div>

      <Panel title="CORRIDOR STATUS BOARD" icon={<Route className="w-3.5 h-3.5" />} bodyClassName="p-0">
        <DataState
          loading={corridors.loading}
          error={corridors.error}
          empty={!corridors.loading && items.length === 0}
          onRetry={corridors.refetch}
          loadingLabel="LOADING CORRIDORS…"
          emptyLabel="NO CORRIDORS ON RECORD"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
            {items.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-line bg-panel2 p-3 space-y-2 hover:border-emerald-800/60 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12px] font-mono font-bold text-slate-100 truncate">
                      {c.name}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">{c.route}</div>
                  </div>
                  <span
                    className={`shrink-0 px-1.5 py-[1px] rounded border text-[9px] font-mono font-bold ${
                      STATUS_TONE[c.status?.toUpperCase()] ?? "text-slate-400 border-slate-600"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>
                    {c.from} → {c.to}
                  </span>
                  <RiskBadge level={c.risk_level} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                  <div>
                    <span className="text-slate-600">INCIDENTS </span>
                    <span className="text-slate-300">{c.incident_count}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-600">UPDATED </span>
                    <span className="text-slate-300">{formatDateTime(c.last_update)}</span>
                  </div>
                </div>
                {c.blockage && (
                  <div className="text-[10px] font-mono text-red-300 border border-red-800/60 bg-red-950/30 rounded px-2 py-1">
                    {c.blockage}
                  </div>
                )}
                {c.demo && (
                  <div className="text-[9px] font-mono text-purple-400/80 uppercase tracking-wider">
                    Demo record
                  </div>
                )}
              </div>
            ))}
          </div>
        </DataState>
        <SourceStrip
          meta={
            corridors.data
              ? {
                  source: "Seeded reference data (corridors table)",
                  source_status: corridors.error ? "UNAVAILABLE" : "DEMO",
                  last_updated: items[0]?.last_update ?? null,
                  data_age_seconds: items[0]?.last_update
                    ? (Date.now() - Date.parse(items[0].last_update)) / 1000
                    : 0,
                }
              : null
          }
        />
      </Panel>
    </div>
  );
}
