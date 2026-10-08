import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, MapPin, Send } from "lucide-react";
import { btnGhost, btnPrimary, Field, inputCls, Notice, PageHeader, Panel } from "../components/ui";
import { postJSON } from "../lib/api";
import type { Incident } from "../lib/types";

const TYPES = [
  "LANDSLIDE",
  "FLOOD",
  "EARTHQUAKE",
  "CLOUD BURST",
  "ROAD BLOCK",
  "INFRASTRUCTURE DAMAGE",
  "EVACUATION",
  "OTHER",
];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const REGIONS = [
  "Assam",
  "Arunachal Pradesh",
  "Meghalaya",
  "Manipur",
  "Mizoram",
  "Nagaland",
  "Tripura",
  "Sikkim",
];

interface FormState {
  type: string;
  description: string;
  location_name: string;
  latitude: string;
  longitude: string;
  severity: string;
  reporter: string;
  region: string;
}

const EMPTY: FormState = {
  type: "LANDSLIDE",
  description: "",
  location_name: "",
  latitude: "",
  longitude: "",
  severity: "MEDIUM",
  reporter: "",
  region: "Assam",
};

export default function ReportIncident() {
  const nav = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Incident | null>(null);
  const [serverErr, setServerErr] = useState<string | null>(null);

  const set = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (form.description.trim().length < 10)
      errs.description = "Describe the incident in at least 10 characters";
    if (form.location_name.trim().length < 2)
      errs.location_name = "Location name is required";
    if (form.reporter.trim().length < 2) errs.reporter = "Reporter name is required";
    const lat = form.latitude.trim() === "" ? null : Number(form.latitude);
    const lon = form.longitude.trim() === "" ? null : Number(form.longitude);
    if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90))
      errs.latitude = "Latitude must be between -90 and 90";
    if (lon !== null && (!Number.isFinite(lon) || lon < -180 || lon > 180))
      errs.longitude = "Longitude must be between -180 and 180";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerErr(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const payload = {
        type: form.type,
        description: form.description.trim(),
        location_name: form.location_name.trim(),
        severity: form.severity,
        reporter: form.reporter.trim(),
        region: form.region,
        ...(form.latitude.trim() !== "" ? { latitude: Number(form.latitude) } : {}),
        ...(form.longitude.trim() !== "" ? { longitude: Number(form.longitude) } : {}),
      };
      const created = await postJSON<Incident>("/api/incidents", payload);
      setDone(created);
      setForm(EMPTY);
    } catch (err) {
      setServerErr(err instanceof Error ? err.message : "submission failed");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div>
        <PageHeader title="Report Incident" subtitle="POST /api/incidents → POSTGRESQL" />
        <Panel title="INCIDENT RECORDED" icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}>
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            <div className="text-lg font-mono font-black text-emerald-400">{done.public_id}</div>
            <div className="text-[11px] font-mono text-slate-400 max-w-md">
              {done.type} · {done.location_name} · {done.severity}
              {done.region ? ` · ${done.region}` : ""}
            </div>
            <div className="text-[10px] font-mono text-slate-600">
              PERSISTED VIA API — VISIBLE ON DASHBOARD, MAP AND FIELD INCIDENTS
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setDone(null)} className={btnGhost}>
                Report another
              </button>
              <button onClick={() => nav("/field-incidents")} className={btnPrimary}>
                View in Field Incidents
              </button>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Report Incident"
        subtitle="FIELD OFFICER INTAKE · VALIDATED CLIENT-SIDE AND SERVER-SIDE · POSTGRESQL PERSISTENCE"
      />
      <Notice tone="sky" title="PERSISTENT">
        Incidents are stored in PostgreSQL (not browser localStorage) and appear everywhere in the
        platform after submission.
      </Notice>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <form onSubmit={submit} className="lg:col-span-2">
          <Panel title="INCIDENT DETAILS" icon={<Send className="w-3.5 h-3.5" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="INCIDENT TYPE">
                <select className={inputCls} value={form.type} onChange={set("type")}>
                  {TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="SEVERITY">
                <select className={inputCls} value={form.severity} onChange={set("severity")}>
                  {SEVERITIES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="LOCATION NAME *" error={errors.location_name}>
                <input
                  className={inputCls}
                  value={form.location_name}
                  onChange={set("location_name")}
                  placeholder="e.g. NH-37, Jakhalabandha"
                />
              </Field>
              <Field label="REGION / STATE">
                <select className={inputCls} value={form.region} onChange={set("region")}>
                  {REGIONS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="LATITUDE (OPTIONAL)" error={errors.latitude} hint="-90 … 90">
                <input
                  className={inputCls}
                  value={form.latitude}
                  onChange={set("latitude")}
                  placeholder="26.42"
                  inputMode="decimal"
                />
              </Field>
              <Field label="LONGITUDE (OPTIONAL)" error={errors.longitude} hint="-180 … 180">
                <input
                  className={inputCls}
                  value={form.longitude}
                  onChange={set("longitude")}
                  placeholder="92.87"
                  inputMode="decimal"
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="DESCRIPTION *" error={errors.description}>
                  <textarea
                    className={inputCls + " min-h-28 resize-y"}
                    value={form.description}
                    onChange={set("description")}
                    placeholder="What happened, who is affected, what response is needed…"
                  />
                </Field>
              </div>
              <Field label="REPORTER NAME *" error={errors.reporter}>
                <input
                  className={inputCls}
                  value={form.reporter}
                  onChange={set("reporter")}
                  placeholder="Name / callsign"
                />
              </Field>
            </div>

            {serverErr && (
              <div className="mt-3 text-[11px] font-mono text-red-400 border border-red-800/60 bg-red-950/30 rounded px-2.5 py-2">
                SUBMISSION FAILED: {serverErr}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button type="submit" disabled={busy} className={btnPrimary}>
                <Send className="w-3.5 h-3.5" /> {busy ? "SUBMITTING…" : "SUBMIT INCIDENT"}
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  setForm(EMPTY);
                  setErrors({});
                  setServerErr(null);
                }}
              >
                Clear
              </button>
            </div>
          </Panel>
        </form>

        <div className="space-y-4">
          <Panel title="INTAKE NOTES" icon={<MapPin className="w-3.5 h-3.5" />}>
            <ul className="space-y-2 text-[11px] font-mono text-slate-400 list-disc pl-4">
              <li>A public incident ID (INC-YYYY-NNNN) is generated server-side.</li>
              <li>Open incidents feed the dashboard KPIs and map markers.</li>
              <li>Status transitions happen on the Field Incidents page.</li>
              <li>No SMS or email is triggered by this form.</li>
              <li>Lat/lon are optional — location name is enough to file.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
