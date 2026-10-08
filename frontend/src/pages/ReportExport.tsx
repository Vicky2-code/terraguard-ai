import { useState } from "react";
import { Download, FileDown } from "lucide-react";
import { btnPrimary, inputCls, Notice, PageHeader, Panel } from "../components/ui";
import { downloadFile, getJSON } from "../lib/api";
import type { Meta } from "../lib/types";
import { useApi } from "../hooks/useApi";

const DATASETS = [
  { key: "locations", label: "LOCATIONS (RISK SNAPSHOT)", countPath: "/api/locations" },
  { key: "incidents", label: "INCIDENTS", countPath: "/api/incidents" },
  { key: "alerts", label: "ALERTS", countPath: "/api/alerts" },
  { key: "analytics", label: "ANALYTICS AGGREGATES", countPath: "/api/analytics?range=30d" },
] as const;

const FORMATS = ["csv", "json"] as const;

export default function ReportExport() {
  const [dataset, setDataset] = useState<string>("incidents");
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("csv");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [region, setRegion] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // live record counts so the user knows what they are exporting
  const activeDef = DATASETS.find((d) => d.key === dataset)!;
  const counts = useApi<unknown>(() => getJSON<unknown>(activeDef.countPath), [dataset], {
    pollMs: 60000,
  });

  const count = Array.isArray(counts.data)
    ? counts.data.length
    : ((counts.data as { items?: unknown[]; total?: number })?.total ??
      (counts.data as { features?: unknown[] })?.features?.length ??
      (counts.data as { models?: unknown[] })?.models?.length);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const params = new URLSearchParams({ dataset, format });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (region) params.set("region", region);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      await downloadFile(`/api/export?${params.toString()}`, `terraguard-${dataset}-${stamp}.${format}`);
      setMsg(`DOWNLOAD STARTED — terraguard-${dataset}.${format}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "export failed");
    } finally {
      setBusy(false);
    }
  };

  const meta: Meta | null = null;

  return (
    <div>
      <PageHeader
        title="Report Export"
        subtitle="REAL FILE DOWNLOADS FROM /api/export — CSV ROWS COME FROM POSTGRESQL, NOT THE BROWSER"
      />
      <Notice tone="sky" title="HONEST EXPORT">
        The CSV is streamed by FastAPI directly from database rows. If the API is unreachable the
        download fails loudly instead of exporting stale client cache.
      </Notice>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Panel title="EXPORT OPTIONS" icon={<FileDown className="w-3.5 h-3.5" />}>
          <div className="space-y-3">
            <div className="space-y-1">
              <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                Dataset
              </span>
              <div className="space-y-1">
                {DATASETS.map((d) => (
                  <label
                    key={d.key}
                    className={`flex items-center gap-2 rounded border px-2.5 py-2 cursor-pointer transition-colors ${
                      dataset === d.key
                        ? "border-sky-600 bg-sky-950/40"
                        : "border-line bg-panel2 hover:border-slate-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="dataset"
                      checked={dataset === d.key}
                      onChange={() => setDataset(d.key)}
                      className="accent-sky-500"
                    />
                    <span className="text-[11px] font-mono text-slate-300">{d.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                Format
              </span>
              <div className="flex gap-1.5">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`flex-1 py-1.5 rounded border text-[11px] font-mono font-bold uppercase ${
                      format === f
                        ? "border-sky-500 bg-sky-600/30 text-sky-300"
                        : "border-line bg-panel2 text-slate-400"
                    }`}
                  >
                    .{f}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  From
                </span>
                <input
                  type="date"
                  className={inputCls}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  To
                </span>
                <input
                  type="date"
                  className={inputCls}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                Region (optional)
              </span>
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
                ].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>

            <button onClick={() => void run()} disabled={busy} className={btnPrimary + " w-full"}>
              <Download className="w-3.5 h-3.5" /> {busy ? "EXPORTING…" : `DOWNLOAD .${format}`}
            </button>

            {msg && (
              <div className="text-[10px] font-mono text-emerald-400 border border-emerald-800/60 bg-emerald-950/30 rounded px-2 py-1.5">
                {msg}
              </div>
            )}
            {err && (
              <div className="text-[10px] font-mono text-red-400 border border-red-800/60 bg-red-950/30 rounded px-2 py-1.5 break-words">
                EXPORT FAILED: {err}
              </div>
            )}
          </div>
        </Panel>

        <Panel className="lg:col-span-2" title="EXPORT PREVIEW" icon={<Download className="w-3.5 h-3.5" />}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded border border-line bg-panel2 p-3">
                <div className="text-[10px] font-mono text-slate-500 uppercase">Records</div>
                <div className="text-2xl font-black font-mono text-sky-400 tabular-nums">
                  {counts.loading ? "…" : counts.error ? "—" : (count ?? "—")}
                </div>
                <div className="text-[9px] font-mono text-slate-600 truncate">
                  VIA {activeDef.countPath}
                </div>
              </div>
              <div className="rounded border border-line bg-panel2 p-3">
                <div className="text-[10px] font-mono text-slate-500 uppercase">Format</div>
                <div className="text-2xl font-black font-mono text-purple-400 uppercase">
                  .{format}
                </div>
                <div className="text-[9px] font-mono text-slate-600">STREAMED BY FASTAPI</div>
              </div>
              <div className="rounded border border-line bg-panel2 p-3">
                <div className="text-[10px] font-mono text-slate-500 uppercase">Filter</div>
                <div className="text-[11px] font-mono text-slate-300 leading-snug">
                  {from || to ? `${from || "…"} → ${to || "…"}` : "ALL DATES"}
                  <br />
                  {region || "ALL REGIONS"}
                </div>
              </div>
            </div>

            <div className="rounded border border-line bg-ink p-3 text-[11px] font-mono text-slate-500 space-y-1">
              <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                Endpoint
              </div>
              <div className="text-sky-400 break-all">
                GET /api/export?dataset={dataset}&amp;format={format}
                {from && `&from=${from}`}
                {to && `&to=${to}`}
                {region && `&region=${encodeURIComponent(region)}`}
              </div>
              <div className="pt-2 text-slate-600">
                Content-Disposition: attachment; filename=terraguard-{dataset}.{format}
              </div>
            </div>

            {counts.error && (
              <div className="text-[11px] font-mono text-red-400 border border-red-800/60 bg-red-950/30 rounded px-2.5 py-2">
                COUNT CHECK FAILED: {counts.error} — export will likely fail too.
              </div>
            )}
          </div>
          <div className="mt-3 px-3 py-1.5 border-t border-line bg-panel2/60 text-[9px] font-mono text-slate-500 uppercase">
            SOURCE: {activeDef.countPath} · STATUS:{" "}
            <span className={counts.error ? "text-red-400" : "text-emerald-400"}>
              {counts.error ? "UNAVAILABLE" : "LIVE"}
            </span>
            {meta ? "" : ""}
          </div>
        </Panel>
      </div>
    </div>
  );
}
