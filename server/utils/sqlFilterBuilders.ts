/**
 * Shared SQL filter builder utilities
 *
 * Extracted from QueryBuilder classes to eliminate duplication of filter-building
 * logic for numeric comparisons, date ranges, text matching, and favorites.
 */

export interface FilterClause {
  sql: string;
  params: (string | number | boolean)[];
}

/**
 * Build a numeric comparison filter clause.
 * Handles EQUALS, NOT_EQUALS, GREATER_THAN, LESS_THAN, BETWEEN, NOT_BETWEEN.
 *
 * @param filter - Filter with value, optional value2, and modifier
 * @param columnExpr - Full SQL column expression (e.g. "COALESCE(r.rating, 0)", "s.height")
 */
export function buildNumericFilter(
  filter:
    | { value?: number | null; value2?: number | null; modifier?: string | null }
    | undefined
    | null,
  columnExpr: string
): FilterClause {
  if (!filter || filter.value === undefined || filter.value === null) {
    return { sql: "", params: [] };
  }

  const { value, value2, modifier = "GREATER_THAN" } = filter;

  switch (modifier) {
    case "EQUALS":
      return { sql: `${columnExpr} = ?`, params: [value] };
    case "NOT_EQUALS":
      return { sql: `${columnExpr} != ?`, params: [value] };
    case "GREATER_THAN":
      return { sql: `${columnExpr} > ?`, params: [value] };
    case "LESS_THAN":
      return { sql: `${columnExpr} < ?`, params: [value] };
    case "BETWEEN":
      if (value2 !== undefined && value2 !== null) {
        return { sql: `${columnExpr} BETWEEN ? AND ?`, params: [value, value2] };
      }
      return { sql: `${columnExpr} >= ?`, params: [value] };
    case "NOT_BETWEEN":
      if (value2 !== undefined && value2 !== null) {
        return { sql: `(${columnExpr} < ? OR ${columnExpr} > ?)`, params: [value, value2] };
      }
      return { sql: `${columnExpr} < ?`, params: [value] };
    default:
      return { sql: "", params: [] };
  }
}

/**
 * Build a date comparison filter clause.
 * Handles EQUALS, NOT_EQUALS, GREATER_THAN, LESS_THAN, BETWEEN, NOT_BETWEEN, IS_NULL, NOT_NULL.
 *
 * @param filter - Filter with value, optional value2, and modifier
 * @param column - SQL column name (e.g. "s.date", "p.birthdate")
 */
export function buildDateFilter(
  filter:
    | { value?: string | null; value2?: string | null; modifier?: string | null }
    | undefined
    | null,
  column: string
): FilterClause {
  if (!filter) {
    return { sql: "", params: [] };
  }

  const { value, value2, modifier = "GREATER_THAN" } = filter;

  // IS_NULL and NOT_NULL don't require a value
  if (modifier === "IS_NULL") {
    return { sql: `${column} IS NULL`, params: [] };
  }
  if (modifier === "NOT_NULL") {
    return { sql: `${column} IS NOT NULL`, params: [] };
  }

  // All other modifiers require a value
  if (!value) {
    return { sql: "", params: [] };
  }

  switch (modifier) {
    case "EQUALS":
      return { sql: `date(${column}) = date(?)`, params: [value] };
    case "NOT_EQUALS":
      return {
        sql: `(${column} IS NULL OR date(${column}) != date(?))`,
        params: [value],
      };
    case "GREATER_THAN":
      return { sql: `${column} > ?`, params: [value] };
    case "LESS_THAN":
      return { sql: `${column} < ?`, params: [value] };
    case "BETWEEN":
      if (value2) {
        return { sql: `${column} BETWEEN ? AND ?`, params: [value, value2] };
      }
      return { sql: `${column} >= ?`, params: [value] };
    case "NOT_BETWEEN":
      if (value2) {
        return {
          sql: `(${column} IS NULL OR ${column} < ? OR ${column} > ?)`,
          params: [value, value2],
        };
      }
      return { sql: `${column} < ?`, params: [value] };
    default:
      return { sql: "", params: [] };
  }
}

/**
 * Build a text comparison filter clause.
 * Handles INCLUDES, EXCLUDES, EQUALS, NOT_EQUALS, IS_NULL, NOT_NULL.
 * Uses LOWER() for case-insensitive matching.
 *
 * For INCLUDES/EXCLUDES with additionalColumns, searches across all columns
 * (OR for INCLUDES, AND for EXCLUDES).
 * EQUALS/NOT_EQUALS/IS_NULL/NOT_NULL only apply to the primary column.
 *
 * @param filter - Filter with value and modifier
 * @param column - Primary SQL column name (e.g. "p.name")
 * @param additionalColumns - Optional extra columns to search (for INCLUDES/EXCLUDES)
 */
export function buildTextFilter(
  filter: { value?: string | null; modifier?: string | null } | undefined | null,
  column: string,
  additionalColumns: string[] = []
): FilterClause {
  if (!filter) {
    return { sql: "", params: [] };
  }

  const { value, modifier = "INCLUDES" } = filter;

  // IS_NULL and NOT_NULL don't require a value
  if (modifier === "IS_NULL") {
    return { sql: `(${column} IS NULL OR ${column} = '')`, params: [] };
  }
  if (modifier === "NOT_NULL") {
    return { sql: `(${column} IS NOT NULL AND ${column} != '')`, params: [] };
  }

  // All other modifiers require a value
  if (!value) {
    return { sql: "", params: [] };
  }

  const allColumns = [column, ...additionalColumns];

  switch (modifier) {
    case "INCLUDES": {
      const conditions = allColumns.map((col) => `LOWER(${col}) LIKE LOWER(?)`).join(" OR ");
      return {
        sql: `(${conditions})`,
        params: allColumns.map(() => `%${value}%`),
      };
    }
    case "EXCLUDES": {
      const conditions = allColumns
        .map((col) => `(${col} IS NULL OR LOWER(${col}) NOT LIKE LOWER(?))`)
        .join(" AND ");
      return {
        sql: `(${conditions})`,
        params: allColumns.map(() => `%${value}%`),
      };
    }
    case "EQUALS":
      return { sql: `LOWER(${column}) = LOWER(?)`, params: [value] };
    case "NOT_EQUALS":
      return {
        sql: `(${column} IS NULL OR LOWER(${column}) != LOWER(?))`,
        params: [value],
      };
    default:
      return { sql: "", params: [] };
  }
}

/**
 * Build a boolean favorite filter clause.
 * Filters on r.favorite column.
 *
 * @param favorite - true for favorites, false for non-favorites, undefined for no filter
 */
export function buildFavoriteFilter(favorite: boolean | undefined): FilterClause {
  if (favorite === undefined) {
    return { sql: "", params: [] };
  }

  if (favorite) {
    return { sql: "r.favorite = 1", params: [] };
  } else {
    return { sql: "(r.favorite = 0 OR r.favorite IS NULL)", params: [] };
  }
}
