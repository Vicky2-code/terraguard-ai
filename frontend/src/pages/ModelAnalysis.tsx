import { useState } from "react";
import { Brain, Layers } from "lucide-react";
import {
  btnPrimary,
  DataState,
  Field,
  inputCls,
  KpiCard,
  Notice,
  PageHeader,
  Panel,
  RiskBadge,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import { getJSON, postJSON } from "../lib/api";
import type { ModelInfo, PredictResponse, RiskDetail } from "../lib/types";

export default function ModelAnalysis() {
  const models = useApi<{ models: ModelInfo[] } | ModelInfo[]>(
    () => getJSON<{ models: ModelInfo[] } | ModelInfo[]>("/api/models"),
    [],
  );
  const list: ModelInfo[] = Array.isArray(models.data)
    ? models.data
    : ((models.data as { models?: ModelInfo[] })?.models ?? []);

  const [locationId, setLocationId] = useState("");
  const [detail, setDetail] = useState<RiskDetail | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [predict, setPredict] = useState<PredictResponse | null>(null);
  const [predictErr, setPredictErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadDetail = async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailErr(null);
    try {
      setDetail(await getJSON<RiskDetail>(`/api/risk/${id}`));
    } catch (err) {
      setDetail(null);
      setDetailErr(err instanceof Error ? err.message : "load failed");
    } finally {
      setDetailLoading(false);
    }
  };

  const runPredict = async () => {
    setBusy(true);
    setPredictErr(null);
    try {
      setPredict(
        await postJSON<PredictResponse>("/api/predict", {
          rainfall: 88,
          soil_moisture: 66,
          slope: 32,
          elevation: 1500,
        }),
      );
    } catch (err) {
      setPredict(null);
      setPredictErr(err instanceof Error ? err.message : "predict failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Model Analysis" subtitle="PER-ZONE EXPLAINABILITY, CONTRIBUTIONS AND MODEL REGISTRY" />
      <Notice tone="amber" title="PROTOTYPE MODEL">
        Scoring is a transparent weighted heuristic. No claim of accuracy is made anywhere in this
        platform — unmeasured metrics render as NOT AVAILABLE.
      </Notice>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-4">
        <KpiCard
          label="MODEL"
          tone="sky"
          icon={<Brain className="w-4 h-4" />}
          loading={models.loading}
          value={<span className="text-base">HEURISTIC v1</span>}
          sub="DETERMINISTIC WEIGHTED ENGINE"
        />
        <KpiCard
          label="ACCURACY"
          tone="red"
          icon={<Layers className="w-4 h-4" />}
          loading={models.loading}
          value={<span className="text-sm font-bold">NOT AVAILABLE</span>}
          sub="NO EVALUATION SET"
        />
        <KpiCard
          label="DRIFT STATUS"
          tone="amber"
          icon={<Layers className="w-4 h-4" />}
          loading={models.loading}
          value={<span className="text-sm font-bold">NOT MEASURED</span>}
          sub="NO DRIFT PIPELINE"
        />
        <KpiCard
          label="EXPLAINABILITY"
          tone="green"
          icon={<Brain className="w-4 h-4" />}
          loading={models.loading}
          value={<span className="text-base">PER-FEATURE</span>}
          sub="CONTRIBUTIONS ON EVERY RESPONSE"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* per-location explanation */}
        <Panel title="PER-ZONE EXPLANATION" icon={<Brain className="w-3.5 h-3.5" />}>
          <div className="space-y-3">
            <Field label="SELECT LOCATION">
              <select
                className={inputCls}
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value);
                  void loadDetail(e.target.value);
                }}
              >
                <option value="">— PICK A ZONE —</option>
                {(detail ? [detail.location] : []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
                {(Array.isArray(models.data) ? [] : []).map(() => null)}
              </select>
            </Field>
            {/* location options come from /api/risk-map */}
            <LocationOptions value={locationId} onPick={(id) => {
              setLocationId(id);
              void loadDetail(id);
            }} />

            {detailLoading && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                <div className="w-5 h-5 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                LOADING ZONE DETAIL…
              </div>
            )}
            {detailErr && (
              <div className="text-[11px] font-mono text-red-400 border border-red-800/60 bg-red-950/30 rounded px-2 py-1.5">
                {detailErr}
              </div>
            )}
            {detail && (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded border border-line bg-panel2 px-2.5 py-2">
                  <span className="text-[11px] font-mono text-slate-200">{detail.location.name}</span>
                  <RiskBadge level={detail.current.risk_level} score={detail.current.risk_score} />
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                  <span className="text-slate-500">MODEL</span>
                  <span className="text-right text-slate-200">{detail.current.model_version}</span>
                  <span className="text-slate-500">CONFIDENCE</span>
                  <span className="text-right text-slate-200">
                    {detail.current.confidence != null
                      ? `${Math.round(detail.current.confidence * 100)}%`
                      : "N/A"}
                  </span>
                  <span className="text-slate-500">ASSESSED</span>
                  <span className="text-right text-slate-200">
                    {new Date(detail.current.assessed_at).toLocaleString("en-GB", {
                      timeZone: "Asia/Kolkata",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 pt-1">
                  Contributions
                </div>
                <div className="space-y-1">
                  {detail.current.contributions.map((c) => {
                    const max = Math.max(
                      1,
                      ...detail.current.contributions.map((x) => Math.abs(x.contribution)),
                    );
                    return (
                      <div key={c.feature} className="flex items-center gap-2">
                        <span className="w-24 shrink-0 text-[10px] font-mono text-slate-400 truncate">
                          {c.feature}
                        </span>
                        <span className="w-16 shrink-0 text-[9px] font-mono text-slate-500 truncate">
                          {c.value}
                        </span>
                        <div className="flex-1 h-2.5 bg-panel2 rounded overflow-hidden">
                          <div
                            className={`h-full ${c.contribution >= 0 ? "bg-red-500/70" : "bg-emerald-500/70"}`}
                            style={{
                              width: `${(Math.abs(c.contribution) / max) * 100}%`,
                            }}
                          />
                        </div>
                        <span
                          className={`w-10 text-right text-[10px] font-mono ${
                            c.contribution >= 0 ? "text-red-400" : "text-emerald-400"
                          }`}
                        >
                          {c.contribution.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* sample predict */}
        <Panel title="SAMPLE PREDICTION" icon={<Brain className="w-3.5 h-3.5" />}>
          <div className="space-y-3 text-[11px]">
            <div className="text-slate-400 font-mono leading-relaxed">
              Runs POST /api/predict with a fixed input triple (88mm rain / 66% soil / 32° slope /
              1500m) so outputs are comparable across runs. The engine is deterministic — identical
              inputs always produce identical scores.
            </div>
            <button onClick={() => void runPredict()} disabled={busy} className={btnPrimary + " w-full"}>
              {busy ? "SCORING…" : "RUN SAMPLE PREDICTION"}
            </button>
            {predictErr && (
              <div className="text-red-400 font-mono border border-red-800/60 bg-red-950/30 rounded px-2 py-1.5">
                {predictErr}
              </div>
            )}
            {predict && (
              <div className="rounded border border-line bg-panel2 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black font-mono text-slate-100">
                    {predict.risk_score}
                  </span>
                  <RiskBadge level={predict.risk_level} />
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                  <span className="text-slate-500">VERSION</span>
                  <span className="text-right text-slate-200">{predict.model_version}</span>
                  <span className="text-slate-500">STATUS</span>
                  <span className="text-right text-amber-400">{predict.model_status}</span>
                  <span className="text-slate-500">TIMESTAMP</span>
                  <span className="text-right text-slate-200">{predict.timestamp}</span>
                  <span className="text-slate-500">LATENCY</span>
                  <span className="text-right text-slate-200">
                    {predict.latency_ms != null ? `${predict.latency_ms} ms` : "—"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* registry */}
        <Panel title="MODEL REGISTRY" icon={<Layers className="w-3.5 h-3.5" />}>
          <DataState
            loading={models.loading}
            error={models.error}
            empty={!models.loading && list.length === 0}
            onRetry={models.refetch}
            loadingLabel="LOADING REGISTRY…"
            emptyLabel="NO MODELS REGISTERED"
          >
            <div className="space-y-2">
              {list.map((m) => (
                <div key={`${m.name}-${m.version}`} className="rounded border border-line bg-panel2 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-slate-200">{m.name}</span>
                    <span
                      className={`px-1.5 py-[1px] rounded border text-[9px] font-mono font-bold ${
                        m.status?.toUpperCase() === "ACTIVE"
                          ? "text-emerald-400 border-emerald-700"
                          : "text-amber-400 border-amber-700"
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {m.version} · {m.model_type}
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-1 text-[10px] font-mono">
                    <span className="text-slate-500">TRAINED</span>
                    <span className="text-right text-slate-300">{m.trained_at ?? "NOT AVAILABLE"}</span>
                    <span className="text-slate-500">DRIFT</span>
                    <span className="text-right text-slate-300">{m.drift_status ?? "NOT MEASURED"}</span>
                  </div>
                  <div className="mt-1.5 text-[9px] font-mono text-purple-400 uppercase">
                    Metrics:{" "}
                    {m.metrics
                      ? Object.entries(m.metrics)
                          .map(([k, v]) => `${k}=${v ?? "N/A"}`)
                          .join(" ")
                      : "NOT AVAILABLE"}
                  </div>
                </div>
              ))}
            </div>
          </DataState>
        </Panel>
      </div>
    </div>
  );
}

/** Second selector source: /api/risk-map locations (kept separate to avoid nesting selects). */
function LocationOptions({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const locations = useApi<{ features: { id: number; name: string; state: string }[] }>(
    () => getJSON("/api/risk-map"),
    [],
  );
  return (
    <select className={inputCls} value={value} onChange={(e) => onPick(e.target.value)} aria-label="Zone">
      <option value="">— PICK A ZONE (LIVE LIST) —</option>
      {(locations.data?.features ?? []).map((f) => (
        <option key={f.id} value={f.id}>
          {f.name} ({f.state})
        </option>
      ))}
    </select>
  );
}
