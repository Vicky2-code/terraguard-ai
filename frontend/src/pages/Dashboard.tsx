import { useMemo } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CloudRain,
  Crosshair,
  MapPin,
  Radio,
  Route as RouteIcon,
  Users,
} from "lucide-react";
import {
  DataState,
  KpiCard,
  Panel,
  PageHeader,
  RiskBadge,
  SourceStrip,
  StatusPill,
} from "../components/ui";
import { ScenarioBanner } from "../components/Header";
import { RiskMap } from "../components/RiskMap";
import { useApi } from "../hooks/useApi";
import { useLive } from "../hooks/useLive";
import { formatTime, timeAgo } from "../hooks/useClock";
import { getJSON } from "../lib/api";
import { useT } from "../lib/i18n";
import type {
  AlertList,
  Corridor,
  DashboardResponse,
  IncidentList,
  Meta,
  RiskMapResponse,
} from "../lib/types";
import type { ShellContext } from "../components/AppShell";

const KPI_DEFS: {
  key: string;
  label: string;
  icon: React.ReactNode;
  tone: "red" | "orange" | "green" | "purple" | "amber";
  to: string;
  pulse?: boolean;
}[] = [
  {
    key: "monitored_locations",
    label: "MONITORED LOCATIONS",
    icon: <MapPin className="w-4 h-4" />,
    tone: "green",
    to: "/gis-monitor",
  },
  {
    key: "active_alerts",
    label: "ACTIVE ALERTS",
    icon: <AlertTriangle className="w-4 h-4" />,
    tone: "red",
    to: "/early-alerts",
    pulse: true,
  },
  {
    key: "high_risk_locations",
    label: "HIGH-RISK LOCATIONS",
    icon: <Crosshair className="w-4 h-4" />,
    tone: "orange",
    to: "/risk-analytics",
  },
  {
    key: "critical_incidents",
    label: "CRITICAL INCIDENTS",
    icon: <Radio className="w-4 h-4" />,
    tone: "purple",
    to: "/field-incidents",
    pulse: true,
  },
  {
    key: "population_at_risk",
    label: "PEOPLE / ASSETS AT RISK",
    icon: <Users className="w-4 h-4" />,
    tone: "green",
    to: "/risk-analytics",
  },
];

const SEV_TONE: Record<string, string> = {
  CRITICAL: "text-red-400 border-red-700/60",
  HIGH: "text-orange-400 border-orange-700/60",
  MEDIUM: "text-yellow-400 border-yellow-700/60",
  MODERATE: "text-yellow-400 border-yellow-700/60",
  LOW: "text-emerald-400 border-emerald-700/60",
  INFO: "text-emerald-400 border-emerald-700/60",
};

