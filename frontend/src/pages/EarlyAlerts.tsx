import { useEffect, useState } from "react";
import { BellRing, Check, Filter, Sliders } from "lucide-react";
import {
  btnPrimary,
  DataState,
  EmptyBlock,
  Notice,
  PageHeader,
  Panel,
  RiskBadge,
  SourceStrip,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useLive } from "../hooks/useLive";
import { formatDateTime, timeAgo } from "../hooks/useClock";
import { getJSON, patchJSON, putJSON } from "../lib/api";
import type { Alert, AlertList, SettingsResponse, Thresholds } from "../lib/types";

const BANDS: { key: keyof Thresholds; label: string; range: string }[] = [
  { key: "moderate", label: "MODERATE starts at", range: "25–49" },
  { key: "high", label: "HIGH starts at", range: "50–69" },
  { key: "very_high", label: "VERY HIGH starts at", range: "70–84" },
  { key: "critical", label: "CRITICAL starts at", range: "85–100" },
];

export default function EarlyAlerts() {
  const { version } = useLive();
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [levelFilter, setLevelFilter] = useState("");
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const qs = `?status=${encodeURIComponent(statusFilter)}${levelFilter ? `&level=${encodeURIComponent(levelFilter)}` : ""}`;
  const alerts = useApi<AlertList>(() => getJSON<AlertList>(`/api/alerts${qs}`), [qs, version > 0], {
    pollMs: 20000,
  });

  const settings = useApi<SettingsResponse>(() => getJSON<SettingsResponse>("/api/settings"), []);

  useEffect(() => {
    if (settings.data?.thresholds) setThresholds(settings.data.thresholds);
  }, [settings.data]);

  const ack = async (id: number) => {
    try {
      await patchJSON<Alert>(`/api/alerts/${id}`, { status: "ACKNOWLEDGED" });
      alerts.refetch();
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "acknowledge failed");
    }
  };

  const saveThresholds = async () => {
    if (!thresholds) return;
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      // validate bands are within 0-24 / 25-49 / 50-69 / 70-84 / 85-100 style bounds
      const vals = [thresholds.moderate, thresholds.high, thresholds.very_high, thresholds.critical];
      if (vals.some((v) => v == null || v < 1 || v > 100)) {
        throw new Error("Thresholds must be between 1 and 100");
      }
      if (!(thresholds.moderate < thresholds.high && thresholds.high < thresholds.very_high && thresholds.very_high < thresholds.critical)) {
        throw new Error("Bands must ascend: MODERATE < HIGH < VERY HIGH < CRITICAL");
      }
      // PUT /api/alerts/thresholds returns bands under `thresholds` and flat
      // cutoff numbers under `cutoffs` (see backend routes/alerts.py).
      const updated = await putJSON<{ cutoffs?: Thresholds; thresholds?: Thresholds }>(
        "/api/alerts/thresholds",
        thresholds,
      );
      setThresholds(updated?.cutoffs ?? thresholds);
      setSaveMsg("THRESHOLDS SAVED — evaluation job uses new bands on next run");
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  const counts = (alerts.data?.items ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.risk_level] = (acc[a.risk_level] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Early Alerts"
        subtitle="SERVER-SIDE THRESHOLD ENGINE · DEDUPED PER LOCATION+LEVEL · POSTGRES BACKED"
        badge={
          <span className="px-2 py-[2px] rounded bg-red-600/80 text-white text-[10px] font-mono font-bold tabular-nums">
            {(alerts.data?.items ?? []).length} OPEN
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* alert list */}
        <Panel
          className="lg:col-span-2 xl:col-span-3"
          title="ALERT STREAM"
          icon={<BellRing className="w-3.5 h-3.5" />}
          bodyClassName="p-0"
          actions={
            <div className="flex items-center gap-1.5">
              <select
                className="bg-panel2 border border-line rounded px-2 py-1 text-[10px] font-mono text-slate-300"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                {["OPEN", "ACKNOWLEDGED", "RESOLVED", ""].map((s) => (
                  <option key={s} value={s}>
                    {s === "" ? "ALL STATUS" : s}
                  </option>
                ))}
              </select>
              <select
                className="bg-panel2 border border-line rounded px-2 py-1 text-[10px] font-mono text-slate-300"
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                aria-label="Filter by risk level"
              >
                <option value="">ALL LEVELS</option>
                {["LOW", "MODERATE", "HIGH", "VERY_HIGH", "CRITICAL"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <DataState
            loading={alerts.loading}
            error={alerts.error}
            empty={!alerts.loading && alerts.data?.items.length === 0}
            onRetry={alerts.refetch}
            loadingLabel="LOADING ALERTS…"
            emptyLabel="NO ALERTS MATCH FILTER"
            emptyHint="Adjust filters or wait for the evaluation job to run."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="text-left text-[9px] uppercase tracking-widest text-slate-500 border-b border-line">
                    <th className="px-3 py-2">Level</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2 hidden md:table-cell">Trigger</th>
                    <th className="px-3 py-2 hidden lg:table-cell">Message</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Delivery</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(alerts.data?.items ?? []).map((a) => (
                    <tr key={a.id} className="border-b border-line/50 hover:bg-slate-800/40">
                      <td className="px-3 py-2">
                        <RiskBadge level={a.risk_level} />
                      </td>
                      <td className="px-3 py-2 text-slate-200">{a.location_name}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-300">{a.risk_score}</td>
                      <td className="px-3 py-2 text-slate-500 hidden md:table-cell truncate max-w-[160px]">
                        {a.trigger}
                      </td>
                      <td className="px-3 py-2 text-slate-500 hidden lg:table-cell truncate max-w-[280px]">
                        {a.message}
                      </td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                        {timeAgo(a.created_at)} ago
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-[1px] rounded border text-[9px] font-bold ${
                            a.delivery_status === "SIMULATED_LOCAL"
                              ? "text-purple-400 border-purple-700"
                              : "text-slate-400 border-slate-600"
                          }`}
                        >
                          {a.delivery_status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {a.status === "OPEN" && (
                          <button
                            onClick={() => void ack(a.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-700 text-emerald-400 hover:bg-emerald-950/60 text-[9px] font-bold uppercase"
                          >
                            <Check className="w-3 h-3" /> Ack
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataState>
          <SourceStrip meta={alerts.data?.meta ?? null} />
        </Panel>

        {/* thresholds */}
        <Panel title="ALERT THRESHOLDS" icon={<Sliders className="w-3.5 h-3.5" />}>
          <div className="space-y-3">
            <Notice tone="sky" title="CONFIGURABLE">
              Band edges are validated server-side. LOW occupies everything below the MODERATE edge.
            </Notice>

            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded border border-line bg-panel2 px-2 py-1.5 text-center">
                <div className="text-[9px] font-mono text-slate-500">LOW</div>
                <div className="text-xs font-mono text-emerald-400">0–24</div>
              </div>
              {BANDS.map((b) => (
                <div key={b.key} className="rounded border border-line bg-panel2 px-2 py-1.5">
                  <div className="text-[9px] font-mono text-slate-500 text-center">
                    {b.label.toUpperCase()}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    disabled={!thresholds}
                    className="w-full bg-ink border border-line rounded px-1.5 py-1 text-xs font-mono text-slate-200 text-center tabular-nums focus:border-sky-600 focus:outline-none"
                    value={thresholds ? thresholds[b.key] : ""}
                    onChange={(e) =>
                      setThresholds((t) =>
                        t ? { ...t, [b.key]: Number(e.target.value) } : t,
                      )
                    }
                    aria-label={b.label}
                  />
                  <div className="text-[8px] font-mono text-slate-600 text-center">{b.range}</div>
                </div>
              ))}
            </div>

            <button
              onClick={() => void saveThresholds()}
              disabled={saving || !thresholds}
              className={btnPrimary + " w-full"}
            >
              {saving ? "SAVING…" : "SAVE THRESHOLDS"}
            </button>
            {saveMsg && (
              <div className="text-[10px] font-mono text-emerald-400 border border-emerald-800/60 bg-emerald-950/30 rounded px-2 py-1.5">
                {saveMsg}
              </div>
            )}
            {saveErr && (
              <div className="text-[10px] font-mono text-red-400 border border-red-800/60 bg-red-950/30 rounded px-2 py-1.5">
                {saveErr}
              </div>
            )}

            <div className="border-t border-line pt-2 space-y-1">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                Current distribution
              </div>
              {Object.keys(counts).length === 0 && !alerts.loading && !alerts.error && (
                <EmptyBlock label="NO OPEN ALERTS" />
              )}
              {Object.entries(counts).map(([lvl, n]) => (
                <div key={lvl} className="flex items-center justify-between text-[11px] font-mono">
                  <RiskBadge level={lvl} />
                  <span className="text-slate-300 tabular-nums">{n}</span>
                </div>
              ))}
              {settings.data?.updated_at && (
                <div className="text-[9px] font-mono text-slate-600 pt-1">
                  SETTINGS UPDATED {formatDateTime(settings.data.updated_at)}
                </div>
              )}
            </div>
          </div>
          <SourceStrip meta={settings.data ? {
            source: "system_settings (PostgreSQL)",
            source_status: settings.error ? "UNAVAILABLE" : "LIVE",
            last_updated: settings.data.updated_at ?? null,
            data_age_seconds: settings.data.updated_at
              ? (Date.now() - Date.parse(settings.data.updated_at)) / 1000
              : 0,
          } : null} />
        </Panel>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-slate-600">
        <Filter className="w-3 h-3" />
        NO SMS/EMAIL IS SENT — delivery_status SIMULATED_LOCAL MEANS IN-APP RECORD ONLY
      </div>
    </div>
  );
}
