import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindImagesRequest,
  FindImagesResponse,
  TypedLibraryRequest,
  TypedResponse,
} from "../../types/api/index.js";
import { parseListRequest, singleIdRef } from "../../utils/listRequest.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Find images endpoint - uses SQL-native ImageQueryBuilder
 */
export const findImages = async (
  req: TypedLibraryRequest<FindImagesRequest>,
  res: TypedResponse<
    FindImagesResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  const startTime = Date.now();
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("image", req.body, { userId: req.user.id });

  const userId = req.user.id;
  const { page, perPage, specificInstanceId } = request;
  // A gallery or detail view asks for one image by id
  const lookup = singleIdRef(request.filter.ids);

  // Exclusions apply to every user; an admin's rows hold only their own hides
  const applyExclusions = true;

  const { allowedInstanceIds } = req;

  // The request's instance_id (specificInstanceId) narrows the list to
  // one instance
  const result = await imageQueryBuilder.execute({
    userId,
    allowedInstanceIds,
    request,
    applyExclusions,
  });

  // Check for ambiguous results on single-ID lookups
  // This happens when the same ID exists in multiple Stash instances
  if (lookup && !specificInstanceId && result.items.length > 1) {
    logger.warn("Ambiguous image lookup", {
      id: lookup.id,
      matchCount: result.items.length,
      instances: result.items.map((i) => i.instanceId),
    });
    res.status(400).json({
      error: "Ambiguous lookup",
      message: `Multiple images found with ID ${lookup.id}. Specify instance_id parameter.`,
      matches: result.items.map((i) => ({
        id: i.id,
        title: i.title,
        instanceId: i.instanceId,
      })),
    });
    return;
  }

  // Add stashUrl to each image
  const imagesWithStashUrl = result.items.map((image) => ({
    ...image,
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
      images: imagesWithStashUrl,
    },
  });
};
