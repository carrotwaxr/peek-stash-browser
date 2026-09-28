import { coerceEntityRefs } from "@peek/shared-types/instanceAwareId.js";
import prisma from "../../prisma/singleton.js";
import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindGroupsMinimalRequest,
  FindGroupsMinimalResponse,
  FindGroupsRequest,
  FindGroupsResponse,
  TypedAuthRequest,
  TypedResponse,
} from "../../types/api/index.js";
import type { NormalizedGroup, PeekGroupFilter } from "../../types/index.js";
import { entityKey } from "../../utils/entityRef.js";
import { hydrateEntityTags } from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import { parseRandomSort } from "../../utils/seededRandom.js";
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
        entityKey(r.groupId, r.instanceId ?? ""),
        { rating: r.rating, rating100: r.rating, favorite: r.favorite },
      ])
    );

    return groups.map((group) => {
      const userRating = ratingsMap.get(entityKey(group.id, group.instanceId));
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
 * Find groups endpoint
 * Uses GroupQueryBuilder for SQL-native filtering (Phase 3 scalability)
 */
export const findGroups = async (
  req: TypedAuthRequest<FindGroupsRequest>,
  res: TypedResponse<
    FindGroupsResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  try {
    const startTime = Date.now();
    const userId = req.user?.id;
    const { filter, group_filter, ids } = req.body;

    const sortFieldRaw = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Exclusions apply to every user; an admin's rows hold only their own hides
    const requestingUser = req.user;
    const applyExclusions = true;

    // Parse random sort to extract seed for consistent pagination
    const { sortField, randomSeed } = parseRandomSort(
      sortFieldRaw,
      requestingUser.id
    );

    // Merge root-level ids with group_filter
    const normalizedIds = ids
      ? { value: coerceEntityRefs(ids), modifier: "INCLUDES" }
      : group_filter?.ids;
    const mergedFilter: PeekGroupFilter & Record<string, unknown> = {
      ...group_filter,
      ids: normalizedIds,
    };

    // Extract specific instance ID for disambiguation (from group_filter.instance_id)
    const specificInstanceId = group_filter?.instance_id;

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    // Use SQL-native query builder
    const { groups, total } = await groupQueryBuilder.execute({
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
    if (ids && ids.length === 1 && !specificInstanceId && groups.length > 1) {
      logger.warn("Ambiguous group lookup", {
        id: ids[0],
        matchCount: groups.length,
        instances: groups.map((g) => g.instanceId),
      });
      res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple groups found with ID ${ids[0]}. Specify instance_id parameter.`,
        matches: groups.map((g) => ({
          id: g.id,
          name: g.name,
          instanceId: g.instanceId,
        })),
      });
      return;
    }

    // For single-entity requests (detail pages), get group with computed counts
    // and its place in the collection hierarchy
    let paginatedGroups = groups;
    if (ids && ids.length === 1 && paginatedGroups.length === 1) {
      const firstGroup = paginatedGroups[0] as (typeof paginatedGroups)[number];
      const [groupWithCounts, hierarchy] = await Promise.all([
        stashEntityService.getGroup(ids[0] as string, firstGroup.instanceId),
        groupQueryBuilder.getHierarchy(
          firstGroup.id,
          firstGroup.instanceId,
          userId
        ),
      ]);
      const existingGroup = { ...firstGroup, ...hierarchy };
      paginatedGroups = [existingGroup];
      if (groupWithCounts) {
        paginatedGroups = [
          {
            ...existingGroup,
            scene_count: groupWithCounts.scene_count,
            performer_count: groupWithCounts.performer_count,
          },
        ];

        // Hydrate tags with names
        paginatedGroups = await hydrateEntityTags(paginatedGroups);

        logger.debug("Computed counts for group detail", {
          groupId: existingGroup.id,
          groupName: existingGroup.name,
          sceneCount: groupWithCounts.scene_count,
          performerCount: groupWithCounts.performer_count,
        });
      }
    }

    // Add stashUrl to each group
    const groupsWithStashUrl = paginatedGroups.map((group) => ({
      ...group,
      stashUrl: buildStashEntityUrl(
        "group",
        group.id,
        group.instanceId,
        req.user
      ),
    }));

    logger.debug("findGroups completed", {
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
      res.json({
        groups: [],
      });
      return;
    }

    // Step 2: Merge with user data (for favorites)
    groups = await mergeGroupsWithUserData(groups, userId);

    // Step 2.5: Apply pre-computed exclusions (includes restrictions, hidden, cascade, and empty)
    groups = await entityExclusionHelper.filterExcluded(
      groups,
      userId,
      "group"
    );

    // Step 2.6: Apply count filters (OR logic - pass if ANY condition is met)
    if (count_filter) {
      const { min_scene_count, min_performer_count } = count_filter;
      groups = groups.filter((g) => {
        const conditions: boolean[] = [];
        if (min_scene_count !== undefined)
          conditions.push(g.scene_count >= min_scene_count);
        if (min_performer_count !== undefined)
          conditions.push(g.performer_count >= min_performer_count);
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
      instanceId: g.instanceId || "",
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
