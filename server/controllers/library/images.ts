import type { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.js";
import { stashCacheManager } from "../../services/StashCacheManager.js";
import getStash from "../../stash.js";
import { CriterionModifier } from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { transformImage } from "../../utils/pathMapping.js";

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
  try {
    const { filter, image_filter } = req.body;

    const sortField = filter?.sort || "title";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;

    // Step 1: Find galleries matching the entity filter
    const allGalleries = stashCacheManager.getAllGalleries();
    let matchingGalleries = allGalleries;

    if (image_filter?.performers) {
      const performerIds = new Set(image_filter.performers.value.map(String));
      matchingGalleries = matchingGalleries.filter((g) =>
        g.performers?.some((p) => performerIds.has(String(p.id)))
      );
    }

    if (image_filter?.tags) {
      const tagIds = new Set(image_filter.tags.value.map(String));
      matchingGalleries = matchingGalleries.filter((g) =>
        g.tags?.some((t) => tagIds.has(String(t.id)))
      );
    }

    if (image_filter?.studios) {
      const studioIds = new Set(image_filter.studios.value.map(String));
      matchingGalleries = matchingGalleries.filter(
        (g) => g.studio && studioIds.has(String(g.studio.id))
      );
    }

    logger.info("Finding images for entity", {
      galleryCount: matchingGalleries.length,
      performerFilter: image_filter?.performers?.value,
      tagFilter: image_filter?.tags?.value,
      studioFilter: image_filter?.studios?.value,
    });

    // Step 2: Get all images from matching galleries
    const stash = getStash();
    const allImagesMap = new Map(); // Use map for de-duplication

    for (const gallery of matchingGalleries) {
      try {
        // Query images for this gallery
        const result = await stash.findImages({
          filter: {
            per_page: -1, // Get all images in this gallery
          },
          image_filter: {
            galleries: {
              value: [gallery.id],
              modifier: CriterionModifier.Includes,
            },
          },
        });

        const images = result?.findImages?.images || [];

        // Enhance each image with gallery metadata and add to map
        images.forEach((image: any) => {
          if (!allImagesMap.has(image.id)) {
            // Inherit gallery metadata for missing fields
            const enhancedImage = {
              ...image,
              // Only inherit if image doesn't have the field
              performers: image.performers?.length
                ? image.performers
                : gallery.performers || [],
              tags: image.tags?.length ? image.tags : gallery.tags || [],
              studio: image.studio || gallery.studio || null,
            };
            allImagesMap.set(image.id, enhancedImage);
          }
        });
      } catch (error) {
        logger.warn("Failed to fetch images for gallery", {
          galleryId: gallery.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        // Continue with other galleries
      }
    }

    let images = Array.from(allImagesMap.values());

    logger.info("Total unique images found", { count: images.length });

    // Step 3: Apply additional filters (favorite, rating, etc.)
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

    // Step 4: Sort
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

    // Step 5: Paginate
    const total = images.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedImages = images.slice(startIndex, endIndex);

    // Step 6: Transform images to proxy URLs
    const transformedImages = paginatedImages.map(transformImage);

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
