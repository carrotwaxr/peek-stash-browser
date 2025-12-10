import type { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { CriterionModifier } from "../../types/index.js";
import { expandStudioIds, expandTagIds } from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import { transformImage } from "../../utils/stashUrlProxy.js";

/**
 * Calculate actual image count for an entity by querying galleries→images
 * This provides the real count that includes Gallery→Image relationships
 */
export async function calculateEntityImageCount(
  entityType: "performer" | "studio" | "tag",
  entityId: string
): Promise<number> {
  try {
    // Step 1: Find galleries matching the entity
    const allGalleries = await stashEntityService.getAllGalleries();
    let matchingGalleries = allGalleries;

    if (entityType === "performer") {
      const performerIds = new Set([String(entityId)]);
      matchingGalleries = matchingGalleries.filter((g) =>
        g.performers?.some((p) => performerIds.has(String(p.id)))
      );
    } else if (entityType === "tag") {
      const tagIds = new Set([String(entityId)]);
      matchingGalleries = matchingGalleries.filter((g) =>
        g.tags?.some((t) => tagIds.has(String(t.id)))
      );
    } else if (entityType === "studio") {
      const studioIds = new Set([String(entityId)]);
      matchingGalleries = matchingGalleries.filter(
        (g) => g.studio && studioIds.has(String(g.studio.id))
      );
    }

    // Step 2: Get all images from matching galleries in a single query
    const stash = stashInstanceManager.getDefault();
    const galleryIds = matchingGalleries.map((g) => g.id);

    if (galleryIds.length === 0) {
      return 0;
    }

    try {
      const result = await stash.findImages({
        filter: { per_page: -1 },
        image_filter: {
          galleries: {
            value: galleryIds,
            modifier: CriterionModifier.Includes,
          },
        },
      });

      const images = result?.findImages?.images || [];

      // De-duplicate by image ID
      const uniqueImageIds = new Set(images.map((img: any) => img.id));
      return uniqueImageIds.size;
    } catch (error) {
      logger.error(`Failed to fetch images for ${entityType} ${entityId}`, {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return 0;
    }
  } catch (error) {
    logger.error(`Error calculating image count for ${entityType} ${entityId}`, {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}

/**
 * Find images endpoint
 * Handles both:
 * 1. Direct Entity→Image relationships (rare - most users don't tag individual images)
 * 2. Entity→Gallery→Image relationships (common - users tag galleries, images inherit)
 *
 * Strategy:
 * - Get galleries matching the entity filter
 * - Extract all images from those galleries
 * - Enhance images with gallery metadata when image-level data is missing
 * - De-duplicate images
 */
export const findImages = async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const { filter, image_filter } = req.body;

    const sortField = filter?.sort || "title";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;

    // Step 1: Find galleries matching the entity filter
    const step1Start = Date.now();
    const allGalleries = await stashEntityService.getAllGalleries();
    let matchingGalleries = allGalleries;

    if (image_filter?.performers) {
      const performerIds = new Set(image_filter.performers.value.map(String));
      matchingGalleries = matchingGalleries.filter((g) =>
        g.performers?.some((p) => performerIds.has(String(p.id)))
      );
    }

    if (image_filter?.tags) {
      // Expand tag IDs to include descendants if depth is specified
      const expandedTagIds = new Set(
        await expandTagIds(
          image_filter.tags.value.map(String),
          image_filter.tags.depth ?? 0
        )
      );
      matchingGalleries = matchingGalleries.filter((g) =>
        g.tags?.some((t) => expandedTagIds.has(String(t.id)))
      );
    }

    if (image_filter?.studios) {
      // Expand studio IDs to include descendants if depth is specified
      const expandedStudioIds = new Set(
        await expandStudioIds(
          image_filter.studios.value.map(String),
          image_filter.studios.depth ?? 0
        )
      );
      matchingGalleries = matchingGalleries.filter(
        (g) => g.studio && expandedStudioIds.has(String(g.studio.id))
      );
    }

    const step1Time = Date.now() - step1Start;
    logger.info("Finding images for entity", {
      galleryCount: matchingGalleries.length,
      performerFilter: image_filter?.performers?.value,
      tagFilter: image_filter?.tags?.value,
      studioFilter: image_filter?.studios?.value,
      step1FilterTime: `${step1Time}ms`,
    });

    // Step 2: Get all images from matching galleries (single query with all gallery IDs)
    const step2Start = Date.now();
    const stash = stashInstanceManager.getDefault();
    const allImagesMap = new Map(); // Use map for de-duplication

    try {
      // Query all images at once using all gallery IDs
      const galleryIds = matchingGalleries.map((g) => g.id);

      const result = await stash.findImages({
        filter: {
          per_page: -1, // Get all images from all matching galleries
        },
        image_filter: {
          galleries: {
            value: galleryIds,
            modifier: CriterionModifier.Includes,
          },
        },
      });

      const images = result?.findImages?.images || [];

      // Build gallery map for quick lookup
      const galleryMap = new Map(matchingGalleries.map((g) => [g.id, g]));

      // Enhance each image with gallery metadata
      images.forEach((image: any) => {
        if (!allImagesMap.has(image.id)) {
          // Find the gallery this image belongs to (use first match)
          const imageGallery = image.galleries?.[0];
          const gallery = imageGallery ? galleryMap.get(imageGallery.id) : null;

          // Inherit gallery metadata for missing fields
          const enhancedImage = {
            ...image,
            // Only inherit if image doesn't have the field
            performers: image.performers?.length
              ? image.performers
              : gallery?.performers || [],
            tags: image.tags?.length ? image.tags : gallery?.tags || [],
            studio: image.studio || gallery?.studio || null,
          };
          allImagesMap.set(image.id, enhancedImage);
        }
      });
    } catch (error) {
      logger.error("Failed to fetch images from galleries", {
        galleryCount: matchingGalleries.length,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    let images = Array.from(allImagesMap.values());

    const step2Time = Date.now() - step2Start;
    logger.info("Total unique images found (single query optimization)", {
      count: images.length,
      galleriesInFilter: matchingGalleries.length,
      step2QueryTime: `${step2Time}ms`,
    });

    // Step 3: Apply additional filters (favorite, rating, etc.)
    const step3Start = Date.now();
    if (image_filter?.favorite !== undefined) {
      images = images.filter((img: any) => img.favorite === image_filter.favorite);
    }

    if (image_filter?.rating100) {
      const { modifier, value, value2 } = image_filter.rating100;
      images = images.filter((img: any) => {
        const rating = img.rating100 || 0;
        if (modifier === "GREATER_THAN") return rating > value;
        if (modifier === "LESS_THAN") return rating < value;
        if (modifier === "EQUALS") return rating === value;
        if (modifier === "NOT_EQUALS") return rating !== value;
        if (modifier === "BETWEEN")
          return (
            value !== undefined &&
            value2 !== null &&
            value2 !== undefined &&
            rating >= value &&
            rating <= value2
          );
        return true;
      });
    }

    const step3Time = Date.now() - step3Start;

    // Step 4: Sort
    const step4Start = Date.now();
    images.sort((a: any, b: any) => {
      let aVal: number | string | null;
      let bVal: number | string | null;

      switch (sortField) {
        case "title":
          aVal = (a.title || "").toLowerCase();
          bVal = (b.title || "").toLowerCase();
          break;
        case "rating100":
          aVal = a.rating100 || 0;
          bVal = b.rating100 || 0;
          break;
        case "o_counter":
          aVal = a.o_counter || 0;
          bVal = b.o_counter || 0;
          break;
        case "created_at":
          aVal = a.created_at || "";
          bVal = b.created_at || "";
          break;
        case "updated_at":
          aVal = a.updated_at || "";
          bVal = b.updated_at || "";
          break;
        default:
          aVal = (a.title || "").toLowerCase();
          bVal = (b.title || "").toLowerCase();
      }

      let comparison = 0;
      if ((aVal as string | number) < (bVal as string | number)) comparison = -1;
      if ((aVal as string | number) > (bVal as string | number)) comparison = 1;

      return sortDirection === "DESC" ? -comparison : comparison;
    });

    const step4Time = Date.now() - step4Start;

    // Step 5: Paginate
    const step5Start = Date.now();
    const total = images.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedImages = images.slice(startIndex, endIndex);
    const step5Time = Date.now() - step5Start;

    // Step 6: Transform images to proxy URLs
    const step6Start = Date.now();
    const transformedImages = paginatedImages.map(transformImage);
    const step6Time = Date.now() - step6Start;

    const totalTime = Date.now() - startTime;

    logger.info("findImages performance breakdown", {
      totalTime: `${totalTime}ms`,
      step1_filterGalleries: `${step1Time}ms`,
      step2_queryImages: `${step2Time}ms`,
      step3_applyFilters: `${step3Time}ms`,
      step4_sort: `${step4Time}ms`,
      step5_paginate: `${step5Time}ms`,
      step6_transform: `${step6Time}ms`,
      totalImages: total,
      returnedImages: transformedImages.length,
      page,
      perPage,
    });

    res.json({
      findImages: {
        count: total,
        images: transformedImages,
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
