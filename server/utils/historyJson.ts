import type { Prisma } from "@prisma/client";

/**
 * Reads a history JSON column (oHistory, playHistory, viewHistory): a list of
 * ISO timestamp strings. Rows written by older updates hold the list
 * JSON-encoded as a string, so a string is parsed first. Anything that isn't
 * a list reads as [], and entries that aren't strings are dropped.
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
  return list.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Options for every interactive transaction on a history row.
 *
 * Prisma runs an interactive transaction on SQLite as BEGIN IMMEDIATE, so it
 * waits for the database write lock, and a second write to the same row waits
 * for the first to commit. Prisma's defaults (2 s to start, 5 s to finish)
 * are too short when the exclusion recompute's write phase holds the lock
 * (it allows itself 30 s): the history write would fail with P2028 instead
 * of waiting its turn.
 */
export const HISTORY_TX = { maxWait: 10_000, timeout: 10_000 } as const;
