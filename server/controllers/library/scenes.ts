import type { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { stashCacheManager } from "../../services/StashCacheManager.js";
import { userRestrictionService } from "../../services/UserRestrictionService.js";
import getStash from "../../stash.js";
import type { NormalizedScene, PeekSceneFilter } from "../../types/index.js";
import { isSceneStreamable } from "../../utils/codecDetection.js";
import { logger } from "../../utils/logger.js";

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
 */
export async function mergeScenesWithUserData(
  scenes: NormalizedScene[],
  userId: number
): Promise<NormalizedScene[]> {
  // Fetch user data in parallel
  const [
    watchHistory,
    sceneRatings,
    performerRatings,
    studioRatings,
    tagRatings,
  ] = await Promise.all([
    prisma.watchHistory.findMany({ where: { userId } }),
    prisma.sceneRating.findMany({ where: { userId } }),
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

    return {
      ...scene,
      isStreamable: streamabilityInfo.isStreamable,
      streamabilityReasons: streamabilityInfo.reasons,
    };
  });
}

/**
 * Apply quick scene filters (don't require merged user data)
 * These filters only access data already present in the scene object from cache
 */
export function applyQuickSceneFilters(
  scenes: NormalizedScene[],
  filters: PeekSceneFilter | null | undefined
): NormalizedScene[] {
  if (!filters) return scenes;

  let filtered = scenes;

  // Filter by IDs (for detail pages)
  if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
    const idSet = new Set(filters.ids);
    filtered = filtered.filter((s) => idSet.has(s.id));
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
  if (filters.tags) {
    const { value: tagIds, modifier } = filters.tags;
    if (!tagIds || tagIds.length === 0) return filtered;
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

      const filterTagIds = tagIds.map((id) => String(id));

      if (modifier === "INCLUDES") {
        return filterTagIds.some((id: string) => allTagIds.has(id));
      }
      if (modifier === "INCLUDES_ALL") {
        return filterTagIds.every((id: string) => allTagIds.has(id));
      }
      if (modifier === "EXCLUDES") {
        return !filterTagIds.some((id: string) => allTagIds.has(id));
      }
      return true;
    });
  }

  // Filter by studios
  if (filters.studios) {
    const { value: studioIds, modifier } = filters.studios;
    if (!studioIds || studioIds.length === 0) return filtered;
    filtered = filtered.filter((s) => {
      if (!s.studio) return modifier === "EXCLUDES";
      const filterStudioIds = studioIds.map((id) => String(id));
      const studioId = String(s.studio.id);
      if (modifier === "INCLUDES") {
        return filterStudioIds.includes(studioId);
      }
      if (modifier === "EXCLUDES") {
        return !filterStudioIds.includes(studioId);
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
function sortScenes(
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

  // Fallback for dynamic field access (safe as function is only called with known fields)
  const value = (scene as Record<string, unknown>)[field];
  return typeof value === "string" || typeof value === "number" ? value : 0;
}

/**
 * Simplified findScenes using cache with pagination-aware filtering
 */
export const findScenes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { filter, scene_filter, ids } = req.body;

    const sortField = filter?.sort || "created_at";
    const sortDirection = filter?.direction || "DESC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Step 1: Get all scenes from cache
    let scenes = stashCacheManager.getAllScenes();

    if (scenes.length === 0) {
      logger.warn("Cache not initialized, returning empty result");
      return res.json({
        findScenes: {
          count: 0,
          scenes: [],
        },
      });
    }

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

    const mergedFilter = { ...scene_filter, ids: ids || scene_filter?.ids };
    const requestingUser = req.user;

    if (requiresUserDataForSort || hasExpensiveFilters) {
      // OLD PIPELINE: Merge all → filter → sort → paginate
      // (Required when sorting/filtering by user-specific data)

      // Step 2: Merge with user data (all scenes)
      scenes = await mergeScenesWithUserData(scenes, userId);

      // Step 3: Apply search query
      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        scenes = scenes.filter((s) => {
          const title = s.title || "";
          const details = s.details || "";
          const performers = (s.performers || [])
            .map((p) => p.name || "")
            .join(" ");
          const studio = s.studio?.name || "";
          const tags = (s.tags || []).map((t) => t.name || "").join(" ");

          return (
            title.toLowerCase().includes(lowerQuery) ||
            details.toLowerCase().includes(lowerQuery) ||
            performers.toLowerCase().includes(lowerQuery) ||
            studio.toLowerCase().includes(lowerQuery) ||
            tags.toLowerCase().includes(lowerQuery)
          );
        });
      }

      // Step 4: Apply all filters (quick + expensive)
      scenes = applyQuickSceneFilters(scenes, mergedFilter);
      scenes = applyExpensiveSceneFilters(scenes, mergedFilter);

      // Step 5: Apply content restrictions
      if (requestingUser && requestingUser.role !== "ADMIN") {
        scenes = await userRestrictionService.filterScenesForUser(
          scenes,
          userId
        );
      }

      // Step 6: Sort
      const groupIdForSort = scene_filter?.groups?.value?.[0];
      scenes = sortScenes(scenes, sortField, sortDirection, groupIdForSort);

      // Step 7: Paginate
      const total = scenes.length;
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedScenes = scenes.slice(startIndex, endIndex);

      // Step 8: Add streamability information
      const scenesWithStreamability = addStreamabilityInfo(paginatedScenes);

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
          const performers = (s.performers || [])
            .map((p) => p.name || "")
            .join(" ");
          const studio = s.studio?.name || "";
          const tags = (s.tags || []).map((t) => t.name || "").join(" ");

          return (
            title.toLowerCase().includes(lowerQuery) ||
            details.toLowerCase().includes(lowerQuery) ||
            performers.toLowerCase().includes(lowerQuery) ||
            studio.toLowerCase().includes(lowerQuery) ||
            tags.toLowerCase().includes(lowerQuery)
          );
        });
      }

      // Step 3: Apply quick filters (don't need user data)
      scenes = applyQuickSceneFilters(scenes, mergedFilter);

      // Step 4: Apply content restrictions
      if (requestingUser && requestingUser.role !== "ADMIN") {
        scenes = await userRestrictionService.filterScenesForUser(
          scenes,
          userId
        );
      }

      // Step 5: Sort (using quick sort fields only)
      const groupIdForSort = scene_filter?.groups?.value?.[0];
      scenes = sortScenes(scenes, sortField, sortDirection, groupIdForSort);

      // Step 6: Paginate BEFORE merging user data
      const total = scenes.length;
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedScenes = scenes.slice(startIndex, endIndex);

      // Step 7: Merge user data (ONLY for paginated scenes - huge win!)
      const scenesWithUserData = await mergeScenesWithUserData(
        paginatedScenes,
        userId
      );

      // Step 8: Apply expensive filters (shouldn't match anything since no expensive filters)
      // Included for completeness, will be no-op
      const finalScenes = applyExpensiveSceneFilters(
        scenesWithUserData,
        mergedFilter
      );

      // Step 9: Add streamability information
      const scenesWithStreamability = addStreamabilityInfo(finalScenes);

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

export const updateScene = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const updateData = req.body;

    const stash = getStash();
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
 * Tags: 1 point each (squashed from scene, performers, studio)
 * Studio: 1 point
 */
export const findSimilarScenes = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = 12; // Fixed at 12 scenes per page
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Get all scenes from cache
    const allScenes = stashCacheManager.getAllScenes();

    // Find the current scene
    const currentScene = allScenes.find((s: NormalizedScene) => s.id === id);
    if (!currentScene) {
      return res.status(404).json({ error: "Scene not found" });
    }

    // Helper to get squashed tags (scene + performers + studio)
    const getSquashedTagIds = (scene: NormalizedScene): Set<string> => {
      const tagIds = new Set<string>();

      // Scene tags
      (scene.tags || []).forEach((t) => tagIds.add(String(t.id)));

      // Performer tags
      (scene.performers || []).forEach((p) => {
        (p.tags || []).forEach((t) => tagIds.add(String(t.id)));
      });

      // Studio tags
      if (scene.studio?.tags) {
        scene.studio.tags.forEach((t) => tagIds.add(String(t.id)));
      }

      return tagIds;
    };

    // Check if scene has any metadata
    const hasMetadata = (scene: NormalizedScene): boolean => {
      const hasPerformers = scene.performers && scene.performers.length > 0;
      const hasStudio = !!scene.studio;
      const hasTags = getSquashedTagIds(scene).size > 0;
      return hasPerformers || hasStudio || hasTags;
    };

    // If current scene has no metadata, return empty results
    if (!hasMetadata(currentScene)) {
      return res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
      });
    }

    // Get current scene's metadata
    const currentPerformerIds = new Set(
      (currentScene.performers || []).map((p) => String(p.id))
    );
    const currentStudioId = currentScene.studio?.id
      ? String(currentScene.studio.id)
      : null;
    const currentTagIds = getSquashedTagIds(currentScene);

    // Calculate similarity scores for all other scenes
    interface ScoredScene {
      scene: NormalizedScene;
      score: number;
    }

    const scoredScenes: ScoredScene[] = [];

    for (const scene of allScenes) {
      // Skip current scene
      if (scene.id === id) continue;

      // Skip scenes with no metadata
      if (!hasMetadata(scene)) continue;

      let score = 0;

      // Score for matching performers (3 points each)
      if (scene.performers) {
        for (const performer of scene.performers) {
          if (currentPerformerIds.has(String(performer.id))) {
            score += 3;
          }
        }
      }

      // Score for matching studio (1 point)
      if (currentStudioId && scene.studio?.id === currentStudioId) {
        score += 1;
      }

      // Score for matching tags (1 point each)
      const sceneTagIds = getSquashedTagIds(scene);
      for (const tagId of currentTagIds) {
        if (sceneTagIds.has(tagId)) {
          score += 1;
        }
      }

      // Only include scenes with at least some similarity
      if (score > 0) {
        scoredScenes.push({ scene, score });
      }
    }

    // Sort by score descending, then by date descending as tiebreaker
    scoredScenes.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Tiebreaker: newer scenes first
      const dateA = a.scene.date ? new Date(a.scene.date).getTime() : 0;
      const dateB = b.scene.date ? new Date(b.scene.date).getTime() : 0;
      return dateB - dateA;
    });

    // Paginate results
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedScenes = scoredScenes
      .slice(startIndex, endIndex)
      .map((s) => s.scene);

    // Merge with user data
    const scenesWithUserData = await mergeScenesWithUserData(
      paginatedScenes,
      userId
    );

    res.json({
      scenes: scenesWithUserData,
      count: scoredScenes.length,
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
 */
export const getRecommendedScenes = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 24;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Fetch user ratings and watch history
    const [performerRatings, studioRatings, tagRatings, watchHistory] =
      await Promise.all([
        prisma.performerRating.findMany({ where: { userId } }),
        prisma.studioRating.findMany({ where: { userId } }),
        prisma.tagRating.findMany({ where: { userId } }),
        prisma.watchHistory.findMany({ where: { userId } }),
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

    // Check if user has any favorites or highly-rated entities
    const hasCriteria =
      favoritePerformers.size > 0 ||
      highlyRatedPerformers.size > 0 ||
      favoriteStudios.size > 0 ||
      highlyRatedStudios.size > 0 ||
      favoriteTags.size > 0 ||
      highlyRatedTags.size > 0;

    if (!hasCriteria) {
      return res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
        message:
          "Rate or favorite some performers, studios, or tags to get recommendations",
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

    // Get all scenes
    const allScenes = stashCacheManager.getAllScenes();

    // Helper to get tags by source (weighted to reduce squashing inflation)
    const getTagsBySource = (scene: NormalizedScene) => {
      const sceneTags = new Set<string>();
      const performerTags = new Set<string>();
      const studioTags = new Set<string>();

      (scene.tags || []).forEach((t) => sceneTags.add(String(t.id)));
      (scene.performers || []).forEach((p) => {
        (p.tags || []).forEach((t) => performerTags.add(String(t.id)));
      });
      if (scene.studio?.tags) {
        scene.studio.tags.forEach((t) => studioTags.add(String(t.id)));
      }

      return { sceneTags, performerTags, studioTags };
    };

    // Score all scenes
    interface ScoredScene {
      scene: NormalizedScene;
      score: number;
    }

    const scoredScenes: ScoredScene[] = [];
    const now = new Date();

    for (const scene of allScenes) {
      let baseScore = 0;

      // Score performers with diminishing returns (sqrt scaling)
      if (scene.performers) {
        let favoritePerformerCount = 0;
        let highlyRatedPerformerCount = 0;

        for (const performer of scene.performers) {
          const performerId = String(performer.id);
          if (favoritePerformers.has(performerId)) {
            favoritePerformerCount++;
          } else if (highlyRatedPerformers.has(performerId)) {
            highlyRatedPerformerCount++;
          }
        }

        // Diminishing returns: sqrt scaling
        // 1 performer = 5 pts, 4 = 10 pts, 9 = 15 pts (not linear)
        if (favoritePerformerCount > 0) {
          baseScore += 5 * Math.sqrt(favoritePerformerCount);
        }
        if (highlyRatedPerformerCount > 0) {
          baseScore += 3 * Math.sqrt(highlyRatedPerformerCount);
        }
      }

      // Score studio (already capped at 1 per scene)
      if (scene.studio) {
        const studioId = String(scene.studio.id);
        if (favoriteStudios.has(studioId)) {
          baseScore += 3;
        } else if (highlyRatedStudios.has(studioId)) {
          baseScore += 2;
        }
      }

      // Score tags with source weighting and diminishing returns
      const { sceneTags, performerTags, studioTags } = getTagsBySource(scene);

      let favoriteSceneTagCount = 0;
      let favoritePerformerTagCount = 0;
      let favoriteStudioTagCount = 0;
      let ratedSceneTagCount = 0;
      let ratedPerformerTagCount = 0;
      let ratedStudioTagCount = 0;

      for (const tagId of sceneTags) {
        if (favoriteTags.has(tagId)) favoriteSceneTagCount++;
        else if (highlyRatedTags.has(tagId)) ratedSceneTagCount++;
      }
      for (const tagId of performerTags) {
        if (!sceneTags.has(tagId)) {
          // Don't double-count
          if (favoriteTags.has(tagId)) favoritePerformerTagCount++;
          else if (highlyRatedTags.has(tagId)) ratedPerformerTagCount++;
        }
      }
      for (const tagId of studioTags) {
        if (!sceneTags.has(tagId) && !performerTags.has(tagId)) {
          // Don't double-count
          if (favoriteTags.has(tagId)) favoriteStudioTagCount++;
          else if (highlyRatedTags.has(tagId)) ratedStudioTagCount++;
        }
      }

      // Weighted tag scores with diminishing returns
      // Scene tags: Full value (1.0x weight)
      // Performer tags: Reduced value (0.3x weight)
      // Studio tags: Medium value (0.5x weight)
      if (favoriteSceneTagCount > 0) {
        baseScore += 1.0 * Math.sqrt(favoriteSceneTagCount);
      }
      if (favoritePerformerTagCount > 0) {
        baseScore += 0.3 * Math.sqrt(favoritePerformerTagCount);
      }
      if (favoriteStudioTagCount > 0) {
        baseScore += 0.5 * Math.sqrt(favoriteStudioTagCount);
      }
      if (ratedSceneTagCount > 0) {
        baseScore += 0.5 * Math.sqrt(ratedSceneTagCount);
      }
      if (ratedPerformerTagCount > 0) {
        baseScore += 0.15 * Math.sqrt(ratedPerformerTagCount);
      }
      if (ratedStudioTagCount > 0) {
        baseScore += 0.25 * Math.sqrt(ratedStudioTagCount);
      }

      // Skip if no base score (doesn't match any criteria)
      if (baseScore === 0) continue;

      // Watch status modifier (reduced dominance: was +100/-100, now +30/-30)
      const watchData = watchMap.get(scene.id);
      if (!watchData || watchData.playCount === 0) {
        // Never watched
        baseScore += 30;
      } else if (watchData.lastPlayedAt) {
        const daysSinceWatched =
          (now.getTime() - watchData.lastPlayedAt.getTime()) /
          (24 * 60 * 60 * 1000);

        if (daysSinceWatched > 14) {
          // Not recently watched
          baseScore += 20;
        } else if (daysSinceWatched >= 1) {
          // Recently watched (1-14 days)
          baseScore -= 10;
        } else {
          // Very recently watched (<24 hours)
          baseScore -= 30;
        }
      }

      // Engagement quality multiplier
      const oCounter = scene.o_counter || 0;
      const engagementMultiplier = 1.0 + Math.min(oCounter, 10) * 0.03;
      const finalScore = baseScore * engagementMultiplier;

      // Only include scenes with positive final scores
      if (finalScore > 0) {
        scoredScenes.push({ scene, score: finalScore });
      }
    }

    // Sort by score descending
    scoredScenes.sort((a, b) => b.score - a.score);

    // Add diversity through score tier randomization
    // Group scenes into score tiers (10% bands) and randomize within each tier
    // This creates variety while maintaining general quality order
    const diversifiedScenes: ScoredScene[] = [];
    if (scoredScenes.length > 0) {
      const maxScore = scoredScenes[0].score;
      const minScore = scoredScenes[scoredScenes.length - 1].score;
      const scoreRange = maxScore - minScore;
      const tierSize = scoreRange / 10; // 10 tiers

      // Group scenes by tier
      const tiers: ScoredScene[][] = Array.from({ length: 10 }, () => []);
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

    // Paginate
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedScenes = cappedScenes
      .slice(startIndex, endIndex)
      .map((s) => s.scene);

    // Merge with user data
    const scenesWithUserData = await mergeScenesWithUserData(
      paginatedScenes,
      userId
    );

    res.json({
      scenes: scenesWithUserData,
      count: cappedScenes.length,
      page,
      perPage,
    });
  } catch (error) {
    logger.error("Error getting recommended scenes:", {
      error: error as Error,
    });
    res.status(500).json({ error: "Failed to get recommended scenes" });
  }
};
