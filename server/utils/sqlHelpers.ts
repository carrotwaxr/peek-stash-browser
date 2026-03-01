/**
 * Shared SQL result parsing helpers for QueryBuilder transformRow methods.
 *
 * These utilities handle the impedance mismatch between SQLite's type system
 * and TypeScript's type system (e.g. JSON columns, boolean integers).
 */

/**
 * Parse a JSON-encoded array column from SQLite.
 * Returns empty array if the value is null or invalid JSON.
 */
export function parseJsonArray<T = string>(json: string | null | undefined): T[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Convert SQLite integer boolean (0/1) to JavaScript boolean.
 */
export function parseSqliteBoolean(value: number | null | undefined): boolean {
  return value === 1;
}
