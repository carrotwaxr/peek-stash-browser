/**
 * Simplified library controller using StashCacheManager
 * This replaces the complex conditional logic with straightforward array operations
 */

import type { Request, Response } from 'express';
import prisma from '../prisma/singleton.js';
import { stashCacheManager } from '../services/StashCacheManager.js';
import { logger } from '../utils/logger.js';
import type { NormalizedScene } from '../services/StashCacheManager.js';
import getStash from '../stash.js';

/**
 * Merge user-specific data into scenes
 */
export async function mergeScenesWithUserData(
  scenes: NormalizedScene[],
  userId: number
): Promise<NormalizedScene[]> {
  // Fetch user data in parallel
  const [watchHistory, sceneRatings, performerRatings, studioRatings, tagRatings] = await Promise.all([
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
        : JSON.parse((wh.oHistory as string) || '[]');
      const playHistory = Array.isArray(wh.playHistory)
        ? wh.playHistory
        : JSON.parse((wh.playHistory as string) || '[]');

      return [
        wh.sceneId,
        {
          o_counter: wh.oCount || 0,
          play_count: wh.playCount || 0,
          play_duration: wh.playDuration || 0,
          resume_time: wh.resumeTime || 0,
          play_history: playHistory,
          o_history: oHistory,
          last_played_at: playHistory.length > 0 ? playHistory[playHistory.length - 1] : null,
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
      mergedScene.performers = mergedScene.performers.map((p: any) => ({
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
      mergedScene.tags = mergedScene.tags.map((t: any) => ({
        ...t,
        favorite: tagFavorites.has(t.id),
      }));
    }

    return mergedScene;
  });
}

/**
 * Apply scene filters
 */
function applySceneFilters(scenes: NormalizedScene[], filters: any): NormalizedScene[] {
  if (!filters) return scenes;

  let filtered = scenes;

  // Filter by IDs (for detail pages)
  if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
    const idSet = new Set(filters.ids);
    filtered = filtered.filter((s) => idSet.has(s.id));
  }

  // Filter by favorite
  if (filters.favorite !== undefined) {
    filtered = filtered.filter((s) => s.favorite === filters.favorite);
  }

  // Filter by rating100
  if (filters.rating100) {
    const { modifier, value, value2 } = filters.rating100;
    filtered = filtered.filter((s) => {
      const rating = s.rating100 || 0;
      if (modifier === 'GREATER_THAN') return rating > value;
      if (modifier === 'LESS_THAN') return rating < value;
      if (modifier === 'EQUALS') return rating === value;
      if (modifier === 'NOT_EQUALS') return rating !== value;
      if (modifier === 'BETWEEN') return rating >= value && rating <= value2;
      return true;
    });
  }

  // Filter by performers
  if (filters.performers) {
    const { value: performerIds, modifier } = filters.performers;
    filtered = filtered.filter((s) => {
      const scenePerformerIds = (s.performers || []).map((p: any) => String(p.id));
      const filterPerformerIds = performerIds.map((id: any) => String(id));
      if (modifier === 'INCLUDES') {
        return filterPerformerIds.some((id: string) => scenePerformerIds.includes(id));
      }
      if (modifier === 'INCLUDES_ALL') {
        return filterPerformerIds.every((id: string) => scenePerformerIds.includes(id));
      }
      if (modifier === 'EXCLUDES') {
        return !filterPerformerIds.some((id: string) => scenePerformerIds.includes(id));
      }
      return true;
    });
  }

  // Filter by tags (squashed: scene + performers + studio tags)
  if (filters.tags) {
    const { value: tagIds, modifier } = filters.tags;
    filtered = filtered.filter((s) => {
      // Collect all tag IDs from scene, performers, and studio
      const allTagIds = new Set<string>();

      // Add scene tags
      (s.tags || []).forEach((t: any) => allTagIds.add(String(t.id)));

      // Add performer tags
      (s.performers || []).forEach((p: any) => {
        (p.tags || []).forEach((t: any) => allTagIds.add(String(t.id)));
      });

      // Add studio tags
      if (s.studio?.tags) {
        s.studio.tags.forEach((t: any) => allTagIds.add(String(t.id)));
      }

      const filterTagIds = tagIds.map((id: any) => String(id));

      if (modifier === 'INCLUDES') {
        return filterTagIds.some((id: string) => allTagIds.has(id));
      }
      if (modifier === 'INCLUDES_ALL') {
        return filterTagIds.every((id: string) => allTagIds.has(id));
      }
      if (modifier === 'EXCLUDES') {
        return !filterTagIds.some((id: string) => allTagIds.has(id));
      }
      return true;
    });
  }

  // Filter by studios
  if (filters.studios) {
    const { value: studioIds, modifier } = filters.studios;
    filtered = filtered.filter((s) => {
      if (!s.studio) return modifier === 'EXCLUDES';
      const filterStudioIds = studioIds.map((id: any) => String(id));
      const studioId = String(s.studio.id);
      if (modifier === 'INCLUDES') {
        return filterStudioIds.includes(studioId);
      }
      if (modifier === 'EXCLUDES') {
        return !filterStudioIds.includes(studioId);
      }
      return true;
    });
  }

  // Filter by bitrate
  if (filters.bitrate) {
    const { modifier, value, value2 } = filters.bitrate;
    filtered = filtered.filter((s) => {
      const bitrate = s.files?.[0]?.bit_rate || 0;
      if (modifier === 'GREATER_THAN') return bitrate > value;
      if (modifier === 'LESS_THAN') return bitrate < value;
      if (modifier === 'EQUALS') return bitrate === value;
      if (modifier === 'BETWEEN') return bitrate >= value && bitrate <= value2;
      return true;
    });
  }

  // Filter by duration
  if (filters.duration) {
    const { modifier, value, value2 } = filters.duration;
    filtered = filtered.filter((s) => {
      const duration = s.files?.[0]?.duration || 0;
      if (modifier === 'GREATER_THAN') return duration > value;
      if (modifier === 'LESS_THAN') return duration < value;
      if (modifier === 'EQUALS') return duration === value;
      if (modifier === 'BETWEEN') return duration >= value && duration <= value2;
      return true;
    });
  }

  // Filter by created_at
  if (filters.created_at) {
    const { modifier, value, value2 } = filters.created_at;
    filtered = filtered.filter((s) => {
      if (!s.created_at) return false;
      const sceneDate = new Date(s.created_at);
      const filterDate = new Date(value);
      if (modifier === 'GREATER_THAN') return sceneDate > filterDate;
      if (modifier === 'LESS_THAN') return sceneDate < filterDate;
      if (modifier === 'EQUALS') {
        return sceneDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === 'BETWEEN') {
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
      const filterDate = new Date(value);
      if (modifier === 'GREATER_THAN') return sceneDate > filterDate;
      if (modifier === 'LESS_THAN') return sceneDate < filterDate;
      if (modifier === 'EQUALS') {
        return sceneDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === 'BETWEEN') {
        const filterDate2 = new Date(value2);
        return sceneDate >= filterDate && sceneDate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by o_counter
  if (filters.o_counter) {
    const { modifier, value, value2 } = filters.o_counter;
    filtered = filtered.filter((s) => {
      const oCounter = s.o_counter || 0;
      if (modifier === 'GREATER_THAN') return oCounter > value;
      if (modifier === 'LESS_THAN') return oCounter < value;
      if (modifier === 'EQUALS') return oCounter === value;
      if (modifier === 'NOT_EQUALS') return oCounter !== value;
      if (modifier === 'BETWEEN') return oCounter >= value && oCounter <= value2;
      return true;
    });
  }

  // Filter by play_count
  if (filters.play_count) {
    const { modifier, value, value2 } = filters.play_count;
    filtered = filtered.filter((s) => {
      const playCount = s.play_count || 0;
      if (modifier === 'GREATER_THAN') return playCount > value;
      if (modifier === 'LESS_THAN') return playCount < value;
      if (modifier === 'EQUALS') return playCount === value;
      if (modifier === 'NOT_EQUALS') return playCount !== value;
      if (modifier === 'BETWEEN') return playCount >= value && playCount <= value2;
      return true;
    });
  }

  // Filter by play_duration
  if (filters.play_duration) {
    const { modifier, value, value2 } = filters.play_duration;
    filtered = filtered.filter((s) => {
      const playDuration = s.play_duration || 0;
      if (modifier === 'GREATER_THAN') return playDuration > value;
      if (modifier === 'LESS_THAN') return playDuration < value;
      if (modifier === 'EQUALS') return playDuration === value;
      if (modifier === 'BETWEEN') return playDuration >= value && playDuration <= value2;
      return true;
    });
  }

  // Filter by performer_count
  if (filters.performer_count) {
    const { modifier, value, value2 } = filters.performer_count;
    filtered = filtered.filter((s) => {
      const performerCount = s.performers?.length || 0;
      if (modifier === 'GREATER_THAN') return performerCount > value;
      if (modifier === 'LESS_THAN') return performerCount < value;
      if (modifier === 'EQUALS') return performerCount === value;
      if (modifier === 'BETWEEN') return performerCount >= value && performerCount <= value2;
      return true;
    });
  }

  // Filter by tag_count
  if (filters.tag_count) {
    const { modifier, value, value2 } = filters.tag_count;
    filtered = filtered.filter((s) => {
      const tagCount = s.tags?.length || 0;
      if (modifier === 'GREATER_THAN') return tagCount > value;
      if (modifier === 'LESS_THAN') return tagCount < value;
      if (modifier === 'EQUALS') return tagCount === value;
      if (modifier === 'BETWEEN') return tagCount >= value && tagCount <= value2;
      return true;
    });
  }

  // Filter by framerate
  if (filters.framerate) {
    const { modifier, value, value2 } = filters.framerate;
    filtered = filtered.filter((s) => {
      const framerate = s.files?.[0]?.frame_rate || 0;
      if (modifier === 'GREATER_THAN') return framerate > value;
      if (modifier === 'LESS_THAN') return framerate < value;
      if (modifier === 'EQUALS') return framerate === value;
      if (modifier === 'BETWEEN') return framerate >= value && framerate <= value2;
      return true;
    });
  }

  // Filter by last_played_at
  if (filters.last_played_at) {
    const { modifier, value, value2 } = filters.last_played_at;
    filtered = filtered.filter((s) => {
      if (!s.last_played_at) return false;
      const lastPlayedDate = new Date(s.last_played_at);
      const filterDate = new Date(value);
      if (modifier === 'GREATER_THAN') return lastPlayedDate > filterDate;
      if (modifier === 'LESS_THAN') return lastPlayedDate < filterDate;
      if (modifier === 'EQUALS') {
        return lastPlayedDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === 'BETWEEN') {
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
      const filterDate = new Date(value);
      if (modifier === 'GREATER_THAN') return lastODate > filterDate;
      if (modifier === 'LESS_THAN') return lastODate < filterDate;
      if (modifier === 'EQUALS') {
        return lastODate.toDateString() === filterDate.toDateString();
      }
      if (modifier === 'BETWEEN') {
        const filterDate2 = new Date(value2);
        return lastODate >= filterDate && lastODate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by title
  if (filters.title) {
    const { value, modifier } = filters.title;
    const searchValue = value.toLowerCase();
    filtered = filtered.filter((s) => {
      const title = (s.title || '').toLowerCase();
      if (modifier === 'INCLUDES') return title.includes(searchValue);
      if (modifier === 'EXCLUDES') return !title.includes(searchValue);
      if (modifier === 'EQUALS') return title === searchValue;
      return true;
    });
  }

  // Filter by details
  if (filters.details) {
    const { value, modifier } = filters.details;
    const searchValue = value.toLowerCase();
    filtered = filtered.filter((s) => {
      const details = (s.details || '').toLowerCase();
      if (modifier === 'INCLUDES') return details.includes(searchValue);
      if (modifier === 'EXCLUDES') return !details.includes(searchValue);
      if (modifier === 'EQUALS') return details === searchValue;
      return true;
    });
  }

  // Filter by performer favorite
  if (filters.performer_favorite) {
    filtered = filtered.filter((s) => {
      const performers = s.performers || [];
      return performers.some((p: any) => p.favorite === true);
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
      return tags.some((t: any) => t.favorite === true);
    });
  }

  return filtered;
}

/**
 * Sort scenes
 */
function sortScenes(scenes: NormalizedScene[], sortField: string, direction: string): NormalizedScene[] {
  const sorted = [...scenes];

  sorted.sort((a, b) => {
    const aValue = getFieldValue(a, sortField);
    const bValue = getFieldValue(b, sortField);

    let comparison = 0;
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else {
      const aNum = aValue || 0;
      const bNum = bValue || 0;
      comparison = aNum > bNum ? 1 : aNum < bNum ? -1 : 0;
    }

    if (direction.toUpperCase() === 'DESC') {
      comparison = -comparison;
    }

    // Secondary sort by title
    if (comparison === 0) {
      const aTitle = a.title || '';
      const bTitle = b.title || '';
      return aTitle.localeCompare(bTitle);
    }

    return comparison;
  });

  return sorted;
}

/**
 * Get field value from scene for sorting
 */
function getFieldValue(scene: any, field: string): any {
  // Watch history fields
  if (field === 'o_counter') return scene.o_counter || 0;
  if (field === 'play_count') return scene.play_count || 0;
  if (field === 'last_played_at') return scene.last_played_at || '';
  if (field === 'last_o_at') return scene.last_o_at || '';

  // Rating fields
  if (field === 'rating') return scene.rating || 0;
  if (field === 'rating100') return scene.rating100 || 0;

  // Standard Stash fields
  if (field === 'date') return scene.date || '';
  if (field === 'created_at') return scene.created_at || '';
  if (field === 'updated_at') return scene.updated_at || '';
  if (field === 'title') return scene.title || '';
  if (field === 'random') return Math.random();

  // Count fields
  if (field === 'performer_count') return scene.performers?.length || 0;
  if (field === 'tag_count') return scene.tags?.length || 0;

  // File fields
  if (field === 'bitrate') return scene.files?.[0]?.bit_rate || 0;
  if (field === 'duration') return scene.files?.[0]?.duration || 0;
  if (field === 'filesize') return scene.files?.[0]?.size || 0;
  if (field === 'framerate') return scene.files?.[0]?.frame_rate || 0;

  return scene[field] || 0;
}

/**
 * Simplified findScenes using cache
 */
export const findScenes = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { filter, scene_filter, ids } = req.body;

    const sortField = filter?.sort || 'created_at';
    const sortDirection = filter?.direction || 'DESC';
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;

    // Step 1: Get all scenes from cache
    let scenes = stashCacheManager.getAllScenes();

    if (scenes.length === 0) {
      logger.warn('Cache not initialized, returning empty result');
      return res.json({
        findScenes: {
          count: 0,
          scenes: [],
        },
      });
    }

    // Step 2: Merge with user data
    scenes = await mergeScenesWithUserData(scenes, userId);

    // Step 3: Apply search query if provided
    const searchQuery = filter?.q || '';
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      scenes = scenes.filter((s) => {
        const title = s.title || '';
        const details = s.details || '';
        const performers = (s.performers || []).map((p: any) => p.name || '').join(' ');
        const studio = s.studio?.name || '';
        const tags = (s.tags || []).map((t: any) => t.name || '').join(' ');

        return (
          title.toLowerCase().includes(lowerQuery) ||
          details.toLowerCase().includes(lowerQuery) ||
          performers.toLowerCase().includes(lowerQuery) ||
          studio.toLowerCase().includes(lowerQuery) ||
          tags.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Step 4: Apply filters (merge root-level ids with scene_filter)
    const mergedFilter = { ...scene_filter, ids: ids || scene_filter?.ids };
    scenes = applySceneFilters(scenes, mergedFilter);

    // Step 5: Sort
    scenes = sortScenes(scenes, sortField, sortDirection);

    // Step 6: Paginate
    const total = scenes.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedScenes = scenes.slice(startIndex, endIndex);

    res.json({
      findScenes: {
        count: total,
        scenes: paginatedScenes,
      },
    });
  } catch (error) {
    logger.error('Error in findScenes', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      error: 'Failed to find scenes',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Calculate per-user performer statistics from watch history
 * For each performer, aggregate stats from scenes they appear in
 */
async function calculatePerformerStats(userId: number): Promise<Map<string, { o_counter: number; play_count: number; last_played_at: string | null; last_o_at: string | null }>> {
  // Get all scenes from cache
  const scenes = stashCacheManager.getAllScenes();

  // Get all watch history for this user
  const watchHistory = await prisma.watchHistory.findMany({ where: { userId } });

  const watchMap = new Map(
    watchHistory.map((wh) => {
      const oHistory = Array.isArray(wh.oHistory)
        ? wh.oHistory
        : JSON.parse((wh.oHistory as string) || '[]');
      const playHistory = Array.isArray(wh.playHistory)
        ? wh.playHistory
        : JSON.parse((wh.playHistory as string) || '[]');

      const lastPlayedAt = playHistory.length > 0 ? playHistory[playHistory.length - 1] : null;
      const lastOAt = oHistory.length > 0 ? oHistory[oHistory.length - 1] : null;

      return [
        wh.sceneId,
        {
          o_counter: wh.oCount || 0,
          play_count: wh.playCount || 0,
          last_played_at: lastPlayedAt,
          last_o_at: lastOAt,
        }
      ];
    })
  );

  // Aggregate stats by performer
  const performerStatsMap = new Map<string, { o_counter: number; play_count: number; last_played_at: string | null; last_o_at: string | null }>();

  scenes.forEach((scene) => {
    // Normalize scene ID to string for lookup
    const sceneIdStr = String(scene.id);
    const watchData = watchMap.get(sceneIdStr);
    if (!watchData) return; // Skip scenes not watched by this user

    // Aggregate to all performers in this scene
    (scene.performers || []).forEach((performer) => {
      const existing = performerStatsMap.get(performer.id) || {
        o_counter: 0,
        play_count: 0,
        last_played_at: null,
        last_o_at: null,
      };

      const updatedStats = {
        o_counter: existing.o_counter + watchData.o_counter,
        play_count: existing.play_count + watchData.play_count,
        // Update last_played_at to the most recent timestamp
        last_played_at: !existing.last_played_at || (watchData.last_played_at && watchData.last_played_at > existing.last_played_at)
          ? watchData.last_played_at
          : existing.last_played_at,
        // Update last_o_at to the most recent timestamp
        last_o_at: !existing.last_o_at || (watchData.last_o_at && watchData.last_o_at > existing.last_o_at)
          ? watchData.last_o_at
          : existing.last_o_at,
      };

      performerStatsMap.set(performer.id, updatedStats);
    });
  });

  return performerStatsMap;
}

/**
 * Merge user-specific data into performers
 */
async function mergePerformersWithUserData(
  performers: any[],
  userId: number
): Promise<any[]> {
  // Fetch user ratings and stats in parallel
  const [ratings, performerStats] = await Promise.all([
    prisma.performerRating.findMany({ where: { userId } }),
    calculatePerformerStats(userId),
  ]);

  const ratingMap = new Map(
    ratings.map((r) => [
      r.performerId,
      {
        rating: r.rating,
        rating100: r.rating,
        favorite: r.favorite,
      },
    ])
  );

  // Merge data
  return performers.map((performer) => {
    const stats = performerStats.get(performer.id) || { o_counter: 0, play_count: 0, last_played_at: null, last_o_at: null };
    return {
      ...performer,
      ...ratingMap.get(performer.id),
      ...stats,
    };
  });
}

/**
 * Simplified findPerformers using cache
 */
export const findPerformers = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { filter, performer_filter, ids } = req.body;

    const sortField = filter?.sort || 'name';
    const sortDirection = filter?.direction || 'ASC';
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || '';

    // Step 1: Get all performers from cache
    let performers = stashCacheManager.getAllPerformers();

    if (performers.length === 0) {
      logger.warn('Cache not initialized, returning empty result');
      return res.json({
        findPerformers: {
          count: 0,
          performers: [],
        },
      });
    }

    // Step 2: Merge with user data
    performers = await mergePerformersWithUserData(performers, userId);

    // Step 3: Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      performers = performers.filter((p) => {
        const name = p.name || '';
        const aliases = p.alias_list?.join(' ') || '';
        return name.toLowerCase().includes(lowerQuery) || aliases.toLowerCase().includes(lowerQuery);
      });
    }

    // Step 4: Apply filters (merge root-level ids with performer_filter)
    const mergedFilter = { ...performer_filter, ids: ids || performer_filter?.ids };
    performers = applyPerformerFilters(performers, mergedFilter);

    // Step 5: Sort
    performers = sortPerformers(performers, sortField, sortDirection);

    // Step 6: Paginate
    const total = performers.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedPerformers = performers.slice(startIndex, endIndex);

    res.json({
      findPerformers: {
        count: total,
        performers: paginatedPerformers,
      },
    });
  } catch (error) {
    logger.error('Error in findPerformers', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      error: 'Failed to find performers',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Apply performer filters
 */
function applyPerformerFilters(performers: any[], filters: any): any[] {
  if (!filters) return performers;

  let filtered = performers;

  // Filter by IDs (for detail pages)
  if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
    const idSet = new Set(filters.ids);
    filtered = filtered.filter((p) => idSet.has(p.id));
  }

  // Filter by favorite
  if (filters.favorite !== undefined) {
    filtered = filtered.filter((p) => p.favorite === filters.favorite);
  }

  // Filter by gender
  if (filters.gender) {
    const { modifier, value } = filters.gender;
    filtered = filtered.filter((p) => {
      if (modifier === 'EQUALS') return p.gender === value;
      if (modifier === 'NOT_EQUALS') return p.gender !== value;
      return true;
    });
  }

  // Filter by rating100
  if (filters.rating100) {
    const { modifier, value, value2 } = filters.rating100;
    filtered = filtered.filter((p) => {
      const rating = p.rating100 || 0;
      if (modifier === 'GREATER_THAN') return rating > value;
      if (modifier === 'LESS_THAN') return rating < value;
      if (modifier === 'EQUALS') return rating === value;
      if (modifier === 'NOT_EQUALS') return rating !== value;
      if (modifier === 'BETWEEN') return rating >= value && rating <= value2;
      return true;
    });
  }

  // Filter by o_counter
  if (filters.o_counter) {
    const { modifier, value, value2 } = filters.o_counter;
    filtered = filtered.filter((p) => {
      const oCounter = p.o_counter || 0;
      if (modifier === 'GREATER_THAN') return oCounter > value;
      if (modifier === 'LESS_THAN') return oCounter < value;
      if (modifier === 'EQUALS') return oCounter === value;
      if (modifier === 'NOT_EQUALS') return oCounter !== value;
      if (modifier === 'BETWEEN') return oCounter >= value && oCounter <= value2;
      return true;
    });
  }

  // Filter by play_count
  if (filters.play_count) {
    const { modifier, value, value2 } = filters.play_count;
    filtered = filtered.filter((p) => {
      const playCount = p.play_count || 0;
      if (modifier === 'GREATER_THAN') return playCount > value;
      if (modifier === 'LESS_THAN') return playCount < value;
      if (modifier === 'EQUALS') return playCount === value;
      if (modifier === 'NOT_EQUALS') return playCount !== value;
      if (modifier === 'BETWEEN') return playCount >= value && playCount <= value2;
      return true;
    });
  }

  // Filter by scene_count
  if (filters.scene_count) {
    const { modifier, value, value2 } = filters.scene_count;
    filtered = filtered.filter((p) => {
      const sceneCount = p.scene_count || 0;
      if (modifier === 'GREATER_THAN') return sceneCount > value;
      if (modifier === 'LESS_THAN') return sceneCount < value;
      if (modifier === 'EQUALS') return sceneCount === value;
      if (modifier === 'NOT_EQUALS') return sceneCount !== value;
      if (modifier === 'BETWEEN') return sceneCount >= value && sceneCount <= value2;
      return true;
    });
  }

  // Filter by created_at (date)
  if (filters.created_at) {
    const { modifier, value, value2 } = filters.created_at;
    filtered = filtered.filter((p) => {
      if (!p.created_at) return false;
      const performerDate = new Date(p.created_at);
      const filterDate = new Date(value);
      if (modifier === 'GREATER_THAN') return performerDate > filterDate;
      if (modifier === 'LESS_THAN') return performerDate < filterDate;
      if (modifier === 'EQUALS') {
        return performerDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === 'BETWEEN') {
        const filterDate2 = new Date(value2);
        return performerDate >= filterDate && performerDate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by updated_at (date)
  if (filters.updated_at) {
    const { modifier, value, value2 } = filters.updated_at;
    filtered = filtered.filter((p) => {
      if (!p.updated_at) return false;
      const performerDate = new Date(p.updated_at);
      const filterDate = new Date(value);
      if (modifier === 'GREATER_THAN') return performerDate > filterDate;
      if (modifier === 'LESS_THAN') return performerDate < filterDate;
      if (modifier === 'EQUALS') {
        return performerDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === 'BETWEEN') {
        const filterDate2 = new Date(value2);
        return performerDate >= filterDate && performerDate <= filterDate2;
      }
      return true;
    });
  }

  return filtered;
}

/**
 * Sort performers
 */
function sortPerformers(performers: any[], sortField: string, direction: string): any[] {
  const sorted = [...performers];

  sorted.sort((a, b) => {
    const aValue = getPerformerFieldValue(a, sortField);
    const bValue = getPerformerFieldValue(b, sortField);

    // Handle null values for timestamp fields
    const isTimestampField = sortField === 'last_played_at' || sortField === 'last_o_at';
    if (isTimestampField) {
      const aIsNull = aValue === null || aValue === undefined;
      const bIsNull = bValue === null || bValue === undefined;

      // Both null - equal
      if (aIsNull && bIsNull) return 0;

      // One is null - nulls go to end for DESC, start for ASC
      if (aIsNull) return direction.toUpperCase() === 'DESC' ? 1 : -1;
      if (bIsNull) return direction.toUpperCase() === 'DESC' ? -1 : 1;

      // Both non-null - compare as strings
      const comparison = aValue.localeCompare(bValue);
      return direction.toUpperCase() === 'DESC' ? -comparison : comparison;
    }

    // Normal sorting for other fields
    let comparison = 0;
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else {
      const aNum = aValue || 0;
      const bNum = bValue || 0;
      comparison = aNum > bNum ? 1 : aNum < bNum ? -1 : 0;
    }

    if (direction.toUpperCase() === 'DESC') {
      comparison = -comparison;
    }

    // Secondary sort by name
    if (comparison === 0) {
      const aName = a.name || '';
      const bName = b.name || '';
      return aName.localeCompare(bName);
    }

    return comparison;
  });

  return sorted;
}

/**
 * Get field value from performer for sorting
 */
function getPerformerFieldValue(performer: any, field: string): any {
  if (field === 'rating') return performer.rating || 0;
  if (field === 'rating100') return performer.rating100 || 0;
  if (field === 'o_counter') return performer.o_counter || 0;
  if (field === 'play_count') return performer.play_count || 0;
  if (field === 'scene_count' || field === 'scenes_count') return performer.scene_count || 0;
  if (field === 'name') return performer.name || '';
  if (field === 'created_at') return performer.created_at || '';
  if (field === 'updated_at') return performer.updated_at || '';
  if (field === 'last_played_at') return performer.last_played_at; // Return null as-is for timestamps
  if (field === 'last_o_at') return performer.last_o_at; // Return null as-is for timestamps
  if (field === 'random') return Math.random();
  return performer[field] || 0;
}

/**
 * Calculate per-user studio statistics from watch history
 * For each studio, aggregate stats from scenes they produced
 */
async function calculateStudioStats(userId: number): Promise<Map<string, { o_counter: number; play_count: number }>> {
  // Get all scenes from cache
  const scenes = stashCacheManager.getAllScenes();

  // Get all watch history for this user
  const watchHistory = await prisma.watchHistory.findMany({ where: { userId } });
  const watchMap = new Map(
    watchHistory.map((wh) => [wh.sceneId, { o_counter: wh.oCount || 0, play_count: wh.playCount || 0 }])
  );

  // Aggregate stats by studio
  const studioStatsMap = new Map<string, { o_counter: number; play_count: number }>();

  scenes.forEach((scene) => {
    const watchData = watchMap.get(scene.id);
    if (!watchData || !scene.studio) return; // Skip scenes not watched or without studio

    // Aggregate to studio
    const studioId = scene.studio.id;
    const existing = studioStatsMap.get(studioId) || { o_counter: 0, play_count: 0 };
    studioStatsMap.set(studioId, {
      o_counter: existing.o_counter + watchData.o_counter,
      play_count: existing.play_count + watchData.play_count,
    });
  });

  return studioStatsMap;
}

/**
 * Merge user-specific data into studios
 */
async function mergeStudiosWithUserData(
  studios: any[],
  userId: number
): Promise<any[]> {
  // Fetch user ratings and stats in parallel
  const [ratings, studioStats] = await Promise.all([
    prisma.studioRating.findMany({ where: { userId } }),
    calculateStudioStats(userId),
  ]);

  const ratingMap = new Map(
    ratings.map((r) => [
      r.studioId,
      {
        rating: r.rating,
        rating100: r.rating,
        favorite: r.favorite,
      },
    ])
  );

  // Merge data
  return studios.map((studio) => ({
    ...studio,
    ...ratingMap.get(studio.id),
    ...(studioStats.get(studio.id) || { o_counter: 0, play_count: 0 }),
  }));
}

/**
 * Simplified findStudios using cache
 */
export const findStudios = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { filter, studio_filter, ids } = req.body;

    const sortField = filter?.sort || 'name';
    const sortDirection = filter?.direction || 'ASC';
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || '';

    // Step 1: Get all studios from cache
    let studios = stashCacheManager.getAllStudios();

    if (studios.length === 0) {
      logger.warn('Cache not initialized, returning empty result');
      return res.json({
        findStudios: {
          count: 0,
          studios: [],
        },
      });
    }

    // Step 2: Merge with user data
    studios = await mergeStudiosWithUserData(studios, userId);

    // Step 3: Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      studios = studios.filter((s) => {
        const name = s.name || '';
        const details = s.details || '';
        return name.toLowerCase().includes(lowerQuery) || details.toLowerCase().includes(lowerQuery);
      });
    }

    // Step 4: Apply filters (merge root-level ids with studio_filter)
    const mergedFilter = { ...studio_filter, ids: ids || studio_filter?.ids };
    studios = applyStudioFilters(studios, mergedFilter);

    // Step 5: Sort
    studios = sortStudios(studios, sortField, sortDirection);

    // Step 6: Paginate
    const total = studios.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedStudios = studios.slice(startIndex, endIndex);

    res.json({
      findStudios: {
        count: total,
        studios: paginatedStudios,
      },
    });
  } catch (error) {
    logger.error('Error in findStudios', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      error: 'Failed to find studios',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Apply studio filters
 */
function applyStudioFilters(studios: any[], filters: any): any[] {
  if (!filters) return studios;

  let filtered = studios;

  // Filter by IDs (for detail pages)
  if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
    const idSet = new Set(filters.ids);
    filtered = filtered.filter((s) => idSet.has(s.id));
  }

  // Filter by favorite
  if (filters.favorite !== undefined) {
    filtered = filtered.filter((s) => s.favorite === filters.favorite);
  }

  // Filter by rating100
  if (filters.rating100) {
    const { modifier, value, value2 } = filters.rating100;
    filtered = filtered.filter((s) => {
      const rating = s.rating100 || 0;
      if (modifier === 'GREATER_THAN') return rating > value;
      if (modifier === 'LESS_THAN') return rating < value;
      if (modifier === 'EQUALS') return rating === value;
      if (modifier === 'NOT_EQUALS') return rating !== value;
      if (modifier === 'BETWEEN') return rating >= value && rating <= value2;
      return true;
    });
  }

  // Filter by o_counter
  if (filters.o_counter) {
    const { modifier, value, value2 } = filters.o_counter;
    filtered = filtered.filter((s) => {
      const oCounter = s.o_counter || 0;
      if (modifier === 'GREATER_THAN') return oCounter > value;
      if (modifier === 'LESS_THAN') return oCounter < value;
      if (modifier === 'EQUALS') return oCounter === value;
      if (modifier === 'NOT_EQUALS') return oCounter !== value;
      if (modifier === 'BETWEEN') return oCounter >= value && oCounter <= value2;
      return true;
    });
  }

  // Filter by play_count
  if (filters.play_count) {
    const { modifier, value, value2 } = filters.play_count;
    filtered = filtered.filter((s) => {
      const playCount = s.play_count || 0;
      if (modifier === 'GREATER_THAN') return playCount > value;
      if (modifier === 'LESS_THAN') return playCount < value;
      if (modifier === 'EQUALS') return playCount === value;
      if (modifier === 'NOT_EQUALS') return playCount !== value;
      if (modifier === 'BETWEEN') return playCount >= value && playCount <= value2;
      return true;
    });
  }

  // Filter by scene_count
  if (filters.scene_count) {
    const { modifier, value, value2 } = filters.scene_count;
    filtered = filtered.filter((s) => {
      const sceneCount = s.scene_count || 0;
      if (modifier === 'GREATER_THAN') return sceneCount > value;
      if (modifier === 'LESS_THAN') return sceneCount < value;
      if (modifier === 'EQUALS') return sceneCount === value;
      if (modifier === 'NOT_EQUALS') return sceneCount !== value;
      if (modifier === 'BETWEEN') return sceneCount >= value && sceneCount <= value2;
      return true;
    });
  }

  // Filter by name (text search)
  if (filters.name) {
    const searchValue = filters.name.value.toLowerCase();
    filtered = filtered.filter((s) => {
      const name = s.name || '';
      return name.toLowerCase().includes(searchValue);
    });
  }

  // Filter by details (text search)
  if (filters.details) {
    const searchValue = filters.details.value.toLowerCase();
    filtered = filtered.filter((s) => {
      const details = s.details || '';
      return details.toLowerCase().includes(searchValue);
    });
  }

  // Filter by created_at (date)
  if (filters.created_at) {
    const { modifier, value, value2 } = filters.created_at;
    filtered = filtered.filter((s) => {
      if (!s.created_at) return false;
      const studioDate = new Date(s.created_at);
      const filterDate = new Date(value);
      if (modifier === 'GREATER_THAN') return studioDate > filterDate;
      if (modifier === 'LESS_THAN') return studioDate < filterDate;
      if (modifier === 'EQUALS') {
        return studioDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === 'BETWEEN') {
        const filterDate2 = new Date(value2);
        return studioDate >= filterDate && studioDate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by updated_at (date)
  if (filters.updated_at) {
    const { modifier, value, value2 } = filters.updated_at;
    filtered = filtered.filter((s) => {
      if (!s.updated_at) return false;
      const studioDate = new Date(s.updated_at);
      const filterDate = new Date(value);
      if (modifier === 'GREATER_THAN') return studioDate > filterDate;
      if (modifier === 'LESS_THAN') return studioDate < filterDate;
      if (modifier === 'EQUALS') {
        return studioDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === 'BETWEEN') {
        const filterDate2 = new Date(value2);
        return studioDate >= filterDate && studioDate <= filterDate2;
      }
      return true;
    });
  }

  return filtered;
}

/**
 * Sort studios
 */
function sortStudios(studios: any[], sortField: string, direction: string): any[] {
  const sorted = [...studios];

  sorted.sort((a, b) => {
    const aValue = getStudioFieldValue(a, sortField);
    const bValue = getStudioFieldValue(b, sortField);

    let comparison = 0;
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else {
      const aNum = aValue || 0;
      const bNum = bValue || 0;
      comparison = aNum > bNum ? 1 : aNum < bNum ? -1 : 0;
    }

    if (direction.toUpperCase() === 'DESC') {
      comparison = -comparison;
    }

    // Secondary sort by name
    if (comparison === 0) {
      const aName = a.name || '';
      const bName = b.name || '';
      return aName.localeCompare(bName);
    }

    return comparison;
  });

  return sorted;
}

/**
 * Get field value from studio for sorting
 */
function getStudioFieldValue(studio: any, field: string): any {
  if (field === 'rating') return studio.rating || 0;
  if (field === 'rating100') return studio.rating100 || 0;
  if (field === 'o_counter') return studio.o_counter || 0;
  if (field === 'play_count') return studio.play_count || 0;
  if (field === 'scene_count' || field === 'scenes_count') return studio.scene_count || 0;
  if (field === 'name') return studio.name || '';
  if (field === 'created_at') return studio.created_at || '';
  if (field === 'updated_at') return studio.updated_at || '';
  if (field === 'random') return Math.random();
  return studio[field] || 0;
}

/**
 * Calculate per-user tag statistics from watch history
 * For each tag, aggregate stats from scenes tagged with it
 */
async function calculateTagStats(userId: number): Promise<Map<string, { o_counter: number; play_count: number }>> {
  // Get all scenes from cache
  const scenes = stashCacheManager.getAllScenes();

  // Get all watch history for this user
  const watchHistory = await prisma.watchHistory.findMany({ where: { userId } });
  const watchMap = new Map(
    watchHistory.map((wh) => [wh.sceneId, { o_counter: wh.oCount || 0, play_count: wh.playCount || 0 }])
  );

  // Aggregate stats by tag
  const tagStatsMap = new Map<string, { o_counter: number; play_count: number }>();

  scenes.forEach((scene) => {
    const watchData = watchMap.get(scene.id);
    if (!watchData) return; // Skip scenes not watched by this user

    // Aggregate to all tags in this scene
    (scene.tags || []).forEach((tag) => {
      const existing = tagStatsMap.get(tag.id) || { o_counter: 0, play_count: 0 };
      tagStatsMap.set(tag.id, {
        o_counter: existing.o_counter + watchData.o_counter,
        play_count: existing.play_count + watchData.play_count,
      });
    });
  });

  return tagStatsMap;
}

/**
 * Merge user-specific data into tags
 */
async function mergeTagsWithUserData(
  tags: any[],
  userId: number
): Promise<any[]> {
  // Fetch user ratings and stats in parallel
  const [ratings, tagStats] = await Promise.all([
    prisma.tagRating.findMany({ where: { userId } }),
    calculateTagStats(userId),
  ]);

  const ratingMap = new Map(
    ratings.map((r) => [
      r.tagId,
      {
        rating: r.rating,
        rating100: r.rating,
        favorite: r.favorite,
      },
    ])
  );

  // Merge data
  return tags.map((tag) => ({
    ...tag,
    ...ratingMap.get(tag.id),
    ...(tagStats.get(tag.id) || { o_counter: 0, play_count: 0 }),
  }));
}

/**
 * Simplified findTags using cache
 */
export const findTags = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { filter, tag_filter, ids } = req.body;

    const sortField = filter?.sort || 'name';
    const sortDirection = filter?.direction || 'ASC';
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || '';

    // Step 1: Get all tags from cache
    let tags = stashCacheManager.getAllTags();

    if (tags.length === 0) {
      logger.warn('Cache not initialized, returning empty result');
      return res.json({
        findTags: {
          count: 0,
          tags: [],
        },
      });
    }

    // Step 2: Merge with user data
    tags = await mergeTagsWithUserData(tags, userId);

    // Step 3: Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      tags = tags.filter((t) => {
        const name = t.name || '';
        const description = t.description || '';
        return name.toLowerCase().includes(lowerQuery) || description.toLowerCase().includes(lowerQuery);
      });
    }

    // Step 4: Apply filters (merge root-level ids with tag_filter)
    const mergedFilter = { ...tag_filter, ids: ids || tag_filter?.ids };
    tags = applyTagFilters(tags, mergedFilter);

    // Step 5: Sort
    tags = sortTags(tags, sortField, sortDirection);

    // Step 6: Paginate
    const total = tags.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedTags = tags.slice(startIndex, endIndex);

    res.json({
      findTags: {
        count: total,
        tags: paginatedTags,
      },
    });
  } catch (error) {
    logger.error('Error in findTags', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      error: 'Failed to find tags',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Apply tag filters
 */
function applyTagFilters(tags: any[], filters: any): any[] {
  if (!filters) return tags;

  let filtered = tags;

  // Filter by IDs (for detail pages)
  if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
    const idSet = new Set(filters.ids);
    filtered = filtered.filter((t) => idSet.has(t.id));
  }

  // Filter by favorite
  if (filters.favorite !== undefined) {
    filtered = filtered.filter((t) => t.favorite === filters.favorite);
  }

  // Filter by rating100
  if (filters.rating100) {
    const { modifier, value, value2 } = filters.rating100;
    filtered = filtered.filter((t) => {
      const rating = t.rating100 || 0;
      if (modifier === 'GREATER_THAN') return rating > value;
      if (modifier === 'LESS_THAN') return rating < value;
      if (modifier === 'EQUALS') return rating === value;
      if (modifier === 'NOT_EQUALS') return rating !== value;
      if (modifier === 'BETWEEN') return rating >= value && rating <= value2;
      return true;
    });
  }

  // Filter by o_counter
  if (filters.o_counter) {
    const { modifier, value, value2 } = filters.o_counter;
    filtered = filtered.filter((t) => {
      const oCounter = t.o_counter || 0;
      if (modifier === 'GREATER_THAN') return oCounter > value;
      if (modifier === 'LESS_THAN') return oCounter < value;
      if (modifier === 'EQUALS') return oCounter === value;
      if (modifier === 'NOT_EQUALS') return oCounter !== value;
      if (modifier === 'BETWEEN') return oCounter >= value && oCounter <= value2;
      return true;
    });
  }

  // Filter by play_count
  if (filters.play_count) {
    const { modifier, value, value2 } = filters.play_count;
    filtered = filtered.filter((t) => {
      const playCount = t.play_count || 0;
      if (modifier === 'GREATER_THAN') return playCount > value;
      if (modifier === 'LESS_THAN') return playCount < value;
      if (modifier === 'EQUALS') return playCount === value;
      if (modifier === 'NOT_EQUALS') return playCount !== value;
      if (modifier === 'BETWEEN') return playCount >= value && playCount <= value2;
      return true;
    });
  }

  // Filter by scene_count
  if (filters.scene_count) {
    const { modifier, value, value2 } = filters.scene_count;
    filtered = filtered.filter((t) => {
      const sceneCount = t.scene_count || 0;
      if (modifier === 'GREATER_THAN') return sceneCount > value;
      if (modifier === 'LESS_THAN') return sceneCount < value;
      if (modifier === 'EQUALS') return sceneCount === value;
      if (modifier === 'NOT_EQUALS') return sceneCount !== value;
      if (modifier === 'BETWEEN') return sceneCount >= value && sceneCount <= value2;
      return true;
    });
  }

  // Filter by name (text search)
  if (filters.name) {
    const searchValue = filters.name.value.toLowerCase();
    filtered = filtered.filter((t) => {
      const name = t.name || '';
      return name.toLowerCase().includes(searchValue);
    });
  }

  // Filter by description (text search)
  if (filters.description) {
    const searchValue = filters.description.value.toLowerCase();
    filtered = filtered.filter((t) => {
      const description = t.description || '';
      return description.toLowerCase().includes(searchValue);
    });
  }

  // Filter by created_at (date)
  if (filters.created_at) {
    const { modifier, value, value2 } = filters.created_at;
    filtered = filtered.filter((t) => {
      if (!t.created_at) return false;
      const tagDate = new Date(t.created_at);
      const filterDate = new Date(value);
      if (modifier === 'GREATER_THAN') return tagDate > filterDate;
      if (modifier === 'LESS_THAN') return tagDate < filterDate;
      if (modifier === 'EQUALS') {
        return tagDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === 'BETWEEN') {
        const filterDate2 = new Date(value2);
        return tagDate >= filterDate && tagDate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by updated_at (date)
  if (filters.updated_at) {
    const { modifier, value, value2 } = filters.updated_at;
    filtered = filtered.filter((t) => {
      if (!t.updated_at) return false;
      const tagDate = new Date(t.updated_at);
      const filterDate = new Date(value);
      if (modifier === 'GREATER_THAN') return tagDate > filterDate;
      if (modifier === 'LESS_THAN') return tagDate < filterDate;
      if (modifier === 'EQUALS') {
        return tagDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === 'BETWEEN') {
        const filterDate2 = new Date(value2);
        return tagDate >= filterDate && tagDate <= filterDate2;
      }
      return true;
    });
  }

  return filtered;
}

/**
 * Sort tags
 */
function sortTags(tags: any[], sortField: string, direction: string): any[] {
  const sorted = [...tags];

  sorted.sort((a, b) => {
    const aValue = getTagFieldValue(a, sortField);
    const bValue = getTagFieldValue(b, sortField);

    let comparison = 0;
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else {
      const aNum = aValue || 0;
      const bNum = bValue || 0;
      comparison = aNum > bNum ? 1 : aNum < bNum ? -1 : 0;
    }

    if (direction.toUpperCase() === 'DESC') {
      comparison = -comparison;
    }

    // Secondary sort by name
    if (comparison === 0) {
      const aName = a.name || '';
      const bName = b.name || '';
      return aName.localeCompare(bName);
    }

    return comparison;
  });

  return sorted;
}

/**
 * Get field value from tag for sorting
 */
function getTagFieldValue(tag: any, field: string): any {
  if (field === 'rating') return tag.rating || 0;
  if (field === 'rating100') return tag.rating100 || 0;
  if (field === 'o_counter') return tag.o_counter || 0;
  if (field === 'play_count') return tag.play_count || 0;
  if (field === 'scene_count' || field === 'scenes_count') return tag.scene_count || 0;
  if (field === 'name') return tag.name || '';
  if (field === 'created_at') return tag.created_at || '';
  if (field === 'updated_at') return tag.updated_at || '';
  if (field === 'random') return Math.random();
  return tag[field] || 0;
}

/**
 * Get minimal performers (id + name only) for filter dropdowns
 */
export const findPerformersMinimal = async (req: Request, res: Response) => {
  try {
    const { filter } = req.body;
    const searchQuery = filter?.q || '';
    const sortField = filter?.sort || 'name';
    const sortDirection = filter?.direction || 'ASC';
    const perPage = filter?.per_page || -1; // -1 means all results

    let performers = stashCacheManager.getAllPerformers();

    // Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      performers = performers.filter((p) => {
        const name = p.name || '';
        const aliases = p.alias_list?.join(' ') || '';
        return name.toLowerCase().includes(lowerQuery) || aliases.toLowerCase().includes(lowerQuery);
      });
    }

    // Sort
    performers.sort((a, b) => {
      const aValue = (a as any)[sortField] || '';
      const bValue = (b as any)[sortField] || '';
      const comparison = typeof aValue === 'string'
        ? aValue.localeCompare(bValue)
        : aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      return sortDirection.toUpperCase() === 'DESC' ? -comparison : comparison;
    });

    // Paginate (if per_page !== -1)
    let paginatedPerformers = performers;
    if (perPage !== -1 && perPage > 0) {
      paginatedPerformers = performers.slice(0, perPage);
    }

    const minimal = paginatedPerformers.map((p) => ({ id: p.id, name: p.name }));

    res.json({
      performers: minimal,
    });
  } catch (error) {
    logger.error('Error in findPerformersMinimal', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      error: 'Failed to find performers',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get minimal studios (id + name only) for filter dropdowns
 */
export const findStudiosMinimal = async (req: Request, res: Response) => {
  try {
    const { filter } = req.body;
    const searchQuery = filter?.q || '';
    const sortField = filter?.sort || 'name';
    const sortDirection = filter?.direction || 'ASC';
    const perPage = filter?.per_page || -1; // -1 means all results

    let studios = stashCacheManager.getAllStudios();

    // Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      studios = studios.filter((s) => {
        const name = s.name || '';
        const details = s.details || '';
        return name.toLowerCase().includes(lowerQuery) || details.toLowerCase().includes(lowerQuery);
      });
    }

    // Sort
    studios.sort((a, b) => {
      const aValue = (a as any)[sortField] || '';
      const bValue = (b as any)[sortField] || '';
      const comparison = typeof aValue === 'string'
        ? aValue.localeCompare(bValue)
        : aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      return sortDirection.toUpperCase() === 'DESC' ? -comparison : comparison;
    });

    // Paginate (if per_page !== -1)
    let paginatedStudios = studios;
    if (perPage !== -1 && perPage > 0) {
      paginatedStudios = studios.slice(0, perPage);
    }

    const minimal = paginatedStudios.map((s) => ({ id: s.id, name: s.name }));

    res.json({
      studios: minimal,
    });
  } catch (error) {
    logger.error('Error in findStudiosMinimal', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      error: 'Failed to find studios',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get minimal tags (id + name only) for filter dropdowns
 */
export const findTagsMinimal = async (req: Request, res: Response) => {
  try {
    const { filter } = req.body;
    const searchQuery = filter?.q || '';
    const sortField = filter?.sort || 'name';
    const sortDirection = filter?.direction || 'ASC';
    const perPage = filter?.per_page || -1; // -1 means all results

    let tags = stashCacheManager.getAllTags();

    // Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      tags = tags.filter((t) => {
        const name = t.name || '';
        const description = t.description || '';
        return name.toLowerCase().includes(lowerQuery) || description.toLowerCase().includes(lowerQuery);
      });
    }

    // Sort
    tags.sort((a, b) => {
      const aValue = (a as any)[sortField] || '';
      const bValue = (b as any)[sortField] || '';
      const comparison = typeof aValue === 'string'
        ? aValue.localeCompare(bValue)
        : aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      return sortDirection.toUpperCase() === 'DESC' ? -comparison : comparison;
    });

    // Paginate (if per_page !== -1)
    let paginatedTags = tags;
    if (perPage !== -1 && perPage > 0) {
      paginatedTags = tags.slice(0, perPage);
    }

    const minimal = paginatedTags.map((t) => ({ id: t.id, name: t.name }));

    res.json({
      tags: minimal,
    });
  } catch (error) {
    logger.error('Error in findTagsMinimal', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      error: 'Failed to find tags',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

export const updateScene = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const updateData = req.body;

    const stash = getStash();
    const updatedScene = await stash.sceneUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    // Override with per-user watch history
    const sceneWithUserHistory = await mergeScenesWithUserData(
      [updatedScene.sceneUpdate],
      userId
    );

    res.json({ success: true, scene: sceneWithUserHistory[0] });
  } catch (error) {
    console.error("Error updating scene:", error);
    res.status(500).json({ error: "Failed to update scene" });
  }
};

export const updatePerformer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const stash = getStash();
    const updatedPerformer = await stash.performerUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    res.json({ success: true, performer: updatedPerformer.performerUpdate });
  } catch (error) {
    console.error("Error updating performer:", error);
    res.status(500).json({ error: "Failed to update performer" });
  }
};

export const updateStudio = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const stash = getStash();
    const updatedStudio = await stash.studioUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    res.json({ success: true, studio: updatedStudio.studioUpdate });
  } catch (error) {
    console.error("Error updating studio:", error);
    res.status(500).json({ error: "Failed to update studio" });
  }
};

export const updateTag = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const stash = getStash();
    const updatedTag = await stash.tagUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    res.json({ success: true, tag: updatedTag.tagUpdate });
  } catch (error) {
    console.error("Error updating tag:", error);
    res.status(500).json({ error: "Failed to update tag" });
  }
};

/**
 * Find similar scenes based on weighted scoring
 * Performers: 3 points each
 * Tags: 1 point each (squashed from scene, performers, studio)
 * Studio: 1 point
 */
export const findSimilarScenes = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = 12; // Fixed at 12 scenes per page
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get all scenes from cache
    const allScenes = stashCacheManager.getAllScenes();

    // Find the current scene
    const currentScene = allScenes.find((s: NormalizedScene) => s.id === id);
    if (!currentScene) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    // Helper to get squashed tags (scene + performers + studio)
    const getSquashedTagIds = (scene: NormalizedScene): Set<string> => {
      const tagIds = new Set<string>();

      // Scene tags
      (scene.tags || []).forEach((t: any) => tagIds.add(String(t.id)));

      // Performer tags
      (scene.performers || []).forEach((p: any) => {
        (p.tags || []).forEach((t: any) => tagIds.add(String(t.id)));
      });

      // Studio tags
      if (scene.studio?.tags) {
        scene.studio.tags.forEach((t: any) => tagIds.add(String(t.id)));
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
      (currentScene.performers || []).map((p: any) => String(p.id))
    );
    const currentStudioId = currentScene.studio?.id ? String(currentScene.studio.id) : null;
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
    const paginatedScenes = scoredScenes.slice(startIndex, endIndex).map(s => s.scene);

    // Merge with user data
    const scenesWithUserData = await mergeScenesWithUserData(paginatedScenes, userId);

    res.json({
      scenes: scenesWithUserData,
      count: scoredScenes.length,
      page,
      perPage,
    });
  } catch (error: any) {
    logger.error('Error finding similar scenes:', error);
    res.status(500).json({ error: 'Failed to find similar scenes' });
  }
};

/**
 * Get recommended scenes based on user preferences and watch history
 * Uses favorites, ratings (80+), watch status, and engagement quality
 */
export const getRecommendedScenes = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 24;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Fetch user ratings and watch history
    const [performerRatings, studioRatings, tagRatings, watchHistory] = await Promise.all([
      prisma.performerRating.findMany({ where: { userId } }),
      prisma.studioRating.findMany({ where: { userId } }),
      prisma.tagRating.findMany({ where: { userId } }),
      prisma.watchHistory.findMany({ where: { userId } }),
    ]);

    // Build sets of favorite and highly-rated entities
    const favoritePerformers = new Set(
      performerRatings.filter(r => r.favorite).map(r => r.performerId)
    );
    const highlyRatedPerformers = new Set(
      performerRatings.filter(r => r.rating !== null && r.rating >= 80).map(r => r.performerId)
    );
    const favoriteStudios = new Set(
      studioRatings.filter(r => r.favorite).map(r => r.studioId)
    );
    const highlyRatedStudios = new Set(
      studioRatings.filter(r => r.rating !== null && r.rating >= 80).map(r => r.studioId)
    );
    const favoriteTags = new Set(
      tagRatings.filter(r => r.favorite).map(r => r.tagId)
    );
    const highlyRatedTags = new Set(
      tagRatings.filter(r => r.rating !== null && r.rating >= 80).map(r => r.tagId)
    );

    // Check if user has any favorites or highly-rated entities
    const hasCriteria =
      favoritePerformers.size > 0 || highlyRatedPerformers.size > 0 ||
      favoriteStudios.size > 0 || highlyRatedStudios.size > 0 ||
      favoriteTags.size > 0 || highlyRatedTags.size > 0;

    if (!hasCriteria) {
      return res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
        message: 'Rate or favorite some performers, studios, or tags to get recommendations',
      });
    }

    // Build watch history map
    const watchMap = new Map(
      watchHistory.map(wh => {
        const playHistory = Array.isArray(wh.playHistory)
          ? wh.playHistory
          : JSON.parse((wh.playHistory as string) || '[]');
        const lastPlayedAt = playHistory.length > 0
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

    // Helper to get squashed tags
    const getSquashedTagIds = (scene: NormalizedScene): Set<string> => {
      const tagIds = new Set<string>();
      (scene.tags || []).forEach((t: any) => tagIds.add(String(t.id)));
      (scene.performers || []).forEach((p: any) => {
        (p.tags || []).forEach((t: any) => tagIds.add(String(t.id)));
      });
      if (scene.studio?.tags) {
        scene.studio.tags.forEach((t: any) => tagIds.add(String(t.id)));
      }
      return tagIds;
    };

    // Score all scenes
    interface ScoredScene {
      scene: NormalizedScene;
      score: number;
    }

    const scoredScenes: ScoredScene[] = [];
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const scene of allScenes) {
      let baseScore = 0;

      // Score performers
      if (scene.performers) {
        for (const performer of scene.performers) {
          const performerId = String(performer.id);
          if (favoritePerformers.has(performerId)) {
            baseScore += 5;
          } else if (highlyRatedPerformers.has(performerId)) {
            baseScore += 3;
          }
        }
      }

      // Score studio
      if (scene.studio) {
        const studioId = String(scene.studio.id);
        if (favoriteStudios.has(studioId)) {
          baseScore += 3;
        } else if (highlyRatedStudios.has(studioId)) {
          baseScore += 2;
        }
      }

      // Score tags (squashed)
      const sceneTagIds = getSquashedTagIds(scene);
      for (const tagId of sceneTagIds) {
        if (favoriteTags.has(tagId)) {
          baseScore += 1;
        } else if (highlyRatedTags.has(tagId)) {
          baseScore += 0.5;
        }
      }

      // Skip if no base score (doesn't match any criteria)
      if (baseScore === 0) continue;

      // Watch status modifier
      const watchData = watchMap.get(scene.id);
      if (!watchData || watchData.playCount === 0) {
        // Never watched
        baseScore += 100;
      } else if (watchData.lastPlayedAt) {
        const daysSinceWatched = (now.getTime() - watchData.lastPlayedAt.getTime()) / (24 * 60 * 60 * 1000);

        if (daysSinceWatched > 14) {
          // Not recently watched
          baseScore += 50;
        } else if (daysSinceWatched >= 1) {
          // Recently watched (1-14 days)
          baseScore -= 50;
        } else {
          // Very recently watched (<24 hours)
          baseScore -= 100;
        }
      }

      // Engagement quality multiplier
      const oCounter = scene.o_counter || 0;
      const engagementMultiplier = 1.0 + (Math.min(oCounter, 10) * 0.03);
      const finalScore = baseScore * engagementMultiplier;

      // Only include scenes with positive final scores
      if (finalScore > 0) {
        scoredScenes.push({ scene, score: finalScore });
      }
    }

    // Sort by score descending
    scoredScenes.sort((a, b) => b.score - a.score);

    // Cap at top 500 recommendations
    const cappedScenes = scoredScenes.slice(0, 500);

    // Paginate
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedScenes = cappedScenes.slice(startIndex, endIndex).map(s => s.scene);

    // Merge with user data
    const scenesWithUserData = await mergeScenesWithUserData(paginatedScenes, userId);

    res.json({
      scenes: scenesWithUserData,
      count: cappedScenes.length,
      page,
      perPage,
    });
  } catch (error: any) {
    logger.error('Error getting recommended scenes:', error);
    res.status(500).json({ error: 'Failed to get recommended scenes' });
  }
};
