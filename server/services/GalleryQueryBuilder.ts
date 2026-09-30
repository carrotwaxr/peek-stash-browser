/**
 * GalleryQueryBuilder: the gallery list in SQL.
 *
 * The gallery builder on the base (`query/EntityQueryBuilder.ts`): this file
 * declares the gallery's spec (table, the rating and cover image joins,
 * columns, the title tiebreak), its filter clauses from the parsed request,
 * its sort map, its row transform and its relations, with each row's count
 * of the scenes the viewer can see. The instance filter, the exclusion
 * join, the `ids` filter, the random sort and the count are the base's.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import prisma from "../prisma/singleton.js";
import type {
  NormalizedGallery,
  PerformerRef,
  StudioRef,
  TagRef,
} from "../types/index.js";
import type {
  GalleryQueryRow,
  TooltipTotalRow,
} from "../types/internal/queryRows.js";
import type { ParsedFilter, RefCriterion } from "../types/parsedFilters.js";
import { type EntityRef, entityKey, pairsJson } from "../utils/entityRef.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  type ViaSceneSpec,
  buildDateFilter,
  buildFavoriteFilter,
  buildNumericFilter,
  buildTextFilter,
  exclusionJoin,
  refClause,
  viaSceneClause,
} from "../utils/sqlClauses.js";
import {
  emptyToNull,
  likeContains,
  parseJsonArray,
} from "../utils/sqlHelpers.js";
import { getGalleryFallbackTitle } from "../utils/titleUtils.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type QueryContext,
  type SortExpr,
  hierarchicalRefClause,
} from "./query/EntityQueryBuilder.js";
import { excludedCountsJoin, visibleCount } from "./query/excludedCounts.js";
import {
  PERFORMER_REF,
  STUDIO_REF,
  TAG_REF,
  loadNestedRefs,
  loadRefsByKey,
} from "./query/nestedRefs.js";

// Column list for SELECT - all StashGallery fields plus user data; the
// image count as the viewer sees it (query/excludedCounts.ts)
const selectColumns = (ctx: QueryContext) =>
  `
    g.id, g.stashInstanceId, g.title, g.date, g.studioId, g.rating100 AS stashRating100,
    ${visibleCount(ctx, "g.imageCount", "images")} AS imageCount, g.coverImageId,
    g.details, g.url, g.code, g.photographer, g.urls,
    g.folderPath, g.fileBasename, g.coverPath,
    g.stashCreatedAt, g.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    ci.width AS coverWidth, ci.height AS coverHeight
  `.trim();

/** The folder's name from its path: '/images/My Gallery' -> 'My Gallery' */
const FOLDER_NAME = `REPLACE(REPLACE(g.folderPath, RTRIM(g.folderPath, REPLACE(g.folderPath, '/', '')), ''), '/', '')`;

/**
 * The displayed title, case-insensitive: the title (NULLIF, since Stash
 * leaves many empty), else the file, else the folder's name
 */
const TITLE = `COALESCE(NULLIF(g.title, ''), g.fileBasename, ${FOLDER_NAME}) COLLATE NOCASE`;

const GALLERY_SPEC: EntitySpec = {
  table: "StashGallery",
  alias: "g",
  entityType: "gallery",
  userJoins: [{ table: "GalleryRating", alias: "r", entityIdCol: "galleryId" }],
  // The cover's dimensions; the image's primary key, so at most one row
  joins: [
    "LEFT JOIN StashImage ci ON g.coverImageId = ci.id AND g.stashInstanceId = ci.stashInstanceId",
  ],
  // The viewer's excluded links per gallery, for the count
  extraJoins: (ctx) => excludedCountsJoin(ctx, "gallery", "g"),
  selectColumns: (ctx) => ({ sql: selectColumns(ctx), params: [] }),
  defaultSort: "title",
  // Equal values list by title, then by the base's key
  tiebreak: (field) => (field === "title" ? undefined : `${TITLE} ASC`),
};

