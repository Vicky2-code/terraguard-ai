import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing, CheckCheck, Send, Trash2, Volume2, VolumeX, WifiOff } from "lucide-react";
import { levelColor, useNotifications, type NotificationItem } from "../lib/notifications";
import { useT } from "../lib/i18n";

function Switch({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className="flex items-center justify-between w-full gap-2 py-1 text-left"
    >
      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">{label}</span>
      <span
        className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
          on ? "bg-emerald-600" : "bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function ItemRow({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left px-3 py-2 border-b border-line/60 hover:bg-panel2/60 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: levelColor(item.level) }} />
        <span
          className="text-[10px] font-mono font-bold tracking-wider uppercase truncate"
          style={{ color: levelColor(item.level) }}
        >
          {item.title}
        </span>
        <span className="ml-auto text-[9px] font-mono text-slate-500 shrink-0">
          {new Date(item.at).toLocaleTimeString("en-IN", { hour12: false })}
        </span>
      </div>
      <div className="mt-0.5 text-[10px] text-slate-400 leading-snug line-clamp-2">{item.body}</div>
      <div className="mt-1 flex items-center gap-2 text-[8px] font-mono uppercase tracking-wider">
        {item.location && <span className="text-slate-500">{item.location}</span>}
        {(item.simulation || item.offline) && (
          <span className="text-purple-400 border border-purple-700/50 rounded px-1">
            {item.offline ? "OFFLINE · SIMULATED_LOCAL" : "SIMULATED_LOCAL"}
          </span>
        )}
      </div>
    </button>
  );
}

export function NotificationBell() {
  const t = useT();
  const n = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) n.markAllRead();
    setOpen((v) => !v);
  };

  const onEnable = async () => {
    const p = await n.requestPermission();
    if (p !== "granted") setTestMsg(t("Permission was not granted — alerts will still show in-app."));
  };

  const onTest = async () => {
    const res = await n.sendTest();
    setTestMsg(
      res.offline
        ? t("Offline alert generated locally (SIMULATED_LOCAL).")
        : t("Alert dispatched and broadcast."),
    );
    window.setTimeout(() => setTestMsg(null), 4000);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className={`relative inline-flex items-center justify-center h-8 w-8 rounded border transition-colors ${
          n.online
            ? "border-slate-700/60 text-slate-300 hover:bg-slate-800"
            : "border-amber-600/70 text-amber-300 hover:bg-amber-950/40"
        }`}
        aria-label={t("Alert notifications")}
        title={t("Alert notifications")}
      >
        {n.unread > 0 ? <BellRing className="w-4 h-4 blink" /> : <Bell className="w-4 h-4" />}
        {n.unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-mono font-bold flex items-center justify-center leading-none">
            {n.unread > 99 ? "99+" : n.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(94vw,360px)] z-[110] rounded-lg border border-line bg-panel shadow-2xl shadow-black/70 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-line bg-head/80">
            <Bell className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-slate-100">
              {t("Alert notifications")}
            </span>
            <span
              className={`ml-auto text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-[2px] rounded border ${
                n.online
                  ? "border-emerald-700/60 text-emerald-400 bg-emerald-950/40"
                  : "border-amber-700/60 text-amber-400 bg-amber-950/40"
              }`}
            >
              {n.online ? t("ONLINE") : t("OFFLINE")}
            </span>
          </div>

          <div className="px-3 py-2.5 space-y-1 border-b border-line/70">
            {!n.supported ? (
              <p className="text-[10px] text-amber-400 font-mono">
                {t("System notifications are not supported in this browser.")}
              </p>
            ) : n.permission !== "granted" ? (
              <button
                onClick={() => void onEnable()}
                className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded text-[10px] font-mono font-bold uppercase tracking-wider border border-emerald-700 text-emerald-300 hover:bg-emerald-900/40"
              >
                <BellRing className="w-3.5 h-3.5" /> {t("Enable browser notifications")}
              </button>
            ) : (
              <Switch
                on={n.browserEnabled}
                onClick={() => n.setBrowserEnabled(!n.browserEnabled)}
                label={t("System notifications")}
              />
            )}
            <Switch
              on={n.soundEnabled}
              onClick={() => n.setSoundEnabled(!n.soundEnabled)}
              label={t("Alert sound")}
            />
            <Switch
              on={n.autoAlerts}
              onClick={() => n.setAutoAlerts(!n.autoAlerts)}
              label={t("Auto alerts")}
            />
            {n.autoAlerts && (
              <p className="text-[9px] font-mono text-slate-500 leading-snug pt-0.5">
                {t("Automatic alerts every")} {n.autoSeconds}s —{" "}
                {t("online via server broadcast, offline generated locally.")}
              </p>
            )}
            {!n.online && (
              <p className="flex items-center gap-1.5 text-[9px] font-mono text-amber-400 pt-0.5">
                <WifiOff className="w-3 h-3" />
                {t("Offline — alerts are generated locally and labelled SIMULATED_LOCAL.")}
              </p>
            )}
          </div>

          <div className="px-3 py-2 border-b border-line/70 flex items-center gap-2">
            <button
              onClick={() => void onTest()}
              className="inline-flex items-center justify-center gap-1.5 h-7 px-2.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border border-red-600/70 text-red-300 hover:bg-red-950/40"
            >
              <Send className="w-3 h-3" /> {t("Send test alert")}
            </button>
            {n.soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-600" />
            )}
            <span className="ml-auto text-[9px] font-mono text-slate-500 uppercase">
              {n.items.length} {t("recent")}
            </span>
          </div>

          {testMsg && (
            <div className="px-3 py-1.5 text-[9px] font-mono text-emerald-300 bg-emerald-950/30 border-b border-line/70">
              {testMsg}
            </div>
          )}

          <div className="max-h-[46vh] overflow-y-auto">
            {n.items.length === 0 ? (
              <div className="px-3 py-6 text-center text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                {t("No alerts yet")}
              </div>
            ) : (
              n.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onOpen={() => {
                    setOpen(false);
                    navigate("/early-alerts");
                  }}
                />
              ))
            )}
          </div>

          <div className="flex items-center justify-between px-3 py-1.5 border-t border-line bg-head/60">
            <button
              onClick={n.clearAll}
              className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-500 hover:text-red-400 uppercase tracking-wider"
            >
              <Trash2 className="w-3 h-3" /> {t("Clear")}
            </button>
            <button
              onClick={n.markAllRead}
              className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-500 hover:text-emerald-400 uppercase tracking-wider"
            >
              <CheckCheck className="w-3 h-3" /> {t("Mark all read")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
