import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindImagesRequest,
  FindImagesResponse,
  TypedAuthRequest,
  TypedResponse,
  WithStashUrl,
} from "../../types/api/index.js";
import type { NormalizedImage } from "../../types/index.js";
import { toLegacyFilter } from "../../utils/legacyFilter.js";
import {
  logDropped,
  parseListRequest,
  singleIdRef,
} from "../../utils/listRequest.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Transform ImageQueryBuilder result to match expected API response format
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- data transformer between ImageQueryBuilder's internal DB row format and API response; all property accesses on Record<string, any> are inherently unsafe */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- spread of dynamic fields prevents specific return type
function transformImageResult(image: Record<string, any>): any {
  return {
    ...image,
    // Map user data fields to expected names
    rating100: image.userRating ?? image.stashRating100 ?? null,
    favorite: image.userFavorite === 1 || image.userFavorite === true,
    oCounter: image.userOCount ?? image.stashOCounter ?? 0,
    viewCount: image.userViewCount ?? 0,
    lastViewedAt: image.userLastViewedAt ?? null,
    // Add paths object for frontend compatibility
    paths: {
      thumbnail: image.pathThumbnail,
      preview: image.pathPreview,
      image: image.pathImage,
    },
    // Clean up internal field names
    userRating: undefined,
    userFavorite: undefined,
    userViewCount: undefined,
    userOCount: undefined,
    userLastViewedAt: undefined,
    stashRating100: undefined,
    stashOCounter: undefined,
  };
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment */

/**
 * Find images endpoint - uses SQL-native ImageQueryBuilder
 */
export const findImages = async (
  req: TypedAuthRequest<FindImagesRequest>,
  res: TypedResponse<
    FindImagesResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  const startTime = Date.now();
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("image", req.body, { userId: req.user.id });
  logDropped("POST /library/images", request.dropped);

  try {
    const userId = req.user.id;
    const { page, perPage, specificInstanceId } = request;
    // A gallery or detail view asks for one image by id
    const lookup = singleIdRef(request.filter.ids);

    // Exclusions apply to every user; an admin's rows hold only their own hides
    const applyExclusions = true;

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    // Execute query. The image builder reads the search text from its filter
    const result = await imageQueryBuilder.execute({
      userId,
      filters: { ...toLegacyFilter("image", request.filter), q: request.q },
      applyExclusions,
      allowedInstanceIds,
      specificInstanceId,
      sort: request.sort.field,
      sortDirection: request.sort.direction,
      page,
      perPage,
      randomSeed: request.sort.seed,
    });

    // Check for ambiguous results on single-ID lookups
    // This happens when the same ID exists in multiple Stash instances
    if (lookup && !specificInstanceId && result.images.length > 1) {
      logger.warn("Ambiguous image lookup", {
        id: lookup.id,
        matchCount: result.images.length,
        instances: result.images.map((i) => i.instanceId),
      });
      res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple images found with ID ${lookup.id}. Specify instance_id parameter.`,
        matches: result.images.map((i) => ({
          id: i.id,
          title: i.title,
          instanceId: i.instanceId,
        })),
      });
      return;
    }

    // Transform and add stashUrl to each image
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- transformImageResult intentionally returns any (dynamic DB row transformer)
    const imagesWithStashUrl = result.images.map((image) => ({
      ...transformImageResult(image),
      stashUrl: buildStashEntityUrl(
        "image",
        image.id,
        image.instanceId,
        req.user
      ),
    }));

    const totalTime = Date.now() - startTime;
    logger.debug("findImages completed", {
      totalTime: `${totalTime}ms`,
      totalImages: result.total,
      returnedImages: imagesWithStashUrl.length,
      page,
      perPage,
    });

    res.json({
      findImages: {
        count: result.total,
        images: imagesWithStashUrl as WithStashUrl<NormalizedImage>[],
      },
    });
  } catch (error) {
    logger.error("Error in findImages", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find images",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
