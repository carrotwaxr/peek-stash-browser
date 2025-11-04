import type { Response } from "express";
import prisma from "../../prisma/singleton.js";
import { stashCacheManager } from "../../services/StashCacheManager.js";
import { logger } from "../../utils/logger.js";
import type { NormalizedTag, PeekTagFilter } from "../../types/index.js";
import getStash from "../../stash.js";
import { userRestrictionService } from "../../services/UserRestrictionService.js";
import { emptyEntityFilterService } from "../../services/EmptyEntityFilterService.js";
import { userStatsService } from "../../services/UserStatsService.js";
import { filteredEntityCacheService } from "../../services/FilteredEntityCacheService.js";
import { AuthenticatedRequest } from "../../middleware/auth.js";

/**
 * Merge user-specific data into tags
 * OPTIMIZED: Now uses pre-computed stats from database instead of calculating on-the-fly
 */
export async function mergeTagsWithUserData(
  tags: NormalizedTag[],
  userId: number
): Promise<NormalizedTag[]> {
  // Fetch user ratings and stats in parallel
  const [ratings, tagStats] = await Promise.all([
    prisma.tagRating.findMany({ where: { userId } }),
    userStatsService.getTagStats(userId),
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
  return tags.map((tag) => {
    const stats = tagStats.get(tag.id) || {
      oCounter: 0,
      playCount: 0,
    };
    return {
      ...tag,
      ...ratingMap.get(tag.id),
      o_counter: stats.oCounter,
      play_count: stats.playCount,
    };
  });
}

/**
 * Simplified findTags using cache
 */
export const findTags = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { filter, tag_filter, ids } = req.body;

    const sortField = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Step 1: Get all tags from cache
    let tags = stashCacheManager.getAllTags();

    if (tags.length === 0) {
      logger.warn("Cache not initialized, returning empty result");
      return res.json({
        findTags: {
          count: 0,
          tags: [],
        },
      });
    }

    // Step 2: Merge with user data
    tags = await mergeTagsWithUserData(tags, userId);

    // Step 2.5: Apply content restrictions & empty entity filtering with caching
    const requestingUser = req.user;
    const cacheVersion = stashCacheManager.getCacheVersion();
    const isFetchingByIds = ids && Array.isArray(ids) && ids.length > 0;

    // Try to get filtered tags from cache
    let filteredTags = filteredEntityCacheService.get(
      userId,
      "tags",
      cacheVersion
    ) as NormalizedTag[] | null;

    if (filteredTags === null) {
      // Cache miss - compute filtered tags
      logger.debug("Tags cache miss", { userId, cacheVersion });
      filteredTags = tags;

      // Apply content restrictions (non-admins only)
      if (requestingUser && requestingUser.role !== "ADMIN") {
        filteredTags = await userRestrictionService.filterTagsForUser(filteredTags, userId);
      }

      // Filter empty tags (non-admins only)
      // Skip filtering when fetching by specific IDs (detail page requests)
      if (requestingUser && requestingUser.role !== "ADMIN" && !isFetchingByIds) {
        // Get all entities from cache
        let allGalleries = stashCacheManager.getAllGalleries();
        let allGroups = stashCacheManager.getAllGroups();
        let allStudios = stashCacheManager.getAllStudios();
        let allPerformers = stashCacheManager.getAllPerformers();

        // Apply user restrictions to all entity types FIRST
        allGalleries = await userRestrictionService.filterGalleriesForUser(
          allGalleries,
          userId
        );
        allGroups = await userRestrictionService.filterGroupsForUser(
          allGroups,
          userId
        );
        allStudios = await userRestrictionService.filterStudiosForUser(
          allStudios,
          userId
        );
        // No direct performer restrictions, but we still process them

        // Then filter for empty entities in dependency order
        const visibleGalleries = emptyEntityFilterService.filterEmptyGalleries(allGalleries);
        const visibleGroups = emptyEntityFilterService.filterEmptyGroups(allGroups);
        const visibleStudios = emptyEntityFilterService.filterEmptyStudios(
          allStudios,
          visibleGroups,
          visibleGalleries
        );
        const visiblePerformers = emptyEntityFilterService.filterEmptyPerformers(
          allPerformers,
          visibleGroups,
          visibleGalleries
        );

        const visibilitySet = {
          galleries: new Set(visibleGalleries.map((g) => g.id)),
          groups: new Set(visibleGroups.map((g) => g.id)),
          studios: new Set(visibleStudios.map((s) => s.id)),
          performers: new Set(visiblePerformers.map((p) => p.id)),
        };

        filteredTags = emptyEntityFilterService.filterEmptyTags(filteredTags, visibilitySet);
      }

      // Store in cache
      filteredEntityCacheService.set(
        userId,
        "tags",
        filteredTags,
        cacheVersion
      );
    } else {
      logger.debug("Tags cache hit", { userId, entityCount: filteredTags.length });
    }

    // Use cached/filtered tags for remaining operations
    tags = filteredTags;

    // Step 3: Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      tags = tags.filter((t) => {
        const name = t.name || "";
        const description = t.description || "";
        return (
          name.toLowerCase().includes(lowerQuery) ||
          description.toLowerCase().includes(lowerQuery)
        );
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
    logger.error("Error in findTags", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find tags",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Apply tag filters
 */
function applyTagFilters(
  tags: NormalizedTag[],
  filters: PeekTagFilter | null | undefined
): NormalizedTag[] {
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
      if (modifier === "GREATER_THAN")
        return value !== undefined && rating > value;
      if (modifier === "LESS_THAN")
        return value !== undefined && rating < value;
      if (modifier === "EQUALS") return value !== undefined && rating === value;
      if (modifier === "NOT_EQUALS")
        return value !== undefined && rating !== value;
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
    filtered = filtered.filter((t) => {
      const oCounter = t.o_counter || 0;
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
    filtered = filtered.filter((t) => {
      const playCount = t.play_count || 0;
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
    filtered = filtered.filter((t) => {
      const sceneCount = t.scene_count || 0;
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
    filtered = filtered.filter((t) => {
      const name = t.name || "";
      return name.toLowerCase().includes(searchValue);
    });
  }

  // Filter by description (text search)
  if (filters.description) {
    const searchValue = filters.description.value.toLowerCase();
    filtered = filtered.filter((t) => {
      const description = t.description || "";
      return description.toLowerCase().includes(searchValue);
    });
  }

  // Filter by created_at (date)
  if (filters.created_at) {
    const { modifier, value, value2 } = filters.created_at;
    filtered = filtered.filter((t) => {
      if (!t.created_at) return false;
      const tagDate = new Date(t.created_at);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return tagDate > filterDate;
      if (modifier === "LESS_THAN") return tagDate < filterDate;
      if (modifier === "EQUALS") {
        return tagDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
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
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return tagDate > filterDate;
      if (modifier === "LESS_THAN") return tagDate < filterDate;
      if (modifier === "EQUALS") {
        return tagDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
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
function sortTags(
  tags: NormalizedTag[],
  sortField: string,
  direction: string
): NormalizedTag[] {
  const sorted = [...tags];

  sorted.sort((a, b) => {
    const aValue = getTagFieldValue(a, sortField);
    const bValue = getTagFieldValue(b, sortField);

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
 * Get field value from tag for sorting
 */
function getTagFieldValue(
  tag: NormalizedTag,
  field: string
): number | string | boolean | null {
  if (field === "rating") return tag.rating || 0;
  if (field === "rating100") return tag.rating100 || 0;
  if (field === "o_counter") return tag.o_counter || 0;
  if (field === "play_count") return tag.play_count || 0;
  if (field === "scene_count" || field === "scenes_count")
    return tag.scene_count || 0;
  if (field === "name") return tag.name || "";
  if (field === "created_at") return tag.created_at || "";
  if (field === "updated_at") return tag.updated_at || "";
  if (field === "random") return Math.random();
  // Fallback for dynamic field access (safe as function is only called with known fields)
  const value = (tag as Record<string, unknown>)[field];
  return typeof value === "string" || typeof value === "number" ? value : 0;
}

/**
 * Get minimal tags (id + name only) for filter dropdowns
 */
export const findTagsMinimal = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { filter } = req.body;
    const searchQuery = filter?.q || "";
    const sortField = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const perPage = filter?.per_page || -1; // -1 means all results

    let tags = stashCacheManager.getAllTags();

    const requestingUser = req.user;
    const userId = req.user?.id;
    const cacheVersion = stashCacheManager.getCacheVersion();

    // OPTIMIZATION: Skip expensive filtering only if user has NO content restrictions
    // Check if user has any restrictions configured
    const userRestrictions = requestingUser && requestingUser.role !== "ADMIN"
      ? await prisma.userContentRestriction.findMany({ where: { userId } })
      : [];

    // Early return: If no restrictions, just return all tags (safe, nothing to leak)
    if (userRestrictions.length === 0) {
      // No restrictions - skip expensive filtering entirely (all tags visible)
    } else {
      // User has restrictions - must do full filtering for security
      // Use cached filtering from Priority 2
      let filteredTags = filteredEntityCacheService.get(
        userId,
        "tags",
        cacheVersion
      ) as NormalizedTag[] | null;

      if (filteredTags === null) {
        // Cache miss - compute filtered tags
        logger.debug("Tags minimal cache miss", { userId, cacheVersion });
        filteredTags = tags;

        // Get all entities from cache
        let allGalleries = stashCacheManager.getAllGalleries();
        let allGroups = stashCacheManager.getAllGroups();
        let allStudios = stashCacheManager.getAllStudios();
        let allPerformers = stashCacheManager.getAllPerformers();

        // Apply user restrictions to all entity types FIRST
        allGalleries = await userRestrictionService.filterGalleriesForUser(
          allGalleries,
          userId
        );
        allGroups = await userRestrictionService.filterGroupsForUser(
          allGroups,
          userId
        );
        allStudios = await userRestrictionService.filterStudiosForUser(
          allStudios,
          userId
        );

        // Then filter for empty entities in dependency order
        const visibleGalleries = emptyEntityFilterService.filterEmptyGalleries(allGalleries);
        const visibleGroups = emptyEntityFilterService.filterEmptyGroups(allGroups);
        const visibleStudios = emptyEntityFilterService.filterEmptyStudios(
          allStudios,
          visibleGroups,
          visibleGalleries
        );
        const visiblePerformers = emptyEntityFilterService.filterEmptyPerformers(
          allPerformers,
          visibleGroups,
          visibleGalleries
        );

        const visibilitySet = {
          galleries: new Set(visibleGalleries.map((g) => g.id)),
          groups: new Set(visibleGroups.map((g) => g.id)),
          studios: new Set(visibleStudios.map((s) => s.id)),
          performers: new Set(visiblePerformers.map((p) => p.id)),
        };

        filteredTags = emptyEntityFilterService.filterEmptyTags(filteredTags, visibilitySet);

        // Store in cache
        filteredEntityCacheService.set(
          userId,
          "tags",
          filteredTags,
          cacheVersion
        );
      } else {
        logger.debug("Tags minimal cache hit", { userId, entityCount: filteredTags.length });
      }

      tags = filteredTags;
    }

    // Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      tags = tags.filter((t) => {
        const name = t.name || "";
        const description = t.description || "";
        return (
          name.toLowerCase().includes(lowerQuery) ||
          description.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Sort
    tags.sort((a, b) => {
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
    let paginatedTags = tags;
    if (perPage !== -1 && perPage > 0) {
      paginatedTags = tags.slice(0, perPage);
    }

    const minimal = paginatedTags.map((t) => ({ id: t.id, name: t.name }));

    res.json({
      tags: minimal,
    });
  } catch (error) {
    logger.error("Error in findTagsMinimal", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find tags",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateTag = async (req: AuthenticatedRequest, res: Response) => {
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
