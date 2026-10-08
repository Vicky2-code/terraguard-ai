import { useState } from "react";
import {
  CartesianGrid,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { Table2 } from "lucide-react";
import {
  DataState,
  PageHeader,
  Panel,
  SourceStrip,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import { getJSON } from "../lib/api";
import type { AnalyticsResponse, TemporalResponse } from "../lib/types";

const RANGES = ["24h", "7d", "30d"] as const;
const AXIS = { stroke: "#475569", fontSize: 10, fontFamily: "ui-monospace, monospace" };
const GRID = { stroke: "#1b2b4b", strokeDasharray: "3 3" };
const TOOLTIP_STYLE = {
  background: "#0e172a",
  border: "1px solid #1b2b4b",
  borderRadius: 6,
  fontSize: 11,
  fontFamily: "ui-monospace, monospace",
  color: "#e2e8f0",
};

/** Executive-style analytics report: KPI table + trend charts, one range switch. */
export default function AnalyticsReports() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("7d");

  const analytics = useApi<AnalyticsResponse>(
    () => getJSON<AnalyticsResponse>(`/api/analytics?range=${range}`),
    [range],
    { pollMs: 120000 },
  );
  const temporal = useApi<TemporalResponse>(
    () => getJSON<TemporalResponse>(`/api/temporal?range=${range}&granularity=day`),
    [range],
    { pollMs: 120000 },
  );

  const a = analytics.data;
  const t = temporal.data;

  const kpiRows: { label: string; value: string | number; unit?: string }[] = a
    ? [
        { label: "Avg response time", value: a.kpis.avg_response_minutes ?? "NOT AVAILABLE", unit: "min" },
        { label: "Alert response time", value: a.kpis.alert_response_minutes ?? "NOT AVAILABLE", unit: "min" },
        { label: "Active alerts", value: a.kpis.active_alerts ?? 0 },
        { label: "Incidents recorded", value: a.kpis.incidents ?? 0 },
        { label: "Regions at elevated risk", value: a.kpis.risk_regions ?? 0 },
        { label: "Regional risk (max)", value: a.regional_risk.length ? Math.max(...a.regional_risk.map((r) => r.risk_score)) : "NOT AVAILABLE", unit: "pts" },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Analytics Reports"
        subtitle={`EXECUTIVE SUMMARY — RANGE ${range.toUpperCase()} · VALUES FROM /api/analytics + /api/temporal`}
        actions={
          <div className="flex rounded border border-line overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider ${
                  range === r ? "bg-sky-600/90 text-white" : "bg-panel2 text-slate-400 hover:text-slate-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="KPI SUMMARY" icon={<Table2 className="w-3.5 h-3.5" />} bodyClassName="p-0">
          <DataState
            loading={analytics.loading}
            error={analytics.error}
            empty={!analytics.loading && kpiRows.length === 0}
            onRetry={analytics.refetch}
            loadingLabel="BUILDING REPORT…"
            emptyLabel="NO KPI DATA"
          >
            <table className="w-full text-[11px] font-mono">
              <tbody>
                {kpiRows.map((row) => (
                  <tr key={row.label} className="border-b border-line/50">
                    <td className="px-3 py-2.5 text-slate-400">{row.label}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={
                          row.value === "NOT AVAILABLE"
                            ? "text-amber-400 text-[10px] font-bold"
                            : "text-slate-100 font-bold tabular-nums"
                        }
                      >
                        {row.value}
                      </span>
                      {row.unit && typeof row.value !== "string" && (
                        <span className="text-slate-600 ml-1">{row.unit}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataState>
          <SourceStrip meta={a?.meta ?? null} />
        </Panel>

        <Panel className="xl:col-span-2" title="RISK & RAINFALL TREND" icon={<Table2 className="w-3.5 h-3.5" />}>
          <DataState
            loading={temporal.loading}
            error={temporal.error}
            empty={!temporal.loading && (t?.risk.length ?? 0) === 0}
            onRetry={temporal.refetch}
            loadingLabel="LOADING TREND…"
            emptyLabel="NO TREND DATA"
          >
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={t?.risk ?? []}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="time" {...AXIS} />
                <YAxis {...AXIS} domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="value" name="Avg risk" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={t?.rainfall ?? []}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="time" {...AXIS} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#1e315633" }} />
                <Bar dataKey="value" name="Rainfall (mm)">
                  {(t?.rainfall ?? []).map((_, i) => (
                    <Cell key={i} fill="#22d3ee" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DataState>
          <SourceStrip meta={t?.meta ?? a?.meta ?? null} />
        </Panel>
      </div>

      <Panel className="mt-4" title="REGIONAL RISK TABLE" icon={<Table2 className="w-3.5 h-3.5" />} bodyClassName="p-0">
        <DataState
          loading={analytics.loading}
          error={analytics.error}
          empty={!analytics.loading && (a?.regional_risk.length ?? 0) === 0}
          onRetry={analytics.refetch}
          loadingLabel="LOADING REGIONS…"
          emptyLabel="NO REGIONAL DATA"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3">
            {(a?.regional_risk ?? []).map((r) => (
              <div key={r.region} className="rounded border border-line bg-panel2 p-2.5">
                <div className="text-[10px] font-mono text-slate-500 truncate">{r.region}</div>
                <div className="flex items-end justify-between">
                  <span className="text-xl font-black font-mono tabular-nums text-slate-100">
                    {r.risk_score}
                  </span>
                  <div className="w-16 h-1.5 bg-ink rounded overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${r.risk_score}%`,
                        backgroundColor:
                          r.risk_score >= 85 ? "#dc2626" : r.risk_score >= 70 ? "#ef4444" : r.risk_score >= 50 ? "#f97316" : r.risk_score >= 25 ? "#eab308" : "#22c55e",
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DataState>
        <SourceStrip meta={a?.meta ?? null} />
      </Panel>
    </div>
  );
}
