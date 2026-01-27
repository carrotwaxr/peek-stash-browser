import type {
  TypedAuthRequest,
  TypedResponse,
  FindScenesRequest,
  FindScenesResponse,
  FindSimilarScenesParams,
  FindSimilarScenesQuery,
  FindSimilarScenesResponse,
  GetRecommendedScenesQuery,
  GetRecommendedScenesResponse,
  UpdateSceneParams,
  UpdateSceneRequest,
  UpdateSceneResponse,
  ApiErrorResponse,
} from "../../types/api/index.js";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import {
  buildDerivedWeightsFromScoringData,
  buildImplicitWeightsFromRankings,
  scoreScoringDataByPreferences,
  countUserCriteria,
  hasAnyCriteria,
  type LightweightEntityPreferences,
  type SceneRatingInput,
  type EntityRankingData,
} from "../../services/RecommendationScoringService.js";
import type { NormalizedScene, PeekSceneFilter } from "../../types/index.js";
import { isSceneStreamable } from "../../utils/codecDetection.js";
import { expandStudioIds, expandTagIds } from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

// Feature flag for SQL query builder
const USE_SQL_QUERY_BUILDER = process.env.USE_SQL_QUERY_BUILDER !== "false";

/**
 * Seeded random number generator for consistent shuffling per user
 * Uses a simple LCG (Linear Congruential Generator) algorithm
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Generate next random number between 0 and 1
   */
  next(): number {
    // LCG parameters (same as java.util.Random)
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /**
   * Generate random integer between 0 (inclusive) and max (exclusive)
   */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
}

/**
 * Merge user-specific data into scenes
 *
 * PERFORMANCE: When fetching data for a small number of scenes (< 100),
 * we filter by sceneId to avoid loading entire watch history tables.
 * For larger sets, we load all data and use Map lookups for efficiency.
 */
export async function mergeScenesWithUserData(
  scenes: NormalizedScene[],
  userId: number
): Promise<NormalizedScene[]> {
  // Extract scene IDs for targeted queries when dealing with small sets
  const sceneIds = scenes.map((s) => s.id);
  const useTargetedQuery = sceneIds.length < 100;

  // Fetch user data in parallel
  // For small scene sets, filter by sceneId to avoid loading full tables
  const [
    watchHistory,
    sceneRatings,
    performerRatings,
    studioRatings,
    tagRatings,
  ] = await Promise.all([
    prisma.watchHistory.findMany({
      where: useTargetedQuery
        ? { userId, sceneId: { in: sceneIds } }
        : { userId },
    }),
    prisma.sceneRating.findMany({
      where: useTargetedQuery
        ? { userId, sceneId: { in: sceneIds } }
        : { userId },
    }),
    // Performer/studio/tag ratings are kept as full loads since they're
    // used for nested entity favorites across all scenes
    prisma.performerRating.findMany({ where: { userId } }),
    prisma.studioRating.findMany({ where: { userId } }),
    prisma.tagRating.findMany({ where: { userId } }),
  ]);

  // Create lookup maps for O(1) access
  const watchMap = new Map(
    watchHistory.map((wh) => {
      const oHistory = Array.isArray(wh.oHistory)
        ? wh.oHistory
        : JSON.parse((wh.oHistory as string) || "[]");
      const playHistory = Array.isArray(wh.playHistory)
        ? wh.playHistory
        : JSON.parse((wh.playHistory as string) || "[]");

      return [
        wh.sceneId,
        {
          o_counter: wh.oCount || 0,
          play_count: wh.playCount || 0,
          play_duration: wh.playDuration || 0,
          resume_time: wh.resumeTime || 0,
          play_history: playHistory,
          o_history: oHistory,
          last_played_at:
            playHistory.length > 0 ? playHistory[playHistory.length - 1] : null,
          last_o_at: oHistory.length > 0 ? oHistory[oHistory.length - 1] : null,
        },
      ];
    })
  );

  const ratingMap = new Map(
    sceneRatings.map((r) => [
      r.sceneId,
      {
        rating: r.rating,
        rating100: r.rating, // Alias for consistency with Stash API
        favorite: r.favorite,
      },
    ])
  );

  // Create favorite lookup sets for nested entities
  const performerFavorites = new Set(
    performerRatings.filter((r) => r.favorite).map((r) => r.performerId)
  );
  const studioFavorites = new Set(
    studioRatings.filter((r) => r.favorite).map((r) => r.studioId)
  );
  const tagFavorites = new Set(
    tagRatings.filter((r) => r.favorite).map((r) => r.tagId)
  );

  // Merge data and update nested entity favorites
  return scenes.map((scene) => {
    const mergedScene = {
      ...scene,
      ...watchMap.get(scene.id),
      ...ratingMap.get(scene.id),
    };

    // Update favorite status for nested performers
    if (mergedScene.performers && Array.isArray(mergedScene.performers)) {
      mergedScene.performers = mergedScene.performers.map((p) => ({
        ...p,
        favorite: performerFavorites.has(p.id),
      }));
    }

    // Update favorite status for studio
    if (mergedScene.studio) {
      mergedScene.studio = {
        ...mergedScene.studio,
        favorite: studioFavorites.has(mergedScene.studio.id),
      };
    }

    // Update favorite status for nested tags
    if (mergedScene.tags && Array.isArray(mergedScene.tags)) {
      mergedScene.tags = mergedScene.tags.map((t) => ({
        ...t,
        favorite: tagFavorites.has(t.id),
      }));
    }

    return mergedScene;
  });
}

/**
 * Add streamability information to scenes
 * This adds codec detection metadata to determine if scenes can be directly played
 * in browsers without transcoding
 */
export function addStreamabilityInfo(
  scenes: NormalizedScene[]
): NormalizedScene[] {
  return scenes.map((scene) => {
    const streamabilityInfo = isSceneStreamable(scene);
    const stashUrl = buildStashEntityUrl('scene', scene.id);

    return {
      ...scene,
      isStreamable: streamabilityInfo.isStreamable,
      streamabilityReasons: streamabilityInfo.reasons,
      stashUrl,
    };
  });
}

/**
 * Apply quick scene filters (don't require merged user data)
 * These filters only access data already present in the scene object from cache
 */
