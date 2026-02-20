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
 * Parsed composite filter value.
 * Values can be either "entityId" (bare) or "entityId:instanceId" (composite).
 */
export interface ParsedFilterValue {
  id: string;
  instanceId: string | undefined;
}

/**
 * Parse composite filter values (e.g., "82:uuid-server1") into separate
 * entity IDs and instance IDs. Supports both bare IDs and composite keys.
 *
 * @param values - Array of filter values, either bare IDs or "id:instanceId" composites
 * @returns Object with separate arrays for SQL parameterization
 */
export function parseCompositeFilterValues(values: string[]): {
  parsed: ParsedFilterValue[];
  hasInstanceIds: boolean;
} {
  const parsed = values.map((v) => {
    const colonIdx = v.indexOf(":");
    if (colonIdx === -1) {
      return { id: v, instanceId: undefined };
    }
    return { id: v.substring(0, colonIdx), instanceId: v.substring(colonIdx + 1) };
  });

  const hasInstanceIds = parsed.some((p) => p.instanceId !== undefined);
  return { parsed, hasInstanceIds };
}

/**
 * Build a junction table entity filter with instance-aware matching.
 * Generates SQL for INCLUDES, INCLUDES_ALL, or EXCLUDES with optional
 * instanceId constraints when composite keys are provided.
 *
 * @param ids - Array of filter values (bare IDs or "id:instanceId" composites)
 * @param junctionTable - Junction table name (e.g., "ScenePerformer")
 * @param parentIdCol - Parent entity ID column in junction table (e.g., "sceneId")
 * @param parentInstanceCol - Parent entity instance column (e.g., "sceneInstanceId")
 * @param entityIdCol - Filtered entity ID column (e.g., "performerId")
 * @param entityInstanceCol - Filtered entity instance column (e.g., "performerInstanceId")
 * @param parentAlias - Alias for the parent table (e.g., "s")
 * @param modifier - Filter modifier: INCLUDES, INCLUDES_ALL, or EXCLUDES
 */
