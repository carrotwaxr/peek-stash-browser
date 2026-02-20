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
  AmbiguousLookupResponse,
} from "../../types/api/index.js";
import prisma from "../../prisma/singleton.js";
import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import { userStatsService } from "../../services/UserStatsService.js";
import type { NormalizedTag, PeekTagFilter } from "../../types/index.js";
import { disambiguateEntityNames, getEntityInstanceId } from "../../utils/entityInstanceId.js";
import { hydrateTagRelationships } from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import { parseRandomSort } from "../../utils/seededRandom.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

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
      `${r.tagId}\0${r.instanceId || ""}`,
      {
        rating: r.rating,
        rating100: r.rating,
        favorite: r.favorite,
      },
    ])
  );

  // Merge data
  return tags.map((tag) => {
    const compositeKey = `${tag.id}\0${tag.instanceId || ""}`;
    const stats = tagStats.get(compositeKey) || {
      oCounter: 0,
      playCount: 0,
    };
    return {
      ...tag,
      ...ratingMap.get(compositeKey),
      o_counter: stats.oCounter,
      play_count: stats.playCount,
    };
  });
}

/**
 * findTags using SQL query builder
 */
export const findTags = async (
  req: TypedAuthRequest<FindTagsRequest>,
  res: TypedResponse<FindTagsResponse | ApiErrorResponse | AmbiguousLookupResponse>
) => {
  try {
    const startTime = Date.now();
    const userId = req.user?.id;
    const requestingUser = req.user;
    const { filter, tag_filter, ids } = req.body;

    const sortFieldRaw = filter?.sort || "name";
    const sortDirection = (filter?.direction || "ASC").toUpperCase() as "ASC" | "DESC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Parse random sort to extract seed for consistent pagination
    const { sortField, randomSeed } = parseRandomSort(sortFieldRaw, requestingUser.id);

    // Merge root-level ids with tag_filter
    const normalizedIds = ids
      ? { value: ids, modifier: "INCLUDES" }
      : tag_filter?.ids;
    const mergedFilter: PeekTagFilter = {
      ...tag_filter,
      ids: normalizedIds,
    };

    // Extract specific instance ID for disambiguation (from tag_filter.instance_id)
    const specificInstanceId = tag_filter?.instance_id as string | undefined;

    // Use SQL query builder - admins skip exclusions
    // When fetching by specific IDs, skip exclusions (for detail pages)
    const isFetchingByIds = ids && Array.isArray(ids) && ids.length > 0;
    const applyExclusions = requestingUser?.role !== "ADMIN" && !isFetchingByIds;

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    const { tags, total } = await tagQueryBuilder.execute({
      userId,
      filters: mergedFilter,
      applyExclusions,
      allowedInstanceIds,
      specificInstanceId,
      sort: sortField,
      sortDirection,
      page,
      perPage,
      searchQuery,
      randomSeed,
    });

    // Check for ambiguous results on single-ID lookups
    // This happens when the same ID exists in multiple Stash instances
    if (ids && ids.length === 1 && !specificInstanceId && tags.length > 1) {
      logger.warn("Ambiguous tag lookup", {
        id: ids[0],
        matchCount: tags.length,
        instances: tags.map(t => t.instanceId),
      });
      return res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple tags found with ID ${ids[0]}. Specify instance_id parameter.`,
        matches: tags.map(t => ({
          id: t.id,
          name: t.name,
          instanceId: t.instanceId,
        })),
      });
    }

    // For single-entity requests (detail pages), get tag with computed counts
    let resultTags = tags;
    if (ids && ids.length === 1 && resultTags.length === 1) {
      const tagWithCounts = await stashEntityService.getTag(ids[0], resultTags[0].instanceId);
      if (tagWithCounts) {
        const existingTag = resultTags[0];
        resultTags = [
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

    // Hydrate parent/child relationships with names
    // For single-tag requests (detail pages), we need all tags for accurate parent/child lookup
    let hydratedTags: NormalizedTag[];
    if (ids && ids.length === 1) {
      // Get all tags for hierarchy lookup, then hydrate
      const allTags = await stashEntityService.getAllTags();
      const allHydrated = await hydrateTagRelationships(allTags);
      hydratedTags = allHydrated.filter((t) =>
        resultTags.some((r) => r.id === t.id && r.instanceId === t.instanceId)
      );
      // Merge the computed counts back
      hydratedTags = hydratedTags.map((h) => {
        const result = resultTags.find((r) => r.id === h.id && r.instanceId === h.instanceId);
        return result ? { ...h, ...result } : h;
      });
    } else {
      hydratedTags = await hydrateTagRelationships(resultTags);
    }

    // Add stashUrl to each tag
    const tagsWithStashUrl = hydratedTags.map((tag) => ({
      ...tag,
      stashUrl: buildStashEntityUrl("tag", tag.id),
    }));

    logger.info("findTags completed", {
      totalTime: `${Date.now() - startTime}ms`,
      totalCount: total,
      returnedCount: tagsWithStashUrl.length,
      page,
      perPage,
    });

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
      const matchingPerformers = allPerformers.filter((p) =>
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
      const matchingScenes = allScenes.filter((s) =>
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
      const matchingScenes = allScenes.filter((scene) => {
        if (!scene.groups) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- groups are flattened at runtime, type says SceneGroup (nested)
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
 * Get minimal tags (id + name only) for filter dropdowns
 */
export const findTagsMinimal = async (
  req: TypedAuthRequest<FindTagsMinimalRequest>,
  res: TypedResponse<FindTagsMinimalResponse | ApiErrorResponse>
) => {
  try {
    const { filter, count_filter } = req.body;
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

    // Apply count filters (OR logic - pass if ANY condition is met)
    if (count_filter) {
      const { min_scene_count, min_gallery_count, min_image_count, min_performer_count, min_group_count } = count_filter;
      tags = tags.filter((t) => {
        const conditions: boolean[] = [];
        if (min_scene_count !== undefined) conditions.push(t.scene_count >= min_scene_count);
        if (min_gallery_count !== undefined) conditions.push(t.gallery_count >= min_gallery_count);
        if (min_image_count !== undefined) conditions.push(t.image_count >= min_image_count);
        if (min_performer_count !== undefined) conditions.push(t.performer_count >= min_performer_count);
        if (min_group_count !== undefined) conditions.push(t.group_count >= min_group_count);
        return conditions.length === 0 || conditions.some((c) => c);
      });
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

    // Disambiguate names for entities with same name across different instances
    // Only non-default instances get suffixed with instance name when duplicates exist
    const entitiesWithInstance = paginatedTags.map((t) => ({
      id: t.id,
      name: t.name,
      instanceId: t.instanceId,
    }));
    const minimal = disambiguateEntityNames(entitiesWithInstance);

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

/**
 * Get tags that exist on scenes matching the given filters.
 * Used by folder view to show only relevant tags.
 */
export const findTagsForScenes = async (
  req: TypedAuthRequest<{ performerId?: string; tagId?: string; studioId?: string; groupId?: string }>,
  res: TypedResponse<{ tags: Array<{ id: string; name: string; parent_ids?: string[] }> } | ApiErrorResponse>
) => {
  try {
    const { performerId, tagId, studioId, groupId } = req.body;
    const userId = req.user?.id;
    const requestingUser = req.user;

    // Build query to find distinct tag IDs from matching scenes
    // Uses instanceId constraints on junction tables for multi-instance correctness
    let sceneTagQuery = `
      SELECT DISTINCT st.tagId
      FROM SceneTag st
      INNER JOIN StashScene s ON s.id = st.sceneId AND st.sceneInstanceId = s.stashInstanceId
      LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = s.id
      WHERE s.deletedAt IS NULL AND e.id IS NULL
    `;
    const params: (string | number)[] = [userId as number];

    if (performerId) {
      sceneTagQuery += ` AND EXISTS (SELECT 1 FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND sp.performerId = ?)`;
      params.push(performerId);
    }
    if (tagId) {
      sceneTagQuery += ` AND EXISTS (SELECT 1 FROM SceneTag st2 WHERE st2.sceneId = s.id AND st2.sceneInstanceId = s.stashInstanceId AND st2.tagId = ?)`;
      params.push(tagId);
    }
    if (studioId) {
      sceneTagQuery += ` AND s.studioId = ?`;
      params.push(studioId);
    }
    if (groupId) {
      sceneTagQuery += ` AND EXISTS (SELECT 1 FROM SceneGroup sg WHERE sg.sceneId = s.id AND sg.sceneInstanceId = s.stashInstanceId AND sg.groupId = ?)`;
      params.push(groupId);
    }

    const tagIdResults = await prisma.$queryRawUnsafe<Array<{ tagId: string }>>(sceneTagQuery, ...params);
    const tagIds = new Set(tagIdResults.map(r => r.tagId));

    if (tagIds.size === 0) {
      return res.json({ tags: [] });
    }

    // Get all tags to build hierarchy
    let allTags = await stashEntityService.getAllTags();

    // Apply exclusions for non-admins
    if (requestingUser?.role !== "ADMIN") {
      allTags = await entityExclusionHelper.filterExcluded(allTags, userId, "tag");
    }

    // Expand to include parent tags for hierarchy
    const expandedTagIds = new Set(tagIds);
    const tagMap = new Map(allTags.map(t => [t.id, t]));

    // Walk up parent chains
    for (const currentTagId of tagIds) {
      const tag = tagMap.get(currentTagId);
      if (tag?.parents && Array.isArray(tag.parents)) {
        for (const parent of tag.parents) {
          expandedTagIds.add(parent.id);
          // Also add grandparents, etc.
          let parentTag = tagMap.get(parent.id);
          while (parentTag?.parents && Array.isArray(parentTag.parents) && parentTag.parents.length > 0) {
            for (const gp of parentTag.parents) {
              expandedTagIds.add(gp.id);
            }
            // Get first parent to continue chain (tags can have multiple parents)
            parentTag = parentTag.parents[0] ? tagMap.get(parentTag.parents[0].id) : undefined;
          }
        }
      }
    }

    // Filter to only expanded tags
    const filteredTags = allTags.filter(t => expandedTagIds.has(t.id));

    // Build children arrays based on filtered tags only
    // A tag's children are tags that have this tag as a parent AND are in our filtered set
    const childrenMap = new Map<string, Array<{ id: string }>>();
    for (const tag of filteredTags) {
      if (tag.parents) {
        for (const parent of tag.parents) {
          if (expandedTagIds.has(parent.id)) {
            if (!childrenMap.has(parent.id)) {
              childrenMap.set(parent.id, []);
            }
            childrenMap.get(parent.id)?.push({ id: tag.id });
          }
        }
      }
    }

    // Return tags with parents and children arrays (matching the structure buildFolderTree expects)
    const tagsWithHierarchy = filteredTags.map(t => ({
      id: t.id,
      name: t.name,
      image_path: t.image_path,
      parents: t.parents?.filter(p => expandedTagIds.has(p.id)).map(p => ({ id: p.id })) || [],
      children: childrenMap.get(t.id) || [],
    }));

    res.json({ tags: tagsWithHierarchy });
  } catch (error) {
    logger.error("Error in findTagsForScenes", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find tags for scenes",
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

    const instanceId = await getEntityInstanceId('tag', id);
    const stash = stashInstanceManager.get(instanceId);
    if (!stash) {
      return res.status(404).json({ error: "Stash instance not found for tag" });
    }

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
