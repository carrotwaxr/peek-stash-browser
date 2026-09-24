/**
 * Lets a repeated log line through at most once per window per key, so a
 * client that repeats a bad request cannot flood the log.
 */

const MAX_KEYS = 1000;
// A full Map is trimmed to this, so the next trim waits for 100 new keys
const TRIM_TO_KEYS = MAX_KEYS * 0.9;

interface LoggedAt {
  at: number;
  /** When this key's window passes; callers may pass different windows */
  until: number;
}

// Re-set on every log, so the Map's order is the order of last logs
const lastLogged = new Map<string, LoggedAt>();

/**
 * Makes room in a full Map without forgetting every key at once: keys whose
 * window has passed go first, then the oldest, down to 90% of the cap.
 */
function trim(now: number): void {
  for (const [key, logged] of lastLogged) {
    if (now >= logged.until) lastLogged.delete(key);
  }
  for (const key of lastLogged.keys()) {
    if (lastLogged.size <= TRIM_TO_KEYS) return;
    lastLogged.delete(key);
  }
}

/** True when `key` has not been logged within the last `windowMs`; records it. */
export function shouldLogOnce(
  key: string,
  windowMs: number,
  now = Date.now()
): boolean {
  const last = lastLogged.get(key);
  if (last !== undefined && now - last.at < windowMs) return false;
  // Bounded: only a new key grows the Map
  if (last === undefined && lastLogged.size >= MAX_KEYS) trim(now);
  lastLogged.delete(key);
  lastLogged.set(key, { at: now, until: now + windowMs });
  return true;
}

/** The Map is module state: tests clear it between cases. */
export function _resetLogThrottleForTesting(): void {
  lastLogged.clear();
}
