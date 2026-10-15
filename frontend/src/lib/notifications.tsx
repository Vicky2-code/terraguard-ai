/**
 * Real-time alert notifications (online + offline).
 *
 * - Listens to the SSE `alert_created` / `incident_created` events and turns
 *   them into: an in-app toast, a system notification (via the service worker)
 *   and an optional audible chime.
 * - Automatic engine (no button needed): on an interval it raises an alert by
 *   itself — when online it dispatch-messages the backend (`auto_scheduler`),
 *   which persists + broadcasts over SSE; when offline it generates a
 *   clearly-labelled local simulated alert. Either way a pop-up appears.
 * - Works offline: system notifications are rendered locally by the service
 *   worker (no server push required) and the auto engine keeps firing.
 *
 * Everything raised here is labelled SIMULATED_LOCAL / DEMO. No SMS, email,
 * siren or remote push is ever delivered.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { apiUrl, getToken } from "./api";
import { useLive, type LiveEvent } from "../hooks/useLive";

export type NotifyPermission = "unsupported" | "default" | "granted" | "denied";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  level: string; // risk level / severity
  location: string;
  at: number; // epoch ms
  simulation: boolean;
  offline: boolean;
  read: boolean;
}

interface NotificationContextValue {
  supported: boolean;
  permission: NotifyPermission;
  browserEnabled: boolean;
  soundEnabled: boolean;
  autoAlerts: boolean;
  /** Auto-alert cadence in seconds (displayed in the UI). */
  autoSeconds: number;
  online: boolean;
  items: NotificationItem[];
  unread: number;
  setBrowserEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setAutoAlerts: (v: boolean) => void;
  requestPermission: () => Promise<NotifyPermission>;
  sendTest: () => Promise<{ ok: boolean; offline: boolean }>;
  markAllRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const ITEMS_KEY = "tg_notifications";
const ENABLED_KEY = "tg_notify";
const SOUND_KEY = "tg_notify_sound";
const AUTO_KEY = "tg_notify_auto";
const MAX_ITEMS = 40;
const TOAST_MS = 9000;
/** Automatic alert cadence: first pop shortly after load, then every interval. */
const AUTO_INTERVAL_MS = 30000;
const AUTO_FIRST_DELAY_MS = 8000;
const AUTO_MAX_PER_SESSION = 60;

/** Demo alert templates used for the offline generator / fallback. */
const OFFLINE_TEMPLATES: { title: string; body: string; level: string; location: string }[] = [
  {
    title: "OFFLINE ALERT — CRITICAL",
    body: "Rainfall threshold breached; slope saturation critical near NH-37 corridor.",
    level: "CRITICAL",
    location: "Jakhalabandha",
  },
  {
    title: "OFFLINE ALERT — HIGH",
    body: "Sustained rainfall with rising soil moisture. Monitor evacuation routes.",
    level: "HIGH",
    location: "Darjeeling",
  },
  {
    title: "OFFLINE ALERT — HIGH",
    body: "River level rising above alert stage; low-lying wards exposed.",
    level: "HIGH",
    location: "Guwahati",
  },
  {
    title: "OFFLINE ALERT — MODERATE",
    body: "Soil moisture trending up over the last 6 hours. Field check advised.",
    level: "MODERATE",
    location: "Shillong",
  },
];

function perm(): NotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotifyPermission;
}

