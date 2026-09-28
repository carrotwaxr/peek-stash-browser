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
import type { NormalizedGroup } from "../../types/index.js";
import { entityKey } from "../../utils/entityRef.js";
import { hydrateEntityTags } from "../../utils/hierarchyUtils.js";
import { toLegacyFilter } from "../../utils/legacyFilter.js";
import {
  logDropped,
  parseListRequest,
  parseMinimalRequest,
  singleIdRef,
} from "../../utils/listRequest.js";
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
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("group", req.body, {
    userId: req.user.id,
  });
  logDropped("POST /library/groups", request.dropped);

  try {
    const startTime = Date.now();
    const userId = req.user.id;
    const { page, perPage, specificInstanceId } = request;
    // A detail page asks for its group by id
    const lookup = singleIdRef(request.filter.ids);

    // Exclusions apply to every user; an admin's rows hold only their own hides
    const applyExclusions = true;

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    // Use SQL-native query builder
    const { groups, total } = await groupQueryBuilder.execute({
      userId,
      filters: toLegacyFilter("group", request.filter),
      applyExclusions,
      allowedInstanceIds,
      specificInstanceId,
      sort: request.sort.field,
      sortDirection: request.sort.direction,
      page,
      perPage,
      searchQuery: request.q,
      randomSeed: request.sort.seed,
    });

    // Check for ambiguous results on single-ID lookups
    if (lookup && !specificInstanceId && groups.length > 1) {
      logger.warn("Ambiguous group lookup", {
        id: lookup.id,
        matchCount: groups.length,
        instances: groups.map((g) => g.instanceId),
      });
      res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple groups found with ID ${lookup.id}. Specify instance_id parameter.`,
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
    if (lookup && paginatedGroups.length === 1) {
      const firstGroup = paginatedGroups[0] as (typeof paginatedGroups)[number];
      const [groupWithCounts, hierarchy] = await Promise.all([
        stashEntityService.getGroup(firstGroup.id, firstGroup.instanceId),
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
  // q, name order, a page of 50 unless the request names 1..250, and the
  // count minimums; a ValidationError (400) reaches the central error handler
  const request = parseMinimalRequest("group", req.body, {
    userId: req.user.id,
  });
  logDropped("POST /library/groups/minimal", request.dropped);

  try {
    const userId = req.user.id;
    const { q: searchQuery, direction, perPage } = request;
    const count_filter = request.countFilter;

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
      const comparison = aName.localeCompare(bName);
      return direction === "DESC" ? -comparison : comparison;
    });

    // Step 5: The first page, in the minimal shape (the pickers never page)
    const minimalGroups = groups.slice(0, perPage).map((g) => ({
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
