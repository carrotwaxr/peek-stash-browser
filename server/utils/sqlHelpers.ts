/**
 * Shared SQL result parsing helpers for QueryBuilder transformRow methods.
 *
 * These utilities handle the impedance mismatch between SQLite's type system
 * and TypeScript's type system (e.g. JSON held in TEXT columns, "" for
 * absent text). Prisma's raw queries already return BOOLEAN columns as
 * booleans (see types/internal/queryRows.ts).
 */
import type { StashId } from "@peek/shared-types";

/**
 * Parse a JSON-encoded array column from SQLite.
 * Returns empty array if the value is null or invalid JSON.
 */
export function parseJsonArray<T = string>(
  json: string | null | undefined
): T[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * A stored `stashIds` column (JSON `[{ endpoint, stash_id }]`) as the list
 * the API sends: text that is not a JSON list reads as none, and an entry
 * without both strings is left out.
 */
export function parseStashIds(json: string | null | undefined): StashId[] {
  return parseJsonArray<unknown>(json).flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { endpoint, stash_id } = entry as Record<string, unknown>;
    return typeof endpoint === "string" && typeof stash_id === "string"
      ? [{ endpoint, stash_id }]
      : [];
  });
}

/** Stash and user text where "" means absent: "" and null read as null. */
export function emptyToNull(value: string | null | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

/**
 * A LIKE pattern matching `text` anywhere, for `LIKE ? ESCAPE '\'`: `%`, `_`
 * and the backslash itself are escaped, so each matches only itself. SQLite's
 * LIKE ignores case for ASCII letters only.
 */
export function likeContains(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
