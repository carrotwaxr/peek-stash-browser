import type { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { emptyEntityFilterService } from "../../services/EmptyEntityFilterService.js";
import { filteredEntityCacheService } from "../../services/FilteredEntityCacheService.js";
import { stashCacheManager } from "../../services/StashCacheManager.js";
import { userRestrictionService } from "../../services/UserRestrictionService.js";
import getStash from "../../stash.js";
import {
  CriterionModifier,
  NormalizedGallery,
  NormalizedPerformer,
  NormalizedTag,
  PeekGalleryFilter,
} from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { convertToProxyUrl } from "../../utils/pathMapping.js";
import { mergePerformersWithUserData } from "./performers.js";
import { mergeStudiosWithUserData } from "./studios.js";
import { mergeTagsWithUserData } from "./tags.js";

/**
 * Merge galleries with user rating/favorite data
 */
async function mergeGalleriesWithUserData(
  galleries: NormalizedGallery[],
  userId: number
): Promise<NormalizedGallery[]> {
  const ratings = await prisma.galleryRating.findMany({ where: { userId } });

  const ratingMap = new Map(
    ratings.map((r) => [
      r.galleryId,
      {
        rating: r.rating,
        rating100: r.rating,
        favorite: r.favorite,
      },
    ])
  );

  return galleries.map((gallery) => ({
    ...gallery,
    ...ratingMap.get(gallery.id),
  }));
}

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
    ...ratingMap.get(image.id),
  }));
}

/**
 * Apply gallery filters
 */
