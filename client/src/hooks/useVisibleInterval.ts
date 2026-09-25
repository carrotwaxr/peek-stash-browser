import { useEffect, useRef } from "react";

/**
 * Calls `callback` every `delayMs` while the page is visible, and once as
 * soon as it becomes visible again: a hidden tab skips its ticks instead of
 * polling the server for nobody. Nothing runs while `enabled` is false.
 */
export function useVisibleInterval(
  callback: () => void,
  delayMs: number,
  enabled = true
): void {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return undefined;
    const runIfVisible = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    const timer = setInterval(runIfVisible, delayMs);
    document.addEventListener("visibilitychange", runIfVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", runIfVisible);
    };
  }, [delayMs, enabled]);
}
