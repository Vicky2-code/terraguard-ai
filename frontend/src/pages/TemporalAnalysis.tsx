import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Clock } from "lucide-react";
import { DataState, PageHeader, Panel, SourceStrip } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { getJSON } from "../lib/api";
import type { TemporalResponse } from "../lib/types";

const RANGES = ["24h", "7d", "30d"] as const;
const GRANULARITIES = ["hour", "day", "week"] as const;

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

export default function TemporalAnalysis() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("7d");
  const [granularity, setGranularity] = useState<(typeof GRANULARITIES)[number]>("day");

  const temporal = useApi<TemporalResponse>(
    () => getJSON<TemporalResponse>(`/api/temporal?range=${range}&granularity=${granularity}`),
    [range, granularity],
    { pollMs: 120000 },
  );

  const t = temporal.data;

  const charts: { title: string; key: keyof TemporalResponse; color: string; unit: string }[] = [
    { title: "RAINFALL", key: "rainfall", color: "#22d3ee", unit: "mm" },
    { title: "RISK SCORE (AVG)", key: "risk", color: "#f97316", unit: "pts" },
    { title: "INCIDENTS", key: "incidents", color: "#a855f7", unit: "count" },
    { title: "ALERTS", key: "alerts", color: "#ef4444", unit: "count" },
  ];

  return (
    <div>
      <PageHeader
        title="Temporal Analysis"
        subtitle="TIME-SERIES OF RAINFALL, RISK, INCIDENTS AND ALERTS FROM /api/temporal"
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded border border-line overflow-hidden">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase ${
                    range === r
                      ? "bg-sky-600/90 text-white"
                      : "bg-panel2 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex rounded border border-line overflow-hidden">
              {GRANULARITIES.map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase ${
                    granularity === g
                      ? "bg-purple-600/90 text-white"
                      : "bg-panel2 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <DataState
        loading={temporal.loading}
        error={temporal.error}
        empty={false}
        onRetry={temporal.refetch}
        loadingLabel="LOADING TIME SERIES…"
      >
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {charts.map((c) => {
            const data = (t?.[c.key] ?? []) as { time: string; value: number }[];
            return (
              <Panel
                key={c.title}
                title={`${c.title} — ${granularity.toUpperCase()} BUCKETS (${range})`}
                icon={<Clock className="w-3.5 h-3.5" />}
                actions={
                  <span className="text-[9px] font-mono" style={{ color: c.color }}>
                    {c.unit}
                  </span>
                }
              >
                {data.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 py-10 text-center">
                    <div className="text-[11px] font-mono tracking-widest text-slate-500">
                      NO SERIES DATA
                    </div>
                    <div className="text-[10px] text-slate-600">
                      Backend returned zero buckets for this range/granularity.
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="time" {...AXIS} />
                      <YAxis {...AXIS} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }} />
                      <Line
                        type="monotone"
                        dataKey="value"
                        name={c.title}
                        stroke={c.color}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
                <SourceStrip meta={t?.meta ?? null} />
              </Panel>
            );
          })}
        </div>
      </DataState>
    </div>
  );
}
