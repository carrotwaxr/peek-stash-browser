/**
 * Simplified library controller using StashCacheManager
 * This replaces the complex conditional logic with straightforward array operations
 */

import type { Request, Response } from 'express';
import prisma from '../prisma/singleton.js';
import { stashCacheManager } from '../services/StashCacheManager.js';
import { logger } from '../utils/logger.js';
import type { NormalizedScene } from '../services/StashCacheManager.js';

/**
 * Merge user-specific data into scenes
 */
async function mergeScenesWithUserData(
  scenes: NormalizedScene[],
  userId: number
): Promise<NormalizedScene[]> {
  // Fetch user data in parallel
  const [watchHistory, ratings] = await Promise.all([
    prisma.watchHistory.findMany({ where: { userId } }),
    prisma.sceneRating.findMany({ where: { userId } }),
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
        },
      ];
    })
  );

  const ratingMap = new Map(
    ratings.map((r) => [
      r.sceneId,
      {
        rating: r.rating,
        rating100: r.rating, // Alias for consistency with Stash API
        favorite: r.favorite,
      },
    ])
  );

  // Merge data
  return scenes.map((scene) => ({
    ...scene,
    ...watchMap.get(scene.id),
    ...ratingMap.get(scene.id),
  }));
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
    const { modifier, value } = filters.rating100;
    filtered = filtered.filter((s) => {
      const rating = s.rating100 || 0;
      if (modifier === 'GREATER_THAN') return rating > value;
      if (modifier === 'LESS_THAN') return rating < value;
      if (modifier === 'EQUALS') return rating === value;
      if (modifier === 'NOT_EQUALS') return rating !== value;
      return true;
    });
  }

  // Filter by performers
  if (filters.performers) {
    const { value: performerIds, modifier } = filters.performers;
    filtered = filtered.filter((s) => {
      const scenePerformerIds = (s.performers || []).map((p) => p.id);
      if (modifier === 'INCLUDES') {
        return performerIds.some((id: string) => scenePerformerIds.includes(id));
      }
      if (modifier === 'INCLUDES_ALL') {
        return performerIds.every((id: string) => scenePerformerIds.includes(id));
      }
      if (modifier === 'EXCLUDES') {
        return !performerIds.some((id: string) => scenePerformerIds.includes(id));
      }
      return true;
    });
  }

  // Filter by tags
  if (filters.tags) {
    const { value: tagIds, modifier } = filters.tags;
    filtered = filtered.filter((s) => {
      const sceneTagIds = (s.tags || []).map((t) => t.id);
      if (modifier === 'INCLUDES') {
        return tagIds.some((id: string) => sceneTagIds.includes(id));
      }
      if (modifier === 'INCLUDES_ALL') {
        return tagIds.every((id: string) => sceneTagIds.includes(id));
      }
      if (modifier === 'EXCLUDES') {
        return !tagIds.some((id: string) => sceneTagIds.includes(id));
      }
      return true;
    });
  }

  // Filter by studios
  if (filters.studios) {
    const { value: studioIds, modifier } = filters.studios;
    filtered = filtered.filter((s) => {
      if (!s.studio) return modifier === 'EXCLUDES';
      if (modifier === 'INCLUDES') {
        return studioIds.includes(s.studio.id);
      }
      if (modifier === 'EXCLUDES') {
        return !studioIds.includes(s.studio.id);
      }
      return true;
    });
  }

  // Filter by bitrate
  if (filters.bitrate) {
    const { modifier, value } = filters.bitrate;
    filtered = filtered.filter((s) => {
      const bitrate = s.files?.[0]?.bit_rate || 0;
      if (modifier === 'GREATER_THAN') return bitrate > value;
      if (modifier === 'LESS_THAN') return bitrate < value;
      if (modifier === 'EQUALS') return bitrate === value;
      return true;
    });
  }

  // Filter by duration
  if (filters.duration) {
    const { modifier, value } = filters.duration;
    filtered = filtered.filter((s) => {
      const duration = s.files?.[0]?.duration || 0;
      if (modifier === 'GREATER_THAN') return duration > value;
      if (modifier === 'LESS_THAN') return duration < value;
      if (modifier === 'EQUALS') return duration === value;
      return true;
    });
  }

  // Filter by date (created_at)
  if (filters.created_at) {
    const { modifier, value } = filters.created_at;
    filtered = filtered.filter((s) => {
      if (!s.created_at) return false;
      const sceneDate = new Date(s.created_at);
      const filterDate = new Date(value);
      if (modifier === 'GREATER_THAN') return sceneDate > filterDate;
      if (modifier === 'LESS_THAN') return sceneDate < filterDate;
      if (modifier === 'EQUALS') {
        return sceneDate.toDateString() === filterDate.toDateString();
      }
      return true;
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

  // Rating fields
  if (field === 'rating') return scene.rating || 0;
  if (field === 'rating100') return scene.rating100 || 0;

  // Standard Stash fields
  if (field === 'date') return scene.date || '';
  if (field === 'created_at') return scene.created_at || '';
  if (field === 'updated_at') return scene.updated_at || '';
  if (field === 'title') return scene.title || '';
  if (field === 'random') return Math.random();

  // File fields
  if (field === 'bitrate') return scene.files?.[0]?.bit_rate || 0;
  if (field === 'duration') return scene.files?.[0]?.duration || 0;
  if (field === 'filesize') return scene.files?.[0]?.size || 0;

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

    // Step 3: Apply filters (merge root-level ids with scene_filter)
    const mergedFilter = { ...scene_filter, ids: ids || scene_filter?.ids };
    scenes = applySceneFilters(scenes, mergedFilter);

    // Step 4: Sort
    scenes = sortScenes(scenes, sortField, sortDirection);

    // Step 5: Paginate
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
async function calculatePerformerStats(userId: number): Promise<Map<string, { o_counter: number; play_count: number }>> {
  // Get all scenes from cache
  const scenes = stashCacheManager.getAllScenes();

  // Get all watch history for this user
  const watchHistory = await prisma.watchHistory.findMany({ where: { userId } });
  const watchMap = new Map(
    watchHistory.map((wh) => [wh.sceneId, { o_counter: wh.oCount || 0, play_count: wh.playCount || 0 }])
  );

  // Aggregate stats by performer
  const performerStatsMap = new Map<string, { o_counter: number; play_count: number }>();

  scenes.forEach((scene) => {
    const watchData = watchMap.get(scene.id);
    if (!watchData) return; // Skip scenes not watched by this user

    // Aggregate to all performers in this scene
    (scene.performers || []).forEach((performer) => {
      const existing = performerStatsMap.get(performer.id) || { o_counter: 0, play_count: 0 };
      performerStatsMap.set(performer.id, {
        o_counter: existing.o_counter + watchData.o_counter,
        play_count: existing.play_count + watchData.play_count,
      });
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
  return performers.map((performer) => ({
    ...performer,
    ...ratingMap.get(performer.id),
    ...(performerStats.get(performer.id) || { o_counter: 0, play_count: 0 }),
  }));
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

    // Step 3: Apply filters (merge root-level ids with performer_filter)
    const mergedFilter = { ...performer_filter, ids: ids || performer_filter?.ids };
    performers = applyPerformerFilters(performers, mergedFilter);

    // Step 4: Sort
    performers = sortPerformers(performers, sortField, sortDirection);

    // Step 5: Paginate
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

  // Filter by rating100
  if (filters.rating100) {
    const { modifier, value } = filters.rating100;
    filtered = filtered.filter((p) => {
      const rating = p.rating100 || 0;
      if (modifier === 'GREATER_THAN') return rating > value;
      if (modifier === 'LESS_THAN') return rating < value;
      if (modifier === 'EQUALS') return rating === value;
      if (modifier === 'NOT_EQUALS') return rating !== value;
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
  if (field === 'name') return performer.name || '';
  if (field === 'created_at') return performer.created_at || '';
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

    // Step 3: Apply filters (merge root-level ids with studio_filter)
    const mergedFilter = { ...studio_filter, ids: ids || studio_filter?.ids };
    studios = applyStudioFilters(studios, mergedFilter);

    // Step 4: Sort
    studios = sortStudios(studios, sortField, sortDirection);

    // Step 5: Paginate
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
    const { modifier, value } = filters.rating100;
    filtered = filtered.filter((s) => {
      const rating = s.rating100 || 0;
      if (modifier === 'GREATER_THAN') return rating > value;
      if (modifier === 'LESS_THAN') return rating < value;
      if (modifier === 'EQUALS') return rating === value;
      if (modifier === 'NOT_EQUALS') return rating !== value;
      return true;
    });
  }

  // Filter by o_counter
  if (filters.o_counter) {
    const { modifier, value } = filters.o_counter;
    filtered = filtered.filter((s) => {
      const oCounter = s.o_counter || 0;
      if (modifier === 'GREATER_THAN') return oCounter > value;
      if (modifier === 'LESS_THAN') return oCounter < value;
      if (modifier === 'EQUALS') return oCounter === value;
      if (modifier === 'NOT_EQUALS') return oCounter !== value;
      return true;
    });
  }

  // Filter by play_count
  if (filters.play_count) {
    const { modifier, value } = filters.play_count;
    filtered = filtered.filter((s) => {
      const playCount = s.play_count || 0;
      if (modifier === 'GREATER_THAN') return playCount > value;
      if (modifier === 'LESS_THAN') return playCount < value;
      if (modifier === 'EQUALS') return playCount === value;
      if (modifier === 'NOT_EQUALS') return playCount !== value;
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
  if (field === 'name') return studio.name || '';
  if (field === 'created_at') return studio.created_at || '';
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

    // Step 3: Apply filters (merge root-level ids with tag_filter)
    const mergedFilter = { ...tag_filter, ids: ids || tag_filter?.ids };
    tags = applyTagFilters(tags, mergedFilter);

    // Step 4: Sort
    tags = sortTags(tags, sortField, sortDirection);

    // Step 5: Paginate
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
    const { modifier, value } = filters.rating100;
    filtered = filtered.filter((t) => {
      const rating = t.rating100 || 0;
      if (modifier === 'GREATER_THAN') return rating > value;
      if (modifier === 'LESS_THAN') return rating < value;
      if (modifier === 'EQUALS') return rating === value;
      if (modifier === 'NOT_EQUALS') return rating !== value;
      return true;
    });
  }

  // Filter by o_counter
  if (filters.o_counter) {
    const { modifier, value } = filters.o_counter;
    filtered = filtered.filter((t) => {
      const oCounter = t.o_counter || 0;
      if (modifier === 'GREATER_THAN') return oCounter > value;
      if (modifier === 'LESS_THAN') return oCounter < value;
      if (modifier === 'EQUALS') return oCounter === value;
      if (modifier === 'NOT_EQUALS') return oCounter !== value;
      return true;
    });
  }

  // Filter by play_count
  if (filters.play_count) {
    const { modifier, value } = filters.play_count;
    filtered = filtered.filter((t) => {
      const playCount = t.play_count || 0;
      if (modifier === 'GREATER_THAN') return playCount > value;
      if (modifier === 'LESS_THAN') return playCount < value;
      if (modifier === 'EQUALS') return playCount === value;
      if (modifier === 'NOT_EQUALS') return playCount !== value;
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
  if (field === 'name') return tag.name || '';
  if (field === 'created_at') return tag.created_at || '';
  if (field === 'random') return Math.random();
  return tag[field] || 0;
}

/**
 * Get minimal performers (id + name only) for filter dropdowns
 */
export const findPerformersMinimal = async (req: Request, res: Response) => {
  try {
    const performers = stashCacheManager.getAllPerformers();
    const minimal = performers.map((p) => ({ id: p.id, name: p.name }));

    res.json({
      findPerformers: {
        count: minimal.length,
        performers: minimal,
      },
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
    const studios = stashCacheManager.getAllStudios();
    const minimal = studios.map((s) => ({ id: s.id, name: s.name }));

    res.json({
      findStudios: {
        count: minimal.length,
        studios: minimal,
      },
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
    const tags = stashCacheManager.getAllTags();
    const minimal = tags.map((t) => ({ id: t.id, name: t.name }));

    res.json({
      findTags: {
        count: minimal.length,
        tags: minimal,
      },
    });
  } catch (error) {
    logger.error('Error in findTagsMinimal', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      error: 'Failed to find tags',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
