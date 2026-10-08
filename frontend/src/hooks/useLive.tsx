import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { apiUrl, getJSON } from "../lib/api";
import type { StatusResponse } from "../lib/types";

export type LiveStatus = "CONNECTED" | "RECONNECTING" | "OFFLINE";

export interface LiveEvent {
  type: string;
  data: unknown;
  ts: string;
}

interface LiveContextValue {
  status: LiveStatus;
  /** ISO timestamp of last successful contact with the backend */
  lastSyncAt: string | null;
  /** derived: last sync older than staleAfterSeconds */
  stale: boolean;
  staleAfterSeconds: number;
  /** incremented on every received event or poll success — use to refetch */
  version: number;
  lastEvent: LiveEvent | null;
  transport: "sse" | "poll";
  backend: StatusResponse | null;
  backendError: string | null;
}

const LiveContext = createContext<LiveContextValue | null>(null);

const STALE_AFTER = 90;

/**
 * Realtime layer: opens GET /api/stream (SSE). If the stream cannot be
 * established or drops, falls back to polling /api/status every 15s.
 * Exposes a monotonically increasing `version` so pages can refetch.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LiveStatus>("RECONNECTING");
  const [transport, setTransport] = useState<"sse" | "poll">("sse");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null);
  const [backend, setBackend] = useState<StatusResponse | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const seenSync = useRef<string | null>(null);

  const markSync = useCallback(() => {
    const iso = new Date().toISOString();
    seenSync.current = iso;
    setLastSyncAt(iso);
    setVersion((v) => v + 1);
  }, []);

  // clock for staleness derivation
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  // ---- SSE with auto-reconnect ----
  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: number | null = null;
    let closed = false;
    let attempts = 0;

    const connect = () => {
      if (closed) return;
      try {
        source = new EventSource(apiUrl("/api/stream"));
      } catch {
        setStatus("OFFLINE");
        scheduleRetry();
        return;
      }

      source.onopen = () => {
        attempts = 0;
        setStatus("CONNECTED");
        setTransport("sse");
        markSync();
      };

      const handle = (type: string) => (ev: MessageEvent) => {
        let payload: unknown = null;
        try {
          payload = JSON.parse(ev.data as string);
        } catch {
          payload = ev.data;
        }
        const evt: LiveEvent = {
          type,
          data: payload,
          ts: new Date().toISOString(),
        };
        setLastEvent(evt);
        markSync();
        setStatus("CONNECTED");
        setTransport("sse");
      };

      // named events + default message channel
      const types = [
        "heartbeat",
        "risk_update",
        "alert_created",
        "incident_created",
        "scenario_step",
        "pipeline_status",
        "settings_changed",
        "message",
      ];
      for (const t of types) source.addEventListener(t, handle(t) as EventListener);

      source.onerror = () => {
        if (closed) return;
        setStatus("RECONNECTING");
        try {
          source?.close();
        } catch {
          /* already closed */
        }
        source = null;
        scheduleRetry();
      };
    };

    const scheduleRetry = () => {
      if (closed || retryTimer !== null) return;
      attempts += 1;
      const delay = Math.min(15000, 1500 * attempts);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      try {
        source?.close();
      } catch {
        /* noop */
      }
    };
  }, [markSync]);

  // ---- polling fallback / status mirror ----
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const st = await getJSON<StatusResponse>("/api/status");
        if (stopped) return;
        setBackend(st);
        setBackendError(null);
        markSync();
        setStatus((prev) => (prev === "OFFLINE" ? "RECONNECTING" : prev));
      } catch (err) {
        if (stopped) return;
        setBackendError(err instanceof Error ? err.message : "status check failed");
        setStatus("OFFLINE");
      }
    };
    void tick();
    const id = window.setInterval(tick, 15000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [markSync]);

  const stale = useMemo(() => {
    if (!lastSyncAt) return true;
    return (now - Date.parse(lastSyncAt)) / 1000 > STALE_AFTER;
  }, [lastSyncAt, now]);

  const value: LiveContextValue = {
    status,
    lastSyncAt,
    stale,
    staleAfterSeconds: STALE_AFTER,
    version,
    lastEvent,
    transport,
    backend,
    backendError,
  };

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used inside <LiveProvider>");
  return ctx;
}
