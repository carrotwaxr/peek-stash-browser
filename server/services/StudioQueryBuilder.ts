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
import type {
  NumberCriterion,
  ParsedFilter,
  RefFieldCriterion,
} from "../types/parsedFilters.js";
import { entityKey } from "../utils/entityRef.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  allOf,
  anyOf,
  buildCountFilter,
  buildFavoriteFilter,
  buildInstantFilter,
  buildNumericFilter,
  buildTextFilter,
  noClause,
  searchAll,
  stashIdsClause,
  visibleGuard,
} from "../utils/sqlClauses.js";
import {
  emptyToNull,
  jsonListArm,
  parseJsonArray,
  parseStashIds,
  searchTerms,
} from "../utils/sqlHelpers.js";
import { loadTooltipRelations } from "./TooltipRelations.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type FieldClauses,
  type LeafContext,
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
    s.details, s.url, s.aliases, s.stashIds, s.imagePath,
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

/** A studio's parent: its `parentId`, on the studio's own instance */
const STUDIO_PARENT: ColumnTarget = {
  kind: "column",
  parentTable: "StashStudio",
  parentAlias: "s",
  idCol: "parentId",
  instanceCol: "stashInstanceId",
};

/** The viewer whose exclusions apply, or null */
const viewerOf = (ctx: QueryContext): number | null =>
  ctx.applyExclusions ? ctx.userId : null;

/** The studio has a parent that is live and the viewer can see */
function visibleParent(ctx: QueryContext): FilterClause {
  const guard = visibleGuard("spv", "studio", viewerOf(ctx));
  return {
    sql: `EXISTS (SELECT 1 FROM StashStudio spv${guard.join} WHERE spv.id = s.parentId AND spv.stashInstanceId = s.stashInstanceId AND ${guard.where})`,
    params: guard.params,
  };
}

/** The studio's live children the viewer can see (StashStudio_parentId_idx) */
function childCount(ctx: QueryContext): FilterClause {
  const guard = visibleGuard("scc", "studio", viewerOf(ctx));
  return {
    sql: `(SELECT COUNT(*) FROM StashStudio scc${guard.join} WHERE scc.parentId = s.id AND scc.stashInstanceId = s.stashInstanceId AND ${guard.where})`,
    params: guard.params,
  };
}

/** The studio's live tags the viewer can see */
function tagCount(ctx: QueryContext): FilterClause {
  const guard = visibleGuard("stct", "tag", viewerOf(ctx));
  return {
    sql: `(SELECT COUNT(*) FROM StudioTag stc JOIN StashTag stct ON stct.id = stc.tagId AND stct.stashInstanceId = stc.tagInstanceId${guard.join} WHERE stc.studioId = s.id AND stc.studioInstanceId = s.stashInstanceId AND ${guard.where})`,
    params: guard.params,
  };
}

