import type { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { emptyEntityFilterService } from "../../services/EmptyEntityFilterService.js";
import { filteredEntityCacheService } from "../../services/FilteredEntityCacheService.js";
import { stashCacheManager } from "../../services/StashCacheManager.js";
import { userRestrictionService } from "../../services/UserRestrictionService.js";
import { userStatsService } from "../../services/UserStatsService.js";
import getStash from "../../stash.js";
import type {
  NormalizedPerformer,
  PeekPerformerFilter,
} from "../../types/index.js";
import { logger } from "../../utils/logger.js";

/**
 * Merge user-specific data into performers
 * OPTIMIZED: Now uses pre-computed stats from database instead of calculating on-the-fly
 */
export async function mergePerformersWithUserData(
  performers: NormalizedPerformer[],
  userId: number
): Promise<NormalizedPerformer[]> {
  // Fetch user ratings and stats in parallel
  const [ratings, performerStats] = await Promise.all([
    prisma.performerRating.findMany({ where: { userId } }),
    userStatsService.getPerformerStats(userId),
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
    const stats = performerStats.get(performer.id) || {
      oCounter: 0,
      playCount: 0,
      lastPlayedAt: null,
      lastOAt: null,
    };
    return {
      ...performer,
      ...ratingMap.get(performer.id),
      o_counter: stats.oCounter,
      play_count: stats.playCount,
      last_played_at: stats.lastPlayedAt,
      last_o_at: stats.lastOAt,
    };
  });
}

/**
 * Simplified findPerformers using cache
 */
export const findPerformers = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { filter, performer_filter, ids } = req.body;

    const sortField = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Step 1: Get all performers from cache
    let performers = stashCacheManager.getAllPerformers();

    if (performers.length === 0) {
      logger.warn("Cache not initialized, returning empty result");
      return res.json({
        findPerformers: {
          count: 0,
          performers: [],
        },
      });
    }

    // Step 2: Apply content restrictions & empty entity filtering with caching
    // NOTE: We apply user stats AFTER this to ensure fresh data
    const requestingUser = req.user;
    const cacheVersion = stashCacheManager.getCacheVersion();

    // Try to get filtered performers from cache
    let filteredPerformers = filteredEntityCacheService.get(
      userId,
      "performers",
      cacheVersion
    ) as NormalizedPerformer[] | null;

    if (filteredPerformers === null) {
      // Cache miss - compute filtered performers
      logger.debug("Performers cache miss", { userId, cacheVersion });
      filteredPerformers = performers;

      // Apply content restrictions (non-admins only)
      if (requestingUser && requestingUser.role !== "ADMIN") {
        filteredPerformers =
          await userRestrictionService.filterPerformersForUser(
            filteredPerformers,
            userId
          );
      }

      // Filter empty performers (non-admins only)
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
        const visibleGalleries =
          emptyEntityFilterService.filterEmptyGalleries(allGalleries);
        const visibleGroups =
          emptyEntityFilterService.filterEmptyGroups(allGroups);

        // Finally filter performers using properly restricted visibility sets
        filteredPerformers = emptyEntityFilterService.filterEmptyPerformers(
          filteredPerformers,
          visibleGroups,
          visibleGalleries
        );
      }

      // Store in cache
      filteredEntityCacheService.set(
        userId,
        "performers",
        filteredPerformers,
        cacheVersion
      );
    } else {
      logger.debug("Performers cache hit", {
        userId,
        entityCount: filteredPerformers.length,
      });
    }

    // Use cached/filtered performers for remaining operations
    performers = filteredPerformers;

    // Step 3: Merge with FRESH user data (ratings, stats)
    // IMPORTANT: Do this AFTER filtered cache to ensure stats are always current
    performers = await mergePerformersWithUserData(performers, userId);

    // Step 4: Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      performers = performers.filter((p) => {
        const name = p.name || "";
        const aliases = p.alias_list?.join(" ") || "";
        return (
          name.toLowerCase().includes(lowerQuery) ||
          aliases.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Step 5: Apply filters (merge root-level ids with performer_filter)
    const mergedFilter = {
      ...performer_filter,
      ids: ids || performer_filter?.ids,
    };
    performers = applyPerformerFilters(performers, mergedFilter);

    // Step 6: Sort
    performers = sortPerformers(performers, sortField, sortDirection);

    // Step 7: Paginate
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
    logger.error("Error in findPerformers", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find performers",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Apply performer filters
 */
export function applyPerformerFilters(
  performers: NormalizedPerformer[],
  filters: PeekPerformerFilter | null | undefined
): NormalizedPerformer[] {
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
      if (modifier === "EQUALS") return p.gender === value;
      if (modifier === "NOT_EQUALS") return p.gender !== value;
      return true;
    });
  }

  // Filter by tags
  if (filters.tags) {
    const { modifier, value: tagIds } = filters.tags;
    if (tagIds && tagIds.length > 0) {
      filtered = filtered.filter((p) => {
        const performerTagIds = (p.tags || []).map((t: any) => String(t.id));
        const filterTagIds = tagIds.map(String);

        if (modifier === "INCLUDES_ALL") {
          return filterTagIds.every((id: string) =>
            performerTagIds.includes(id)
          );
        }
        if (modifier === "INCLUDES") {
          return filterTagIds.some((id: string) =>
            performerTagIds.includes(id)
          );
        }
        if (modifier === "EXCLUDES") {
          return !filterTagIds.some((id: string) =>
            performerTagIds.includes(id)
          );
        }
        return true;
      });
    }
  }

  // Filter by studios
  // Note: Performers don't have a direct studio relationship in Stash
  // We need to filter by performers who appear in scenes from specific studios
  // This requires checking the scenes cache
  if (filters.studios && filters.studios.value) {
    const studioIds = new Set(filters.studios.value.map(String));
    const allScenes = stashCacheManager.getAllScenes();

    // Build a set of performer IDs that appear in scenes from the specified studios
    const performerIdsInStudios = new Set<string>();
    allScenes.forEach((scene) => {
      if (scene.studio && studioIds.has(String(scene.studio.id))) {
        scene.performers?.forEach((performer) => {
          performerIdsInStudios.add(String(performer.id));
        });
      }
    });

    // Filter performers to only those who appear in scenes from the specified studios
    filtered = filtered.filter((p) => performerIdsInStudios.has(p.id));
  }

  // Filter by rating100
  if (filters.rating100) {
    const { modifier, value, value2 } = filters.rating100;
    filtered = filtered.filter((p) => {
      const rating = p.rating100 || 0;
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
    filtered = filtered.filter((p) => {
      const oCounter = p.o_counter || 0;
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
    filtered = filtered.filter((p) => {
      const playCount = p.play_count || 0;
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
    filtered = filtered.filter((p) => {
      const sceneCount = p.scene_count || 0;
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

  // Filter by created_at (date)
  if (filters.created_at) {
    const { modifier, value, value2 } = filters.created_at;
    filtered = filtered.filter((p) => {
      if (!p.created_at) return false;
      const performerDate = new Date(p.created_at);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return performerDate > filterDate;
      if (modifier === "LESS_THAN") return performerDate < filterDate;
      if (modifier === "EQUALS") {
        return performerDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
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
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return performerDate > filterDate;
      if (modifier === "LESS_THAN") return performerDate < filterDate;
      if (modifier === "EQUALS") {
        return performerDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
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
function sortPerformers(
  performers: NormalizedPerformer[],
  sortField: string,
  direction: string
): NormalizedPerformer[] {
  const sorted = [...performers];

  sorted.sort((a, b) => {
    const aValue = getPerformerFieldValue(a, sortField);
    const bValue = getPerformerFieldValue(b, sortField);

    // Handle null values for timestamp fields
    const isTimestampField =
      sortField === "last_played_at" || sortField === "last_o_at";
    if (isTimestampField) {
      const aIsNull = aValue === null || aValue === undefined;
      const bIsNull = bValue === null || bValue === undefined;

      // Both null - equal
      if (aIsNull && bIsNull) return 0;

      // One is null - nulls go to end for DESC, start for ASC
      if (aIsNull) return direction.toUpperCase() === "DESC" ? 1 : -1;
      if (bIsNull) return direction.toUpperCase() === "DESC" ? -1 : 1;

      // Both non-null - compare as strings (safely convert to string first)
      const comparison = String(aValue).localeCompare(String(bValue));
      return direction.toUpperCase() === "DESC" ? -comparison : comparison;
    }

    // Normal sorting for other fields
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
 * Get field value from performer for sorting
 */
function getPerformerFieldValue(
  performer: NormalizedPerformer,
  field: string
): number | string | boolean | null {
  if (field === "rating") return performer.rating || 0;
  if (field === "rating100") return performer.rating100 || 0;
  if (field === "o_counter") return performer.o_counter || 0;
  if (field === "play_count") return performer.play_count || 0;
  if (field === "scene_count" || field === "scenes_count")
    return performer.scene_count || 0;
  if (field === "name") return performer.name || "";
  if (field === "created_at") return performer.created_at || "";
  if (field === "updated_at") return performer.updated_at || "";
  if (field === "last_played_at") return performer.last_played_at; // Return null as-is for timestamps
  if (field === "last_o_at") return performer.last_o_at; // Return null as-is for timestamps
  if (field === "random") return Math.random();
  // Fallback for dynamic field access (safe as function is only called with known fields)
  const value = (performer as Record<string, unknown>)[field];
  return typeof value === "string" || typeof value === "number" ? value : 0;
}
/**
 * Get minimal performers (id + name only) for filter dropdowns
 */
export const findPerformersMinimal = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { filter } = req.body;
    const searchQuery = filter?.q || "";
    const sortField = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const perPage = filter?.per_page || -1; // -1 means all results

    let performers = stashCacheManager.getAllPerformers();

    // Apply content restrictions & empty entity filtering with caching
    const requestingUser = req.user;
    const userId = req.user?.id;
    const cacheVersion = stashCacheManager.getCacheVersion();

    // Try to get filtered performers from cache
    let filteredPerformers = filteredEntityCacheService.get(
      userId,
      "performers",
      cacheVersion
    ) as NormalizedPerformer[] | null;

    if (filteredPerformers === null) {
      // Cache miss - compute filtered performers
      logger.debug("Performers minimal cache miss", { userId, cacheVersion });
      filteredPerformers = performers;

      // Filter empty performers (non-admins only)
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
        const visibleGalleries =
          emptyEntityFilterService.filterEmptyGalleries(allGalleries);
        const visibleGroups =
          emptyEntityFilterService.filterEmptyGroups(allGroups);

        // Finally filter performers using properly restricted visibility sets
        filteredPerformers = emptyEntityFilterService.filterEmptyPerformers(
          filteredPerformers,
          visibleGroups,
          visibleGalleries
        );
      }

      // Store in cache
      filteredEntityCacheService.set(
        userId,
        "performers",
        filteredPerformers,
        cacheVersion
      );
    } else {
      logger.debug("Performers minimal cache hit", {
        userId,
        entityCount: filteredPerformers.length,
      });
    }

    // Use cached/filtered performers
    performers = filteredPerformers;

    // Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      performers = performers.filter((p) => {
        const name = p.name || "";
        const aliases = p.alias_list?.join(" ") || "";
        return (
          name.toLowerCase().includes(lowerQuery) ||
          aliases.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Sort
    performers.sort((a, b) => {
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
    let paginatedPerformers = performers;
    if (perPage !== -1 && perPage > 0) {
      paginatedPerformers = performers.slice(0, perPage);
    }

    const minimal = paginatedPerformers.map((p) => ({
      id: p.id,
      name: p.name,
    }));

    res.json({
      performers: minimal,
    });
  } catch (error) {
    logger.error("Error in findPerformersMinimal", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find performers",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updatePerformer = async (
  req: AuthenticatedRequest,
  res: Response
) => {
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
