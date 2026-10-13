import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { Meta } from "../lib/types";
import { ageLabel, formatDateTime } from "../hooks/useClock";
import { useT } from "../lib/i18n";

/* ------------------------------------------------------------------ */
/* Panel                                                                */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  icon,
  actions,
  children,
  className = "",
  bodyClassName = "p-3",
  accent,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  accent?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-line bg-panel/80 backdrop-blur-sm overflow-hidden ${className}`}
    >
      {title !== undefined && (
        <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-panel2/70">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="text-slate-500 shrink-0">{icon}</span>}
            <h2
              className="text-[11px] font-mono font-bold uppercase tracking-[0.14em] text-slate-400 truncate"
              style={accent ? { color: accent } : undefined}
            >
              {title}
            </h2>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* KPI card                                                             */
/* ------------------------------------------------------------------ */

export type CardTone = "green" | "red" | "orange" | "purple" | "amber";

const TONES: Record<CardTone, { box: string; value: string; icon: string }> = {
  green: {
    box: "bg-emerald-950/30 border-emerald-800/40",
    value: "text-emerald-400",
    icon: "text-emerald-400",
  },
  red: {
    box: "bg-red-950/40 border-red-800/60 shadow-lg shadow-red-950/30",
    value: "text-red-400",
    icon: "text-red-400",
  },
  orange: {
    box: "bg-orange-950/40 border-orange-800/50",
    value: "text-orange-400",
    icon: "text-orange-400",
  },
  purple: {
    box: "bg-purple-950/40 border-purple-800/50",
    value: "text-purple-400",
    icon: "text-purple-400",
  },
  amber: {
    box: "bg-amber-950/40 border-amber-800/50",
    value: "text-amber-400",
    icon: "text-amber-400",
  },
};

export function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = "green",
  pulse,
  loading,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: CardTone;
  pulse?: boolean;
  loading?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div
      className={`p-3 rounded-lg border backdrop-blur flex flex-col justify-between transition-all hover:translate-y-[-2px] ${t.box}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase truncate">
          {label}
        </span>
        {icon && <span className={`${t.icon} shrink-0 ${pulse ? "animate-pulse" : ""}`}>{icon}</span>}
      </div>
      <div className="my-1.5">
        {loading ? (
          <div className="skeleton h-8 w-20" />
        ) : (
          <div className={`text-2xl font-black font-mono tracking-tight ${t.value}`}>{value}</div>
        )}
      </div>
      <div className="text-[10px] font-mono text-slate-400 truncate">
        {loading ? <span className="text-slate-500">FETCHING FROM API…</span> : sub}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data states: loading / error+retry / empty                          */
/* ------------------------------------------------------------------ */

export function LoadingBlock({ label = "LOADING DATA…" }: { label?: string }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-slate-400 font-mono text-xs">
      <div className="w-7 h-7 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
      <span className="tracking-widest">{t(label)}</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <AlertTriangle className="w-6 h-6 text-red-400" />
      <div className="text-[11px] font-mono text-red-300 max-w-md break-words">
        {t("DATA UNAVAILABLE")}
      </div>
      <div className="text-[11px] text-slate-500 max-w-md break-words">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider border border-emerald-700 text-emerald-300 hover:bg-emerald-900/40 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> {t("Retry")}
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({ label = "NO RECORDS FOUND", hint }: { label?: string; hint?: string }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
      <div className="text-[11px] font-mono tracking-widest text-slate-500">{t(label)}</div>
      {hint && <div className="text-[11px] text-slate-600">{hint}</div>}
    </div>
  );
}

/** Wraps any API-driven region with loading/error/empty handling. */
export function DataState({
  loading,
  error,
  empty,
  onRetry,
  children,
  loadingLabel,
  emptyLabel,
  emptyHint,
}: {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  onRetry?: () => void;
  children: ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyHint?: string;
}) {
  if (loading) return <LoadingBlock label={loadingLabel} />;
  if (error) return <ErrorBlock message={error} onRetry={onRetry} />;
  if (empty) return <EmptyBlock label={emptyLabel} hint={emptyHint} />;
  return <>{children}</>;
}

/* ------------------------------------------------------------------ */
/* Source strip: SOURCE / LAST UPDATED / DATA AGE / STATUS             */
/* ------------------------------------------------------------------ */

const STATUS_STYLE: Record<string, string> = {
  LIVE: "text-emerald-400 border-emerald-700/60",
  CONNECTED: "text-emerald-400 border-emerald-700/60",
  OK: "text-emerald-400 border-emerald-700/60",
  ONLINE: "text-emerald-400 border-emerald-700/60",
  STALE: "text-amber-400 border-amber-700/60",
  DEGRADED: "text-amber-400 border-amber-700/60",
  DEMO: "text-purple-400 border-purple-700/60",
  UNAVAILABLE: "text-red-400 border-red-700/60",
  OFFLINE: "text-red-400 border-red-700/60",
  SYNCING: "text-emerald-400 border-emerald-700/60",
  CONNECTING: "text-amber-400 border-amber-700/60",
  LOADING: "text-emerald-400 border-emerald-700/60",
};