export default function Dashboard() {
  const { scenario } = useOutletContext<ShellContext>();
  const { version } = useLive();
  const t = useT();

  const dash = useApi<DashboardResponse>(
    () => getJSON<DashboardResponse>("/api/dashboard"),
    [version > 0 ? Math.floor(version / 4) : 0],
    { pollMs: 30000 },
  );
  const map = useApi<RiskMapResponse>(() => getJSON<RiskMapResponse>("/api/risk-map"), [version > 0 ? Math.floor(version / 6) : 0], {
    pollMs: 60000,
  });
  const alerts = useApi<AlertList>(() => getJSON<AlertList>("/api/alerts?status=OPEN"), [], {
    pollMs: 30000,
  });
  const incidents = useApi<IncidentList>(
    () => getJSON<IncidentList>("/api/incidents?sort=recent"),
    [],
    { pollMs: 60000 },
  );
  const corridors = useApi<Corridor[]>(() => getJSON<Corridor[]>("/api/corridors"), []);

  const kpis = dash.data?.kpis ?? {};
  const meta: Meta | null = map.data?.meta ?? null;

  const blockedRoads = useMemo(
    () =>
      (corridors.data ?? []).filter(
        (c) => c.status === "BLOCKED" || (c.blockage ?? "").toLowerCase() !== "",
      ).length,
    [corridors.data],
  );

  return (
    <div>
      <PageHeader
        title="Situation Overview"
        subtitle="NER DISASTER RESPONSE COMMAND CENTER · LIVE KPIs FROM POSTGRES VIA FASTAPI"
        badge={
          <StatusPill
            status={dash.error ? "UNAVAILABLE" : dash.loading ? "SYNCING" : "LIVE"}
            className="ml-1"
          />
        }
      />

      <ScenarioBanner
        state={scenario.state?.state ?? "IDLE"}
        step={scenario.state?.step ?? 0}
        error={scenario.error}
        busy={scenario.busy}
        act={scenario.act}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {KPI_DEFS.map((def) => {
          const kpi = kpis[def.key];
          const unavailable = kpi === undefined || kpi.value === null;
          return (
            <Link key={def.key} to={def.to} className="block">
              <KpiCard
                label={t(def.label)}
                tone={def.tone}
                pulse={def.pulse && !unavailable}
                loading={dash.loading}
                icon={def.icon}
                value={
                  unavailable ? (
                    <span className="text-sm font-bold text-slate-500">{t("DATA UNAVAILABLE")}</span>
                  ) : (
                    (def.key === "population_at_risk"
                      ? (kpi!.value ?? 0).toLocaleString("en-IN")
                      : String(kpi!.value))
                  )
                }
                sub={
                  unavailable
                    ? t(kpi?.status ?? "NO DATA FROM API")
                    : (kpi?.source ?? kpi?.status ?? "") +
                      (kpi?.updated_at ? ` · ${timeAgo(kpi.updated_at)} ago` : "")
                }
              />
            </Link>
          );
        })}
      </div>

      {/* blocked roads strip (corridors from API) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label={t("BLOCKED CORRIDORS")}
          tone="red"
          loading={corridors.loading}
          icon={<RouteIcon className="w-4 h-4" />}
          value={corridors.error ? t("UNAVAILABLE") : String(blockedRoads)}
          sub={
            corridors.error
              ? t("/api/corridors UNREACHABLE")
              : `${t("OF")} ${(corridors.data ?? []).length} ${t("MONITORED (DEMO REFERENCE)")}`
          }
        />
        <KpiCard
          label={t("OPEN ALERTS (API)")}
          tone="amber"
          loading={alerts.loading}
          icon={<AlertTriangle className="w-4 h-4" />}
          value={alerts.error ? t("UNAVAILABLE") : String(alerts.data?.items.length ?? 0)}
          sub={alerts.error ? t("/api/alerts UNREACHABLE") : t("DEDUPED PER LOCATION+LEVEL")}
        />
        <KpiCard
          label={t("REPORTED INCIDENTS")}
          tone="purple"
          loading={incidents.loading}
          icon={<Building2 className="w-4 h-4" />}
          value={incidents.error ? t("UNAVAILABLE") : String(incidents.data?.total ?? 0)}
          sub={incidents.error ? t("/api/incidents UNREACHABLE") : t("POSTGRES PERSISTED")}
        />
        <KpiCard
          label={t("RAIN SIGNAL")}
          tone="green"
          loading={map.loading}
          icon={<CloudRain className="w-4 h-4" />}
          value={
            map.error
              ? t("UNAVAILABLE")
              : String(
                  (map.data?.features ?? []).filter((f) => (f.rainfall_mm_24h ?? 0) >= 60).length,
                )
          }
          sub={t("ZONES ≥60mm / 24H FROM API")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* map */}
        <div className="lg:col-span-2">
          <Panel
            title="GIS RISK MAP — NORTHEAST INDIA"
            icon={<MapPin className="w-3.5 h-3.5" />}
            bodyClassName="p-2"
            actions={
              <Link
                to="/gis-monitor"
                className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 hover:text-emerald-300 uppercase tracking-wider"
              >
                {t("Full monitor")} <ArrowRight className="w-3 h-3" />
              </Link>
            }
          >
            <DataState
              loading={map.loading}
              error={map.error}
              empty={!map.loading && (map.data?.features.length ?? 0) === 0}
              onRetry={map.refetch}
              loadingLabel="LOADING RISK MARKERS FROM /api/risk-map…"
              emptyLabel="NO MARKERS RETURNED"
              emptyHint="Backend returned zero locations — check seed data."
            >
              <RiskMap
                features={map.data?.features ?? []}
                height="h-[320px] sm:h-[400px] xl:h-[430px]"
                onRefresh={map.refetch}
                refreshing={map.refreshing}
              />
            </DataState>
            <SourceStrip meta={meta} />
          </Panel>
        </div>

        {/* right column: alerts + timeline */}
        <div className="space-y-4">
          <Panel
            title="ACTIVE ALERTS"
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            actions={
              <Link
                to="/early-alerts"
                className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 uppercase tracking-wider"
              >
                {t("All")}
              </Link>
            }
            bodyClassName="p-0"
          >
            <DataState
              loading={alerts.loading}
              error={alerts.error}
              empty={!alerts.loading && alerts.data?.items.length === 0}
              onRetry={alerts.refetch}
              emptyLabel="NO ACTIVE ALERTS"
              emptyHint="Threshold engine reports nothing above configured bands."
            >
              <ul className="divide-y divide-line/70 max-h-[260px] overflow-y-auto">
                {(alerts.data?.items ?? []).slice(0, 8).map((a) => (
                  <li key={a.id} className="px-3 py-2 flex items-start gap-2">
                    <RiskBadge level={a.risk_level} score={a.risk_score} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-slate-200 font-mono truncate">
                        {a.location_name}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{a.message}</div>
                    </div>
                    <span className="text-[9px] font-mono text-slate-600 whitespace-nowrap">
                      {timeAgo(a.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </DataState>
            <SourceStrip meta={alerts.data?.meta ?? null} />
          </Panel>

          <Panel
            title="SITUATION TIMELINE"
            icon={<Radio className="w-3.5 h-3.5" />}
            actions={
              <span className="text-[9px] font-mono text-slate-600">
                {dash.data?.generated_at
                  ? `GEN ${formatTime(dash.data.generated_at)}`
                  : "—"}
              </span>
            }
            bodyClassName="p-0"
          >
            <DataState
              loading={dash.loading}
              error={dash.error}
              empty={!dash.loading && (dash.data?.timeline.length ?? 0) === 0}
              onRetry={dash.refetch}
              emptyLabel="TIMELINE EMPTY"
            >
              <ul className="divide-y divide-line/70 max-h-[300px] overflow-y-auto">
                {(dash.data?.timeline ?? []).map((ev) => (
                  <li key={`${ev.id}-${ev.timestamp}`} className="px-3 py-2 flex items-start gap-2">
                    <span
                      className={`mt-1 px-1.5 py-[1px] rounded border text-[8px] font-mono font-bold uppercase ${
                        SEV_TONE[ev.severity ?? ""] ?? "text-slate-400 border-slate-600"
                      }`}
                    >
                      {ev.severity ?? ev.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-slate-300 leading-snug">{ev.message}</div>
                      {ev.location && (
                        <div className="text-[10px] text-slate-600 font-mono">{ev.location}</div>
                      )}
                    </div>
                    <span className="text-[9px] font-mono text-slate-600 whitespace-nowrap">
                      {formatTime(ev.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            </DataState>
          </Panel>
        </div>
      </div>

      {/* priority queue */}
      <Panel
        className="mt-4"
        title="PRIORITY RESPONSE QUEUE"
        icon={<Crosshair className="w-3.5 h-3.5" />}
        bodyClassName="p-0"
        actions={
          <span className="text-[9px] font-mono text-slate-600">P1 = IMMEDIATE · RANKED BY RISK</span>
        }
      >
        <DataState
          loading={dash.loading}
          error={dash.error}
          empty={!dash.loading && (dash.data?.priority_queue.length ?? 0) === 0}
          onRetry={dash.refetch}
          emptyLabel="QUEUE EMPTY"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-widest text-slate-500 border-b border-line">
                  <th className="px-3 py-2">{t("Priority")}</th>
                  <th className="px-3 py-2">{t("Location")}</th>
                  <th className="px-3 py-2">{t("Risk")}</th>
                  <th className="px-3 py-2 hidden sm:table-cell">{t("Population")}</th>
                  <th className="px-3 py-2 hidden md:table-cell">{t("Reason")}</th>
                </tr>
              </thead>
              <tbody>
                {(dash.data?.priority_queue ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-line/50 hover:bg-slate-800/40">
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-[1px] rounded border text-[9px] font-bold ${
                          row.priority === "P1"
                            ? "text-red-400 border-red-700"
                            : row.priority === "P2"
                              ? "text-orange-400 border-orange-700"
                              : "text-yellow-400 border-yellow-700"
                        }`}
                      >
                        {row.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-200">{row.location}</td>
                    <td className="px-3 py-2 text-slate-300 tabular-nums">{row.risk_score}</td>
                    <td className="px-3 py-2 text-slate-400 tabular-nums hidden sm:table-cell">
                      {row.population != null ? row.population.toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500 hidden md:table-cell truncate max-w-[320px]">
                      {row.reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
        <SourceStrip
          meta={
            dash.data
              ? {
                  source: "PostgreSQL via FastAPI /api/dashboard",
                  source_status: "LIVE",
                  last_updated: dash.data.generated_at,
                  data_age_seconds: Math.max(
                    0,
                    (Date.now() - Date.parse(dash.data.generated_at)) / 1000,
                  ),
                }
              : null
          }
        />
      </Panel>
    </div>
  );
}
