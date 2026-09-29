/**
 * SceneQueryBuilder: the scene list in SQL.
 *
 * The scene builder on the base (`query/EntityQueryBuilder.ts`): this file
 * declares the scene's spec (table, per-user joins, columns, tiebreak), its
 * filter clauses from the parsed request, its sort map, its row transform
 * and its relations. The instance filter, the exclusion join, the `ids`
 * filter, the random sort and the count are the base's.
 */
import type {
  Resolution,
  SortDirection,
} from "@peek/shared-types/filters/index.js";
import prisma from "../prisma/singleton.js";
import type {
  GalleryRef,
  GroupRef,
  NormalizedScene,
  PerformerRef,
  StudioRef,
  TagRef,
} from "../types/index.js";
import type { SceneQueryRow } from "../types/internal/queryRows.js";
import type {
  EnumCriterion,
  FilterRef,
  MultiEnumCriterion,
  ParsedFilter,
  RefCriterion,
} from "../types/parsedFilters.js";
import { entityKey } from "../utils/entityRef.js";
import { expandStudioIds, expandTagIds } from "../utils/hierarchyUtils.js";
import { readHistory } from "../utils/historyJson.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  allOf,
  noClause,
  refClause,
} from "../utils/sqlClauses.js";
import {
  buildDateFilter,
  buildFavoriteFilter,
  buildNumericFilter,
  buildTextFilter,
} from "../utils/sqlFilterBuilders.js";
import { emptyToNull, parseJsonArray } from "../utils/sqlHelpers.js";
import { getSceneFallbackTitle } from "../utils/titleUtils.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type QueryContext,
  type SortExpr,
} from "./query/EntityQueryBuilder.js";

export type {
  ByRefsOptions,
  ListQueryOptions,
  ListResult,
} from "./query/EntityQueryBuilder.js";

// Column list for SELECT - all StashScene fields plus user data
const SELECT_COLUMNS = `
    s.id, s.stashInstanceId, s.title, s.code, s.date, s.studioId, s.rating100 AS stashRating100,
    s.duration, s.organized, s.details, s.director, s.urls, s.filePath, s.fileBitRate,
    s.fileFrameRate, s.fileWidth, s.fileHeight, s.fileVideoCodec,
    s.fileAudioCodec, s.fileSize, s.pathScreenshot, s.pathPreview,
    s.pathSprite, s.pathVtt, s.pathChaptersVtt, s.pathStream, s.pathCaption, s.captions,
    s.inheritedTagIds,
    s.oCounter AS stashOCounter, s.playCount AS stashPlayCount,
    s.playDuration AS stashPlayDuration, s.stashCreatedAt, s.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    w.playCount AS userPlayCount, w.playDuration AS userPlayDuration,
    w.lastPlayedAt AS userLastPlayedAt, w.oCount AS userOCount,
    w.resumeTime AS userResumeTime, w.oHistory AS userOHistory,
    w.playHistory AS userPlayHistory
  `.trim();

const SCENE_SPEC: EntitySpec = {
  table: "StashScene",
  alias: "s",
  entityType: "scene",
  userJoins: [
    { table: "SceneRating", alias: "r", entityIdCol: "sceneId" },
    { table: "WatchHistory", alias: "w", entityIdCol: "sceneId" },
  ],
  selectColumns: () => ({ sql: SELECT_COLUMNS, params: [] }),
  defaultSort: "created_at",
  tiebreak: (direction) => `s.id ${direction}`,
};

/** A scene's junction to another entity, for the ref filters */
const junction = (
  table: string,
  alias: string,
  refIdCol: string,
  refInstanceCol: string
): JunctionTarget => ({
  kind: "junction",
  table,
  alias,
  parentAlias: "s",
  parentIdCol: "sceneId",
  parentInstanceCol: "sceneInstanceId",
  refIdCol,
  refInstanceCol,
});
const SCENE_PERFORMERS = junction(
  "ScenePerformer",
  "sp",
  "performerId",
  "performerInstanceId"
);
const SCENE_TAGS = junction("SceneTag", "st", "tagId", "tagInstanceId");
const SCENE_GROUPS = junction("SceneGroup", "sg", "groupId", "groupInstanceId");
const SCENE_GALLERIES = junction(
  "SceneGallery",
  "sg",
  "galleryId",
  "galleryInstanceId"
);
/** A scene's studio is a column of its own row, on the scene's instance */
const SCENE_STUDIO: ColumnTarget = {
  kind: "column",
  parentTable: "StashScene",
  parentAlias: "s",
  idCol: "studioId",
  instanceCol: "stashInstanceId",
};

