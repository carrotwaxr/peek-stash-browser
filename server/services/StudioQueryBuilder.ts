/**
 * StudioQueryBuilder: the studio list in SQL.
 *
 * The studio builder on the base (`query/EntityQueryBuilder.ts`): this file
 * declares the studio's spec (table, per-user joins, columns, tiebreak), its
 * filter clauses from the parsed request, its sort map, its row transform
 * and its relations. The instance filter, the exclusion join, the `ids`
 * filter, the random sort and the count are the base's.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import type { NormalizedStudio, TagRef } from "../types/index.js";
import type { StudioQueryRow } from "../types/internal/queryRows.js";
import type { ParsedFilter, RefCriterion } from "../types/parsedFilters.js";
import { entityKey } from "../utils/entityRef.js";
import { expandTagIds } from "../utils/hierarchyUtils.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type FilterClause,
  type JunctionTarget,
  buildDateFilter,
  buildFavoriteFilter,
  buildNumericFilter,
  buildTextFilter,
  refClause,
} from "../utils/sqlClauses.js";
import { emptyToNull, likeContains } from "../utils/sqlHelpers.js";
import { loadTooltipRelations } from "./TooltipRelations.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type QueryContext,
  type SortExpr,
  expandRefs,
} from "./query/EntityQueryBuilder.js";

// Column list for SELECT - all StashStudio fields plus user data
const SELECT_COLUMNS = `
    s.id, s.stashInstanceId, s.name, s.parentId, s.favorite AS stashFavorite, s.rating100 AS stashRating100,
    s.sceneCount, s.imageCount, s.galleryCount, s.performerCount, s.groupCount,
    s.details, s.url, s.imagePath,
    s.stashCreatedAt, s.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    us.oCounter AS userOCounter, us.playCount AS userPlayCount
  `.trim();

const STUDIO_SPEC: EntitySpec = {
  table: "StashStudio",
  alias: "s",
  entityType: "studio",
  userJoins: [
    { table: "StudioRating", alias: "r", entityIdCol: "studioId" },
    { table: "UserStudioStats", alias: "us", entityIdCol: "studioId" },
  ],
  selectColumns: () => ({ sql: SELECT_COLUMNS, params: [] }),
  defaultSort: "name",
  // By name, the id keeps the order stable; by anything else, the name
  tiebreak: (direction, field) =>
    field === "name" ? `s.id ${direction}` : "s.name COLLATE NOCASE ASC",
};

/** A studio's tags */
const STUDIO_TAGS: JunctionTarget = {
  kind: "junction",
  table: "StudioTag",
  alias: "stt",
  parentAlias: "s",
  parentIdCol: "studioId",
  parentInstanceCol: "studioInstanceId",
  refIdCol: "tagId",
  refInstanceCol: "tagInstanceId",
};

/**
 * Builds and executes SQL queries for studio filtering
 */
class StudioQueryBuilder extends EntityQueryBuilder<
  StudioQueryRow,
  NormalizedStudio,
  "studio"
