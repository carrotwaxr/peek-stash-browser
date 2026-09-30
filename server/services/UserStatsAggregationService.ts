// server/services/UserStatsAggregationService.ts
/**
 * Aggregates user statistics for the My Stats page.
 *
 * Every number and list is the viewer's own and names each entity by its
 * (id, instance), and counts only what the viewer may see now: live entities
 * on their allowed instances with no exclusion row on the entity's own
 * instance. Each statement drives from the viewer's rows (rankings, history,
 * stats) and looks the entity up by its primary key (`CROSS JOIN`), so its
 * cost follows the viewer's history, not the library.
 *
 * - Top performers, studios and tags read the rankings RankingComputeService
 *   stores (at most an hour old), percentile-based:
 *   - Raw engagement: (oCount × 5) + (normalizedDuration) + (playCount)
 *   - Engagement rate: raw engagement / library presence
 *   - Percentile: rank among all entities user has engaged with (100 = top)
 * - Top scenes are ranked here, from the watch history, with the same
 *   weights and percentile (a scene's library presence is 1): 50 ms at 200k
 *   scenes for a user with 17k watched scenes, where storing them cost each
 *   recompute 0.5 s of writes.
 * - Totals and highlights read the history and per-user stats directly.
 * - The Library counts are counted per request, as the lists count.
 */
import prisma from "../prisma/singleton.js";
import type {
  EngagementStats,
  HighlightImage,
  HighlightPerformer,
  HighlightScene,
  LibraryStats,
  TopPerformer,
  TopScene,
  TopStudio,
  TopTag,
  UserStatsResponse,
} from "../types/api/index.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type SqlFragment,
  type SqlParam,
  exclusionJoin,
  instanceClause,
} from "../utils/sqlClauses.js";
import {
  RANKING_WEIGHTS,
  percentileRank,
  rankingComputeService,
} from "./RankingComputeService.js";

/**
 * Valid sort options for top lists
 */
export type TopListSortBy = "engagement" | "oCount" | "playCount";

/**
 * Options for getUserStats
 */
export interface UserStatsOptions {
  sortBy?: TopListSortBy;
  /** The viewer's allowed instances (`getUserAllowedInstanceIds`): none counts nothing */
  allowedInstanceIds: readonly string[];
}

/** How many entries each top list holds */
const TOP_LIST_LIMIT = 10;

/** The entity tables a stats row names, with the columns it shows */
const ENTITY_SOURCES = {
  scene: {
    table: "StashScene",
    columns:
      "x.title AS title, x.filePath AS filePath, x.pathScreenshot AS imagePath",
  },
  image: {
    table: "StashImage",
    columns:
      "x.title AS title, x.filePath AS filePath, x.pathThumbnail AS imagePath",
  },
  performer: {
    table: "StashPerformer",
    columns: "x.name AS name, x.imagePath AS imagePath",
  },
  studio: {
    table: "StashStudio",
    columns: "x.name AS name, x.imagePath AS imagePath",
  },
  tag: {
    table: "StashTag",
    columns: "x.name AS name, x.imagePath AS imagePath",
  },
} as const;

type EntitySource = keyof typeof ENTITY_SOURCES;

/** The entity types with stored rankings, each a top list */
type RankedType = "performer" | "studio" | "tag";

/** The ranking column each sort orders the stored rankings by */
const RANKING_SORT: Record<TopListSortBy, string> = {
  engagement: "r.percentileRank",
  oCount: "r.oCount",
  playCount: "r.playCount",
};

/** The column each sort orders the scenes ranked from history by */
const SCENE_SORT: Record<TopListSortBy, string> = {
  engagement: "engagement",
  oCount: "oCount",
  playCount: "playCount",
};

/** Where each highlight reads its count, and the entity it names */
const HIGHLIGHT_SOURCES = {
  mostWatchedScene: {
    from: "WatchHistory",
    idColumn: "sceneId",
    count: "playCount",
    entity: "scene",
  },
  mostOdScene: {
    from: "WatchHistory",
    idColumn: "sceneId",
    count: "oCount",
    entity: "scene",
  },
  mostViewedImage: {
    from: "ImageViewHistory",
    idColumn: "imageId",
    count: "viewCount",
    entity: "image",
  },
  mostOdPerformer: {
    from: "UserPerformerStats",
    idColumn: "performerId",
    count: "oCounter",
    entity: "performer",
  },
} as const;

