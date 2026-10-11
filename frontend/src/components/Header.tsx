import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Menu,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { formatIST, formatTime, useClock } from "../hooks/useClock";
import { useLive } from "../hooks/useLive";
import { btnDanger, btnGhost, Notice, Panel } from "./ui";

export interface HeaderProps {
  onToggleSidebar: () => void;
  scenario: {
    state: "IDLE" | "RUNNING" | "PAUSED";
    busy?: boolean;
    act?: (action: "start" | "pause" | "reset" | "step") => Promise<unknown>;
  } | null;
  user: { name: string; email: string; role: string } | null;
  onSignOut?: () => void;
}

/* ---------------- status pill ---------------- */

function Pill({
  tone,
  label,
  dot,
}: {
  tone: "green" | "amber" | "red" | "slate";
  label: string;
  dot?: boolean;
}) {
  const tones = {
    green: "border-emerald-700/60 text-emerald-400 bg-emerald-950/40",
    amber: "border-amber-700/60 text-amber-400 bg-amber-950/40",
    red: "border-red-700/60 text-red-400 bg-red-950/40",
    slate: "border-slate-600/60 text-slate-400 bg-slate-800/40",
  } as const;
  return (
    <span
      className={`flex items-center gap-1.5 px-2 py-[3px] rounded border text-[9px] font-mono font-bold tracking-[0.14em] uppercase ${tones[tone]}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${tone === "green" ? "bg-emerald-400 blink" : tone === "red" ? "bg-red-400" : "bg-current"}`} />}
      {label}
    </span>
  );
}

/* ---------------- confirmation modal ---------------- */

