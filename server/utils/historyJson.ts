import type { Prisma } from "@prisma/client";

/**
 * Reads a history JSON column (oHistory, playHistory, viewHistory): a list of
 * ISO timestamp strings. Rows written by older updates hold the list
 * JSON-encoded as a string, so a string is parsed first. Anything that isn't
 * a list reads as [].
 *
 * Peek 1.0.0 and 1.0.1 appended a play session object to playHistory on
 * every ping ({ startTime, endTime, quality, duration, ... }); such an entry
 * reads as its startTime, or its time when it has no startTime, as merge
 * reconciliation sorts them. Other entries that aren't strings are dropped.
 *
 * Writes store the array itself, never JSON.stringify(...) of it.
 */
export function readHistory(value: Prisma.JsonValue | null): string[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const history: string[] = [];
  for (const entry of list) {
    const timestamp = readEntry(entry);
    if (timestamp !== null) history.push(timestamp);
  }
  return history;
}

/** An entry's timestamp: the string itself, or a 1.0 play session's start. */
function readEntry(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return null;
  }
  const session = entry as { startTime?: unknown; time?: unknown };
  if (typeof session.startTime === "string" && session.startTime !== "") {
    return session.startTime;
  }
  if (typeof session.time === "string" && session.time !== "") {
    return session.time;
  }
  return null;
}

/** A Peek timestamp this close to a Stash one is the same event. */
export const HISTORY_MERGE_WINDOW_MS = 60_000;

/**
 * Merges Stash's history of a scene into Peek's, for the admin's Sync from
 * Stash: Stash's timestamps, plus every Peek timestamp with no Stash
 * timestamp within HISTORY_MERGE_WINDOW_MS of it (an O pushed by Sync to
 * Stash reappears in Stash at nearly the same time, so both clocks are
 * assumed the same). Stash's timestamps are stored in toISOString() form,
 * as Peek writes its own; the result is ordered by time. A Stash entry that
 * is not a time is dropped; a Peek entry that is not is kept, at the end,
 * since the merge never loses a Peek event.
 */
export function mergeHistory(peek: string[], stash: string[]): string[] {
  const stashTimes = stash
    .map((entry) => Date.parse(entry))
    .filter((ms) => Number.isFinite(ms));
  const merged: Array<{ ms: number; entry: string }> = stashTimes.map((ms) => ({
    ms,
    entry: new Date(ms).toISOString(),
  }));
  const unparseable: string[] = [];
  for (const entry of peek) {
    const ms = Date.parse(entry);
    if (!Number.isFinite(ms)) {
      unparseable.push(entry);
      continue;
    }
    const sameEvent = stashTimes.some(
      (stashMs) => Math.abs(stashMs - ms) <= HISTORY_MERGE_WINDOW_MS
    );
    if (!sameEvent) merged.push({ ms, entry });
  }
  merged.sort((a, b) => a.ms - b.ms);
  return [...merged.map((item) => item.entry), ...unparseable];
}
