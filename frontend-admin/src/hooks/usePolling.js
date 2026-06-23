// src/hooks/usePolling.js
import { useEffect, useRef } from "react";

/**
 * usePolling(fn, intervalMs, deps)
 * Calls fn() immediately, then every intervalMs milliseconds.
 * In-flight guard prevents overlapping calls on slow connections.
 * Skips polling when deps[0] is falsy (e.g. authed === false).
 *
 * Usage: usePolling(loadAll, 3000, [authed]);
 */
export function usePolling(fn, intervalMs = 5000, deps = []) {
  const inFlight = useRef(false);
  const fnRef    = useRef(fn);

  useEffect(() => { fnRef.current = fn; }, [fn]);

  useEffect(() => {
    if (deps.length > 0 && !deps[0]) return;

    const run = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await fnRef.current();
      } catch (err) {
        console.warn("[usePolling] error:", err);
      } finally {
        inFlight.current = false;
      }
    };

    run();
    const id = setInterval(run, intervalMs);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
