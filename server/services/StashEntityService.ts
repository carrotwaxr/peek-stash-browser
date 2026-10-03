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
  StashPerformer,
  StashScene,
  StashTag,
} from "@prisma/client";
import prisma from "../prisma/singleton.js";
import type { NormalizedScene, SceneStream } from "../types/index.js";
import type { SceneScoringRow } from "../types/internal/queryRows.js";
import type { EntityRef } from "../utils/entityRef.js";
import { logger } from "../utils/logger.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type SceneStreamSource,
  buildSceneStreams,
  streamOptionsOf,
} from "../utils/sceneStreams.js";
import { instanceColumnClause } from "../utils/sqlClauses.js";
import { emptyToNull, parseJsonArray } from "../utils/sqlHelpers.js";
import { getSceneFallbackTitle } from "../utils/titleUtils.js";
import type { ScoringScene } from "./RecommendationScoringService.js";
import { stashInstanceManager } from "./StashInstanceManager.js";
import {
  galleryRef,
  groupRef,
  performerRef,
  tagRef,
} from "./query/nestedRefs.js";

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
  last_played_at: null,
  last_o_at: null,
};

class StashEntityService {
  // ==================== Scene Queries ====================

  /**
   * The scoring input for Recommended: every live scene the user can see
   * (the exclusion join with the instance, the allowed instances) with its
   * studio, performer and tag ids and the user's watch data on it, so the
   * scoring pass in memory reads nothing else. The junction ids come from
   * two correlated covering-index subqueries rather than a join of both
   * junctions (a performer-by-tag cross product per scene): 0.1 s against
   * 0.27 s on prod and 0.9 s against 2.4 s at 200k scenes.
   */
  async getScenesForScoring(
    userId: number,
    allowedInstanceIds: string[]
  ): Promise<ScoringScene[]> {
    const startTime = Date.now();
    const instanceFilter = instanceColumnClause(
      "s.stashInstanceId",
      allowedInstanceIds
    );

    const sql = `
      SELECT s.id, s.stashInstanceId, s.studioId, COALESCE(wh.oCount, 0) AS oCounter,
        (SELECT group_concat(sp.performerId) FROM ScenePerformer sp
          WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId) AS performerIds,
        (SELECT group_concat(st.tagId) FROM SceneTag st
          WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId) AS tagIds,
        wh.playCount, wh.lastPlayedAt
      FROM StashScene s
      LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = s.id
        AND (e.instanceId = '' OR e.instanceId = s.stashInstanceId)
      LEFT JOIN WatchHistory wh ON wh.userId = ? AND wh.instanceId = s.stashInstanceId AND wh.sceneId = s.id
      WHERE s.deletedAt IS NULL AND e.id IS NULL AND ${instanceFilter.sql}
    `;

    const rows = await prisma.$queryRawUnsafe<SceneScoringRow[]>(
      sql,
      userId,
      userId,
      ...instanceFilter.params
    );

    const result: ScoringScene[] = rows.map((row) => ({
      id: row.id,
      instanceId: row.stashInstanceId,
      studioId: row.studioId,
      performerIds: row.performerIds ? row.performerIds.split(",") : [],
      tagIds: row.tagIds ? row.tagIds.split(",") : [],
      oCounter: Number(row.oCounter),
      playCount: row.playCount ?? 0,
      lastPlayedAt: row.lastPlayedAt,
    }));

    logger.debug("getScenesForScoring", {
      userId,
      ms: Date.now() - startTime,
      count: result.length,
    });

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
    await this.hydrateNames([scene], instanceId);

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
    await this.hydrateNames(scenes, instanceId);

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
   * Get total performer count
   */
  async getPerformerCount(): Promise<number> {
    return prisma.stashPerformer.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Studio Queries ====================

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
   * Get total tag count
   */
  async getTagCount(): Promise<number> {
    return prisma.stashTag.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Gallery Queries ====================

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
   * Get total group count
   */
  async getGroupCount(): Promise<number> {
    return prisma.stashGroup.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Image Queries ====================

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
    const options = streamOptionsOf(source);
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
      title: emptyToNull(scene.title) ?? getSceneFallbackTitle(scene.filePath),
      code: scene.code,
      date: scene.date,
      details: scene.details,
      organized: scene.organized,

      // URLs
      urls: parseJsonArray(scene.urls),

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
      captions: parseJsonArray<{ language_code: string; caption_type: string }>(
        scene.captions
      ),

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
      inheritedTagIds: parseJsonArray(scene.inheritedTagIds),
    };
  }

  /**
   * Names the scenes' studios and inherited tags, read for this request from
   * the ids the scenes hold (one instance), so a rename in Stash shows on the
   * next read. Mutates the scenes in place.
   */
  private async hydrateNames(
    scenes: NormalizedScene[],
    instanceId: string
  ): Promise<void> {
    const studioIds = new Set<string>();
    const tagIds = new Set<string>();
    for (const scene of scenes) {
      if (scene.studio?.id) studioIds.add(scene.studio.id);
      for (const tagId of scene.inheritedTagIds ?? []) tagIds.add(tagId);
    }
    const [studios, tags] = await Promise.all([
      studioIds.size === 0
        ? []
        : prisma.stashStudio.findMany({
            where: {
              id: { in: [...studioIds] },
              stashInstanceId: instanceId,
              deletedAt: null,
            },
            select: { id: true, name: true },
          }),
      tagIds.size === 0
        ? []
        : prisma.stashTag.findMany({
            where: {
              id: { in: [...tagIds] },
              stashInstanceId: instanceId,
              deletedAt: null,
            },
            select: { id: true, name: true },
          }),
    ]);
    const studioNames = new Map(studios.map((r) => [r.id, r.name]));
    const tagNames = new Map(tags.map((r) => [r.id, r.name]));

    for (const scene of scenes) {
      const name = scene.studio ? studioNames.get(scene.studio.id) : undefined;
      if (scene.studio && name) {
        (scene.studio as { id: string; name?: string }).name = name;
      }
      const inheritedTagIds = scene.inheritedTagIds ?? [];
      if (inheritedTagIds.length > 0) {
        scene.inheritedTags = inheritedTagIds.map((tagId) => ({
          id: tagId,
          instanceId,
          name: tagNames.get(tagId) ?? "Unknown",
        }));
      }
    }
  }

  private transformSceneWithRelations(
    scene: SceneWithRelations
  ): NormalizedScene {
    const base = this.transformScene(scene);

    // Nested entities take the list rows' ref shapes: Stash's favorite and
    // rating belong to the Stash user, never to the viewer
    if (scene.performers) {
      base.performers = scene.performers.map(
        (sp: ScenePerformerWithPerformer) =>
          performerRef(sp.performer, sp.performer.stashInstanceId)
      );
    }
    if (scene.tags) {
      base.tags = scene.tags.map((st: SceneTagWithTag) =>
        tagRef(st.tag, st.tag.stashInstanceId)
      );
    }
    if (scene.groups) {
      base.groups = scene.groups.map((sg: SceneGroupWithGroup) => ({
        ...groupRef(sg.group, sg.group.stashInstanceId),
        scene_index: sg.sceneIndex,
      }));
    }
    if (scene.galleries) {
      base.galleries = scene.galleries.map((sg: SceneGalleryWithGallery) =>
        galleryRef(sg.gallery, sg.gallery.stashInstanceId)
      );
    }

    // Hydrate inherited tags with full tag objects
    if (scene.inheritedTagIds) {
      const inheritedTagIds = parseJsonArray(scene.inheritedTagIds);
      if (inheritedTagIds.length > 0) {
        // Look up tags in the tags array we already have, or create minimal stub
        base.inheritedTags = inheritedTagIds.map((tagId: string) => {
          // Find in existing tags or create minimal stub
          const existingTag = base.tags.find((t) => t.id === tagId);
          return (
            existingTag ?? {
              id: tagId,
              instanceId: scene.stashInstanceId,
              name: "Unknown",
            }
          );
        });
      }
    }

    return base;
  }
}

// Export singleton instance
export const stashEntityService = new StashEntityService();
