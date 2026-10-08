import { useState } from "react";
import { Building2, MapPin } from "lucide-react";
import { DataState, PageHeader, Panel, RiskBadge, SourceStrip } from "../components/ui";
import { RiskMap, RISK_COLORS } from "../components/RiskMap";
import { useApi } from "../hooks/useApi";
import { getJSON } from "../lib/api";
import type { Infrastructure, LocationRec } from "../lib/types";

const CRIT_TONE: Record<string, string> = {
  CRITICAL: "text-red-400 border-red-700 bg-red-950/40",
  HIGH: "text-orange-400 border-orange-700",
  MEDIUM: "text-yellow-400 border-yellow-700",
  LOW: "text-emerald-400 border-emerald-700",
};

/** Infrastructure assets rendered as map markers via the shared RiskMap shape. */
function toFeatures(items: Infrastructure[]): LocationRec[] {
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    state: i.region,
    district: i.type,
    latitude: i.latitude,
    longitude: i.longitude,
    population: 0,
    risk_score: i.risk_score,
    risk_level:
      i.risk_score >= 85
        ? "CRITICAL"
        : i.risk_score >= 70
          ? "VERY_HIGH"
          : i.risk_score >= 50
            ? "HIGH"
            : i.risk_score >= 25
              ? "MODERATE"
              : "LOW",
    status: i.status,
    assessed_at: undefined,
  }));
}

export default function CriticalInfrastructure() {
  const assets = useApi<Infrastructure[]>(
    () => getJSON<Infrastructure[]>("/api/infrastructure"),
    [],
    { pollMs: 120000 },
  );
  const [selected, setSelected] = useState<Infrastructure | null>(null);
  const items = assets.data ?? [];

  return (
    <div>
      <PageHeader
        title="Critical Infrastructure"
        subtitle="ASSETS, CRITICALITY AND EXPOSURE · /api/infrastructure"
        badge={
          <span className="px-2 py-[2px] rounded bg-panel2 border border-line text-[10px] font-mono text-slate-400 tabular-nums">
            {items.length} ASSETS
          </span>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <Panel title="ASSET EXPOSURE MAP" icon={<MapPin className="w-3.5 h-3.5" />} bodyClassName="p-2">
            <DataState
              loading={assets.loading}
              error={assets.error}
              empty={!assets.loading && items.length === 0}
              onRetry={assets.refetch}
              loadingLabel="LOADING ASSETS…"
              emptyLabel="NO INFRASTRUCTURE ASSETS"
            >
              <RiskMap
                features={toFeatures(items)}
                height="h-[440px]"
                selectedId={selected?.id ?? null}
                onSelect={(f) =>
                  setSelected(f ? (items.find((i) => i.id === f.id) ?? null) : null)
                }
                onRefresh={assets.refetch}
                refreshing={assets.refreshing}
              />
            </DataState>
            <SourceStrip
              meta={
                items.length > 0
                  ? {
                      source: "infrastructure table (PostgreSQL)",
                      source_status: assets.error ? "UNAVAILABLE" : "LIVE",
                      last_updated: null,
                      data_age_seconds: 0,
                    }
                  : null
              }
            />
          </Panel>
        </div>

        <Panel title="ASSET REGISTRY" icon={<Building2 className="w-3.5 h-3.5" />} bodyClassName="p-0">
          <DataState
            loading={assets.loading}
            error={assets.error}
            empty={items.length === 0}
            onRetry={assets.refetch}
          >
            <ul className="max-h-[520px] overflow-y-auto divide-y divide-line/60">
              {items.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => setSelected(i)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-slate-800/50 transition-colors ${
                      selected?.id === i.id ? "bg-sky-950/40" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-slate-200 truncate">
                        {i.name}
                      </span>
                      <span
                        className={`shrink-0 px-1.5 py-[1px] rounded border text-[9px] font-mono font-bold ${
                          CRIT_TONE[i.criticality?.toUpperCase()] ?? "text-slate-400 border-slate-600"
                        }`}
                      >
                        {i.criticality}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] font-mono text-slate-500">
                        {i.type} · {i.region} · {i.status}
                      </span>
                      <RiskBadge level={
                        i.risk_score >= 85 ? "CRITICAL" : i.risk_score >= 70 ? "VERY_HIGH" : i.risk_score >= 50 ? "HIGH" : i.risk_score >= 25 ? "MODERATE" : "LOW"
                      } score={i.risk_score} />
                    </div>
                    <div className="mt-1 h-1 bg-panel2 rounded overflow-hidden">
                      <div
                        className="h-full"
                        style={{
                          width: `${i.risk_score}%`,
                          backgroundColor:
                            i.risk_score >= 85
                              ? "#dc2626"
                              : i.risk_score >= 70
                                ? "#ef4444"
                                : i.risk_score >= 50
                                  ? "#f97316"
                                  : i.risk_score >= 25
                                    ? "#eab308"
                                    : RISK_COLORS.LOW,
                        }}
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </DataState>
        </Panel>
      </div>
    </div>
  );
}
