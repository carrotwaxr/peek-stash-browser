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
  if (typeof session.startTime === "string") return session.startTime;
  if (typeof session.time === "string") return session.time;
  return null;
}