export async function applyQuickSceneFilters(
  scenes: NormalizedScene[],
  filters: PeekSceneFilter | null | undefined
): Promise<NormalizedScene[]> {
  if (!filters) return scenes;

  let filtered = scenes;

  // Filter by IDs (for detail pages)
  if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
    const idSet = new Set(filters.ids);
    filtered = filtered.filter((s) => idSet.has(s.id));
    // Populate sceneStreams for detail views (browse queries return empty streams for performance)
    filtered = filtered.map((s) => ({
      ...s,
      sceneStreams: s.sceneStreams?.length ? s.sceneStreams : stashEntityService.generateSceneStreams(s.id),
    }));
  }

  // Filter by performers
  if (filters.performers) {
    const { value: performerIds, modifier } = filters.performers;
    if (!performerIds || performerIds.length === 0) return filtered;
    filtered = filtered.filter((s) => {
      const scenePerformerIds = (s.performers || []).map((p) => String(p.id));
      const filterPerformerIds = performerIds.map((id) => String(id));
      if (modifier === "INCLUDES") {
        return filterPerformerIds.some((id: string) =>
          scenePerformerIds.includes(id)
        );
      }
      if (modifier === "INCLUDES_ALL") {
        return filterPerformerIds.every((id: string) =>
          scenePerformerIds.includes(id)
        );
      }
      if (modifier === "EXCLUDES") {
        return !filterPerformerIds.some((id: string) =>
          scenePerformerIds.includes(id)
        );
      }
      return true;
    });
  }

  // Filter by tags (squashed: scene + performers + studio tags)
  // Supports hierarchical filtering via depth parameter
  if (filters.tags) {
    const { value: tagIds, modifier, depth } = filters.tags;
    if (!tagIds || tagIds.length === 0) return filtered;

    // Expand tag IDs to include descendants if depth is specified
    // depth: 0 or undefined = exact match, -1 = all descendants, N = N levels deep
    const expandedTagIds = await expandTagIds(
      tagIds.map((id) => String(id)),
      depth ?? 0
    );

    // Pre-compute expanded sets for each individual tag (needed for INCLUDES_ALL)
    const expandedTagSets = new Map<string, string[]>();
    if (modifier === "INCLUDES_ALL") {
      for (const originalTagId of tagIds) {
        const expanded = await expandTagIds([String(originalTagId)], depth ?? 0);
        expandedTagSets.set(String(originalTagId), expanded);
      }
    }

    filtered = filtered.filter((s) => {
      // Collect all tag IDs from scene, performers, and studio
      const allTagIds = new Set<string>();

      // Add scene tags
      (s.tags || []).forEach((t) => allTagIds.add(String(t.id)));

      // Add performer tags
      (s.performers || []).forEach((p) => {
        (p.tags || []).forEach((t) => allTagIds.add(String(t.id)));
      });

      // Add studio tags
      if (s.studio?.tags) {
        s.studio.tags.forEach((t) => allTagIds.add(String(t.id)));
      }

      if (modifier === "INCLUDES") {
        return expandedTagIds.some((id: string) => allTagIds.has(id));
      }
      if (modifier === "INCLUDES_ALL") {
        // For INCLUDES_ALL with hierarchy, we check that the scene has at least
        // one tag from each original filter tag's expanded set
        return tagIds.every((originalTagId) => {
          const expandedForThisTag = expandedTagSets.get(String(originalTagId)) || [];
          return expandedForThisTag.some((id) => allTagIds.has(id));
        });
      }
      if (modifier === "EXCLUDES") {
        return !expandedTagIds.some((id: string) => allTagIds.has(id));
      }
      return true;
    });
  }

  // Filter by studios
  // Supports hierarchical filtering via depth parameter
  if (filters.studios) {
    const { value: studioIds, modifier, depth } = filters.studios;
    if (!studioIds || studioIds.length === 0) return filtered;

    // Expand studio IDs to include descendants if depth is specified
    // depth: 0 or undefined = exact match, -1 = all descendants, N = N levels deep
    const expandedStudioIds = new Set(
      await expandStudioIds(
        studioIds.map((id) => String(id)),
        depth ?? 0
      )
    );

    filtered = filtered.filter((s) => {
      if (!s.studio) return modifier === "EXCLUDES";
      const studioId = String(s.studio.id);
      if (modifier === "INCLUDES") {
        return expandedStudioIds.has(studioId);
      }
      if (modifier === "EXCLUDES") {
        return !expandedStudioIds.has(studioId);
      }
      return true;
    });
  }

  // Filter by groups
  if (filters.groups) {
    const { value: groupIds, modifier } = filters.groups;
    if (!groupIds || groupIds.length === 0) return filtered;

    filtered = filtered.filter((s) => {
      // After transformScene, groups are flattened: { id, name, scene_index }
      // NOT nested: { group: { id, name }, scene_index }
      const sceneGroupIds = (s.groups || []).map((g: any) => String(g.id));
      const filterGroupIds = groupIds.map((id) => String(id));
      if (modifier === "INCLUDES") {
        return filterGroupIds.some((id: string) => sceneGroupIds.includes(id));
      }
      if (modifier === "INCLUDES_ALL") {
        return filterGroupIds.every((id: string) => sceneGroupIds.includes(id));
      }
      if (modifier === "EXCLUDES") {
        return !filterGroupIds.some((id: string) => sceneGroupIds.includes(id));
      }
      return true;
    });
  }

  // Filter by bitrate
  if (filters.bitrate) {
    const { modifier, value, value2 } = filters.bitrate;
    filtered = filtered.filter((s) => {
      const bitrate = s.files?.[0]?.bit_rate || 0;
      if (modifier === "GREATER_THAN") return bitrate > value;
      if (modifier === "LESS_THAN") return bitrate < value;
      if (modifier === "EQUALS") return bitrate === value;
      if (modifier === "BETWEEN")
        return (
          value2 !== null &&
          value2 !== undefined &&
          bitrate >= value &&
          bitrate <= value2
        );
      return true;
    });
  }

  // Filter by duration
  if (filters.duration) {
    const { modifier, value, value2 } = filters.duration;
    filtered = filtered.filter((s) => {
      const duration = s.files?.[0]?.duration || 0;
      if (modifier === "GREATER_THAN") return duration > value;
      if (modifier === "LESS_THAN") return duration < value;
      if (modifier === "EQUALS") return duration === value;
      if (modifier === "BETWEEN")
        return (
          value2 !== null &&
          value2 !== undefined &&
          duration >= value &&
          duration <= value2
        );
      return true;
    });
  }

  // Filter by created_at
  if (filters.created_at) {
    const { modifier, value, value2 } = filters.created_at;
    filtered = filtered.filter((s) => {
      if (!s.created_at) return false;
      const sceneDate = new Date(s.created_at);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return sceneDate > filterDate;
      if (modifier === "LESS_THAN") return sceneDate < filterDate;
      if (modifier === "EQUALS") {
        return sceneDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
        const filterDate2 = new Date(value2);
        return sceneDate >= filterDate && sceneDate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by updated_at
  if (filters.updated_at) {
    const { modifier, value, value2 } = filters.updated_at;
    filtered = filtered.filter((s) => {
      if (!s.updated_at) return false;
      const sceneDate = new Date(s.updated_at);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return sceneDate > filterDate;
      if (modifier === "LESS_THAN") return sceneDate < filterDate;
      if (modifier === "EQUALS") {
        return sceneDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
        const filterDate2 = new Date(value2);
        return sceneDate >= filterDate && sceneDate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by performer_count
  if (filters.performer_count) {
    const { modifier, value, value2 } = filters.performer_count;
    filtered = filtered.filter((s) => {
      const performerCount = s.performers?.length || 0;
      if (modifier === "GREATER_THAN") return performerCount > value;
      if (modifier === "LESS_THAN") return performerCount < value;
      if (modifier === "EQUALS") return performerCount === value;
      if (modifier === "BETWEEN")
        return (
          value2 !== null &&
          value2 !== undefined &&
          performerCount >= value &&
          performerCount <= value2
        );
      return true;
    });
  }

  // Filter by tag_count
  if (filters.tag_count) {
    const { modifier, value, value2 } = filters.tag_count;
    filtered = filtered.filter((s) => {
      const tagCount = s.tags?.length || 0;
      if (modifier === "GREATER_THAN") return tagCount > value;
      if (modifier === "LESS_THAN") return tagCount < value;
      if (modifier === "EQUALS") return tagCount === value;
      if (modifier === "BETWEEN")
        return (
          value2 !== null &&
          value2 !== undefined &&
          tagCount >= value &&
          tagCount <= value2
        );
      return true;
    });
  }

  // Filter by framerate
  if (filters.framerate) {
    const { modifier, value, value2 } = filters.framerate;
    filtered = filtered.filter((s) => {
      const framerate = s.files?.[0]?.frame_rate || 0;
      if (modifier === "GREATER_THAN") return framerate > value;
      if (modifier === "LESS_THAN") return framerate < value;
      if (modifier === "EQUALS") return framerate === value;
      if (modifier === "BETWEEN")
        return (
          value2 !== null &&
          value2 !== undefined &&
          framerate >= value &&
          framerate <= value2
        );
      return true;
    });
  }

  // Filter by orientation
  if (filters.orientation) {
    const { value: orientations } = filters.orientation;
    if (!orientations || orientations.length === 0) return filtered;

    filtered = filtered.filter((s) => {
      const width = s.files?.[0]?.width || 0;
      const height = s.files?.[0]?.height || 0;

      // Determine scene orientation from dimensions
      let sceneOrientation: string;
      if (width > height) {
        sceneOrientation = "LANDSCAPE";
      } else if (width < height) {
        sceneOrientation = "PORTRAIT";
      } else {
        sceneOrientation = "SQUARE";
      }

      // Check if scene orientation matches any of the filter orientations
      return orientations.includes(sceneOrientation as any);
    });
  }

  // Filter by resolution
  if (filters.resolution) {
    const { value: resolutionEnum, modifier } = filters.resolution;
    if (!resolutionEnum) return filtered;

    // Map resolution enum to pixel heights
    const resolutionHeights: Record<string, number> = {
      VERY_LOW: 144,
      LOW: 240,
      R360P: 360,
      STANDARD: 480,
      WEB_HD: 540,
      STANDARD_HD: 720,
      FULL_HD: 1080,
      QUAD_HD: 1440,
      FOUR_K: 2160,
      FIVE_K: 2880,
      SIX_K: 3384,
      SEVEN_K: 4320,
      EIGHT_K: 4320,
      HUGE: 8640,
    };

    const filterHeight = resolutionHeights[resolutionEnum];
    if (filterHeight === undefined) return filtered;

    filtered = filtered.filter((s) => {
      const height = s.files?.[0]?.height || 0;
      if (modifier === "EQUALS") return height === filterHeight;
      if (modifier === "NOT_EQUALS") return height !== filterHeight;
      if (modifier === "GREATER_THAN") return height > filterHeight;
      if (modifier === "LESS_THAN") return height < filterHeight;
      return true;
    });
  }

  // Filter by title
  if (filters.title) {
    const { value, modifier } = filters.title;
    const searchValue = value.toLowerCase();
    filtered = filtered.filter((s) => {
      const title = (s.title || "").toLowerCase();
      if (modifier === "INCLUDES") return title.includes(searchValue);
      if (modifier === "EXCLUDES") return !title.includes(searchValue);
      if (modifier === "EQUALS") return title === searchValue;
      return true;
    });
  }

  // Filter by details
  if (filters.details) {
    const { value, modifier } = filters.details;
    const searchValue = value.toLowerCase();
    filtered = filtered.filter((s) => {
      const details = (s.details || "").toLowerCase();
      if (modifier === "INCLUDES") return details.includes(searchValue);
      if (modifier === "EXCLUDES") return !details.includes(searchValue);
      if (modifier === "EQUALS") return details === searchValue;
      return true;
    });
  }

  // Filter by video codec
  if (filters.video_codec) {
    const { value, modifier } = filters.video_codec;
    const searchValue = value.toLowerCase();
    filtered = filtered.filter((s) => {
      const videoCodec = (s.files?.[0]?.video_codec || "").toLowerCase();
      if (modifier === "INCLUDES") return videoCodec.includes(searchValue);
      if (modifier === "EXCLUDES") return !videoCodec.includes(searchValue);
      if (modifier === "EQUALS") return videoCodec === searchValue;
      return true;
    });
  }

  // Filter by audio codec
  if (filters.audio_codec) {
    const { value, modifier } = filters.audio_codec;
    const searchValue = value.toLowerCase();
    filtered = filtered.filter((s) => {
      const audioCodec = (s.files?.[0]?.audio_codec || "").toLowerCase();
      if (modifier === "INCLUDES") return audioCodec.includes(searchValue);
      if (modifier === "EXCLUDES") return !audioCodec.includes(searchValue);
      if (modifier === "EQUALS") return audioCodec === searchValue;
      return true;
    });
  }

  return filtered;
}

/**
 * Apply expensive scene filters (require merged user data)
 * These filters access user-specific data (ratings, watch history, favorites)
 */
export function applyExpensiveSceneFilters(
  scenes: NormalizedScene[],
  filters: PeekSceneFilter | null | undefined
): NormalizedScene[] {
  if (!filters) return scenes;

  let filtered = scenes;

  // Filter by favorite
  if (filters.favorite !== undefined) {
    filtered = filtered.filter((s) => s.favorite === filters.favorite);
  }

  // Filter by rating100
  if (filters.rating100) {
    const { modifier, value, value2 } = filters.rating100;
    filtered = filtered.filter((s) => {
      const rating = s.rating100 || 0;
      if (modifier === "GREATER_THAN") return rating > value;
      if (modifier === "LESS_THAN") return rating < value;
      if (modifier === "EQUALS") return rating === value;
      if (modifier === "NOT_EQUALS") return rating !== value;
      if (modifier === "BETWEEN")
        return (
          value !== undefined &&
          value2 !== null &&
          value2 !== undefined &&
          rating >= value &&
          rating <= value2
        );
      return true;
    });
  }

  // Filter by o_counter
  if (filters.o_counter) {
    const { modifier, value, value2 } = filters.o_counter;
    filtered = filtered.filter((s) => {
      const oCounter = s.o_counter || 0;
      if (modifier === "GREATER_THAN")
        return value !== undefined && oCounter > value;
      if (modifier === "LESS_THAN")
        return value !== undefined && oCounter < value;
      if (modifier === "EQUALS") return oCounter === value;
      if (modifier === "NOT_EQUALS") return oCounter !== value;
      if (modifier === "BETWEEN")
        return (
          value !== undefined &&
          value2 !== null &&
          value2 !== undefined &&
          oCounter >= value &&
          oCounter <= value2
        );
      return true;
    });
  }

  // Filter by play_count
  if (filters.play_count) {
    const { modifier, value, value2 } = filters.play_count;
    filtered = filtered.filter((s) => {
      const playCount = s.play_count || 0;
      if (modifier === "GREATER_THAN")
        return value !== undefined && playCount > value;
      if (modifier === "LESS_THAN")
        return value !== undefined && playCount < value;
      if (modifier === "EQUALS") return playCount === value;
      if (modifier === "NOT_EQUALS") return playCount !== value;
      if (modifier === "BETWEEN")
        return (
          value !== undefined &&
          value2 !== null &&
          value2 !== undefined &&
          playCount >= value &&
          playCount <= value2
        );
      return true;
    });
  }

  // Filter by play_duration
  if (filters.play_duration) {
    const { modifier, value, value2 } = filters.play_duration;
    filtered = filtered.filter((s) => {
      const playDuration = s.play_duration || 0;
      if (modifier === "GREATER_THAN") return playDuration > value;
      if (modifier === "LESS_THAN") return playDuration < value;
      if (modifier === "EQUALS") return playDuration === value;
      if (modifier === "BETWEEN")
        return (
          value2 !== null &&
          value2 !== undefined &&
          playDuration >= value &&
          playDuration <= value2
        );
      return true;
    });
  }

  // Filter by last_played_at
  if (filters.last_played_at) {
    const { modifier, value, value2 } = filters.last_played_at;
    filtered = filtered.filter((s) => {
      if (!s.last_played_at) return false;
      const lastPlayedDate = new Date(s.last_played_at);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return lastPlayedDate > filterDate;
      if (modifier === "LESS_THAN") return lastPlayedDate < filterDate;
      if (modifier === "EQUALS") {
        return lastPlayedDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
        const filterDate2 = new Date(value2);
        return lastPlayedDate >= filterDate && lastPlayedDate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by last_o_at
  if (filters.last_o_at) {
    const { modifier, value, value2 } = filters.last_o_at;
    filtered = filtered.filter((s) => {
      if (!s.last_o_at) return false;
      const lastODate = new Date(s.last_o_at);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return lastODate > filterDate;
      if (modifier === "LESS_THAN") return lastODate < filterDate;
      if (modifier === "EQUALS") {
        return lastODate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
        const filterDate2 = new Date(value2);
        return lastODate >= filterDate && lastODate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by performer favorite
  if (filters.performer_favorite) {
    filtered = filtered.filter((s) => {
      const performers = s.performers || [];
      return performers.some((p) => p.favorite === true);
    });
  }

  // Filter by studio favorite
  if (filters.studio_favorite) {
    filtered = filtered.filter((s) => {
      return s.studio?.favorite === true;
    });
  }

  // Filter by tag favorite
  if (filters.tag_favorite) {
    filtered = filtered.filter((s) => {
      const tags = s.tags || [];
      return tags.some((t) => t.favorite === true);
    });
  }

  return filtered;
}

/**
 * Sort scenes
 */
export function sortScenes(
  scenes: NormalizedScene[],
  sortField: string,
  direction: string,
  groupId?: number
): NormalizedScene[] {
  const sorted = [...scenes];

  sorted.sort((a, b) => {
    const aValue = getFieldValue(a, sortField, groupId);
    const bValue = getFieldValue(b, sortField, groupId);

    let comparison = 0;
    if (typeof aValue === "string" && typeof bValue === "string") {
      comparison = aValue.localeCompare(bValue);
    } else {
      const aNum = aValue || 0;
      const bNum = bValue || 0;
      comparison = aNum > bNum ? 1 : aNum < bNum ? -1 : 0;
    }

    if (direction.toUpperCase() === "DESC") {
      comparison = -comparison;
    }

    // Secondary sort by title
    if (comparison === 0) {
      const aTitle = a.title || "";
      const bTitle = b.title || "";
      return aTitle.localeCompare(bTitle);
    }

    return comparison;
  });

  return sorted;
}

/**
 * Get field value from scene for sorting
 */
function getFieldValue(
  scene: NormalizedScene,
  field: string,
  groupId?: number
): string | number {
  // Scene index in group (requires groupId context)
  if (field === "scene_index") {
    if (!groupId || !scene.groups || !Array.isArray(scene.groups)) {
      return 999999; // Put scenes without scene_index at the end
    }
    // After transformScene, groups are flattened: { id, name, scene_index }
    const group = scene.groups.find(
      (g: any) => String(g.id) === String(groupId)
    );
    return group?.scene_index ?? 999999; // Put scenes without scene_index at the end
  }

  // Watch history fields
  if (field === "o_counter") return scene.o_counter || 0;
  if (field === "play_count") return scene.play_count || 0;
  if (field === "last_played_at") return scene.last_played_at || "";
  if (field === "last_o_at") return scene.last_o_at || "";

  // Rating fields
  if (field === "rating") return scene.rating || 0;
  if (field === "rating100") return scene.rating100 || 0;

  // Standard Stash fields
  if (field === "date") return scene.date || "";
  if (field === "created_at") return scene.created_at || "";
  if (field === "updated_at") return scene.updated_at || "";
  if (field === "title") return scene.title || "";
  if (field === "random") return Math.random();

  // Count fields
  if (field === "performer_count") return scene.performers?.length || 0;
  if (field === "tag_count") return scene.tags?.length || 0;

  // File fields
  if (field === "bitrate") return scene.files?.[0]?.bit_rate || 0;
  if (field === "duration") return scene.files?.[0]?.duration || 0;
  if (field === "filesize") return scene.files?.[0]?.size || 0;
  if (field === "framerate") return scene.files?.[0]?.frame_rate || 0;
  if (field === "path") return scene.files?.[0]?.path || "";

  // Fallback for dynamic field access (safe as function is only called with known fields)
  const value = (scene as Record<string, unknown>)[field];
  return typeof value === "string" || typeof value === "number" ? value : 0;
}

/**
 * Simplified findScenes using cache with pagination-aware filtering
 */
export const findScenes = async (
  req: TypedAuthRequest<FindScenesRequest>,
  res: TypedResponse<FindScenesResponse | ApiErrorResponse>
) => {
  const requestStart = Date.now();
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { filter, scene_filter, ids } = req.body;

    const sortFieldRaw = filter?.sort || "created_at";
    const sortDirection = filter?.direction || "DESC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Parse random_<seed> format (e.g., "random_12345678")
    let randomSeed: number | undefined;
    let sortField = sortFieldRaw;

    if (sortFieldRaw.startsWith('random_')) {
      const seedStr = sortFieldRaw.slice(7); // Remove "random_" prefix
      const parsedSeed = parseInt(seedStr, 10);
      if (!isNaN(parsedSeed)) {
        randomSeed = parsedSeed % 1e8; // Cap at 10^8 like Stash does
        sortField = 'random';
      }
    } else if (sortFieldRaw === 'random') {
      // Plain "random" without seed - generate time-based seed
      randomSeed = (userId + Date.now()) % 1e8;
    }

    // Normalize ids to PeekSceneFilter format
    const normalizedIds = ids
      ? { value: ids, modifier: "INCLUDES" }
      : scene_filter?.ids;
    const mergedFilter: PeekSceneFilter = { ...scene_filter, ids: normalizedIds };
    const _requestingUser = req.user;

    // NEW: Use SQL query builder if enabled (now supports text search too)
    if (USE_SQL_QUERY_BUILDER) {
      logger.info("findScenes: using SQL query builder path", { hasSearchQuery: !!searchQuery });

      // Get user's allowed instance IDs for multi-instance filtering
      const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

      // Build filters object
      const filters: PeekSceneFilter = { ...scene_filter };
      if (ids && ids.length > 0) {
        filters.ids = { value: ids, modifier: "INCLUDES" };
      }

      // Execute query (applyExclusions defaults to true)
      const result = await sceneQueryBuilder.execute({
        userId,
        filters,
        allowedInstanceIds,
        sort: sortField,
        sortDirection: sortDirection.toUpperCase() as "ASC" | "DESC",
        page,
        perPage,
        randomSeed: sortField === 'random' ? randomSeed : userId,
        searchQuery: searchQuery || undefined,
      });

      // Add streamability info
      const scenes = addStreamabilityInfo(result.scenes);

      logger.info("findScenes complete (SQL path)", {
        totalTimeMs: Date.now() - requestStart,
        resultCount: scenes.length,
        total: result.total,
      });

      return res.json({
        findScenes: {
          count: result.total,
          scenes,
        },
      });
    }

    // Check if we can use the FAST PATH (pure DB pagination)
    // Fast path requires: no search, no filters, simple sort field
    // Now works for ALL users (admins and regular users) with pre-computed exclusions
    const dbSortFields = new Set(['created_at', 'updated_at', 'date', 'title', 'duration', 'filesize', 'bitrate', 'framerate']);

    // Check if scene_filter has any actual filter properties (not just an empty object)
    const hasSceneFilters = scene_filter && Object.keys(scene_filter).length > 0;

    const canUseDbPagination =
      !searchQuery &&
      !ids &&
      !hasSceneFilters &&
      dbSortFields.has(sortField);

    // Debug logging to understand why fast path is/isn't used
    logger.info(`findScenes: fast path check - searchQuery=${!!searchQuery}, ids=${!!ids}, hasSceneFilters=${hasSceneFilters}, sortField=${sortField}, inDbSortFields=${dbSortFields.has(sortField)}, canUse=${canUseDbPagination}`);

    if (canUseDbPagination) {
      // FAST PATH: Database pagination with pre-computed exclusions (sub-second response)
      logger.info('findScenes: using FAST PATH (DB pagination with exclusions)');

      // Get pre-computed scene exclusions
      const exclusionStart = Date.now();
      const excludeIds = await entityExclusionHelper.getExcludedIds(userId, 'scene');
      logger.info(`findScenes: getExcludedIds took ${Date.now() - exclusionStart}ms (${excludeIds.size} exclusions)`);

      const dbStart = Date.now();
      const { scenes: paginatedScenes, total } = await stashEntityService.getScenesPaginated({
        page,
        perPage,
        sortField,
        sortDirection: sortDirection.toUpperCase() as 'ASC' | 'DESC',
        excludeIds,
      });
      logger.info(`findScenes: DB pagination took ${Date.now() - dbStart}ms`);

      // Merge user data for paginated scenes only
      const mergeStart = Date.now();
      const scenesWithUserData = await mergeScenesWithUserData(paginatedScenes, userId);
      logger.info(`findScenes: merge user data took ${Date.now() - mergeStart}ms (${paginatedScenes.length} scenes)`);

      // Add streamability info
      const scenesWithStreamability = addStreamabilityInfo(scenesWithUserData);

      logger.info(`findScenes: TOTAL request took ${Date.now() - requestStart}ms (FAST PATH)`);

      return res.json({
        findScenes: {
          count: total,
          scenes: scenesWithStreamability,
        },
      });
    }

    // STANDARD PATH: Load all scenes and filter in memory
    // Get pre-computed scene exclusions
    const exclusionStart = Date.now();
    const excludeIds = await entityExclusionHelper.getExcludedIds(userId, 'scene');
    logger.info(`findScenes: getExcludedIds took ${Date.now() - exclusionStart}ms (${excludeIds.size} exclusions)`);

    // Step 1: Get all scenes from cache
    const cacheStart = Date.now();
    let scenes = await stashEntityService.getAllScenes();
    logger.info(`findScenes: cache fetch took ${Date.now() - cacheStart}ms for ${scenes.length} scenes`);

    if (scenes.length === 0) {
      logger.warn("Cache not initialized, returning empty result");
      return res.json({
        findScenes: {
          count: 0,
          scenes: [],
        },
      });
    }

    // Apply pre-computed exclusions immediately (fast Set lookup)
    const preFilterStart = Date.now();
    scenes = scenes.filter(s => !excludeIds.has(s.id));
    logger.info(`findScenes: applied ${excludeIds.size} exclusions in ${Date.now() - preFilterStart}ms, ${scenes.length} scenes remaining`);

    // Determine if we can use optimized pipeline
    // Expensive sort fields require user data, so we must merge all scenes first
    const expensiveSortFields = new Set([
      "o_counter",
      "play_count",
      "last_played_at",
      "last_o_at",
      "rating",
      "rating100",
    ]);
    const requiresUserDataForSort = expensiveSortFields.has(sortField);

    // Check if any expensive filters are being used
    const hasExpensiveFilters =
      scene_filter?.favorite !== undefined ||
      scene_filter?.rating100 !== undefined ||
      scene_filter?.o_counter !== undefined ||
      scene_filter?.play_count !== undefined ||
      scene_filter?.play_duration !== undefined ||
      scene_filter?.last_played_at !== undefined ||
      scene_filter?.last_o_at !== undefined ||
      scene_filter?.performer_favorite !== undefined ||
      scene_filter?.studio_favorite !== undefined ||
      scene_filter?.tag_favorite !== undefined;

    if (requiresUserDataForSort || hasExpensiveFilters) {
      // OLD PIPELINE: Merge all → filter → sort → paginate
      // (Required when sorting/filtering by user-specific data)

      // Step 2: Merge with user data (all scenes)
      const mergeStart = Date.now();
      scenes = await mergeScenesWithUserData(scenes, userId);
      logger.info(`findScenes: merge user data took ${Date.now() - mergeStart}ms`);

      // Step 3: Apply search query
      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        scenes = scenes.filter((s) => {
          const title = s.title || "";
          const details = s.details || "";
          const filePath = s.files?.[0]?.path || "";
          const performers = (s.performers || [])
            .map((p) => p.name || "")
            .join(" ");
          const studio = s.studio?.name || "";
          const tags = (s.tags || []).map((t) => t.name || "").join(" ");

          return (
            title.toLowerCase().includes(lowerQuery) ||
            details.toLowerCase().includes(lowerQuery) ||
            filePath.toLowerCase().includes(lowerQuery) ||
            performers.toLowerCase().includes(lowerQuery) ||
            studio.toLowerCase().includes(lowerQuery) ||
            tags.toLowerCase().includes(lowerQuery)
          );
        });
      }

      // Step 4: Apply all filters (quick + expensive)
      const filterStart = Date.now();
      scenes = await applyQuickSceneFilters(scenes, mergedFilter);
      scenes = applyExpensiveSceneFilters(scenes, mergedFilter);
      logger.info(`findScenes: filters took ${Date.now() - filterStart}ms`);

      // Note: Exclusions already applied via pre-computed excludeIds above

      // Step 6: Sort
      const sortStart = Date.now();
      const groupIdRaw = scene_filter?.groups?.value?.[0];
      const groupIdForSort = groupIdRaw ? parseInt(groupIdRaw, 10) : undefined;
      scenes = sortScenes(scenes, sortField, sortDirection, groupIdForSort);
      logger.info(`findScenes: sort took ${Date.now() - sortStart}ms`);

      // Step 7: Paginate
      const total = scenes.length;
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedScenes = scenes.slice(startIndex, endIndex);

      // Step 8: Add streamability information
      const scenesWithStreamability = addStreamabilityInfo(paginatedScenes);

      logger.info(`findScenes: TOTAL request took ${Date.now() - requestStart}ms (expensive pipeline)`);

      return res.json({
        findScenes: {
          count: total,
          scenes: scenesWithStreamability,
        },
      });
    } else {
      // NEW OPTIMIZED PIPELINE: Filter → sort → paginate → merge only paginated scenes
      // (99% reduction: merge only 40 scenes instead of 20k)

      // Step 2: Apply search query
      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        scenes = scenes.filter((s) => {
          const title = s.title || "";
          const details = s.details || "";
          const filePath = s.files?.[0]?.path || "";
          const performers = (s.performers || [])
            .map((p) => p.name || "")
            .join(" ");
          const studio = s.studio?.name || "";
          const tags = (s.tags || []).map((t) => t.name || "").join(" ");

          return (
            title.toLowerCase().includes(lowerQuery) ||
            details.toLowerCase().includes(lowerQuery) ||
            filePath.toLowerCase().includes(lowerQuery) ||
            performers.toLowerCase().includes(lowerQuery) ||
            studio.toLowerCase().includes(lowerQuery) ||
            tags.toLowerCase().includes(lowerQuery)
          );
        });
      }

      // Step 3: Apply quick filters (don't need user data)
      const filterStart = Date.now();
      scenes = await applyQuickSceneFilters(scenes, mergedFilter);
      logger.info(`findScenes: quick filters took ${Date.now() - filterStart}ms`);

      // Note: Exclusions already applied via pre-computed excludeIds above

      // Step 4: Sort (using quick sort fields only)
      const sortStart = Date.now();
      const groupIdRaw = scene_filter?.groups?.value?.[0];
      const groupIdForSort = groupIdRaw ? parseInt(groupIdRaw, 10) : undefined;
      scenes = sortScenes(scenes, sortField, sortDirection, groupIdForSort);
      logger.info(`findScenes: sort took ${Date.now() - sortStart}ms`);

      // Step 6: Paginate BEFORE merging user data
      const total = scenes.length;
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedScenes = scenes.slice(startIndex, endIndex);

      // Step 7: Merge user data (ONLY for paginated scenes - huge win!)
      const mergeStart = Date.now();
      const scenesWithUserData = await mergeScenesWithUserData(
        paginatedScenes,
        userId
      );
      logger.info(`findScenes: merge user data took ${Date.now() - mergeStart}ms (${paginatedScenes.length} scenes)`);

      // Step 8: Apply expensive filters (shouldn't match anything since no expensive filters)
      // Included for completeness, will be no-op
      const finalScenes = applyExpensiveSceneFilters(
        scenesWithUserData,
        mergedFilter
      );

      // Step 9: Add streamability information
      const scenesWithStreamability = addStreamabilityInfo(finalScenes);

      logger.info(`findScenes: TOTAL request took ${Date.now() - requestStart}ms (optimized pipeline)`);

      return res.json({
        findScenes: {
          count: total,
          scenes: scenesWithStreamability,
        },
      });
    }
  } catch (error) {
    logger.error("Error in findScenes", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find scenes",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateScene = async (
  req: TypedAuthRequest<UpdateSceneRequest, UpdateSceneParams>,
  res: TypedResponse<UpdateSceneResponse | ApiErrorResponse>
) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const updateData = req.body;

    const stash = stashInstanceManager.getDefault();
    const updatedScene = await stash.sceneUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    if (!updatedScene.sceneUpdate) {
      return res.status(500).json({ error: "Scene update returned null" });
    }

    // Override with per-user watch history
    const sceneWithUserHistory = await mergeScenesWithUserData(
      [updatedScene.sceneUpdate] as unknown as NormalizedScene[],
      userId
    );

    res.json({ success: true, scene: sceneWithUserHistory[0] });
  } catch (error) {
    console.error("Error updating scene:", error);
    res.status(500).json({ error: "Failed to update scene" });
  }
};

/**
 * Find similar scenes based on weighted scoring
 * Performers: 3 points each
 * Studio: 2 points
 * Tags: 1 point each
 *
 * Uses SQL-based candidate selection (max 500 candidates) for scalability:
 * 1. SQL query finds scenes sharing performers, tags, or studio with weights
 * 2. SceneQueryBuilder fetches full scene data for paginated results
 */
export const findSimilarScenes = async (
  req: TypedAuthRequest<unknown, FindSimilarScenesParams, FindSimilarScenesQuery>,
  res: TypedResponse<FindSimilarScenesResponse | ApiErrorResponse>
) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = 12;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Get pre-computed scene exclusions for this user
    const excludedIds = await entityExclusionHelper.getExcludedIds(userId, 'scene');

    // Use SQL-based candidate selection (max 500 candidates)
    // This replaces loading ALL scenes and scoring in memory
    const candidates = await stashEntityService.getSimilarSceneCandidates(
      id,
      excludedIds,
      500 // Max candidates
    );

    // Empty result if no candidates found
    if (candidates.length === 0) {
      return res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
      });
    }

    // Paginate candidate IDs (already sorted by weight desc, date desc from SQL)
    const startIndex = (page - 1) * perPage;
    const paginatedIds = candidates
      .slice(startIndex, startIndex + perPage)
      .map(c => c.sceneId);

    if (paginatedIds.length === 0) {
      return res.json({
        scenes: [],
        count: candidates.length,
        page,
        perPage,
      });
    }

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    // Fetch full scene data via SceneQueryBuilder
    const { scenes } = await sceneQueryBuilder.getByIds({
      userId,
      ids: paginatedIds,
      allowedInstanceIds,
    });

    // Preserve score order (getByIds may return in different order)
    const sceneMap = new Map(scenes.map(s => [s.id, s]));
    const orderedScenes = paginatedIds
      .map(id => sceneMap.get(id))
      .filter((s): s is NormalizedScene => s !== undefined);

    logger.info("findSimilarScenes completed", {
      totalTime: `${Date.now() - startTime}ms`,
      sceneId: id,
      candidateCount: candidates.length,
      resultCount: orderedScenes.length,
      page,
    });

    res.json({
      scenes: orderedScenes,
      count: candidates.length,
      page,
      perPage,
    });
  } catch (error) {
    logger.error("Error finding similar scenes:", { error: error as Error });
    res.status(500).json({ error: "Failed to find similar scenes" });
  }
};

/**
 * Get recommended scenes based on user preferences and watch history
 * Uses favorites, ratings (80+), watch status, and engagement quality
 *
 * Two-phase query architecture:
 * 1. Lightweight scoring: Score all scenes using IDs only (SceneScoringData)
 * 2. Full fetch: Get complete scene data for paginated results via SceneQueryBuilder
 */
export const getRecommendedScenes = async (
  req: TypedAuthRequest<unknown, Record<string, string>, GetRecommendedScenesQuery>,
  res: TypedResponse<GetRecommendedScenesResponse | ApiErrorResponse>
) => {
  const startTime = Date.now();
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 24;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Fetch user ratings, watch history, engagement rankings, and lightweight scoring data in parallel
    const [
      performerRatings,
      studioRatings,
      tagRatings,
      sceneRatings,
      watchHistory,
      allScoringData,
      excludedIds,
      engagementRankings,
    ] = await Promise.all([
      prisma.performerRating.findMany({ where: { userId } }),
      prisma.studioRating.findMany({ where: { userId } }),
      prisma.tagRating.findMany({ where: { userId } }),
      prisma.sceneRating.findMany({ where: { userId } }),
      prisma.watchHistory.findMany({ where: { userId } }),
      stashEntityService.getScenesForScoring(),
      entityExclusionHelper.getExcludedIds(userId, 'scene'),
      // Fetch implicit engagement signals from pre-computed rankings
      prisma.userEntityRanking.findMany({
        where: { userId, entityType: { in: ['performer', 'studio', 'tag'] } },
        select: { entityId: true, entityType: true, engagementRate: true, percentileRank: true },
      }),
    ]);

    // Build sets of favorite and highly-rated entities
    const favoritePerformers = new Set(
      performerRatings.filter((r) => r.favorite).map((r) => r.performerId)
    );
    const highlyRatedPerformers = new Set(
      performerRatings
        .filter((r) => r.rating !== null && r.rating >= 80)
        .map((r) => r.performerId)
    );
    const favoriteStudios = new Set(
      studioRatings.filter((r) => r.favorite).map((r) => r.studioId)
    );
    const highlyRatedStudios = new Set(
      studioRatings
        .filter((r) => r.rating !== null && r.rating >= 80)
        .map((r) => r.studioId)
    );
    const favoriteTags = new Set(
      tagRatings.filter((r) => r.favorite).map((r) => r.tagId)
    );
    const highlyRatedTags = new Set(
      tagRatings
        .filter((r) => r.rating !== null && r.rating >= 80)
        .map((r) => r.tagId)
    );

    // Count user criteria for feedback
    const criteriaCounts = countUserCriteria(
      performerRatings,
      studioRatings,
      tagRatings,
      sceneRatings
    );

    // Check if user has any criteria (now includes scenes)
    if (!hasAnyCriteria(criteriaCounts)) {
      return res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
        message: "No recommendations yet",
        criteria: criteriaCounts,
      });
    }

    // Build watch history map
    const watchMap = new Map(
      watchHistory.map((wh) => {
        const playHistory = Array.isArray(wh.playHistory)
          ? wh.playHistory
          : JSON.parse((wh.playHistory as string) || "[]");
        const lastPlayedAt =
          playHistory.length > 0
            ? new Date(playHistory[playHistory.length - 1])
            : null;

        return [
          wh.sceneId,
          {
            playCount: wh.playCount || 0,
            lastPlayedAt,
          },
        ];
      })
    );

    // Filter excluded scenes from scoring data
    const scoringData = allScoringData.filter((s) => !excludedIds.has(s.id));

    // Build derived weights from rated/favorited scenes using lightweight data
    const sceneRatingsForDerived: SceneRatingInput[] = sceneRatings.map((r) => ({
      sceneId: r.sceneId,
      rating: r.rating,
      favorite: r.favorite,
    }));

    const scoringDataMap = new Map(scoringData.map((s) => [s.id, s]));
    const getScoringDataById = (id: string) => scoringDataMap.get(id);

    const {
      derivedPerformerWeights,
      derivedStudioWeights,
      derivedTagWeights,
    } = buildDerivedWeightsFromScoringData(sceneRatingsForDerived, getScoringDataById);

    // Build implicit weights from engagement rankings (top 50% by percentile)
    const rankingData: EntityRankingData[] = engagementRankings.map((r) => ({
      entityId: r.entityId,
      entityType: r.entityType,
      engagementRate: r.engagementRate,
      percentileRank: r.percentileRank,
    }));

    const {
      implicitPerformerWeights,
      implicitStudioWeights,
      implicitTagWeights,
    } = buildImplicitWeightsFromRankings(rankingData, 50);

    // Build entity preferences object
    const prefs: LightweightEntityPreferences = {
      favoritePerformers,
      highlyRatedPerformers,
      favoriteStudios,
      highlyRatedStudios,
      favoriteTags,
      highlyRatedTags,
      derivedPerformerWeights,
      derivedStudioWeights,
      derivedTagWeights,
      implicitPerformerWeights,
      implicitStudioWeights,
      implicitTagWeights,
    };

    // Phase 1: Score all scenes using lightweight data
    interface ScoredSceneId {
      id: string;
      score: number;
      oCounter: number;
    }

    const scoredScenes: ScoredSceneId[] = [];
    const now = new Date();

    for (const data of scoringData) {
      const baseScore = scoreScoringDataByPreferences(data, prefs);

      // Skip if no base score (doesn't match any criteria)
      if (baseScore === 0) continue;

      // Watch status modifier (reduced dominance: was +100/-100, now +30/-30)
      let adjustedScore = baseScore;
      const watchData = watchMap.get(data.id);
      if (!watchData || watchData.playCount === 0) {
        // Never watched
        adjustedScore += 30;
      } else if (watchData.lastPlayedAt) {
        const daysSinceWatched =
          (now.getTime() - watchData.lastPlayedAt.getTime()) /
          (24 * 60 * 60 * 1000);

        if (daysSinceWatched > 14) {
          // Not recently watched
          adjustedScore += 20;
        } else if (daysSinceWatched >= 1) {
          // Recently watched (1-14 days)
          adjustedScore -= 10;
        } else {
          // Very recently watched (<24 hours)
          adjustedScore -= 30;
        }
      }

      // Engagement quality multiplier
      const engagementMultiplier = 1.0 + Math.min(data.oCounter, 10) * 0.03;
      const finalScore = adjustedScore * engagementMultiplier;

      // Only include scenes with positive final scores
      if (finalScore > 0) {
        scoredScenes.push({ id: data.id, score: finalScore, oCounter: data.oCounter });
      }
    }

    // Sort by score descending
    scoredScenes.sort((a, b) => b.score - a.score);

    // Add diversity through score tier randomization
    // Group scenes into score tiers (10% bands) and randomize within each tier
    // This creates variety while maintaining general quality order
    const diversifiedScenes: ScoredSceneId[] = [];
    if (scoredScenes.length > 0) {
      const maxScore = scoredScenes[0].score;
      const minScore = scoredScenes[scoredScenes.length - 1].score;
      const scoreRange = maxScore - minScore;
      const tierSize = scoreRange / 10; // 10 tiers

      // Group scenes by tier
      const tiers: ScoredSceneId[][] = Array.from({ length: 10 }, () => []);
      for (const scoredScene of scoredScenes) {
        const tierIndex = Math.min(
          9,
          Math.floor((maxScore - scoredScene.score) / tierSize)
        );
        tiers[tierIndex].push(scoredScene);
      }

      // Use seeded random for consistent shuffle order per user
      // This prevents duplicates across pages while maintaining diversity
      const rng = new SeededRandom(userId);

      // Randomize within each tier and combine
      for (const tier of tiers) {
        // Fisher-Yates shuffle with seeded random
        for (let i = tier.length - 1; i > 0; i--) {
          const j = rng.nextInt(i + 1);
          [tier[i], tier[j]] = [tier[j], tier[i]];
        }
        diversifiedScenes.push(...tier);
      }
    }

    // Cap at top 500 recommendations
    const cappedScenes = diversifiedScenes.slice(0, 500);

    // If no recommendations after scoring, include criteria for feedback
    if (cappedScenes.length === 0) {
      return res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
        message: "No matching recommendations found",
        criteria: criteriaCounts,
      });
    }

    // Paginate scene IDs
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedIds = cappedScenes.slice(startIndex, endIndex).map((s) => s.id);

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    // Fetch full scene data via SceneQueryBuilder
    const { scenes } = await sceneQueryBuilder.getByIds({
      userId,
      ids: paginatedIds,
      allowedInstanceIds,
    });

    // Preserve score order (getByIds returns in arbitrary order)
    const sceneMap = new Map(scenes.map((s) => [s.id, s]));
    const orderedScenes = paginatedIds
      .map((id) => sceneMap.get(id))
      .filter((s): s is NormalizedScene => s !== undefined);

    logger.info("getRecommendedScenes completed", {
      totalTime: `${Date.now() - startTime}ms`,
      userId,
      candidateCount: cappedScenes.length,
      resultCount: orderedScenes.length,
      page,
    });

    res.json({
      scenes: orderedScenes,
      count: cappedScenes.length,
      page,
      perPage,
    });
  } catch (error) {
    const err = error as Error;
    logger.error("Error getting recommended scenes:", {
      message: err.message,
      name: err.name,
      stack: err.stack,
      userId: req.user?.id,
    });

    const errorType = err.name || "Unknown error";
    res.status(500).json({
      error: "Failed to get recommended scenes",
      errorType,
    });
  }
};
