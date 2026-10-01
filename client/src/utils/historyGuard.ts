/**
 * The fullscreen guard's own Back. On mobile, entering fullscreen pushes a
 * guard history entry, and leaving it goes back over that entry; the player's
 * provider must not follow that Back to the older entry (a queue step taken
 * in fullscreen replaced the guard's entry, not the one below it).
 *
 * The guard marks its Back; the provider takes the mark on the location
 * change it causes. A Back the router never sees as a new location (nothing
 * was replaced) leaves the mark unread, so it expires after MARK_TTL_MS.
 */
const MARK_TTL_MS = 1000;

let markedAt: number | null = null;

/** Called by the fullscreen guard just before its history.back() */
export function markInternalPop(): void {
  markedAt = Date.now();
}

/** True once after a mark made within the last second */
export function takeInternalPop(): boolean {
  if (markedAt === null) return false;
  const fresh = Date.now() - markedAt <= MARK_TTL_MS;
  markedAt = null;
  return fresh;
}

/** Drops any mark (the player's provider unmounting) */
export function clearInternalPop(): void {
  markedAt = null;
}