type HighlightSource =
  (typeof HIGHLIGHT_SOURCES)[keyof typeof HIGHLIGHT_SOURCES];

// Raw rows. A plain Int or Float column reads as a number; COUNT, SUM and
// COALESCE over integers, and window counts, as bigint.

interface NamedRow {
  id: string;
  instanceId: string;
  name: string;
  imagePath: string | null;
}

interface TitledRow {
  id: string;
  instanceId: string;
  title: string | null;
  filePath: string | null;
  imagePath: string | null;
}

interface RankedRow extends NamedRow {
  playCount: number;
  playDuration: number;
  oCount: number;
  percentileRank: number;
}

interface HistoryRankedSceneRow extends TitledRow {
  playCount: number;
  playDuration: number;
  oCount: number;
  /** RANK() by engagement: 1 for the most engaged, ties share the first */
  position: bigint | number;
  /** How many scenes were ranked */
  total: bigint | number;
}

/** A highlight's row: the entity's own columns and the source's count */
type HighlightRow<Row extends NamedRow | TitledRow> = Row & { count: number };

interface SceneTotalsRow {
  totalWatchTime: bigint | number;
  totalPlayCount: bigint | number;
  totalOCount: bigint | number;
  uniqueScenesWatched: bigint | number;
}

interface ImageTotalsRow {
  totalImagesViewed: bigint | number;
  imageOCount: bigint | number;
}

/**
 * The joins and conditions that keep a per-user row only while its entity
 * shows to the viewer: the live entity (as `x`) by the row's (id,
 * instance), no exclusion row (as `e`) for the viewer on that instance, an
 * allowed instance. The row drives (`CROSS JOIN`), so SQLite looks each
 * entity up by its primary key. The joins bind `joinParams` where they
 * stand and the condition `whereParams` where it stands.
 */
function visibleEntity(
  entity: EntitySource,
  row: { alias: string; idColumn: string },
  userId: number,
  allowedInstanceIds: readonly string[]
) {
  const id = `${row.alias}.${row.idColumn}`;
  const instance = `${row.alias}.instanceId`;
  const instances = instanceClause("x", allowedInstanceIds);
  return {
    joins: `CROSS JOIN ${ENTITY_SOURCES[entity].table} x
        ON x.id = ${id} AND x.stashInstanceId = ${instance} AND x.deletedAt IS NULL
      ${exclusionJoin("e", entity, id, instance)}`,
    joinParams: [userId] as SqlParam[],
    where: `e.id IS NULL AND ${instances.sql}`,
    whereParams: instances.params,
  };
}

/** The types the Library panel counts, each with the table its list reads */
const LIBRARY_TABLES = {
  scene: "StashScene",
  performer: "StashPerformer",
  studio: "StashStudio",
  tag: "StashTag",
  gallery: "StashGallery",
  image: "StashImage",
  clip: "StashClip",
} as const;

type LibraryCountType = keyof typeof LIBRARY_TABLES;

const LIBRARY_COUNT_TYPES = Object.keys(LIBRARY_TABLES) as LibraryCountType[];

interface CountRow {
  n: bigint | number;
}

/**
 * One type's Library count, as its list counts with no filter: the lists'
 * exclusion anti-join on the entity's instance, `deletedAt` and the allowed
 * instances. A clip also needs its live scene with no exclusion row (a clip
 * hides with its scene) and a preview (`isGenerated`), as `ClipQueryBuilder`
 * and the Clips page's default filter have it.
 */
function libraryCountQuery(
  type: LibraryCountType,
  userId: number,
  allowedInstanceIds: readonly string[]
): SqlFragment {
  const instances = instanceClause("x", allowedInstanceIds);
  const own = exclusionJoin("e", type, "x.id", "x.stashInstanceId");
  if (type === "clip") {
    return {
      sql: `SELECT COUNT(*) AS n FROM StashClip x
        ${own}
        INNER JOIN StashScene s ON s.id = x.sceneId AND s.stashInstanceId = x.sceneInstanceId
        ${exclusionJoin("es", "scene", "x.sceneId", "x.sceneInstanceId")}
        WHERE x.deletedAt IS NULL AND e.id IS NULL AND ${instances.sql}
          AND s.deletedAt IS NULL AND es.id IS NULL AND x.isGenerated = 1`,
      params: [userId, userId, ...instances.params],
    };
  }
  return {
    sql: `SELECT COUNT(*) AS n FROM ${LIBRARY_TABLES[type]} x
      ${own}
      WHERE x.deletedAt IS NULL AND e.id IS NULL AND ${instances.sql}`,
    params: [userId, ...instances.params],
  };
}

