import type {
  TypedAuthRequest,
  TypedResponse,
  FindGroupsRequest,
  FindGroupsResponse,
  FindGroupsMinimalRequest,
  FindGroupsMinimalResponse,
  ApiErrorResponse,
} from "../../types/api/index.js";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type { NormalizedGroup, PeekGroupFilter } from "../../types/index.js";
import { hydrateEntityTags } from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Merge user-specific data into groups
 */
async function mergeGroupsWithUserData(
  groups: NormalizedGroup[],
  userId: number | undefined
): Promise<NormalizedGroup[]> {
  if (!userId) return groups;

  try {
    const groupRatings = await prisma.groupRating.findMany({
      where: { userId },
    });

    const ratingsMap = new Map(
      groupRatings.map((r) => [
        r.groupId,
        { rating: r.rating, rating100: r.rating, favorite: r.favorite },
      ])
    );

    return groups.map((group) => {
      const userRating = ratingsMap.get(group.id);
      return {
        ...group,
        rating: userRating?.rating ?? null,
        rating100: userRating?.rating100 ?? group.rating100 ?? null,
        favorite: userRating?.favorite ?? false,
      };
    });
  } catch (error) {
    logger.error("Error merging groups with user data", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return groups;
  }
}

/**
 * Apply group filters
 */
export async function applyGroupFilters(
  groups: NormalizedGroup[],
  filters: PeekGroupFilter | null | undefined
): Promise<NormalizedGroup[]> {
  if (!filters) return groups;

  let filtered = groups;

  // Filter by IDs (for detail pages)
  if (filters.ids?.value && filters.ids.value.length > 0) {
    const idSet = new Set(filters.ids.value);
    filtered = filtered.filter((g) => idSet.has(g.id));
  }

  // Filter by favorite
  if (filters.favorite !== undefined) {
    filtered = filtered.filter((g) => g.favorite === filters.favorite);
  }

  // Filter by tags
  if (filters.tags) {
    const { modifier, value: tagIds } = filters.tags;
    if (tagIds && tagIds.length > 0) {
      filtered = filtered.filter((g) => {
        const groupTagIds = (g.tags || []).map((t: any) => String(t.id));
        const filterTagIds = tagIds.map(String);

        if (modifier === "INCLUDES_ALL") {
          return filterTagIds.every((id: string) => groupTagIds.includes(id));
        }
        if (modifier === "INCLUDES") {
          return filterTagIds.some((id: string) => groupTagIds.includes(id));
        }
        if (modifier === "EXCLUDES") {
          return !filterTagIds.some((id: string) => groupTagIds.includes(id));
        }
        return true;
      });
    }
  }

  // Filter by performers
  // Note: Groups/Collections don't have direct performer relationships in Stash
  // We need to check which groups contain scenes with these performers
  // Uses efficient SQL join query instead of loading all scenes
  if (filters.performers && filters.performers.value) {
    const performerIds = filters.performers.value.map(String);
    const groupIdsWithPerformers = await stashEntityService.getGroupIdsByPerformers(performerIds);
    filtered = filtered.filter((g) => groupIdsWithPerformers.has(g.id));
  }

  // Filter by studios
  if (filters.studios && filters.studios.value) {
    const studioIds = new Set(filters.studios.value.map(String));
    filtered = filtered.filter(
      (g) => g.studio && studioIds.has(String(g.studio.id))
    );
  }

  // Filter by rating100
  if (filters.rating100) {
    const { modifier, value, value2 } = filters.rating100;
    filtered = filtered.filter((g) => {
      const rating = g.rating100 || 0;
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

  return filtered;
}

/**
 * Find groups endpoint
 * Uses GroupQueryBuilder for SQL-native filtering (Phase 3 scalability)
 */
export const findGroups = async (
  req: TypedAuthRequest<FindGroupsRequest>,
  res: TypedResponse<FindGroupsResponse | ApiErrorResponse>
) => {
  try {
    const startTime = Date.now();
    const userId = req.user?.id;
    const { filter, group_filter, ids } = req.body;

    const sortField = filter?.sort || "name";
    const sortDirection = (filter?.direction || "ASC") as "ASC" | "DESC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Admins skip exclusions to see everything
    const requestingUser = req.user;
    const applyExclusions = requestingUser?.role !== "ADMIN";

    // Merge root-level ids with group_filter
    const normalizedIds = ids
      ? { value: ids, modifier: "INCLUDES" }
      : group_filter?.ids;
    const mergedFilter: PeekGroupFilter & Record<string, unknown> = {
      ...group_filter,
      ids: normalizedIds,
    };

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    // Use SQL-native query builder
    const { groups, total } = await groupQueryBuilder.execute({
      userId,
      filters: mergedFilter,
      applyExclusions,
      allowedInstanceIds,
      sort: sortField,
      sortDirection,
      page,
      perPage,
      searchQuery,
    });

    // For single-entity requests (detail pages), get group with computed counts
    let paginatedGroups = groups;
    if (ids && ids.length === 1 && paginatedGroups.length === 1) {
      const groupWithCounts = await stashEntityService.getGroup(ids[0]);
      if (groupWithCounts) {
        const existingGroup = paginatedGroups[0];
        paginatedGroups = [
          {
            ...existingGroup,
            scene_count: groupWithCounts.scene_count,
            performer_count: groupWithCounts.performer_count,
          },
        ];

        // Hydrate tags with names
        paginatedGroups = await hydrateEntityTags(paginatedGroups);

        logger.info("Computed counts for group detail", {
          groupId: existingGroup.id,
          groupName: existingGroup.name,
          sceneCount: groupWithCounts.scene_count,
          performerCount: groupWithCounts.performer_count,
        });
      }
    }

    // Add stashUrl to each group
    const groupsWithStashUrl = paginatedGroups.map(group => ({
      ...group,
      stashUrl: buildStashEntityUrl('group', group.id),
    }));

    logger.info("findGroups completed", {
      totalTime: `${Date.now() - startTime}ms`,
      totalCount: total,
      returnedCount: groupsWithStashUrl.length,
      page,
      perPage,
    });

    res.json({
      findGroups: {
        count: total,
        groups: groupsWithStashUrl,
      },
    });
  } catch (error) {
    logger.error("Error in findGroups", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find groups",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Minimal groups - just id and name for dropdowns
 */
export const findGroupsMinimal = async (
  req: TypedAuthRequest<FindGroupsMinimalRequest>,
  res: TypedResponse<FindGroupsMinimalResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const { filter, count_filter } = req.body;
    const searchQuery = filter?.q || "";

    // Step 1: Get all groups from cache
    let groups = await stashEntityService.getAllGroups();

    if (groups.length === 0) {
      logger.warn("Cache not initialized, returning empty result");
      return res.json({
        groups: [],
      });
    }

    // Step 2: Merge with user data (for favorites)
    groups = await mergeGroupsWithUserData(groups, userId);

    // Step 2.5: Apply pre-computed exclusions (includes restrictions, hidden, cascade, and empty)
    // Admins skip exclusions to see everything
    const requestingUser = req.user;
    if (requestingUser?.role !== "ADMIN") {
      groups = await entityExclusionHelper.filterExcluded(
        groups,
        userId,
        "group"
      );
    }

    // Step 2.6: Apply count filters (OR logic - pass if ANY condition is met)
    if (count_filter) {
      const { min_scene_count, min_performer_count } = count_filter;
      groups = groups.filter((g) => {
        const conditions: boolean[] = [];
        if (min_scene_count !== undefined) conditions.push(g.scene_count >= min_scene_count);
        if (min_performer_count !== undefined) conditions.push(g.performer_count >= min_performer_count);
        return conditions.length === 0 || conditions.some((c) => c);
      });
    }

    // Step 3: Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      groups = groups.filter((g) => {
        const name = g.name || "";
        return name.toLowerCase().includes(lowerQuery);
      });
    }

    // Step 4: Sort by name
    groups = groups.sort((a, b) => {
      const aName = (a.name || "").toLowerCase();
      const bName = (b.name || "").toLowerCase();
      return aName.localeCompare(bName);
    });

    // Step 5: Map to minimal shape
    const minimalGroups = groups.map((g) => ({
      id: g.id,
      name: g.name,
      favorite: g.favorite,
    }));

    res.json({
      groups: minimalGroups,
    });
  } catch (error) {
    logger.error("Error in findGroupsMinimal", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find groups",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
