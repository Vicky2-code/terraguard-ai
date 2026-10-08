import { useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, ZoomControl } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { LocateFixed, RefreshCw } from "lucide-react";
import type { LocationRec, RiskLevel } from "../lib/types";
import { btnGhost, RiskBadge } from "./ui";

export const RISK_COLORS: Record<RiskLevel, string> = {
  LOW: "#22c55e",
  MODERATE: "#eab308",
  HIGH: "#f97316",
  VERY_HIGH: "#ef4444",
  CRITICAL: "#dc2626",
};

const LEVEL_ORDER: RiskLevel[] = ["LOW", "MODERATE", "HIGH", "VERY_HIGH", "CRITICAL"];

const NE_CENTER: LatLngExpression = [26.2, 92.8];

function markerRadius(score: number): number {
  if (score >= 85) return 13;
  if (score >= 70) return 11;
  if (score >= 50) return 9;
  if (score >= 25) return 7.5;
  return 6;
}

/**
 * Interactive risk map. Markers come exclusively from the backend
 * (/api/risk-map features) — nothing is generated client-side.
 */
export function RiskMap({
  features,
  height = "h-[460px]",
  selectedId,
  onSelect,
  onRefresh,
  refreshing,
  className = "",
}: {
  features: LocationRec[];
  height?: string;
  selectedId?: number | null;
  onSelect?: (loc: LocationRec | null) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
}) {
  const [levels, setLevels] = useState<Set<RiskLevel>>(new Set(LEVEL_ORDER));
  const [query, setQuery] = useState("");
  const [center, setCenter] = useState<LatLngExpression>(NE_CENTER);
  const [tileErrors, setTileErrors] = useState(0);
  const basemapDown = tileErrors >= 3;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return features.filter(
      (f) =>
        levels.has(f.risk_level) &&
        (q === "" ||
          f.name.toLowerCase().includes(q) ||
          (f.state ?? "").toLowerCase().includes(q) ||
          (f.district ?? "").toLowerCase().includes(q)),
    );
  }, [features, levels, query]);

  const toggleLevel = (lvl: RiskLevel) => {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      if (next.size === 0) return new Set(LEVEL_ORDER);
      return next;
    });
  };

  return (
    <div className={`rounded-lg border border-line bg-panel2 overflow-hidden ${className}`}>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line bg-panel/80">
        <div className="flex items-center gap-1">
          {LEVEL_ORDER.map((lvl) => {
            const active = levels.has(lvl);
            return (
              <button
                key={lvl}
                onClick={() => toggleLevel(lvl)}
                className={`px-1.5 py-[3px] rounded border text-[9px] font-mono font-bold tracking-wider transition-all ${
                  active ? "text-white" : "text-slate-500 border-line hover:text-slate-300"
                }`}
                style={
                  active
                    ? {
                        backgroundColor: `${RISK_COLORS[lvl]}33`,
                        borderColor: RISK_COLORS[lvl],
                        color: RISK_COLORS[lvl],
                      }
                    : undefined
                }
                aria-pressed={active}
              >
                {lvl.replace("_", " ")}
              </button>
            );
          })}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="FILTER LOCATION / STATE…"
          className="w-44 bg-panel2 border border-line rounded px-2 py-1 text-[10px] font-mono text-slate-200 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[9px] font-mono text-slate-500 tabular-nums">
            {visible.length}/{features.length} MARKERS
          </span>
          <button
            onClick={() => setCenter([26.2, 92.8])}
            className="p-1.5 rounded border border-slate-700/60 text-slate-400 hover:text-sky-400 hover:bg-slate-800"
            title="Recenter on Northeast India"
          >
            <LocateFixed className="w-3.5 h-3.5" />
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="p-1.5 rounded border border-slate-700/60 text-slate-400 hover:text-sky-400 hover:bg-slate-800 disabled:opacity-50"
              title="Reload markers from API"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <MapContainer
          center={center}
          zoom={7}
          minZoom={5}
          maxZoom={13}
          zoomControl={false}
          className={height}
          key={String(center)}
        >
        <ZoomControl position="bottomright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          eventHandlers={{
            tileerror: () => setTileErrors((n) => n + 1),
          }}
        />
        {visible.map((f) => {
          const color = RISK_COLORS[f.risk_level] ?? "#94a3b8";
          const isSelected = selectedId === f.id;
          return (
            <CircleMarker
              key={f.id}
              center={[f.latitude, f.longitude]}
              radius={markerRadius(f.risk_score)}
              pathOptions={{
                color: isSelected ? "#ffffff" : color,
                weight: isSelected ? 3 : 1.5,
                fillColor: color,
                fillOpacity: isSelected ? 0.95 : 0.7,
              }}
              eventHandlers={{
                click: () => onSelect?.(f),
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} className="tg-tooltip" permanent={false}>
                <span className="font-bold" style={{ color }}>
                  {f.risk_level.replace("_", " ")}
                </span>{" "}
                · {f.name} · {f.risk_score}
              </Tooltip>
              <Popup minWidth={220}>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-100">{f.name}</span>
                    <RiskBadge level={f.risk_level} score={f.risk_score} />
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {f.district ? `${f.district}, ` : ""}
                    {f.state}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                    <span>
                      POP <span className="text-slate-200">{f.population?.toLocaleString("en-IN")}</span>
                    </span>
                    <span>
                      ELEV{" "}
                      <span className="text-slate-200">
                        {f.elevation_m != null ? `${f.elevation_m}m` : "—"}
                      </span>
                    </span>
                    <span>
                      RAIN24H{" "}
                      <span className="text-slate-200">
                        {f.rainfall_mm_24h != null ? `${f.rainfall_mm_24h}mm` : "—"}
                      </span>
                    </span>
                    <span>
                      SOIL{" "}
                      <span className="text-slate-200">
                        {f.soil_moisture != null ? `${f.soil_moisture}%` : "—"}
                      </span>
                    </span>
                    <span>
                      SLOPE{" "}
                      <span className="text-slate-200">
                        {f.slope_deg != null ? `${f.slope_deg}°` : "—"}
                      </span>
                    </span>
                    <span>
                      ASSESSED{" "}
                      <span className="text-slate-200">
                        {f.assessed_at
                          ? new Date(f.assessed_at).toLocaleString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                    </span>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
        </MapContainer>
        {basemapDown && (
          <div className="absolute top-2 left-2 z-[1000] px-2 py-1 rounded border border-amber-700/70 bg-amber-950/90 text-[9px] font-mono text-amber-300 max-w-[320px]">
            BASEMAP TILES UNAVAILABLE (OPENSTREETMAP UNREACHABLE) — RISK MARKERS ONLY
          </div>
        )}
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t border-line bg-panel/80">
        <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500 uppercase">
          Risk legend
        </span>
        {LEVEL_ORDER.map((lvl) => (
          <span key={lvl} className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
            <span
              className="w-2.5 h-2.5 rounded-full border"
              style={{ backgroundColor: RISK_COLORS[lvl], borderColor: RISK_COLORS[lvl] }}
            />
            {lvl.replace("_", " ")}
          </span>
        ))}
        <span className="ml-auto text-[9px] font-mono text-slate-600">
          MARKERS FROM /api/risk-map
        </span>
        <button className={btnGhost + " !py-0.5 !text-[9px]"} onClick={onRefresh} disabled={!onRefresh}>
          REFRESH
        </button>
      </div>
    </div>
  );
}
