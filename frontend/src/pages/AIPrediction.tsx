import { useState } from "react";
import { Activity, Cpu, Play } from "lucide-react";
import {
  btnGhost,
  btnPrimary,
  Field,
  inputCls,
  KpiCard,
  Notice,
  PageHeader,
  Panel,
  RiskBadge,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import { postJSON, getJSON } from "../lib/api";
import type { PredictResponse, RiskMapResponse, ModelInfo } from "../lib/types";

const DEFAULTS = { rainfall: 95, soil_moisture: 72, slope: 34, elevation: 1650 };

export default function AIPrediction() {
  const [form, setForm] = useState(DEFAULTS);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // reference locations so the analyst can prefill from a real zone
  const locations = useApi<RiskMapResponse>(() => getJSON<RiskMapResponse>("/api/risk-map"), []);

  const models = useApi<{ models: ModelInfo[] } | ModelInfo[]>(
    () => getJSON<{ models: ModelInfo[] } | ModelInfo[]>("/api/models"),
    [],
  );

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await postJSON<PredictResponse>("/api/predict", {
        rainfall: Number(form.rainfall),
        soil_moisture: Number(form.soil_moisture),
        slope: Number(form.slope),
        elevation: Number(form.elevation),
      });
      setResult(res);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "prediction request failed");
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof DEFAULTS) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const maxAbs = result
    ? Math.max(1, ...result.feature_contributions.map((c) => Math.abs(c.contribution)))
    : 1;

  return (
    <div>
      <PageHeader
        title="AI Prediction"
        subtitle="PROTOTYPE SCORING ENGINE · POST /api/predict · EXPLAINABLE FEATURE CONTRIBUTIONS"
      />

      <Notice tone="amber" title="PROTOTYPE MODEL">
        This is a deterministic weighted heuristic for demonstration. It has not been trained or
        validated on labelled data. Accuracy metrics are NOT AVAILABLE — see Model Governance.
      </Notice>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* input form */}
        <Panel title="FEATURE INPUTS" icon={<Cpu className="w-3.5 h-3.5" />}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                className={inputCls}
                defaultValue=""
                onChange={(e) => {
                  const loc = locations.data?.features.find(
                    (f) => String(f.id) === e.target.value,
                  );
                  if (loc) {
                    setForm({
                      rainfall: Math.round(loc.rainfall_mm_24h ?? 60),
                      soil_moisture: Math.round(loc.soil_moisture ?? 50),
                      slope: Math.round(loc.slope_deg ?? 30),
                      elevation: Math.round(loc.elevation_m ?? 1200),
                    });
                  }
                }}
              >
                <option value="">PREFILL FROM A MONITORED LOCATION…</option>
                {(locations.data?.features ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.state})
                  </option>
                ))}
              </select>
            </div>

            <Field label="RAINFALL (mm / 24h)" hint="0–500 mm">
              <input
                type="number"
                min={0}
                max={500}
                className={inputCls}
                value={form.rainfall}
                onChange={set("rainfall")}
              />
            </Field>
            <Field label="SOIL MOISTURE (%)" hint="0–100">
              <input
                type="number"
                min={0}
                max={100}
                className={inputCls}
                value={form.soil_moisture}
                onChange={set("soil_moisture")}
              />
            </Field>
            <Field label="SLOPE (degrees)" hint="0–60">
              <input
                type="number"
                min={0}
                max={60}
                className={inputCls}
                value={form.slope}
                onChange={set("slope")}
              />
            </Field>
            <Field label="ELEVATION (m)" hint="0–7000">
              <input
                type="number"
                min={0}
                max={7000}
                className={inputCls}
                value={form.elevation}
                onChange={set("elevation")}
              />
            </Field>

            <button onClick={() => void run()} disabled={busy} className={btnPrimary + " w-full"}>
              <Play className="w-3.5 h-3.5" /> {busy ? "SCORING…" : "RUN PREDICTION"}
            </button>
            <button
              onClick={() => {
                setForm(DEFAULTS);
                setResult(null);
                setError(null);
              }}
              className={btnGhost + " w-full"}
            >
              Reset inputs
            </button>
            {error && (
              <div className="text-[11px] font-mono text-red-400 border border-red-800/60 bg-red-950/30 rounded px-2 py-1.5">
                REQUEST FAILED: {error}
              </div>
            )}
          </div>
        </Panel>

        {/* result */}
        <Panel
          title="PREDICTION OUTPUT"
          icon={<Activity className="w-3.5 h-3.5" />}
          actions={
            result && (
              <span className="text-[9px] font-mono text-slate-500">
                {result.latency_ms != null ? `${result.latency_ms}ms` : ""}
              </span>
            )
          }
        >
          {!result && !error && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-500 font-mono text-[11px]">
              <Activity className="w-6 h-6 text-slate-600" />
              <span className="tracking-widest">AWAITING INPUT — RUN PREDICTION</span>
            </div>
          )}
          {result && (
            <div className="space-y-3">
              <div className="rounded border border-line bg-panel2 p-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                    Risk score
                  </div>
                  <div className="text-4xl font-black font-mono text-slate-100 tabular-nums">
                    {result.risk_score}
                    <span className="text-sm text-slate-500">/100</span>
                  </div>
                </div>
                <div className="text-right space-y-1.5">
                  <RiskBadge level={result.risk_level} />
                  <div className="text-[10px] font-mono text-slate-500">
                    CONFIDENCE:{" "}
                    <span className="text-slate-300">
                      {result.confidence != null ? `${Math.round(result.confidence * 100)}%` : "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="rounded border border-line bg-panel2 px-2 py-1.5">
                  <div className="text-slate-500">MODEL VERSION</div>
                  <div className="text-slate-200">{result.model_version}</div>
                </div>
                <div className="rounded border border-line bg-panel2 px-2 py-1.5">
                  <div className="text-slate-500">MODEL STATUS</div>
                  <div className="text-amber-400 font-bold">{result.model_status}</div>
                </div>
                <div className="rounded border border-line bg-panel2 px-2 py-1.5 col-span-2">
                  <div className="text-slate-500">TIMESTAMP</div>
                  <div className="text-slate-200">{result.timestamp}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Feature contributions
                </div>
                <div className="space-y-1.5">
                  {result.feature_contributions.map((c) => {
                    const pct = (Math.abs(c.contribution) / maxAbs) * 100;
                    const pos = c.contribution >= 0;
                    return (
                      <div key={c.feature} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 text-[10px] font-mono text-slate-400 truncate">
                          {c.feature}
                        </span>
                        <div className="flex-1 h-3 bg-panel2 rounded overflow-hidden relative">
                          <div
                            className={`h-full ${pos ? "bg-red-500/70" : "bg-emerald-500/70"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span
                          className={`w-12 text-right text-[10px] font-mono tabular-nums ${
                            pos ? "text-red-400" : "text-emerald-400"
                          }`}
                        >
                          {c.contribution > 0 ? "+" : ""}
                          {c.contribution.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Panel>

        {/* model registry + honest metrics */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <KpiCard
              label="MODEL STATUS"
              tone="amber"
              icon={<Cpu className="w-4 h-4" />}
              loading={models.loading}
              value={<span className="text-lg">PROTOTYPE</span>}
              sub="HEURISTIC — NOT A TRAINED ML MODEL"
            />
            <KpiCard
              label="VALIDATED ACCURACY"
              tone="red"
              icon={<Activity className="w-4 h-4" />}
              loading={models.loading}
              value={<span className="text-sm font-bold">NOT AVAILABLE</span>}
              sub={
                models.error
                  ? "/api/models UNREACHABLE"
                  : "NO EVALUATION DATASET — NO METRIC CLAIMED"
              }
            />
          </div>
          <Panel title="SCORING PIPELINE" icon={<Cpu className="w-3.5 h-3.5" />}>
            <ol className="space-y-2 text-[11px] font-mono text-slate-400 list-decimal list-inside">
              <li>Inputs validated &amp; clamped to physical ranges</li>
              <li>Weighted features: rainfall, soil, slope, elevation</li>
              <li>Non-linear amplification for compounding drivers</li>
              <li>Score banded into 5 risk levels (configurable)</li>
              <li>Per-feature contributions returned for explainability</li>
            </ol>
            <div className="mt-3 text-[10px] text-slate-600 font-mono">
              Source code: backend/app/prediction_engine.py
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
