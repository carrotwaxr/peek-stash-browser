import { findMinimalEntities } from "../../services/MinimalEntityQuery.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindPerformersMinimalRequest,
  FindPerformersMinimalResponse,
  FindPerformersRequest,
  FindPerformersResponse,
  TypedAuthRequest,
  TypedResponse,
} from "../../types/api/index.js";
import {
  logDropped,
  parseListRequest,
  parseMinimalRequest,
  singleIdRef,
} from "../../utils/listRequest.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Find performers using SQL query builder
 * Uses PerformerQueryBuilder for SQL-native filtering, sorting, and pagination.
 */
export const findPerformers = async (
  req: TypedAuthRequest<FindPerformersRequest>,
  res: TypedResponse<
    FindPerformersResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("performer", req.body, {
    userId: req.user.id,
  });
  logDropped("POST /library/performers", request.dropped);

  try {
    const startTime = Date.now();
    const userId = req.user.id;
    const { page, perPage, specificInstanceId } = request;
    // A detail page asks for its performer by id
    const lookup = singleIdRef(request.filter.ids);

    // Exclusions apply to every user; an admin's rows hold only their own hides
    const applyExclusions = true;

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    const { items: performers, total } = await performerQueryBuilder.execute({
      userId,
      allowedInstanceIds,
      request,
      applyExclusions,
    });

    // Check for ambiguous results on single-ID lookups
    // This happens when the same ID exists in multiple Stash instances
    if (lookup && !specificInstanceId && performers.length > 1) {
      logger.warn("Ambiguous performer lookup", {
        id: lookup.id,
        matchCount: performers.length,
        instances: performers.map((p) => p.instanceId),
      });
      res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple performers found with ID ${lookup.id}. Specify instance_id parameter.`,
        matches: performers.map((p) => ({
          id: p.id,
          name: p.name,
          instanceId: p.instanceId,
        })),
      });
      return;
    }

    // Add stashUrl to each performer; its tags come with the row, named on
    // their own instance
    const performersWithStashUrl = performers.map((performer) => ({
      ...performer,
      stashUrl: buildStashEntityUrl(
        "performer",
        performer.id,
        performer.instanceId,
        req.user
      ),
    }));

    logger.debug("findPerformers completed", {
      totalTime: `${Date.now() - startTime}ms`,
      totalCount: total,
      returnedCount: performersWithStashUrl.length,
      page,
      perPage,
    });

    res.json({
      findPerformers: {
        count: total,
        performers: performersWithStashUrl,
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
 * One page of performers for an entity picker, in name order: the name and
 * aliases matched in SQL, or the ids a picker has selected; with scope
 * "allEnabled", on every enabled server (admins only). A ValidationError
 * (400) or ForbiddenError (403) reaches the central error handler.
 */
export const findPerformersMinimal = async (
  req: TypedAuthRequest<FindPerformersMinimalRequest>,
  res: TypedResponse<FindPerformersMinimalResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const request = parseMinimalRequest("performer", req.body, { userId });
  logDropped("POST /library/performers/minimal", request.dropped);

  const performers = await findMinimalEntities(req.user, request);
  res.json({ performers });
};
