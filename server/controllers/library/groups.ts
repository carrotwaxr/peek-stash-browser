import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { findMinimalEntities } from "../../services/MinimalEntityQuery.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindGroupsMinimalRequest,
  FindGroupsMinimalResponse,
  FindGroupsRequest,
  FindGroupsResponse,
  TypedLibraryRequest,
  TypedResponse,
} from "../../types/api/index.js";
import {
  parseListRequest,
  parseMinimalRequest,
  singleIdRef,
} from "../../utils/listRequest.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Find groups endpoint
 * Uses GroupQueryBuilder for SQL-native filtering (Phase 3 scalability)
 */
export const findGroups = async (
  req: TypedLibraryRequest<FindGroupsRequest>,
  res: TypedResponse<
    FindGroupsResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("group", req.body, {
    userId: req.user.id,
  });

  const startTime = Date.now();
  const userId = req.user.id;
  const { page, perPage, specificInstanceId } = request;
  // A detail page asks for its group by id
  const lookup = singleIdRef(request.filter.ids);

  // Exclusions apply to every user; an admin's rows hold only their own hides
  const applyExclusions = true;

  const { allowedInstanceIds } = req;

  // Use SQL-native query builder
  const { items: groups, total } = await groupQueryBuilder.execute({
    userId,
    allowedInstanceIds,
    request,
    applyExclusions,
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
};

/**
 * One page of groups for an entity picker, in name order: the name matched
 * in SQL, or the ids a picker has selected; with scope "allEnabled", on
 * every enabled server (admins only). A ValidationError (400) or
 * ForbiddenError (403) reaches the central error handler.
 */
export const findGroupsMinimal = async (
  req: TypedLibraryRequest<FindGroupsMinimalRequest>,
  res: TypedResponse<FindGroupsMinimalResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const request = parseMinimalRequest("group", req.body, { userId });

  const groups = await findMinimalEntities(
    req.user,
    request,
    req.allowedInstanceIds
  );
  res.json({ groups });
};
