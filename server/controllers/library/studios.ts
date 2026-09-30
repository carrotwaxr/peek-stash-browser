import { findMinimalEntities } from "../../services/MinimalEntityQuery.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindStudiosMinimalRequest,
  FindStudiosMinimalResponse,
  FindStudiosRequest,
  FindStudiosResponse,
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
 * findStudios using SQL query builder
 */
export const findStudios = async (
  req: TypedLibraryRequest<FindStudiosRequest>,
  res: TypedResponse<
    FindStudiosResponse<ListCount> | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("studio", req.body, {
    userId: req.user.id,
  });

  const startTime = Date.now();
  const userId = req.user.id;
  const { page, perPage, specificInstanceId } = request;
  // A detail page asks for its studio by id
  const lookup = singleIdRef(request.filter.ids);

  // Exclusions apply to every user; an admin's rows hold only their own hides
  const applyExclusions = true;

  const { allowedInstanceIds } = req;

  const { items: studios, total } = await studioQueryBuilder.execute({
    userId,
    allowedInstanceIds,
    request,
    applyExclusions,
  });

  // Check for ambiguous results on single-ID lookups
  if (lookup && !specificInstanceId && studios.length > 1) {
    logger.warn("Ambiguous studio lookup", {
      id: lookup.id,
      matchCount: studios.length,
      instances: studios.map((s) => s.instanceId),
    });
    res.status(400).json({
      error: "Ambiguous lookup",
      message: `Multiple studios found with ID ${lookup.id}. Specify instance_id parameter.`,
      matches: studios.map((s) => ({
        id: s.id,
        name: s.name,
        instanceId: s.instanceId,
      })),
    });
    return;
  }

  // A detail page reads its studio's counts from the row, as its card
  // shows them; its tabs count through GET /studios/:id/counts
  // Add stashUrl to each studio; its parent and children come with the
  // row, as the viewer may see them
  const studiosWithStashUrl = studios.map((studio) => ({
    ...studio,
    stashUrl: buildStashEntityUrl(
      "studio",
      studio.id,
      studio.instanceId,
      req.user
    ),
  }));

  logger.debug("findStudios completed", {
    totalTime: `${Date.now() - startTime}ms`,
    totalCount: total,
    returnedCount: studiosWithStashUrl.length,
    page,
    perPage,
  });

  res.json({
    findStudios: {
      count: total,
      studios: studiosWithStashUrl,
    },
  });
};

/**
 * One page of studios for an entity picker, in name order: the name matched
 * in SQL, or the ids a picker has selected; with scope "allEnabled", on
 * every enabled server (admins only). A ValidationError (400) or
 * ForbiddenError (403) reaches the central error handler.
 */
export const findStudiosMinimal = async (
  req: TypedLibraryRequest<FindStudiosMinimalRequest>,
  res: TypedResponse<FindStudiosMinimalResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const request = parseMinimalRequest("studio", req.body, { userId });

  const studios = await findMinimalEntities(
    req.user,
    request,
    req.allowedInstanceIds
  );
  res.json({ studios });
};

/** GET /api/library/studios/:id/counts: the studio page's tab counts */
export const getStudioCounts = relationCountsHandler("studio");