/**
 * The pixel height each resolution names; SEVEN_K and HUGE have none yet
 * (B11), so they filter nothing.
 */
const RESOLUTION_HEIGHTS: Partial<Record<Resolution, number>> = {
  VERY_LOW: 144,
  LOW: 240,
  R360P: 360,
  STANDARD: 480,
  WEB_HD: 540,
  STANDARD_HD: 720,
  FULL_HD: 1080,
  QUAD_HD: 1440,
  VR_HD: 1920,
  FOUR_K: 2160,
  FIVE_K: 2880,
  SIX_K: 3240,
  EIGHT_K: 4320,
};

/**
 * The oldest performer's age on the scene's date (today's, without a date):
 * (scene date - birthdate) in years, as SQLite computes it
 */
const PERFORMER_AGE = `(
      SELECT MAX(
        CAST((julianday(COALESCE(s.date, date('now'))) - julianday(p.birthdate)) / 365.25 AS INTEGER)
      )
      FROM ScenePerformer sp
      JOIN StashPerformer p ON sp.performerId = p.id AND sp.performerInstanceId = p.stashInstanceId
      WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND p.birthdate IS NOT NULL
    )`;

/**
 * The refs with their descendants to `depth` (0: none). Expansion works on
 * bare ids (C9 keeps the instance through it): the selected refs keep their
 * instance, and a descendant matches its id on every instance, as today.
 */
async function expandRefs(
  refs: readonly FilterRef[],
  depth: number,
  expand: (ids: string[], depth: number) => Promise<string[]>
): Promise<readonly FilterRef[]> {
  if (depth === 0) return refs;
  const own = new Set(refs.map((ref) => ref.id));
  const expanded = await expand(
    refs.map((ref) => ref.id),
    depth
  );
  return [
    ...refs,
    ...expanded
      .filter((id) => !own.has(id))
      .map((id): FilterRef => ({ id, instanceId: undefined })),
  ];
}

/**
 * Builds and executes SQL queries for scene filtering
 */
class SceneQueryBuilder extends EntityQueryBuilder<
  SceneQueryRow,
  NormalizedScene,
  "scene"