class UserStatsAggregationService {
  /**
   * Get all user stats in a single call
   * @param userId - The user ID
   * @param options - The sort, and the viewer's allowed instances
   */
  async getUserStats(
    userId: number,
    options: UserStatsOptions
  ): Promise<UserStatsResponse> {
    const { sortBy = "engagement", allowedInstanceIds } = options;

    // One statement after another: sent together, they contend for the
    // pool's connections and the disk (at 200k scenes, for a user with 17k
    // watched scenes, 0.28 s together against 0.12 s in turn)
    const library = await this.getLibraryStats(userId, allowedInstanceIds);
    const engagement = await this.getEngagementStats(
      userId,
      allowedInstanceIds
    );
    const topScenes = await this.getTopScenes(
      userId,
      allowedInstanceIds,
      sortBy
    );
    const topPerformers = await this.getTopEntities(
      "performer",
      userId,
      allowedInstanceIds,
      sortBy
    );
    const topStudios = await this.getTopEntities(
      "studio",
      userId,
      allowedInstanceIds,
      sortBy
    );
    const topTags = await this.getTopEntities(
      "tag",
      userId,
      allowedInstanceIds,
      sortBy
    );
    const mostWatchedScene = await this.getSceneHighlight(
      HIGHLIGHT_SOURCES.mostWatchedScene,
      userId,
      allowedInstanceIds
    );
    const mostViewedImage = await this.getImageHighlight(
      userId,
      allowedInstanceIds
    );
    const mostOdScene = await this.getSceneHighlight(
      HIGHLIGHT_SOURCES.mostOdScene,
      userId,
      allowedInstanceIds
    );
    const mostOdPerformer = await this.getPerformerHighlight(
      userId,
      allowedInstanceIds
    );

    return {
      library,
      engagement,
      topScenes,
      topPerformers,
      topStudios,
      topTags,
      mostWatchedScene,
      mostViewedImage,
      mostOdScene,
      mostOdPerformer,
    };
  }

  /**
   * The Library counts: for each type, the live entities on the viewer's
   * allowed instances with no exclusion row for the viewer on the entity's
   * instance, which is the total the type's list shows with no filter. Clips
   * count as the Clips page's default request lists them: on a live scene
   * the viewer sees, with a preview. One statement per type, in turn
   * (through Prisma: 44 ms in all on the production snapshot, images 31; at
   * 200k scenes, for a user with 71k scene and 258k image exclusions, 0.26 s,
   * scenes 145 and images 96).
   */
  private async getLibraryStats(
    userId: number,
    allowedInstanceIds: readonly string[]
  ): Promise<LibraryStats> {
    const counts: Record<LibraryCountType, number> = {
      scene: 0,
      performer: 0,
      studio: 0,
      tag: 0,
      gallery: 0,
      image: 0,
      clip: 0,
    };
    for (const type of LIBRARY_COUNT_TYPES) {
      const { sql, params } = libraryCountQuery(
        type,
        userId,
        allowedInstanceIds
      );
      const rows = await prisma.$queryRawUnsafe<CountRow[]>(sql, ...params);
      counts[type] = Number(rows[0]?.n ?? 0);
    }
    return {
      sceneCount: counts.scene,
      performerCount: counts.performer,
      studioCount: counts.studio,
      tagCount: counts.tag,
      galleryCount: counts.gallery,
      imageCount: counts.image,
      clipCount: counts.clip,
    };
  }