export function buildJunctionFilter(
  ids: string[],
  junctionTable: string,
  parentIdCol: string,
  parentInstanceCol: string,
  entityIdCol: string,
  entityInstanceCol: string,
  parentAlias: string,
  modifier: string
): FilterClause {
  const { parsed, hasInstanceIds } = parseCompositeFilterValues(ids);
  const bareIds = parsed.map((p) => p.id);
  const alias = junctionTable.charAt(0).toLowerCase() + junctionTable.charAt(1);
  const placeholders = bareIds.map(() => "?").join(", ");

  if (!hasInstanceIds) {
    // No instance IDs provided — match by entity ID only (backward compat)
    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `EXISTS (SELECT 1 FROM ${junctionTable} ${alias} WHERE ${alias}.${parentIdCol} = ${parentAlias}.id AND ${alias}.${parentInstanceCol} = ${parentAlias}.stashInstanceId AND ${alias}.${entityIdCol} IN (${placeholders}))`,
          params: bareIds,
        };
      case "INCLUDES_ALL":
        return {
          sql: `(SELECT COUNT(DISTINCT ${alias}.${entityIdCol}) FROM ${junctionTable} ${alias} WHERE ${alias}.${parentIdCol} = ${parentAlias}.id AND ${alias}.${parentInstanceCol} = ${parentAlias}.stashInstanceId AND ${alias}.${entityIdCol} IN (${placeholders})) = ?`,
          params: [...bareIds, bareIds.length],
        };
      case "EXCLUDES":
        return {
          sql: `NOT EXISTS (SELECT 1 FROM ${junctionTable} ${alias} WHERE ${alias}.${parentIdCol} = ${parentAlias}.id AND ${alias}.${parentInstanceCol} = ${parentAlias}.stashInstanceId AND ${alias}.${entityIdCol} IN (${placeholders}))`,
          params: bareIds,
        };
      default:
        return { sql: "", params: [] };
    }
  }

  // Instance-aware matching: build (entityId = ? AND entityInstanceId = ?) OR ... pairs
  const pairConditions = parsed.map((p) => {
    if (p.instanceId) {
      return `(${alias}.${entityIdCol} = ? AND ${alias}.${entityInstanceCol} = ?)`;
    }
    // Bare ID within a mixed set — match any instance
    return `(${alias}.${entityIdCol} = ?)`;
  });
  const pairParams: string[] = [];
  for (const p of parsed) {
    pairParams.push(p.id);
    if (p.instanceId) {
      pairParams.push(p.instanceId);
    }
  }
  const pairSql = pairConditions.join(" OR ");

  switch (modifier) {
    case "INCLUDES":
      return {
        sql: `EXISTS (SELECT 1 FROM ${junctionTable} ${alias} WHERE ${alias}.${parentIdCol} = ${parentAlias}.id AND ${alias}.${parentInstanceCol} = ${parentAlias}.stashInstanceId AND (${pairSql}))`,
        params: pairParams,
      };
    case "INCLUDES_ALL":
      return {
        sql: `(SELECT COUNT(DISTINCT ${alias}.${entityIdCol} || ':' || ${alias}.${entityInstanceCol}) FROM ${junctionTable} ${alias} WHERE ${alias}.${parentIdCol} = ${parentAlias}.id AND ${alias}.${parentInstanceCol} = ${parentAlias}.stashInstanceId AND (${pairSql})) = ?`,
        params: [...pairParams, parsed.length],
      };
    case "EXCLUDES":
      return {
        sql: `NOT EXISTS (SELECT 1 FROM ${junctionTable} ${alias} WHERE ${alias}.${parentIdCol} = ${parentAlias}.id AND ${alias}.${parentInstanceCol} = ${parentAlias}.stashInstanceId AND (${pairSql}))`,
        params: pairParams,
      };
    default:
      return { sql: "", params: [] };
  }
}

/**
 * Build a direct column entity filter with instance-aware matching.
 * For entities that use a direct FK (e.g., studios) rather than a junction table.
 *
 * @param ids - Array of filter values (bare IDs or "id:instanceId" composites)
 * @param idColumn - Column for entity ID (e.g., "s.studioId")
 * @param instanceColumn - Column for entity instance (e.g., "s.studioInstanceId")
 * @param modifier - Filter modifier: INCLUDES or EXCLUDES
 */
export function buildDirectFilter(
  ids: string[],
  idColumn: string,
  instanceColumn: string,
  modifier: string
): FilterClause {
  const { parsed, hasInstanceIds } = parseCompositeFilterValues(ids);
  const bareIds = parsed.map((p) => p.id);
  const placeholders = bareIds.map(() => "?").join(", ");

  if (!hasInstanceIds) {
    // No instance IDs — match by entity ID only
    switch (modifier) {
      case "INCLUDES":
        return { sql: `${idColumn} IN (${placeholders})`, params: bareIds };
      case "EXCLUDES":
        return { sql: `(${idColumn} IS NULL OR ${idColumn} NOT IN (${placeholders}))`, params: bareIds };
      default:
        return { sql: "", params: [] };
    }
  }

  // Instance-aware: build pair conditions
  const pairConditions = parsed.map((p) => {
    if (p.instanceId) {
      return `(${idColumn} = ? AND ${instanceColumn} = ?)`;
    }
    return `(${idColumn} = ?)`;
  });
  const pairParams: string[] = [];
  for (const p of parsed) {
    pairParams.push(p.id);
    if (p.instanceId) {
      pairParams.push(p.instanceId);
    }
  }
  const pairSql = pairConditions.join(" OR ");

  switch (modifier) {
    case "INCLUDES":
      return { sql: `(${pairSql})`, params: pairParams };
    case "EXCLUDES":
      return { sql: `NOT (${pairSql})`, params: pairParams };
    default:
      return { sql: "", params: [] };
  }
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
