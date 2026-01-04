import type {
  TypedAuthRequest,
  TypedResponse,
  FindTagsRequest,
  FindTagsResponse,
  FindTagsMinimalRequest,
  FindTagsMinimalResponse,
  UpdateTagParams,
  UpdateTagRequest,
  UpdateTagResponse,
  ApiErrorResponse,
} from "../../types/api/index.js";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { userStatsService } from "../../services/UserStatsService.js";
import type { NormalizedTag, PeekTagFilter } from "../../types/index.js";
import { hydrateTagRelationships } from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Enhance tags with scene counts from tagged performers
 * This adds scenes where performers have the tag, even if the scene itself doesn't
 */
async function enhanceTagsWithPerformerScenes(tags: NormalizedTag[]): Promise<NormalizedTag[]> {
  // Get all scenes and performers from cache
  const allScenes = await stashEntityService.getAllScenes();
  const allPerformers = await stashEntityService.getAllPerformers();

  // Build a map of performer ID -> set of tag IDs
  const performerTagsMap = new Map<string, Set<string>>();
  allPerformers.forEach((performer) => {
    if (performer.tags && performer.tags.length > 0) {
      performerTagsMap.set(
        performer.id,
        new Set(performer.tags.map((t) => t.id))
      );
    }
  });

  // Build a map of tag ID -> count of scenes with tagged performers
  const tagPerformerSceneCount = new Map<string, number>();

  allScenes.forEach((scene) => {
    if (!scene.performers || scene.performers.length === 0) return;

    // Get all unique tag IDs from this scene's performers
    const performerTagIds = new Set<string>();
    scene.performers.forEach((performer) => {
      const performerTags = performerTagsMap.get(performer.id);
      if (performerTags) {
        performerTags.forEach((tagId) => performerTagIds.add(tagId));
      }
    });

    // Increment count for each unique tag
    performerTagIds.forEach((tagId) => {
      tagPerformerSceneCount.set(
        tagId,
        (tagPerformerSceneCount.get(tagId) || 0) + 1
      );
    });
  });

  // Enhance tags with the calculated counts
  return tags.map((tag) => {
    const performerSceneCount = tagPerformerSceneCount.get(tag.id) || 0;
    const directSceneCount = tag.scene_count || 0;

    // Use the greater of direct scene count or performer scene count
    // This handles cases where a tag is on both scenes and performers
    const totalSceneCount = Math.max(directSceneCount, performerSceneCount);

    return {
      ...tag,
      scene_count: totalSceneCount,
      scene_count_via_performers: performerSceneCount,
      scene_count_direct: directSceneCount,
    };
  });
}

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
export const findTags = async (
  req: TypedAuthRequest<FindTagsRequest>,
  res: TypedResponse<FindTagsResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const { filter, tag_filter, ids } = req.body;

    const sortField = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Step 1: Get all tags from cache
    let tags = await stashEntityService.getAllTags();

    if (tags.length === 0) {
      logger.warn("Cache not initialized, returning empty result");
      return res.json({
        findTags: {
          count: 0,
          tags: [],
        },
      });
    }

    // Step 2: Apply pre-computed exclusions (includes restrictions, hidden, cascade, and empty)
    // Admins skip exclusions to see everything
    const requestingUser = req.user;
    const isFetchingByIds = ids && Array.isArray(ids) && ids.length > 0;

    if (requestingUser?.role !== "ADMIN" && !isFetchingByIds) {
      tags = await entityExclusionHelper.filterExcluded(
        tags,
        userId,
        "tag"
      );
    }

    // Enhance tags with performer scene counts
    // This adds scenes where performers have the tag, even if the scene doesn't
    tags = await enhanceTagsWithPerformerScenes(tags);

    // Add performer counts per tag
    const performerCountsQuery = await prisma.$queryRaw<Array<{tagId: string, count: bigint}>>`
      SELECT pt.tagId, COUNT(*) as count
      FROM PerformerTag pt
      JOIN StashPerformer p ON p.id = pt.performerId AND p.deletedAt IS NULL
      GROUP BY pt.tagId
    `;
    const performerCountMap = new Map(performerCountsQuery.map(r => [r.tagId, Number(r.count)]));

    // Merge performer counts into tags
    tags = tags.map(tag => ({
      ...tag,
      performer_count: performerCountMap.get(tag.id) || 0
    }));

    // Step 3: Merge with FRESH user data (ratings, stats)
    // IMPORTANT: Do this AFTER filtered cache to ensure stats are always current
    tags = await mergeTagsWithUserData(tags, userId);

    // Step 4: Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      tags = tags.filter((t) => {
        const name = t.name || "";
        const description = t.description || "";
        const aliases = (t.aliases || []).join(" ");
        return (
          name.toLowerCase().includes(lowerQuery) ||
          description.toLowerCase().includes(lowerQuery) ||
          aliases.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Step 5: Apply filters (merge root-level ids with tag_filter)
    // Normalize ids to PeekTagFilter format (ids is string[] in request, but filter expects { value, modifier })
    const normalizedIds = ids
      ? { value: ids, modifier: "INCLUDES" }
      : tag_filter?.ids;
    const mergedFilter: PeekTagFilter & Record<string, unknown> = {
      ...tag_filter,
      ids: normalizedIds,
    };
    tags = await applyTagFilters(tags, mergedFilter);

    // Step 6: Sort
    tags = sortTags(tags, sortField, sortDirection);

    // Step 7: Paginate
    const total = tags.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    let paginatedTags = tags.slice(startIndex, endIndex);

    // Step 8: Get tag with computed counts for single-entity requests (detail pages)
    if (ids && ids.length === 1 && paginatedTags.length === 1) {
      const tagWithCounts = await stashEntityService.getTag(ids[0]);
      if (tagWithCounts) {
        const existingTag = paginatedTags[0];
        paginatedTags = [
          {
            ...existingTag,
            scene_count: tagWithCounts.scene_count,
            image_count: tagWithCounts.image_count,
            gallery_count: tagWithCounts.gallery_count,
            performer_count: tagWithCounts.performer_count,
            studio_count: tagWithCounts.studio_count,
            group_count: tagWithCounts.group_count,
            scene_marker_count: tagWithCounts.scene_marker_count,
          },
        ];
        logger.info("Computed counts for tag detail", {
          tagId: existingTag.id,
          tagName: existingTag.name,
          sceneCount: tagWithCounts.scene_count,
          imageCount: tagWithCounts.image_count,
          galleryCount: tagWithCounts.gallery_count,
          performerCount: tagWithCounts.performer_count,
          studioCount: tagWithCounts.studio_count,
          groupCount: tagWithCounts.group_count,
        });
      }
    }

    // Step 9: Hydrate parent/child relationships with names
    // For single-tag requests (detail pages), hydrate relationships using ALL tags for accurate lookup
    // For multi-tag requests (grid pages), hydrate using paginated tags only (children will be incomplete but that's ok)
    const hydratedTags = await hydrateTagRelationships(
      ids && ids.length === 1 ? tags : paginatedTags
    );
    // If we hydrated all tags, extract just the paginated ones
    const finalTags = ids && ids.length === 1
      ? hydratedTags.filter((t) => paginatedTags.some((p) => p.id === t.id))
      : hydratedTags;

    // Add stashUrl to each tag
    const tagsWithStashUrl = finalTags.map(tag => ({
      ...tag,
      stashUrl: buildStashEntityUrl('tag', tag.id),
    }));

    res.json({
      findTags: {
        count: total,
        tags: tagsWithStashUrl,
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
export async function applyTagFilters(
  tags: NormalizedTag[],
  filters: PeekTagFilter | null | undefined
): Promise<NormalizedTag[]> {
  if (!filters) return tags;

  let filtered = tags;

  // Filter by IDs (for detail pages)
  if (filters.ids?.value && filters.ids.value.length > 0) {
    const idSet = new Set(filters.ids.value);
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

  // Filter by performers (tags that appear on those performers)
  if (filters.performers) {
    const performerIdSet = new Set(
      (filters.performers.value || []).map(String)
    );
    if (performerIdSet.size > 0) {
      const allPerformers = await stashEntityService.getAllPerformers();
      const matchingPerformers = allPerformers.filter((p: any) =>
        performerIdSet.has(String(p.id))
      );

      // Get all tag IDs from matching performers
      const tagIdSet = new Set<string>();
      matchingPerformers.forEach((performer) => {
        if (performer.tags) {
          performer.tags.forEach((tag) => tagIdSet.add(tag.id));
        }
      });

      filtered = filtered.filter((t) => tagIdSet.has(t.id));
    }
  }

  // Filter by studios (tags that are directly on those studio objects)
  if (filters.studios) {
    const studioIdSet = new Set((filters.studios.value || []).map(String));
    if (studioIdSet.size > 0) {
      const allStudios = await stashEntityService.getAllStudios();

      // Get all tag IDs directly from matching studios
      const tagIdSet = new Set<string>();

      allStudios.forEach((studio) => {
        if (studioIdSet.has(String(studio.id))) {
          if (studio.tags) {
            studio.tags.forEach((tag) => tagIdSet.add(tag.id));
          }
        }
      });

      filtered = filtered.filter((t) => tagIdSet.has(t.id));
    }
  }

  // Filter by scene (tags that appear on that scene or its performers)
  if (filters.scenes_filter?.id) {
    const sceneIdSet = new Set(
      (filters.scenes_filter.id.value || []).map(String)
    );
    if (sceneIdSet.size > 0) {
      const allScenes = await stashEntityService.getAllScenes();
      const allPerformers = await stashEntityService.getAllPerformers();
      const matchingScenes = allScenes.filter((s: any) =>
        sceneIdSet.has(String(s.id))
      );

      // Get all tag IDs from matching scenes
      const tagIdSet = new Set<string>();
      matchingScenes.forEach((scene) => {
        if (scene.tags) {
          scene.tags.forEach((tag) => tagIdSet.add(tag.id));
        }
        // Also include tags from performers in those scenes
        if (scene.performers) {
          scene.performers.forEach((performer) => {
            const fullPerformer = allPerformers.find(
              (p) => p.id === performer.id
            );
            if (fullPerformer?.tags) {
              fullPerformer.tags.forEach((tag) => tagIdSet.add(tag.id));
            }
          });
        }
      });

      filtered = filtered.filter((t) => tagIdSet.has(t.id));
    }
  }

  // Filter by groups/collections (tags that appear on scenes in those groups or their performers)
  if (filters.scenes_filter?.groups) {
    const groupIdSet = new Set(
      (filters.scenes_filter.groups.value || []).map(String)
    );
    if (groupIdSet.size > 0) {
      const allScenes = await stashEntityService.getAllScenes();
      const allPerformers = await stashEntityService.getAllPerformers();
      const matchingScenes = allScenes.filter((scene: any) => {
        if (!scene.groups) return false;
        return scene.groups.some((g: any) => groupIdSet.has(String(g.id)));
      });

      // Get all tag IDs from matching scenes
      const tagIdSet = new Set<string>();
      matchingScenes.forEach((scene) => {
        if (scene.tags) {
          scene.tags.forEach((tag) => tagIdSet.add(tag.id));
        }
        // Also include tags from performers in those scenes
        if (scene.performers) {
          scene.performers.forEach((performer) => {
            const fullPerformer = allPerformers.find(
              (p) => p.id === performer.id
            );
            if (fullPerformer?.tags) {
              fullPerformer.tags.forEach((tag) => tagIdSet.add(tag.id));
            }
          });
        }
      });

      filtered = filtered.filter((t) => tagIdSet.has(t.id));
    }
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
  if (field === "performer_count") return tag.performer_count || 0;
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
  req: TypedAuthRequest<FindTagsMinimalRequest>,
  res: TypedResponse<FindTagsMinimalResponse | ApiErrorResponse>
) => {
  try {
    const { filter } = req.body;
    const searchQuery = filter?.q || "";
    const sortField = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const perPage = filter?.per_page || -1; // -1 means all results

    let tags = await stashEntityService.getAllTags();

    const requestingUser = req.user;
    const userId = req.user?.id;

    // Apply pre-computed exclusions (includes restrictions, hidden, cascade, and empty)
    // Admins skip exclusions to see everything
    if (requestingUser?.role !== "ADMIN") {
      tags = await entityExclusionHelper.filterExcluded(
        tags,
        userId,
        "tag"
      );
    }

    // Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      tags = tags.filter((t) => {
        const name = t.name || "";
        const description = t.description || "";
        const aliases = (t.aliases || []).join(" ");
        return (
          name.toLowerCase().includes(lowerQuery) ||
          description.toLowerCase().includes(lowerQuery) ||
          aliases.toLowerCase().includes(lowerQuery)
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

export const updateTag = async (
  req: TypedAuthRequest<UpdateTagRequest, UpdateTagParams>,
  res: TypedResponse<UpdateTagResponse | ApiErrorResponse>
) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const stash = stashInstanceManager.getDefault();
    const updatedTag = await stash.tagUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    if (!updatedTag.tagUpdate) {
      return res.status(500).json({ error: "Tag update returned null" });
    }

    res.json({ success: true, tag: updatedTag.tagUpdate as NormalizedTag });
  } catch (error) {
    console.error("Error updating tag:", error);
    res.status(500).json({ error: "Failed to update tag" });
  }
};
