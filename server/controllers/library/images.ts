import type {
  TypedAuthRequest,
  TypedResponse,
  FindImagesRequest,
  FindImagesResponse,
  GetImageParams,
  GetImageResponse,
  ApiErrorResponse,
} from "../../types/api/index.js";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import {
  imageQueryBuilder,
  type ImageFilter,
} from "../../services/ImageQueryBuilder.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Merge images with user rating/favorite data and O counter
 * Used by findImageById for single image lookups
 */
async function mergeImagesWithUserData(
  images: any[],
  userId: number
): Promise<any[]> {
  // Fetch ratings and view history in parallel
  const [ratings, viewHistories] = await Promise.all([
    prisma.imageRating.findMany({ where: { userId } }),
    prisma.imageViewHistory.findMany({ where: { userId } }),
  ]);

  const ratingMap = new Map(
    ratings.map((r) => [
      r.imageId,
      {
        rating: r.rating,
        rating100: r.rating,
        favorite: r.favorite,
      },
    ])
  );

  const viewHistoryMap = new Map(
    viewHistories.map((vh) => [
      vh.imageId,
      {
        oCounter: vh.oCount,
        viewCount: vh.viewCount,
      },
    ])
  );

  return images.map((image) => ({
    ...image,
    rating: null,
    rating100: image.rating100 ?? null,
    favorite: false,
    oCounter: 0,
    viewCount: 0,
    ...ratingMap.get(image.id),
    ...viewHistoryMap.get(image.id),
  }));
}

/**
 * Transform ImageQueryBuilder result to match expected API response format
 */
function transformImageResult(image: any): any {
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

/**
 * Find images endpoint - uses SQL-native ImageQueryBuilder
 */
export const findImages = async (
  req: TypedAuthRequest<FindImagesRequest>,
  res: TypedResponse<FindImagesResponse | ApiErrorResponse>
) => {
  const startTime = Date.now();
  try {
    const userId = req.user?.id;
    const requestingUser = req.user;
    const { filter, image_filter, ids } = req.body;

    const sortFieldRaw = filter?.sort || "title";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Parse random_<seed> format
    let randomSeed: number | undefined;
    let sortField = sortFieldRaw;

    if (sortFieldRaw.startsWith("random_")) {
      const seedStr = sortFieldRaw.slice(7);
      const parsedSeed = parseInt(seedStr, 10);
      if (!isNaN(parsedSeed)) {
        randomSeed = parsedSeed % 1e8;
        sortField = "random";
      }
    } else if (sortFieldRaw === "random") {
      randomSeed = (userId + Date.now()) % 1e8;
    }

    // Build filter object from request
    const filters: ImageFilter = {};

    if (searchQuery) {
      filters.q = searchQuery;
    }

    if (ids && Array.isArray(ids) && ids.length > 0) {
      filters.ids = { value: ids, modifier: "INCLUDES" };
    }

    if (image_filter?.favorite !== undefined) {
      filters.favorite = image_filter.favorite;
    }

    if (image_filter?.rating100) {
      filters.rating100 = image_filter.rating100;
    }

    if (image_filter?.o_counter) {
      filters.o_counter = image_filter.o_counter;
    }

    if (image_filter?.performers?.value) {
      filters.performers = {
        value: image_filter.performers.value.map(String),
        modifier: image_filter.performers.modifier || "INCLUDES",
      };
    }

    if (image_filter?.tags?.value) {
      filters.tags = {
        value: image_filter.tags.value.map(String),
        modifier: image_filter.tags.modifier || "INCLUDES",
      };
    }

    if (image_filter?.studios?.value) {
      filters.studios = {
        value: image_filter.studios.value.map(String),
        modifier: image_filter.studios.modifier || "INCLUDES",
      };
    }

    if (image_filter?.galleries?.value) {
      filters.galleries = {
        value: image_filter.galleries.value.map(String),
        modifier: image_filter.galleries.modifier || "INCLUDES",
      };
    }

    // Admins skip exclusions
    const applyExclusions = requestingUser?.role !== "ADMIN";

    // Execute query
    const result = await imageQueryBuilder.execute({
      userId,
      filters,
      applyExclusions,
      sort: sortField,
      sortDirection: sortDirection.toUpperCase() as "ASC" | "DESC",
      page,
      perPage,
      randomSeed,
    });

    // Transform and add stashUrl to each image
    const imagesWithStashUrl = result.images.map((image) => ({
      ...transformImageResult(image),
      stashUrl: buildStashEntityUrl("image", image.id),
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

/**
 * Find single image by ID
 */
export const findImageById = async (
  req: TypedAuthRequest<unknown, GetImageParams>,
  res: TypedResponse<GetImageResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const image = await stashEntityService.getImage(id);

    if (!image) {
      return res.status(404).json({ error: "Image not found" });
    }

    // Merge with user data
    const images = await mergeImagesWithUserData([image], userId);
    const mergedImage = images[0];

    // Add stashUrl
    const imageWithStashUrl = {
      ...mergedImage,
      stashUrl: buildStashEntityUrl("image", mergedImage.id),
    };

    res.json(imageWithStashUrl);
  } catch (error) {
    logger.error("Error in findImageById", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find image",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
