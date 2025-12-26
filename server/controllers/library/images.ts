import type { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { userRestrictionService } from "../../services/UserRestrictionService.js";
import { expandStudioIds, expandTagIds } from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Merge images with user rating/favorite data
 */
async function mergeImagesWithUserData(
  images: any[],
  userId: number
): Promise<any[]> {
  const ratings = await prisma.imageRating.findMany({ where: { userId } });

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

  return images.map((image) => ({
    ...image,
    rating: null,
    rating100: image.rating100 ?? null,
    favorite: false,
    ...ratingMap.get(image.id),
  }));
}

/**
 * Apply image filters with gallery-umbrella inheritance
 * Uses union approach: image matches if ANY of its galleries match the filter
 */
async function applyImageFiltersWithInheritance(
  images: any[],
  filters: any,
  ids?: string[]
): Promise<any[]> {
  if (!filters && !ids) return images;

  let filtered = images;

  // Filter by IDs
  if (ids && Array.isArray(ids) && ids.length > 0) {
    const idSet = new Set(ids);
    filtered = filtered.filter((img) => idSet.has(img.id));
  }

  // Filter by favorite
  if (filters?.favorite !== undefined) {
    filtered = filtered.filter((img) => img.favorite === filters.favorite);
  }

  // Filter by rating100
  if (filters?.rating100) {
    const { modifier, value, value2 } = filters.rating100;
    filtered = filtered.filter((img) => {
      const rating = img.rating100 || 0;
      if (modifier === "GREATER_THAN") return rating > value;
      if (modifier === "LESS_THAN") return rating < value;
      if (modifier === "EQUALS") return rating === value;
      if (modifier === "NOT_EQUALS") return rating !== value;
      if (modifier === "BETWEEN") return rating >= value && rating <= value2;
      return true;
    });
  }

  // Filter by performers (with gallery-umbrella inheritance)
  if (filters?.performers?.value) {
    const performerIds = new Set(filters.performers.value.map(String));
    filtered = filtered.filter((img) => {
      // Check direct performers on image
      if (img.performers?.some((p: any) => performerIds.has(String(p.id)))) {
        return true;
      }
      // Check gallery performers (inheritance via union)
      if (
        img.galleries?.some((g: any) =>
          g.performers?.some((p: any) => performerIds.has(String(p.id)))
        )
      ) {
        return true;
      }
      return false;
    });
  }

  // Filter by tags (with gallery-umbrella inheritance and hierarchy expansion)
  if (filters?.tags?.value) {
    const expandedTagIds = new Set(
      await expandTagIds(
        filters.tags.value.map(String),
        filters.tags.depth ?? 0
      )
    );
    filtered = filtered.filter((img) => {
      // Check direct tags on image
      if (img.tags?.some((t: any) => expandedTagIds.has(String(t.id)))) {
        return true;
      }
      // Check gallery tags (inheritance via union)
      if (
        img.galleries?.some((g: any) =>
          g.tags?.some((t: any) => expandedTagIds.has(String(t.id)))
        )
      ) {
        return true;
      }
      return false;
    });
  }

  // Filter by studios (with gallery-umbrella inheritance and hierarchy expansion)
  if (filters?.studios?.value) {
    const expandedStudioIds = new Set(
      await expandStudioIds(
        filters.studios.value.map(String),
        filters.studios.depth ?? 0
      )
    );
    filtered = filtered.filter((img) => {
      // Check direct studio on image
      if (img.studioId && expandedStudioIds.has(String(img.studioId))) {
        return true;
      }
      // Check gallery studio (inheritance via union)
      if (
        img.galleries?.some(
          (g: any) => g.studioId && expandedStudioIds.has(String(g.studioId))
        )
      ) {
        return true;
      }
      return false;
    });
  }

  // Filter by specific galleries
  if (filters?.galleries?.value) {
    const galleryIds = new Set(filters.galleries.value.map(String));
    filtered = filtered.filter((img) =>
      img.galleries?.some((g: any) => galleryIds.has(String(g.id)))
    );
  }

  return filtered;
}

/**
 * Sort images by field and direction
 */
function sortImages(
  images: any[],
  sortField: string,
  sortDirection: string
): any[] {
  const direction = sortDirection === "DESC" ? -1 : 1;

  return images.sort((a, b) => {
    let aVal, bVal;

    switch (sortField) {
      case "title":
        aVal = (a.title || a.filePath || "").toLowerCase();
        bVal = (b.title || b.filePath || "").toLowerCase();
        break;
      case "date":
        aVal = a.date || "";
        bVal = b.date || "";
        break;
      case "rating":
      case "rating100":
        aVal = a.rating100 || 0;
        bVal = b.rating100 || 0;
        break;
      case "o_counter":
        aVal = a.o_counter || 0;
        bVal = b.o_counter || 0;
        break;
      case "filesize":
        aVal = Number(a.fileSize) || 0;
        bVal = Number(b.fileSize) || 0;
        break;
      case "path":
        aVal = (a.filePath || "").toLowerCase();
        bVal = (b.filePath || "").toLowerCase();
        break;
      case "created_at":
        aVal = a.stashCreatedAt || a.created_at || "";
        bVal = b.stashCreatedAt || b.created_at || "";
        break;
      case "updated_at":
        aVal = a.stashUpdatedAt || a.updated_at || "";
        bVal = b.stashUpdatedAt || b.updated_at || "";
        break;
      case "random":
        return Math.random() - 0.5;
      default:
        aVal = (a.title || "").toLowerCase();
        bVal = (b.title || "").toLowerCase();
    }

    if (aVal < bVal) return -1 * direction;
    if (aVal > bVal) return 1 * direction;
    return 0;
  });
}

/**
 * Calculate actual image count for an entity using local database
 * Considers gallery-umbrella inheritance
 */
export async function calculateEntityImageCount(
  entityType: "performer" | "studio" | "tag",
  entityId: string
): Promise<number> {
  try {
    // Get all images from local database
    const allImages = await stashEntityService.getAllImages();

    // Filter based on entity type with gallery inheritance
    const matchingImages = allImages.filter((img) => {
      if (entityType === "performer") {
        // Check direct performers
        if (img.performers?.some((p: any) => String(p.id) === String(entityId))) {
          return true;
        }
        // Check gallery performers
        if (
          img.galleries?.some((g: any) =>
            g.performers?.some((p: any) => String(p.id) === String(entityId))
          )
        ) {
          return true;
        }
        return false;
      }

      if (entityType === "tag") {
        // Check direct tags
        if (img.tags?.some((t: any) => String(t.id) === String(entityId))) {
          return true;
        }
        // Check gallery tags
        if (
          img.galleries?.some((g: any) =>
            g.tags?.some((t: any) => String(t.id) === String(entityId))
          )
        ) {
          return true;
        }
        return false;
      }

      if (entityType === "studio") {
        // Check direct studio
        if (String(img.studioId) === String(entityId)) {
          return true;
        }
        // Check gallery studio
        if (
          img.galleries?.some(
            (g: any) => String(g.studioId) === String(entityId)
          )
        ) {
          return true;
        }
        return false;
      }

      return false;
    });

    return matchingImages.length;
  } catch (error) {
    logger.error(`Error calculating image count for ${entityType} ${entityId}`, {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}

/**
 * Find images endpoint - queries local database with gallery-umbrella inheritance
 */
export const findImages = async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const userId = req.user?.id;
    const { filter, image_filter, ids } = req.body;

    const sortField = filter?.sort || "title";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Step 1: Get all images from cache/database
    let images = await stashEntityService.getAllImages();

    if (images.length === 0) {
      logger.warn("Image cache not initialized, returning empty result");
      return res.json({
        findImages: {
          count: 0,
          images: [],
        },
      });
    }

    // Step 2: Merge with user data (ratings/favorites)
    images = await mergeImagesWithUserData(images, userId);

    // Step 3: Apply content restrictions
    const requestingUser = req.user;
    images = await userRestrictionService.filterImagesForUser(
      images,
      userId,
      requestingUser?.role === "ADMIN"
    );

    // Step 4: Apply search query
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      images = images.filter((img) => {
        const title = img.title || "";
        const details = img.details || "";
        const photographer = img.photographer || "";
        const filePath = img.filePath || "";
        return (
          title.toLowerCase().includes(lowerQuery) ||
          details.toLowerCase().includes(lowerQuery) ||
          photographer.toLowerCase().includes(lowerQuery) ||
          filePath.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Step 5: Apply filters with gallery-umbrella inheritance
    images = await applyImageFiltersWithInheritance(images, image_filter, ids);

    // Step 6: Sort
    images = sortImages(images, sortField, sortDirection);

    // Step 7: Paginate
    const total = images.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedImages = images.slice(startIndex, endIndex);

    // Step 8: Add stashUrl to each image
    const imagesWithStashUrl = paginatedImages.map((image) => ({
      ...image,
      stashUrl: buildStashEntityUrl("image", image.id),
    }));

    const totalTime = Date.now() - startTime;
    logger.debug("findImages completed", {
      totalTime: `${totalTime}ms`,
      totalImages: total,
      returnedImages: imagesWithStashUrl.length,
      page,
      perPage,
    });

    res.json({
      findImages: {
        count: total,
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
  req: AuthenticatedRequest,
  res: Response
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
