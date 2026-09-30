import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { findMinimalEntities } from "../../services/MinimalEntityQuery.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindGalleriesMinimalRequest,
  FindGalleriesMinimalResponse,
  FindGalleriesRequest,
  FindGalleriesResponse,
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
 * Find galleries endpoint
 * Uses GalleryQueryBuilder for SQL-native filtering (Phase 3 scalability)
 */
export const findGalleries = async (
  req: TypedLibraryRequest<FindGalleriesRequest>,
  res: TypedResponse<
    | FindGalleriesResponse<ListCount>
    | ApiErrorResponse
    | AmbiguousLookupResponse
  >
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("gallery", req.body, {
    userId: req.user.id,
  });

  const startTime = Date.now();
  const userId = req.user.id;
  const { page, perPage, specificInstanceId } = request;
  // A detail page asks for its gallery by id
  const lookup = singleIdRef(request.filter.ids);

  // Exclusions apply to every user; an admin's rows hold only their own hides
  const applyExclusions = true;

  const { allowedInstanceIds } = req;

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

  // A detail page reads its gallery's counts from the row, as its card
  // shows them; its tabs count through GET /galleries/:id/counts
  // Add stashUrl to each gallery
  const galleriesWithStashUrl = galleries.map((gallery) => ({
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
  req: TypedLibraryRequest<FindGalleriesMinimalRequest>,
  res: TypedResponse<FindGalleriesMinimalResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const request = parseMinimalRequest("gallery", req.body, { userId });

  const galleries = await findMinimalEntities(
    req.user,
    request,
    req.allowedInstanceIds
  );
  res.json({ galleries });
};

/** GET /api/library/galleries/:id/counts: the gallery page's tab counts */
export const getGalleryCounts = relationCountsHandler("gallery");
