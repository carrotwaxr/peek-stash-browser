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
import { entityKey, pairsJson } from "../utils/entityRef.js";
import { expandStudioIds, expandTagIds } from "../utils/hierarchyUtils.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  type ViaSceneSpec,
  refClause,
  viaSceneClause,
} from "../utils/sqlClauses.js";
import {
  buildDateFilter,
  buildFavoriteFilter,
  buildNumericFilter,
  buildTextFilter,
} from "../utils/sqlFilterBuilders.js";
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
  expandRefs,
} from "./query/EntityQueryBuilder.js";

// Column list for SELECT - all StashGallery fields plus user data
const SELECT_COLUMNS = `
    g.id, g.stashInstanceId, g.title, g.date, g.studioId, g.rating100 AS stashRating100,
    g.imageCount, g.coverImageId,
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
  selectColumns: () => ({ sql: SELECT_COLUMNS, params: [] }),
  defaultSort: "title",
  // By title, the id keeps the order stable; by anything else, the title
  tiebreak: (direction, field) =>
    field === "title" ? `g.id ${direction}` : `${TITLE} ASC`,
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

  protected sortMap(dir: SortDirection): Record<string, SortExpr> {
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

      // Counts
      image_count: column("g.imageCount"),

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
      push(this.hasFavoriteImageClause(ctx.userId));
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
      push(buildNumericFilter(filter.image_count, "COALESCE(g.imageCount, 0)"));
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
    const refs = await expandRefs(
      criterion.refs,
      criterion.depth,
      expandStudioIds
    );
    return refClause(GALLERY_STUDIO, refs, criterion.modifier, {
      name: "studios",
      allowedInstanceIds: ctx.allowedInstanceIds,
    });
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
    return refClause(GALLERY_TAGS, refs, criterion.modifier, {
      name: "tags",
      allowedInstanceIds: ctx.allowedInstanceIds,
    });
  }

  /** Galleries holding at least one image the viewer favorited */
  private hasFavoriteImageClause(userId: number): FilterClause {
    return {
      sql: `EXISTS (
        SELECT 1 FROM ImageGallery ig
        JOIN StashImage si ON ig.imageId = si.id AND ig.imageInstanceId = si.stashInstanceId
        JOIN ImageRating ir ON ir.imageId = si.id AND ir.instanceId = si.stashInstanceId AND ir.userId = ?
        WHERE ig.galleryId = g.id AND ig.galleryInstanceId = g.stashInstanceId
        AND ir.favorite = 1
      )`,
      params: [userId],
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
      image_count: row.imageCount ?? 0,

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
   * Populate gallery relations (performers, tags, studio), and each
   * gallery's count of the scenes the viewer can see
   */
  protected async populateRelations(
    galleries: NormalizedGallery[],
    ctx: QueryContext
  ): Promise<void> {
    if (galleries.length === 0) return;

    // Build gallery keys with instanceId for multi-instance support
    const galleryIds = galleries.map((g) => g.id);
    const galleryInstanceIds = [...new Set(galleries.map((g) => g.instanceId))];

    // Collect unique (studioId, instanceId) pairs - each gallery's studio comes
    // from its own instance; a gallery without a studio has none to load
    const studioKeys = [
      ...new Map(
        galleries.flatMap((g) =>
          g.studio?.id
            ? [
                [
                  entityKey(g.studio.id, g.instanceId),
                  { id: g.studio.id, instanceId: g.instanceId },
                ] as const,
              ]
            : []
        )
      ).values(),
    ];

    // Batch load all relations in parallel
    // Filter by both galleryId AND galleryInstanceId for multi-instance correctness
    const [performerJunctions, tagJunctions] = await Promise.all([
      prisma.galleryPerformer.findMany({
        where: {
          galleryId: { in: galleryIds },
          galleryInstanceId: { in: galleryInstanceIds },
        },
      }),
      prisma.galleryTag.findMany({
        where: {
          galleryId: { in: galleryIds },
          galleryInstanceId: { in: galleryInstanceIds },
        },
      }),
    ]);

    // Collect unique entity refs from junction tables, by entityKey
    const performerKeys = [
      ...new Map(
        performerJunctions.map((j) => [
          entityKey(j.performerId, j.performerInstanceId),
          { id: j.performerId, instanceId: j.performerInstanceId },
        ])
      ).values(),
    ];
    const tagKeys = [
      ...new Map(
        tagJunctions.map((j) => [
          entityKey(j.tagId, j.tagInstanceId),
          { id: j.tagId, instanceId: j.tagInstanceId },
        ])
      ).values(),
    ];

    // Build OR conditions for entity queries (need to match on composite keys)
    const performerOrConditions = performerKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const tagOrConditions = tagKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const studioOrConditions = studioKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));

    // Load actual entities (only those that exist) using composite key lookups
    const [performers, tags, studios] = await Promise.all([
      performerOrConditions.length > 0
        ? prisma.stashPerformer.findMany({
            where: { OR: performerOrConditions },
          })
        : Promise.resolve([]),
      tagOrConditions.length > 0
        ? prisma.stashTag.findMany({
            where: { OR: tagOrConditions },
          })
        : Promise.resolve([]),
      studioOrConditions.length > 0
        ? prisma.stashStudio.findMany({
            where: { OR: studioOrConditions },
          })
        : Promise.resolve([]),
    ]);

    // Build entity lookup maps by entityKey
    const performersByKey = new Map<string, PerformerRef>();
    for (const performer of performers) {
      const key = entityKey(performer.id, performer.stashInstanceId);
      performersByKey.set(key, {
        id: performer.id,
        instanceId: performer.stashInstanceId,
        name: performer.name,
        disambiguation: performer.disambiguation,
        gender: performer.gender,
        image_path: toProxyUrl(performer.imagePath, performer.stashInstanceId),
        favorite: performer.favorite,
        rating100: performer.rating100,
      });
    }

    const tagsByKey = new Map<string, TagRef>();
    for (const tag of tags) {
      const key = entityKey(tag.id, tag.stashInstanceId);
      tagsByKey.set(key, {
        id: tag.id,
        instanceId: tag.stashInstanceId,
        name: tag.name,
        image_path: toProxyUrl(tag.imagePath, tag.stashInstanceId),
        favorite: tag.favorite,
      });
    }

    const studiosByKey = new Map<string, StudioRef>();
    for (const studio of studios) {
      const key = entityKey(studio.id, studio.stashInstanceId);
      studiosByKey.set(key, {
        id: studio.id,
        instanceId: studio.stashInstanceId,
        name: studio.name,
        image_path: toProxyUrl(studio.imagePath, studio.stashInstanceId),
        favorite: studio.favorite,
        parent_studio: studio.parentId ? { id: studio.parentId } : null,
      });
    }

    // Build gallery-to-entities maps using junction tables with composite keys
    // Keyed by the gallery's entityKey -> entities[]
    const performersByGallery = new Map<string, PerformerRef[]>();
    for (const junction of performerJunctions) {
      const performerKey = entityKey(
        junction.performerId,
        junction.performerInstanceId
      );
      const performer = performersByKey.get(performerKey);
      if (!performer) continue; // Skip orphaned junction records
      const galleryKey = entityKey(
        junction.galleryId,
        junction.galleryInstanceId
      );
      const list = performersByGallery.get(galleryKey) ?? [];
      list.push(performer);
      performersByGallery.set(galleryKey, list);
    }

    const tagsByGallery = new Map<string, TagRef[]>();
    for (const junction of tagJunctions) {
      const tagKey = entityKey(junction.tagId, junction.tagInstanceId);
      const tag = tagsByKey.get(tagKey);
      if (!tag) continue; // Skip orphaned junction records
      const galleryKey = entityKey(
        junction.galleryId,
        junction.galleryInstanceId
      );
      const list = tagsByGallery.get(galleryKey) ?? [];
      list.push(tag);
      tagsByGallery.set(galleryKey, list);
    }

    const sceneTotals = await this.loadSceneTotals(galleries, ctx);

    // Populate galleries using composite keys
    for (const gallery of galleries) {
      const galleryKey = entityKey(gallery.id, gallery.instanceId);
      gallery.performers = performersByGallery.get(galleryKey) ?? [];
      gallery.tags = tagsByGallery.get(galleryKey) ?? [];
      gallery.relation_totals = { scenes: sceneTotals.get(galleryKey) ?? 0 };

      // Hydrate studio with full data using composite key
      if (gallery.studio?.id) {
        const studioKey = entityKey(gallery.studio.id, gallery.instanceId);
        const fullStudio = studiosByKey.get(studioKey);
        if (fullStudio) {
          gallery.studio = fullStudio;
        }
      }
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
