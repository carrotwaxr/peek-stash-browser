/**
 * Stash Entity Service
 *
 * Provides methods to query Stash entities from SQLite database.
 * Replaces direct StashCacheManager access with database queries.
 *
 * This service maintains compatibility with existing controller patterns
 * while using the new SQLite-backed architecture.
 */

import { Prisma } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import { stashInstanceManager } from "./StashInstanceManager.js";
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
  SceneScoringData,
} from "../types/index.js";
import { logger } from "../utils/logger.js";

/**
 * Default user fields for scenes (when no user data is merged)
 */
const DEFAULT_SCENE_USER_FIELDS = {
  rating: null,
  rating100: null,
  favorite: false,
  o_counter: 0,
  play_count: 0,
  play_duration: 0,
  resume_time: 0,
  play_history: [],
  o_history: [],
  last_played_at: null,
  last_o_at: null,
};

/**
 * Default user fields for performers
 */
const DEFAULT_PERFORMER_USER_FIELDS = {
  rating: null,
  favorite: false,
  o_counter: 0,
  play_count: 0,
  last_played_at: null,
  last_o_at: null,
};

/**
 * Default user fields for studios
 */
const DEFAULT_STUDIO_USER_FIELDS = {
  rating: null,
  favorite: false,
  o_counter: 0,
  play_count: 0,
};

/**
 * Default user fields for tags
 */
const DEFAULT_TAG_USER_FIELDS = {
  rating: null,
  rating100: null,
  favorite: false,
  o_counter: 0,
  play_count: 0,
};

/**
 * Default user fields for galleries
 */
const DEFAULT_GALLERY_USER_FIELDS = {
  rating: null,
  favorite: false,
};

/**
 * Default user fields for groups
 */
const DEFAULT_GROUP_USER_FIELDS = {
  rating: null,
  favorite: false,
};

class StashEntityService {
  // In-memory cache for studio name lookups (cleared on cache invalidation)
  private studioNameCache: Map<string, string> | null = null;
  private studioNameCachePromise: Promise<Map<string, string>> | null = null;

  // Columns to select for browse queries (excludes heavy streams/data columns)
  private readonly BROWSE_SELECT = {
    id: true,
    stashInstanceId: true,
    title: true,
    code: true,
    date: true,
    studioId: true,
    rating100: true,
    duration: true,
    organized: true,
    details: true,
    director: true,
    urls: true,
    filePath: true,
    fileBitRate: true,
    fileFrameRate: true,
    fileWidth: true,
    fileHeight: true,
    fileVideoCodec: true,
    fileAudioCodec: true,
    fileSize: true,
    pathScreenshot: true,
    pathPreview: true,
    pathSprite: true,
    pathVtt: true,
    pathChaptersVtt: true,
    pathStream: true,
    pathCaption: true,
    // Explicitly NOT selecting: streams, data
    oCounter: true,
    playCount: true,
    playDuration: true,
    stashCreatedAt: true,
    stashUpdatedAt: true,
    syncedAt: true,
    deletedAt: true,
  } as const;

  // ==================== Scene Queries ====================

