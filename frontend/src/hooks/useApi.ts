import { useCallback, useEffect, useRef, useState } from "react";
import type { DependencyList } from "react";
import { ApiError } from "../lib/api";

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  /** true while the first load runs (no data yet) */
  loading: boolean;
  /** true while a background refresh runs with data already shown */
  refreshing: boolean;
  loadedAt: number | null;
}

/**
 * Data-fetching hook with explicit loading / success / error / retry states
 * and optional polling. The loader is read through a ref so callers may pass
 * inline closures without re-triggering fetches.
 */
export function useApi<T>(
  loader: () => Promise<T>,
  deps: DependencyList,
  opts?: { pollMs?: number },
): ApiState<T> & { refetch: () => void } {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const [state, setState] = useState<ApiState<T>>({
    data: null,
    error: null,
    loading: true,
    refreshing: false,
    loadedAt: null,
  });
  const aliveRef = useRef(true);
  const hasDataRef = useRef(false);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") {
      setState((s) => ({ ...s, refreshing: true }));
    } else {
      setState((s) => ({ ...s, loading: true, error: null }));
    }
    try {
      const data = await loaderRef.current();
      if (!aliveRef.current) return;
      hasDataRef.current = true;
      setState({ data, error: null, loading: false, refreshing: false, loadedAt: Date.now() });
    } catch (err) {
      if (!aliveRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unexpected error";
      setState((s) => ({ ...s, error: msg, loading: false, refreshing: false }));
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    aliveRef.current = true;
    void load("initial");
    return () => {
      aliveRef.current = false;
    };
  }, deps);

  const pollKey = opts?.pollMs ?? 0;
  useEffect(() => {
    if (!pollKey) return;
    const id = window.setInterval(() => {
      void load(hasDataRef.current ? "refresh" : "initial");
    }, pollKey);
    return () => window.clearInterval(id);
  }, [pollKey, load]);

  const refetch = useCallback(() => {
    void load(hasDataRef.current ? "refresh" : "initial");
  }, [load]);

  return { ...state, refetch };
}
