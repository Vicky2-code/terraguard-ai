import { useState } from "react";
import { ClipboardList, RefreshCw, Search } from "lucide-react";
import {
  btnGhost,
  DataState,
  inputCls,
  PageHeader,
  Panel,
  SourceStrip,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useLive } from "../hooks/useLive";
import { formatDateTime } from "../hooks/useClock";
import { getJSON, patchJSON } from "../lib/api";
import type { Incident, IncidentList } from "../lib/types";

const SEV_TONE: Record<string, string> = {
  CRITICAL: "text-red-400 border-red-700 bg-red-950/40",
  HIGH: "text-orange-400 border-orange-700 bg-orange-950/40",
  MEDIUM: "text-yellow-400 border-yellow-700 bg-yellow-950/40",
  LOW: "text-emerald-400 border-emerald-700 bg-emerald-950/40",
};

const STATUS_TONE: Record<string, string> = {
  OPEN: "text-red-400 border-red-700",
  INVESTIGATING: "text-emerald-400 border-emerald-700",
  CONTAINED: "text-yellow-400 border-yellow-700",
  RESOLVED: "text-emerald-400 border-emerald-700",
  CLOSED: "text-slate-400 border-slate-600",
};

// Canonical API status vocabulary (see backend routes/incidents.py).
const STATUS_OPTIONS = ["OPEN", "INVESTIGATING", "CONTAINED", "RESOLVED", "CLOSED"];

export default function FieldIncidents() {
  const { version } = useLive();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [region, setRegion] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [patching, setPatching] = useState<number | null>(null);
  const [patchErr, setPatchErr] = useState<string | null>(null);
  const perPage = 12;

  const params = new URLSearchParams();
  if (q.trim()) params.set("search", q.trim());
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  if (region) params.set("region", region);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const path = `/api/incidents${qs ? `?${qs}` : ""}`;

  const incidents = useApi<IncidentList>(() => getJSON<IncidentList>(path), [path], {
    pollMs: 45000,
  });

  const items = incidents.data?.items ?? [];
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const slice = items.slice((page - 1) * perPage, page * perPage);

  const changeStatus = async (inc: Incident, next: string) => {
    setPatching(inc.id);
    setPatchErr(null);
    try {
      await patchJSON<Incident>(`/api/incidents/${inc.id}`, { status: next });
      incidents.refetch();
    } catch (err) {
      setPatchErr(err instanceof Error ? err.message : "update failed");
    } finally {
      setPatching(null);
    }
  };

  const resetFilters = () => {
    setQ("");
    setStatus("");
    setSeverity("");
    setRegion("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Field Incidents"
        subtitle="POSTGRESQL INCIDENT REGISTER · SERVER-SIDE FILTERS · WORKING SEARCH"
        badge={
          <span className="px-2 py-[2px] rounded bg-panel2 border border-line text-[10px] font-mono text-slate-400 tabular-nums">
            {incidents.data?.total ?? "—"} TOTAL
          </span>
        }
        actions={
          <button onClick={incidents.refetch} className={btnGhost} disabled={incidents.refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${incidents.refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      <Panel
        title="FILTERS"
        icon={<Search className="w-3.5 h-3.5" />}
        bodyClassName="p-3 space-y-2"
        className="mb-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2">
          <input
            className={inputCls + " lg:col-span-2"}
            placeholder="SEARCH ID / TYPE / LOCATION…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">ALL STATUS</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className={inputCls} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">ALL SEVERITY</option>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className={inputCls} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">ALL REGIONS</option>
            {[
              "Assam",
              "Arunachal Pradesh",
              "Meghalaya",
              "Manipur",
              "Mizoram",
              "Nagaland",
              "Tripura",
              "Sikkim",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input
            type="date"
            className={inputCls}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
          />
          <input
            type="date"
            className={inputCls}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-slate-600">
            QUERY: {path} · REFRESHES WITH LIVE STREAM
          </span>
          <button onClick={resetFilters} className={btnGhost + " !py-1"}>
            Reset filters
          </button>
        </div>
      </Panel>

      {patchErr && (
        <div className="mb-3 text-[11px] font-mono text-red-400 border border-red-800/60 bg-red-950/30 rounded px-2.5 py-2">
          UPDATE FAILED: {patchErr}
        </div>
      )}

      <Panel title="INCIDENT REGISTER" icon={<ClipboardList className="w-3.5 h-3.5" />} bodyClassName="p-0">
        <DataState
          loading={incidents.loading}
          error={incidents.error}
          empty={!incidents.loading && items.length === 0}
          onRetry={incidents.refetch}
          loadingLabel="LOADING INCIDENTS…"
          emptyLabel="NO INCIDENTS MATCH"
          emptyHint="Clear filters or file a new report."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-widest text-slate-500 border-b border-line">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2 hidden md:table-cell">Reporter</th>
                  <th className="px-3 py-2 hidden lg:table-cell">Created</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((inc) => (
                  <tr key={inc.id} className="border-b border-line/50 hover:bg-slate-800/40 align-top">
                    <td className="px-3 py-2 text-emerald-400 font-bold whitespace-nowrap">
                      {inc.public_id}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{inc.type}</td>
                    <td className="px-3 py-2 text-slate-300">
                      <div>{inc.location_name}</div>
                      {inc.region && <div className="text-[9px] text-slate-600">{inc.region}</div>}
                      <div className="text-[10px] text-slate-500 max-w-[260px] truncate" title={inc.description}>
                        {inc.description}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-[1px] rounded border text-[9px] font-bold ${
                          SEV_TONE[inc.severity] ?? "text-slate-400 border-slate-600"
                        }`}
                      >
                        {inc.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-400 hidden md:table-cell">
                      {inc.reporter}
                    </td>
                    <td className="px-3 py-2 text-slate-500 hidden lg:table-cell whitespace-nowrap">
                      {formatDateTime(inc.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className={`bg-panel2 border rounded px-1.5 py-1 text-[10px] font-mono ${
                          STATUS_TONE[inc.status] ?? "border-slate-600 text-slate-300"
                        }`}
                        value={inc.status}
                        disabled={patching === inc.id}
                        onChange={(e) => void changeStatus(inc, e.target.value)}
                        aria-label={`Status for ${inc.public_id}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-line">
              <span className="text-[10px] font-mono text-slate-500">
                PAGE {page} / {pages}
              </span>
              <div className="flex gap-1.5">
                <button
                  className={btnGhost + " !py-1"}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <button
                  className={btnGhost + " !py-1"}
                  disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </DataState>
        <SourceStrip meta={incidents.data?.meta ?? null} />
      </Panel>

      <div className="mt-3 text-[10px] font-mono text-slate-600">
        NOTE: STATUS CHANGES CALL PATCH /api/incidents/&#123;id&#125; AND PERSIST IN POSTGRESQL.
        {version > 0 && " TABLE RE-SYNCS WITH THE LIVE STREAM."}
      </div>
    </div>
  );
}