  /**
   * Get all scenes from cache
   * Returns scenes with default user fields (not merged with user-specific data)
   *
   * @deprecated Use SceneQueryBuilder.execute() instead for consistent scene data with relations.
   * This method returns scenes with empty relation arrays (performers, tags, etc.).
   * Only kept for legacy fallback paths when USE_SQL_QUERY_BUILDER=false.
   */
  async getAllScenes(): Promise<NormalizedScene[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.stashScene.findMany({
      where: { deletedAt: null },
      select: this.BROWSE_SELECT,
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => this.transformSceneForBrowse(c));
    const transformTime = Date.now() - transformStart;

    // Hydrate studio names (workaround until StashScene has studio relation)
    const hydrateStart = Date.now();
    const studioNames = await this.getStudioNameMap();
    this.hydrateStudioNames(result, studioNames);
    const hydrateTime = Date.now() - hydrateStart;

    logger.info(`getAllScenes: query=${queryTime}ms, transform=${transformTime}ms, hydrate=${hydrateTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }

  /**
   * Get lightweight scene data for scoring operations
   * Returns only IDs needed for similarity/recommendation calculations
   * Much more efficient than loading full scene objects
   */
  async getScenesForScoring(): Promise<SceneScoringData[]> {
    const startTime = Date.now();

    // Single query that aggregates performer and tag IDs
    const sql = `
      SELECT
        s.id,
        s.studioId,
        s.oCounter,
        s.date,
        COALESCE(GROUP_CONCAT(DISTINCT sp.performerId), '') as performerIds,
        COALESCE(GROUP_CONCAT(DISTINCT st.tagId), '') as tagIds
      FROM StashScene s
      LEFT JOIN ScenePerformer sp ON s.id = sp.sceneId
      LEFT JOIN SceneTag st ON s.id = st.sceneId
      WHERE s.deletedAt IS NULL
      GROUP BY s.id
    `;

    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      studioId: string | null;
      oCounter: number;
      date: string | null;
      performerIds: string;
      tagIds: string;
    }>>(sql);

    const result: SceneScoringData[] = rows.map(row => ({
      id: row.id,
      studioId: row.studioId,
      performerIds: row.performerIds ? row.performerIds.split(',').filter(Boolean) : [],
      tagIds: row.tagIds ? row.tagIds.split(',').filter(Boolean) : [],
      oCounter: row.oCounter || 0,
      date: row.date,
    }));

    logger.info(`getScenesForScoring: ${Date.now() - startTime}ms, count=${result.length}`);

    return result;
  }

  /**
   * Get lightweight scene data for entity visibility filtering
   * Returns only IDs needed to determine which entities appear in scenes
   * Much more efficient than loading full scene objects
   *
   * Returns scenes with:
   * - id: Scene ID
   * - performers: Array<{ id: string }> - performer IDs
   * - tags: Array<{ id: string }> - tag IDs
   * - studio: { id: string } | null - studio ID
   */
  async getScenesForVisibility(): Promise<Array<{
    id: string;
    performers: Array<{ id: string }>;
    tags: Array<{ id: string }>;
    studio: { id: string } | null;
  }>> {
    const scoringData = await this.getScenesForScoring();

    // Transform to the shape expected by empty entity filters
    return scoringData.map(s => ({
      id: s.id,
      // Transform to array of objects with id property (matches existing interface)
      performers: s.performerIds.map(id => ({ id })),
      tags: s.tagIds.map(id => ({ id })),
      // studio property needs to match { id: string } | null shape
      studio: s.studioId ? { id: s.studioId } : null,
    }));
  }

  /**
   * Get all scenes with tags relation included
   * Used for empty entity filtering which needs to know which tags appear on visible scenes
   *
   * @deprecated Use getScenesForVisibility() for entity visibility filtering instead.
   * This method loads full scene objects when only IDs are needed.
   */
  async getAllScenesWithTags(): Promise<NormalizedScene[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.stashScene.findMany({
      where: { deletedAt: null },
      select: {
        ...this.BROWSE_SELECT,
        // Include tags relation for filtering
        tags: {
          select: { tagId: true },
        },
      },
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => {
      const scene = this.transformSceneForBrowse(c);
      // Override tags with the junction table data (cast to satisfy type checker - only id is needed for filtering)
      scene.tags = (c.tags?.map((t: { tagId: string }) => ({ id: t.tagId })) || []) as typeof scene.tags;
      return scene;
    });
    const transformTime = Date.now() - transformStart;

    // Hydrate studio names (workaround until StashScene has studio relation)
    const hydrateStart = Date.now();
    const studioNames = await this.getStudioNameMap();
    this.hydrateStudioNames(result, studioNames);
    const hydrateTime = Date.now() - hydrateStart;

    logger.info(`getAllScenesWithTags: query=${queryTime}ms, transform=${transformTime}ms, hydrate=${hydrateTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }

  /**
   * Get all scenes with performers relation included
   * Used for empty entity filtering which needs to know which performers appear in visible scenes
   *
   * @deprecated Use getScenesForVisibility() for entity visibility filtering instead.
   * This method loads full scene objects when only IDs are needed.
   */
  async getAllScenesWithPerformers(): Promise<NormalizedScene[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.stashScene.findMany({
      where: { deletedAt: null },
      select: {
        ...this.BROWSE_SELECT,
        performers: {
          select: { performerId: true },
        },
      },
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => {
      const scene = this.transformSceneForBrowse(c);
      scene.performers = (c.performers?.map((p: { performerId: string }) => ({ id: p.performerId })) || []) as typeof scene.performers;
      return scene;
    });
    const transformTime = Date.now() - transformStart;

    // Hydrate studio names (workaround until StashScene has studio relation)
    const hydrateStart = Date.now();
    const studioNames = await this.getStudioNameMap();
    this.hydrateStudioNames(result, studioNames);
    const hydrateTime = Date.now() - hydrateStart;

    logger.info(`getAllScenesWithPerformers: query=${queryTime}ms, transform=${transformTime}ms, hydrate=${hydrateTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }

  /**
   * Get all scenes with both performers and tags relations included
   * Used for tags filtering which needs both performer IDs and tag IDs
   *
   * @deprecated Use getScenesForVisibility() for entity visibility filtering instead.
   * This method loads full scene objects when only IDs are needed.
   */
  async getAllScenesWithPerformersAndTags(): Promise<NormalizedScene[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.stashScene.findMany({
      where: { deletedAt: null },
      select: {
        ...this.BROWSE_SELECT,
        performers: {
          select: { performerId: true },
        },
        tags: {
          select: { tagId: true },
        },
      },
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => {
      const scene = this.transformSceneForBrowse(c);
      scene.performers = (c.performers?.map((p: { performerId: string }) => ({ id: p.performerId })) || []) as typeof scene.performers;
      scene.tags = (c.tags?.map((t: { tagId: string }) => ({ id: t.tagId })) || []) as typeof scene.tags;
      return scene;
    });
    const transformTime = Date.now() - transformStart;

    // Hydrate studio names (workaround until StashScene has studio relation)
    const hydrateStart = Date.now();
    const studioNames = await this.getStudioNameMap();
    this.hydrateStudioNames(result, studioNames);
    const hydrateTime = Date.now() - hydrateStart;

    logger.info(`getAllScenesWithPerformersAndTags: query=${queryTime}ms, transform=${transformTime}ms, hydrate=${hydrateTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }


  /**
   * Get scene by ID (includes related entities)
   */
  async getScene(id: string): Promise<NormalizedScene | null> {
    const cached = await prisma.stashScene.findFirst({
      where: { id, deletedAt: null },
      include: {
        performers: { include: { performer: true } },
        tags: { include: { tag: true } },
        groups: { include: { group: true } },
        galleries: { include: { gallery: true } },
      },
    });

    if (!cached) return null;
    return this.transformSceneWithRelations(cached);
  }

  /**
   * Get scenes by IDs
   */
  async getScenesByIds(ids: string[]): Promise<NormalizedScene[]> {
    const cached = await prisma.stashScene.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    return cached.map((c) => this.transformScene(c));
  }

  /**
   * Get scenes by IDs with full relations (performers, tags, studio, groups, galleries)
   * Use this when you need the related entities, not just scene data.
   * This is more expensive than getScenesByIds due to the joins.
   */
  async getScenesByIdsWithRelations(ids: string[]): Promise<NormalizedScene[]> {
    if (ids.length === 0) return [];

    const cached = await prisma.stashScene.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
      include: {
        performers: { include: { performer: true } },
        tags: { include: { tag: true } },
        groups: { include: { group: true } },
        galleries: { include: { gallery: true } },
      },
    });

    return cached.map((c) => this.transformSceneWithRelations(c));
  }

  /**
   * Get total scene count
   */
  async getSceneCount(): Promise<number> {
    return prisma.stashScene.count({
      where: { deletedAt: null },
    });
  }

  /**
   * Get scenes with database-level pagination and sorting
   * This is the optimized path for browse queries
   * Supports efficient exclusion filtering using NOT IN at the database level
   *
   * @deprecated Use SceneQueryBuilder.execute() instead for consistent scene data with relations.
   * This method returns scenes with empty relation arrays (performers, tags, etc.).
   * Only kept for legacy fallback paths when USE_SQL_QUERY_BUILDER=false.
   */
  async getScenesPaginated(options: {
    page: number;
    perPage: number;
    sortField: string;
    sortDirection: 'ASC' | 'DESC';
    excludeIds?: Set<string>;
  }): Promise<{ scenes: NormalizedScene[]; total: number }> {
    const startTotal = Date.now();
    const { page, perPage, sortField, sortDirection, excludeIds } = options;

    // Map API sort fields to database columns
    const sortColumnMap: Record<string, string> = {
      created_at: 'stashCreatedAt',
      updated_at: 'stashUpdatedAt',
      date: 'date',
      title: 'title',
      duration: 'duration',
      filesize: 'fileSize',
      bitrate: 'fileBitRate',
      framerate: 'fileFrameRate',
      random: 'id', // Will use special handling
    };

    const sortColumn = sortColumnMap[sortField] || 'stashCreatedAt';
    const isRandom = sortField === 'random';

    // Build where clause with exclusions at DB level
    const where: any = { deletedAt: null };
    if (excludeIds && excludeIds.size > 0) {
      where.id = { notIn: Array.from(excludeIds) };
    }

    // Get total count first (for pagination info) - respecting exclusions
    const countStart = Date.now();
    const total = await prisma.stashScene.count({ where });
    logger.debug(`getScenesPaginated: count took ${Date.now() - countStart}ms (excludeIds: ${excludeIds?.size || 0})`);

    // Build orderBy
    let orderBy: any;
    if (isRandom) {
      // For random, we'll use a seeded approach based on page
      // This gives consistent results per page but variety across pages
      orderBy = { id: sortDirection.toLowerCase() };
    } else {
      orderBy = { [sortColumn]: sortDirection.toLowerCase() };
    }

    // Query with pagination - exclusions already applied in where clause
    const queryStart = Date.now();
    const cached = await prisma.stashScene.findMany({
      where,
      select: this.BROWSE_SELECT,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    });
    const queryTime = Date.now() - queryStart;

    // Transform results
    const transformStart = Date.now();
    const scenes = cached.map((c) => this.transformSceneForBrowse(c));
    const transformTime = Date.now() - transformStart;

    // Hydrate studio names (workaround until StashScene has studio relation)
    const hydrateStart = Date.now();
    const studioNames = await this.getStudioNameMap();
    this.hydrateStudioNames(scenes, studioNames);
    const hydrateTime = Date.now() - hydrateStart;

    logger.info(`getScenesPaginated: query=${queryTime}ms, transform=${transformTime}ms, hydrate=${hydrateTime}ms, total=${Date.now() - startTotal}ms, count=${scenes.length}/${total}, excluded=${excludeIds?.size || 0}`);

    return { scenes, total };
  }

  /**
   * Get scene IDs only (for restriction filtering)
   * Much faster than loading full scene objects
   */
  async getSceneIds(): Promise<string[]> {
    const startTime = Date.now();
    const cached = await prisma.stashScene.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    logger.info(`getSceneIds: took ${Date.now() - startTime}ms, count=${cached.length}`);
    return cached.map(c => c.id);
  }

  /**
   * Search scenes using FTS5
   */
  async searchScenes(query: string, limit = 100): Promise<NormalizedScene[]> {
    try {
      // Use raw SQL for FTS5 search - select all scene columns
      const results = await prisma.$queryRaw<any[]>`
        SELECT s.*
        FROM scene_fts
        INNER JOIN StashScene s ON scene_fts.id = s.id
        WHERE scene_fts MATCH ${query}
          AND s.deletedAt IS NULL
        ORDER BY rank
        LIMIT ${limit}
      `;

      return results.map((r) => this.transformScene(r));
    } catch (error) {
      // FTS might fail with special characters, fall back to LIKE search
      logger.warn("FTS5 search failed, falling back to LIKE", { error });
      return this.searchScenesLike(query, limit);
    }
  }

  /**
   * Fallback LIKE search for scenes
   */
  private async searchScenesLike(
    query: string,
    limit: number
  ): Promise<NormalizedScene[]> {
    const cached = await prisma.stashScene.findMany({
      where: {
        deletedAt: null,
        OR: [
          { title: { contains: query } },
          { code: { contains: query } },
        ],
      },
      take: limit,
    });

    return cached.map((c) => this.transformScene(c));
  }

  // ==================== Performer Queries ====================

  /**
   * Get all performers from cache
   */
  async getAllPerformers(): Promise<NormalizedPerformer[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.stashPerformer.findMany({
      where: { deletedAt: null },
      include: {
        tags: { include: { tag: true } }, // Include full tag data
      },
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => this.transformPerformer(c));
    const transformTime = Date.now() - transformStart;

    logger.info(`getAllPerformers: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }

  /**
   * Get performer by ID with computed counts
   */
  async getPerformer(id: string): Promise<NormalizedPerformer | null> {
    const cached = await prisma.stashPerformer.findFirst({
      where: { id, deletedAt: null },
    });

    if (!cached) return null;

    // Compute counts from junction tables
    const [sceneCount, imageCount, galleryCount] = await Promise.all([
      prisma.scenePerformer.count({
        where: {
          performerId: id,
          scene: { deletedAt: null },
        },
      }),
      prisma.imagePerformer.count({
        where: {
          performerId: id,
          image: { deletedAt: null },
        },
      }),
      prisma.galleryPerformer.count({
        where: {
          performerId: id,
          gallery: { deletedAt: null },
        },
      }),
    ]);

    // Get group count by counting distinct groups from scenes
    const groupCountResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT sg.groupId) as count
      FROM ScenePerformer sp
      INNER JOIN SceneGroup sg ON sp.sceneId = sg.sceneId
      INNER JOIN StashScene s ON sp.sceneId = s.id
      WHERE sp.performerId = ${id}
        AND s.deletedAt IS NULL
    `;
    const groupCount = Number(groupCountResult[0]?.count ?? 0);

    return this.transformPerformer({
      ...cached,
      sceneCount,
      imageCount,
      galleryCount,
      groupCount,
    });
  }

  /**
   * Get performers by IDs
   */
  async getPerformersByIds(ids: string[]): Promise<NormalizedPerformer[]> {
    const cached = await prisma.stashPerformer.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    return cached.map((c) => this.transformPerformer(c));
  }

  /**
   * Get total performer count
   */
  async getPerformerCount(): Promise<number> {
    return prisma.stashPerformer.count({
      where: { deletedAt: null },
    });
  }

  /**
   * Search performers using FTS5
   */
  async searchPerformers(query: string, limit = 100): Promise<NormalizedPerformer[]> {
    try {
      const results = await prisma.$queryRaw<any[]>`
        SELECT p.*
        FROM performer_fts
        INNER JOIN StashPerformer p ON performer_fts.id = p.id
        WHERE performer_fts MATCH ${query}
          AND p.deletedAt IS NULL
        ORDER BY rank
        LIMIT ${limit}
      `;

      return results.map((r) => this.transformPerformer(r));
    } catch (error) {
      logger.warn("FTS5 performer search failed, falling back to LIKE", { error });
      const cached = await prisma.stashPerformer.findMany({
        where: {
          deletedAt: null,
          name: { contains: query },
        },
        take: limit,
      });
      return cached.map((c) => this.transformPerformer(c));
    }
  }

  // ==================== Studio Queries ====================

  /**
   * Get a lightweight Map of studio ID -> name for hydrating browse scenes.
   * Uses in-memory caching to avoid repeated DB queries.
   * This is a workaround until StashScene has a proper studio relation.
   */
  async getStudioNameMap(): Promise<Map<string, string>> {
    // Return cached result if available
    if (this.studioNameCache) {
      return this.studioNameCache;
    }

    // If already loading, wait for that promise
    if (this.studioNameCachePromise) {
      return this.studioNameCachePromise;
    }

    // Build the cache
    this.studioNameCachePromise = (async () => {
      const studios = await prisma.stashStudio.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      });
      const map = new Map<string, string>();
      for (const s of studios) {
        if (s.name) map.set(s.id, s.name);
      }
      this.studioNameCache = map;
      this.studioNameCachePromise = null;
      return map;
    })();

    return this.studioNameCachePromise;
  }

  /**
   * Invalidate the studio name cache (call after sync or studio updates)
   */
  invalidateStudioNameCache(): void {
    this.studioNameCache = null;
    this.studioNameCachePromise = null;
  }

  /**
   * Get all studios from cache
   */
  async getAllStudios(): Promise<NormalizedStudio[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.stashStudio.findMany({
      where: { deletedAt: null },
      include: {
        tags: { include: { tag: true } }, // Include full tag data
      },
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => this.transformStudio(c));
    const transformTime = Date.now() - transformStart;

    logger.info(`getAllStudios: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }

  /**
   * Get studio by ID with computed counts
   */
  async getStudio(id: string): Promise<NormalizedStudio | null> {
    const cached = await prisma.stashStudio.findFirst({
      where: { id, deletedAt: null },
    });

    if (!cached) return null;

    // Compute counts from junction tables and scene data
    const [sceneCount, imageCount, galleryCount] = await Promise.all([
      prisma.stashScene.count({
        where: {
          studioId: id,
          deletedAt: null,
        },
      }),
      prisma.stashImage.count({
        where: {
          studioId: id,
          deletedAt: null,
        },
      }),
      prisma.stashGallery.count({
        where: {
          studioId: id,
          deletedAt: null,
        },
      }),
    ]);

    // Get performer count by counting distinct performers from scenes
    const performerCountResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT sp.performerId) as count
      FROM ScenePerformer sp
      INNER JOIN StashScene s ON sp.sceneId = s.id
      WHERE s.studioId = ${id}
        AND s.deletedAt IS NULL
    `;
    const performerCount = Number(performerCountResult[0]?.count ?? 0);

    // Get group count by counting distinct groups from scenes
    const groupCountResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT sg.groupId) as count
      FROM SceneGroup sg
      INNER JOIN StashScene s ON sg.sceneId = s.id
      WHERE s.studioId = ${id}
        AND s.deletedAt IS NULL
    `;
    const groupCount = Number(groupCountResult[0]?.count ?? 0);

    return this.transformStudio({
      ...cached,
      sceneCount,
      imageCount,
      galleryCount,
      performerCount,
      groupCount,
    });
  }

  /**
   * Get studios by IDs
   */
  async getStudiosByIds(ids: string[]): Promise<NormalizedStudio[]> {
    const cached = await prisma.stashStudio.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    return cached.map((c) => this.transformStudio(c));
  }

  /**
   * Get total studio count
   */
  async getStudioCount(): Promise<number> {
    return prisma.stashStudio.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Tag Queries ====================

  /**
   * Get all tags from cache
   */
  async getAllTags(): Promise<NormalizedTag[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.stashTag.findMany({
      where: { deletedAt: null },
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => this.transformTag(c));
    const transformTime = Date.now() - transformStart;

    logger.info(`getAllTags: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }

  /**
   * Get tag by ID with computed counts
   */
  async getTag(id: string): Promise<NormalizedTag | null> {
    const cached = await prisma.stashTag.findFirst({
      where: { id, deletedAt: null },
    });

    if (!cached) return null;

    // Compute counts from junction tables
    const [sceneCount, imageCount, galleryCount, performerCount, studioCount, groupCount] = await Promise.all([
      prisma.sceneTag.count({
        where: {
          tagId: id,
          scene: { deletedAt: null },
        },
      }),
      prisma.imageTag.count({
        where: {
          tagId: id,
          image: { deletedAt: null },
        },
      }),
      prisma.galleryTag.count({
        where: {
          tagId: id,
          gallery: { deletedAt: null },
        },
      }),
      prisma.performerTag.count({
        where: {
          tagId: id,
          performer: { deletedAt: null },
        },
      }),
      prisma.studioTag.count({
        where: {
          tagId: id,
          studio: { deletedAt: null },
        },
      }),
      prisma.groupTag.count({
        where: {
          tagId: id,
          group: { deletedAt: null },
        },
      }),
    ]);

    return this.transformTag({
      ...cached,
      sceneCount,
      imageCount,
      galleryCount,
      performerCount,
      studioCount,
      groupCount,
      sceneMarkerCount: 0, // Scene markers not currently synced
    });
  }

  /**
   * Get tags by IDs
   */
  async getTagsByIds(ids: string[]): Promise<NormalizedTag[]> {
    const cached = await prisma.stashTag.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    return cached.map((c) => this.transformTag(c));
  }

  /**
   * Get total tag count
   */
  async getTagCount(): Promise<number> {
    return prisma.stashTag.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Gallery Queries ====================

  /**
   * Get all galleries from cache
   */
  async getAllGalleries(): Promise<NormalizedGallery[]> {
    const cached = await prisma.stashGallery.findMany({
      where: { deletedAt: null },
      include: {
        performers: { include: { performer: true } },
        tags: { include: { tag: true } }, // Include full tag data
      },
    });

    return cached.map((c) => this.transformGallery(c));
  }

  /**
   * Get gallery by ID with computed counts
   */
  async getGallery(id: string): Promise<NormalizedGallery | null> {
    const cached = await prisma.stashGallery.findFirst({
      where: { id, deletedAt: null },
      include: {
        performers: { include: { performer: true } },
        tags: { include: { tag: true } },
      },
    });

    if (!cached) return null;

    // Compute image count from ImageGallery junction table
    const imageCount = await prisma.imageGallery.count({
      where: {
        galleryId: id,
        image: { deletedAt: null },
      },
    });

    return this.transformGallery({
      ...cached,
      imageCount,
    });
  }

  /**
   * Get galleries by IDs
   */
  async getGalleriesByIds(ids: string[]): Promise<NormalizedGallery[]> {
    const cached = await prisma.stashGallery.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
      include: {
        performers: { include: { performer: true } },
        tags: { include: { tag: true } },
      },
    });

    return cached.map((c) => this.transformGallery(c));
  }

  /**
   * Get total gallery count
   */
  async getGalleryCount(): Promise<number> {
    return prisma.stashGallery.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Group Queries ====================

  /**
   * Get all groups from cache
   */
  async getAllGroups(): Promise<NormalizedGroup[]> {
    const cached = await prisma.stashGroup.findMany({
      where: { deletedAt: null },
      include: {
        tags: { include: { tag: true } }, // Include full tag data
      },
    });

    return cached.map((c) => this.transformGroup(c));
  }

  /**
   * Get group by ID with computed counts
   */
  async getGroup(id: string): Promise<NormalizedGroup | null> {
    const cached = await prisma.stashGroup.findFirst({
      where: { id, deletedAt: null },
    });

    if (!cached) return null;

    // Compute counts from junction tables
    const sceneCount = await prisma.sceneGroup.count({
      where: {
        groupId: id,
        scene: { deletedAt: null },
      },
    });

    // Get performer count by counting distinct performers from scenes in this group
    const performerCountResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT sp.performerId) as count
      FROM SceneGroup sg
      INNER JOIN ScenePerformer sp ON sg.sceneId = sp.sceneId
      INNER JOIN StashScene s ON sg.sceneId = s.id
      WHERE sg.groupId = ${id}
        AND s.deletedAt IS NULL
    `;
    const performerCount = Number(performerCountResult[0]?.count ?? 0);

    return this.transformGroup({
      ...cached,
      sceneCount,
      performerCount,
    });
  }

  /**
   * Get groups by IDs
   */
  async getGroupsByIds(ids: string[]): Promise<NormalizedGroup[]> {
    const cached = await prisma.stashGroup.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    return cached.map((c) => this.transformGroup(c));
  }

  /**
   * Get total group count
   */
  async getGroupCount(): Promise<number> {
    return prisma.stashGroup.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Image Queries ====================

  /**
   * Image includes for relations
   */
  private readonly imageIncludes = {
    performers: { include: { performer: true } },
    tags: { include: { tag: true } },
    galleries: {
      include: {
        gallery: {
          include: {
            performers: { include: { performer: true } },
            tags: { include: { tag: true } },
          },
        },
      },
    },
  };

  /**
   * Get all images from cache with relations
   */
  async getAllImages(): Promise<any[]> {
    const cached = await prisma.stashImage.findMany({
      where: { deletedAt: null },
      include: this.imageIncludes,
    });

    return cached.map((c) => this.transformImage(c));
  }

  /**
   * Get image by ID with relations
   */
  async getImage(id: string): Promise<any | null> {
    const cached = await prisma.stashImage.findFirst({
      where: { id, deletedAt: null },
      include: this.imageIncludes,
    });

    if (!cached) return null;
    return this.transformImage(cached);
  }

  /**
   * Get images by IDs with relations
   */
  async getImagesByIds(ids: string[]): Promise<any[]> {
    const cached = await prisma.stashImage.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
      include: this.imageIncludes,
    });

    return cached.map((c) => this.transformImage(c));
  }

  /**
   * Get total image count
   */
  async getImageCount(): Promise<number> {
    return prisma.stashImage.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Stats/Aggregation Queries ====================

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    scenes: number;
    performers: number;
    studios: number;
    tags: number;
    galleries: number;
    groups: number;
    images: number;
  }> {
    const [scenes, performers, studios, tags, galleries, groups, images] =
      await Promise.all([
        this.getSceneCount(),
        this.getPerformerCount(),
        this.getStudioCount(),
        this.getTagCount(),
        this.getGalleryCount(),
        this.getGroupCount(),
        this.getImageCount(),
      ]);

    return { scenes, performers, studios, tags, galleries, groups, images };
  }

  /**
   * Check if cache is ready (has data)
   */
  async isReady(): Promise<boolean> {
    const syncState = await prisma.syncState.findFirst({
      where: { entityType: "scene" },
    });

    return !!(syncState?.lastFullSyncTimestamp || syncState?.lastIncrementalSyncTimestamp);
  }

  /**
   * Get last refresh time for display (returns most recent actual sync time)
   */
  async getLastRefreshed(): Promise<Date | null> {
    const syncState = await prisma.syncState.findFirst({
      where: { entityType: "scene" },
    });

    if (!syncState) return null;

    const { lastFullSyncActual, lastIncrementalSyncActual } = syncState;

    // Return whichever sync happened more recently
    if (!lastFullSyncActual) return lastIncrementalSyncActual;
    if (!lastIncrementalSyncActual) return lastFullSyncActual;

    return lastFullSyncActual > lastIncrementalSyncActual ? lastFullSyncActual : lastIncrementalSyncActual;
  }

  /**
   * Get cache version for FilteredEntityCacheService compatibility
   * Uses the last sync timestamp as a version number
   */
  async getCacheVersion(): Promise<number> {
    const lastSync = await this.getLastRefreshed();
    return lastSync ? lastSync.getTime() : 0;
  }

  // ==================== Data Transform Helpers ====================

  /**
   * Generate scene stream URLs on-demand
   * All scenes have the same stream formats - only the ID varies
   * This eliminates storing ~4.4KB of redundant JSON per scene
   * Public so it can be used to populate streams for scene detail views
   *
   * Returns absolute Stash URLs (without API key) matching original Stash format.
   * The client will rewrite these to Peek proxy endpoints.
   */
  public generateSceneStreams(sceneId: string): Array<{url: string; mime_type: string; label: string}> {
    // Get Stash base URL (without /graphql path)
    const config = stashInstanceManager.getDefaultConfig();
    const stashUrl = new URL(config.url);
    const baseUrl = `${stashUrl.protocol}//${stashUrl.host}`;

    const formats = [
      { ext: '', mime: 'video/mp4', label: 'Direct stream', resolution: null },
      { ext: '.mp4', mime: 'video/mp4', label: 'MP4', resolution: 'ORIGINAL' },
      { ext: '.mp4', mime: 'video/mp4', label: 'MP4 Standard (480p)', resolution: 'STANDARD' },
      { ext: '.mp4', mime: 'video/mp4', label: 'MP4 Low (240p)', resolution: 'LOW' },
      { ext: '.webm', mime: 'video/webm', label: 'WEBM', resolution: 'ORIGINAL' },
      { ext: '.webm', mime: 'video/webm', label: 'WEBM Standard (480p)', resolution: 'STANDARD' },
      { ext: '.webm', mime: 'video/webm', label: 'WEBM Low (240p)', resolution: 'LOW' },
      { ext: '.m3u8', mime: 'application/vnd.apple.mpegurl', label: 'HLS', resolution: 'ORIGINAL' },
      { ext: '.m3u8', mime: 'application/vnd.apple.mpegurl', label: 'HLS Standard (480p)', resolution: 'STANDARD' },
      { ext: '.m3u8', mime: 'application/vnd.apple.mpegurl', label: 'HLS Low (240p)', resolution: 'LOW' },
      { ext: '.mpd', mime: 'application/dash+xml', label: 'DASH', resolution: 'ORIGINAL' },
      { ext: '.mpd', mime: 'application/dash+xml', label: 'DASH Standard (480p)', resolution: 'STANDARD' },
      { ext: '.mpd', mime: 'application/dash+xml', label: 'DASH Low (240p)', resolution: 'LOW' },
    ];

    return formats.map(f => {
      const streamPath = `/scene/${sceneId}/stream${f.ext}`;
      const fullUrl = f.resolution
        ? `${baseUrl}${streamPath}?resolution=${f.resolution}`
        : `${baseUrl}${streamPath}`;
      return {
        url: fullUrl,
        mime_type: f.mime,
        label: f.label,
      };
    });
  }

  // ==================== Relationship Queries (for filtering) ====================

  /**
   * Get performer IDs that appear in scenes from specific studios.
   * Used for filtering performers by studio on detail pages.
   * Schema dependencies: ScenePerformer.performerId, StashScene.studioId
   */
  async getPerformerIdsByStudios(studioIds: string[]): Promise<Set<string>> {
    if (studioIds.length === 0) return new Set();

    const startTime = Date.now();
    const results = await prisma.$queryRaw<{ performerId: string }[]>`
      SELECT DISTINCT sp.performerId
      FROM ScenePerformer sp
      INNER JOIN StashScene cs ON sp.sceneId = cs.id
      WHERE cs.studioId IN (${Prisma.join(studioIds)})
        AND cs.deletedAt IS NULL
    `;
    logger.debug(`getPerformerIdsByStudios: ${Date.now() - startTime}ms, studios=${studioIds.length}, performers=${results.length}`);

    return new Set(results.map(r => r.performerId));
  }

  /**
   * Get performer IDs that appear in scenes from specific groups.
   * Used for filtering performers by group on detail pages.
   * Schema dependencies: ScenePerformer.performerId, SceneGroup.groupId
   */
  async getPerformerIdsByGroups(groupIds: string[]): Promise<Set<string>> {
    if (groupIds.length === 0) return new Set();

    const startTime = Date.now();
    const results = await prisma.$queryRaw<{ performerId: string }[]>`
      SELECT DISTINCT sp.performerId
      FROM ScenePerformer sp
      INNER JOIN SceneGroup sg ON sp.sceneId = sg.sceneId
      WHERE sg.groupId IN (${Prisma.join(groupIds)})
    `;
    logger.debug(`getPerformerIdsByGroups: ${Date.now() - startTime}ms, groups=${groupIds.length}, performers=${results.length}`);

    return new Set(results.map(r => r.performerId));
  }

  /**
   * Get group IDs that contain scenes with specific performers.
   * Used for filtering groups by performer on detail pages.
   * Schema dependencies: SceneGroup.groupId, ScenePerformer.performerId
   */
  async getGroupIdsByPerformers(performerIds: string[]): Promise<Set<string>> {
    if (performerIds.length === 0) return new Set();

    const startTime = Date.now();
    const results = await prisma.$queryRaw<{ groupId: string }[]>`
      SELECT DISTINCT sg.groupId
      FROM SceneGroup sg
      INNER JOIN ScenePerformer sp ON sg.sceneId = sp.sceneId
      WHERE sp.performerId IN (${Prisma.join(performerIds)})
    `;
    logger.debug(`getGroupIdsByPerformers: ${Date.now() - startTime}ms, performers=${performerIds.length}, groups=${results.length}`);

    return new Set(results.map(r => r.groupId));
  }

  private transformScene(scene: any): NormalizedScene {
    return {
      // User fields (defaults first, then override with actual values)
      ...DEFAULT_SCENE_USER_FIELDS,

      id: scene.id,
      title: scene.title,
      code: scene.code,
      date: scene.date,
      details: scene.details,
      rating100: scene.rating100,
      organized: scene.organized,

      // URLs
      urls: scene.urls ? JSON.parse(scene.urls) : [],

      // File metadata
      files: scene.filePath ? [{
        path: scene.filePath,
        duration: scene.duration,
        bit_rate: scene.fileBitRate,
        frame_rate: scene.fileFrameRate,
        width: scene.fileWidth,
        height: scene.fileHeight,
        video_codec: scene.fileVideoCodec,
        audio_codec: scene.fileAudioCodec,
        size: scene.fileSize ? Number(scene.fileSize) : null,
      }] : [],

      // Transformed URLs
      paths: {
        screenshot: this.transformUrl(scene.pathScreenshot),
        preview: this.transformUrl(scene.pathPreview),
        sprite: this.transformUrl(scene.pathSprite),
        vtt: this.transformUrl(scene.pathVtt),
        chapters_vtt: this.transformUrl(scene.pathChaptersVtt),
        stream: this.transformUrl(scene.pathStream),
        caption: this.transformUrl(scene.pathCaption),
      },

      // Generate streams on-demand (no longer stored in DB)
      sceneStreams: this.generateSceneStreams(scene.id),

      // Stash counters (override defaults)
      o_counter: scene.oCounter ?? 0,
      play_count: scene.playCount ?? 0,
      play_duration: scene.playDuration ?? 0,

      // Timestamps
      created_at: scene.stashCreatedAt?.toISOString() ?? null,
      updated_at: scene.stashUpdatedAt?.toISOString() ?? null,

      // Nested entities - studio from studioId, others empty (loaded separately or via include)
      studio: scene.studioId ? { id: scene.studioId } : null,
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
    } as unknown as NormalizedScene;
  }

  /**
   * Transform scene for browse queries (no streams - generated on demand)
   */
  private transformSceneForBrowse(scene: any): NormalizedScene {
    return {
      // User fields (defaults first, then override with actual values)
      ...DEFAULT_SCENE_USER_FIELDS,

      id: scene.id,
      title: scene.title,
      code: scene.code,
      date: scene.date,
      details: scene.details,
      rating100: scene.rating100,
      organized: scene.organized,

      // URLs
      urls: scene.urls ? JSON.parse(scene.urls) : [],

      // File metadata
      files: scene.filePath ? [{
        path: scene.filePath,
        duration: scene.duration,
        bit_rate: scene.fileBitRate,
        frame_rate: scene.fileFrameRate,
        width: scene.fileWidth,
        height: scene.fileHeight,
        video_codec: scene.fileVideoCodec,
        audio_codec: scene.fileAudioCodec,
        size: scene.fileSize ? Number(scene.fileSize) : null,
      }] : [],

      // Transformed URLs
      paths: {
        screenshot: this.transformUrl(scene.pathScreenshot),
        preview: this.transformUrl(scene.pathPreview),
        sprite: this.transformUrl(scene.pathSprite),
        vtt: this.transformUrl(scene.pathVtt),
        chapters_vtt: this.transformUrl(scene.pathChaptersVtt),
        stream: this.transformUrl(scene.pathStream),
        caption: this.transformUrl(scene.pathCaption),
      },

      // Empty sceneStreams for browse - generated on demand for playback
      sceneStreams: [],

      // Stash counters (override defaults)
      o_counter: scene.oCounter ?? 0,
      play_count: scene.playCount ?? 0,
      play_duration: scene.playDuration ?? 0,

      // Timestamps
      created_at: scene.stashCreatedAt?.toISOString() ?? null,
      updated_at: scene.stashUpdatedAt?.toISOString() ?? null,

      // Nested entities - studioId only (name added by caller if needed), others empty (loaded separately or via include)
      studio: scene.studioId ? { id: scene.studioId } : null,
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
    } as unknown as NormalizedScene;
  }

  /**
   * Hydrate studio names on an array of scenes using a pre-fetched name map.
   * Mutates scenes in-place for performance.
   * This is a workaround until StashScene has a proper studio relation in Prisma.
   */
  private hydrateStudioNames(scenes: NormalizedScene[], studioNames: Map<string, string>): void {
    for (const scene of scenes) {
      if (scene.studio?.id) {
        const name = studioNames.get(scene.studio.id);
        if (name) {
          (scene.studio as { id: string; name?: string }).name = name;
        }
      }
    }
  }

  private transformSceneWithRelations(scene: any): NormalizedScene {
    const base = this.transformScene(scene);

    // Add nested entities
    if (scene.performers) {
      base.performers = scene.performers.map((sp: any) =>
        this.transformPerformer(sp.performer)
      );
    }
    if (scene.tags) {
      base.tags = scene.tags.map((st: any) =>
        this.transformTag(st.tag)
      );
    }
    if (scene.groups) {
      base.groups = scene.groups.map((sg: any) => ({
        ...this.transformGroup(sg.group),
        scene_index: sg.sceneIndex,
      }));
    }
    if (scene.galleries) {
      base.galleries = scene.galleries.map((sg: any) =>
        this.transformGallery(sg.gallery)
      );
    }

    return base;
  }

  private transformPerformer(performer: any): NormalizedPerformer {
    // Extract tags from junction table relation (if included) or empty array
    const tags = performer.tags?.map((pt: any) => ({ id: pt.tagId, name: pt.tag?.name || "Unknown" })) || [];
    return {
      ...DEFAULT_PERFORMER_USER_FIELDS,
      id: performer.id,
      name: performer.name,
      disambiguation: performer.disambiguation,
      gender: performer.gender,
      birthdate: performer.birthdate,
      favorite: performer.favorite ?? false,
      rating100: performer.rating100,
      scene_count: performer.sceneCount ?? 0,
      image_count: performer.imageCount ?? 0,
      gallery_count: performer.galleryCount ?? 0,
      group_count: performer.groupCount ?? 0,
      details: performer.details,
      alias_list: performer.aliasList ? JSON.parse(performer.aliasList) : [],
      country: performer.country,
      ethnicity: performer.ethnicity,
      hair_color: performer.hairColor,
      eye_color: performer.eyeColor,
      height_cm: performer.heightCm,
      weight: performer.weightKg,
      measurements: performer.measurements,
      fake_tits: performer.fakeTits,
      tattoos: performer.tattoos,
      piercings: performer.piercings,
      career_length: performer.careerLength,
      death_date: performer.deathDate,
      url: performer.url,
      // Tags from junction table relation - will be hydrated with names in controller
      tags,
      image_path: this.transformUrl(performer.imagePath),
      created_at: performer.stashCreatedAt?.toISOString() ?? null,
      updated_at: performer.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedPerformer;
  }

  private transformStudio(studio: any): NormalizedStudio {
    // Extract tags from junction table relation (if included) or empty array
    const tags = studio.tags?.map((st: any) => ({ id: st.tagId, name: st.tag?.name || "Unknown" })) || [];
    return {
      ...DEFAULT_STUDIO_USER_FIELDS,
      id: studio.id,
      name: studio.name,
      parent_studio: studio.parentId ? { id: studio.parentId } : null,
      favorite: studio.favorite ?? false,
      rating100: studio.rating100,
      scene_count: studio.sceneCount ?? 0,
      image_count: studio.imageCount ?? 0,
      gallery_count: studio.galleryCount ?? 0,
      performer_count: studio.performerCount ?? 0,
      group_count: studio.groupCount ?? 0,
      details: studio.details,
      url: studio.url,
      // Tags from junction table relation - will be hydrated with names in controller
      tags,
      image_path: this.transformUrl(studio.imagePath),
      created_at: studio.stashCreatedAt?.toISOString() ?? null,
      updated_at: studio.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedStudio;
  }

  private transformTag(tag: any): NormalizedTag {
    return {
      ...DEFAULT_TAG_USER_FIELDS,
      id: tag.id,
      name: tag.name,
      favorite: tag.favorite ?? false,
      scene_count: tag.sceneCount ?? 0,
      image_count: tag.imageCount ?? 0,
      gallery_count: tag.galleryCount ?? 0,
      performer_count: tag.performerCount ?? 0,
      studio_count: tag.studioCount ?? 0,
      group_count: tag.groupCount ?? 0,
      scene_marker_count: tag.sceneMarkerCount ?? 0,
      description: tag.description,
      aliases: tag.aliases ? JSON.parse(tag.aliases) : [],
      parents: tag.parentIds ? JSON.parse(tag.parentIds).map((id: string) => ({ id })) : [],
      image_path: this.transformUrl(tag.imagePath),
      created_at: tag.stashCreatedAt?.toISOString() ?? null,
      updated_at: tag.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedTag;
  }

  private transformGroup(group: any): NormalizedGroup {
    // Extract tags from junction table relation (if included) or empty array
    const tags = group.tags?.map((gt: any) => ({ id: gt.tagId, name: gt.tag?.name || "Unknown" })) || [];
    return {
      ...DEFAULT_GROUP_USER_FIELDS,
      id: group.id,
      name: group.name,
      date: group.date,
      studio: group.studioId ? { id: group.studioId } : null,
      rating100: group.rating100,
      duration: group.duration,
      scene_count: group.sceneCount ?? 0,
      performer_count: group.performerCount ?? 0,
      director: group.director,
      synopsis: group.synopsis,
      urls: group.urls ? JSON.parse(group.urls) : [],
      // Tags from junction table relation - will be hydrated with names in controller
      tags,
      front_image_path: this.transformUrl(group.frontImagePath),
      back_image_path: this.transformUrl(group.backImagePath),
      created_at: group.stashCreatedAt?.toISOString() ?? null,
      updated_at: group.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedGroup;
  }

  private transformGallery(gallery: any): NormalizedGallery {
    const coverUrl = this.transformUrl(gallery.coverPath);
    // Extract tags from junction table relation (if included) or empty array
    const tags = gallery.tags?.map((gt: any) => ({ id: gt.tagId, name: gt.tag?.name || "Unknown" })) || [];

    // Transform performers from junction table
    const performers = gallery.performers?.map((gp: any) => ({
      id: gp.performer.id,
      name: gp.performer.name,
    })) || [];

    // Build files array for frontend title fallback (zip galleries)
    const files = gallery.fileBasename ? [{ basename: gallery.fileBasename }] : [];

    return {
      ...DEFAULT_GALLERY_USER_FIELDS,
      id: gallery.id,
      title: gallery.title,
      date: gallery.date,
      studio: gallery.studioId ? { id: gallery.studioId } : null,
      rating100: gallery.rating100,
      image_count: gallery.imageCount ?? 0,
      details: gallery.details,
      url: gallery.url,
      code: gallery.code,
      folder: gallery.folderPath ? { path: gallery.folderPath } : null,
      // Files array for frontend galleryTitle() fallback
      files,
      cover: coverUrl ? { paths: { thumbnail: coverUrl } } : null,
      // Frontend expects gallery.paths.cover for the cover image
      paths: coverUrl ? { cover: coverUrl } : null,
      // Tags from junction table relation - will be hydrated with names in controller
      tags,
      // Performers from junction table
      performers,
      created_at: gallery.stashCreatedAt?.toISOString() ?? null,
      updated_at: gallery.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedGallery;
  }

  private transformImage(image: any): any {
    // Transform performers from junction table
    const performers = (image.performers ?? []).map((ip: any) => ({
      id: ip.performer.id,
      name: ip.performer.name,
    }));

    // Transform tags from junction table
    const tags = (image.tags ?? []).map((it: any) => ({
      id: it.tag.id,
      name: it.tag.name,
    }));

    // Transform galleries from junction table (with their performers/tags for inheritance)
    const galleries = (image.galleries ?? []).map((ig: any) => ({
      id: ig.gallery.id,
      title: ig.gallery.title,
      studioId: ig.gallery.studioId,
      performers: (ig.gallery.performers ?? []).map((gp: any) => ({
        id: gp.performer.id,
        name: gp.performer.name,
      })),
      tags: (ig.gallery.tags ?? []).map((gt: any) => ({
        id: gt.tag.id,
        name: gt.tag.name,
      })),
    }));

    return {
      id: image.id,
      title: image.title,
      code: image.code,
      details: image.details,
      photographer: image.photographer,
      urls: image.urls ? JSON.parse(image.urls) : [],
      date: image.date,
      studio: image.studioId ? { id: image.studioId } : null,
      studioId: image.studioId,
      rating100: image.rating100,
      o_counter: image.oCounter ?? 0,
      organized: image.organized ?? false,
      filePath: image.filePath,
      width: image.width,
      height: image.height,
      fileSize: image.fileSize ? Number(image.fileSize) : null,
      files: image.filePath ? [{
        path: image.filePath,
        width: image.width,
        height: image.height,
        size: image.fileSize ? Number(image.fileSize) : null,
      }] : [],
      paths: {
        thumbnail: `/api/proxy/image/${image.id}/thumbnail`,
        preview: `/api/proxy/image/${image.id}/preview`,
        image: `/api/proxy/image/${image.id}/image`,
      },
      performers,
      tags,
      galleries,
      created_at: image.stashCreatedAt?.toISOString() ?? null,
      updated_at: image.stashUpdatedAt?.toISOString() ?? null,
      stashCreatedAt: image.stashCreatedAt?.toISOString() ?? null,
      stashUpdatedAt: image.stashUpdatedAt?.toISOString() ?? null,
    };
  }

  private transformUrl(urlOrPath: string | null): string | null {
    if (!urlOrPath) return null;

    // If it's already a proxy URL, return as-is
    if (urlOrPath.startsWith("/api/proxy/stash")) {
      return urlOrPath;
    }

    // If it's a full URL (http://...), extract path + query
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      try {
        const url = new URL(urlOrPath);
        const pathWithQuery = url.pathname + url.search;
        return `/api/proxy/stash?path=${encodeURIComponent(pathWithQuery)}`;
      } catch {
        // If URL parsing fails, treat as path
        return `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
      }
    }

    // Otherwise treat as path and encode it
    return `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
  }
}

// Export singleton instance
export const stashEntityService = new StashEntityService();
