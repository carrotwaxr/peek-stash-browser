import {
  Scene,
  SceneFilterType,
  PerformerFilterType,
  StudioFilterType,
  TagFilterType,
} from "stashapp-api";
import { Request, Response } from "express";
import getStash from "../stash.js";
import {
  FindScenesQuery,
  FindPerformersQuery,
  FindStudiosQuery,
  FindTagsQuery,
  FindFilterType,
} from "stashapp-api/dist/generated/graphql.js";
import {
  transformScene,
  transformPerformer,
  transformStudio,
  transformTag,
} from "../utils/pathMapping.js";
import prisma from "../prisma/singleton.js";

/**
 * Override scene watch history fields with per-user data from Peek database
 * This ensures each Peek user sees ONLY their own activity, not Stash's aggregate
 */
export async function injectUserWatchHistory(scenes: any[], userId: number): Promise<any[]> {
  if (!scenes || scenes.length === 0) {
    return scenes;
  }

  // Fetch watch history for these scenes for this user
  const sceneIds = scenes.map((s) => s.id);
  const watchHistoryRecords = await prisma.watchHistory.findMany({
    where: {
      userId: userId,
      sceneId: { in: sceneIds },
    },
  });

  // Create lookup map
  const watchHistoryMap = new Map();
  for (const wh of watchHistoryRecords) {
    // Parse JSON fields
    const oHistory = Array.isArray(wh.oHistory)
      ? wh.oHistory
      : JSON.parse((wh.oHistory as string) || "[]");
    const playHistory = Array.isArray(wh.playHistory)
      ? wh.playHistory
      : JSON.parse((wh.playHistory as string) || "[]");

    watchHistoryMap.set(wh.sceneId, {
      resume_time: wh.resumeTime || 0,
      play_duration: wh.playDuration || 0,
      play_count: wh.playCount || 0,
      play_history: playHistory,
      o_counter: wh.oCount || 0,
      o_history: oHistory,
    });
  }

  // Override scene fields with per-user values
  return scenes.map((scene) => {
    const userWatchHistory = watchHistoryMap.get(scene.id);

    if (userWatchHistory) {
      return {
        ...scene,
        ...userWatchHistory,
      };
    }

    // No watch history for this user - return zeros
    return {
      ...scene,
      resume_time: 0,
      play_duration: 0,
      play_count: 0,
      play_history: [],
      o_counter: 0,
      o_history: [],
    };
  });
}

/**
 * Override scene rating/favorite fields with per-user data from Peek database
 */
export async function injectUserSceneRatings(scenes: any[], userId: number): Promise<any[]> {
  if (!scenes || scenes.length === 0) {
    return scenes;
  }

  // Fetch ratings for these scenes for this user
  const sceneIds = scenes.map((s) => s.id);
  const ratingRecords = await prisma.sceneRating.findMany({
    where: {
      userId: userId,
      sceneId: { in: sceneIds },
    },
  });

  // Create lookup map
  const ratingMap = new Map();
  for (const rating of ratingRecords) {
    ratingMap.set(rating.sceneId, {
      rating: rating.rating,
      rating100: rating.rating, // Stash uses rating100
      favorite: rating.favorite,
    });
  }

  // Override scene fields with per-user values
  return scenes.map((scene) => {
    const userRating = ratingMap.get(scene.id);

    if (userRating) {
      return {
        ...scene,
        ...userRating,
      };
    }

    // No rating for this user - return nulls/defaults
    return {
      ...scene,
      rating: null,
      rating100: null,
      favorite: false,
    };
  });
}

/**
 * Override performer rating/favorite fields with per-user data from Peek database
 */
export async function injectUserPerformerRatings(performers: any[], userId: number): Promise<any[]> {
  if (!performers || performers.length === 0) {
    return performers;
  }

  // Fetch ratings for these performers for this user
  const performerIds = performers.map((p) => p.id);
  const ratingRecords = await prisma.performerRating.findMany({
    where: {
      userId: userId,
      performerId: { in: performerIds },
    },
  });

  // Create lookup map
  const ratingMap = new Map();
  for (const rating of ratingRecords) {
    ratingMap.set(rating.performerId, {
      rating: rating.rating,
      rating100: rating.rating, // Stash uses rating100
      favorite: rating.favorite,
    });
  }

  // Override performer fields with per-user values
  return performers.map((performer) => {
    const userRating = ratingMap.get(performer.id);

    if (userRating) {
      return {
        ...performer,
        ...userRating,
      };
    }

    // No rating for this user - return nulls/defaults
    return {
      ...performer,
      rating: null,
      rating100: null,
      favorite: false,
    };
  });
}

/**
 * Override studio rating/favorite fields with per-user data from Peek database
 */
export async function injectUserStudioRatings(studios: any[], userId: number): Promise<any[]> {
  if (!studios || studios.length === 0) {
    return studios;
  }

  // Fetch ratings for these studios for this user
  const studioIds = studios.map((s) => s.id);
  const ratingRecords = await prisma.studioRating.findMany({
    where: {
      userId: userId,
      studioId: { in: studioIds },
    },
  });

  // Create lookup map
  const ratingMap = new Map();
  for (const rating of ratingRecords) {
    ratingMap.set(rating.studioId, {
      rating: rating.rating,
      rating100: rating.rating, // Stash uses rating100
      favorite: rating.favorite,
    });
  }

  // Override studio fields with per-user values
  return studios.map((studio) => {
    const userRating = ratingMap.get(studio.id);

    if (userRating) {
      return {
        ...studio,
        ...userRating,
      };
    }

    // No rating for this user - return nulls/defaults
    return {
      ...studio,
      rating: null,
      rating100: null,
      favorite: false,
    };
  });
}

