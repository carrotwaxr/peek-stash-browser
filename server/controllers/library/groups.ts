import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { findMinimalEntities } from "../../services/MinimalEntityQuery.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindGroupsMinimalRequest,
  FindGroupsMinimalResponse,
  FindGroupsRequest,
  FindGroupsResponse,
  ListCount,
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
import { relationCountsHandler } from "./relationCounts.js";

/**
 * Find groups endpoint
 * Uses GroupQueryBuilder for SQL-native filtering (Phase 3 scalability)
 */
export const findGroups = async (
  req: TypedLibraryRequest<FindGroupsRequest>,
  res: TypedResponse<
    FindGroupsResponse<ListCount> | ApiErrorResponse | AmbiguousLookupResponse
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

  const { allowedInstanceIds, timeZone } = req;

  // Use SQL-native query builder
  const { items: groups, total } = await groupQueryBuilder.execute({
    userId,
    allowedInstanceIds,
    timeZone,
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

  // A detail page's group comes with its place in the collection
  // hierarchy; its counts are the row's, as its card shows them, and its
  // tabs count through GET /groups/:id/counts
  let paginatedGroups = groups;
  if (lookup && paginatedGroups.length === 1) {
    const firstGroup = paginatedGroups[0] as (typeof paginatedGroups)[number];
    const hierarchy = await groupQueryBuilder.getHierarchy(
      firstGroup.id,
      firstGroup.instanceId,
      userId
    );
    paginatedGroups = [{ ...firstGroup, ...hierarchy }];
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

/** GET /api/library/groups/:id/counts: the collection page's tab counts */
export const getGroupCounts = relationCountsHandler("group");
