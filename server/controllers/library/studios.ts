import { findMinimalEntities } from "../../services/MinimalEntityQuery.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindStudiosMinimalRequest,
  FindStudiosMinimalResponse,
  FindStudiosRequest,
  FindStudiosResponse,
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
 * findStudios using SQL query builder
 */
export const findStudios = async (
  req: TypedAuthRequest<FindStudiosRequest>,
  res: TypedResponse<
    FindStudiosResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("studio", req.body, {
    userId: req.user.id,
  });
  logDropped("POST /library/studios", request.dropped);

  const startTime = Date.now();
  const userId = req.user.id;
  const { page, perPage, specificInstanceId } = request;
  // A detail page asks for its studio by id
  const lookup = singleIdRef(request.filter.ids);

  // Exclusions apply to every user; an admin's rows hold only their own hides
  const applyExclusions = true;

  // Get user's allowed instance IDs for multi-instance filtering
  const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

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

  // For single-entity requests (detail pages), get studio with computed counts
  let resultStudios = studios;
  if (lookup && resultStudios.length === 1) {
    // Get studio with computed counts from junction tables
    const firstStudio = resultStudios[0] as (typeof resultStudios)[number];
    const studioWithCounts = await stashEntityService.getStudio(
      firstStudio.id,
      firstStudio.instanceId
    );
    if (studioWithCounts) {
      // Merge with the studio data (which has user ratings/stats)
      const existingStudio = firstStudio;
      resultStudios = [
        {
          ...existingStudio,
          scene_count: studioWithCounts.scene_count,
          image_count: studioWithCounts.image_count,
          gallery_count: studioWithCounts.gallery_count,
          performer_count: studioWithCounts.performer_count,
          group_count: studioWithCounts.group_count,
        },
      ];

      logger.debug("Computed counts for studio detail", {
        studioId: existingStudio.id,
        studioName: existingStudio.name,
        sceneCount: studioWithCounts.scene_count,
        imageCount: studioWithCounts.image_count,
        galleryCount: studioWithCounts.gallery_count,
        performerCount: studioWithCounts.performer_count,
        groupCount: studioWithCounts.group_count,
      });
    }
  }

  // Add stashUrl to each studio; its parent and children come with the
  // row, as the viewer may see them
  const studiosWithStashUrl = resultStudios.map((studio) => ({
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
  req: TypedAuthRequest<FindStudiosMinimalRequest>,
  res: TypedResponse<FindStudiosMinimalResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const request = parseMinimalRequest("studio", req.body, { userId });
  logDropped("POST /library/studios/minimal", request.dropped);

  const studios = await findMinimalEntities(req.user, request);
  res.json({ studios });
};
