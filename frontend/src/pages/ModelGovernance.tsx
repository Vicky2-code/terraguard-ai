import { ShieldCheck } from "lucide-react";
import { DataState, Notice, PageHeader, Panel, SourceStrip } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { formatDateTime } from "../hooks/useClock";
import { getJSON } from "../lib/api";
import type { ModelInfo } from "../lib/types";

const GOVERNANCE_CHECKS = [
  {
    check: "Model card with version + type",
    status: "PRESENT",
    detail: "Registry records name, version, type and notes for every registered engine.",
  },
  {
    check: "Training dataset provenance",
    status: "NOT AVAILABLE",
    detail: "No labelled training dataset exists for this prototype; dataset_version is null.",
  },
  {
    check: "Offline evaluation metrics",
    status: "NOT AVAILABLE",
    detail: "Accuracy / precision / recall / F1 are null — no evaluation run has been performed.",
  },
  {
    check: "Bias & fairness review",
    status: "NOT AVAILABLE",
    detail: "No fairness audit has been conducted; this is stated rather than implied.",
  },
  {
    check: "Drift monitoring",
    status: "NOT MEASURED",
    detail: "No drift pipeline is deployed; drift_status renders as NOT MEASURED.",
  },
  {
    check: "Human-in-the-loop approval",
    status: "PRESENT",
    detail: "Alerts are advisory; responders acknowledge or resolve them manually.",
  },
  {
    check: "Rollback / version pinning",
    status: "PRESENT",
    detail: "model_version is returned on every prediction so outputs are traceable.",
  },
] as const;

const STATUS_TONE: Record<string, string> = {
  PRESENT: "text-emerald-400 border-emerald-700",
  "NOT AVAILABLE": "text-red-400 border-red-700",
  "NOT MEASURED": "text-amber-400 border-amber-700",
};

export default function ModelGovernance() {
  const models = useApi<{ models: ModelInfo[] } | ModelInfo[]>(
    () => getJSON<{ models: ModelInfo[] } | ModelInfo[]>("/api/models"),
    [],
  );
  const list: ModelInfo[] = Array.isArray(models.data)
    ? models.data
    : ((models.data as { models?: ModelInfo[] })?.models ?? []);

  return (
    <div>
      <PageHeader title="Model Governance" subtitle="REGISTRY, AUDIT STATUS AND HONEST LIMITATIONS" />
      <Notice tone="amber" title="PROTOTYPE DISCLOSURE">
        TerraGuard runs a deterministic heuristic, not a validated ML model. Governance items that
        would require real training/evaluation data are explicitly marked NOT AVAILABLE.
      </Notice>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <Panel title="MODEL REGISTRY" icon={<ShieldCheck className="w-3.5 h-3.5" />}>
          <DataState
            loading={models.loading}
            error={models.error}
            empty={!models.loading && list.length === 0}
            onRetry={models.refetch}
            loadingLabel="LOADING REGISTRY…"
            emptyLabel="NO MODELS REGISTERED"
            emptyHint="GET /api/models returned an empty list."
          >
            <div className="space-y-2">
              {list.map((m) => (
                <div key={`${m.name}-${m.version}`} className="rounded border border-line bg-panel2 p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-mono font-bold text-slate-100">{m.name}</span>
                    <span className="px-1.5 py-[1px] rounded border text-[9px] font-mono font-bold text-amber-400 border-amber-700">
                      {m.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-0.5 text-[10px] font-mono">
                    <span className="text-slate-500">VERSION</span>
                    <span className="text-right text-slate-200">{m.version}</span>
                    <span className="text-slate-500">TYPE</span>
                    <span className="text-right text-slate-200">{m.model_type}</span>
                    <span className="text-slate-500">TRAINED AT</span>
                    <span className={`text-right ${m.trained_at ? "text-slate-200" : "text-red-400"}`}>
                      {m.trained_at ? formatDateTime(m.trained_at) : "NOT AVAILABLE"}
                    </span>
                    <span className="text-slate-500">DATASET VERSION</span>
                    <span className={`text-right ${m.dataset_version ? "text-slate-200" : "text-red-400"}`}>
                      {m.dataset_version ?? "NOT AVAILABLE"}
                    </span>
                    <span className="text-slate-500">DEPLOYED AT</span>
                    <span className="text-right text-slate-200">
                      {m.deployed_at ? formatDateTime(m.deployed_at) : "—"}
                    </span>
                    <span className="text-slate-500">DRIFT</span>
                    <span className="text-right text-amber-400">{m.drift_status ?? "NOT MEASURED"}</span>
                  </div>
                  <div className="border-t border-line pt-1.5">
                    <div className="text-[9px] font-mono font-bold uppercase text-slate-500 mb-1">
                      Metrics
                    </div>
                    {m.metrics ? (
                      <div className="grid grid-cols-3 gap-1">
                        {Object.entries(m.metrics).map(([k, v]) => (
                          <div key={k} className="rounded bg-ink border border-line px-1.5 py-1">
                            <div className="text-[8px] font-mono text-slate-600 uppercase">{k}</div>
                            <div className={`text-[11px] font-mono ${v == null ? "text-red-400" : "text-slate-200"}`}>
                              {v == null ? "N/A" : v}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] font-mono text-red-400">
                        NOT AVAILABLE — NO EVALUATION RUN
                      </div>
                    )}
                  </div>
                  {m.notes && (
                    <div className="text-[10px] text-slate-500 border-t border-line pt-1.5">{m.notes}</div>
                  )}
                </div>
              ))}
            </div>
          </DataState>
          <SourceStrip
            meta={
              models.data
                ? {
                    source: "models registry (GET /api/models)",
                    source_status: models.error ? "UNAVAILABLE" : "LIVE",
                    last_updated: null,
                    data_age_seconds: 0,
                  }
                : null
            }
          />
        </Panel>

        <Panel className="xl:col-span-2" title="GOVERNANCE CHECKLIST" icon={<ShieldCheck className="w-3.5 h-3.5" />} bodyClassName="p-0">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-widest text-slate-500 border-b border-line">
                <th className="px-3 py-2">Control</th>
                <th className="px-3 py-2 w-32">Status</th>
                <th className="px-3 py-2 hidden md:table-cell">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {GOVERNANCE_CHECKS.map((g) => (
                <tr key={g.check} className="border-b border-line/50 align-top">
                  <td className="px-3 py-2.5 text-slate-200">{g.check}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`px-1.5 py-[1px] rounded border text-[9px] font-bold ${
                        STATUS_TONE[g.status] ?? "text-slate-400 border-slate-600"
                      }`}
                    >
                      {g.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 hidden md:table-cell text-[10px] leading-relaxed">
                    {g.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
