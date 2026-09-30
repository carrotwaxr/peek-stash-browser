/**
 * The viewer's excluded links per entity (UserExcludedContentCount, B13b)
 * in the card lists: performers, studios, tags, collections and galleries.
 *
 * A card's count column is Peek's live link count (LinkCountService, the
 * tab's total before the viewer's exclusions). The row's count row, joined
 * once by its primary key, holds how many of those links the viewer cannot
 * see; every count column, count sort and count filter reads the column
 * minus it, so a card equals the total of the tab behind it. A user with no
 * exclusions has no rows, and the join finds nothing.
 */
import type { SqlFragment } from "../../utils/sqlClauses.js";
import type { QueryContext } from "./EntityQueryBuilder.js";

/** The entity types with a count row */
export type CountedEntityType =
  | "performer"
  | "studio"
  | "tag"
  | "group"
  | "gallery";

/** The count row's columns: the relation each count column names */
export type ExcludedRelation =
  | "scenes"
  | "images"
  | "galleries"
  | "groups"
  | "performers"
  | "studios";

/** The count row's alias in every list that joins it */
export const EXCLUDED_COUNTS_ALIAS = "d";

/**
 * The LEFT JOIN of the viewer's count row for entity `alias` of `entityType`,
 * binding the viewer's id
 */
export function excludedCountsJoinSql(
  entityType: CountedEntityType,
  alias: string
): string {
  const d = EXCLUDED_COUNTS_ALIAS;
  return `LEFT JOIN UserExcludedContentCount ${d} ON ${d}.userId = ? AND ${d}.entityType = '${entityType}' AND ${d}.entityId = ${alias}.id AND ${d}.instanceId = ${alias}.stashInstanceId`;
}

/**
 * The count the viewer sees: the live column minus their excluded links,
 * never below 0 (a column a sync has not rebuilt yet, a hold's window)
 */
export function visibleCountSql(
  column: string,
  relation: ExcludedRelation
): string {
  return `MAX(${column} - COALESCE(${EXCLUDED_COUNTS_ALIAS}.${relation}, 0), 0)`;
}

/** The join for a list's spec (`extraJoins`), only when the viewer's exclusions apply */
export function excludedCountsJoin(
  ctx: QueryContext,
  entityType: CountedEntityType,
  alias: string
): readonly SqlFragment[] {
  if (!ctx.applyExclusions) return [];
  return [
    { sql: excludedCountsJoinSql(entityType, alias), params: [ctx.userId] },
  ];
}

/**
 * A count column's expression for the select list, a sort and a filter:
 * the visible count when the viewer's exclusions apply, else the column
 */
export function visibleCount(
  ctx: QueryContext,
  column: string,
  relation: ExcludedRelation
): string {
  return ctx.applyExclusions ? visibleCountSql(column, relation) : column;
}
