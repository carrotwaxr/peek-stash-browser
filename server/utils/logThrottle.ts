/**
 * Lets a repeated log line through at most once per window per key, so a
 * client that repeats a bad request cannot flood the log.
 */

const MAX_KEYS = 1000;
const lastLogged = new Map<string, number>();

/** True when `key` has not been logged within the last `windowMs`; records it. */
export function shouldLogOnce(
  key: string,
  windowMs: number,
  now = Date.now()
): boolean {
  const last = lastLogged.get(key);
  if (last !== undefined && now - last < windowMs) return false;
  // Bounded: past 1000 keys start over rather than grow without limit
  if (last === undefined && lastLogged.size >= MAX_KEYS) lastLogged.clear();
  lastLogged.set(key, now);
  return true;
}

/** The Map is module state: tests clear it between cases. */
export function _resetLogThrottleForTesting(): void {
  lastLogged.clear();
}
