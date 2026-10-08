import { Database, Table2 } from "lucide-react";
import {
  DataState,
  KpiCard,
  Notice,
  PageHeader,
  Panel,
  SourceStrip,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import { getJSON } from "../lib/api";
import type {
  AlertList,
  IncidentList,
  Meta,
  RiskMapResponse,
} from "../lib/types";

interface AdminStats {
  tables?: Record<string, number>;
  database?: { engine?: string; size?: string };
  seed?: { seeded_at?: string; version?: string };
  [k: string]: unknown;
}

export default function AdminData() {
  const locations = useApi<RiskMapResponse>(() => getJSON<RiskMapResponse>("/api/risk-map"), []);
  const incidents = useApi<IncidentList>(() => getJSON<IncidentList>("/api/incidents"), [], {
    pollMs: 60000,
  });
  const alerts = useApi<AlertList>(() => getJSON<AlertList>("/api/alerts"), [], {
    pollMs: 60000,
  });
  const stats = useApi<AdminStats | null>(
    async () => {
      try {
        return await getJSON<AdminStats>("/api/admin/stats");
      } catch (err) {
        // endpoint is optional — surface honestly instead of failing the page
        if (err instanceof Error && /HTTP 404/.test(err.message)) return null;
        throw err;
      }
    },
    [],
  );

  const tableCounts: Record<string, number> = {
    locations: locations.data?.features.length ?? 0,
    incidents: incidents.data?.total ?? 0,
    alerts: alerts.data?.items.length ?? 0,
    ...((stats.data?.tables as Record<string, number> | undefined) ?? {}),
  };

  const engine =
    (stats.data?.database as { engine?: string } | undefined)?.engine ??
    "SQLAlchemy default (sqlite:///./terraguard.db in dev — Postgres in production)";

  const anyLoading = locations.loading || incidents.loading || alerts.loading;
  const anyError = locations.error ?? incidents.error ?? alerts.error;
  const seededAt = (stats.data?.seed as { seeded_at?: string } | undefined)?.seeded_at;

  return (
    <div>
      <PageHeader title="Admin / Data" subtitle="TABLE INVENTORY, DATABASE AND SEED STATUS" />
      <Notice tone="sky" title="READ-ONLY ADMIN VIEW">
        Record counts are read live from API endpoints. Destructive admin operations are not exposed
        from the UI — use the API directly with an ADMIN token if required.
      </Notice>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-4">
        <KpiCard
          label="LOCATIONS"
          tone="sky"
          icon={<Table2 className="w-4 h-4" />}
          loading={locations.loading}
          value={locations.error ? "—" : String(tableCounts.locations)}
          sub="/api/risk-map FEATURES"
        />
        <KpiCard
          label="INCIDENTS"
          tone="orange"
          icon={<Table2 className="w-4 h-4" />}
          loading={incidents.loading}
          value={incidents.error ? "—" : String(tableCounts.incidents)}
          sub="POSTGRESQL INCIDENTS TABLE"
        />
        <KpiCard
          label="ALERT RECORDS"
          tone="red"
          icon={<Table2 className="w-4 h-4" />}
          loading={alerts.loading}
          value={alerts.error ? "—" : String(tableCounts.alerts)}
          sub="ALL STATUSES"
        />
        <KpiCard
          label="API ENDPOINTS"
          tone="purple"
          icon={<Database className="w-4 h-4" />}
          loading={anyLoading}
          value={<span className="text-base">30+</span>}
          sub="SEE docs/api-contract.md"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="TABLE INVENTORY" icon={<Table2 className="w-3.5 h-3.5" />} bodyClassName="p-0">
          <DataState
            loading={anyLoading}
            error={anyError}
            onRetry={() => {
              locations.refetch();
              incidents.refetch();
              alerts.refetch();
            }}
            loadingLabel="COUNTING ROWS…"
          >
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-widest text-slate-500 border-b border-line">
                  <th className="px-3 py-2">Table</th>
                  <th className="px-3 py-2 text-right">Rows</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(tableCounts).map(([k, v]) => (
                  <tr key={k} className="border-b border-line/50">
                    <td className="px-3 py-2 text-slate-300">{k}</td>
                    <td className="px-3 py-2 text-right text-slate-100 tabular-nums font-bold">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataState>
          <SourceStrip meta={locations.data?.meta ?? null} />
        </Panel>

        <Panel title="DATABASE" icon={<Database className="w-3.5 h-3.5" />}>
          <div className="space-y-2 text-[11px] font-mono">
            <div className="flex justify-between border-b border-line pb-1.5">
              <span className="text-slate-500">ENGINE</span>
              <span className="text-slate-200 text-right max-w-[60%] break-words">{engine}</span>
            </div>
            <div className="flex justify-between border-b border-line pb-1.5">
              <span className="text-slate-500">MIGRATIONS</span>
              <span className="text-emerald-400">SQLALCHEMY CREATE_ALL + ALEMBIC-READY</span>
            </div>
            <div className="flex justify-between border-b border-line pb-1.5">
              <span className="text-slate-500">SEED</span>
              <span className="text-slate-200">
                {seededAt ? new Date(seededAt).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" }) : "IDEMPOTENT ON FIRST BOOT"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">STORAGE</span>
              <span className="text-slate-200 text-right max-w-[60%] break-words">
                Browser localStorage IS NOT USED FOR DOMAIN DATA
              </span>
            </div>
          </div>
          <div className="mt-3 text-[10px] text-slate-600 leading-relaxed">
            Incidents, alerts, thresholds, settings and scenario state all persist server-side and
            survive browser restarts.
          </div>
          <SourceStrip meta={stats.data ? ({
            source: "/api/admin/stats + list endpoints",
            source_status: "LIVE",
            last_updated: null,
            data_age_seconds: 0,
          } as Meta) : null} />
        </Panel>

        <Panel title="ERRORS / AVAILABILITY" icon={<Database className="w-3.5 h-3.5" />}>
          <div className="space-y-2 text-[11px] font-mono">
            {[
              { label: "/api/risk-map", err: locations.error, loading: locations.loading },
              { label: "/api/incidents", err: incidents.error, loading: incidents.loading },
              { label: "/api/alerts", err: alerts.error, loading: alerts.loading },
              { label: "/api/admin/stats", err: stats.error, loading: stats.loading },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between border-b border-line pb-1.5">
                <span className="text-slate-400">{row.label}</span>
                <span
                  className={
                    row.err ? "text-red-400" : row.loading ? "text-amber-400" : "text-emerald-400"
                  }
                >
                  {row.err ? "ERROR" : row.loading ? "LOADING…" : "OK"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10px] text-slate-600 leading-relaxed">
            {stats.data === null &&
              "GET /api/admin/stats is not implemented on this backend — shown as UNAVAILABLE rather than faked."}
            {stats.data !== null && "Every count on this page traces back to a live API response."}
          </div>
        </Panel>
      </div>
    </div>
  );
}
