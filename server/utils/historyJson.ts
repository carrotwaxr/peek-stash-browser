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