  /**
   * Engagement totals over the scenes and images the viewer may see. Each
   * history row is one (entity, instance), so a count of rows counts two
   * servers' same id twice.
   */
  private async getEngagementStats(
    userId: number,
    allowedInstanceIds: readonly string[]
  ): Promise<EngagementStats> {
    const scene = visibleEntity(
      "scene",
      { alias: "w", idColumn: "sceneId" },
      userId,
      allowedInstanceIds
    );
    const image = visibleEntity(
      "image",
      { alias: "iv", idColumn: "imageId" },
      userId,
      allowedInstanceIds
    );
    const scenes = await prisma.$queryRawUnsafe<SceneTotalsRow[]>(
      `SELECT
          COALESCE(SUM(w.playDuration), 0) AS totalWatchTime,
          COALESCE(SUM(w.playCount), 0) AS totalPlayCount,
          COALESCE(SUM(w.oCount), 0) AS totalOCount,
          COUNT(*) AS uniqueScenesWatched
        FROM WatchHistory w
        ${scene.joins}
        WHERE w.userId = ? AND ${scene.where}`,
      ...scene.joinParams,
      userId,
      ...scene.whereParams
    );
    const images = await prisma.$queryRawUnsafe<ImageTotalsRow[]>(
      `SELECT
          COUNT(*) AS totalImagesViewed,
          COALESCE(SUM(iv.oCount), 0) AS imageOCount
        FROM ImageViewHistory iv
        ${image.joins}
        WHERE iv.userId = ? AND ${image.where}`,
      ...image.joinParams,
      userId,
      ...image.whereParams
    );

    // One row each: an aggregate without GROUP BY
    const s = scenes[0];
    const i = images[0];
    return {
      totalWatchTime: Number(s?.totalWatchTime ?? 0),
      totalPlayCount: Number(s?.totalPlayCount ?? 0),
      totalOCount: Number(s?.totalOCount ?? 0) + Number(i?.imageOCount ?? 0),
      totalImagesViewed: Number(i?.totalImagesViewed ?? 0),
      uniqueScenesWatched: Number(s?.uniqueScenesWatched ?? 0),
    };
  }

  /**
   * A top list of performers, studios or tags from the stored rankings, in
   * the sort's order: only entities the viewer may see now, whatever they
   * were when the rankings were computed.
   */
  private async getTopEntities(
    entity: RankedType,
    userId: number,
    allowedInstanceIds: readonly string[],
    sortBy: TopListSortBy
  ): Promise<TopPerformer[] | TopStudio[] | TopTag[]> {
    const visible = visibleEntity(
      entity,
      { alias: "r", idColumn: "entityId" },
      userId,
      allowedInstanceIds
    );
    const rows = await prisma.$queryRawUnsafe<RankedRow[]>(
      `SELECT r.entityId AS id, r.instanceId AS instanceId,
        r.playCount AS playCount, r.playDuration AS playDuration,
        r.oCount AS oCount, r.percentileRank AS percentileRank,
        ${ENTITY_SOURCES[entity].columns}
      FROM UserEntityRanking r
      ${visible.joins}
      WHERE r.userId = ? AND r.entityType = ? AND ${visible.where}
      ORDER BY ${RANKING_SORT[sortBy]} DESC, r.entityId, r.instanceId
      LIMIT ?`,
      ...visible.joinParams,
      userId,
      entity,
      ...visible.whereParams,
      TOP_LIST_LIMIT
    );

    return rows.map((row) => ({
      id: row.id,
      instanceId: row.instanceId,
      name: row.name,
      imageUrl: toProxyUrl(row.imagePath, row.instanceId),
      playCount: row.playCount,
      playDuration: Math.round(row.playDuration),
      oCount: row.oCount,
      score: row.percentileRank,
    }));
  }

  /**
   * Top scenes, ranked from the viewer's watch history as the stored
   * rankings are (engagement score, percentile among the engaged scenes),
   * then taken in the sort's order. A window ranks every engaged scene the
   * viewer may see (one row per watched scene); only the page's 10 read
   * their titles.
   */
  private async getTopScenes(
    userId: number,
    allowedInstanceIds: readonly string[],
    sortBy: TopListSortBy
  ): Promise<TopScene[]> {
    const averageDuration =
      await rankingComputeService.getAverageSceneDuration();
    const visible = visibleEntity(
      "scene",
      { alias: "w", idColumn: "sceneId" },
      userId,
      allowedInstanceIds
    );
    const sort = SCENE_SORT[sortBy];
    const rows = await prisma.$queryRawUnsafe<HistoryRankedSceneRow[]>(
      `WITH engaged AS (
        SELECT w.sceneId AS id, w.instanceId AS instanceId,
          w.playCount AS playCount, w.oCount AS oCount,
          w.playDuration AS playDuration,
          w.oCount * ? + w.playDuration / ? * ? + w.playCount * ? AS engagement
        FROM WatchHistory w
        ${visible.joins}
        WHERE w.userId = ? AND ${visible.where}
          AND (w.playCount > 0 OR w.oCount > 0 OR w.playDuration > 0)
      ),
      ranked AS (
        SELECT engaged.*,
          RANK() OVER (ORDER BY engagement DESC) AS position,
          COUNT(*) OVER () AS total
        FROM engaged
      ),
      top AS (
        SELECT * FROM ranked ORDER BY ${sort} DESC, id, instanceId LIMIT ?
      )
      SELECT top.id AS id, top.instanceId AS instanceId,
        top.playCount AS playCount, top.oCount AS oCount,
        top.playDuration AS playDuration, top.position AS position,
        top.total AS total, ${ENTITY_SOURCES.scene.columns}
      FROM top
      CROSS JOIN StashScene x ON x.id = top.id AND x.stashInstanceId = top.instanceId
      ORDER BY top.${sort} DESC, top.id, top.instanceId`,
      RANKING_WEIGHTS.oCount,
      averageDuration,
      RANKING_WEIGHTS.duration,
      RANKING_WEIGHTS.playCount,
      ...visible.joinParams,
      userId,
      ...visible.whereParams,
      TOP_LIST_LIMIT
    );

    return rows.map((row) => ({
      id: row.id,
      instanceId: row.instanceId,
      title: row.title,
      filePath: row.filePath,
      imageUrl: toProxyUrl(row.imagePath, row.instanceId),
      playCount: row.playCount,
      playDuration: Math.round(row.playDuration),
      oCount: row.oCount,
      score: percentileRank(Number(row.position) - 1, Number(row.total)),
    }));
  }