export function applyGalleryFilters(
  galleries: NormalizedGallery[],
  filters: PeekGalleryFilter | null | undefined
): NormalizedGallery[] {
  if (!filters) return galleries;

  let filtered = galleries;

  // Filter by IDs
  if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
    const idSet = new Set(filters.ids);
    filtered = filtered.filter((g) => idSet.has(g.id));
  }

  // Filter by favorite
  if (filters.favorite !== undefined) {
    filtered = filtered.filter((g) => g.favorite === filters.favorite);
  }

  // Filter by rating100
  if (filters.rating100) {
    const { modifier, value, value2 } = filters.rating100;
    filtered = filtered.filter((g) => {
      const rating = g.rating100 || 0;
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

  // Filter by image_count
  if (filters.image_count) {
    const { modifier, value, value2 } = filters.image_count;
    filtered = filtered.filter((g) => {
      const count = g.image_count || 0;
      if (modifier === "GREATER_THAN") return count > value;
      if (modifier === "LESS_THAN") return count < value;
      if (modifier === "EQUALS") return count === value;
      if (modifier === "NOT_EQUALS") return count !== value;
      if (modifier === "BETWEEN")
        return (
          value2 !== null &&
          value2 !== undefined &&
          count >= value &&
          count <= value2
        );
      return true;
    });
  }

  // Filter by title (text search)
  if (filters.title) {
    const searchValue = filters.title.value.toLowerCase();
    filtered = filtered.filter((g) => {
      const title = g.title || "";
      return title.toLowerCase().includes(searchValue);
    });
  }

  // Filter by studio
  if (filters.studios) {
    const studioIds = new Set(filters.studios.value);
    filtered = filtered.filter((g) => g.studio && studioIds.has(g.studio.id));
  }

  // Filter by performers
  if (filters.performers) {
    const performerIds = new Set(filters.performers.value);
    filtered = filtered.filter((g) =>
      g.performers?.some((p) => performerIds.has(p.id))
    );
  }

  // Filter by tags
  if (filters.tags) {
    const tagIds = new Set(filters.tags.value);
    filtered = filtered.filter((g) => g.tags?.some((t) => tagIds.has(t.id)));
  }

  return filtered;
}

/**
 * Sort galleries
 */
function sortGalleries(
  galleries: NormalizedGallery[],
  sortField: string,
  sortDirection: string
): NormalizedGallery[] {
  const direction = sortDirection === "DESC" ? -1 : 1;

  return galleries.sort((a, b) => {
    let aVal, bVal;

    switch (sortField) {
      case "title":
        aVal = (a.title || "").toLowerCase();
        bVal = (b.title || "").toLowerCase();
        break;
      case "date":
        aVal = a.date || "";
        bVal = b.date || "";
        break;
      case "rating100":
        aVal = a.rating100 || 0;
        bVal = b.rating100 || 0;
        break;
      case "image_count":
        aVal = a.image_count || 0;
        bVal = b.image_count || 0;
        break;
      case "created_at":
        aVal = a.created_at || "";
        bVal = b.created_at || "";
        break;
      case "updated_at":
        aVal = a.updated_at || "";
        bVal = b.updated_at || "";
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
 * Find galleries endpoint
 */
export const findGalleries = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { filter, gallery_filter, ids } = req.body;

    const sortField = filter?.sort || "title";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Step 1: Get all galleries from cache
    let galleries = stashCacheManager.getAllGalleries();

    if (galleries.length === 0) {
      logger.warn("Gallery cache not initialized, returning empty result");
      return res.json({
        findGalleries: {
          count: 0,
          galleries: [],
        },
      });
    }

    // Step 2: Merge with user data
    galleries = await mergeGalleriesWithUserData(galleries, userId);

    // Step 2.5: Apply content restrictions & empty entity filtering with caching
    const requestingUser = req.user;
    const cacheVersion = stashCacheManager.getCacheVersion();

    // Try to get filtered galleries from cache
    let filteredGalleries = filteredEntityCacheService.get(
      userId,
      "galleries",
      cacheVersion
    ) as NormalizedGallery[] | null;

    if (filteredGalleries === null) {
      // Cache miss - compute filtered galleries
      logger.debug("Galleries cache miss", { userId, cacheVersion });
      filteredGalleries = galleries;

      // Apply content restrictions (non-admins only)
      if (requestingUser && requestingUser.role !== "ADMIN") {
        filteredGalleries = await userRestrictionService.filterGalleriesForUser(
          filteredGalleries,
          userId
        );
      }

      // Filter empty galleries (non-admins only)
      if (requestingUser && requestingUser.role !== "ADMIN") {
        filteredGalleries =
          emptyEntityFilterService.filterEmptyGalleries(filteredGalleries);
      }

      // Store in cache
      filteredEntityCacheService.set(
        userId,
        "galleries",
        filteredGalleries,
        cacheVersion
      );
    } else {
      logger.debug("Galleries cache hit", {
        userId,
        entityCount: filteredGalleries.length,
      });
    }

    // Use cached/filtered galleries for remaining operations
    galleries = filteredGalleries;

    // Step 3: Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      galleries = galleries.filter((g) => {
        const title = g.title || "";
        const details = g.details || "";
        const photographer = g.photographer || "";
        return (
          title.toLowerCase().includes(lowerQuery) ||
          details.toLowerCase().includes(lowerQuery) ||
          photographer.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Step 4: Apply filters (merge root-level ids with gallery_filter)
    const mergedFilter = { ...gallery_filter, ids: ids || gallery_filter?.ids };
    galleries = applyGalleryFilters(galleries, mergedFilter);

    // Step 5: Sort
    galleries = sortGalleries(galleries, sortField, sortDirection);

    // Step 6: Paginate
    const total = galleries.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedGalleries = galleries.slice(startIndex, endIndex);

    res.json({
      findGalleries: {
        count: total,
        galleries: paginatedGalleries,
      },
    });
  } catch (error) {
    logger.error("Error in findGalleries", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find galleries",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Find single gallery by ID
 */
export const findGalleryById = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    let gallery = stashCacheManager.getGallery(id);

    if (!gallery) {
      return res.status(404).json({ error: "Gallery not found" });
    }

    // Merge with user data
    const galleries = await mergeGalleriesWithUserData([gallery], userId);
    const mergedGallery = galleries[0];

    if (!mergedGallery) {
      return res.status(404).json({ error: "Gallery not found after merge" });
    }

    // Hydrate performers with full cached data
    if (mergedGallery.performers && mergedGallery.performers.length > 0) {
      mergedGallery.performers = mergedGallery.performers.map((performer) => {
        const cachedPerformer = stashCacheManager.getPerformer(performer.id);
        if (cachedPerformer) {
          // Return full performer data from cache
          return cachedPerformer;
        }
        // Fallback to basic performer data if not in cache
        return performer;
      });

      // Merge performers with user data (ratings/favorites)
      // Type assertion safe: performers from API are compatible with Normalized type structure
      mergedGallery.performers = await mergePerformersWithUserData(
        mergedGallery.performers as NormalizedPerformer[],
        userId
      );
    }

    // Hydrate studio with full cached data
    if (mergedGallery.studio && mergedGallery.studio.id) {
      const cachedStudio = stashCacheManager.getStudio(mergedGallery.studio.id);
      if (cachedStudio) {
        // Type assertion: Gallery.studio typed as Studio, but we hydrate with NormalizedStudio
        mergedGallery.studio =
          cachedStudio as unknown as typeof mergedGallery.studio;
        // Merge studio with user data
        const studios = await mergeStudiosWithUserData([cachedStudio], userId);
        if (studios[0]) {
          mergedGallery.studio = studios[0];
        }
      }
    }

    // Hydrate tags with full cached data
    if (mergedGallery.tags && mergedGallery.tags.length > 0) {
      mergedGallery.tags = mergedGallery.tags.map((tag) => {
        const cachedTag = stashCacheManager.getTag(tag.id);
        if (cachedTag) {
          return cachedTag;
        }
        return tag;
      });

      // Merge tags with user data
      // Type assertion safe: tags from API are compatible with Normalized type structure
      mergedGallery.tags = await mergeTagsWithUserData(
        mergedGallery.tags as NormalizedTag[],
        userId
      );
    }

    res.json(mergedGallery);
  } catch (error) {
    logger.error("Error in findGalleryById", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find gallery",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Minimal galleries - just id and title for dropdowns
 */
export const findGalleriesMinimal = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { filter } = req.body;
    const searchQuery = filter?.q || "";

    // Step 1: Get all galleries from cache
    let galleries = stashCacheManager.getAllGalleries();

    if (galleries.length === 0) {
      logger.warn("Gallery cache not initialized, returning empty result");
      return res.json({
        galleries: [],
      });
    }

    // Step 2: Merge with user data (for favorites)
    galleries = await mergeGalleriesWithUserData(galleries, userId);

    // Step 3: Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      galleries = galleries.filter((g) => {
        const title = g.title || "";
        return title.toLowerCase().includes(lowerQuery);
      });
    }

    // Step 3.5: Filter empty galleries (non-admins only)
    const requestingUser = req.user;
    if (requestingUser && requestingUser.role !== "ADMIN") {
      galleries = emptyEntityFilterService.filterEmptyGalleries(galleries);
    }

    // Step 4: Sort by title
    galleries = galleries.sort((a, b) => {
      const aTitle = (a.title || "").toLowerCase();
      const bTitle = (b.title || "").toLowerCase();
      return aTitle.localeCompare(bTitle);
    });

    // Step 5: Map to minimal shape
    const minimalGalleries = galleries.map((g) => ({
      id: g.id,
      name: g.title, // Use 'title' field but map to 'name' for consistency with other entities
      favorite: g.favorite,
    }));

    res.json({
      galleries: minimalGalleries,
    });
  } catch (error) {
    logger.error("Error in findGalleriesMinimal", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find galleries",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * GET /api/library/galleries/:galleryId/images
 * Get images for a specific gallery
 */
export const getGalleryImages = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { galleryId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Query images filtered by gallery
    const stash = getStash();
    const result = await stash.findImages({
      filter: {
        per_page: -1, // Get all images
        sort: "path", // Sort by path for consistent ordering
        // Type assertion: SortDirectionEnum not exported from stashapp-api, but "ASC" is valid enum value
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        direction: "ASC" as any,
      },
      image_filter: {
        galleries: {
          value: [galleryId],
          modifier: CriterionModifier.Includes,
        },
      },
    });

    const images = result?.findImages?.images || [];

    // Transform image URLs to use proxy
    const transformedImages = images.map((image) => ({
      ...image,
      paths: {
        thumbnail: image.paths?.thumbnail
          ? convertToProxyUrl(image.paths.thumbnail)
          : null,
        preview: image.paths?.preview
          ? convertToProxyUrl(image.paths.preview)
          : null,
        image: image.paths?.image ? convertToProxyUrl(image.paths.image) : null,
      },
    }));

    // Merge images with user data (ratings/favorites)
    const mergedImages = await mergeImagesWithUserData(
      transformedImages,
      userId
    );

    res.json({
      images: mergedImages,
      count: result?.findImages?.count || 0,
    });
  } catch (error) {
    logger.error("Error fetching gallery images", {
      galleryId: req.params.galleryId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to fetch gallery images",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
