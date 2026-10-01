/**
 * SQL for a JSON text column read with `json_each`.
 */

/**
 * The column as a JSON list `json_each` can read: text that is not valid JSON
 * (a damaged cache row) or NULL reads as `[]`, where a bare
 * `json_each(column)` fails the whole statement with "malformed JSON". The
 * column is a code constant, never input.
 */
export function jsonListOrEmpty(column: string): string {
  return `CASE WHEN json_valid(${column}) THEN ${column} ELSE '[]' END`;
}
