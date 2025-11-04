import type { Response } from "express";
import prisma from "../../prisma/singleton.js";
import { stashCacheManager } from "../../services/StashCacheManager.js";
import { logger } from "../../utils/logger.js";
import type { NormalizedTag, PeekTagFilter } from "../../types/index.js";
import getStash from "../../stash.js";
import { userRestrictionService } from "../../services/UserRestrictionService.js";
import { emptyEntityFilterService } from "../../services/EmptyEntityFilterService.js";
import { AuthenticatedRequest } from "../../middleware/auth.js";

/**
 * Calculate per-user tag statistics from watch history
 * For each tag, aggregate stats from scenes tagged with it
 */
async function calculateTagStats(
  userId: number
): Promise<Map<string, { o_counter: number; play_count: number }>> {
  // Get all scenes from cache
  const scenes = stashCacheManager.getAllScenes();

  // Get all watch history for this user
  const watchHistory = await prisma.watchHistory.findMany({
    where: { userId },
  });
  const watchMap = new Map(
    watchHistory.map((wh) => [
      wh.sceneId,
      { o_counter: wh.oCount || 0, play_count: wh.playCount || 0 },
    ])
  );

  // Aggregate stats by tag
  const tagStatsMap = new Map<
    string,
    { o_counter: number; play_count: number }
  >();

  scenes.forEach((scene) => {
    const watchData = watchMap.get(scene.id);
    if (!watchData) return; // Skip scenes not watched by this user

    // Aggregate to all tags in this scene
    (scene.tags || []).forEach((tag) => {
      const existing = tagStatsMap.get(tag.id) || {
        o_counter: 0,
        play_count: 0,
      };
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
export async function mergeTagsWithUserData(
  tags: NormalizedTag[],
  userId: number
): Promise<NormalizedTag[]> {
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

    // Step 4.5: Apply content restrictions (non-admins only)
    const requestingUser = req.user;
    if (requestingUser && requestingUser.role !== "ADMIN") {
      tags = await userRestrictionService.filterTagsForUser(tags, userId);
    }

    // Step 4.6: Filter empty tags (non-admins only)
    // Skip filtering when fetching by specific IDs (detail page requests)
    const isFetchingByIds = ids && Array.isArray(ids) && ids.length > 0;
    if (requestingUser && requestingUser.role !== "ADMIN" && !isFetchingByIds) {
      // Get visibility sets for all entity types
      const allGalleries = stashCacheManager.getAllGalleries();
      const allGroups = stashCacheManager.getAllGroups();
      const allStudios = stashCacheManager.getAllStudios();
      const allPerformers = stashCacheManager.getAllPerformers();

      const visibleGalleries = new Set(
        emptyEntityFilterService
          .filterEmptyGalleries(allGalleries)
          .map((g) => g.id)
      );
      const visibleGroups = new Set(
        emptyEntityFilterService.filterEmptyGroups(allGroups).map((g) => g.id)
      );
      const visibleStudios = new Set(
        emptyEntityFilterService
          .filterEmptyStudios(allStudios, visibleGroups, visibleGalleries)
          .map((s) => s.id)
      );
      const visiblePerformers = new Set(
        emptyEntityFilterService
          .filterEmptyPerformers(allPerformers, visibleGroups, visibleGalleries)
          .map((p) => p.id)
      );

      const visibilitySet = {
        galleries: visibleGalleries,
        groups: visibleGroups,
        studios: visibleStudios,
        performers: visiblePerformers,
      };

      tags = emptyEntityFilterService.filterEmptyTags(tags, visibilitySet);
    }

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

    // Filter empty tags (non-admins only)
    const requestingUser = req.user;
    if (requestingUser && requestingUser.role !== "ADMIN") {
      const allGalleries = stashCacheManager.getAllGalleries();
      const allGroups = stashCacheManager.getAllGroups();
      const allStudios = stashCacheManager.getAllStudios();
      const allPerformers = stashCacheManager.getAllPerformers();

      const visibleGalleries = new Set(
        emptyEntityFilterService
          .filterEmptyGalleries(allGalleries)
          .map((g) => g.id)
      );
      const visibleGroups = new Set(
        emptyEntityFilterService.filterEmptyGroups(allGroups).map((g) => g.id)
      );
      const visibleStudios = new Set(
        emptyEntityFilterService
          .filterEmptyStudios(allStudios, visibleGroups, visibleGalleries)
          .map((s) => s.id)
      );
      const visiblePerformers = new Set(
        emptyEntityFilterService
          .filterEmptyPerformers(allPerformers, visibleGroups, visibleGalleries)
          .map((p) => p.id)
      );

      const visibilitySet = {
        galleries: visibleGalleries,
        groups: visibleGroups,
        studios: visibleStudios,
        performers: visiblePerformers,
      };

      tags = emptyEntityFilterService.filterEmptyTags(tags, visibilitySet);
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
