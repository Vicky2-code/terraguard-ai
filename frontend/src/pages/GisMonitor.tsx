import { useState } from "react";
import { Layers, List } from "lucide-react";
import {
  DataState,
  PageHeader,
  Panel,
  RiskBadge,
  SourceStrip,
} from "../components/ui";
import { RiskMap, RISK_COLORS } from "../components/RiskMap";
import { useApi } from "../hooks/useApi";
import { useLive } from "../hooks/useLive";
import { formatDateTime, timeAgo } from "../hooks/useClock";
import { getJSON } from "../lib/api";
import type { LocationRec, RiskMapResponse } from "../lib/types";

export default function GisMonitor() {
  const { version, status } = useLive();
  const [selected, setSelected] = useState<LocationRec | null>(null);

  const map = useApi<RiskMapResponse>(
    () => getJSON<RiskMapResponse>("/api/risk-map"),
    [Math.floor(version / 6)],
    { pollMs: 60000 },
  );

  const features = map.data?.features ?? [];

  return (
    <div>
      <PageHeader
        title="GIS Monitor"
        subtitle="REACT-LEAFLET · DARK TILES · MARKERS SERVED BY /api/risk-map (NO CLIENT-SIDE GENERATION)"
        badge={
          <span className="px-2 py-[2px] rounded border border-line bg-panel2 text-[10px] font-mono text-slate-400">
            STREAM {status}
          </span>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3">
          <DataState
            loading={map.loading}
            error={map.error}
            empty={!map.loading && features.length === 0}
            onRetry={map.refetch}
            loadingLabel="INITIALIZING NER GIS RISK MAP…"
            emptyLabel="NO LOCATIONS FROM API"
            emptyHint="Backend returned an empty FeatureCollection — seed data missing?"
          >
            <RiskMap
              features={features}
              height="h-[560px]"
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              onRefresh={map.refetch}
              refreshing={map.refreshing}
            />
          </DataState>
          <SourceStrip meta={map.data?.meta ?? null} />
        </div>

        <div className="space-y-4">
          <Panel
            title="SELECTION"
            icon={<Layers className="w-3.5 h-3.5" />}
            actions={
              <span className="text-[9px] font-mono text-slate-600">CLICK A MARKER</span>
            }
          >
            {selected ? (
              <div className="space-y-2 text-[11px] font-mono">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-100 font-bold">{selected.name}</span>
                  <RiskBadge level={selected.risk_level} score={selected.risk_score} />
                </div>
                <div className="grid grid-cols-2 gap-y-1 text-slate-400">
                  <span>DISTRICT</span>
                  <span className="text-slate-200 text-right">{selected.district ?? "—"}</span>
                  <span>STATE</span>
                  <span className="text-slate-200 text-right">{selected.state}</span>
                  <span>LAT/LON</span>
                  <span className="text-slate-200 text-right tabular-nums">
                    {selected.latitude.toFixed(3)}, {selected.longitude.toFixed(3)}
                  </span>
                  <span>ELEVATION</span>
                  <span className="text-slate-200 text-right">
                    {selected.elevation_m != null ? `${selected.elevation_m} m` : "—"}
                  </span>
                  <span>SLOPE</span>
                  <span className="text-slate-200 text-right">
                    {selected.slope_deg != null ? `${selected.slope_deg}°` : "—"}
                  </span>
                  <span>LAND COVER</span>
                  <span className="text-slate-200 text-right">{selected.land_cover ?? "—"}</span>
                  <span>POPULATION</span>
                  <span className="text-slate-200 text-right tabular-nums">
                    {selected.population?.toLocaleString("en-IN") ?? "—"}
                  </span>
                  <span>RAIN 24H</span>
                  <span className="text-slate-200 text-right">
                    {selected.rainfall_mm_24h != null ? `${selected.rainfall_mm_24h} mm` : "—"}
                  </span>
                  <span>SOIL MOISTURE</span>
                  <span className="text-slate-200 text-right">
                    {selected.soil_moisture != null ? `${selected.soil_moisture}%` : "—"}
                  </span>
                  <span>ASSESSED</span>
                  <span className="text-slate-200 text-right">
                    {formatDateTime(selected.assessed_at)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-[11px] font-mono text-slate-500 py-6 text-center">
                NO MARKER SELECTED
                <div className="text-[10px] text-slate-600 mt-1">
                  Zoom, pan, hover tooltips and popups are enabled.
                </div>
              </div>
            )}
          </Panel>

          <Panel
            title={`LAYER INDEX (${features.length})`}
            icon={<List className="w-3.5 h-3.5" />}
            bodyClassName="p-0"
          >
            <DataState
              loading={map.loading}
              error={map.error}
              empty={features.length === 0}
              onRetry={map.refetch}
            >
              <ul className="max-h-[340px] overflow-y-auto divide-y divide-line/60">
                {features.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => setSelected(f)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/50 transition-colors ${
                        selected?.id === f.id ? "bg-sky-950/40" : ""
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: RISK_COLORS[f.risk_level] }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11px] font-mono text-slate-200 truncate">
                          {f.name}
                        </span>
                        <span className="block text-[9px] text-slate-500 truncate">
                          {f.state} · {timeAgo(f.assessed_at)} ago
                        </span>
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-300">
                        {f.risk_score}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </DataState>
          </Panel>
        </div>
      </div>
    </div>
  );
}
