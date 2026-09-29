/**
 * Shared SQL filter builder utilities
 *
 * Extracted from QueryBuilder classes to eliminate duplication of filter-building
 * logic for numeric comparisons, date ranges, text matching, and favorites.
 */
import {
  REF_MODIFIERS,
  type RefModifier,
} from "@peek/shared-types/filters/index.js";
import { parseEntityRef } from "@peek/shared-types/instanceAwareId.js";
import type { InstanceAwareId } from "@peek/shared-types/instanceAwareId.js";
import { type FilterClause, refClause } from "./sqlClauses.js";

export type { FilterClause } from "./sqlClauses.js";

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
 * Uses the shared parseEntityRef utility for consistent parsing.
 *
 * @param values - Array of entity reference values (InstanceAwareId or string)
 * @returns Object with parsed components and whether any had instance IDs
 */
export function parseCompositeFilterValues(
  values: readonly (InstanceAwareId | string)[]
): {
  parsed: ParsedFilterValue[];
  hasInstanceIds: boolean;
} {
  const parsed = values.map((v) => parseEntityRef(v));
  const hasInstanceIds = parsed.some((p) => p.instanceId !== undefined);
  return { parsed, hasInstanceIds };
}

/** The modifiers a ref filter understands; another is no filter */
function refModifier(modifier: string): RefModifier | undefined {
  return (REF_MODIFIERS as readonly string[]).includes(modifier)
    ? (modifier as RefModifier)
    : undefined;
}

/**
 * Every set inline, whatever its size: the builders reading these wrappers
 * take a where fragment only, not the large shape's CTEs and joins. Each
 * port (C5 to C8) moves onto `refClause` and deletes its wrapper.
 */
const LEGACY_REF_OPTIONS = {
  name: "legacy",
  allowedInstanceIds: [],
  inlineLimit: Number.POSITIVE_INFINITY,
} as const;

/**
 * Build a junction table entity filter with instance-aware matching: a thin
 * wrapper over `refClause` (utils/sqlClauses.ts) for the builders not yet
 * on the base. INCLUDES, INCLUDES_ALL or EXCLUDES over the (id, instance)
 * pairs; a bare id matches that id on every instance.
 *
 * @param ids - Array of entity references (InstanceAwareId composite keys)
 * @param junctionTable - Junction table name (e.g., "ScenePerformer")
 * @param parentIdCol - Parent entity ID column in junction table (e.g., "sceneId")
 * @param parentInstanceCol - Parent entity instance column (e.g., "sceneInstanceId")
 * @param entityIdCol - Filtered entity ID column (e.g., "performerId")
 * @param entityInstanceCol - Filtered entity instance column (e.g., "performerInstanceId")
 * @param parentAlias - Alias for the parent table (e.g., "s")
 * @param modifier - Filter modifier: INCLUDES, INCLUDES_ALL, or EXCLUDES
 */
export function buildJunctionFilter(
  ids: InstanceAwareId[],
  junctionTable: string,
  parentIdCol: string,
  parentInstanceCol: string,
  entityIdCol: string,
  entityInstanceCol: string,
  parentAlias: string,
  modifier: string
): FilterClause {
  const valid = refModifier(modifier);
  if (valid === undefined) return { sql: "", params: [] };
  const alias = junctionTable.charAt(0).toLowerCase() + junctionTable.charAt(1);
  return refClause(
    {
      kind: "junction",
      table: junctionTable,
      alias,
      parentAlias,
      parentIdCol,
      parentInstanceCol,
      refIdCol: entityIdCol,
      refInstanceCol: entityInstanceCol,
    },
    parseCompositeFilterValues(ids).parsed,
    valid,
    LEGACY_REF_OPTIONS
  );
}

/**
 * Build a direct column entity filter with instance-aware matching: a thin
 * wrapper over `refClause` for entities that use a direct FK (e.g., studios)
 * rather than a junction table. INCLUDES or EXCLUDES over the (id, instance)
 * pairs; EXCLUDES keeps rows with no value.
 *
 * @param ids - Array of entity references (InstanceAwareId composite keys)
 * @param idColumn - Column for entity ID (e.g., "s.studioId")
 * @param instanceColumn - Column for entity instance (e.g., "s.studioInstanceId")
 * @param modifier - Filter modifier: INCLUDES or EXCLUDES
 */
export function buildDirectFilter(
  ids: InstanceAwareId[],
  idColumn: string,
  instanceColumn: string,
  modifier: string
): FilterClause {
  const valid = refModifier(modifier);
  if (valid === undefined || valid === "INCLUDES_ALL") {
    return { sql: "", params: [] };
  }
  // The columns arrive qualified ("s.studioId"): split them for the target
  const [parentAlias, idCol] = splitColumn(idColumn);
  const [, instanceCol] = splitColumn(instanceColumn);
  return refClause(
    { kind: "column", parentTable: "", parentAlias, idCol, instanceCol },
    parseCompositeFilterValues(ids).parsed,
    valid,
    LEGACY_REF_OPTIONS
  );
}

/** "s.studioId" as ["s", "studioId"]; an unqualified column keeps no alias */
function splitColumn(column: string): [string, string] {
  const dot = column.indexOf(".");
  return dot === -1
    ? ["", column]
    : [column.slice(0, dot), column.slice(dot + 1)];
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
    | {
        value?: number | null;
        value2?: number | null;
        modifier?: string | null;
      }
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
        return {
          sql: `${columnExpr} BETWEEN ? AND ?`,
          params: [value, value2],
        };
      }
      return { sql: `${columnExpr} >= ?`, params: [value] };
    case "NOT_BETWEEN":
      if (value2 !== undefined && value2 !== null) {
        return {
          sql: `(${columnExpr} < ? OR ${columnExpr} > ?)`,
          params: [value, value2],
        };
      }
      return { sql: `${columnExpr} < ?`, params: [value] };
    case null:
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
    | {
        value?: string | null;
        value2?: string | null;
        modifier?: string | null;
      }
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
    case null:
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
  filter:
    | { value?: string | null; modifier?: string | null }
    | undefined
    | null,
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
      const conditions = allColumns
        .map((col) => `LOWER(${col}) LIKE LOWER(?)`)
        .join(" OR ");
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
    case null:
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
export function buildFavoriteFilter(
  favorite: boolean | undefined
): FilterClause {
  if (favorite === undefined) {
    return { sql: "", params: [] };
  }

  if (favorite) {
    return { sql: "r.favorite = 1", params: [] };
  } else {
    return { sql: "(r.favorite = 0 OR r.favorite IS NULL)", params: [] };
  }
}