  /**
   * The viewer's row with the highest count in a highlight's source, for
   * an entity they may see (ties: the lowest id, then instance)
   */
  private async getHighlight<Row extends NamedRow | TitledRow>(
    source: HighlightSource,
    userId: number,
    allowedInstanceIds: readonly string[]
  ): Promise<HighlightRow<Row> | undefined> {
    const visible = visibleEntity(
      source.entity,
      { alias: "h", idColumn: source.idColumn },
      userId,
      allowedInstanceIds
    );
    const rows = await prisma.$queryRawUnsafe<HighlightRow<Row>[]>(
      `SELECT h.${source.idColumn} AS id, h.instanceId AS instanceId,
        h.${source.count} AS count, ${ENTITY_SOURCES[source.entity].columns}
      FROM ${source.from} h
      ${visible.joins}
      WHERE h.userId = ? AND h.${source.count} > 0 AND ${visible.where}
      ORDER BY h.${source.count} DESC, h.${source.idColumn}, h.instanceId
      LIMIT 1`,
      ...visible.joinParams,
      userId,
      ...visible.whereParams
    );
    return rows[0];
  }

  /** The most watched or most O'd scene */
  private async getSceneHighlight(
    source:
      | typeof HIGHLIGHT_SOURCES.mostWatchedScene
      | typeof HIGHLIGHT_SOURCES.mostOdScene,
    userId: number,
    allowedInstanceIds: readonly string[]
  ): Promise<HighlightScene | null> {
    const row = await this.getHighlight<TitledRow>(
      source,
      userId,
      allowedInstanceIds
    );
    if (!row) return null;
    const scene = {
      id: row.id,
      instanceId: row.instanceId,
      title: row.title,
      filePath: row.filePath,
      imageUrl: toProxyUrl(row.imagePath, row.instanceId),
    };
    return source.count === "playCount"
      ? { ...scene, playCount: row.count }
      : { ...scene, oCount: row.count };
  }

  /** The most viewed image */
  private async getImageHighlight(
    userId: number,
    allowedInstanceIds: readonly string[]
  ): Promise<HighlightImage | null> {
    const row = await this.getHighlight<TitledRow>(
      HIGHLIGHT_SOURCES.mostViewedImage,
      userId,
      allowedInstanceIds
    );
    if (!row) return null;
    return {
      id: row.id,
      instanceId: row.instanceId,
      title: row.title,
      filePath: row.filePath,
      imageUrl: toProxyUrl(row.imagePath, row.instanceId),
      viewCount: row.count,
    };
  }

  /** The performer with the most Os across their scenes */
  private async getPerformerHighlight(
    userId: number,
    allowedInstanceIds: readonly string[]
  ): Promise<HighlightPerformer | null> {
    const row = await this.getHighlight<NamedRow>(
      HIGHLIGHT_SOURCES.mostOdPerformer,
      userId,
      allowedInstanceIds
    );
    if (!row) return null;
    return {
      id: row.id,
      instanceId: row.instanceId,
      name: row.name,
      imageUrl: toProxyUrl(row.imagePath, row.instanceId),
      oCount: row.count,
    };
  }
}

export const userStatsAggregationService = new UserStatsAggregationService();
export default userStatsAggregationService;