/** A gallery's studio, on the gallery's own row */
const GALLERY_STUDIO: ColumnTarget = {
  kind: "column",
  parentTable: "StashGallery",
  parentAlias: "g",
  idCol: "studioId",
  instanceCol: "stashInstanceId",
};

/** A gallery's tags */
const GALLERY_TAGS: JunctionTarget = {
  kind: "junction",
  table: "GalleryTag",
  alias: "gt",
  parentAlias: "g",
  parentIdCol: "galleryId",
  parentInstanceCol: "galleryInstanceId",
  refIdCol: "tagId",
  refInstanceCol: "tagInstanceId",
};

/** A gallery's performers */
const GALLERY_PERFORMERS: JunctionTarget = {
  kind: "junction",
  table: "GalleryPerformer",
  alias: "gp",
  parentAlias: "g",
  parentIdCol: "galleryId",
  parentInstanceCol: "galleryInstanceId",
  refIdCol: "performerId",
  refInstanceCol: "performerInstanceId",
};

/** Galleries holding one of the scenes (a scene's Galleries tab) */
const GALLERIES_BY_SCENE: ViaSceneSpec = {
  alias: "g",
  junction: { table: "SceneGallery", alias: "sg" },
  entityIdCol: "galleryId",
  entityInstanceCol: "galleryInstanceId",
  sceneIdCol: "sceneId",
  sceneInstanceCol: "sceneInstanceId",
};

/** A cover dimension of 0 is none */
const zeroToNull = (value: number | null): number | null =>
  value === 0 ? null : value;

/**
 * Builds and executes SQL queries for gallery filtering
 */
class GalleryQueryBuilder extends EntityQueryBuilder<
  GalleryQueryRow,
  NormalizedGallery,
  "gallery"