/**
 * Override tag rating/favorite fields with per-user data from Peek database
 * NOTE: Tags in Stash only have favorite, not rating - but Peek adds rating support
 */
export async function injectUserTagRatings(tags: any[], userId: number): Promise<any[]> {
  if (!tags || tags.length === 0) {
    return tags;
  }

  // Fetch ratings for these tags for this user
  const tagIds = tags.map((t) => t.id);
  const ratingRecords = await prisma.tagRating.findMany({
    where: {
      userId: userId,
      tagId: { in: tagIds },
    },
  });

  // Create lookup map
  const ratingMap = new Map();
  for (const rating of ratingRecords) {
    ratingMap.set(rating.tagId, {
      rating: rating.rating,
      rating100: rating.rating, // Stash uses rating100
      favorite: rating.favorite,
    });
  }

  // Override tag fields with per-user values
  return tags.map((tag) => {
    const userRating = ratingMap.get(tag.id);

    if (userRating) {
      return {
        ...tag,
        ...userRating,
      };
    }

    // No rating for this user - return nulls/defaults
    return {
      ...tag,
      rating: null,
      rating100: null,
      favorite: false,
    };
  });
}

/**
 * Check if a sort field is a watch history field that needs re-sorting after user data injection
 */
function isWatchHistoryField(field: string): boolean {
  const watchHistoryFields = [
    'play_count',
    'play_duration',
    'o_counter',
    'last_played_at',
    // Stash may use different field names for last_o_at
    'organized_at', // Common alternative
    'o_date', // Another possible field name
  ];
  return watchHistoryFields.includes(field.toLowerCase());
}

/**
 * Get field value from scene object, handling nested properties
 */
function getFieldValue(scene: any, field: string): any {
  // Direct field access
  if (scene[field] !== undefined) {
    return scene[field];
  }

  // Try snake_case to camelCase conversion
  const camelField = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  if (scene[camelField] !== undefined) {
    return scene[camelField];
  }

  return null;
}

/**
 * Check if scene_filter contains any watch history field filters
 */
function hasWatchHistoryFilters(scene_filter: any): boolean {
  if (!scene_filter) return false;

  const watchHistoryFilterFields = [
    'play_count',
    'play_duration',
    'o_counter',
    'last_played_at',
    'last_o_at',
  ];

  return watchHistoryFilterFields.some(field => scene_filter[field] !== undefined);
}

/**
 * Apply watch history field filters to watch history records
 */
