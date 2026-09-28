/**
 * Stash Entity Service
 *
 * Provides methods to query Stash entities from SQLite database.
 * Replaces direct StashCacheManager access with database queries.
 *
 * This service maintains compatibility with existing controller patterns
 * while using the new SQLite-backed architecture.
 */
import type {
  StashGallery,
  StashGroup,
  StashImage,
  StashPerformer,
  StashScene,
  StashStudio,
  StashTag,
} from "@prisma/client";
import prisma from "../prisma/singleton.js";
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedImage,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
  SceneScoringData,
  SceneStream,
} from "../types/index.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import { logger } from "../utils/logger.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  STREAM_RESOLUTIONS,
  type StreamResolution,
  buildSceneStreams,
  inferStashStreamOptions,
} from "../utils/sceneStreams.js";
import {
  getGalleryFallbackTitle,
  getImageFallbackTitle,
  getSceneFallbackTitle,
} from "../utils/titleUtils.js";
import { stashInstanceManager } from "./StashInstanceManager.js";

/** One "Scenes like this" candidate: a scene on the seed's instance. */
export interface SimilarSceneCandidate {
  sceneId: string;
  instanceId: string;
  weight: number;
  date: string | null;
}

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

/** The stored stream choices and file fields a scene's stream list is built from */
type SceneStreamSource = Pick<
  StashScene,
  | "streamDirect"
  | "streamMkv"
  | "streamResolutions"
  | "filePath"
  | "fileAudioCodec"
  | "fileWidth"
  | "fileHeight"
>;

/** Transformed image output shape (returned by transformImage) */
// TransformedImage is a subset of NormalizedImage (without user activity fields).
// Using NormalizedImage directly as return type since user fields are optional.
type TransformedImage = NormalizedImage;

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
  // Per user (it leaves out the sub-groups they cannot see): GroupQueryBuilder
  // sets it on the list and detail rows
  sub_group_count: 0,
};

class StashEntityService {
  // In-memory cache for studio name lookups (cleared on cache invalidation)
  private studioNameCache: Map<string, string> | null = null;
  private studioNameCachePromise: Promise<Map<string, string>> | null = null;

  // In-memory cache for tag name lookups (for inherited tag hydration)
  private tagNameCache: Map<string, string> | null = null;
  private tagNameCachePromise: Promise<Map<string, string>> | null = null;

