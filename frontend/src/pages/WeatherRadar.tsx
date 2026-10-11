import { useState } from "react";
import { CloudRain, Gauge, Radar, Wind } from "lucide-react";
import {
  DataState,
  inputCls,
  KpiCard,
  Notice,
  PageHeader,
  Panel,
  SourceStrip,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useLive } from "../hooks/useLive";
import { getJSON } from "../lib/api";
import type { RiskMapResponse, WeatherHistory, WeatherReading } from "../lib/types";

export default function WeatherRadar() {
  const { version } = useLive();
  const [locationId, setLocationId] = useState<string>("");

  const locations = useApi<RiskMapResponse>(() => getJSON<RiskMapResponse>("/api/risk-map"), []);

  const qs = locationId ? `?location_id=${locationId}` : "";
  const weather = useApi<WeatherReading>(
    () => getJSON<WeatherReading>(`/api/weather${qs}`),
    [qs, Math.floor(version / 6)],
    { pollMs: 120000 },
  );
  const history = useApi<WeatherHistory>(
    () => getJSON<WeatherHistory>(`/api/weather/history${qs ? `${qs}&` : "?"}hours=24`),
    [qs],
    { pollMs: 300000 },
  );

  const w = weather.data;
  const series = history.data?.series ?? [];
  const maxRain = Math.max(1, ...series.map((s) => s.rainfall_mm));

  return (
    <div>
      <PageHeader
        title="Weather Radar"
        subtitle="LIVE OPEN-METEO INGESTION · SERVER-SIDE ONLY (NO API KEYS IN THE BROWSER)"
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

      {weather.data?.meta.source_status === "UNAVAILABLE" && (
        <div className="mb-4">
          <Notice tone="red" title="WEATHER DATA SOURCE UNAVAILABLE">
            The upstream provider could not be reached. Values below are last-known and marked
            STALE — they are not live observations.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <KpiCard
          label="TEMPERATURE"
          tone="orange"
          icon={<Gauge className="w-4 h-4" />}
          loading={weather.loading}
          value={w ? `${w.temperature_c}°C` : "—"}
          sub={w ? `OBSERVED ${w.meta.source_status}` : "NO DATA"}
        />
        <KpiCard
          label="HUMIDITY"
          tone="sky"
          icon={<CloudRain className="w-4 h-4" />}
          loading={weather.loading}
          value={w ? `${w.humidity_pct}%` : "—"}
          sub={w?.location_name ?? "—"}
        />
        <KpiCard
          label="WIND"
          tone="purple"
          icon={<Wind className="w-4 h-4" />}
          loading={weather.loading}
          value={w ? `${w.wind_kmh} km/h` : "—"}
          sub={w ? "SURFACE WIND" : "NO DATA"}
        />
        <KpiCard
          label="RAINFALL 24H"
          tone="red"
          pulse={(w?.rainfall_mm_24h ?? 0) >= 60}
          icon={<CloudRain className="w-4 h-4" />}
          loading={weather.loading}
          value={w ? `${w.rainfall_mm_24h} mm` : "—"}
          sub={w ? `1H ${w.rainfall_mm_1h} · 6H ${w.rainfall_mm_6h}` : "NO DATA"}
        />
        <KpiCard
          label="FORECAST 24H"
          tone="green"
          icon={<Radar className="w-4 h-4" />}
          loading={weather.loading}
          value={w && w.forecast_24h_mm != null ? `${w.forecast_24h_mm} mm` : "—"}
          sub={w ? "OPEN-METEO MODEL" : "NO DATA"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel className="lg:col-span-2" title="RAINFALL — LAST 24H (HOURLY)" icon={<CloudRain className="w-3.5 h-3.5" />}>
          <DataState
            loading={history.loading}
            error={history.error}
            empty={!history.loading && series.length === 0}
            onRetry={history.refetch}
            loadingLabel="LOADING WEATHER HISTORY…"
            emptyLabel="NO HISTORY RETURNED"
          >
            <div className="flex items-end gap-[3px] h-44 pt-2">
              {series.map((s, i) => (
                <div
                  key={i}
                  className="flex-1 min-w-0 group relative"
                  style={{ height: `${Math.max(3, (s.rainfall_mm / maxRain) * 100)}%` }}
                >
                  <div className="w-full h-full bg-sky-600/70 rounded-t group-hover:bg-sky-400 transition-colors" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-panel border border-line rounded px-1.5 py-1 text-[9px] font-mono text-slate-200 whitespace-nowrap z-10">
                    {s.rainfall_mm}mm · {s.temperature_c}°C
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1.5 text-[9px] font-mono text-slate-600">
              <span>{series[0] ? new Date(series[0].time).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—24h"}</span>
              <span>NOW</span>
            </div>
          </DataState>
          <SourceStrip meta={history.data?.meta ?? weather.data?.meta ?? null} />
        </Panel>

        <Panel title="RADAR COMPOSITE" icon={<Radar className="w-3.5 h-3.5" />}>
          <div className="rounded border border-line bg-panel2 flex flex-col items-center justify-center gap-3 h-44 text-center px-4">
            <Radar className="w-6 h-6 text-slate-600" />
            <div className="text-[11px] font-mono font-bold tracking-widest text-slate-400">
              RADAR DATA UNAVAILABLE
            </div>
            <div className="text-[10px] text-slate-600 leading-relaxed">
              No radar tile provider is configured for this deployment. Rainfall values on this page
              come from the server-side weather provider chain instead.
            </div>
          </div>
          <SourceStrip
            meta={
              weather.data?.meta ?? {
                source: "live weather provider (server ingest)",
                source_status: "UNAVAILABLE",
                last_updated: null,
                data_age_seconds: 0,
              }
            }
          />
        </Panel>
      </div>
    </div>
  );
}
