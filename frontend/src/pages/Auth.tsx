import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { UserRound, LogIn, UserPlus } from "lucide-react";
import { postJSON, setToken } from "../lib/api";
import type { LoginResponse } from "../lib/types";
import { useT } from "../lib/i18n";
import { LangSwitcher } from "../components/LangSwitcher";
import { btnPrimary, btnGhost, Field, inputCls } from "../components/ui";

/**
 * Standalone auth pages (no AppShell): login + self-service registration.
 * On success the returned token + user are persisted (tg_token / tg_user) and
 * the user is redirected to the dashboard. Roles: new accounts start as
 * VIEWER via POST /api/auth/register.
 */

const USER_KEY = "tg_user";

function readStoredUser(): unknown {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const DEMO_ACCOUNTS: { role: string; email: string; password: string }[] = [
  { role: "ADMIN", email: "admin@terraguard.local", password: "admin123" },
  { role: "ANALYST", email: "analyst@terraguard.local", password: "analyst123" },
  { role: "VIEWER", email: "viewer@terraguard.local", password: "viewer123" },
  { role: "FIELD OFFICER", email: "field@terraguard.local", password: "field123" },
];

function BrandHeader() {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-2 mb-6">
      <img
        src="/favicon.svg"
        alt="TerraGuard AI"
        className="w-14 h-14 rounded-xl ring-1 ring-emerald-500/40 shadow-lg shadow-emerald-950/40"
      />
      <div className="text-center">
        <div className="text-lg font-black font-mono tracking-[0.2em] text-slate-100">
          TERRAGUARD <span className="text-emerald-400">AI</span>
        </div>
        <div className="text-[10px] font-mono tracking-widest text-slate-500 mt-1">
          {t("DISASTER RESPONSE COMMAND CENTER")}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // already authenticated -> straight to the app
  if (readStoredUser()) return <Navigate to="/dashboard" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = await postJSON<LoginResponse>("/api/auth/login", { email, password });
      setToken(body.token);
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(body.user));
      } catch {
        /* storage unavailable */
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-4 py-10 relative">
      <div className="absolute top-3 right-4">
        <LangSwitcher compact />
      </div>
      <div className="w-full max-w-md">
        <BrandHeader />
        <div className="rounded-lg border border-line bg-panel/80 backdrop-blur-sm shadow-2xl shadow-black/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-line bg-panel2/70 flex items-center gap-2">
            <LogIn className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-mono font-bold tracking-[0.16em] uppercase text-slate-200">
              {t("SIGN IN")}
            </span>
          </div>
          <form className="p-4 space-y-3" onSubmit={submit}>
            <Field label={t("Email")}>
              <input
                className={inputCls}
                type="email"
                name="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label={t("Password")}>
              <input
                className={inputCls}
                type="password"
                name="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            {error && <div className="text-[11px] font-mono text-red-400 break-words">{error}</div>}
            <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>
              {busy ? t("Signing in…") : t("Sign in")}
            </button>
          </form>
        </div>

        <div className="mt-4 rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-4 py-3">
          <div className="text-[10px] font-mono font-bold tracking-widest uppercase text-emerald-300 mb-2">
            {t("DEMO ACCESS — SEEDED ACCOUNTS")}
          </div>
          <div className="space-y-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(a.password);
                  setError(null);
                }}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-line bg-panel2/70 text-left hover:border-emerald-700 transition-colors"
              >
                <span className="text-[10px] font-mono font-bold text-emerald-300">
                  {t(a.role)}
                </span>
                <span className="text-[10px] font-mono text-slate-500 truncate">
                  {a.email} / {a.password}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 text-center">
          <Link
            to="/register"
            className="text-[11px] font-mono text-slate-400 hover:text-emerald-300 underline decoration-emerald-800 underline-offset-2"
          >
            {t("Don't have an account? Create one")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const t = useT();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (readStoredUser()) return <Navigate to="/dashboard" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError(t("Email"));
      return;
    }
    if (password.length < 8) {
      setError(t("Minimum 8 characters"));
      return;
    }
    if (password !== confirm) {
      setError(t("Passwords do not match"));
      return;
    }
    setBusy(true);
    try {
      const body = await postJSON<LoginResponse>("/api/auth/register", {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      setToken(body.token);
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(body.user));
      } catch {
        /* storage unavailable */
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account creation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-4 py-10 relative">
      <div className="absolute top-3 right-4">
        <LangSwitcher compact />
      </div>
      <div className="w-full max-w-md">
        <BrandHeader />
        <div className="rounded-lg border border-line bg-panel/80 backdrop-blur-sm shadow-2xl shadow-black/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-line bg-panel2/70 flex items-center gap-2">
            <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-mono font-bold tracking-[0.16em] uppercase text-slate-200">
              {t("CREATE ACCOUNT")}
            </span>
          </div>
          <form className="p-4 space-y-3" onSubmit={submit}>
            <Field label={t("Name")}>
              <input
                className={inputCls}
                type="text"
                name="name"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </Field>
            <Field label={t("Email")}>
              <input
                className={inputCls}
                type="email"
                name="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label={`${t("Password")} (${t("Minimum 8 characters")})`}>
              <input
                className={inputCls}
                type="password"
                name="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label={t("Confirm password")}>
              <input
                className={inputCls}
                type="password"
                name="confirm"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            {error && <div className="text-[11px] font-mono text-red-400 break-words">{error}</div>}
            <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>
              {busy ? t("Creating account…") : t("Create account")}
            </button>
          </form>
        </div>
        <div className="mt-4 text-center">
          <Link
            to="/login"
            className={btnGhost}
          >
            <UserRound className="w-3 h-3" /> {t("Already have an account? Sign in")}
          </Link>
        </div>
      </div>
    </div>
  );
}