function filterWatchHistory(watchHistoryRecords: any[], scene_filter: any): any[] {
  return watchHistoryRecords.filter((wh) => {
    // Parse JSON fields
    const oHistory = Array.isArray(wh.oHistory)
      ? wh.oHistory
      : JSON.parse((wh.oHistory as string) || "[]");
    const playHistory = Array.isArray(wh.playHistory)
      ? wh.playHistory
      : JSON.parse((wh.playHistory as string) || "[]");

    const stats = {
      play_count: wh.playCount || 0,
      play_duration: wh.playDuration || 0,
      o_counter: wh.oCount || 0,
      last_played_at: playHistory.length > 0 ? playHistory[playHistory.length - 1] : null,
      last_o_at: oHistory.length > 0 ? oHistory[oHistory.length - 1] : null,
    };

    // Apply each filter
    for (const [field, filterValue] of Object.entries(scene_filter)) {
      if (!isWatchHistoryField(field)) continue;
      if (!filterValue || typeof filterValue !== 'object') continue;

      const filter = filterValue as any;
      const value = stats[field as keyof typeof stats];

      // Handle different filter modifiers
      if (filter.modifier === 'EQUALS' && value !== filter.value) {
        return false;
      }
      if (filter.modifier === 'NOT_EQUALS' && value === filter.value) {
        return false;
      }
      if (filter.modifier === 'GREATER_THAN' && (value === null || value <= filter.value)) {
        return false;
      }
      if (filter.modifier === 'LESS_THAN' && (value === null || value >= filter.value)) {
        return false;
      }
      if (filter.modifier === 'BETWEEN') {
        if (value === null || value < filter.value || value > filter.value2) {
          return false;
        }
      }
      if (filter.modifier === 'IS_NULL' && value !== null) {
        return false;
      }
      if (filter.modifier === 'NOT_NULL' && value === null) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Remove watch history filters from scene_filter so they don't get sent to Stash
 */
function removeWatchHistoryFilters(scene_filter: any): any {
  if (!scene_filter) return scene_filter;

  const cleaned = { ...scene_filter };
  const watchHistoryFilterFields = [
    'play_count',
    'play_duration',
    'o_counter',
    'last_played_at',
    'last_o_at',
  ];

  watchHistoryFilterFields.forEach(field => {
    delete cleaned[field];
  });

  return cleaned;
}

/**
 * Check if a sort field is a rating field
 */
function isRatingField(field: string): boolean {
  const ratingFields = ['rating', 'rating100', 'favorite'];
  return ratingFields.includes(field.toLowerCase());
}

/**
 * Check if filter contains any rating field filters
 */
function hasRatingFilters(filter: any): boolean {
  if (!filter) return false;
  const ratingFields = ['rating', 'rating100', 'favorite'];
  return ratingFields.some(field => filter[field] !== undefined);
}

/**
 * Remove rating filters from filter object (so Stash doesn't see them)
 */
function removeRatingFilters(filter: any): any {
  if (!filter) return filter;
  const cleaned = { ...filter };
  const ratingFields = ['rating', 'rating100', 'favorite'];
  ratingFields.forEach(field => {
    delete cleaned[field];
  });
  return cleaned;
}

/**
 * Extract rating filter values from filter
 */
function getRatingFilterValues(filter: any): { rating?: any; rating100?: any; favorite?: boolean } {
  return {
    rating: filter?.rating,
    rating100: filter?.rating100,
    favorite: filter?.favorite,
  };
}

/**
 * Apply rating filters to scenes (filter by per-user rating/favorite values)
 */
function applyRatingFilters(scenes: any[], ratingFilters: { rating?: any; rating100?: any; favorite?: boolean }): any[] {
  return scenes.filter(scene => {
    // Filter by favorite
    if (ratingFilters.favorite !== undefined) {
      const sceneFavorite = scene.favorite || false;
      if (sceneFavorite !== ratingFilters.favorite) {
        return false;
      }
    }

    // Filter by rating (if rating filter is implemented in the future)
    if (ratingFilters.rating !== undefined) {
      // Rating filter logic can be added here
      // For now, we only support favorite filtering
    }

    if (ratingFilters.rating100 !== undefined) {
      // Rating100 filter logic can be added here
      // For now, we only support favorite filtering
    }

    return true;
  });
}

/**
 * Custom pagination logic for watch history field sorts
 * Query Peek database first, sort by user's watch history, then fill remainder from Stash
 * Stash query uses same sort field so scenes without watch history are sorted by Stash's aggregate values
 */
async function findScenesWithCustomSort(
  req: Request,
  res: Response,
  userId: number,
  sortField: string,
  sortDirection: string,
  page: number,
  perPage: number,
  scene_filter: any
) {
  try {
    const stash = getStash();

    // Step 1: Get all watch history records for this user from Peek database
    const watchHistoryRecords = await prisma.watchHistory.findMany({
      where: { userId },
    });

    // Create map of sceneId -> watch history stats
    const watchHistoryMap = new Map();
    const sceneIdsWithHistory = watchHistoryRecords.map((wh) => {
      const oHistory = Array.isArray(wh.oHistory)
        ? wh.oHistory
        : JSON.parse((wh.oHistory as string) || "[]");
      const playHistory = Array.isArray(wh.playHistory)
        ? wh.playHistory
        : JSON.parse((wh.playHistory as string) || "[]");

      watchHistoryMap.set(wh.sceneId, {
        sceneId: wh.sceneId,
        resume_time: wh.resumeTime || 0,
        play_duration: wh.playDuration || 0,
        play_count: wh.playCount || 0,
        play_history: playHistory,
        o_counter: wh.oCount || 0,
        o_history: oHistory,
        last_played_at: playHistory.length > 0 ? playHistory[playHistory.length - 1] : null,
      });

      return wh.sceneId;
    });

    // Step 2: Fetch full scene details from Stash for scenes with watch history
    let scenesWithHistory: any[] = [];
    if (sceneIdsWithHistory.length > 0) {
      const historyScenes: FindScenesQuery = await stash.findScenes({
        ids: sceneIdsWithHistory,
        scene_filter: scene_filter as SceneFilterType,
      });

      // Merge watch history stats with scene data
      scenesWithHistory = historyScenes.findScenes.scenes.map((scene) => {
        const transformed = transformScene(scene as Scene);
        const userHistory = watchHistoryMap.get(scene.id);
        return { ...transformed, ...userHistory };
      });

      // Step 3: Sort by requested field (using per-user data) with secondary sort by title
      scenesWithHistory.sort((a, b) => {
        const aValue = getFieldValue(a, sortField) || 0;
        const bValue = getFieldValue(b, sortField) || 0;

        // Primary sort by the requested field
        let comparison = 0;
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else {
          comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        }

        // Apply sort direction
        if (sortDirection.toUpperCase() === 'DESC') {
          comparison = -comparison;
        }

        // Secondary sort by title if primary values are equal
        if (comparison === 0) {
          const aTitle = a.title || '';
          const bTitle = b.title || '';
          return aTitle.localeCompare(bTitle);
        }

        return comparison;
      });
    }

    // Step 4: Get total count from Stash (lightweight query)
    // This ensures accurate pagination regardless of how many scenes have watch history
    const countQuery: FindScenesQuery = await stash.findScenes({
      filter: {
        page: 1,
        per_page: 1, // Minimal fetch, we only need the count
        sort: sortField,
        direction: sortDirection,
      } as FindFilterType,
      scene_filter: scene_filter as SceneFilterType,
    });
    const stashTotalCount = countQuery.findScenes.count || 0;

    // Calculate actual total: Stash's count, accounting for scenes we already have in watch history
    // (avoid double-counting scenes that appear in both Peek watch history AND Stash results)
    const totalCount = scenesWithHistory.length + stashTotalCount - sceneIdsWithHistory.length;

    // Step 5: Calculate pagination
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    // Scenes from watch history that belong on this page
    const historyScenesOnPage = scenesWithHistory.slice(startIndex, endIndex);

    // Step 6: If page isn't full, query Stash for additional scenes
    // Use same sort field so Stash's aggregate values provide meaningful ordering
    // Keep fetching until we have enough scenes or run out of scenes
    const remainingSlots = perPage - historyScenesOnPage.length;
    let fillScenes: any[] = [];

    if (remainingSlots > 0) {
      const historyCount = scenesWithHistory.length;
      const stashSkip = Math.max(0, startIndex - historyCount);

      // Track how many scenes we've collected and offset for pagination
      let collectedCount = 0;
      let currentOffset = stashSkip;
      const batchSize = 120; // Fetch in batches of 120
      const maxAttempts = 5; // Try 5 batches before falling back to full query
      let attempts = 0;
      let exhaustedResults = false;

      // Keep fetching until we have enough scenes or run out
      while (collectedCount < remainingSlots && attempts < maxAttempts) {
        attempts++;

        const fillScenesQuery: FindScenesQuery = await stash.findScenes({
          filter: {
            page: Math.floor(currentOffset / batchSize) + 1,
            per_page: batchSize,
            sort: sortField, // Use same sort field for better UX (Stash's aggregate values)
            direction: sortDirection,
          } as FindFilterType,
          scene_filter: scene_filter as SceneFilterType,
        });

        // If Stash returns no scenes, we've exhausted the results
        if (fillScenesQuery.findScenes.scenes.length === 0) {
          exhaustedResults = true;
          break;
        }

        // Filter out scenes that already have watch history (duplicates)
        const filteredBatch = fillScenesQuery.findScenes.scenes
          .filter((scene) => !sceneIdsWithHistory.includes(scene.id));

        // Transform and add zero watch history values
        const transformedBatch = filteredBatch.map((scene) => {
          const transformed = transformScene(scene as Scene);
          return {
            ...transformed,
            resume_time: 0,
            play_duration: 0,
            play_count: 0,
            play_history: [],
            o_counter: 0,
            o_history: [],
            last_played_at: null,
          };
        });

        // Add to our collection
        fillScenes.push(...transformedBatch);
        collectedCount = fillScenes.length;

        // If we have enough, trim to exact amount needed
        if (collectedCount >= remainingSlots) {
          fillScenes = fillScenes.slice(0, remainingSlots);
          break;
        }

        // Move to next batch
        currentOffset += batchSize;
      }

      // If we still don't have enough scenes after max attempts and didn't exhaust results,
      // do a final expensive query to get ALL scenes (per_page: -1)
      if (attempts >= maxAttempts && collectedCount < remainingSlots && !exhaustedResults) {
        console.warn("Falling back to full scene query after max attempts", {
          attempts,
          collectedCount,
          remainingSlots,
          sceneIdsWithHistory: sceneIdsWithHistory.length,
        });

        const fullQuery: FindScenesQuery = await stash.findScenes({
          filter: {
            per_page: -1, // Get everything
            sort: sortField,
            direction: sortDirection,
          } as FindFilterType,
          scene_filter: scene_filter as SceneFilterType,
        });

        // Filter out all scenes with watch history, skip to correct offset, take what we need
        const allScenesWithoutHistory = fullQuery.findScenes.scenes
          .filter((scene) => !sceneIdsWithHistory.includes(scene.id))
          .slice(stashSkip, stashSkip + remainingSlots);

        // Transform and add zero watch history values
        fillScenes = allScenesWithoutHistory.map((scene) => {
          const transformed = transformScene(scene as Scene);
          return {
            ...transformed,
            resume_time: 0,
            play_duration: 0,
            play_count: 0,
            play_history: [],
            o_counter: 0,
            o_history: [],
            last_played_at: null,
          };
        });
      }
    }

    // Step 7: Combine both groups (history scenes first, then fill scenes)
    const finalScenes = [...historyScenesOnPage, ...fillScenes];

    // Step 8: Inject user ratings
    const scenesWithRatings = await injectUserSceneRatings(finalScenes, userId);

    // Return properly formatted response matching Stash's structure
    res.json({
      findScenes: {
        count: totalCount,
        scenes: scenesWithRatings,
      },
    });
  } catch (error) {
    console.error("Error in findScenesWithCustomSort:", error);
    res.status(500).json({
      error: "Failed to find scenes with custom sort",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// New POST endpoints for filtered searching

export const findScenes = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const userId = (req as any).user?.id;
    const { filter, scene_filter, ids, scene_ids } = req.body;

    const sortField = filter?.sort;
    const sortDirection = filter?.direction || 'DESC';
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;

    // If filtering by watch history fields, only return scenes from user's watch history
    if (hasWatchHistoryFilters(scene_filter)) {
      // Get all watch history for this user
      const watchHistoryRecords = await prisma.watchHistory.findMany({
        where: { userId },
      });

      // Filter watch history by the criteria
      const filteredWatchHistory = filterWatchHistory(watchHistoryRecords, scene_filter);

      // Get scene IDs that match the watch history filter
      const matchingSceneIds = filteredWatchHistory.map(wh => wh.sceneId);

      if (matchingSceneIds.length === 0) {
        // No scenes match the filter
        return res.json({
          findScenes: {
            count: 0,
            scenes: [],
          },
        });
      }

      // Remove watch history filters and rating filters from scene_filter before querying Stash
      let cleanedSceneFilter = removeWatchHistoryFilters(scene_filter);
      const hasRatingFilter = hasRatingFilters(scene_filter);
      const ratingFilterValues = hasRatingFilter ? getRatingFilterValues(scene_filter) : null;
      if (hasRatingFilter) {
        cleanedSceneFilter = removeRatingFilters(cleanedSceneFilter);
      }

      // Query Stash for these specific scenes with remaining filters
      const scenes: FindScenesQuery = await stash.findScenes({
        ids: matchingSceneIds,
        scene_filter: cleanedSceneFilter as SceneFilterType,
      });

      // Transform scenes
      const transformedScenes = scenes.findScenes.scenes.map((s) =>
        transformScene(s as Scene)
      );

      // Inject user watch history
      let scenesWithUserData = await injectUserWatchHistory(transformedScenes, userId);
      // Inject user ratings
      scenesWithUserData = await injectUserSceneRatings(scenesWithUserData, userId);

      // Apply rating filters if present
      if (hasRatingFilter && ratingFilterValues) {
        scenesWithUserData = applyRatingFilters(scenesWithUserData, ratingFilterValues);
      }

      // Sort if needed
      const scenesWithUserHistory = scenesWithUserData;
      if (sortField) {
        scenesWithUserHistory.sort((a, b) => {
          const aValue = getFieldValue(a, sortField) || 0;
          const bValue = getFieldValue(b, sortField) || 0;

          let comparison = 0;
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            comparison = aValue.localeCompare(bValue);
          } else {
            comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
          }

          if (sortDirection.toUpperCase() === 'DESC') {
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
      }

      // Paginate
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedScenes = scenesWithUserHistory.slice(startIndex, endIndex);

      return res.json({
        findScenes: {
          count: scenesWithUserHistory.length,
          scenes: paginatedScenes,
        },
      });
    }

    // If sorting by watch history fields, use custom pagination logic
    if (sortField && isWatchHistoryField(sortField)) {
      return await findScenesWithCustomSort(req, res, userId, sortField, sortDirection, page, perPage, scene_filter);
    }

    // Check if there are rating/favorite filters that need to be handled on Peek side
    const hasRatingFilter = hasRatingFilters(scene_filter);
    const ratingFilterValues = hasRatingFilter ? getRatingFilterValues(scene_filter) : null;

    // Remove rating filters from scene_filter before sending to Stash
    const cleanedSceneFilter = hasRatingFilter ? removeRatingFilters(scene_filter) : scene_filter;

    // Standard Stash query for non-watch-history sorts/filters
    const scenes: FindScenesQuery = await stash.findScenes({
      filter: filter as FindFilterType,
      scene_filter: cleanedSceneFilter as SceneFilterType,
      ids: ids as string[],
      scene_ids: scene_ids as number[],
    });

    const mutatedScenes = scenes.findScenes.scenes.map((s) =>
      transformScene(s as Scene)
    );

    // Override with per-user watch history
    let scenesWithUserData = await injectUserWatchHistory(mutatedScenes, userId);
    // Override with per-user ratings
    scenesWithUserData = await injectUserSceneRatings(scenesWithUserData, userId);

    // Apply rating filters if present
    if (hasRatingFilter && ratingFilterValues) {
      scenesWithUserData = applyRatingFilters(scenesWithUserData, ratingFilterValues);
    }

    res.json({
      ...scenes,
      findScenes: { ...scenes.findScenes, scenes: scenesWithUserData, count: scenesWithUserData.length },
    });
  } catch (error) {
    console.error("Error in findScenes:", error);
    res.status(500).json({
      error: "Failed to find scenes",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const removeEmptyValues = (obj: any) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v != null && v !== "")
  );
};

/**
 * Calculate per-user performer statistics from watch history
 * For each performer, aggregate stats from scenes they appear in that the user has watched
 */
async function calculateUserPerformerStats(userId: number) {
  const stash = getStash();

  // Get all watch history for this user
  const watchHistoryRecords = await prisma.watchHistory.findMany({
    where: { userId },
  });

  if (watchHistoryRecords.length === 0) {
    return new Map(); // No watch history, return empty map
  }

  // Get all scene IDs with watch history
  const sceneIds = watchHistoryRecords.map((wh) => wh.sceneId);

  // Query Stash for these scenes to get their performers
  const scenesQuery: FindScenesQuery = await stash.findScenes({
    ids: sceneIds,
  });

  // Build map of performerId -> stats
  const performerStatsMap = new Map<string, {
    o_counter: number;
    play_count: number;
    last_played_at: string | null;
    last_o_at: string | null;
    play_duration: number;
  }>();

  // For each scene, aggregate stats for each performer
  scenesQuery.findScenes.scenes.forEach((scene) => {
    const watchHistory = watchHistoryRecords.find((wh) => wh.sceneId === scene.id);
    if (!watchHistory) return;

    // Parse JSON fields
    const oHistory = Array.isArray(watchHistory.oHistory)
      ? watchHistory.oHistory
      : JSON.parse((watchHistory.oHistory as string) || "[]");
    const playHistory = Array.isArray(watchHistory.playHistory)
      ? watchHistory.playHistory
      : JSON.parse((watchHistory.playHistory as string) || "[]");

    // Get performers from scene
    const performers = (scene as any).performers || [];

    performers.forEach((performer: any) => {
      const performerId = performer.id;
      const existing = performerStatsMap.get(performerId) || {
        o_counter: 0,
        play_count: 0,
        last_played_at: null,
        last_o_at: null,
        play_duration: 0,
      };

      // Add o_count from this scene
      existing.o_counter += watchHistory.oCount || 0;

      // Increment play_count if this scene was played
      if (watchHistory.playCount > 0) {
        existing.play_count += 1;
      }

      // Add play_duration from this scene
      existing.play_duration += watchHistory.playDuration || 0;

      // Update last_played_at if this scene was played more recently
      if (playHistory.length > 0) {
        const lastPlayed = playHistory[playHistory.length - 1];
        if (!existing.last_played_at || lastPlayed > existing.last_played_at) {
          existing.last_played_at = lastPlayed;
        }
      }

      // Update last_o_at if this scene had O more recently
      if (oHistory.length > 0) {
        const lastO = oHistory[oHistory.length - 1];
        if (!existing.last_o_at || lastO > existing.last_o_at) {
          existing.last_o_at = lastO;
        }
      }

      performerStatsMap.set(performerId, existing);
    });
  });

  return performerStatsMap;
}

/**
 * Override performer watch history fields with per-user data from Peek database
 */
export async function injectUserPerformerStats(performers: any[], userId: number): Promise<any[]> {
  if (!performers || performers.length === 0) {
    return performers;
  }

  // Calculate stats from watch history
  const performerStatsMap = await calculateUserPerformerStats(userId);

  // Override performer fields with per-user values
  return performers.map((performer) => {
    const userStats = performerStatsMap.get(performer.id);

    if (userStats) {
      return {
        ...performer,
        o_counter: userStats.o_counter,
        play_count: userStats.play_count,
        play_duration: userStats.play_duration,
        last_played_at: userStats.last_played_at,
        last_o_at: userStats.last_o_at,
      };
    }

    // No watch history for this user - return zeros
    return {
      ...performer,
      o_counter: 0,
      play_count: 0,
      play_duration: 0,
      last_played_at: null,
      last_o_at: null,
    };
  });
}

/**
 * Check if a sort field is a performer stat field that needs re-sorting after user data injection
 */
function isPerformerStatField(field: string): boolean {
  const performerStatFields = [
    'o_counter',
    'play_count',
    'play_duration',
    'last_played_at',
    'last_o_at',
  ];
  return performerStatFields.includes(field.toLowerCase());
}

/**
 * Check if performer_filter contains any stat field filters
 */
function hasPerformerStatFilters(performer_filter: any): boolean {
  if (!performer_filter) return false;

  const performerStatFilterFields = [
    'o_counter',
    'play_count',
    'play_duration',
    'last_played_at',
    'last_o_at',
  ];

  return performerStatFilterFields.some(field => performer_filter[field] !== undefined);
}

/**
 * Apply performer stat filters to performer stats map
 */
function filterPerformerStats(
  performerStatsMap: Map<string, any>,
  performer_filter: any
): string[] {
  const matchingPerformerIds: string[] = [];

  for (const [performerId, stats] of performerStatsMap.entries()) {
    let matches = true;

    // Apply each filter
    for (const [field, filterValue] of Object.entries(performer_filter)) {
      if (!isPerformerStatField(field)) continue;
      if (!filterValue || typeof filterValue !== 'object') continue;

      const filter = filterValue as any;
      const value = stats[field];

      // Handle different filter modifiers
      if (filter.modifier === 'EQUALS' && value !== filter.value) {
        matches = false;
        break;
      }
      if (filter.modifier === 'NOT_EQUALS' && value === filter.value) {
        matches = false;
        break;
      }
      if (filter.modifier === 'GREATER_THAN' && (value === null || value <= filter.value)) {
        matches = false;
        break;
      }
      if (filter.modifier === 'LESS_THAN' && (value === null || value >= filter.value)) {
        matches = false;
        break;
      }
      if (filter.modifier === 'BETWEEN') {
        if (value === null || value < filter.value || value > filter.value2) {
          matches = false;
          break;
        }
      }
      if (filter.modifier === 'IS_NULL' && value !== null) {
        matches = false;
        break;
      }
      if (filter.modifier === 'NOT_NULL' && value === null) {
        matches = false;
        break;
      }
    }

    if (matches) {
      matchingPerformerIds.push(performerId);
    }
  }

  return matchingPerformerIds;
}

/**
 * Remove performer stat filters from performer_filter so they don't get sent to Stash
 */
function removePerformerStatFilters(performer_filter: any): any {
  if (!performer_filter) return performer_filter;

  const cleaned = { ...performer_filter };
  const performerStatFilterFields = [
    'o_counter',
    'play_count',
    'play_duration',
    'last_played_at',
    'last_o_at',
  ];

  performerStatFilterFields.forEach(field => {
    delete cleaned[field];
  });

  return cleaned;
}

/**
 * Custom pagination logic for performer stat field sorts
 * Calculate per-user stats, sort by those values, then paginate
 */
async function findPerformersWithCustomSort(
  req: Request,
  res: Response,
  userId: number,
  sortField: string,
  sortDirection: string,
  page: number,
  perPage: number,
  performer_filter: any
) {
  try {
    const stash = getStash();

    // Step 1: Get total count from Stash (lightweight query)
    const countQuery: FindPerformersQuery = await stash.findPerformers({
      filter: {
        page: 1,
        per_page: 1,
        sort: sortField,
        direction: sortDirection,
      } as FindFilterType,
      performer_filter: performer_filter as PerformerFilterType,
    });
    const totalCount = countQuery.findPerformers.count || 0;

    // Step 2: Fetch ALL performers matching the filter (we need to calculate stats for all to sort correctly)
    // This is expensive but necessary for accurate per-user sorting
    const allPerformersQuery: FindPerformersQuery = await stash.findPerformers({
      filter: {
        per_page: -1, // Get all performers
      } as FindFilterType,
      performer_filter: performer_filter as PerformerFilterType,
    });

    // Step 3: Transform performers
    const transformedPerformers = allPerformersQuery.findPerformers.performers.map((performer) =>
      transformPerformer(performer as any)
    );

    // Step 4: Inject per-user stats
    let performersWithUserData = await injectUserPerformerStats(transformedPerformers, userId);
    // Inject per-user ratings
    performersWithUserData = await injectUserPerformerRatings(performersWithUserData, userId);
    const performersWithUserStats = performersWithUserData;

    // Step 5: Sort by requested field
    performersWithUserStats.sort((a, b) => {
      const aValue = getFieldValue(a, sortField) || 0;
      const bValue = getFieldValue(b, sortField) || 0;

      // Primary sort by the requested field
      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else {
        comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }

      // Apply sort direction
      if (sortDirection.toUpperCase() === 'DESC') {
        comparison = -comparison;
      }

      // Secondary sort by name if primary values are equal
      if (comparison === 0) {
        const aName = a.name || '';
        const bName = b.name || '';
        return aName.localeCompare(bName);
      }

      return comparison;
    });

    // Step 6: Paginate
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedPerformers = performersWithUserStats.slice(startIndex, endIndex);

    // Return properly formatted response matching Stash's structure
    res.json({
      findPerformers: {
        count: totalCount,
        performers: paginatedPerformers,
      },
    });
  } catch (error) {
    console.error("Error in findPerformersWithCustomSort:", error);
    res.status(500).json({
      error: "Failed to find performers with custom sort",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export const findPerformers = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const userId = (req as any).user?.id;
    const { filter, performer_filter, ids, performer_ids } = req.body;

    const sortField = filter?.sort;
    const sortDirection = filter?.direction || 'DESC';
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;

    // If filtering by performer stat fields, only return performers from user's watch history
    if (hasPerformerStatFilters(performer_filter)) {
      // Calculate per-user performer stats
      const performerStatsMap = await calculateUserPerformerStats(userId);

      if (performerStatsMap.size === 0) {
        // No watch history, return empty results
        return res.json({
          findPerformers: {
            count: 0,
            performers: [],
          },
        });
      }

      // Filter by stat criteria
      const matchingPerformerIds = filterPerformerStats(performerStatsMap, performer_filter);

      if (matchingPerformerIds.length === 0) {
        // No performers match the filter
        return res.json({
          findPerformers: {
            count: 0,
            performers: [],
          },
        });
      }

      // Remove stat filters from performer_filter before querying Stash
      const cleanedPerformerFilter = removePerformerStatFilters(performer_filter);

      // Query Stash for these specific performers with remaining filters
      const performers: FindPerformersQuery = await stash.findPerformers({
        ids: matchingPerformerIds,
        performer_filter: cleanedPerformerFilter as PerformerFilterType,
      });

      // Transform performers
      const transformedPerformers = performers.findPerformers.performers.map((performer) =>
        transformPerformer(performer as any)
      );

      // Inject user stats
      let performersWithUserData = await injectUserPerformerStats(transformedPerformers, userId);
      // Inject user ratings
      performersWithUserData = await injectUserPerformerRatings(performersWithUserData, userId);

      // Sort if needed
      const performersWithUserStats = performersWithUserData;
      if (sortField) {
        performersWithUserStats.sort((a, b) => {
          const aValue = getFieldValue(a, sortField) || 0;
          const bValue = getFieldValue(b, sortField) || 0;

          let comparison = 0;
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            comparison = aValue.localeCompare(bValue);
          } else {
            comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
          }

          if (sortDirection.toUpperCase() === 'DESC') {
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
      }

      // Paginate
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedPerformers = performersWithUserStats.slice(startIndex, endIndex);

      return res.json({
        findPerformers: {
          count: performersWithUserStats.length,
          performers: paginatedPerformers,
        },
      });
    }

    // If sorting by performer stat fields, use custom pagination logic
    if (sortField && isPerformerStatField(sortField)) {
      return await findPerformersWithCustomSort(req, res, userId, sortField, sortDirection, page, perPage, performer_filter);
    }

    // Check if there are rating/favorite filters that need to be handled on Peek side
    const hasRatingFilter = hasRatingFilters(performer_filter);
    const ratingFilterValues = hasRatingFilter ? getRatingFilterValues(performer_filter) : null;

    // Remove rating filters from performer_filter before sending to Stash
    const cleanedPerformerFilter = hasRatingFilter ? removeRatingFilters(performer_filter) : performer_filter;

    // Standard Stash query for non-stat sorts/filters
    const queryInputs = removeEmptyValues({
      filter: filter as FindFilterType,
      ids: ids as string[],
      performer_ids: performer_ids as number[],
      performer_filter: cleanedPerformerFilter as PerformerFilterType,
    });

    const performers: FindPerformersQuery = await stash.findPerformers(
      queryInputs
    );

    // Transform performers to add API key to image paths
    const transformedPerformers = performers.findPerformers.performers.map((performer) =>
      transformPerformer(performer as any)
    );

    // Override with per-user stats
    let performersWithUserData = await injectUserPerformerStats(transformedPerformers, userId);
    // Override with per-user ratings
    performersWithUserData = await injectUserPerformerRatings(performersWithUserData, userId);

    // Apply rating filters if present
    if (hasRatingFilter && ratingFilterValues) {
      performersWithUserData = applyRatingFilters(performersWithUserData, ratingFilterValues);
    }

    res.json({
      ...performers,
      findPerformers: { ...performers.findPerformers, performers: performersWithUserData, count: performersWithUserData.length },
    });
  } catch (error) {
    console.error("Error in findPerformers:", error);
    res.status(500).json({
      error: "Failed to find performers",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const findStudios = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const userId = (req as any).user?.id;
    const { filter, studio_filter, ids } = req.body;

    // Check if there are rating/favorite filters that need to be handled on Peek side
    const hasRatingFilter = hasRatingFilters(studio_filter);
    const ratingFilterValues = hasRatingFilter ? getRatingFilterValues(studio_filter) : null;

    // Remove rating filters from studio_filter before sending to Stash
    const cleanedStudioFilter = hasRatingFilter ? removeRatingFilters(studio_filter) : studio_filter;

    const studios: FindStudiosQuery = await stash.findStudios({
      filter: filter as FindFilterType,
      studio_filter: cleanedStudioFilter as StudioFilterType,
      ids: ids as string[],
    });

    // Transform studios to add API key to image paths
    const transformedStudioList = studios.findStudios.studios.map((studio) =>
      transformStudio(studio as any)
    );

    // Inject user ratings
    let studiosWithUserRatings = await injectUserStudioRatings(transformedStudioList, userId);

    // Apply rating filters if present
    if (hasRatingFilter && ratingFilterValues) {
      studiosWithUserRatings = applyRatingFilters(studiosWithUserRatings, ratingFilterValues);
    }

    const transformedStudios = {
      ...studios,
      findStudios: {
        ...studios.findStudios,
        studios: studiosWithUserRatings,
        count: studiosWithUserRatings.length,
      },
    };

    res.json(transformedStudios);
  } catch (error) {
    console.error("Error in findStudios:", error);
    res.status(500).json({
      error: "Failed to find studios",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const findTags = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const userId = (req as any).user?.id;
    const { filter, tag_filter, ids } = req.body;

    const sortField = filter?.sort;
    const sortDirection = filter?.direction || 'DESC';
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 24;

    // If sorting by rating, handle on Peek side (Stash doesn't support it)
    if (sortField === 'rating') {
      // Fetch all tags (or a large batch) without rating sort
      const tags: FindTagsQuery = await stash.findTags({
        filter: { ...filter, sort: 'name', per_page: 1000 } as FindFilterType,
        tag_filter: tag_filter as TagFilterType,
        ids: ids as string[],
      });

      // Transform tags to add API key to image paths
      const transformedTagList = tags.findTags.tags.map((tag) => transformTag(tag as any));

      // Inject user ratings
      let tagsWithUserRatings = await injectUserTagRatings(transformedTagList, userId);

      // Sort by rating
      tagsWithUserRatings.sort((a, b) => {
        const aRating = a.rating || 0;
        const bRating = b.rating || 0;
        const comparison = aRating > bRating ? 1 : aRating < bRating ? -1 : 0;
        return sortDirection.toUpperCase() === 'DESC' ? -comparison : comparison;
      });

      // Paginate
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedTags = tagsWithUserRatings.slice(startIndex, endIndex);

      return res.json({
        findTags: {
          count: tagsWithUserRatings.length,
          tags: paginatedTags,
        },
      });
    }

    // Standard query for other sorts
    // Check if there are rating/favorite filters that need to be handled on Peek side
    const hasRatingFilter = hasRatingFilters(tag_filter);
    const ratingFilterValues = hasRatingFilter ? getRatingFilterValues(tag_filter) : null;

    // Remove rating filters from tag_filter before sending to Stash
    const cleanedTagFilter = hasRatingFilter ? removeRatingFilters(tag_filter) : tag_filter;

    const tags: FindTagsQuery = await stash.findTags({
      filter: filter as FindFilterType,
      tag_filter: cleanedTagFilter as TagFilterType,
      ids: ids as string[],
    });

    // Transform tags to add API key to image paths
    const transformedTagList = tags.findTags.tags.map((tag) => transformTag(tag as any));

    // Inject user ratings
    let tagsWithUserRatings = await injectUserTagRatings(transformedTagList, userId);

    // Apply rating filters if present
    if (hasRatingFilter && ratingFilterValues) {
      tagsWithUserRatings = applyRatingFilters(tagsWithUserRatings, ratingFilterValues);
    }

    const transformedTags = {
      ...tags,
      findTags: {
        ...tags.findTags,
        tags: tagsWithUserRatings,
        count: tagsWithUserRatings.length,
      },
    };

    res.json(transformedTags);
  } catch (error) {
    console.error("Error in findTags:", error);
    res.status(500).json({
      error: "Failed to find tags",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Transform functions now imported from pathMapping utility

// Minimal data endpoints for filter dropdowns (id + name only)

export const findPerformersMinimal = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const { filter } = req.body;

    const performers: FindPerformersQuery = await stash.findPerformers({
      filter: filter as FindFilterType,
    });

    // Return only id and name
    const minimalPerformers = performers.findPerformers.performers.map((p) => ({
      id: p.id,
      name: p.name,
    }));

    res.json({ performers: minimalPerformers });
  } catch (error) {
    console.error("Error in findPerformersMinimal:", error);
    res.status(500).json({
      error: "Failed to find performers",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const findStudiosMinimal = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const { filter } = req.body;

    const studios: FindStudiosQuery = await stash.findStudios({
      filter: filter as FindFilterType,
    });

    // Return only id and name
    const minimalStudios = studios.findStudios.studios.map((s) => ({
      id: s.id,
      name: s.name,
    }));

    res.json({ studios: minimalStudios });
  } catch (error) {
    console.error("Error in findStudiosMinimal:", error);
    res.status(500).json({
      error: "Failed to find studios",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const findTagsMinimal = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const { filter } = req.body;

    const tags: FindTagsQuery = await stash.findTags({
      filter: filter as FindFilterType,
    });

    // Return only id and name
    const minimalTags = tags.findTags.tags.map((t) => ({
      id: t.id,
      name: t.name,
    }));

    res.json({ tags: minimalTags });
  } catch (error) {
    console.error("Error in findTagsMinimal:", error);
    res.status(500).json({
      error: "Failed to find tags",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update endpoints using stashapp-api mutations

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
    const sceneWithUserHistory = await injectUserWatchHistory(
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
