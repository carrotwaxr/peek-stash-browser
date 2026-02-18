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
import type { StashScene, StashPerformer, StashStudio, StashTag, StashGroup, StashGallery, StashImage } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import { stashInstanceManager } from "./StashInstanceManager.js";
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedImage,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
  SceneScoringData,
} from "../types/index.js";
import { logger } from "../utils/logger.js";
import { getSceneFallbackTitle, getGalleryFallbackTitle, getImageFallbackTitle } from "../utils/titleUtils.js";

/**
 * Row shape returned by FTS search queries (raw SQL returning StashScene columns).
 * Uses Record<string, unknown> base since raw SQL results don't have Prisma's
 * typed Date objects - timestamps come back as strings or numbers.
 */
type FtsSceneRow = Record<string, unknown> & StashScene;

/**
 * Row shape returned by FTS performer search queries.
 */
type FtsPerformerRow = Record<string, unknown> & StashPerformer;

/** Junction table entry for scene-performer with included performer */
interface ScenePerformerWithPerformer {
  performer: StashPerformer;
}

/** Junction table entry for scene-tag with included tag */
interface SceneTagWithTag {
  tag: StashTag;
}

/** Junction table entry for scene-group with included group */
interface SceneGroupWithGroup {
  group: StashGroup;
  sceneIndex: number | null;
}

/** Junction table entry for scene-gallery with included gallery */
interface SceneGalleryWithGallery {
  gallery: StashGallery;
}

/** Scene result from Prisma with all relations included */
interface SceneWithRelations extends StashScene {
  performers?: ScenePerformerWithPerformer[];
  tags?: SceneTagWithTag[];
  groups?: SceneGroupWithGroup[];
  galleries?: SceneGalleryWithGallery[];
}

/** Performer tag junction entry with included tag */
interface PerformerTagWithTag {
  tagId: string;
  tag?: StashTag | null;
}

/** Performer input for transformPerformer - Prisma result with optional tag relation and optional computed counts */
type PerformerInput = StashPerformer & {
  tags?: PerformerTagWithTag[];
};

/** Studio tag junction entry with included tag */
interface StudioTagWithTag {
  tagId: string;
  tag?: StashTag | null;
}

/** Studio input for transformStudio - Prisma result with optional tag relation and optional computed counts */
type StudioInput = StashStudio & {
  tags?: StudioTagWithTag[];
};

/** Tag input for transformTag - Prisma result with optional computed counts */
type TagInput = StashTag & {
  sceneMarkerCount?: number;
};

/** Group tag junction entry with included tag */
interface GroupTagWithTag {
  tagId: string;
  tag?: StashTag | null;
}

/** Group input for transformGroup - Prisma result with optional tag relation and optional computed counts */
type GroupInput = StashGroup & {
  tags?: GroupTagWithTag[];
};

/** Gallery performer junction entry */
interface GalleryPerformerEntry {
  performer: StashPerformer;
}

/** Gallery tag junction entry with included tag */
interface GalleryTagWithTag {
  tagId: string;
  tag?: StashTag | null;
}

/** Gallery scene junction entry */
interface GallerySceneEntry {
  scene: StashScene;
}

/** Gallery input for transformGallery - Prisma result with optional relations and computed counts */
type GalleryInput = StashGallery & {
  performers?: GalleryPerformerEntry[];
  tags?: GalleryTagWithTag[];
  scenes?: GallerySceneEntry[];
};

/** Image performer junction entry */
interface ImagePerformerEntry {
  performer: StashPerformer;
}

/** Image tag junction entry */
interface ImageTagEntry {
  tag: StashTag;
}

/** Image gallery junction entry with nested relations */
interface ImageGalleryEntry {
  gallery: StashGallery & {
    studio?: { id: string; name: string } | null;
    performers?: GalleryPerformerEntry[];
    tags?: GalleryTagWithTag[];
  };
}

/** Image input for transformImage - Prisma result with optional relations */
type ImageInput = StashImage & {
  studio?: { id: string; name: string } | null;
  performers?: ImagePerformerEntry[];
  tags?: ImageTagEntry[];
  galleries?: ImageGalleryEntry[];
};

/** Scene fields returned by BROWSE_SELECT queries (subset of StashScene without streams/data) */
type BrowseSceneRow = Pick<StashScene,
  'id' | 'stashInstanceId' | 'title' | 'code' | 'date' | 'studioId' |
  'rating100' | 'duration' | 'organized' | 'details' | 'director' | 'urls' |
  'filePath' | 'fileBitRate' | 'fileFrameRate' | 'fileWidth' | 'fileHeight' |
  'fileVideoCodec' | 'fileAudioCodec' | 'fileSize' | 'pathScreenshot' |
  'pathPreview' | 'pathSprite' | 'pathVtt' | 'pathChaptersVtt' | 'pathStream' |
  'pathCaption' | 'captions' | 'oCounter' | 'playCount' | 'playDuration' |
  'stashCreatedAt' | 'stashUpdatedAt' | 'syncedAt' | 'deletedAt' | 'inheritedTagIds'
>;

