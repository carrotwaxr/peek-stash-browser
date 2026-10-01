/**
 * StudioQueryBuilder: the studio list in SQL.
 *
 * The studio builder on the base (`query/EntityQueryBuilder.ts`): this file
 * declares the studio's spec (table, per-user joins, columns, tiebreak), its
 * filter clauses from the parsed request, its sort map, its row transform
 * and its relations (with its parent and children). The instance filter,
 * the exclusion join, the `ids` filter, the random sort and the count are
 * the base's.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import type { NormalizedStudio, TagRef } from "../types/index.js";
import type { StudioQueryRow } from "../types/internal/queryRows.js";
import type { ParsedFilter, RefCriterion } from "../types/parsedFilters.js";
import { entityKey } from "../utils/entityRef.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type FilterClause,
  type JunctionTarget,
  buildDateFilter,
  buildFavoriteFilter,
  buildNumericFilter,
  buildTextFilter,
} from "../utils/sqlClauses.js";
import {
  emptyToNull,
  likeContains,
  parseStashIds,
} from "../utils/sqlHelpers.js";
import { loadTooltipRelations } from "./TooltipRelations.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type QueryContext,
  type SortExpr,
  hierarchicalRefClause,
} from "./query/EntityQueryBuilder.js";
import { excludedCountsJoin, visibleCount } from "./query/excludedCounts.js";
import {
  type NestedLink,
  STUDIO_REF,
  byName,
  loadNestedRefs,
  loadRefsByKey,
} from "./query/nestedRefs.js";

// Column list for SELECT - all StashStudio fields plus user data; the
// counts as the viewer sees them (query/excludedCounts.ts)
const selectColumns = (ctx: QueryContext) =>
  `
    s.id, s.stashInstanceId, s.name, s.parentId, s.favorite AS stashFavorite, s.rating100 AS stashRating100,
    ${visibleCount(ctx, "s.sceneCount", "scenes")} AS sceneCount,
    ${visibleCount(ctx, "s.imageCount", "images")} AS imageCount,
    ${visibleCount(ctx, "s.galleryCount", "galleries")} AS galleryCount,
    ${visibleCount(ctx, "s.performerCount", "performers")} AS performerCount,
    ${visibleCount(ctx, "s.groupCount", "groups")} AS groupCount,
    s.details, s.url, s.stashIds, s.imagePath,
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
  // The viewer's excluded links per studio, for the counts
  extraJoins: (ctx) => excludedCountsJoin(ctx, "studio", "s"),
  selectColumns: (ctx) => ({ sql: selectColumns(ctx), params: [] }),
  defaultSort: "name",
  // Equal values list by name, then by the base's key
  tiebreak: (field) =>
    field === "name" ? undefined : "s.name COLLATE NOCASE ASC",
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
 * A studio's children: the studios on its instance whose `parentId` names
 * it (StashStudio_parentId_idx), each read as itself
 */
const STUDIO_CHILDREN: NestedLink = {
  table: "StashStudio",
  parentIdCol: "parentId",
  parentInstanceCol: "stashInstanceId",
  refIdCol: "id",
  refInstanceCol: "stashInstanceId",
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

  protected sortMap(
    dir: SortDirection,
    _filter: ParsedFilter<"studio">,
    ctx: QueryContext
  ): Record<string, SortExpr> {
    const column = (sql: string): SortExpr => ({
      sql: `${sql} ${dir}`,
      params: [],
    });
    return {
      // Studio metadata, the name case-insensitive
      name: column("s.name COLLATE NOCASE"),
      created_at: column("s.stashCreatedAt"),
      updated_at: column("s.stashUpdatedAt"),

      // Counts, as the viewer sees them
      scene_count: column(visibleCount(ctx, "s.sceneCount", "scenes")),
      scenes_count: column(visibleCount(ctx, "s.sceneCount", "scenes")),
      image_count: column(visibleCount(ctx, "s.imageCount", "images")),
      gallery_count: column(visibleCount(ctx, "s.galleryCount", "galleries")),
      performer_count: column(
        visibleCount(ctx, "s.performerCount", "performers")
      ),
      group_count: column(visibleCount(ctx, "s.groupCount", "groups")),

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

    // Counts, as the viewer sees them
    if (filter.scene_count) {
      push(
        buildNumericFilter(
          filter.scene_count,
          visibleCount(ctx, "s.sceneCount", "scenes")
        )
      );
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
    return hierarchicalRefClause("tag", STUDIO_TAGS, criterion, ctx, {
      name: "tags",
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
      // Named, or null when the viewer cannot see it, for the page
      parent_studio: row.parentId ? { id: row.parentId } : null,
      details: emptyToNull(row.details),
      url: emptyToNull(row.url),
      stash_ids: parseStashIds(row.stashIds),

      // Image path - transform to proxy URL with instanceId for multi-instance routing
      image_path: toProxyUrl(row.imagePath, row.stashInstanceId),

      // Counts
      scene_count: Number(row.sceneCount ?? 0),
      image_count: Number(row.imageCount ?? 0),
      gallery_count: Number(row.galleryCount ?? 0),
      performer_count: Number(row.performerCount ?? 0),
      group_count: Number(row.groupCount ?? 0),

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString() ?? null,
      updated_at: row.stashUpdatedAt?.toISOString() ?? null,

      // User data - Peek user data ONLY
      rating: row.userRating,
      rating100: row.userRating,
      favorite: row.userFavorite ?? false,
      o_counter: row.userOCounter ?? 0,
      play_count: row.userPlayCount ?? 0,

      // Relations: populated for the page
      tags: [] as TagRef[],
      child_studios: [],
    };

    return studio as NormalizedStudio;
  }

  /**
   * The card's relations for the whole page: its tags, at most
   * TOOLTIP_LIMIT collections and galleries, and how many of those and of
   * its performers there are (TooltipRelations), one statement per
   * relation; and its parent and children (nestedRefs), one statement each
   */
  protected async populateRelations(
    studios: NormalizedStudio[],
    ctx: QueryContext
  ): Promise<void> {
    if (studios.length === 0) return;

    const [relations] = await Promise.all([
      loadTooltipRelations("studio", studios, ctx.userId),
      this.hydrateHierarchy(studios, ctx),
    ]);
    for (const studio of studios) {
      Object.assign(
        studio,
        relations.get(entityKey(studio.id, studio.instanceId))
      );
    }
  }

  /**
   * The page's parents and children, on each studio's own instance: only
   * the live ones the viewer may see (a hidden or deleted parent is null),
   * the children by name
   */
  private async hydrateHierarchy(
    studios: NormalizedStudio[],
    ctx: QueryContext
  ): Promise<void> {
    const parentRefs = studios.flatMap((studio) =>
      studio.parent_studio
        ? [{ id: studio.parent_studio.id, instanceId: studio.instanceId }]
        : []
    );
    const [parents, children] = await Promise.all([
      loadRefsByKey(STUDIO_REF, parentRefs, ctx),
      loadNestedRefs(STUDIO_REF, STUDIO_CHILDREN, studios, ctx),
    ]);
    for (const studio of studios) {
      studio.parent_studio = studio.parent_studio
        ? (parents.get(entityKey(studio.parent_studio.id, studio.instanceId)) ??
          null)
        : null;
      studio.child_studios = byName(
        children.get(entityKey(studio.id, studio.instanceId)) ?? []
      );
    }
  }
}

// Export singleton instance
export const studioQueryBuilder = new StudioQueryBuilder();