function readItems(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    const parsed = raw ? (JSON.parse(raw) as NotificationItem[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

function levelColor(level: string): string {
  const key = (level || "").toUpperCase().replace("_", " ");
  if (key === "CRITICAL") return "#f87171";
  if (key === "VERY HIGH" || key === "HIGH") return "#fb923c";
  if (key === "MODERATE") return "#facc15";
  return "#34d399";
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let audioCtx: AudioContext | null = null;
function playChime(level: string) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const tones = level === "CRITICAL" ? [880, 660, 880] : [740, 990];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  } catch {
    /* audio unavailable — silently ignore */
  }
}

async function showSystemNotification(title: string, body: string, tag: string) {
  if (perm() !== "granted") return;
  const options: NotificationOptions = {
    body,
    tag,
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: { url: "/early-alerts" },
  };
  try {
    if (navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
  } catch {
    /* fall through to the constructor */
  }
  try {
    // eslint-disable-next-line no-new
    new Notification(title, options);
  } catch {
    /* notifications unavailable */
  }
}

/**
 * The SSE broker frames each event as `{"type", "data", "ts"}`, and useLive
 * hands that whole object back as `LiveEvent.data`. Unwrap the inner payload so
 * handlers see the actual record (alert/incident), while still tolerating an
 * already-flat payload.
 */
function unwrapEventData(evt: LiveEvent): unknown {
  const d = evt.data as Record<string, unknown> | null;
  if (d && typeof d === "object" && "data" in d && "type" in d) {
    return (d as { data: unknown }).data;
  }
  return evt.data;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { lastEvent, status } = useLive();
  const { pathname } = useLocation();
  // Don't run the automatic demo cadence on the auth screens.
  const onAuthScreen = pathname === "/login" || pathname === "/register";
  const [permission, setPermission] = useState<NotifyPermission>(perm);
  const [browserEnabled, setBrowserEnabledState] = useState(() => readBool(ENABLED_KEY, false));
  const [soundEnabled, setSoundEnabledState] = useState(() => readBool(SOUND_KEY, true));
  const [autoAlerts, setAutoAlertsState] = useState(() => readBool(AUTO_KEY, true));
  const [items, setItems] = useState<NotificationItem[]>(readItems);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  const seen = useRef<Set<string>>(new Set(items.map((i) => i.id)));
  const templateIdx = useRef(0);

  const persist = useCallback((next: NotificationItem[]) => {
    try {
      localStorage.setItem(ITEMS_KEY, JSON.stringify(next.slice(0, MAX_ITEMS)));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const setBrowserEnabled = useCallback((v: boolean) => {
    setBrowserEnabledState(v);
    try {
      localStorage.setItem(ENABLED_KEY, v ? "1" : "0");
    } catch {
      /* noop */
    }
    if (v && perm() === "default") void Notification.requestPermission().then((p) => setPermission(p as NotifyPermission));
  }, []);

  const setSoundEnabled = useCallback((v: boolean) => {
    setSoundEnabledState(v);
    try {
      localStorage.setItem(SOUND_KEY, v ? "1" : "0");
    } catch {
      /* noop */
    }
    if (v) playChime("HIGH"); // unlock audio on the user gesture
  }, []);

  const setAutoAlerts = useCallback((v: boolean) => {
    setAutoAlertsState(v);
    try {
      localStorage.setItem(AUTO_KEY, v ? "1" : "0");
    } catch {
      /* noop */
    }
  }, []);

  const emit = useCallback(
    (item: Omit<NotificationItem, "read">) => {
      const full: NotificationItem = { ...item, read: false };
      setItems((prev) => {
        const next = [full, ...prev].slice(0, MAX_ITEMS);
        persist(next);
        return next;
      });
      setToasts((prev) => [full, ...prev].slice(0, 4));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== full.id));
      }, TOAST_MS);
      if (soundEnabled) playChime(full.level);
      if (browserEnabled && perm() === "granted") {
        void showSystemNotification(full.title, full.body, full.id);
      }
    },
    [browserEnabled, soundEnabled, persist],
  );

  // ---- SSE alert / incident events ----
  useEffect(() => {
    if (!lastEvent) return;
    handleEvent(lastEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  const handleEvent = useCallback(
    (evt: LiveEvent) => {
      if (evt.type === "alert_created") {
        const a = unwrapEventData(evt) as {
          id?: number;
          location_name?: string;
          risk_level?: string;
          message?: string;
          simulation?: boolean;
        } | null;
        if (!a) return;
        const key = `alert-${a.id ?? `${a.location_name}-${a.risk_level}-${Date.now()}`}`;
        if (seen.current.has(key)) return;
        seen.current.add(key);
        emit({
          id: key,
          title: `ALERT — ${(a.risk_level || "HIGH").replace("_", " ")}`,
          body: a.message || `Risk threshold exceeded at ${a.location_name || "a monitored location"}.`,
          level: a.risk_level || "HIGH",
          location: a.location_name || "",
          at: Date.now(),
          simulation: Boolean(a.simulation),
          offline: false,
        });
      } else if (evt.type === "incident_created") {
        const i = unwrapEventData(evt) as {
          id?: number;
          public_id?: string;
          type?: string;
          severity?: string;
          description?: string;
          location_name?: string;
        } | null;
        if (!i) return;
        const key = `incident-${i.public_id ?? i.id ?? Date.now()}`;
        if (seen.current.has(key)) return;
        seen.current.add(key);
        emit({
          id: key,
          title: `INCIDENT — ${(i.type || "REPORTED").replace("_", " ")}`,
          body: i.description || `New field incident reported at ${i.location_name || "a monitored location"}.`,
          level: i.severity || "MODERATE",
          location: i.location_name || "",
          at: Date.now(),
          simulation: false,
          offline: false,
        });
      }
    },
    [emit],
  );

  // ---- online / offline tracking ----
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const backendDown = status === "OFFLINE";
  const isEffectivelyOffline = !online || backendDown;

  // Keep a stable reference to `emit` so the offline generator interval is not
  // torn down / re-fired whenever a preference toggles.
  const emitRef = useRef(emit);
  useEffect(() => {
    emitRef.current = emit;
  }, [emit]);

  const emitOffline = useCallback(() => {
    const tpl = OFFLINE_TEMPLATES[templateIdx.current % OFFLINE_TEMPLATES.length];
    templateIdx.current += 1;
    emitRef.current({
      id: makeId("offline"),
      title: tpl.title,
      body: tpl.body,
      level: tpl.level,
      location: tpl.location,
      at: Date.now(),
      simulation: true,
      offline: true,
    });
  }, []);

  // ---- shared remote dispatch (used by the button AND the auto engine) ----
  const dispatchRemote = useCallback(
    async (source: string): Promise<boolean> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return false;
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const token = getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(apiUrl("/api/alerts/dispatch"), {
          method: "POST",
          headers,
          body: JSON.stringify({ source }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as {
          id?: number;
          location_name?: string;
          risk_level?: string;
          message?: string;
          simulation?: boolean;
        };
        const key = `alert-${data.id ?? Date.now()}`;
        if (!seen.current.has(key)) {
          seen.current.add(key);
          emit({
            id: key,
            title: `ALERT — ${(data.risk_level || "HIGH").replace("_", " ")}`,
            body:
              data.message ||
              `Risk threshold exceeded at ${data.location_name || "a monitored location"}.`,
            level: data.risk_level || "HIGH",
            location: data.location_name || "",
            at: Date.now(),
            simulation: Boolean(data.simulation),
            offline: false,
          });
        }
        return true;
      } catch {
        return false;
      }
    },
    [emit],
  );

  // Automatic engine: online -> server dispatch (persisted + broadcast over SSE
  // to every connected client); offline -> locally generated SIMULATED_LOCAL
  // alert. Either way the pop-up appears without anyone clicking a button.
  const triggerAuto = useCallback(async () => {
    const delivered = await dispatchRemote("auto_scheduler");
    if (!delivered) emitOffline();
  }, [dispatchRemote, emitOffline]);

  const autoCount = useRef(0);

  // Keep the latest trigger in a ref so preference toggles don't restart the
  // cadence (which would fire an extra "first" alert).
  const triggerAutoRef = useRef(triggerAuto);
  useEffect(() => {
    triggerAutoRef.current = triggerAuto;
  }, [triggerAuto]);

  // ---- automatic alert cadence (no button needed) ----
  useEffect(() => {
    if (!autoAlerts || onAuthScreen) return;
    if (autoCount.current >= AUTO_MAX_PER_SESSION) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled || autoCount.current >= AUTO_MAX_PER_SESSION) return;
      autoCount.current += 1;
      void triggerAutoRef.current();
    };
    // Quick first pop so a demo shows an alert without waiting a full cycle.
    const delay = isEffectivelyOffline ? 1500 : AUTO_FIRST_DELAY_MS;
    const first = window.setTimeout(tick, delay);
    const interval = window.setInterval(tick, AUTO_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [autoAlerts, isEffectivelyOffline, onAuthScreen]);

  const requestPermission = useCallback(async (): Promise<NotifyPermission> => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return "unsupported";
    }
    try {
      const p = (await Notification.requestPermission()) as NotifyPermission;
      setPermission(p);
      if (p === "granted") setBrowserEnabled(true);
      return p;
    } catch {
      return perm();
    }
  }, [setBrowserEnabled]);

  const sendTest = useCallback(async (): Promise<{ ok: boolean; offline: boolean }> => {
    const delivered = await dispatchRemote("manual_dispatch");
    if (delivered) return { ok: true, offline: false };
    emitOffline();
    return { ok: true, offline: true };
  }, [dispatchRemote, emitOffline]);

  const markAllRead = useCallback(() => {
    setItems((prev) => {
      const next = prev.map((i) => ({ ...i, read: true }));
      persist(next);
      return next;
    });
  }, [persist]);

  const clearAll = useCallback(() => {
    seen.current = new Set();
    setItems([]);
    setToasts([]);
    persist([]);
  }, [persist]);

  const unread = useMemo(() => items.filter((i) => !i.read).length, [items]);

  const value: NotificationContextValue = {
    supported: permission !== "unsupported",
    permission,
    browserEnabled,
    soundEnabled,
    autoAlerts,
    autoSeconds: Math.round(AUTO_INTERVAL_MS / 1000),
    online: !isEffectivelyOffline,
    items,
    unread,
    setBrowserEnabled,
    setSoundEnabled,
    setAutoAlerts,
    requestPermission,
    sendTest,
    markAllRead,
    clearAll,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </NotificationContext.Provider>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: NotificationItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[120] flex flex-col gap-2 w-[min(92vw,340px)]">
      {toasts.map((n) => (
        <button
          key={n.id}
          onClick={() => onDismiss(n.id)}
          className="tg-toast text-left rounded-lg border bg-panel/95 backdrop-blur shadow-2xl shadow-black/60 px-3 py-2.5"
          style={{ borderColor: levelColor(n.level) }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full blink" style={{ background: levelColor(n.level) }} />
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase" style={{ color: levelColor(n.level) }}>
              {n.title}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-300 leading-snug">{n.body}</div>
          <div className="mt-1.5 flex items-center gap-2 text-[9px] font-mono text-slate-500 uppercase tracking-wider">
            {n.location && <span>{n.location}</span>}
            <span>{new Date(n.at).toLocaleTimeString("en-IN", { hour12: false })}</span>
            {(n.simulation || n.offline) && (
              <span className="text-purple-400 border border-purple-700/60 rounded px-1">
                {n.offline ? "OFFLINE · SIMULATED_LOCAL" : "SIMULATED_LOCAL"}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationProvider>");
  return ctx;
}

export { levelColor };