/** Transformed image output shape (returned by transformImage) */
interface TransformedImage {
  id: string;
  instanceId: string;
  title: string | null;
  code: string | null;
  details: string | null;
  photographer: string | null;
  urls: string[];
  date: string | null;
  studio: { id: string; name?: string } | null;
  studioId: string | null;
  rating100: number | null;
  o_counter: number;
  organized: boolean;
  filePath: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  files: Array<{ path: string; width: number | null; height: number | null; size: number | null }>;
  paths: { thumbnail: string; preview: string; image: string };
  performers: Array<{ id: string; name: string; gender: string | null; image_path: string | null }>;
  tags: Array<{ id: string; name: string }>;
  galleries: Array<Record<string, unknown>>;
  created_at: string | null;
  updated_at: string | null;
  stashCreatedAt: string | null;
  stashUpdatedAt: string | null;
}

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

  // In-memory cache for tag name lookups (for inherited tag hydration)
  private tagNameCache: Map<string, string> | null = null;
  private tagNameCachePromise: Promise<Map<string, string>> | null = null;

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
    captions: true,
    // Explicitly NOT selecting: streams, data
    oCounter: true,
    playCount: true,
    playDuration: true,
    stashCreatedAt: true,
    stashUpdatedAt: true,
    syncedAt: true,
    deletedAt: true,
    inheritedTagIds: true,
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

    // Hydrate studio names and inherited tags
    const hydrateStart = Date.now();
    const [studioNames, tagNames] = await Promise.all([
      this.getStudioNameMap(),
      this.getTagNameMap(),
    ]);
    this.hydrateStudioNames(result, studioNames);
    this.hydrateInheritedTags(result, tagNames);
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
        s.stashInstanceId,
        s.studioId,
        s.oCounter,
        s.date,
        COALESCE(GROUP_CONCAT(DISTINCT sp.performerId), '') as performerIds,
        COALESCE(GROUP_CONCAT(DISTINCT st.tagId), '') as tagIds
      FROM StashScene s
      LEFT JOIN ScenePerformer sp ON s.id = sp.sceneId AND s.stashInstanceId = sp.sceneInstanceId
      LEFT JOIN SceneTag st ON s.id = st.sceneId AND s.stashInstanceId = st.sceneInstanceId
      WHERE s.deletedAt IS NULL
      GROUP BY s.id, s.stashInstanceId
    `;

    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      stashInstanceId: string;
      studioId: string | null;
      oCounter: number;
      date: string | null;
      performerIds: string;
      tagIds: string;
    }>>(sql);

    const result: SceneScoringData[] = rows.map(row => ({
      id: row.id,
      instanceId: row.stashInstanceId,
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
   * Get candidate scene IDs for similarity matching using SQL
   * Returns up to maxCandidates scenes that share performers, tags, or studio
   * with the given scene, weighted by relationship type.
   *
   * Weights:
   * - Shared performer: 3 points
   * - Same studio: 2 points
   * - Shared tag: 1 point
   *
   * @param sceneId - The scene to find similar scenes for
   * @param excludedIds - Set of scene IDs to exclude (e.g., user exclusions)
   * @param maxCandidates - Maximum number of candidates to return (default 500)
   * @returns Array of candidate scene IDs with weights and dates, sorted by weight desc then date desc
   */
  async getSimilarSceneCandidates(
    sceneId: string,
    excludedIds: Set<string>,
    maxCandidates: number = 500
  ): Promise<Array<{ sceneId: string; weight: number; date: string | null }>> {
    const startTime = Date.now();

    // Convert excludedIds to array for SQL IN clause
    // If empty, use a dummy value that won't match any ID
    const excludedArray = excludedIds.size > 0
      ? Array.from(excludedIds)
      : ['__NONE__'];

    // SQL query to find candidate scenes sharing performers, tags, or studio
    // Uses UNION ALL to combine weighted matches, then groups and sums weights
    // Includes date for secondary sorting
    // Note: Performer and tag matching is instance-aware (same ID + same instance)
    const sql = `
      WITH candidates AS (
        -- Scenes sharing performers (weight: 3 per match)
        SELECT sp2.sceneId, 3 as weight
        FROM ScenePerformer sp1
        JOIN ScenePerformer sp2 ON sp2.performerId = sp1.performerId AND sp2.performerInstanceId = sp1.performerInstanceId
        JOIN StashScene s ON s.id = sp2.sceneId AND s.stashInstanceId = sp2.sceneInstanceId AND s.deletedAt IS NULL
        WHERE sp1.sceneId = ?
          AND sp2.sceneId != ?

        UNION ALL

        -- Scenes from same studio (weight: 2) - scoped to same instance
        SELECT s2.id as sceneId, 2 as weight
        FROM StashScene s1
        JOIN StashScene s2 ON s2.studioId = s1.studioId
          AND s2.stashInstanceId = s1.stashInstanceId
          AND s2.deletedAt IS NULL
        WHERE s1.id = ?
          AND s2.id != ?
          AND s1.studioId IS NOT NULL

        UNION ALL

        -- Scenes sharing tags (weight: 1 per match)
        SELECT st2.sceneId, 1 as weight
        FROM SceneTag st1
        JOIN SceneTag st2 ON st2.tagId = st1.tagId AND st2.tagInstanceId = st1.tagInstanceId
        JOIN StashScene s ON s.id = st2.sceneId AND s.stashInstanceId = st2.sceneInstanceId AND s.deletedAt IS NULL
        WHERE st1.sceneId = ?
          AND st2.sceneId != ?
      )
      SELECT c.sceneId, SUM(c.weight) as totalWeight, s.date
      FROM candidates c
      JOIN StashScene s ON s.id = c.sceneId
      WHERE c.sceneId NOT IN (${excludedArray.map(() => '?').join(',')})
      GROUP BY c.sceneId
      ORDER BY totalWeight DESC, s.date DESC
      LIMIT ?
    `;

    // Build params array: sceneId appears 6 times (for each WHERE clause),
    // then excludedIds, then maxCandidates
    const params = [
      sceneId, sceneId,  // performers
      sceneId, sceneId,  // studio
      sceneId, sceneId,  // tags
      ...excludedArray,
      maxCandidates,
    ];

    const rows = await prisma.$queryRawUnsafe<Array<{
      sceneId: string;
      totalWeight: number;
      date: string | null;
    }>>(sql, ...params);

    const result = rows.map(row => ({
      sceneId: row.sceneId,
      weight: Number(row.totalWeight),
      date: row.date,
    }));

    logger.info(`getSimilarSceneCandidates: ${Date.now() - startTime}ms, candidates=${result.length}`);

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

    // Hydrate studio names and inherited tags
    const hydrateStart = Date.now();
    const [studioNames, tagNames] = await Promise.all([
      this.getStudioNameMap(),
      this.getTagNameMap(),
    ]);
    this.hydrateStudioNames(result, studioNames);
    this.hydrateInheritedTags(result, tagNames);
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

    // Hydrate studio names and inherited tags
    const hydrateStart = Date.now();
    const [studioNames, tagNames] = await Promise.all([
      this.getStudioNameMap(),
      this.getTagNameMap(),
    ]);
    this.hydrateStudioNames(result, studioNames);
    this.hydrateInheritedTags(result, tagNames);
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

    // Hydrate studio names and inherited tags
    const hydrateStart = Date.now();
    const [studioNames, tagNames] = await Promise.all([
      this.getStudioNameMap(),
      this.getTagNameMap(),
    ]);
    this.hydrateStudioNames(result, studioNames);
    this.hydrateInheritedTags(result, tagNames);
    const hydrateTime = Date.now() - hydrateStart;

    logger.info(`getAllScenesWithPerformersAndTags: query=${queryTime}ms, transform=${transformTime}ms, hydrate=${hydrateTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }


  /**
   * Get scene by ID (includes related entities)
   * @param id - Scene ID
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getScene(id: string, instanceId?: string): Promise<NormalizedScene | null> {
    const cached = await prisma.stashScene.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
      },
      include: {
        performers: { include: { performer: true } },
        tags: { include: { tag: true } },
        groups: { include: { group: true } },
        galleries: { include: { gallery: true } },
      },
    });

    if (!cached) return null;
    const scene = this.transformSceneWithRelations(cached);

    // Hydrate studio names and inherited tags
    const [studioNames, tagNames] = await Promise.all([
      this.getStudioNameMap(),
      this.getTagNameMap(),
    ]);
    this.hydrateStudioNames([scene], studioNames);
    this.hydrateInheritedTags([scene], tagNames);

    return scene;
  }

  /**
   * Get scenes by IDs
   * @param ids - Array of scene IDs
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getScenesByIds(ids: string[], instanceId?: string): Promise<NormalizedScene[]> {
    const cached = await prisma.stashScene.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
      },
    });

    return cached.map((c) => this.transformScene(c));
  }

  /**
   * Get scenes by IDs with full relations (performers, tags, studio, groups, galleries)
   * Use this when you need the related entities, not just scene data.
   * This is more expensive than getScenesByIds due to the joins.
   * @param ids - Array of scene IDs
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getScenesByIdsWithRelations(ids: string[], instanceId?: string): Promise<NormalizedScene[]> {
    if (ids.length === 0) return [];

    const cached = await prisma.stashScene.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
      },
      include: {
        performers: { include: { performer: true } },
        tags: { include: { tag: true } },
        groups: { include: { group: true } },
        galleries: { include: { gallery: true } },
      },
    });

    const scenes = cached.map((c) => this.transformSceneWithRelations(c));

    // Hydrate studio names and inherited tags
    const [studioNames, tagNames] = await Promise.all([
      this.getStudioNameMap(),
      this.getTagNameMap(),
    ]);
    this.hydrateStudioNames(scenes, studioNames);
    this.hydrateInheritedTags(scenes, tagNames);

    return scenes;
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
    const where: Prisma.StashSceneWhereInput = { deletedAt: null };
    if (excludeIds && excludeIds.size > 0) {
      where.id = { notIn: Array.from(excludeIds) };
    }

    // Get total count first (for pagination info) - respecting exclusions
    const countStart = Date.now();
    const total = await prisma.stashScene.count({ where });
    logger.debug(`getScenesPaginated: count took ${Date.now() - countStart}ms (excludeIds: ${excludeIds?.size || 0})`);

    // Build orderBy
    const direction = sortDirection.toLowerCase() as Prisma.SortOrder;
    let orderBy: Prisma.StashSceneOrderByWithRelationInput;
    if (isRandom) {
      // For random, we'll use a seeded approach based on page
      // This gives consistent results per page but variety across pages
      orderBy = { id: direction };
    } else {
      orderBy = { [sortColumn]: direction };
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

    // Hydrate studio names and inherited tags
    const hydrateStart = Date.now();
    const [studioNames, tagNames] = await Promise.all([
      this.getStudioNameMap(),
      this.getTagNameMap(),
    ]);
    this.hydrateStudioNames(scenes, studioNames);
    this.hydrateInheritedTags(scenes, tagNames);
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
      const results = await prisma.$queryRaw<FtsSceneRow[]>`
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
   * @param id - Performer ID
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getPerformer(id: string, instanceId?: string): Promise<NormalizedPerformer | null> {
    const cached = await prisma.stashPerformer.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
      },
    });

    if (!cached) return null;

    // Compute counts from junction tables (except imageCount which uses stored inherited value)
    const performerInstanceId = cached.stashInstanceId;
    const [sceneCount, galleryCount] = await Promise.all([
      prisma.scenePerformer.count({
        where: {
          performerId: id,
          performerInstanceId,
          scene: { deletedAt: null },
        },
      }),
      prisma.galleryPerformer.count({
        where: {
          performerId: id,
          performerInstanceId,
          gallery: { deletedAt: null },
        },
      }),
    ]);

    // Get group count by counting distinct groups from scenes
    const groupCountResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT sg.groupId) as count
      FROM ScenePerformer sp
      INNER JOIN SceneGroup sg ON sp.sceneId = sg.sceneId AND sp.sceneInstanceId = sg.sceneInstanceId
      INNER JOIN StashScene s ON sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
      WHERE sp.performerId = ${id}
        AND sp.performerInstanceId = ${performerInstanceId}
        AND s.deletedAt IS NULL
    `;
    const groupCount = Number(groupCountResult[0]?.count ?? 0);

    // imageCount comes from cached (stored value with gallery inheritance, calculated at sync time)
    return this.transformPerformer({
      ...cached,
      sceneCount,
      galleryCount,
      groupCount,
    });
  }

  /**
   * Get performers by IDs
   * @param ids - Array of performer IDs
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getPerformersByIds(ids: string[], instanceId?: string): Promise<NormalizedPerformer[]> {
    const cached = await prisma.stashPerformer.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
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
      const results = await prisma.$queryRaw<FtsPerformerRow[]>`
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

    // Build the cache with composite keys (id + instanceId) to prevent cross-instance collisions
    this.studioNameCachePromise = (async () => {
      const studios = await prisma.stashStudio.findMany({
        where: { deletedAt: null },
        select: { id: true, stashInstanceId: true, name: true },
      });
      const map = new Map<string, string>();
      for (const s of studios) {
        if (s.name) {
          map.set(`${s.id}\0${s.stashInstanceId}`, s.name);
          // Also set by ID only (for backwards compat when instanceId unavailable)
          if (!map.has(s.id)) map.set(s.id, s.name);
        }
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
   * Get a lightweight Map of tag ID -> name for hydrating inherited tags.
   * Uses in-memory caching to avoid repeated DB queries.
   */
  async getTagNameMap(): Promise<Map<string, string>> {
    // Return cached result if available
    if (this.tagNameCache) {
      return this.tagNameCache;
    }

    // If already loading, wait for that promise
    if (this.tagNameCachePromise) {
      return this.tagNameCachePromise;
    }

    // Build the cache with composite keys (id + instanceId) to prevent cross-instance collisions
    this.tagNameCachePromise = (async () => {
      const tags = await prisma.stashTag.findMany({
        where: { deletedAt: null },
        select: { id: true, stashInstanceId: true, name: true },
      });
      const map = new Map<string, string>();
      for (const t of tags || []) {
        if (t.name) {
          map.set(`${t.id}\0${t.stashInstanceId}`, t.name);
          // Also set by ID only (for backwards compat when instanceId unavailable)
          if (!map.has(t.id)) map.set(t.id, t.name);
        }
      }
      this.tagNameCache = map;
      this.tagNameCachePromise = null;
      return map;
    })();

    return this.tagNameCachePromise;
  }

  /**
   * Invalidate the tag name cache (call after sync or tag updates)
   */
  invalidateTagNameCache(): void {
    this.tagNameCache = null;
    this.tagNameCachePromise = null;
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
   * @param id - Studio ID
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getStudio(id: string, instanceId?: string): Promise<NormalizedStudio | null> {
    const cached = await prisma.stashStudio.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
      },
    });

    if (!cached) return null;

    // Compute counts from junction tables and scene data (except imageCount which uses stored inherited value)
    const studioInstanceId = cached.stashInstanceId;
    const [sceneCount, galleryCount] = await Promise.all([
      prisma.stashScene.count({
        where: {
          studioId: id,
          stashInstanceId: studioInstanceId,
          deletedAt: null,
        },
      }),
      prisma.stashGallery.count({
        where: {
          studioId: id,
          stashInstanceId: studioInstanceId,
          deletedAt: null,
        },
      }),
    ]);

    // Get performer count by counting distinct performers from scenes
    const performerCountResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT sp.performerId) as count
      FROM ScenePerformer sp
      INNER JOIN StashScene s ON sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
      WHERE s.studioId = ${id}
        AND s.stashInstanceId = ${studioInstanceId}
        AND s.deletedAt IS NULL
    `;
    const performerCount = Number(performerCountResult[0]?.count ?? 0);

    // Get group count by counting distinct groups from scenes
    const groupCountResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT sg.groupId) as count
      FROM SceneGroup sg
      INNER JOIN StashScene s ON sg.sceneId = s.id AND sg.sceneInstanceId = s.stashInstanceId
      WHERE s.studioId = ${id}
        AND s.stashInstanceId = ${studioInstanceId}
        AND s.deletedAt IS NULL
    `;
    const groupCount = Number(groupCountResult[0]?.count ?? 0);
    // imageCount comes from cached (stored value with gallery inheritance, calculated at sync time)

    return this.transformStudio({
      ...cached,
      sceneCount,
      galleryCount,
      performerCount,
      groupCount,
    });
  }

  /**
   * Get studios by IDs
   * @param ids - Array of studio IDs
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getStudiosByIds(ids: string[], instanceId?: string): Promise<NormalizedStudio[]> {
    const cached = await prisma.stashStudio.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
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
   * @param id - Tag ID
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getTag(id: string, instanceId?: string): Promise<NormalizedTag | null> {
    const cached = await prisma.stashTag.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
      },
    });

    if (!cached) return null;

    // Compute counts from junction tables (except imageCount which uses stored inherited value)
    const tagInstanceId = cached.stashInstanceId;
    const [sceneCount, galleryCount, performerCount, studioCount, groupCount] = await Promise.all([
      prisma.sceneTag.count({
        where: {
          tagId: id,
          tagInstanceId,
          scene: { deletedAt: null },
        },
      }),
      prisma.galleryTag.count({
        where: {
          tagId: id,
          tagInstanceId,
          gallery: { deletedAt: null },
        },
      }),
      prisma.performerTag.count({
        where: {
          tagId: id,
          tagInstanceId,
          performer: { deletedAt: null },
        },
      }),
      prisma.studioTag.count({
        where: {
          tagId: id,
          tagInstanceId,
          studio: { deletedAt: null },
        },
      }),
      prisma.groupTag.count({
        where: {
          tagId: id,
          tagInstanceId,
          group: { deletedAt: null },
        },
      }),
    ]);
    // imageCount comes from cached (stored value with gallery inheritance, calculated at sync time)

    return this.transformTag({
      ...cached,
      sceneCount,
      galleryCount,
      performerCount,
      studioCount,
      groupCount,
      sceneMarkerCount: 0, // Scene markers not currently synced
    });
  }

  /**
   * Get tags by IDs
   * @param ids - Array of tag IDs
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getTagsByIds(ids: string[], instanceId?: string): Promise<NormalizedTag[]> {
    const cached = await prisma.stashTag.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
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
        scenes: { include: { scene: true } },
      },
    });

    return cached.map((c) => this.transformGallery(c));
  }

  /**
   * Get gallery by ID with computed counts
   * @param id - Gallery ID
   * @param instanceId - Optional Stash instance ID for multi-instance support
   */
  async getGallery(id: string, instanceId?: string): Promise<NormalizedGallery | null> {
    const cached = await prisma.stashGallery.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
      },
      include: {
        performers: { include: { performer: true } },
        tags: { include: { tag: true } },
        scenes: { include: { scene: true } },
      },
    });

    if (!cached) return null;

    // Compute image count from ImageGallery junction table (instance-scoped)
    const imageCount = await prisma.imageGallery.count({
      where: {
        galleryId: id,
        galleryInstanceId: cached.stashInstanceId,
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
        scenes: { include: { scene: true } },
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
   * @param id - Group ID
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getGroup(id: string, instanceId?: string): Promise<NormalizedGroup | null> {
    const cached = await prisma.stashGroup.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
      },
    });

    if (!cached) return null;

    // Compute counts from junction tables
    const groupInstanceId = cached.stashInstanceId;
    const sceneCount = await prisma.sceneGroup.count({
      where: {
        groupId: id,
        groupInstanceId,
        scene: { deletedAt: null },
      },
    });

    // Get performer count by counting distinct performers from scenes in this group
    const performerCountResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT sp.performerId) as count
      FROM SceneGroup sg
      INNER JOIN ScenePerformer sp ON sg.sceneId = sp.sceneId AND sg.sceneInstanceId = sp.sceneInstanceId
      INNER JOIN StashScene s ON sg.sceneId = s.id AND sg.sceneInstanceId = s.stashInstanceId
      WHERE sg.groupId = ${id}
        AND sg.groupInstanceId = ${groupInstanceId}
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
   * @param ids - Array of group IDs
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getGroupsByIds(ids: string[], instanceId?: string): Promise<NormalizedGroup[]> {
    const cached = await prisma.stashGroup.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
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
    studio: true,
    galleries: {
      include: {
        gallery: {
          include: {
            performers: { include: { performer: true } },
            tags: { include: { tag: true } },
            studio: true,
          },
        },
      },
    },
  };

  /**
   * Get all images from cache with relations
   * Uses chunked queries to avoid Prisma's string conversion limit with large datasets.
   * The "Failed to convert rust String into napi string" error occurs when Prisma
   * tries to serialize very large result sets (500k+ rows with relations).
   */
  async getAllImages(): Promise<TransformedImage[]> {
    const startTime = Date.now();

    // Get total count first
    const totalCount = await prisma.stashImage.count({
      where: { deletedAt: null },
    });

    // For smaller datasets, use single query (faster)
    if (totalCount < 10000) {
      const cached = await prisma.stashImage.findMany({
        where: { deletedAt: null },
        include: this.imageIncludes,
      });
      const result = cached.map((c) => this.transformImage(c as unknown as ImageInput));
      logger.info(`getAllImages: single query for ${totalCount} images in ${Date.now() - startTime}ms`);
      return result;
    }

    // For large datasets, fetch in chunks to avoid Prisma string limit
    // Chunk size of 5000 keeps each query well under the limit
    const CHUNK_SIZE = 5000;
    const allImages: TransformedImage[] = [];
    let offset = 0;

    while (offset < totalCount) {
      const chunkStart = Date.now();
      const chunk = await prisma.stashImage.findMany({
        where: { deletedAt: null },
        include: this.imageIncludes,
        skip: offset,
        take: CHUNK_SIZE,
        orderBy: { id: 'asc' }, // Consistent ordering for pagination
      });

      const transformed = chunk.map((c) => this.transformImage(c as unknown as ImageInput));
      allImages.push(...transformed);

      logger.debug(`getAllImages chunk: offset=${offset}, fetched=${chunk.length} in ${Date.now() - chunkStart}ms`);
      offset += CHUNK_SIZE;
    }

    logger.info(`getAllImages: chunked query for ${totalCount} images in ${Date.now() - startTime}ms`);
    return allImages;
  }

  /**
   * Get image by ID with relations
   * @param id - Image ID
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getImage(id: string, instanceId?: string): Promise<NormalizedImage | null> {
    const cached = await prisma.stashImage.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(instanceId && { stashInstanceId: instanceId }),
      },
      include: this.imageIncludes,
    });

    if (!cached) return null;
    return this.transformImage(cached as unknown as ImageInput) as unknown as NormalizedImage;
  }

  /**
   * Get images by IDs with relations
   * Uses chunked queries for large ID sets to avoid Prisma's string conversion limit.
   * @param ids - Array of image IDs
   * @param instanceId - Optional Stash instance ID for multi-instance disambiguation
   */
  async getImagesByIds(ids: string[], instanceId?: string): Promise<NormalizedImage[]> {
    if (ids.length === 0) return [];

    const instanceFilter = instanceId ? { stashInstanceId: instanceId } : {};

    // For smaller sets, use single query
    if (ids.length < 5000) {
      const cached = await prisma.stashImage.findMany({
        where: {
          id: { in: ids },
          deletedAt: null,
          ...instanceFilter,
        },
        include: this.imageIncludes,
      });
      return cached.map((c) => this.transformImage(c as unknown as ImageInput) as unknown as NormalizedImage);
    }

    // For large sets, fetch in chunks
    const CHUNK_SIZE = 5000;
    const allImages: NormalizedImage[] = [];

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunkIds = ids.slice(i, i + CHUNK_SIZE);
      const chunk = await prisma.stashImage.findMany({
        where: {
          id: { in: chunkIds },
          deletedAt: null,
          ...instanceFilter,
        },
        include: this.imageIncludes,
      });
      allImages.push(...chunk.map((c) => this.transformImage(c as unknown as ImageInput) as unknown as NormalizedImage));
    }

    return allImages;
  }

  /**
   * Get total image count
   */
  async getImageCount(): Promise<number> {
    return prisma.stashImage.count({
      where: { deletedAt: null },
    });
  }

  /**
   * Get total clip count
   */
  async getClipCount(): Promise<number> {
    return prisma.stashClip.count();
  }

  /**
   * Get count of clips that have isGenerated=false (need preview generation)
   */
  async getUngeneratedClipCount(): Promise<number> {
    return prisma.stashClip.count({
      where: {
        isGenerated: false,
        deletedAt: null,
      },
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
    clips: number;
    ungeneratedClips: number;
  }> {
    const [scenes, performers, studios, tags, galleries, groups, images, clips, ungeneratedClips] =
      await Promise.all([
        this.getSceneCount(),
        this.getPerformerCount(),
        this.getStudioCount(),
        this.getTagCount(),
        this.getGalleryCount(),
        this.getGroupCount(),
        this.getImageCount(),
        this.getClipCount(),
        this.getUngeneratedClipCount(),
      ]);

    return { scenes, performers, studios, tags, galleries, groups, images, clips, ungeneratedClips };
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
  public generateSceneStreams(sceneId: string, instanceId?: string): Array<{url: string; mime_type: string; label: string}> {
    // Get Stash base URL (without /graphql path) — use instance-specific config when available
    const config = instanceId
      ? stashInstanceManager.getConfig(instanceId) || stashInstanceManager.getDefaultConfig()
      : stashInstanceManager.getDefaultConfig();
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
      INNER JOIN StashScene cs ON sp.sceneId = cs.id AND sp.sceneInstanceId = cs.stashInstanceId
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
      INNER JOIN SceneGroup sg ON sp.sceneId = sg.sceneId AND sp.sceneInstanceId = sg.sceneInstanceId
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
      INNER JOIN ScenePerformer sp ON sg.sceneId = sp.sceneId AND sg.sceneInstanceId = sp.sceneInstanceId
      WHERE sp.performerId IN (${Prisma.join(performerIds)})
    `;
    logger.debug(`getGroupIdsByPerformers: ${Date.now() - startTime}ms, performers=${performerIds.length}, groups=${results.length}`);

    return new Set(results.map(r => r.groupId));
  }

  private transformScene(scene: StashScene): NormalizedScene {
    return {
      // User fields (defaults first, then override with actual values)
      ...DEFAULT_SCENE_USER_FIELDS,

      id: scene.id,
      title: scene.title || getSceneFallbackTitle(scene.filePath),
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

      // Transformed URLs with instanceId for multi-instance routing
      paths: {
        screenshot: this.transformUrl(scene.pathScreenshot, scene.stashInstanceId),
        preview: this.transformUrl(scene.pathPreview, scene.stashInstanceId),
        sprite: this.transformUrl(scene.pathSprite, scene.stashInstanceId),
        vtt: this.transformUrl(scene.pathVtt, scene.stashInstanceId),
        chapters_vtt: this.transformUrl(scene.pathChaptersVtt, scene.stashInstanceId),
        stream: this.transformUrl(scene.pathStream, scene.stashInstanceId),
        caption: this.transformUrl(scene.pathCaption, scene.stashInstanceId),
      },

      // Generate streams on-demand (no longer stored in DB)
      sceneStreams: this.generateSceneStreams(scene.id, scene.stashInstanceId),

      // Caption metadata for multi-language subtitle support
      captions: scene.captions ? JSON.parse(scene.captions) : [],

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

      // Inherited tag IDs (pre-computed at sync time)
      inheritedTagIds: scene.inheritedTagIds ? JSON.parse(scene.inheritedTagIds) : [],
    } as unknown as NormalizedScene;
  }

  /**
   * Transform scene for browse queries (no streams - generated on demand)
   */
  private transformSceneForBrowse(scene: BrowseSceneRow): NormalizedScene {
    return {
      // User fields (defaults first, then override with actual values)
      ...DEFAULT_SCENE_USER_FIELDS,

      id: scene.id,
      title: scene.title || getSceneFallbackTitle(scene.filePath),
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

      // Transformed URLs with instanceId for multi-instance routing
      paths: {
        screenshot: this.transformUrl(scene.pathScreenshot, scene.stashInstanceId),
        preview: this.transformUrl(scene.pathPreview, scene.stashInstanceId),
        sprite: this.transformUrl(scene.pathSprite, scene.stashInstanceId),
        vtt: this.transformUrl(scene.pathVtt, scene.stashInstanceId),
        chapters_vtt: this.transformUrl(scene.pathChaptersVtt, scene.stashInstanceId),
        stream: this.transformUrl(scene.pathStream, scene.stashInstanceId),
        caption: this.transformUrl(scene.pathCaption, scene.stashInstanceId),
      },

      // Empty sceneStreams for browse - generated on demand for playback
      sceneStreams: [],

      // Caption metadata for multi-language subtitle support
      captions: scene.captions ? JSON.parse(scene.captions) : [],

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

      // Inherited tag IDs (pre-computed at sync time)
      inheritedTagIds: scene.inheritedTagIds ? JSON.parse(scene.inheritedTagIds) : [],
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
        const sceneInstanceId = scene.instanceId || '';
        // Try composite key first, fall back to ID-only
        const name = studioNames.get(`${scene.studio.id}\0${sceneInstanceId}`) || studioNames.get(scene.studio.id);
        if (name) {
          (scene.studio as { id: string; name?: string }).name = name;
        }
      }
    }
  }

  /**
   * Hydrate inherited tag names on an array of scenes using a pre-fetched name map.
   * Mutates scenes in-place for performance.
   */
  private hydrateInheritedTags(scenes: NormalizedScene[], tagNames: Map<string, string>): void {
    for (const scene of scenes) {
      const inheritedTagIds = scene.inheritedTagIds;
      if (inheritedTagIds && Array.isArray(inheritedTagIds) && inheritedTagIds.length > 0) {
        const sceneInstanceId = scene.instanceId || '';
        scene.inheritedTags = inheritedTagIds.map((tagId: string) => ({
          id: tagId,
          // Try composite key first, fall back to ID-only
          name: tagNames.get(`${tagId}\0${sceneInstanceId}`) || tagNames.get(tagId) || "Unknown",
        }));
      }
    }
  }

  private transformSceneWithRelations(scene: SceneWithRelations): NormalizedScene {
    const base = this.transformScene(scene);

    // Add nested entities
    if (scene.performers) {
      base.performers = scene.performers.map((sp: ScenePerformerWithPerformer) =>
        this.transformPerformer(sp.performer)
      );
    }
    if (scene.tags) {
      base.tags = scene.tags.map((st: SceneTagWithTag) =>
        this.transformTag(st.tag)
      );
    }
    if (scene.groups) {
      base.groups = scene.groups.map((sg: SceneGroupWithGroup) => ({
        ...this.transformGroup(sg.group),
        scene_index: sg.sceneIndex,
      })) as unknown as typeof base.groups;
    }
    if (scene.galleries) {
      base.galleries = scene.galleries.map((sg: SceneGalleryWithGallery) =>
        this.transformGallery(sg.gallery)
      ) as unknown as typeof base.galleries;
    }

    // Hydrate inherited tags with full tag objects
    if (scene.inheritedTagIds) {
      const inheritedTagIds: string[] = JSON.parse(scene.inheritedTagIds);
      if (inheritedTagIds.length > 0) {
        // Look up tags in the tags array we already have, or create minimal stub
        base.inheritedTags = inheritedTagIds.map((tagId: string) => {
          // Find in existing tags or create minimal stub
          const existingTag = base.tags?.find((t) => t.id === tagId);
          return existingTag || { id: tagId, name: "Unknown" };
        });
      }
    }

    return base;
  }

  private transformPerformer(performer: PerformerInput): NormalizedPerformer {
    // Extract tags from junction table relation (if included) or empty array
    const tags = performer.tags?.map((pt: PerformerTagWithTag) => ({
      id: pt.tagId,
      name: pt.tag?.name || "Unknown",
      image_path: pt.tag?.imagePath ? this.transformUrl(pt.tag.imagePath, pt.tag.stashInstanceId) : null,
    })) || [];
    return {
      ...DEFAULT_PERFORMER_USER_FIELDS,
      id: performer.id,
      instanceId: performer.stashInstanceId,
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
      image_path: this.transformUrl(performer.imagePath, performer.stashInstanceId),
      created_at: performer.stashCreatedAt?.toISOString() ?? null,
      updated_at: performer.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedPerformer;
  }

  private transformStudio(studio: StudioInput): NormalizedStudio {
    // Extract tags from junction table relation (if included) or empty array
    const tags = studio.tags?.map((st: StudioTagWithTag) => ({
      id: st.tagId,
      name: st.tag?.name || "Unknown",
      image_path: st.tag?.imagePath ? this.transformUrl(st.tag.imagePath, st.tag.stashInstanceId) : null,
    })) || [];
    return {
      ...DEFAULT_STUDIO_USER_FIELDS,
      id: studio.id,
      instanceId: studio.stashInstanceId,
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
      image_path: this.transformUrl(studio.imagePath, studio.stashInstanceId),
      created_at: studio.stashCreatedAt?.toISOString() ?? null,
      updated_at: studio.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedStudio;
  }

  private transformTag(tag: TagInput): NormalizedTag {
    return {
      ...DEFAULT_TAG_USER_FIELDS,
      id: tag.id,
      instanceId: tag.stashInstanceId,
      name: tag.name,
      favorite: tag.favorite ?? false,
      scene_count: tag.sceneCount ?? 0,
      image_count: tag.imageCount ?? 0,
      gallery_count: tag.galleryCount ?? 0,
      performer_count: tag.performerCount ?? 0,
      studio_count: tag.studioCount ?? 0,
      group_count: tag.groupCount ?? 0,
      scene_marker_count: tag.sceneMarkerCount ?? 0,
      scene_count_via_performers: tag.sceneCountViaPerformers ?? 0,
      description: tag.description,
      aliases: tag.aliases ? JSON.parse(tag.aliases) : [],
      parents: tag.parentIds ? JSON.parse(tag.parentIds).map((id: string) => ({ id })) : [],
      image_path: this.transformUrl(tag.imagePath, tag.stashInstanceId),
      created_at: tag.stashCreatedAt?.toISOString() ?? null,
      updated_at: tag.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedTag;
  }

  private transformGroup(group: GroupInput): NormalizedGroup {
    // Extract tags from junction table relation (if included) or empty array
    const tags = group.tags?.map((gt: GroupTagWithTag) => ({
      id: gt.tagId,
      name: gt.tag?.name || "Unknown",
      image_path: gt.tag?.imagePath ? this.transformUrl(gt.tag.imagePath, gt.tag.stashInstanceId) : null,
    })) || [];
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
      front_image_path: this.transformUrl(group.frontImagePath, group.stashInstanceId),
      back_image_path: this.transformUrl(group.backImagePath, group.stashInstanceId),
      created_at: group.stashCreatedAt?.toISOString() ?? null,
      updated_at: group.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedGroup;
  }

  private transformGallery(gallery: GalleryInput): NormalizedGallery {
    const coverUrl = this.transformUrl(gallery.coverPath, gallery.stashInstanceId);
    // Extract tags from junction table relation (if included) or empty array
    // Include image_path for TooltipEntityGrid display
    const tags = gallery.tags?.map((gt: GalleryTagWithTag) => ({
      id: gt.tagId,
      name: gt.tag?.name || "Unknown",
      image_path: this.transformUrl(gt.tag?.imagePath ?? null, gt.tag?.stashInstanceId),
    })) || [];

    // Transform performers from junction table
    // Include image_path and gender for TooltipEntityGrid display
    const performers = gallery.performers?.map((gp: GalleryPerformerEntry) => ({
      id: gp.performer.id,
      name: gp.performer.name,
      gender: gp.performer.gender,
      image_path: this.transformUrl(gp.performer.imagePath, gp.performer.stashInstanceId),
    })) || [];

    // Transform scenes from junction table
    // Include minimal data for display (id, title, screenshot)
    const scenes = gallery.scenes?.map((gs: GallerySceneEntry) => ({
      id: gs.scene.id,
      title: gs.scene.title,
      paths: {
        screenshot: this.transformUrl(gs.scene.pathScreenshot, gs.scene.stashInstanceId),
      },
    })) || [];

    // Build files array for frontend title fallback (zip galleries)
    const files = gallery.fileBasename ? [{ basename: gallery.fileBasename }] : [];

    return {
      ...DEFAULT_GALLERY_USER_FIELDS,
      id: gallery.id,
      instanceId: gallery.stashInstanceId,
      title: gallery.title || getGalleryFallbackTitle(gallery.folderPath, gallery.fileBasename),
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
      // Cover as simple string URL for consistency
      cover: coverUrl,
      // Tags from junction table relation - will be hydrated with names in controller
      tags,
      // Performers from junction table
      performers,
      // Scenes from junction table
      scenes,
      created_at: gallery.stashCreatedAt?.toISOString() ?? null,
      updated_at: gallery.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedGallery;
  }

  private transformImage(image: ImageInput): TransformedImage {
    // Transform performers from junction table (include image_path and gender for display)
    const performers = (image.performers ?? []).map((ip: ImagePerformerEntry) => ({
      id: ip.performer.id,
      name: ip.performer.name,
      gender: ip.performer.gender,
      image_path: this.transformUrl(ip.performer.imagePath, ip.performer.stashInstanceId),
    }));

    // Transform tags from junction table
    const tags = (image.tags ?? []).map((it: ImageTagEntry) => ({
      id: it.tag.id,
      name: it.tag.name,
    }));

    // Transform galleries from junction table (with their performers/tags/studio for inheritance)
    const galleries = (image.galleries ?? []).map((ig: ImageGalleryEntry) => ({
      id: ig.gallery.id,
      title: ig.gallery.title,
      date: ig.gallery.date,
      details: ig.gallery.details,
      photographer: ig.gallery.photographer,
      urls: ig.gallery.urls ? JSON.parse(ig.gallery.urls) : [],
      cover: this.transformUrl(ig.gallery.coverPath, ig.gallery.stashInstanceId),
      studioId: ig.gallery.studioId,
      // Include studio object for inheritance
      studio: ig.gallery.studio ? {
        id: ig.gallery.studio.id,
        name: ig.gallery.studio.name,
      } : null,
      performers: (ig.gallery.performers ?? []).map((gp: GalleryPerformerEntry) => ({
        id: gp.performer.id,
        name: gp.performer.name,
        gender: gp.performer.gender,
        image_path: this.transformUrl(gp.performer.imagePath, gp.performer.stashInstanceId),
      })),
      tags: (ig.gallery.tags ?? []).map((gt: GalleryTagWithTag) => ({
        id: gt.tag?.id ?? gt.tagId,
        name: gt.tag?.name || "Unknown",
      })),
    }));

    // Build studio object with name if available
    const studio = image.studio ? {
      id: image.studio.id,
      name: image.studio.name,
    } : (image.studioId ? { id: image.studioId } : null);

    return {
      id: image.id,
      instanceId: image.stashInstanceId,
      title: image.title || getImageFallbackTitle(image.filePath),
      code: image.code,
      details: image.details,
      photographer: image.photographer,
      urls: image.urls ? JSON.parse(image.urls) : [],
      date: image.date,
      studio,
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

  /**
   * Transform a Stash URL/path to a proxy URL
   * @param urlOrPath - The URL or path to transform
   * @param instanceId - Optional Stash instance ID for multi-instance routing
   */
  private transformUrl(urlOrPath: string | null, instanceId?: string | null): string | null {
    if (!urlOrPath) return null;

    // If it's already a proxy URL, return as-is
    if (urlOrPath.startsWith("/api/proxy/stash")) {
      return urlOrPath;
    }

    let proxyPath: string;

    // If it's a full URL (http://...), extract path + query
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      try {
        const url = new URL(urlOrPath);
        const pathWithQuery = url.pathname + url.search;
        proxyPath = `/api/proxy/stash?path=${encodeURIComponent(pathWithQuery)}`;
      } catch {
        // If URL parsing fails, treat as path
        proxyPath = `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
      }
    } else {
      // Otherwise treat as path and encode it
      proxyPath = `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
    }

    // Add instanceId for multi-instance routing
    if (instanceId) {
      proxyPath += `&instanceId=${encodeURIComponent(instanceId)}`;
    }

    return proxyPath;
  }
}

// Export singleton instance
export const stashEntityService = new StashEntityService();
