import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { LogIn, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import {
  btnGhost,
  btnPrimary,
  Field,
  inputCls,
  Notice,
  PageHeader,
  Panel,
  SourceStrip,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import { formatDateTime } from "../hooks/useClock";
import { getJSON, postJSON, putJSON, setToken } from "../lib/api";
import { LANGUAGES, useT } from "../lib/i18n";
import type { LoginResponse, SettingsResponse, Thresholds } from "../lib/types";
import type { ShellContext } from "../components/AppShell";

const BAND_LABELS: { key: keyof Thresholds; label: string }[] = [
  { key: "moderate", label: "MODERATE ≥" },
  { key: "high", label: "HIGH ≥" },
  { key: "very_high", label: "VERY HIGH ≥" },
  { key: "critical", label: "CRITICAL ≥" },
];

const NOTIF_KEYS = ["in_app_alerts", "email_digest", "sms_bridge", "shift_report"];

export default function Settings() {
  const { user, setUser } = useOutletContext<ShellContext>();
  const t = useT();
  const settings = useApi<SettingsResponse>(() => getJSON<SettingsResponse>("/api/settings"), []);
  const [form, setForm] = useState<SettingsResponse | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const th = form.thresholds;
      if (!(th.moderate < th.high && th.high < th.very_high && th.very_high < th.critical)) {
        throw new Error(t("Thresholds must ascend: MODERATE < HIGH < VERY HIGH < CRITICAL"));
      }
      if (th.moderate < 1 || th.critical > 100) throw new Error(t("Thresholds must be 1–100"));
      const updated = await putJSON<SettingsResponse>("/api/settings", form);
      setForm(updated);
      setMsg(`${t("SAVED")} ${formatDateTime(updated.updated_at ?? new Date().toISOString())}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("save failed"));
    } finally {
      setBusy(false);
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthMsg(null);
    setAuthErr(null);
    try {
      const res = await postJSON<LoginResponse>("/api/auth/login", { email, password });
      setToken(res.token);
      localStorage.setItem("tg_user", JSON.stringify(res.user));
      setUser(res.user);
      setAuthMsg(`${t("SIGNED IN AS")} ${res.user.name} (${res.user.role})`);
      setPassword("");
    } catch (e) {
      setAuthErr(e instanceof Error ? e.message : t("login failed"));
    } finally {
      setAuthBusy(false);
    }
  };

  const roleAdmin = user?.role === "ADMIN";

  return (
    <div>
      <PageHeader title="Settings" subtitle="THRESHOLDS, REGION, REFRESH AND NOTIFICATIONS — PERSISTED SERVER-SIDE" />

      {!user && (
        <div className="mb-4">
          <Notice tone="green" title="PUBLIC READ, AUTHENTICATED WRITE">
            {t("Most pages work without signing in. Saving settings requires an ADMIN token — sign in below (seeds are listed in the README).")}
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="RISK THRESHOLDS" icon={<SettingsIcon className="w-3.5 h-3.5" />}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-emerald-800/50 bg-emerald-950/30 px-2 py-1.5 text-center">
                <div className="text-[9px] font-mono text-emerald-400">LOW</div>
                <div className="text-[11px] font-mono text-slate-300">
                  0–{form ? form.thresholds.moderate - 1 : "24"}
                </div>
              </div>
              {BAND_LABELS.map((b) => (
                <div key={b.key} className="rounded border border-line bg-panel2 px-2 py-1.5">
                  <div className="text-[9px] font-mono text-slate-500 text-center">{t(b.label)}</div>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    disabled={!form || !roleAdmin}
                    className="w-full bg-ink border border-line rounded px-1 py-1 text-xs font-mono text-slate-200 text-center tabular-nums focus:border-emerald-600 focus:outline-none disabled:opacity-50"
                    value={form ? form.thresholds[b.key] : ""}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, thresholds: { ...f.thresholds, [b.key]: Number(e.target.value) } } : f,
                      )
                    }
                  />
                </div>
              ))}
            </div>

            <Field label="REGION">
              <input
                className={inputCls}
                disabled={!form || !roleAdmin}
                value={form?.region ?? ""}
                onChange={(e) => setForm((f) => (f ? { ...f, region: e.target.value } : f))}
              />
            </Field>
            <Field label="LANGUAGE">
              <select
                className={inputCls}
                disabled={!form || !roleAdmin}
                value={form?.language ?? "en"}
                onChange={(e) => setForm((f) => (f ? { ...f, language: e.target.value } : f))}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.native}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="REFRESH INTERVAL (SECONDS)" hint="Controls polling cadence if SSE is down">
              <input
                type="number"
                min={10}
                max={3600}
                disabled={!form || !roleAdmin}
                className={inputCls}
                value={form?.refresh_interval_seconds ?? 60}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, refresh_interval_seconds: Number(e.target.value) } : f))
                }
              />
            </Field>

            <button
              onClick={() => void save()}
              disabled={busy || !form || !roleAdmin}
              className={btnPrimary + " w-full"}
              title={!roleAdmin ? "Requires ADMIN sign-in" : "Save settings"}
            >
              {busy ? t("SAVING…") : roleAdmin ? t("SAVE SETTINGS") : t("SIGN IN AS ADMIN TO SAVE")}
            </button>
            {msg && (
              <div className="text-[10px] font-mono text-emerald-400 border border-emerald-800/60 bg-emerald-950/30 rounded px-2 py-1.5">
                {msg}
              </div>
            )}
            {err && (
              <div className="text-[10px] font-mono text-red-400 border border-red-800/60 bg-red-950/30 rounded px-2 py-1.5 break-words">
                {err}
              </div>
            )}
          </div>
          <SourceStrip
            meta={
              form
                ? {
                    source: "system_settings (PostgreSQL)",
                    source_status: settings.error ? "UNAVAILABLE" : "LIVE",
                    last_updated: form.updated_at ?? null,
                    data_age_seconds: form.updated_at
                      ? (Date.now() - Date.parse(form.updated_at)) / 1000
                      : 0,
                  }
                : null
            }
          />
        </Panel>

        <Panel title="NOTIFICATIONS" icon={<SettingsIcon className="w-3.5 h-3.5" />}>
          <div className="space-y-2">
            <Notice tone="purple" title="NO REAL DELIVERY CLAIMED">
              {t("SMS / email / webhook switches configure intent only. This deployment has no provider keys, so delivery_status stays SIMULATED_LOCAL and no message leaves the system.")}
            </Notice>
            {NOTIF_KEYS.map((k) => (
              <label
                key={k}
                className="flex items-center justify-between rounded border border-line bg-panel2 px-2.5 py-2"
              >
                <span className="text-[11px] font-mono text-slate-300 uppercase">{t(k.replace(/_/g, " "))}</span>
                <input
                  type="checkbox"
                  disabled={!form || !roleAdmin}
                  checked={Boolean(form?.notifications?.[k])}
                  onChange={(e) =>
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            notifications: { ...f.notifications, [k]: e.target.checked },
                          }
                        : f,
                    )
                  }
                  className="accent-emerald-500 w-4 h-4"
                />
              </label>
            ))}
            <div className="text-[10px] font-mono text-slate-600 border-t border-line pt-2">
              {t("ALERT THRESHOLDS ARE ALSO EDITABLE ON THE EARLY ALERTS PAGE.")}
            </div>
          </div>
        </Panel>

        <Panel title="ACCESS / AUTH" icon={<ShieldCheck className="w-3.5 h-3.5" />}>
          {user ? (
            <div className="space-y-3">
              <div className="rounded border border-line bg-panel2 p-3 space-y-1.5">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-500">{t("NAME")}</span>
                  <span className="text-slate-200">{user.name}</span>
                </div>
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-500">{t("EMAIL")}</span>
                  <span className="text-slate-200">{user.email}</span>
                </div>
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-500">{t("ROLE")}</span>
                  <span className="text-emerald-400 font-bold">{user.role}</span>
                </div>
              </div>
              <div className="text-[10px] font-mono text-slate-600">
                {t("JWT STORED IN localStorage UNDER tg_token AND ATTACHED TO WRITE REQUESTS.")}
              </div>
              <button
                onClick={() => {
                  setToken(null);
                  localStorage.removeItem("tg_user");
                  setUser(null);
                  setAuthMsg(t("SIGNED OUT"));
                }}
                className={btnGhost + " w-full"}
              >
                {t("Sign out")}
              </button>
            </div>
          ) : (
            <form onSubmit={login} className="space-y-3">
              <Field label="EMAIL">
                <input
                  type="email"
                  required
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@terraguard.local"
                />
              </Field>
              <Field label="PASSWORD">
                <input
                  type="password"
                  required
                  className={inputCls}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
              <button type="submit" disabled={authBusy} className={btnPrimary + " w-full"}>
                <LogIn className="w-3.5 h-3.5" /> {authBusy ? t("SIGNING IN…") : t("SIGN IN")}
              </button>
              {authMsg && (
                <div className="text-[10px] font-mono text-emerald-400 border border-emerald-800/60 bg-emerald-950/30 rounded px-2 py-1.5">
                  {authMsg}
                </div>
              )}
              {authErr && (
                <div className="text-[10px] font-mono text-red-400 border border-red-800/60 bg-red-950/30 rounded px-2 py-1.5 break-words">
                  {authErr}
                </div>
              )}
              <div className="text-[10px] font-mono text-slate-600 leading-relaxed border-t border-line pt-2">
                SEED USERS (README): admin@terraguard.local / admin123 ·
                analyst@terraguard.local / analyst123 · viewer@terraguard.local / viewer123
              </div>
            </form>
          )}
        </Panel>
      </div>
    </div>
  );
}