  // ==================== Scene Queries ====================

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

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        stashInstanceId: string;
        studioId: string | null;
        oCounter: number;
        date: string | null;
        performerIds: string;
        tagIds: string;
      }>
    >(sql);

    const result: SceneScoringData[] = rows.map((row) => ({
      id: row.id,
      instanceId: row.stashInstanceId,
      studioId: row.studioId,
      performerIds: row.performerIds
        ? row.performerIds.split(",").filter(Boolean)
        : [],
      tagIds: row.tagIds ? row.tagIds.split(",").filter(Boolean) : [],
      oCounter: row.oCounter || 0,
      date: row.date,
    }));

    logger.debug(
      `getScenesForScoring: ${Date.now() - startTime}ms, count=${result.length}`
    );

    return result;
  }

  /**
   * The candidates for "Scenes like this": up to maxCandidates scenes on
   * the seed's instance that share a performer (3 points each), its studio
   * (2) or a tag (1 each) with the seed, live, and not excluded for the
   * user, sorted by total weight, then date, then id.
   *
   * Every branch joins within the seed's instance, so the candidates are
   * all on it and the seed's own access check covers the allowed
   * instances. The exclusions are an anti-join on UserExcludedEntity, never
   * a bound list: a user with 100k excluded scenes costs nothing extra.
   */
  async getSimilarSceneCandidates(
    seed: EntityRef,
    userId: number,
    maxCandidates: number = 500
  ): Promise<SimilarSceneCandidate[]> {
    const startTime = Date.now();

    const sql = `
      WITH candidates AS (
        SELECT sp2.sceneId, sp2.sceneInstanceId AS inst, 3 AS weight
        FROM ScenePerformer sp1
        JOIN ScenePerformer sp2 ON sp2.performerId = sp1.performerId AND sp2.performerInstanceId = sp1.performerInstanceId
        WHERE sp1.sceneId = ? AND sp1.sceneInstanceId = ?
        UNION ALL
        SELECT s2.id, s2.stashInstanceId, 2
        FROM StashScene s1
        JOIN StashScene s2 ON s2.studioId = s1.studioId AND s2.stashInstanceId = s1.stashInstanceId
        WHERE s1.id = ? AND s1.stashInstanceId = ? AND s1.studioId IS NOT NULL
        UNION ALL
        SELECT st2.sceneId, st2.sceneInstanceId, 1
        FROM SceneTag st1
        JOIN SceneTag st2 ON st2.tagId = st1.tagId AND st2.tagInstanceId = st1.tagInstanceId
        WHERE st1.sceneId = ? AND st1.sceneInstanceId = ?
      ), scored AS (
        SELECT sceneId, inst, SUM(weight) AS totalWeight FROM candidates
        WHERE NOT (sceneId = ? AND inst = ?)
        GROUP BY sceneId, inst
      )
      SELECT c.sceneId, c.inst AS instanceId, c.totalWeight, s.date
      FROM scored c
      JOIN StashScene s ON s.id = c.sceneId AND s.stashInstanceId = c.inst AND s.deletedAt IS NULL
      LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = c.sceneId
        AND (e.instanceId = '' OR e.instanceId = c.inst)
      WHERE e.id IS NULL
      ORDER BY c.totalWeight DESC, s.date DESC, s.id
      LIMIT ?
    `;

    const { id, instanceId } = seed;
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        sceneId: string;
        instanceId: string;
        totalWeight: bigint; // SUM of integers
        date: string | null;
      }>
    >(
      sql,
      id,
      instanceId, // performers
      id,
      instanceId, // studio
      id,
      instanceId, // tags
      id,
      instanceId, // never the seed itself
      userId,
      maxCandidates
    );

    const result = rows.map((row) => ({
      sceneId: row.sceneId,
      instanceId: row.instanceId,
      weight: Number(row.totalWeight),
      date: row.date,
    }));

    logger.debug(
      `getSimilarSceneCandidates: ${Date.now() - startTime}ms, candidates=${result.length}`
    );

    return result;
  }

  /**
   * Get scene by ID (includes related entities)
   * @param id - Scene ID
   * @param instanceId - Stash instance ID for multi-instance disambiguation
   */
  async getScene(
    id: string,
    instanceId: string
  ): Promise<NormalizedScene | null> {
    const cached = await prisma.stashScene.findFirst({
      where: {
        id,
        deletedAt: null,
        stashInstanceId: instanceId,
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
   * Get scenes by IDs with full relations (performers, tags, studio, groups, galleries)
   * @param ids - Array of scene IDs
   * @param instanceId - Stash instance ID for multi-instance disambiguation
   */
  async getScenesByIdsWithRelations(
    ids: string[],
    instanceId: string
  ): Promise<NormalizedScene[]> {
    if (ids.length === 0) return [];

    const cached = await prisma.stashScene.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        stashInstanceId: instanceId,
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

    logger.info(
      `getAllPerformers: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`
    );

    return result;
  }

  /**
   * Get performer by ID with computed counts
   * @param id - Performer ID
   * @param instanceId - Stash instance ID for multi-instance disambiguation
   */
  async getPerformer(
    id: string,
    instanceId: string
  ): Promise<NormalizedPerformer | null> {
    const cached = await prisma.stashPerformer.findFirst({
      where: {
        id,
        deletedAt: null,
        stashInstanceId: instanceId,
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
    const groupCountResult = await prisma.$queryRaw<{ count: bigint }[]>`
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
   * Get total performer count
   */
  async getPerformerCount(): Promise<number> {
    return prisma.stashPerformer.count({
      where: { deletedAt: null },
    });
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
          map.set(entityKey(s.id, s.stashInstanceId), s.name);
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
          map.set(entityKey(t.id, t.stashInstanceId), t.name);
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

    logger.info(
      `getAllStudios: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`
    );

    return result;
  }

  /**
   * Get studio by ID with computed counts
   * @param id - Studio ID
   * @param instanceId - Stash instance ID for multi-instance disambiguation
   */
  async getStudio(
    id: string,
    instanceId: string
  ): Promise<NormalizedStudio | null> {
    const cached = await prisma.stashStudio.findFirst({
      where: {
        id,
        deletedAt: null,
        stashInstanceId: instanceId,
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
    const performerCountResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT sp.performerId) as count
      FROM ScenePerformer sp
      INNER JOIN StashScene s ON sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
      WHERE s.studioId = ${id}
        AND s.stashInstanceId = ${studioInstanceId}
        AND s.deletedAt IS NULL
    `;
    const performerCount = Number(performerCountResult[0]?.count ?? 0);

    // Get group count by counting distinct groups from scenes
    const groupCountResult = await prisma.$queryRaw<{ count: bigint }[]>`
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

    logger.info(
      `getAllTags: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`
    );

    return result;
  }

  /**
   * Get tag by ID with computed counts
   * @param id - Tag ID
   * @param instanceId - Stash instance ID for multi-instance disambiguation
   */
  async getTag(id: string, instanceId: string): Promise<NormalizedTag | null> {
    const cached = await prisma.stashTag.findFirst({
      where: {
        id,
        deletedAt: null,
        stashInstanceId: instanceId,
      },
    });

    if (!cached) return null;

    // Compute counts from junction tables (except imageCount which uses stored inherited value)
    const tagInstanceId = cached.stashInstanceId;
    const [sceneCount, galleryCount, performerCount, studioCount, groupCount] =
      await Promise.all([
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
   * @param instanceId - Stash instance ID for multi-instance support
   */
  async getGallery(
    id: string,
    instanceId: string
  ): Promise<NormalizedGallery | null> {
    const cached = await prisma.stashGallery.findFirst({
      where: {
        id,
        deletedAt: null,
        stashInstanceId: instanceId,
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
   * @param instanceId - Stash instance ID for multi-instance disambiguation
   */
  async getGroup(
    id: string,
    instanceId: string
  ): Promise<NormalizedGroup | null> {
    const cached = await prisma.stashGroup.findFirst({
      where: {
        id,
        deletedAt: null,
        stashInstanceId: instanceId,
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
    const performerCountResult = await prisma.$queryRaw<{ count: bigint }[]>`
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
   * Get image by ID with relations
   * @param id - Image ID
   * @param instanceId - Stash instance ID for multi-instance disambiguation
   */
  async getImage(
    id: string,
    instanceId: string
  ): Promise<NormalizedImage | null> {
    const cached = await prisma.stashImage.findFirst({
      where: {
        id,
        deletedAt: null,
        stashInstanceId: instanceId,
      },
      include: this.imageIncludes,
    });

    if (!cached) return null;
    return this.transformImage(cached as unknown as ImageInput);
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
    const [
      scenes,
      performers,
      studios,
      tags,
      galleries,
      groups,
      images,
      clips,
      ungeneratedClips,
    ] = await Promise.all([
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

    return {
      scenes,
      performers,
      studios,
      tags,
      galleries,
      groups,
      images,
      clips,
      ungeneratedClips,
    };
  }

  /**
   * The scene `SyncState` row of each enabled instance (the ones the
   * instance manager has loaded); a disabled or deleted instance's row is
   * left out.
   */
  private async enabledSceneSyncStates() {
    const instanceIds = stashInstanceManager.getAllEnabled().map((i) => i.id);
    return prisma.syncState.findMany({
      where: { entityType: "scene", stashInstanceId: { in: instanceIds } },
    });
  }

  /**
   * The cache is ready once some enabled instance has finished its first
   * sync, its users' exclusions computed (`StashInstance.firstSyncedAt`),
   * for `/api/stats`. The library routes check each user's own instances
   * instead (requireCacheReady).
   */
  async isReady(): Promise<boolean> {
    const ready = await prisma.stashInstance.findFirst({
      where: { enabled: true, firstSyncedAt: { not: null } },
      select: { id: true },
    });
    return ready !== null;
  }

  /**
   * When the cache was last refreshed, for display: the latest scene sync,
   * full or incremental, of any enabled instance.
   */
  async getLastRefreshed(): Promise<Date | null> {
    const states = await this.enabledSceneSyncStates();
    let latest: Date | null = null;
    for (const state of states) {
      for (const time of [
        state.lastFullSyncActual,
        state.lastIncrementalSyncActual,
      ]) {
        if (time && (!latest || time > latest)) latest = time;
      }
    }
    return latest;
  }

  // ==================== Data Transform Helpers ====================

  /**
   * Build a scene's stream list as Peek proxy paths, in Stash's order.
   * Uses the choices Stash recorded at sync (Direct, MKV, resolution tiers)
   * when present, else Stash's rules applied to the cached file fields.
   * The paths carry no Stash host and no API key.
   */
  public generateSceneStreams(
    sceneId: string,
    instanceId: string,
    source: SceneStreamSource
  ): SceneStream[] {
    const { streamDirect, streamMkv, streamResolutions } = source;
    const options =
      streamDirect != null && streamMkv != null && streamResolutions != null
        ? {
            direct: streamDirect,
            mkv: streamMkv,
            resolutions: streamResolutions
              .split(",")
              .filter((r): r is StreamResolution =>
                (STREAM_RESOLUTIONS as readonly string[]).includes(r)
              ),
          }
        : inferStashStreamOptions({
            path: source.filePath,
            audioCodec: source.fileAudioCodec,
            width: source.fileWidth,
            height: source.fileHeight,
          });
    return buildSceneStreams(sceneId, instanceId, options);
  }

  /**
   * The stream list for one scene on one instance, for the Scene page.
   * One primary-key lookup; [] when the scene is missing or deleted.
   */
  public async getPlaybackStreams(
    sceneId: string,
    instanceId: string
  ): Promise<SceneStream[]> {
    const source = await prisma.stashScene.findFirst({
      where: { id: sceneId, stashInstanceId: instanceId, deletedAt: null },
      select: {
        streamDirect: true,
        streamMkv: true,
        streamResolutions: true,
        filePath: true,
        fileAudioCodec: true,
        fileWidth: true,
        fileHeight: true,
      },
    });
    if (!source) return [];
    return this.generateSceneStreams(sceneId, instanceId, source);
  }

  private transformScene(scene: StashScene): NormalizedScene {
    return {
      // User fields (defaults first, then override with actual values)
      ...DEFAULT_SCENE_USER_FIELDS,

      id: scene.id,
      instanceId: scene.stashInstanceId,
      title: scene.title || getSceneFallbackTitle(scene.filePath),
      code: scene.code,
      date: scene.date,
      details: scene.details,
      rating100: scene.rating100,
      organized: scene.organized,

      // URLs
      urls: scene.urls ? (JSON.parse(scene.urls) as string[]) : [],

      // File metadata
      files: scene.filePath
        ? [
            {
              path: scene.filePath,
              duration: scene.duration,
              bit_rate: scene.fileBitRate,
              frame_rate: scene.fileFrameRate,
              width: scene.fileWidth,
              height: scene.fileHeight,
              video_codec: scene.fileVideoCodec,
              audio_codec: scene.fileAudioCodec,
              size: scene.fileSize ? Number(scene.fileSize) : null,
            },
          ]
        : [],

      // Transformed URLs with instanceId for multi-instance routing
      paths: {
        screenshot: toProxyUrl(scene.pathScreenshot, scene.stashInstanceId),
        preview: toProxyUrl(scene.pathPreview, scene.stashInstanceId),
        sprite: toProxyUrl(
          scene.pathSprite ? `/scene/${scene.id}/vtt/sprite` : null,
          scene.stashInstanceId
        ),
        vtt: toProxyUrl(
          scene.pathVtt ? `/scene/${scene.id}/vtt/thumbs` : null,
          scene.stashInstanceId
        ),
        chapters_vtt: toProxyUrl(scene.pathChaptersVtt, scene.stashInstanceId),
        // Always null: Peek serves streams and captions through its own
        // routes, and the media proxy refuses both Stash routes
        stream: null,
        caption: null,
      },

      // Built from the stored stream choices, as keyless Peek proxy paths
      sceneStreams: this.generateSceneStreams(
        scene.id,
        scene.stashInstanceId,
        scene
      ),

      // Caption metadata for multi-language subtitle support
      captions: scene.captions
        ? (JSON.parse(scene.captions) as {
            language_code: string;
            caption_type: string;
          }[])
        : [],

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
      inheritedTagIds: scene.inheritedTagIds
        ? (JSON.parse(scene.inheritedTagIds) as string[])
        : [],
    };
  }

  /**
   * Hydrate studio names on an array of scenes using a pre-fetched name map.
   * Mutates scenes in-place for performance.
   * This is a workaround until StashScene has a proper studio relation in Prisma.
   */
  private hydrateStudioNames(
    scenes: NormalizedScene[],
    studioNames: Map<string, string>
  ): void {
    for (const scene of scenes) {
      if (scene.studio?.id) {
        const sceneInstanceId = scene.instanceId || "";
        // Try composite key first, fall back to ID-only
        const name =
          studioNames.get(entityKey(scene.studio.id, sceneInstanceId)) ??
          studioNames.get(scene.studio.id);
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
  private hydrateInheritedTags(
    scenes: NormalizedScene[],
    tagNames: Map<string, string>
  ): void {
    for (const scene of scenes) {
      const inheritedTagIds = scene.inheritedTagIds;
      if (
        inheritedTagIds &&
        Array.isArray(inheritedTagIds) &&
        inheritedTagIds.length > 0
      ) {
        const sceneInstanceId = scene.instanceId || "";
        scene.inheritedTags = inheritedTagIds.map((tagId: string) => ({
          id: tagId,
          // Try composite key first, fall back to ID-only
          name:
            tagNames.get(entityKey(tagId, sceneInstanceId)) ??
            tagNames.get(tagId) ??
            "Unknown",
        }));
      }
    }
  }

  private transformSceneWithRelations(
    scene: SceneWithRelations
  ): NormalizedScene {
    const base = this.transformScene(scene);

    // Add nested entities
    if (scene.performers) {
      base.performers = scene.performers.map(
        (sp: ScenePerformerWithPerformer) =>
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
      }));
    }
    if (scene.galleries) {
      base.galleries = scene.galleries.map((sg: SceneGalleryWithGallery) =>
        this.transformGallery(sg.gallery)
      );
    }

    // Hydrate inherited tags with full tag objects
    if (scene.inheritedTagIds) {
      const inheritedTagIds = JSON.parse(scene.inheritedTagIds) as string[];
      if (inheritedTagIds.length > 0) {
        // Look up tags in the tags array we already have, or create minimal stub
        base.inheritedTags = inheritedTagIds.map((tagId: string) => {
          // Find in existing tags or create minimal stub
          const existingTag = base.tags?.find((t) => t.id === tagId);
          return existingTag ?? { id: tagId, name: "Unknown" };
        });
      }
    }

    return base;
  }

  private transformPerformer(performer: PerformerInput): NormalizedPerformer {
    // Extract tags from junction table relation (if included) or empty array
    const tags =
      performer.tags?.map((pt: PerformerTagWithTag) => ({
        id: pt.tagId,
        name: pt.tag?.name || "Unknown",
        image_path: pt.tag?.imagePath
          ? toProxyUrl(pt.tag.imagePath, pt.tag.stashInstanceId)
          : null,
      })) ?? [];
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
      alias_list: performer.aliasList
        ? (JSON.parse(performer.aliasList) as string[])
        : [],
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
      image_path: toProxyUrl(performer.imagePath, performer.stashInstanceId),
      created_at: performer.stashCreatedAt?.toISOString() ?? null,
      updated_at: performer.stashUpdatedAt?.toISOString() ?? null,
    };
  }

  private transformStudio(studio: StudioInput): NormalizedStudio {
    // Extract tags from junction table relation (if included) or empty array
    const tags =
      studio.tags?.map((st: StudioTagWithTag) => ({
        id: st.tagId,
        name: st.tag?.name || "Unknown",
        image_path: st.tag?.imagePath
          ? toProxyUrl(st.tag.imagePath, st.tag.stashInstanceId)
          : null,
      })) ?? [];
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
      image_path: toProxyUrl(studio.imagePath, studio.stashInstanceId),
      created_at: studio.stashCreatedAt?.toISOString() ?? null,
      updated_at: studio.stashUpdatedAt?.toISOString() ?? null,
    };
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
      aliases: tag.aliases ? (JSON.parse(tag.aliases) as string[]) : [],
      parents: tag.parentIds
        ? (JSON.parse(tag.parentIds) as string[]).map((id: string) => ({ id }))
        : [],
      image_path: toProxyUrl(tag.imagePath, tag.stashInstanceId),
      created_at: tag.stashCreatedAt?.toISOString() ?? null,
      updated_at: tag.stashUpdatedAt?.toISOString() ?? null,
    };
  }

  private transformGroup(group: GroupInput): NormalizedGroup {
    // Extract tags from junction table relation (if included) or empty array
    const tags =
      group.tags?.map((gt: GroupTagWithTag) => ({
        id: gt.tagId,
        name: gt.tag?.name || "Unknown",
        image_path: gt.tag?.imagePath
          ? toProxyUrl(gt.tag.imagePath, gt.tag.stashInstanceId)
          : null,
      })) ?? [];
    return {
      ...DEFAULT_GROUP_USER_FIELDS,
      id: group.id,
      instanceId: group.stashInstanceId,
      name: group.name,
      date: group.date,
      studio: group.studioId ? { id: group.studioId } : null,
      rating100: group.rating100,
      duration: group.duration,
      scene_count: group.sceneCount ?? 0,
      performer_count: group.performerCount ?? 0,
      director: group.director,
      synopsis: group.synopsis,
      urls: group.urls ? (JSON.parse(group.urls) as string[]) : [],
      // Tags from junction table relation - will be hydrated with names in controller
      tags,
      front_image_path: toProxyUrl(group.frontImagePath, group.stashInstanceId),
      back_image_path: toProxyUrl(group.backImagePath, group.stashInstanceId),
      created_at: group.stashCreatedAt?.toISOString() ?? null,
      updated_at: group.stashUpdatedAt?.toISOString() ?? null,
    };
  }

  private transformGallery(gallery: GalleryInput): NormalizedGallery {
    const coverUrl = toProxyUrl(gallery.coverPath, gallery.stashInstanceId);
    // Extract tags from junction table relation (if included) or empty array
    // Include image_path for TooltipEntityGrid display
    const tags =
      gallery.tags?.map((gt: GalleryTagWithTag) => ({
        id: gt.tagId,
        name: gt.tag?.name || "Unknown",
        image_path: gt.tag
          ? toProxyUrl(gt.tag.imagePath, gt.tag.stashInstanceId)
          : null,
      })) ?? [];

    // Transform performers from junction table
    // Include image_path and gender for TooltipEntityGrid display
    const performers =
      gallery.performers?.map((gp: GalleryPerformerEntry) => ({
        id: gp.performer.id,
        name: gp.performer.name,
        gender: gp.performer.gender,
        image_path: toProxyUrl(
          gp.performer.imagePath,
          gp.performer.stashInstanceId
        ),
      })) ?? [];

    // Transform scenes from junction table
    // Include minimal data for display (id, title, screenshot)
    const scenes =
      gallery.scenes?.map((gs: GallerySceneEntry) => ({
        id: gs.scene.id,
        title: gs.scene.title,
        paths: {
          screenshot: toProxyUrl(
            gs.scene.pathScreenshot,
            gs.scene.stashInstanceId
          ),
        },
      })) ?? [];

    // Build files array for frontend title fallback (zip galleries)
    const files = gallery.fileBasename
      ? [{ basename: gallery.fileBasename }]
      : [];

    return {
      ...DEFAULT_GALLERY_USER_FIELDS,
      id: gallery.id,
      instanceId: gallery.stashInstanceId,
      title:
        gallery.title ||
        getGalleryFallbackTitle(gallery.folderPath, gallery.fileBasename),
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
    };
  }

  private transformImage(image: ImageInput): TransformedImage {
    // Transform performers from junction table (include image_path and gender for display)
    const performers = (image.performers ?? []).map(
      (ip: ImagePerformerEntry) => ({
        id: ip.performer.id,
        name: ip.performer.name,
        gender: ip.performer.gender,
        image_path: toProxyUrl(
          ip.performer.imagePath,
          ip.performer.stashInstanceId
        ),
      })
    );

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
      urls: ig.gallery.urls ? (JSON.parse(ig.gallery.urls) as string[]) : [],
      cover: toProxyUrl(ig.gallery.coverPath, ig.gallery.stashInstanceId),
      studioId: ig.gallery.studioId,
      // Include studio object for inheritance
      studio: ig.gallery.studio
        ? {
            id: ig.gallery.studio.id,
            name: ig.gallery.studio.name,
          }
        : null,
      performers: (ig.gallery.performers ?? []).map(
        (gp: GalleryPerformerEntry) => ({
          id: gp.performer.id,
          name: gp.performer.name,
          gender: gp.performer.gender,
          image_path: toProxyUrl(
            gp.performer.imagePath,
            gp.performer.stashInstanceId
          ),
        })
      ),
      tags: (ig.gallery.tags ?? []).map((gt: GalleryTagWithTag) => ({
        id: gt.tag?.id ?? gt.tagId,
        name: gt.tag?.name || "Unknown",
      })),
    }));

    // Build studio object with name if available
    const studio = image.studio
      ? {
          id: image.studio.id,
          name: image.studio.name,
        }
      : image.studioId
        ? { id: image.studioId }
        : null;

    return {
      id: image.id,
      instanceId: image.stashInstanceId,
      title: image.title || getImageFallbackTitle(image.filePath),
      code: image.code,
      details: image.details,
      photographer: image.photographer,
      urls: image.urls ? (JSON.parse(image.urls) as string[]) : [],
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
      files: image.filePath
        ? [
            {
              path: image.filePath,
              width: image.width,
              height: image.height,
              size: image.fileSize ? Number(image.fileSize) : null,
            },
          ]
        : [],
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
}

// Export singleton instance
export const stashEntityService = new StashEntityService();