function ScenarioModal({
  open,
  onClose,
  onConfirm,
  current,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  current: string;
  busy: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm emergency scenario"
    >
      <div className="w-full max-w-md rounded-lg border border-line bg-panel shadow-2xl shadow-black/60 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-red-950/40">
          <ShieldAlert className="w-4 h-4 text-red-400" />
          <span className="text-xs font-mono font-bold tracking-[0.16em] uppercase text-red-300">
            Run Emergency Scenario?
          </span>
        </div>
        <div className="p-4 space-y-3">
          <Notice tone="purple" title="SIMULATION MODE">
            This runs a scripted simulation inside the platform. No SMS, email, siren or any real
            notification is sent to anyone.
          </Notice>
          <ul className="text-[11px] font-mono text-slate-400 space-y-1.5 list-disc pl-5">
            <li>Risk scores on affected locations will change over successive steps.</li>
            <li>Simulated alerts and timeline events are generated and stored.</li>
            <li>Every simulated alert is flagged SIMULATED_LOCAL.</li>
            <li>Current state: <span className="text-slate-200">{current}</span></li>
          </ul>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-line bg-panel2/70">
          <button onClick={onClose} className={btnGhost} disabled={busy}>
            Cancel
          </button>
          <button onClick={onConfirm} className={btnDanger} disabled={busy}>
            {busy ? "WORKING…" : "CONFIRM — START SIMULATION"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- header ---------------- */

export function Header({ onToggleSidebar, scenario, user, onSignOut }: HeaderProps) {
  const now = useClock();
  const { status, lastSyncAt, stale, transport, backend } = useLive();
  const [modalOpen, setModalOpen] = useState(false);

  const running = scenario?.state === "RUNNING";
  const paused = scenario?.state === "PAUSED";

  const handleConfirm = async () => {
    setModalOpen(false);
    try {
      await scenario?.act?.("start");
    } catch {
      /* error surfaced via scenario.error in banner */
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-head/95 backdrop-blur border-b border-line px-3 md:px-4 py-2.5 flex items-center justify-between gap-3 text-sm h-[53px]">
        {/* left: brand */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 sm:p-1.5 rounded hover:bg-slate-800 text-slate-400 border border-slate-700/60"
            aria-label="Toggle navigation"
          >
            <Menu className="w-4 h-4" />
          </button>
          <Link to="/dashboard" className="flex items-center gap-2.5 group min-w-0">
            <img
              src="/favicon.svg"
              alt="TerraGuard AI logo"
              className="w-9 h-9 rounded-lg shrink-0 ring-1 ring-emerald-500/40 group-hover:ring-emerald-400/70 transition-shadow"
            />
            <div className="min-w-0">
              <div className="text-[13px] font-black font-mono tracking-[0.2em] text-slate-100 leading-tight whitespace-nowrap">
                TERRAGUARD <span className="text-emerald-400">AI</span>
              </div>
              <p className="text-[9px] text-slate-500 hidden sm:block tracking-wide font-mono truncate">
                NER Early Warning &amp; Landslide Risk Monitoring Center
              </p>
            </div>
          </Link>
        </div>

        {/* center: clock + live status */}
        <div className="hidden xl:flex items-center gap-2">
          <span className="font-mono text-[11px] text-slate-400 tabular-nums tracking-wider border border-line rounded px-2 py-1 bg-panel2">
            {formatIST(now, true)}
          </span>
          <Pill
            tone={status === "CONNECTED" ? "green" : status === "OFFLINE" ? "red" : "amber"}
            label={status === "RECONNECTING" && !lastSyncAt ? "CONNECTING" : status}
            dot
          />
          <Pill
            tone={!lastSyncAt && status !== "OFFLINE" ? "amber" : stale ? "amber" : "green"}
            label={
              !lastSyncAt
                ? status === "OFFLINE"
                  ? "NO SYNC YET"
                  : "SYNCING…"
                : stale
                  ? "DATA STALE"
                  : `SYNCED ${lastSyncAt ? formatTime(lastSyncAt) : "—"}`
            }
          />
          <span className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">
            {transport === "sse" ? "SSE" : "POLL"}
          </span>
          {backend && (
            <Pill
              tone={backend.system === "LIVE" ? "green" : "slate"}
              label={`SYS ${backend.system}`}
            />
          )}
        </div>

        {/* right: scenario controls + user */}
        <div className="flex items-center gap-2">
          {running && (
            <span className="hidden md:flex items-center gap-1.5 px-2 py-[3px] rounded border border-purple-600/70 bg-purple-950/50 text-purple-300 text-[9px] font-mono font-bold tracking-widest uppercase blink">
              <Radio className="w-3 h-3" /> SIMULATION ACTIVE
            </span>
          )}
          <button
            onClick={() => setModalOpen(true)}
            disabled={running || paused}
            title={
              running
                ? "Scenario is running — pause or reset from the dashboard banner"
                : paused
                  ? "Scenario paused — resume from the dashboard banner"
                  : "Simulate a heavy-rainfall escalation scenario (no real alerts are sent)"
            }
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-bold tracking-wider uppercase border transition-all bg-red-600/90 hover:bg-red-500 text-white border-red-400 shadow-md shadow-red-950 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Run Emergency Scenario
          </button>
          <button
            onClick={() => setModalOpen(true)}
            disabled={running || paused}
            className="sm:hidden p-1.5 rounded bg-red-600/90 text-white border border-red-400 disabled:opacity-40"
            aria-label="Run emergency scenario"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </button>
          {paused && scenario?.act && (
            <button
              onClick={() => void scenario.act?.("reset")}
              className="hidden md:flex p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60"
              title="Reset scenario to baseline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="hidden md:flex items-center gap-2 pl-2 border-l border-line">
            <div className="flex items-center gap-1.5 text-slate-400">
              <UserRound className="w-3.5 h-3.5" />
              <span className="text-[10px] font-mono">
                {user ? (
                  <>
                    <span className="text-slate-200">{user.name}</span>
                    <span className="text-slate-500"> · {user.role}</span>
                  </>
                ) : (
                  <span className="text-slate-500">GUEST</span>
                )}
              </span>
            </div>
            {user && onSignOut && (
              <button
                onClick={onSignOut}
                className="text-[9px] font-mono text-slate-500 hover:text-red-400 uppercase tracking-wider"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* mobile status bar */}
      <div className="xl:hidden sticky top-[53px] z-40 bg-head/95 border-b border-line px-3 py-1.5 flex items-center gap-2 overflow-x-auto">
        <span className="font-mono text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
          {formatIST(now, true)}
        </span>
        <Pill
          tone={status === "CONNECTED" ? "green" : status === "OFFLINE" ? "red" : "amber"}
          label={status === "RECONNECTING" && !lastSyncAt ? "CONNECTING" : status}
          dot
        />
        <Pill
          tone={!lastSyncAt && status !== "OFFLINE" ? "amber" : stale ? "amber" : "green"}
          label={
            !lastSyncAt
              ? status === "OFFLINE"
                ? "NO SYNC YET"
                : "SYNCING…"
              : stale
                ? "DATA STALE"
                : "SYNCED"
          }
        />
        {running && <Pill tone="red" label="SIMULATION ACTIVE" dot />}
      </div>

      <ScenarioModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
        current={scenario?.state ?? "UNKNOWN"}
        busy={scenario?.busy ?? false}
      />
    </>
  );
}

/* ---------------- scenario control banner (dashboard) ---------------- */

export function ScenarioBanner({
  state,
  step,
  error,
  busy,
  act,
}: {
  state: "IDLE" | "RUNNING" | "PAUSED";
  step: number;
  error?: string | null;
  busy?: boolean;
  act: (action: "start" | "pause" | "reset" | "step") => Promise<unknown>;
}) {
  if (state === "IDLE" && !error) return null;
  return (
    <Panel
      className="mb-4"
      title={`EMERGENCY SCENARIO — ${state}`}
      icon={<Radio className="w-3.5 h-3.5" />}
      accent={state === "RUNNING" ? "#c084fc" : state === "PAUSED" ? "#facc15" : "#94a3b8"}
      actions={
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-slate-500">STEP {step}</span>
          {state === "RUNNING" && (
            <button
              onClick={() => void act("pause")}
              disabled={busy}
              className={btnGhost}
            >
              <Pause className="w-3 h-3" /> Pause
            </button>
          )}
          {state === "PAUSED" && (
            <button onClick={() => void act("start")} disabled={busy} className={btnGhost}>
              <Play className="w-3 h-3" /> Resume
            </button>
          )}
          <button onClick={() => void act("reset")} disabled={busy} className={btnGhost}>
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        <Notice tone="purple" title="SIMULATION MODE">
          Scripted simulation — risk changes, alerts and timeline events are synthetic and flagged
          SIMULATED_LOCAL. No real notifications are delivered.
        </Notice>
        {error && <div className="text-[11px] font-mono text-red-400">{error}</div>}
      </div>
    </Panel>
  );
}