export function StatusPill({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  const key = status?.toUpperCase() ?? "";
  const style = STATUS_STYLE[key] ?? "text-slate-400 border-slate-600/60";
  return (
    <span
      className={`px-1.5 py-[1px] rounded border text-[9px] font-mono font-bold tracking-wider ${style} ${className}`}
    >
      {key}
    </span>
  );
}

export function SourceStrip({
  meta,
  extra,
  className = "",
}: {
  meta?: Meta | null;
  extra?: ReactNode;
  className?: string;
}) {
  const source = meta?.source ?? "—";
  const status = meta?.source_status ?? "UNAVAILABLE";
  const t = useT();
  const updated = meta?.last_updated;
  const age = meta?.data_age_seconds;
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 border-t border-line bg-panel2/60 text-[9px] font-mono tracking-wider text-slate-500 uppercase ${className}`}
    >
      <span className="truncate max-w-[45%]">
        {t("SOURCE")}: <span className="text-slate-300">{source}</span>
      </span>
      <span>
        {t("LAST UPDATED")}: <span className="text-slate-300">{formatDateTime(updated)}</span>
      </span>
      <span>
        {t("DATA AGE")}:{" "}
        <span className="text-slate-300">
          {typeof age === "number" ? ageLabel(age) : "—"}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        {t("STATUS")}: <StatusPill status={status} />
      </span>
      {extra}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small parts                                                          */
/* ------------------------------------------------------------------ */

const RISK_COLORS: Record<string, string> = {
  LOW: "text-emerald-400 border-emerald-700/60 bg-emerald-950/40",
  MODERATE: "text-yellow-400 border-yellow-700/60 bg-yellow-950/40",
  HIGH: "text-orange-400 border-orange-700/60 bg-orange-950/40",
  VERY_HIGH: "text-red-400 border-red-700/60 bg-red-950/40",
  CRITICAL: "text-red-300 border-red-600 bg-red-950/60",
};

export function RiskBadge({ level, score }: { level: string; score?: number }) {
  const key = level?.toUpperCase() ?? "—";
  const style = RISK_COLORS[key] ?? "text-slate-400 border-slate-600";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded border text-[9px] font-mono font-bold tracking-wider ${style}`}
    >
      {key === "CRITICAL" && <span className="w-1.5 h-1.5 rounded-full bg-red-400 blink" />}
      {key}
      {score !== undefined && <span className="opacity-70">{score}</span>}
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="px-3 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
      {typeof children === "string" ? t(children) : children}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {children}
      {error ? (
        <span className="block text-[10px] font-mono text-red-400">{error}</span>
      ) : hint ? (
        <span className="block text-[10px] text-slate-600">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputCls =
  "w-full bg-panel2 border border-line rounded px-2.5 py-2 sm:py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none transition-colors";

export const btnPrimary =
  "flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded text-xs font-mono font-bold tracking-wider uppercase border transition-all bg-emerald-600/90 hover:bg-emerald-500 text-white border-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed";

export const btnGhost =
  "flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded text-xs font-mono font-bold tracking-wider uppercase border transition-all border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed";

export const btnDanger =
  "flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded text-xs font-mono font-bold tracking-wider uppercase border transition-all bg-red-600/90 hover:bg-red-500 text-white border-red-400 shadow-md shadow-red-950 disabled:opacity-50 disabled:cursor-not-allowed";

/** Page heading used on every routed page. */
export function PageHeader({
  title,
  subtitle,
  actions,
  badge,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-5 bg-emerald-500 rounded-sm" />
          <h1 className="text-lg font-black font-mono uppercase tracking-[0.18em] text-slate-100">
            {t(title)}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-[11px] text-slate-500 font-mono tracking-wide pl-3.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Honest notice banner (simulation mode, prototype model, demo data…). */
export function Notice({
  tone = "amber",
  title,
  children,
}: {
  tone?: "amber" | "red" | "purple" | "green";
  title: string;
  children?: ReactNode;
}) {
  const t = useT();
  const tones = {
    amber: "border-amber-700/50 bg-amber-950/30 text-amber-200",
    red: "border-red-700/50 bg-red-950/30 text-red-200",
    purple: "border-purple-700/50 bg-purple-950/30 text-purple-200",
    green: "border-emerald-700/50 bg-emerald-950/30 text-emerald-200",
  } as const;
  return (
    <div className={`rounded border px-3 py-2 text-[11px] font-mono leading-relaxed ${tones[tone]}`}>
      <span className="font-bold tracking-wider uppercase">{t(title)}</span>
      {children && <span className="text-slate-300"> — {children}</span>}
    </div>
  );
}