> {
  protected readonly spec = SCENE_SPEC;

  /**
   * The sort expressions. title, performer_count and tag_count read the
   * columns sync stores (SCENE_DERIVED_COLUMNS_SQL in StashSyncService):
   * titleSort is the displayed title with ASCII lower-cased, so its BINARY
   * order is the case-insensitive title order. Each has a (deletedAt,
   * column, id) index, which serves the order with its id tiebreak as is.
   * last_o_at and scene_index have no expression yet (B12) and fall back to
   * the default sort.
   */
  protected sortMap(dir: SortDirection): Record<string, SortExpr> {
    const column = (sql: string): SortExpr => ({
      sql: `${sql} ${dir}`,
      params: [],
    });
    return {
      // Scene metadata
      created_at: column("s.stashCreatedAt"),
      updated_at: column("s.stashUpdatedAt"),
      date: column("s.date"),
      title: column("s.titleSort"),
      duration: column("s.duration"),
      filesize: column("s.fileSize"),
      bitrate: column("s.fileBitRate"),
      framerate: column("s.fileFrameRate"),
      path: column("s.filePath"),
      performer_count: column("s.performerCount"),
      tag_count: column("s.tagCount"),

      // The viewer's rating (SceneRating)
      rating: column("COALESCE(r.rating, 0)"),
      user_rating: column("COALESCE(r.rating, 0)"),

      // The viewer's history (WatchHistory)
      last_played_at: column("w.lastPlayedAt"),
      play_count: column("COALESCE(w.playCount, 0)"),
      play_duration: column("COALESCE(w.playDuration, 0)"),
      o_counter: column("COALESCE(w.oCount, 0)"),
      resume_time: column("COALESCE(w.resumeTime, 0)"),
    };
  }

  /**
   * The scene filter's clauses, one per criterion the request carried.
   * `director` and `organized` are declared in the contract but have no
   * clause yet (B11).
   */
  protected async filterClauses(
    filter: ParsedFilter<"scene">,
    q: string | undefined,
    ctx: QueryContext
  ): Promise<FilterClause[]> {
    const { userId, allowedInstanceIds } = ctx;
    const refs = (
      name: string,
      target: JunctionTarget,
      criterion: RefCriterion
    ) =>
      refClause(target, criterion.refs, criterion.modifier, {
        name,
        allowedInstanceIds,
      });

    const clauses: FilterClause[] = [];
    const push = (clause: FilterClause | undefined) => {
      if (clause !== undefined) clauses.push(clause);
    };

    // Metadata
    if (filter.duration) {
      push(buildNumericFilter(filter.duration, "COALESCE(s.duration, 0)"));
    }
    if (filter.resolution) push(this.resolutionClause(filter.resolution));

    // Related entities
    if (filter.performers) {
      push(refs("performers", SCENE_PERFORMERS, filter.performers));
    }
    if (filter.tags) push(await this.tagClause(filter.tags, ctx));
    if (filter.studios) push(await this.studioClause(filter.studios, ctx));
    if (filter.groups) push(refs("groups", SCENE_GROUPS, filter.groups));
    if (filter.galleries) {
      push(refs("galleries", SCENE_GALLERIES, filter.galleries));
    }

    // The viewer's own data
    push(buildFavoriteFilter(filter.favorite));
    if (filter.rating100) {
      push(buildNumericFilter(filter.rating100, "COALESCE(r.rating, 0)"));
    }
    if (filter.play_count) {
      push(buildNumericFilter(filter.play_count, "COALESCE(w.playCount, 0)"));
    }
    if (filter.o_counter) {
      push(buildNumericFilter(filter.o_counter, "COALESCE(w.oCount, 0)"));
    }

    // Text
    if (filter.title) push(buildTextFilter(filter.title, "s.title"));
    if (filter.details) push(buildTextFilter(filter.details, "s.details"));

    // Dates
    if (filter.date) push(buildDateFilter(filter.date, "s.date"));
    if (filter.created_at) {
      push(buildDateFilter(filter.created_at, "s.stashCreatedAt"));
    }
    if (filter.updated_at) {
      push(buildDateFilter(filter.updated_at, "s.stashUpdatedAt"));
    }
    if (filter.last_played_at) {
      push(buildDateFilter(filter.last_played_at, "w.lastPlayedAt"));
    }

    // Numbers
    if (filter.bitrate) {
      push(buildNumericFilter(filter.bitrate, "COALESCE(s.fileBitRate, 0)"));
    }
    if (filter.framerate) {
      push(
        buildNumericFilter(filter.framerate, "COALESCE(s.fileFrameRate, 0)")
      );
    }
    if (filter.play_duration) {
      push(
        buildNumericFilter(filter.play_duration, "COALESCE(w.playDuration, 0)")
      );
    }

    // Counts, stored by sync (SCENE_DERIVED_COLUMNS_SQL): the scene's
    // ScenePerformer and SceneTag rows
    if (filter.performer_count) {
      push(buildNumericFilter(filter.performer_count, "s.performerCount"));
    }
    if (filter.tag_count) {
      push(buildNumericFilter(filter.tag_count, "s.tagCount"));
    }
    if (filter.performer_age) {
      push(buildNumericFilter(filter.performer_age, PERFORMER_AGE));
    }

    // Enums
    if (filter.orientation) push(this.orientationClause(filter.orientation));
    if (filter.video_codec) {
      push(buildTextFilter(filter.video_codec, "s.fileVideoCodec"));
    }
    if (filter.audio_codec) {
      push(buildTextFilter(filter.audio_codec, "s.fileAudioCodec"));
    }

    // The viewer's favorite entities
    if (filter.performer_favorite === true) {
      push(this.buildPerformerFavoriteFilter(userId));
    }
    if (filter.studio_favorite === true) {
      push(this.buildStudioFavoriteFilter(userId));
    }
    if (filter.tag_favorite === true) {
      push(this.buildTagFavoriteFilter(userId));
    }

    // Text search across title, details, path, performers, studio, tags
    if (q !== undefined) push(this.buildSearchQueryFilter(q));

    return clauses;
  }

  /**
   * The tag filter: the scene's own tags (SceneTag) and its inherited tags
   * (the inheritedTagIds JSON list). With a depth, INCLUDES_ALL is one
   * clause per selected tag, each with its own descendants (QUERIES-08).
   */
  private async tagClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    const opts = {
      name: "tags",
      allowedInstanceIds: ctx.allowedInstanceIds,
      inheritedJson: "inheritedTagIds",
    };
    if (criterion.depth !== 0 && criterion.modifier === "INCLUDES_ALL") {
      const groups = await Promise.all(
        criterion.refs.map((ref) =>
          expandRefs([ref], criterion.depth, expandTagIds)
        )
      );
      return allOf(
        groups.map((group, i) =>
          refClause(SCENE_TAGS, group, "INCLUDES", {
            ...opts,
            name: `tags_${i}`,
          })
        )
      );
    }
    const refs = await expandRefs(
      criterion.refs,
      criterion.depth,
      expandTagIds
    );
    return refClause(SCENE_TAGS, refs, criterion.modifier, opts);
  }

  /** The studio filter, with the studios' descendants to the depth */
  private async studioClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    const refs = await expandRefs(
      criterion.refs,
      criterion.depth,
      expandStudioIds
    );
    return refClause(SCENE_STUDIO, refs, criterion.modifier, {
      name: "studios",
      allowedInstanceIds: ctx.allowedInstanceIds,
    });
  }

  private resolutionClause(criterion: EnumCriterion<Resolution>): FilterClause {
    const height = RESOLUTION_HEIGHTS[criterion.value];
    if (height === undefined) return noClause();
    const col = "COALESCE(s.fileHeight, 0)";
    const operator = {
      EQUALS: "=",
      NOT_EQUALS: "!=",
      GREATER_THAN: ">",
      LESS_THAN: "<",
    }[criterion.modifier];
    return { sql: `${col} ${operator} ?`, params: [height] };
  }

  private orientationClause(
    criterion: MultiEnumCriterion<"LANDSCAPE" | "PORTRAIT" | "SQUARE">
  ): FilterClause {
    const conditions = criterion.values.map(
      (orientation) =>
        ({
          LANDSCAPE: "(s.fileWidth > s.fileHeight)",
          PORTRAIT: "(s.fileWidth < s.fileHeight)",
          SQUARE: "(s.fileWidth = s.fileHeight AND s.fileWidth > 0)",
        })[orientation]
    );
    return { sql: `(${conditions.join(" OR ")})`, params: [] };
  }

  /**
   * Build text search filter clause (searches across title, details, path, performers, studio, tags)
   * Uses LIKE with wildcard for broad text matching
   */
  private buildSearchQueryFilter(searchQuery: string): FilterClause {
    const query = searchQuery.trim();
    if (query === "") return noClause();
    const likeParam = `%${query}%`;

    // Build OR clause that searches across multiple fields including relations via subqueries
    // Using LOWER() for case-insensitive matching
    const sql = `(
      LOWER(s.title) LIKE LOWER(?) OR
      LOWER(s.details) LIKE LOWER(?) OR
      LOWER(s.filePath) LIKE LOWER(?) OR
      EXISTS (
        SELECT 1 FROM ScenePerformer sp
        INNER JOIN StashPerformer p ON sp.performerId = p.id AND sp.performerInstanceId = p.stashInstanceId
        WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
        AND LOWER(p.name) LIKE LOWER(?)
      ) OR
      EXISTS (
        SELECT 1 FROM StashStudio st
        WHERE st.id = s.studioId AND st.stashInstanceId = s.stashInstanceId
        AND LOWER(st.name) LIKE LOWER(?)
      ) OR
      EXISTS (
        SELECT 1 FROM SceneTag stag
        INNER JOIN StashTag t ON stag.tagId = t.id AND stag.tagInstanceId = t.stashInstanceId
        WHERE stag.sceneId = s.id AND stag.sceneInstanceId = s.stashInstanceId
        AND LOWER(t.name) LIKE LOWER(?)
      )
    )`;

    return {
      sql,
      params: [
        likeParam,
        likeParam,
        likeParam,
        likeParam,
        likeParam,
        likeParam,
      ],
    };
  }

  /**
   * Build performer favorite filter clause
   * Returns scenes that have at least one favorite performer
   */
  private buildPerformerFavoriteFilter(userId: number): FilterClause {
    return {
      sql: `EXISTS (
        SELECT 1 FROM ScenePerformer sp
        JOIN PerformerRating pr ON sp.performerId = pr.performerId AND sp.performerInstanceId = pr.instanceId AND pr.userId = ?
        WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND pr.favorite = 1
      )`,
      params: [userId],
    };
  }

  /**
   * Build studio favorite filter clause
   * Returns scenes that have a favorite studio
   */
  private buildStudioFavoriteFilter(userId: number): FilterClause {
    return {
      sql: `EXISTS (
        SELECT 1 FROM StudioRating sr
        WHERE sr.studioId = s.studioId AND sr.instanceId = s.stashInstanceId AND sr.userId = ? AND sr.favorite = 1
      )`,
      params: [userId],
    };
  }

  /**
   * Build tag favorite filter clause
   * Returns scenes that have at least one favorite tag
   */
  private buildTagFavoriteFilter(userId: number): FilterClause {
    return {
      sql: `EXISTS (
        SELECT 1 FROM SceneTag st
        JOIN TagRating tr ON st.tagId = tr.tagId AND st.tagInstanceId = tr.instanceId AND tr.userId = ?
        WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND tr.favorite = 1
      )`,
      params: [userId],
    };
  }

  /**
   * Transform a raw database row into a NormalizedScene
   */
  protected transformRow(row: SceneQueryRow): NormalizedScene {
    // Parse JSON fields
    const oHistory = readHistory(row.userOHistory);
    const playHistory = readHistory(row.userPlayHistory);

    // Determine last_o_at from o_history
    const lastOAt = oHistory.length > 0 ? oHistory[oHistory.length - 1] : null;

    // Create scene object with studioId preserved for population
    const scene = {
      id: row.id,
      instanceId: row.stashInstanceId,
      title: emptyToNull(row.title) ?? getSceneFallbackTitle(row.filePath),
      code: emptyToNull(row.code),
      date: emptyToNull(row.date),
      details: emptyToNull(row.details),
      director: emptyToNull(row.director),
      organized: row.organized,
      created_at: row.stashCreatedAt?.toISOString() ?? null,
      updated_at: row.stashUpdatedAt?.toISOString() ?? null,

      // URLs
      urls: parseJsonArray(row.urls),

      // Store studioId for later population
      studioId: row.studioId,

      // User data - Peek user data ONLY, never fall back to Stash user data
      // Stash data (stashOCounter, stashPlayCount, etc.) belongs to the Stash user,
      // not the Peek user. Each Peek user starts at 0 for these fields.
      rating: row.userRating ?? null,
      rating100: row.userRating ?? null,
      favorite: row.userFavorite ?? false,
      o_counter: row.userOCount ?? 0,
      play_count: row.userPlayCount ?? 0,
      play_duration: row.userPlayDuration ?? 0,
      resume_time: row.userResumeTime ?? 0,
      play_history: playHistory,
      // The stored ISO strings, as the JSON carries them
      o_history: oHistory,
      last_played_at: row.userLastPlayedAt?.toISOString() ?? null,
      last_o_at: lastOAt,

      // File data - build from individual columns
      files: row.filePath
        ? [
            {
              path: row.filePath,
              basename:
                emptyToNull(row.filePath.split("/").pop()?.split("\\").pop()) ??
                row.filePath,
              duration: row.duration,
              bit_rate: row.fileBitRate,
              frame_rate: row.fileFrameRate,
              width: row.fileWidth,
              height: row.fileHeight,
              video_codec: row.fileVideoCodec,
              audio_codec: row.fileAudioCodec,
              size: row.fileSize ? Number(row.fileSize) : null,
            },
          ]
        : [],

      // Paths - transform to proxy URLs with instanceId for multi-instance routing
      paths: {
        screenshot: toProxyUrl(row.pathScreenshot, row.stashInstanceId),
        preview: toProxyUrl(row.pathPreview, row.stashInstanceId),
        // Always null: Peek serves streams and captions through its own
        // routes, and the media proxy refuses both Stash routes
        stream: null,
        sprite: toProxyUrl(
          row.pathSprite ? `/scene/${row.id}/vtt/sprite` : null,
          row.stashInstanceId
        ),
        vtt: toProxyUrl(
          row.pathVtt ? `/scene/${row.id}/vtt/thumbs` : null,
          row.stashInstanceId
        ),
        chapters_vtt: toProxyUrl(row.pathChaptersVtt, row.stashInstanceId),
        caption: null,
      },

      // Lists carry no streams; single-scene lookups add them
      // (StashEntityService.getPlaybackStreams)
      sceneStreams: [],

      // Caption metadata for multi-language subtitle support
      captions: row.captions ? (JSON.parse(row.captions) as unknown[]) : [],

      // Relations - populated separately after query
      studio: null as StudioRef | null,
      performers: [] as PerformerRef[],
      tags: [] as TagRef[],
      groups: [] as GroupRef[],
      galleries: [] as GalleryRef[],

      // Inherited tags - IDs parsed here, hydrated with names in populateRelations
      inheritedTagIds: parseJsonArray(row.inheritedTagIds),
      inheritedTags: [] as TagRef[], // Will be populated in populateRelations
    };

    return scene as NormalizedScene;
  }

  /**
   * Populate scene relations (performers, tags, studio, groups, galleries)
   * Called after main query with just the scene IDs we need
   *
   * Multi-instance aware: keys every map by entityKey (id and instance) to
   * correctly associate relations when same IDs exist across different instances.
   */
  protected async populateRelations(scenes: NormalizedScene[]): Promise<void> {
    if (scenes.length === 0) return;

    // Build scene keys with instanceId for multi-instance support
    // All scenes should have valid instanceIds after migration
    const normalizeInstanceId = (id: string | null | undefined): string => {
      if (!id) {
        throw new Error(
          "Scene has null/undefined instanceId - this should not happen after migration"
        );
      }
      return id;
    };

    const sceneIds = scenes.map((s) => s.id);
    const sceneInstanceIds = [
      ...new Set(scenes.map((s) => normalizeInstanceId(s.instanceId))),
    ];
    // Collect unique (studioId, instanceId) pairs - each scene's studio comes from its own instance
    const studioKeys = [
      ...new Map(
        scenes.flatMap((s) =>
          s.studioId
            ? [
                [
                  entityKey(s.studioId, normalizeInstanceId(s.instanceId)),
                  {
                    id: s.studioId,
                    instanceId: normalizeInstanceId(s.instanceId),
                  },
                ] as const,
              ]
            : []
        )
      ).values(),
    ];

    // Batch load all relations in parallel
    // Filter by both sceneId AND sceneInstanceId for multi-instance correctness
    const [performerJunctions, tagJunctions, groupJunctions, galleryJunctions] =
      await Promise.all([
        prisma.scenePerformer.findMany({
          where: {
            sceneId: { in: sceneIds },
            sceneInstanceId: { in: sceneInstanceIds },
          },
        }),
        prisma.sceneTag.findMany({
          where: {
            sceneId: { in: sceneIds },
            sceneInstanceId: { in: sceneInstanceIds },
          },
        }),
        prisma.sceneGroup.findMany({
          where: {
            sceneId: { in: sceneIds },
            sceneInstanceId: { in: sceneInstanceIds },
          },
        }),
        prisma.sceneGallery.findMany({
          where: {
            sceneId: { in: sceneIds },
            sceneInstanceId: { in: sceneInstanceIds },
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
    const groupKeys = [
      ...new Map(
        groupJunctions.map((j) => [
          entityKey(j.groupId, j.groupInstanceId),
          { id: j.groupId, instanceId: j.groupInstanceId },
        ])
      ).values(),
    ];
    const galleryKeys = [
      ...new Map(
        galleryJunctions.map((j) => [
          entityKey(j.galleryId, j.galleryInstanceId),
          { id: j.galleryId, instanceId: j.galleryInstanceId },
        ])
      ).values(),
    ];

    // Collect inherited tag IDs (these may not be in tagJunctions since they come from performers/studios/groups)
    // For inherited tags, we use just ID since they're pre-computed and stored without instance info
    const inheritedTagIdSet = new Set<string>();
    for (const scene of scenes) {
      if (scene.inheritedTagIds && scene.inheritedTagIds.length > 0) {
        for (const tagId of scene.inheritedTagIds) {
          inheritedTagIdSet.add(tagId);
        }
      }
    }

    // Build OR conditions for entity queries (need to match on composite keys)
    const performerOrConditions = performerKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const tagOrConditions = tagKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    // Add inherited tags - these use scene's instance since they're from the same Stash
    const inheritedTagOrConditions = [...inheritedTagIdSet].map((tagId) => ({
      id: tagId,
      stashInstanceId: { in: sceneInstanceIds },
    }));
    const allTagOrConditions = [
      ...tagOrConditions,
      ...inheritedTagOrConditions,
    ];
    const groupOrConditions = groupKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const galleryOrConditions = galleryKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const studioOrConditions = studioKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));

    // Load actual entities (only those that exist) using composite key lookups
    const [performers, tags, groups, galleries, studios] = await Promise.all([
      performerOrConditions.length > 0
        ? prisma.stashPerformer.findMany({
            where: { OR: performerOrConditions },
          })
        : Promise.resolve([]),
      allTagOrConditions.length > 0
        ? prisma.stashTag.findMany({
            where: { OR: allTagOrConditions },
          })
        : Promise.resolve([]),
      groupOrConditions.length > 0
        ? prisma.stashGroup.findMany({
            where: { OR: groupOrConditions },
          })
        : Promise.resolve([]),
      galleryOrConditions.length > 0
        ? prisma.stashGallery.findMany({
            where: { OR: galleryOrConditions },
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
      performersByKey.set(key, this.transformStashPerformer(performer));
    }

    const tagsByKey = new Map<string, TagRef>();
    for (const tag of tags) {
      const key = entityKey(tag.id, tag.stashInstanceId);
      tagsByKey.set(key, this.transformStashTag(tag));
    }

    const groupsByKey = new Map<string, GroupRef>();
    for (const group of groups) {
      const key = entityKey(group.id, group.stashInstanceId);
      groupsByKey.set(key, this.transformStashGroup(group));
    }

    const galleriesByKey = new Map<string, GalleryRef>();
    for (const gallery of galleries) {
      const key = entityKey(gallery.id, gallery.stashInstanceId);
      galleriesByKey.set(key, this.transformStashGallery(gallery));
    }

    const studiosByKey = new Map<string, StudioRef>();
    for (const studio of studios) {
      const key = entityKey(studio.id, studio.stashInstanceId);
      studiosByKey.set(key, this.transformStashStudio(studio));
    }

    // Build scene-to-entities maps using junction tables with composite keys
    // Keyed by the scene's entityKey -> entities[]
    const performersByScene = new Map<string, PerformerRef[]>();
    for (const junction of performerJunctions) {
      const performerKey = entityKey(
        junction.performerId,
        junction.performerInstanceId
      );
      const performer = performersByKey.get(performerKey);
      if (!performer) continue; // Skip orphaned junction records
      const sceneKey = entityKey(junction.sceneId, junction.sceneInstanceId);
      const list = performersByScene.get(sceneKey) ?? [];
      list.push(performer);
      performersByScene.set(sceneKey, list);
    }

    const tagsByScene = new Map<string, TagRef[]>();
    for (const junction of tagJunctions) {
      const tagKey = entityKey(junction.tagId, junction.tagInstanceId);
      const tag = tagsByKey.get(tagKey);
      if (!tag) continue; // Skip orphaned junction records
      const sceneKey = entityKey(junction.sceneId, junction.sceneInstanceId);
      const list = tagsByScene.get(sceneKey) ?? [];
      list.push(tag);
      tagsByScene.set(sceneKey, list);
    }

    const groupsByScene = new Map<
      string,
      (GroupRef & { scene_index: number | null })[]
    >();
    for (const junction of groupJunctions) {
      const groupKey = entityKey(junction.groupId, junction.groupInstanceId);
      const group = groupsByKey.get(groupKey);
      if (!group) continue; // Skip orphaned junction records
      const sceneKey = entityKey(junction.sceneId, junction.sceneInstanceId);
      const list = groupsByScene.get(sceneKey) ?? [];
      list.push({ ...group, scene_index: junction.sceneIndex });
      groupsByScene.set(sceneKey, list);
    }

    const galleriesByScene = new Map<string, GalleryRef[]>();
    for (const junction of galleryJunctions) {
      const galleryKey = entityKey(
        junction.galleryId,
        junction.galleryInstanceId
      );
      const gallery = galleriesByKey.get(galleryKey);
      if (!gallery) continue; // Skip orphaned junction records
      const sceneKey = entityKey(junction.sceneId, junction.sceneInstanceId);
      const list = galleriesByScene.get(sceneKey) ?? [];
      list.push(gallery);
      galleriesByScene.set(sceneKey, list);
    }

    // Populate scenes using composite keys (use normalized instanceId)
    for (const scene of scenes) {
      const normalizedSceneInstanceId = normalizeInstanceId(scene.instanceId);
      const sceneKey = entityKey(scene.id, normalizedSceneInstanceId);
      scene.performers = performersByScene.get(sceneKey) ?? [];
      scene.tags = tagsByScene.get(sceneKey) ?? [];
      scene.groups = groupsByScene.get(sceneKey) ?? [];
      scene.galleries = galleriesByScene.get(sceneKey) ?? [];
      const studioId = scene.studioId;
      if (studioId) {
        const studioKey = entityKey(studioId, normalizedSceneInstanceId);
        scene.studio = studiosByKey.get(studioKey) ?? null;
      }

      // Hydrate inherited tags with full tag objects
      // Inherited tags use scene's instanceId since they're from the same Stash instance
      if (scene.inheritedTagIds && scene.inheritedTagIds.length > 0) {
        scene.inheritedTags = scene.inheritedTagIds
          .map((tagId) =>
            tagsByKey.get(entityKey(tagId, normalizedSceneInstanceId))
          )
          .filter((tag): tag is TagRef => tag !== undefined);
      }
    }
  }

  // Helper transforms for Stash entities - all image URLs need proxy treatment
  // Each entity includes its stashInstanceId for multi-instance routing
  private transformStashPerformer(p: {
    id: string;
    stashInstanceId: string;
    name: string;
    disambiguation: string | null;
    gender: string | null;
    imagePath: string | null;
    favorite: boolean;
    rating100: number | null;
  }): PerformerRef {
    return {
      id: p.id,
      instanceId: p.stashInstanceId,
      name: p.name,
      disambiguation: p.disambiguation,
      gender: p.gender,
      image_path: toProxyUrl(p.imagePath, p.stashInstanceId),
      favorite: p.favorite,
      rating100: p.rating100,
    };
  }

  private transformStashTag(t: {
    id: string;
    stashInstanceId: string;
    name: string;
    imagePath: string | null;
    favorite: boolean;
  }): TagRef {
    return {
      id: t.id,
      instanceId: t.stashInstanceId,
      name: t.name,
      image_path: toProxyUrl(t.imagePath, t.stashInstanceId),
      favorite: t.favorite,
    };
  }

  private transformStashStudio(s: {
    id: string;
    stashInstanceId: string;
    name: string;
    imagePath: string | null;
    favorite: boolean;
    parentId: string | null;
  }): StudioRef {
    return {
      id: s.id,
      instanceId: s.stashInstanceId,
      name: s.name,
      image_path: toProxyUrl(s.imagePath, s.stashInstanceId),
      favorite: s.favorite,
      parent_studio: s.parentId ? { id: s.parentId } : null,
    };
  }

  private transformStashGroup(g: {
    id: string;
    name: string;
    frontImagePath: string | null;
    backImagePath: string | null;
    stashInstanceId: string;
  }): GroupRef {
    return {
      id: g.id,
      instanceId: g.stashInstanceId,
      name: g.name,
      front_image_path: toProxyUrl(g.frontImagePath, g.stashInstanceId),
      back_image_path: toProxyUrl(g.backImagePath, g.stashInstanceId),
    };
  }

  private transformStashGallery(g: {
    id: string;
    title: string | null;
    coverPath: string | null;
    stashInstanceId: string;
  }): GalleryRef {
    const coverUrl = g.coverPath
      ? toProxyUrl(g.coverPath, g.stashInstanceId)
      : null;
    return {
      id: g.id,
      instanceId: g.stashInstanceId,
      title: g.title,
      // Cover as simple string URL for consistency
      cover: coverUrl,
    };
  }
}

// Export singleton instance
export const sceneQueryBuilder = new SceneQueryBuilder();