/** A stored count column as the viewer sees it, as a number filter */
const storedCount =
  (column: string, relation: Parameters<typeof visibleCount>[2]) =>
  (c: NumberCriterion, ctx: QueryContext) =>
    buildNumericFilter(c, visibleCount(ctx, column, relation));

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

      // The live children and tags the viewer can see, as the filters count
      child_count: this.countSort(childCount(ctx), dir),
      tag_count: this.countSort(tagCount(ctx), dir),

      // The viewer's rating (StudioRating)
      rating: column("COALESCE(r.rating, 0)"),
      rating100: column("COALESCE(r.rating, 0)"),

      // The viewer's stats (UserStudioStats)
      o_counter: column("COALESCE(us.oCounter, 0)"),
      play_count: column("COALESCE(us.playCount, 0)"),
    };
  }

  /**
   * The studio filter's clauses, one per field, in the order the statement
   * ANDs them. A ref field's CTEs are named from the leaf (`ctx.name`).
   */
  protected override readonly fieldClauses: FieldClauses<"studio"> = {
    // The viewer's own data
    favorite: (favorite) => buildFavoriteFilter(favorite),
    rating100: (c) => buildNumericFilter(c, "r.rating"),
    o_counter: (c) => buildNumericFilter(c, "COALESCE(us.oCounter, 0)"),
    play_count: (c) => buildNumericFilter(c, "COALESCE(us.playCount, 0)"),

    // Related entities
    tags: (c, ctx) => this.tagClause(c, ctx),
    parents: (c, ctx) => this.parentClause(c, ctx),

    // Counts, as the viewer sees them
    scene_count: (c, ctx) =>
      buildNumericFilter(c, visibleCount(ctx, "s.sceneCount", "scenes")),
    child_count: (c, ctx) => buildCountFilter(c, childCount(ctx)),
    tag_count: (c, ctx) => buildCountFilter(c, tagCount(ctx)),
    image_count: storedCount("s.imageCount", "images"),
    gallery_count: storedCount("s.galleryCount", "galleries"),
    performer_count: storedCount("s.performerCount", "performers"),
    group_count: storedCount("s.groupCount", "groups"),

    // Text
    name: (c) => buildTextFilter(c, "s.name"),
    details: (c) => buildTextFilter(c, "s.details"),
    // The aliases one at a time, the website, the StashDB ids
    aliases: (c) => buildTextFilter(c, null, { lists: ["s.aliases"] }),
    url: (c) => buildTextFilter(c, "s.url"),
    stash_id: (c) => stashIdsClause(c, "s.stashIds"),

    // Dates
    created_at: (c, ctx) =>
      buildInstantFilter(c, "s.stashCreatedAt", ctx.timeZone),
    updated_at: (c, ctx) =>
      buildInstantFilter(c, "s.stashUpdatedAt", ctx.timeZone),
  };

  /** The tag filter, with the tags' descendants to the depth */
  private async tagClause(
    criterion: RefFieldCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    // "Has any" and "has none" count only tags the viewer can see
    return hierarchicalRefClause("tag", STUDIO_TAGS, criterion, ctx, {
      name: ctx.name,
      related: { table: "StashTag", entityType: "tag" },
    });
  }

  /**
   * The parents filter on `parentId`, with the refs' descendants to the
   * depth (the studios under a ref within depth + 1 levels). The parent
   * counts only while live and visible to the viewer: INCLUDES and
   * INCLUDES_ALL also need it, EXCLUDES keeps a studio whose parent is
   * hidden, and "has none" and "has any" read it alone.
   */
  private async parentClause(
    criterion: RefFieldCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    const visible = visibleParent(ctx);
    switch (criterion.modifier) {
      case "NOT_NULL":
        return visible;
      case "IS_NULL":
        return { sql: `NOT ${visible.sql}`, params: visible.params };
      case "INCLUDES":
      case "INCLUDES_ALL":
      case "EXCLUDES": {
        if (criterion.refs.length === 0) return noClause();
        const refs = await hierarchicalRefClause(
          "studio",
          STUDIO_PARENT,
          criterion,
          ctx,
          { name: ctx.name }
        );
        return criterion.modifier === "EXCLUDES"
          ? anyOf([refs, { sql: `NOT ${visible.sql}`, params: visible.params }])
          : allOf([refs, visible]);
      }
    }
  }

  /**
   * The search across the name, details and aliases: every word must match
   * (`searchAll`), each as `likeContains` with `ESCAPE '\\'`, an alias read
   * one at a time; no `LOWER()`
   */
  protected override searchClause(q: string): FilterClause {
    return searchAll(searchTerms(q), (pattern) => ({
      sql: `(s.name LIKE ? ESCAPE '\\' OR s.details LIKE ? ESCAPE '\\' OR ${jsonListArm("s.aliases")})`,
      params: [pattern, pattern, pattern],
    }));
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
      aliases: parseJsonArray(row.aliases),
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
