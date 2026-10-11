import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import {
  DataState,
  KpiCard,
  PageHeader,
  Panel,
  SourceStrip,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import { getJSON } from "../lib/api";
import type { AnalyticsResponse, RiskMapResponse } from "../lib/types";

const RANGES = ["24h", "7d", "30d"] as const;

const AXIS = { stroke: "#4a6b5a", fontSize: 10, fontFamily: "ui-monospace, monospace" };
const GRID = { stroke: "#16402c", strokeDasharray: "3 3" };
const TOOLTIP_STYLE = {
  background: "#0a2f1e",
  border: "1px solid #16402c",
  borderRadius: 6,
  fontSize: 11,
  fontFamily: "ui-monospace, monospace",
  color: "#e2e8f0",
};

export default function RiskAnalytics() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("7d");
  const analytics = useApi<AnalyticsResponse>(
    () => getJSON<AnalyticsResponse>(`/api/analytics?range=${range}`),
    [range],
    { pollMs: 120000 },
  );
  const map = useApi<RiskMapResponse>(() => getJSON<RiskMapResponse>("/api/risk-map"), []);

  const a = analytics.data;
  const dist = a?.incident_distribution ?? [];
  // risk score distribution across live locations
  const buckets = [
    { band: "0–24", count: 0 },
    { band: "25–49", count: 0 },
    { band: "50–69", count: 0 },
    { band: "70–84", count: 0 },
    { band: "85–100", count: 0 },
  ];
  for (const f of map.data?.features ?? []) {
    const s = f.risk_score;
    if (s < 25) buckets[0].count++;
    else if (s < 50) buckets[1].count++;
    else if (s < 70) buckets[2].count++;
    else if (s < 85) buckets[3].count++;
    else buckets[4].count++;
  }

  return (
    <div>
      <PageHeader
        title="Risk Analytics"
        subtitle="AGGREGATE RISK, INCIDENT AND ALERT ANALYTICS — ALL VALUES FROM /api/analytics"
        actions={
          <div className="flex rounded border border-line overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider transition-colors ${
                  range === r
                    ? "bg-emerald-600/90 text-white"
                    : "bg-panel2 text-slate-400 hover:text-slate-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <KpiCard
          label="AVG RESPONSE"
          tone="green"
          icon={<BarChart3 className="w-4 h-4" />}
          loading={analytics.loading}
          value={
            a?.kpis.avg_response_minutes == null ? (
              <span className="text-sm font-bold">N/A</span>
            ) : (
              `${a.kpis.avg_response_minutes}m`
            )
          }
          sub="MINUTES — NOT TRACKED" 
        />
        <KpiCard
          label="ALERT RESPONSE"
          tone="green"
          icon={<BarChart3 className="w-4 h-4" />}
          loading={analytics.loading}
          value={
            a?.kpis.alert_response_minutes == null ? (
              <span className="text-sm font-bold">N/A</span>
            ) : (
              `${a.kpis.alert_response_minutes}m`
            )
          }
          sub="MINUTES"
        />
        <KpiCard
          label="ACTIVE ALERTS"
          tone="red"
          pulse
          icon={<BarChart3 className="w-4 h-4" />}
          loading={analytics.loading}
          value={a?.kpis.active_alerts ?? "—"}
          sub={`RANGE ${range.toUpperCase()}`}
        />
        <KpiCard
          label="INCIDENTS"
          tone="orange"
          icon={<BarChart3 className="w-4 h-4" />}
          loading={analytics.loading}
          value={a?.kpis.incidents ?? "—"}
          sub={`RANGE ${range.toUpperCase()}`}
        />
        <KpiCard
          label="RISK REGIONS"
          tone="purple"
          icon={<BarChart3 className="w-4 h-4" />}
          loading={analytics.loading}
          value={a?.kpis.risk_regions ?? "—"}
          sub="REGIONS ELEVATED"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="REGIONAL RISK SCORE" icon={<BarChart3 className="w-3.5 h-3.5" />}>
          <DataState
            loading={analytics.loading}
            error={analytics.error}
            empty={!analytics.loading && (a?.regional_risk.length ?? 0) === 0}
            onRetry={analytics.refetch}
            loadingLabel="LOADING ANALYTICS…"
            emptyLabel="NO REGIONAL DATA"
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={a?.regional_risk ?? []}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="region" {...AXIS} interval={0} angle={-25} textAnchor="end" height={55} />
                <YAxis {...AXIS} domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#1d4a3333" }} />
                <Bar dataKey="risk_score" name="Risk score">
                  {(a?.regional_risk ?? []).map((r) => (
                    <Cell
                      key={r.region}
                      fill={
                        r.risk_score >= 85
                          ? "#dc2626"
                          : r.risk_score >= 70
                            ? "#ef4444"
                            : r.risk_score >= 50
                              ? "#f97316"
                              : r.risk_score >= 25
                                ? "#eab308"
                                : "#22c55e"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DataState>
          <SourceStrip meta={a?.meta ?? null} />
        </Panel>

        <Panel title="INCIDENT DISTRIBUTION BY TYPE" icon={<BarChart3 className="w-3.5 h-3.5" />}>
          <DataState
            loading={analytics.loading}
            error={analytics.error}
            empty={!analytics.loading && dist.length === 0}
            onRetry={analytics.refetch}
            loadingLabel="LOADING DISTRIBUTION…"
            emptyLabel="NO INCIDENTS IN RANGE"
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dist}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="type" {...AXIS} interval={0} angle={-25} textAnchor="end" height={55} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#1d4a3333" }} />
                <Legend wrapperStyle={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }} />
                <Bar dataKey="count" name="Incidents" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </DataState>
          <SourceStrip meta={a?.meta ?? null} />
        </Panel>

        <Panel title="ALERT HISTORY" icon={<BarChart3 className="w-3.5 h-3.5" />}>
          <DataState
            loading={analytics.loading}
            error={analytics.error}
            empty={!analytics.loading && (a?.alert_history.length ?? 0) === 0}
            onRetry={analytics.refetch}
            loadingLabel="LOADING ALERT HISTORY…"
            emptyLabel="NO ALERTS IN RANGE"
          >
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={a?.alert_history ?? []}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="time" {...AXIS} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Alerts"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={{ r: 2, fill: "#f97316" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </DataState>
          <SourceStrip meta={a?.meta ?? null} />
        </Panel>

        <Panel title="LIVE RISK SCORE DISTRIBUTION" icon={<BarChart3 className="w-3.5 h-3.5" />}>
          <DataState
            loading={map.loading}
            error={map.error}
            empty={!map.loading && (map.data?.features.length ?? 0) === 0}
            onRetry={map.refetch}
            loadingLabel="LOADING LOCATIONS…"
            emptyLabel="NO LOCATIONS"
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={buckets}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="band" {...AXIS} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#1d4a3333" }} />
                <Bar dataKey="count" name="Locations">
                  {buckets.map((_, i) => (
                    <Cell
                      key={i}
                      fill={["#22c55e", "#eab308", "#f97316", "#ef4444", "#dc2626"][i]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DataState>
          <SourceStrip meta={map.data?.meta ?? null} />
        </Panel>
      </div>
    </div>
  );
}