> {
  protected readonly spec = STUDIO_SPEC;

  protected sortMap(dir: SortDirection): Record<string, SortExpr> {
    const column = (sql: string): SortExpr => ({
      sql: `${sql} ${dir}`,
      params: [],
    });
    return {
      // Studio metadata, the name case-insensitive
      name: column("s.name COLLATE NOCASE"),
      created_at: column("s.stashCreatedAt"),
      updated_at: column("s.stashUpdatedAt"),

      // Counts
      scene_count: column("s.sceneCount"),
      scenes_count: column("s.sceneCount"),
      image_count: column("s.imageCount"),
      gallery_count: column("s.galleryCount"),
      performer_count: column("s.performerCount"),
      group_count: column("s.groupCount"),

      // The viewer's rating (StudioRating)
      rating: column("COALESCE(r.rating, 0)"),
      rating100: column("COALESCE(r.rating, 0)"),

      // The viewer's stats (UserStudioStats)
      o_counter: column("COALESCE(us.oCounter, 0)"),
      play_count: column("COALESCE(us.playCount, 0)"),
    };
  }

  /** The studio filter's clauses, one per criterion the request carried */
  protected async filterClauses(
    filter: ParsedFilter<"studio">,
    q: string | undefined,
    ctx: QueryContext
  ): Promise<FilterClause[]> {
    const clauses: FilterClause[] = [];
    const push = (clause: FilterClause) => clauses.push(clause);

    if (q !== undefined) push(this.searchClause(q));

    // The viewer's own data
    push(buildFavoriteFilter(filter.favorite));
    if (filter.rating100) {
      push(buildNumericFilter(filter.rating100, "COALESCE(r.rating, 0)"));
    }
    if (filter.o_counter) {
      push(buildNumericFilter(filter.o_counter, "COALESCE(us.oCounter, 0)"));
    }
    if (filter.play_count) {
      push(buildNumericFilter(filter.play_count, "COALESCE(us.playCount, 0)"));
    }

    // Related entities
    if (filter.tags) push(await this.tagClause(filter.tags, ctx));

    // Counts
    if (filter.scene_count) {
      push(buildNumericFilter(filter.scene_count, "COALESCE(s.sceneCount, 0)"));
    }

    // Text
    if (filter.name) push(buildTextFilter(filter.name, "s.name"));
    if (filter.details) push(buildTextFilter(filter.details, "s.details"));

    // Dates
    if (filter.created_at) {
      push(buildDateFilter(filter.created_at, "s.stashCreatedAt"));
    }
    if (filter.updated_at) {
      push(buildDateFilter(filter.updated_at, "s.stashUpdatedAt"));
    }

    return clauses;
  }

  /** The tag filter, with the tags' descendants to the depth */
  private async tagClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    const refs = await expandRefs(
      criterion.refs,
      criterion.depth,
      expandTagIds
    );
    return refClause(STUDIO_TAGS, refs, criterion.modifier, {
      name: "tags",
      allowedInstanceIds: ctx.allowedInstanceIds,
    });
  }

  /**
   * The search across the name and details: `likeContains` with
   * `ESCAPE '\'`, so a `%`, `_` or `\` in the text matches itself
   */
  private searchClause(q: string): FilterClause {
    const pattern = likeContains(q.toLowerCase());
    return {
      sql: "(LOWER(s.name) LIKE ? ESCAPE '\\' OR LOWER(s.details) LIKE ? ESCAPE '\\')",
      params: [pattern, pattern],
    };
  }

  /**
   * Transform a raw database row into a NormalizedStudio
   */
  protected transformRow(row: StudioQueryRow): NormalizedStudio {
    const studio = {
      id: row.id,
      instanceId: row.stashInstanceId,
      name: row.name,
      parent_studio: row.parentId ? { id: row.parentId, name: "" } : null,
      details: emptyToNull(row.details),
      url: emptyToNull(row.url),

      // Image path - transform to proxy URL with instanceId for multi-instance routing
      image_path: toProxyUrl(row.imagePath, row.stashInstanceId),

      // Counts
      scene_count: row.sceneCount ?? 0,
      image_count: row.imageCount ?? 0,
      gallery_count: row.galleryCount ?? 0,
      performer_count: row.performerCount ?? 0,
      group_count: row.groupCount ?? 0,

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString() ?? null,
      updated_at: row.stashUpdatedAt?.toISOString() ?? null,

      // User data - Peek user data ONLY
      rating: row.userRating,
      rating100: row.userRating,
      favorite: row.userFavorite ?? false,
      o_counter: row.userOCounter ?? 0,
      play_count: row.userPlayCount ?? 0,

      // Relations - populated separately
      tags: [] as TagRef[],
      child_studios: [] as NormalizedStudio[],
    };

    return studio as NormalizedStudio;
  }

  /**
   * The card's relations for the whole page: its tags, at most
   * TOOLTIP_LIMIT collections and galleries, and how many of those and of
   * its performers there are (TooltipRelations), one statement per relation
   */
  protected async populateRelations(
    studios: NormalizedStudio[],
    ctx: QueryContext
  ): Promise<void> {
    const relations = await loadTooltipRelations("studio", studios, ctx.userId);
    for (const studio of studios) {
      Object.assign(
        studio,
        relations.get(entityKey(studio.id, studio.instanceId))
      );
    }
  }
}

// Export singleton instance
export const studioQueryBuilder = new StudioQueryBuilder();
