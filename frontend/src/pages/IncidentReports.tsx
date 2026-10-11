import { useMemo, useState } from "react";
import { FileBarChart } from "lucide-react";
import {
  btnPrimary,
  DataState,
  KpiCard,
  PageHeader,
  Panel,
  SourceStrip,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import { downloadFile, getJSON } from "../lib/api";
import type { IncidentList } from "../lib/types";
import { Notice } from "../components/ui";

export default function IncidentReports() {
  const incidents = useApi<IncidentList>(() => getJSON<IncidentList>("/api/incidents"), [], {
    pollMs: 60000,
  });
  const [typeFilter, setTypeFilter] = useState("");

  const items = incidents.data?.items ?? [];

  const stats = useMemo(() => {
    const bySeverity: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byRegion: Record<string, number> = {};
    for (const i of items) {
      bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
      byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
      byType[i.type] = (byType[i.type] ?? 0) + 1;
      if (i.region) byRegion[i.region] = (byRegion[i.region] ?? 0) + 1;
    }
    return { bySeverity, byStatus, byType, byRegion };
  }, [items]);

  const types = Object.keys(stats.byType).sort();
  const filtered = typeFilter ? items.filter((i) => i.type === typeFilter) : items;

  const open = items.filter((i) => i.status === "OPEN").length;
  const critical = items.filter((i) => i.severity === "CRITICAL").length;
  const resolved = items.filter((i) => i.status === "RESOLVED" || i.status === "CLOSED").length;
  const closureRate = items.length ? Math.round((resolved / items.length) * 100) : null;

  const BarRow = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[10px] font-mono text-slate-400 truncate">{label}</span>
      <div className="flex-1 h-2.5 bg-panel2 rounded overflow-hidden">
        <div className="h-full" style={{ width: `${total ? (value / total) * 100 : 0}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-right text-[10px] font-mono text-slate-300 tabular-nums">{value}</span>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Incident Reports"
        subtitle="AGGREGATED INCIDENT STATISTICS BUILT FROM THE LIVE /api/incidents REGISTER"
        actions={
          <select
            className="bg-panel2 border border-line rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by incident type"
          >
            <option value="">ALL TYPES</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        }
      />

      <Notice tone="amber" title="CALCULATED REPORT">
        Every figure on this page is computed from the incident table at request time — none of it is
        hard-coded.
      </Notice>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-4">
        <KpiCard
          label="TOTAL INCIDENTS"
          tone="sky"
          icon={<FileBarChart className="w-4 h-4" />}
          loading={incidents.loading}
          value={incidents.error ? "—" : String(incidents.data?.total ?? items.length)}
          sub="POSTGRESQL REGISTER"
        />
        <KpiCard
          label="OPEN"
          tone="red"
          pulse={open > 0}
          icon={<FileBarChart className="w-4 h-4" />}
          loading={incidents.loading}
          value={incidents.error ? "—" : String(open)}
          sub="AWAITING RESPONSE"
        />
        <KpiCard
          label="CRITICAL SEVERITY"
          tone="purple"
          icon={<FileBarChart className="w-4 h-4" />}
          loading={incidents.loading}
          value={incidents.error ? "—" : String(critical)}
          sub="SEVERITY = CRITICAL"
        />
        <KpiCard
          label="CLOSURE RATE"
          tone="green"
          icon={<FileBarChart className="w-4 h-4" />}
          loading={incidents.loading}
          value={incidents.error || closureRate === null ? "—" : `${closureRate}%`}
          sub="RESOLVED + CLOSED"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="BY SEVERITY" icon={<FileBarChart className="w-3.5 h-3.5" />}>
          <DataState
            loading={incidents.loading}
            error={incidents.error}
            empty={items.length === 0}
            onRetry={incidents.refetch}
            emptyLabel="NO INCIDENTS TO REPORT"
          >
            <div className="space-y-2">
              {Object.entries(stats.bySeverity).map(([k, v]) => (
                <BarRow
                  key={k}
                  label={k}
                  value={v}
                  total={items.length}
                  color={
                    k === "CRITICAL" ? "#dc2626" : k === "HIGH" ? "#f97316" : k === "MEDIUM" ? "#eab308" : "#22c55e"
                  }
                />
              ))}
            </div>
          </DataState>
          <SourceStrip meta={incidents.data?.meta ?? null} />
        </Panel>

        <Panel title="BY TYPE" icon={<FileBarChart className="w-3.5 h-3.5" />}>
          <DataState
            loading={incidents.loading}
            error={incidents.error}
            empty={items.length === 0}
            onRetry={incidents.refetch}
            emptyLabel="NO INCIDENTS TO REPORT"
          >
            <div className="space-y-2">
              {Object.entries(stats.byType)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v], i) => (
                  <BarRow key={k} label={k} value={v} total={items.length} color={["#22d3ee", "#a855f7", "#f97316", "#22c55e", "#ef4444", "#eab308"][i % 6]} />
                ))}
            </div>
          </DataState>
          <SourceStrip meta={incidents.data?.meta ?? null} />
        </Panel>

        <Panel title="BY REGION" icon={<FileBarChart className="w-3.5 h-3.5" />}>
          <DataState
            loading={incidents.loading}
            error={incidents.error}
            empty={items.length === 0}
            onRetry={incidents.refetch}
            emptyLabel="NO INCIDENTS TO REPORT"
          >
            <div className="space-y-2">
              {Object.entries(stats.byRegion)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <BarRow key={k} label={k} value={v} total={items.length} color="#6366f1" />
                ))}
            </div>
          </DataState>
          <SourceStrip meta={incidents.data?.meta ?? null} />
        </Panel>
      </div>

      <Panel className="mt-4" title="STATUS BREAKDOWN + RECORD SAMPLE" icon={<FileBarChart className="w-3.5 h-3.5" />} bodyClassName="p-0">
        <DataState
          loading={incidents.loading}
          error={incidents.error}
          empty={filtered.length === 0}
          onRetry={incidents.refetch}
          emptyLabel="NO RECORDS FOR THIS TYPE"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 border-b border-line">
            {Object.entries(stats.byStatus).map(([k, v]) => (
              <div key={k} className="rounded border border-line bg-panel2 px-2.5 py-2">
                <div className="text-[9px] font-mono text-slate-500 uppercase">{k}</div>
                <div className="text-lg font-black font-mono text-slate-200 tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-panel">
                <tr className="text-left text-[9px] uppercase tracking-widest text-slate-500 border-b border-line">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 hidden md:table-cell">Region</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((i) => (
                  <tr key={i.id} className="border-b border-line/50 hover:bg-slate-800/40">
                    <td className="px-3 py-1.5 text-sky-400">{i.public_id}</td>
                    <td className="px-3 py-1.5 text-slate-300">{i.type}</td>
                    <td className="px-3 py-1.5 text-slate-300 truncate max-w-[200px]">{i.location_name}</td>
                    <td className="px-3 py-1.5 text-slate-400">{i.severity}</td>
                    <td className="px-3 py-1.5 text-slate-400">{i.status}</td>
                    <td className="px-3 py-1.5 text-slate-500 hidden md:table-cell">{i.region ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
        <SourceStrip meta={incidents.data?.meta ?? null} />
      </Panel>

      <div className="mt-3">
        <a
          href="/api/export?dataset=incidents&format=csv"
          className="inline-flex"
          onClick={(e) => {
            e.preventDefault();
            void downloadFile("/api/export?dataset=incidents&format=csv", "terraguard-incidents.csv");
          }}
        >
          <span className={btnPrimary}>
            Download full incident CSV from /api/export
          </span>
        </a>
      </div>
    </div>
  );
}
