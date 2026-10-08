import { useEffect, useState } from "react";
import { Activity, Play, Sliders } from "lucide-react";
import {
  btnGhost,
  btnPrimary,
  DataState,
  Field,
  Notice,
  PageHeader,
  Panel,
  RiskBadge,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import { getJSON, postJSON } from "../lib/api";
import type { PredictResponse, RiskMapResponse } from "../lib/types";

interface SliderDef {
  key: string;
  label: string;
  min: number;
  max: number;
  unit: string;
}

const SLIDERS: SliderDef[] = [
  { key: "rainfall", label: "RAINFALL", min: 0, max: 400, unit: "mm/24h" },
  { key: "soil_moisture", label: "SOIL MOISTURE", min: 0, max: 100, unit: "%" },
  { key: "slope", label: "SLOPE", min: 0, max: 60, unit: "deg" },
  { key: "elevation", label: "ELEVATION", min: 0, max: 6000, unit: "m" },
];

const PRESETS: { name: string; values: Record<string, number> }[] = [
  { name: "BASELINE", values: { rainfall: 20, soil_moisture: 35, slope: 15, elevation: 900 } },
  { name: "HEAVY RAIN", values: { rainfall: 210, soil_moisture: 78, slope: 30, elevation: 1400 } },
  { name: "EXTREME", values: { rainfall: 340, soil_moisture: 92, slope: 48, elevation: 2300 } },
];

export default function RiskSimulator() {
  const [values, setValues] = useState<Record<string, number>>({ ...PRESETS[0].values });
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const locations = useApi<RiskMapResponse>(() => getJSON<RiskMapResponse>("/api/risk-map"), []);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await postJSON<PredictResponse>("/api/predict", values);
      setResult(res);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "simulation failed");
    } finally {
      setBusy(false);
    }
  };

  // auto-run once on mount so the panel is never dead
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxAbs = result
    ? Math.max(1, ...result.feature_contributions.map((c) => Math.abs(c.contribution)))
    : 1;

  return (
    <div>
      <PageHeader
        title="Risk Simulator"
        subtitle="WHAT-IF SCORING THROUGH THE SAME PROTOTYPE ENGINE AS /api/predict"
      />
      <Notice tone="purple" title="SIMULATION ONLY">
        Adjusting these sliders runs an isolated what-if query. It does not change stored risk scores,
        does not create alerts and does not affect the emergency scenario.
      </Notice>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Panel title="SCENARIO INPUTS" icon={<Sliders className="w-3.5 h-3.5" />}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => {
                    setValues({ ...p.values });
                    setError(null);
                  }}
                  className="px-2 py-1 rounded border border-line bg-panel2 text-[9px] font-mono font-bold tracking-wider text-slate-400 hover:text-sky-300 hover:border-sky-700 uppercase"
                >
                  {p.name}
                </button>
              ))}
            </div>

            {SLIDERS.map((s) => (
              <Field
                key={s.key}
                label={`${s.label} — ${values[s.key]} ${s.unit}`}
              >
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  value={values[s.key]}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [s.key]: Number(e.target.value) }))
                  }
                  className="w-full accent-sky-500"
                />
                <div className="flex justify-between text-[9px] font-mono text-slate-600">
                  <span>{s.min}</span>
                  <span>{s.max}</span>
                </div>
              </Field>
            ))}

            <div className="flex gap-2">
              <button onClick={() => void run()} disabled={busy} className={btnPrimary + " flex-1"}>
                <Play className="w-3.5 h-3.5" /> {busy ? "SCORING…" : "RUN SIMULATION"}
              </button>
              <button
                onClick={() => {
                  setValues({ ...PRESETS[0].values });
                  setResult(null);
                  setError(null);
                }}
                className={btnGhost}
              >
                Reset
              </button>
            </div>

            <div className="border-t border-line pt-3">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Compare with live zones
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {(locations.data?.features ?? [])
                  .slice()
                  .sort((x, y) => y.risk_score - x.risk_score)
                  .slice(0, 8)
                  .map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between text-[10px] font-mono"
                    >
                      <span className="text-slate-400 truncate">{f.name}</span>
                      <span className="flex items-center gap-1.5">
                        <RiskBadge level={f.risk_level} />
                        <span className="text-slate-300 tabular-nums">{f.risk_score}</span>
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="SIMULATION RESULT"
          icon={<Activity className="w-3.5 h-3.5" />}
          actions={
            result && (
              <span className="text-[9px] font-mono text-slate-500">{result.model_version}</span>
            )
          }
        >
          {error && (
            <div className="text-[11px] font-mono text-red-400 border border-red-800/60 bg-red-950/30 rounded px-2.5 py-2 mb-3">
              SIMULATION FAILED: {error}
            </div>
          )}
          {!result && !error && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-500 font-mono text-[11px]">
              <div className="w-7 h-7 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
              <span className="tracking-widest">SCORING…</span>
            </div>
          )}
          {result && (
            <div className="space-y-3">
              <div className="rounded border border-line bg-panel2 p-4 text-center">
                <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                  Simulated risk score
                </div>
                <div
                  className={`text-5xl font-black font-mono tabular-nums my-1 ${
                    result.risk_score >= 85
                      ? "text-red-400"
                      : result.risk_score >= 70
                        ? "text-red-300"
                        : result.risk_score >= 50
                          ? "text-orange-400"
                          : result.risk_score >= 25
                            ? "text-yellow-400"
                            : "text-emerald-400"
                  }`}
                >
                  {result.risk_score}
                </div>
                <RiskBadge level={result.risk_level} />
                <div className="text-[10px] font-mono text-slate-500 mt-2">
                  CONFIDENCE:{" "}
                  {result.confidence != null ? `${Math.round(result.confidence * 100)}%` : "N/A"}
                </div>
              </div>

              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                Contributions
              </div>
              <div className="space-y-1.5">
                {result.feature_contributions.map((c) => (
                  <div key={c.feature} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-[10px] font-mono text-slate-400 truncate">
                      {c.feature}
                    </span>
                    <div className="flex-1 h-3 bg-panel2 rounded overflow-hidden">
                      <div
                        className={`h-full ${c.contribution >= 0 ? "bg-red-500/70" : "bg-emerald-500/70"}`}
                        style={{ width: `${(Math.abs(c.contribution) / maxAbs) * 100}%` }}
                      />
                    </div>
                    <span
                      className={`w-12 text-right text-[10px] font-mono tabular-nums ${
                        c.contribution >= 0 ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {c.contribution > 0 ? "+" : ""}
                      {c.contribution.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="MODEL UNDER TEST" icon={<Activity className="w-3.5 h-3.5" />}>
          <DataState loading={false} error={null}>
            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-slate-500">MODEL</span>
                <span className="text-slate-200">{result?.model_version ?? "—"}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-slate-500">STATUS</span>
                <span className="text-amber-400 font-bold">{result?.model_status ?? "PROTOTYPE"}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-slate-500">KIND</span>
                <span className="text-slate-200">DETERMINISTIC HEURISTIC</span>
              </div>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-slate-500">VALIDATED METRICS</span>
                <span className="text-red-400">NOT AVAILABLE</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">WRITES TO DB</span>
                <span className="text-slate-200">NO (STATELESS)</span>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-slate-600 leading-relaxed">
              The simulator calls the exact same endpoint as the AI Prediction page. Any number it
              shows is a heuristic score, not a validated forecast.
            </div>
          </DataState>
        </Panel>
      </div>
    </div>
  );
}
