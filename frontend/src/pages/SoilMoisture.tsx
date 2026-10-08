import { Droplets } from "lucide-react";
import {
  DataState,
  inputCls,
  Notice,
  PageHeader,
  Panel,
  SourceStrip,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useLive } from "../hooks/useLive";
import { getJSON } from "../lib/api";
import type { RiskMapResponse, SoilMoistureResponse } from "../lib/types";
import { useState } from "react";

const STATUS_TONE: Record<string, string> = {
  SATURATED: "text-red-400 border-red-700",
  HIGH: "text-orange-400 border-orange-700",
  NORMAL: "text-emerald-400 border-emerald-700",
  DRY: "text-sky-400 border-sky-700",
  DEMO: "text-purple-400 border-purple-700",
};

export default function SoilMoisture() {
  const { version } = useLive();
  const [locationId, setLocationId] = useState("");

  const locations = useApi<RiskMapResponse>(() => getJSON<RiskMapResponse>("/api/risk-map"), []);
  const qs = locationId ? `?location_id=${locationId}` : "";
  const soil = useApi<SoilMoistureResponse>(
    () => getJSON<SoilMoistureResponse>(`/api/soil-moisture${qs}`),
    [qs, Math.floor(version / 6)],
    { pollMs: 180000 },
  );

  const s = soil.data;
  const isDemo = s?.meta.source_status === "DEMO";
  const trend = s?.trend ?? [];
  const maxTrend = Math.max(1, ...trend.map((t) => t.moisture));

  return (
    <div>
      <PageHeader
        title="Soil Moisture"
        subtitle="LAYER PROFILE + 7-DAY TREND · SOURCE LABEL HONESTLY EXPOSED IN THE STATUS STRIP"
        actions={
          <select
            className={inputCls + " w-56"}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            aria-label="Select location"
          >
            <option value="">DEFAULT LOCATION (API CHOICE)</option>
            {(locations.data?.features ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.state})
              </option>
            ))}
          </select>
        }
      />

      {isDemo && (
        <div className="mb-4">
          <Notice tone="purple" title="DEMO DATA">
            The configured soil-moisture provider returned no live reading. The values below are
            deterministic demo values — do not treat them as field measurements.
          </Notice>
        </div>
      )}
      {s?.meta.source_status === "UNAVAILABLE" && (
        <div className="mb-4">
          <Notice tone="red" title="SOIL DATA SOURCE UNAVAILABLE">
            Provider unreachable and no cached reading exists. Nothing is displayed rather than
            inventing values.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="MOISTURE BY SOIL LAYER" icon={<Droplets className="w-3.5 h-3.5" />}>
          <DataState
            loading={soil.loading}
            error={soil.error}
            empty={!soil.loading && (s?.layers.length ?? 0) === 0}
            onRetry={soil.refetch}
            loadingLabel="LOADING SOIL PROFILE…"
            emptyLabel="NO LAYER DATA"
          >
            <div className="space-y-3">
              {(s?.layers ?? []).map((layer) => (
                <div key={layer.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono text-slate-300">{layer.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-200 tabular-nums">
                        {layer.moisture}%
                      </span>
                      <span
                        className={`px-1.5 py-[1px] rounded border text-[9px] font-mono font-bold ${
                          STATUS_TONE[layer.status?.toUpperCase()] ?? "text-slate-400 border-slate-600"
                        }`}
                      >
                        {layer.status}
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 bg-panel2 rounded overflow-hidden border border-line">
                    <div
                      className={`h-full transition-all ${
                        layer.saturation_pct >= 85
                          ? "bg-red-500/80"
                          : layer.saturation_pct >= 60
                            ? "bg-orange-500/80"
                            : "bg-sky-500/80"
                      }`}
                      style={{ width: `${Math.min(100, layer.saturation_pct)}%` }}
                    />
                  </div>
                  <div className="text-[9px] font-mono text-slate-600 mt-0.5">
                    SATURATION {layer.saturation_pct}%
                  </div>
                </div>
              ))}
            </div>
          </DataState>
          <SourceStrip meta={s?.meta ?? null} extra={isDemo ? <span className="text-purple-400 font-bold">DEMO DATA</span> : undefined} />
        </Panel>

        <Panel className="xl:col-span-2" title="MOISTURE TREND" icon={<Droplets className="w-3.5 h-3.5" />}>
          <DataState
            loading={soil.loading}
            error={soil.error}
            empty={!soil.loading && trend.length === 0}
            onRetry={soil.refetch}
            loadingLabel="LOADING TREND…"
            emptyLabel="NO TREND SERIES"
          >
            <div className="h-56 flex items-end gap-1 pt-3">
              {trend.map((t, i) => (
                <div
                  key={i}
                  className="flex-1 min-w-0 group relative"
                  style={{ height: `${Math.max(4, (t.moisture / maxTrend) * 100)}%` }}
                >
                  <div
                    className={`w-full h-full rounded-t ${
                      t.moisture >= 85 ? "bg-red-500/70" : t.moisture >= 60 ? "bg-orange-500/70" : "bg-emerald-600/70"
                    } group-hover:opacity-80 transition-opacity`}
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-panel border border-line rounded px-1.5 py-1 text-[9px] font-mono text-slate-200 whitespace-nowrap z-10">
                    {t.moisture}% · {new Date(t.time).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })}
                  </div>
                </div>
              ))}
            </div>
          </DataState>
          <SourceStrip meta={s?.meta ?? null} />
        </Panel>
      </div>
    </div>
  );
}
