import type { Response } from "express";
import prisma from "../../prisma/singleton.js";
import { stashCacheManager } from "../../services/StashCacheManager.js";
import { logger } from "../../utils/logger.js";
import type { NormalizedStudio, PeekStudioFilter } from "../../types/index.js";
import { userRestrictionService } from "../../services/UserRestrictionService.js";
import { emptyEntityFilterService } from "../../services/EmptyEntityFilterService.js";
import { userStatsService } from "../../services/UserStatsService.js";
import { filteredEntityCacheService } from "../../services/FilteredEntityCacheService.js";
import { AuthenticatedRequest } from "../../middleware/auth.js";
import getStash from "../../stash.js";

/**
 * Merge user-specific data into studios
 * OPTIMIZED: Now uses pre-computed stats from database instead of calculating on-the-fly
 */
export async function mergeStudiosWithUserData(
  studios: NormalizedStudio[],
  userId: number
): Promise<NormalizedStudio[]> {
  // Fetch user ratings and stats in parallel
  const [ratings, studioStats] = await Promise.all([
    prisma.studioRating.findMany({ where: { userId } }),
    userStatsService.getStudioStats(userId),
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
  return studios.map((studio) => {
    const stats = studioStats.get(studio.id) || {
      oCounter: 0,
      playCount: 0,
    };
    return {
      ...studio,
      ...ratingMap.get(studio.id),
      o_counter: stats.oCounter,
      play_count: stats.playCount,
    };
  });
}

/**
 * Simplified findStudios using cache
 */
export const findStudios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { filter, studio_filter, ids } = req.body;

    const sortField = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Step 1: Get all studios from cache
    let studios = stashCacheManager.getAllStudios();

    if (studios.length === 0) {
      logger.warn("Cache not initialized, returning empty result");
      return res.json({
        findStudios: {
          count: 0,
          studios: [],
        },
      });
    }

    // Step 2: Apply content restrictions & empty entity filtering with caching
    // NOTE: We apply user stats AFTER this to ensure fresh data
    const requestingUser = req.user;
    const cacheVersion = stashCacheManager.getCacheVersion();

    // Try to get filtered studios from cache
    let filteredStudios = filteredEntityCacheService.get(
      userId,
      "studios",
      cacheVersion
    ) as NormalizedStudio[] | null;

    if (filteredStudios === null) {
      // Cache miss - compute filtered studios
      logger.debug("Studios cache miss", { userId, cacheVersion });
      filteredStudios = studios;

      // Apply content restrictions (non-admins only)
      if (requestingUser && requestingUser.role !== "ADMIN") {
        filteredStudios = await userRestrictionService.filterStudiosForUser(
          filteredStudios,
          userId
        );
      }

      // Filter empty studios (non-admins only)
      if (requestingUser && requestingUser.role !== "ADMIN") {
        // Get all entities from cache
        let allGalleries = stashCacheManager.getAllGalleries();
        let allGroups = stashCacheManager.getAllGroups();

        // Apply user restrictions to groups/galleries FIRST
        allGalleries = await userRestrictionService.filterGalleriesForUser(
          allGalleries,
          userId
        );
        allGroups = await userRestrictionService.filterGroupsForUser(
          allGroups,
          userId
        );

        // Then filter for empty entities
        const visibleGalleries = emptyEntityFilterService.filterEmptyGalleries(allGalleries);
        const visibleGroups = emptyEntityFilterService.filterEmptyGroups(allGroups);

        // Finally filter studios using properly restricted visibility sets
        filteredStudios = emptyEntityFilterService.filterEmptyStudios(
          filteredStudios,
          visibleGroups,
          visibleGalleries
        );
      }

      // Store in cache
      filteredEntityCacheService.set(
        userId,
        "studios",
        filteredStudios,
        cacheVersion
      );
    } else {
      logger.debug("Studios cache hit", { userId, entityCount: filteredStudios.length });
    }

    // Use cached/filtered studios for remaining operations
    studios = filteredStudios;

    // Step 3: Merge with FRESH user data (ratings, stats)
    // IMPORTANT: Do this AFTER filtered cache to ensure stats are always current
    studios = await mergeStudiosWithUserData(studios, userId);

    // Step 4: Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      studios = studios.filter((s) => {
        const name = s.name || "";
        const details = s.details || "";
        return (
          name.toLowerCase().includes(lowerQuery) ||
          details.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Step 5: Apply filters (merge root-level ids with studio_filter)
    const mergedFilter = { ...studio_filter, ids: ids || studio_filter?.ids };
    studios = applyStudioFilters(studios, mergedFilter);

    // Step 6: Sort
    studios = sortStudios(studios, sortField, sortDirection);

    // Step 7: Paginate
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
    logger.error("Error in findStudios", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find studios",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Apply studio filters
 */
function applyStudioFilters(
  studios: NormalizedStudio[],
  filters: PeekStudioFilter | null | undefined
): NormalizedStudio[] {
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

  // Filter by tags
  if (filters.tags) {
    const { modifier, value: tagIds } = filters.tags;
    if (tagIds && tagIds.length > 0) {
      filtered = filtered.filter((s) => {
        const studioTagIds = (s.tags || []).map((t: any) => String(t.id));
        const filterTagIds = tagIds.map(String);

        if (modifier === "INCLUDES_ALL") {
          return filterTagIds.every((id: string) => studioTagIds.includes(id));
        }
        if (modifier === "INCLUDES") {
          return filterTagIds.some((id: string) => studioTagIds.includes(id));
        }
        if (modifier === "EXCLUDES") {
          return !filterTagIds.some((id: string) => studioTagIds.includes(id));
        }
        return true;
      });
    }
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

  // Filter by scene_count
  if (filters.scene_count) {
    const { modifier, value, value2 } = filters.scene_count;
    filtered = filtered.filter((s) => {
      const sceneCount = s.scene_count || 0;
      if (modifier === "GREATER_THAN") return sceneCount > value;
      if (modifier === "LESS_THAN") return sceneCount < value;
      if (modifier === "EQUALS") return sceneCount === value;
      if (modifier === "NOT_EQUALS") return sceneCount !== value;
      if (modifier === "BETWEEN")
        return (
          value2 !== null &&
          value2 !== undefined &&
          sceneCount >= value &&
          sceneCount <= value2
        );
      return true;
    });
  }

  // Filter by name (text search)
  if (filters.name) {
    const searchValue = filters.name.value.toLowerCase();
    filtered = filtered.filter((s) => {
      const name = s.name || "";
      return name.toLowerCase().includes(searchValue);
    });
  }

  // Filter by details (text search)
  if (filters.details) {
    const searchValue = filters.details.value.toLowerCase();
    filtered = filtered.filter((s) => {
      const details = s.details || "";
      return details.toLowerCase().includes(searchValue);
    });
  }

  // Filter by created_at (date)
  if (filters.created_at) {
    const { modifier, value, value2 } = filters.created_at;
    filtered = filtered.filter((s) => {
      if (!s.created_at) return false;
      const studioDate = new Date(s.created_at);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return studioDate > filterDate;
      if (modifier === "LESS_THAN") return studioDate < filterDate;
      if (modifier === "EQUALS") {
        return studioDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
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
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return studioDate > filterDate;
      if (modifier === "LESS_THAN") return studioDate < filterDate;
      if (modifier === "EQUALS") {
        return studioDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
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
function sortStudios(
  studios: NormalizedStudio[],
  sortField: string,
  direction: string
): NormalizedStudio[] {
  const sorted = [...studios];

  sorted.sort((a, b) => {
    const aValue = getStudioFieldValue(a, sortField);
    const bValue = getStudioFieldValue(b, sortField);

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

    // Secondary sort by name
    if (comparison === 0) {
      const aName = a.name || "";
      const bName = b.name || "";
      return aName.localeCompare(bName);
    }

    return comparison;
  });

  return sorted;
}

/**
 * Get field value from studio for sorting
 */
function getStudioFieldValue(
  studio: NormalizedStudio,
  field: string
): number | string | boolean | null {
  if (field === "rating") return studio.rating || 0;
  if (field === "rating100") return studio.rating100 || 0;
  if (field === "o_counter") return studio.o_counter || 0;
  if (field === "play_count") return studio.play_count || 0;
  if (field === "scene_count" || field === "scenes_count")
    return studio.scene_count || 0;
  if (field === "name") return studio.name || "";
  if (field === "created_at") return studio.created_at || "";
  if (field === "updated_at") return studio.updated_at || "";
  if (field === "random") return Math.random();
  // Fallback for dynamic field access (safe as function is only called with known fields)
  const value = (studio as Record<string, unknown>)[field];
  return typeof value === "string" || typeof value === "number" ? value : 0;
}

/**
 * Get minimal studios (id + name only) for filter dropdowns
 */
export const findStudiosMinimal = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { filter } = req.body;
    const searchQuery = filter?.q || "";
    const sortField = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const perPage = filter?.per_page || -1; // -1 means all results

    let studios = stashCacheManager.getAllStudios();

    // Apply content restrictions & empty entity filtering with caching
    const requestingUser = req.user;
    const userId = req.user?.id;
    const cacheVersion = stashCacheManager.getCacheVersion();

    // Try to get filtered studios from cache
    let filteredStudios = filteredEntityCacheService.get(
      userId,
      "studios",
      cacheVersion
    ) as NormalizedStudio[] | null;

    if (filteredStudios === null) {
      // Cache miss - compute filtered studios
      logger.debug("Studios minimal cache miss", { userId, cacheVersion });
      filteredStudios = studios;

      // Filter empty studios (non-admins only)
      if (requestingUser && requestingUser.role !== "ADMIN") {
        // Get all entities from cache
        let allGalleries = stashCacheManager.getAllGalleries();
        let allGroups = stashCacheManager.getAllGroups();

        // Apply user restrictions to groups/galleries FIRST
        allGalleries = await userRestrictionService.filterGalleriesForUser(
          allGalleries,
          userId
        );
        allGroups = await userRestrictionService.filterGroupsForUser(
          allGroups,
          userId
        );

        // Then filter for empty entities
        const visibleGalleries = emptyEntityFilterService.filterEmptyGalleries(allGalleries);
        const visibleGroups = emptyEntityFilterService.filterEmptyGroups(allGroups);

        // Finally filter studios using properly restricted visibility sets
        filteredStudios = emptyEntityFilterService.filterEmptyStudios(
          filteredStudios,
          visibleGroups,
          visibleGalleries
        );
      }

      // Store in cache
      filteredEntityCacheService.set(
        userId,
        "studios",
        filteredStudios,
        cacheVersion
      );
    } else {
      logger.debug("Studios minimal cache hit", { userId, entityCount: filteredStudios.length });
    }

    // Use cached/filtered studios
    studios = filteredStudios;

    // Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      studios = studios.filter((s) => {
        const name = s.name || "";
        const details = s.details || "";
        return (
          name.toLowerCase().includes(lowerQuery) ||
          details.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Sort
    studios.sort((a, b) => {
      const aValue = (a as Record<string, unknown>)[sortField] || "";
      const bValue = (b as Record<string, unknown>)[sortField] || "";
      const comparison =
        typeof aValue === "string" && typeof bValue === "string"
          ? aValue.localeCompare(bValue)
          : aValue > bValue
          ? 1
          : aValue < bValue
          ? -1
          : 0;
      return sortDirection.toUpperCase() === "DESC" ? -comparison : comparison;
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
    logger.error("Error in findStudiosMinimal", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find studios",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateStudio = async (
  req: AuthenticatedRequest,
  res: Response
) => {
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
