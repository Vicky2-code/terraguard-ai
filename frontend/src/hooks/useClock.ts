import { useEffect, useState } from "react";

/** Ticking clock (IST) for the header — re-renders once per second. */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const IST = "Asia/Kolkata";

export function formatIST(now: Date, withDate = false): string {
  const time = now.toLocaleTimeString("en-GB", {
    timeZone: IST,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (!withDate) return time;
  const date = now.toLocaleDateString("en-GB", {
    timeZone: IST,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${date} ${time} IST`;
}

/** Seconds-since-epoch → "12s" / "4m 10s" style age label. */
export function ageLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.floor(seconds % 60)}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function timeAgo(iso: string | undefined | null, now = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diff = Math.max(0, (now - t) / 1000);
  return ageLabel(diff);
}

export function formatTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleTimeString("en-GB", {
    timeZone: IST,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleString("en-GB", {
    timeZone: IST,
    hour12: false,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