> {
  protected readonly spec = GALLERY_SPEC;

  protected sortMap(
    dir: SortDirection,
    _filter: ParsedFilter<"gallery">,
    ctx: QueryContext
  ): Record<string, SortExpr> {
    const column = (sql: string): SortExpr => ({
      sql: `${sql} ${dir}`,
      params: [],
    });
    return {
      // Gallery metadata: the displayed title, the folder case-insensitive
      title: column(TITLE),
      date: column("g.date"),
      created_at: column("g.stashCreatedAt"),
      updated_at: column("g.stashUpdatedAt"),
      path: column("g.folderPath COLLATE NOCASE"),

      // The count, as the viewer sees it
      image_count: column(visibleCount(ctx, "g.imageCount", "images")),

      // The viewer's rating (GalleryRating)
      rating: column("COALESCE(r.rating, 0)"),
      rating100: column("COALESCE(r.rating, 0)"),
    };
  }

  /** The gallery filter's clauses, one per criterion the request carried */
  protected async filterClauses(
    filter: ParsedFilter<"gallery">,
    q: string | undefined,
    ctx: QueryContext
  ): Promise<FilterClause[]> {
    const clauses: FilterClause[] = [];
    const push = (clause: FilterClause) => clauses.push(clause);

    if (q !== undefined) push(this.searchClause(q));

    // The viewer's own data
    push(buildFavoriteFilter(filter.favorite));
    if (filter.hasFavoriteImage === true) {
      push(this.hasFavoriteImageClause(ctx));
    }

    // Related entities
    if (filter.studios) push(await this.studioClause(filter.studios, ctx));
    if (filter.scenes) {
      push(
        viaSceneClause(
          GALLERIES_BY_SCENE,
          filter.scenes.refs,
          filter.scenes.modifier
        )
      );
    }
    if (filter.performers) {
      push(
        refClause(
          GALLERY_PERFORMERS,
          filter.performers.refs,
          filter.performers.modifier,
          { name: "performers", allowedInstanceIds: ctx.allowedInstanceIds }
        )
      );
    }
    if (filter.tags) push(await this.tagClause(filter.tags, ctx));

    // The viewer's rating and the counts
    if (filter.rating100) {
      push(buildNumericFilter(filter.rating100, "COALESCE(r.rating, 0)"));
    }
    if (filter.image_count) {
      push(
        buildNumericFilter(
          filter.image_count,
          visibleCount(ctx, "g.imageCount", "images")
        )
      );
    }

    // Text
    if (filter.title) push(buildTextFilter(filter.title, "g.title"));

    // Dates
    if (filter.date) push(buildDateFilter(filter.date, "g.date"));
    if (filter.created_at) {
      push(buildDateFilter(filter.created_at, "g.stashCreatedAt"));
    }
    if (filter.updated_at) {
      push(buildDateFilter(filter.updated_at, "g.stashUpdatedAt"));
    }

    return clauses;
  }

  /**
   * The studio filter, with the studios' descendants to the depth. A
   * gallery has one studio, so the parser never sends INCLUDES_ALL here.
   */
  private async studioClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    return hierarchicalRefClause("studio", GALLERY_STUDIO, criterion, ctx, {
      name: "studios",
    });
  }

  /** The tag filter, with the tags' descendants to the depth */
  private async tagClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    return hierarchicalRefClause("tag", GALLERY_TAGS, criterion, ctx, {
      name: "tags",
    });
  }

  /**
   * Galleries holding at least one image the viewer favorited and can see:
   * live and, with the viewer's exclusions applied, not excluded for them
   */
  private hasFavoriteImageClause(ctx: QueryContext): FilterClause {
    const exclusion = ctx.applyExclusions
      ? exclusionJoin("ie", "image", "si.id", "si.stashInstanceId")
      : "";
    return {
      sql: `EXISTS (
        SELECT 1 FROM ImageGallery ig
        JOIN StashImage si ON ig.imageId = si.id AND ig.imageInstanceId = si.stashInstanceId
        JOIN ImageRating ir ON ir.imageId = si.id AND ir.instanceId = si.stashInstanceId AND ir.userId = ?
        ${exclusion}
        WHERE ig.galleryId = g.id AND ig.galleryInstanceId = g.stashInstanceId
        AND ir.favorite = 1 AND si.deletedAt IS NULL${ctx.applyExclusions ? " AND ie.id IS NULL" : ""}
      )`,
      params: ctx.applyExclusions ? [ctx.userId, ctx.userId] : [ctx.userId],
    };
  }

  /**
   * The search across the title, details and photographer: `likeContains`
   * with `ESCAPE '\'`, so a `%`, `_` or `\` in the text matches itself
   */
  private searchClause(q: string): FilterClause {
    const pattern = likeContains(q.toLowerCase());
    return {
      sql: "(LOWER(g.title) LIKE ? ESCAPE '\\' OR LOWER(g.details) LIKE ? ESCAPE '\\' OR LOWER(g.photographer) LIKE ? ESCAPE '\\')",
      params: [pattern, pattern, pattern],
    };
  }

  /**
   * Transform a raw database row into a NormalizedGallery
   */
  protected transformRow(row: GalleryQueryRow): NormalizedGallery {
    const gallery = {
      id: row.id,
      instanceId: row.stashInstanceId,
      title:
        emptyToNull(row.title) ??
        getGalleryFallbackTitle(row.folderPath, row.fileBasename),
      date: emptyToNull(row.date),
      code: emptyToNull(row.code),
      details: emptyToNull(row.details),
      photographer: emptyToNull(row.photographer),
      url: emptyToNull(row.url),
      urls: parseJsonArray(row.urls),

      // Counts
      image_count: Number(row.imageCount ?? 0),

      // File paths
      folder: row.folderPath ? { path: row.folderPath } : null,

      // Cover path - transform to proxy URL with instanceId for multi-instance routing
      cover: toProxyUrl(row.coverPath, row.stashInstanceId),

      // Cover dimensions (from StashImage via coverImageId)
      coverWidth: zeroToNull(row.coverWidth),
      coverHeight: zeroToNull(row.coverHeight),

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString() ?? null,
      updated_at: row.stashUpdatedAt?.toISOString() ?? null,

      // User data - Peek user data ONLY
      rating: row.userRating,
      rating100: row.userRating,
      favorite: row.userFavorite ?? false,

      // Files - empty, populated elsewhere if needed
      files: [] as Array<{ basename: string }>,

      // Relations - populated separately
      studio: row.studioId
        ? ({ id: row.studioId, name: "" } as StudioRef)
        : null,
      performers: [] as PerformerRef[],
      tags: [] as TagRef[],
      scenes: [] as Array<{
        id: string;
        title: string | null;
        paths: { screenshot: string | null };
      }>,
      // Filled by populateRelations
      relation_totals: { scenes: 0 },
    };

    return gallery as NormalizedGallery;
  }

  /**
   * Each gallery's performers, tags and studio, only those the viewer may
   * see (`query/nestedRefs.ts`), and its count of the scenes the viewer can
   * see: one statement per relation for the page. A gallery's studio is on
   * the gallery's own instance.
   */
  protected async populateRelations(
    galleries: NormalizedGallery[],
    ctx: QueryContext
  ): Promise<void> {
    if (galleries.length === 0) return;

    const studioRefs = galleries.flatMap((gallery): EntityRef[] =>
      gallery.studio
        ? [{ id: gallery.studio.id, instanceId: gallery.instanceId }]
        : []
    );
    const [performers, tags, studios] = await Promise.all([
      loadNestedRefs(PERFORMER_REF, GALLERY_PERFORMERS, galleries, ctx),
      loadNestedRefs(TAG_REF, GALLERY_TAGS, galleries, ctx),
      loadRefsByKey(STUDIO_REF, studioRefs, ctx),
    ]);
    const sceneTotals = await this.loadSceneTotals(galleries, ctx);

    for (const gallery of galleries) {
      const key = entityKey(gallery.id, gallery.instanceId);
      gallery.performers = performers.get(key) ?? [];
      gallery.tags = tags.get(key) ?? [];
      gallery.relation_totals = { scenes: sceneTotals.get(key) ?? 0 };
      // The row's studio id until here; none when the viewer cannot see it
      gallery.studio = gallery.studio
        ? (studios.get(entityKey(gallery.studio.id, gallery.instanceId)) ??
          null)
        : null;
    }
  }

  /**
   * How many scenes each gallery on the page holds that the viewer can see,
   * by the gallery's entityKey (none: absent): live scenes, not excluded
   * for the viewer (with the exclusions applied), on the gallery's own
   * instance, which the list already holds to the allowed ones. One
   * statement for the page, driven from its (id, instance) pairs into
   * SceneGallery's (galleryId, galleryInstanceId) index.
   */
  private async loadSceneTotals(
    galleries: readonly NormalizedGallery[],
    ctx: QueryContext
  ): Promise<Map<string, number>> {
    const exclusion = ctx.applyExclusions
      ? `LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = s.id AND (e.instanceId = '' OR e.instanceId = s.stashInstanceId)
      WHERE e.id IS NULL`
      : "";
    const rows = await prisma.$queryRawUnsafe<TooltipTotalRow[]>(
      `WITH page(pid, pinst) AS (
        SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?)
      )
      SELECT pg.pid, pg.pinst, COUNT(*) AS total
      FROM page pg
      CROSS JOIN SceneGallery sg ON sg.galleryId = pg.pid AND sg.galleryInstanceId = pg.pinst AND sg.sceneInstanceId = pg.pinst
      JOIN StashScene s ON s.id = sg.sceneId AND s.stashInstanceId = sg.sceneInstanceId AND s.deletedAt IS NULL
      ${exclusion}
      GROUP BY pg.pid, pg.pinst`,
      pairsJson(galleries),
      ...(ctx.applyExclusions ? [ctx.userId] : [])
    );
    return new Map(
      rows.map((row) => [entityKey(row.pid, row.pinst), Number(row.total)])
    );
  }
}

// Export singleton instance
export const galleryQueryBuilder = new GalleryQueryBuilder();
