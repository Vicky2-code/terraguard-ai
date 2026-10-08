import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON, postJSON } from "../lib/api";
import type { ScenarioState } from "../lib/types";
import { useLive } from "./useLive";

/**
 * Emergency scenario state + controls. The scenario is server-side and
 * simulated; starting it never sends real notifications.
 */
export function useScenario() {
  const { version, lastEvent } = useLive();
  const [state, setState] = useState<ScenarioState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await getJSON<ScenarioState>("/api/scenario");
      setState(s);
      setError(null);
      loadedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "scenario status unavailable");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // refetch when server pushes scenario events (or general version bumps)
  useEffect(() => {
    if (!loadedRef.current) return;
    if (!lastEvent) {
      void refresh();
      return;
    }
    if (lastEvent.type === "scenario_step" || lastEvent.type === "heartbeat") void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const act = useCallback(
    async (action: "start" | "pause" | "reset" | "step") => {
      setBusy(true);
      try {
        const s = await postJSON<ScenarioState>("/api/scenario", { action });
        setState(s);
        setError(null);
        return s;
      } catch (err) {
        setError(err instanceof Error ? err.message : "scenario action failed");
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { state, error, busy, act, refresh };
}
