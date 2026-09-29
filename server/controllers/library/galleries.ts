import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { findMinimalEntities } from "../../services/MinimalEntityQuery.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindGalleriesMinimalRequest,
  FindGalleriesMinimalResponse,
  FindGalleriesRequest,
  FindGalleriesResponse,
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
 * Find galleries endpoint
 * Uses GalleryQueryBuilder for SQL-native filtering (Phase 3 scalability)
 */
export const findGalleries = async (
  req: TypedAuthRequest<FindGalleriesRequest>,
  res: TypedResponse<
    FindGalleriesResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("gallery", req.body, {
    userId: req.user.id,
  });
  logDropped("POST /library/galleries", request.dropped);

  const startTime = Date.now();
  const userId = req.user.id;
  const { page, perPage, specificInstanceId } = request;
  // A detail page asks for its gallery by id
  const lookup = singleIdRef(request.filter.ids);

  // Exclusions apply to every user; an admin's rows hold only their own hides
  const applyExclusions = true;

  // Get user's allowed instance IDs for multi-instance filtering
  const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

  // Use SQL-native query builder
  const { items: galleries, total } = await galleryQueryBuilder.execute({
    userId,
    allowedInstanceIds,
    request,
    applyExclusions,
  });

  // Check for ambiguous results on single-ID lookups
  if (lookup && !specificInstanceId && galleries.length > 1) {
    logger.warn("Ambiguous gallery lookup", {
      id: lookup.id,
      matchCount: galleries.length,
      instances: galleries.map((g) => g.instanceId),
    });
    res.status(400).json({
      error: "Ambiguous lookup",
      message: `Multiple galleries found with ID ${lookup.id}. Specify instance_id parameter.`,
      matches: galleries.map((g) => ({
        id: g.id,
        title: g.title,
        instanceId: g.instanceId,
      })),
    });
    return;
  }

  // For single-entity requests (detail pages), get gallery with computed counts
  let paginatedGalleries = galleries;
  if (lookup && paginatedGalleries.length === 1) {
    const existingGallery =
      paginatedGalleries[0] as (typeof paginatedGalleries)[number];
    const galleryWithCounts = await stashEntityService.getGallery(
      existingGallery.id,
      existingGallery.instanceId
    );
    if (galleryWithCounts) {
      paginatedGalleries = [
        {
          ...existingGallery,
          image_count: galleryWithCounts.image_count,
        },
      ];
      logger.debug("Computed counts for gallery detail", {
        galleryId: existingGallery.id,
        galleryTitle: existingGallery.title,
        imageCount: galleryWithCounts.image_count,
      });
    }
  }

  // Add stashUrl to each gallery
  const galleriesWithStashUrl = paginatedGalleries.map((gallery) => ({
    ...gallery,
    stashUrl: buildStashEntityUrl(
      "gallery",
      gallery.id,
      gallery.instanceId,
      req.user
    ),
  }));

  logger.debug("findGalleries completed", {
    totalTime: `${Date.now() - startTime}ms`,
    totalCount: total,
    returnedCount: galleriesWithStashUrl.length,
    page,
    perPage,
  });

  res.json({
    findGalleries: {
      count: total,
      galleries: galleriesWithStashUrl,
    },
  });
};

/**
 * One page of galleries for an entity picker, in name order: the shown name
 * (the title, else the file, else the folder) matched in SQL, or the ids a
 * picker has selected; with scope "allEnabled", on every enabled server
 * (admins only). A ValidationError (400) or ForbiddenError (403) reaches the
 * central error handler.
 */
export const findGalleriesMinimal = async (
  req: TypedAuthRequest<FindGalleriesMinimalRequest>,
  res: TypedResponse<FindGalleriesMinimalResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const request = parseMinimalRequest("gallery", req.body, { userId });
  logDropped("POST /library/galleries/minimal", request.dropped);

  const galleries = await findMinimalEntities(req.user, request);
  res.json({ galleries });
};
