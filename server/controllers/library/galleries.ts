import type { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { emptyEntityFilterService } from "../../services/EmptyEntityFilterService.js";
import { filteredEntityCacheService } from "../../services/FilteredEntityCacheService.js";
import { userRestrictionService } from "../../services/UserRestrictionService.js";
import {
  NormalizedGallery,
  NormalizedPerformer,
  NormalizedTag,
  PeekGalleryFilter,
} from "../../types/index.js";
import { expandStudioIds, expandTagIds } from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";
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
    rating: null,
    rating100: null,
    favorite: false,
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
export async function applyGalleryFilters(
  galleries: NormalizedGallery[],
  filters: PeekGalleryFilter | null | undefined
): Promise<NormalizedGallery[]> {
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
  // Supports hierarchical filtering via depth parameter
  if (filters.studios && filters.studios.value) {
    const { value: studioIds, depth } = filters.studios;
    // Expand studio IDs to include descendants if depth is specified
    const expandedStudioIds = new Set(
      await expandStudioIds(
        studioIds.map((id: string) => String(id)),
        depth ?? 0
      )
    );
    filtered = filtered.filter(
      (g) => g.studio && expandedStudioIds.has(String(g.studio.id))
    );
  }

  // Filter by performers
  if (filters.performers && filters.performers.value) {
    const performerIds = new Set(filters.performers.value.map(String));
    filtered = filtered.filter((g) =>
      g.performers?.some((p) => performerIds.has(String(p.id)))
    );
  }

  // Filter by tags
  // Supports hierarchical filtering via depth parameter
  if (filters.tags && filters.tags.value) {
    const { value: tagIds, depth } = filters.tags;
    // Expand tag IDs to include descendants if depth is specified
    const expandedTagIds = new Set(
      await expandTagIds(
        tagIds.map((id: string) => String(id)),
        depth ?? 0
      )
    );
    filtered = filtered.filter((g) =>
      g.tags?.some((t) => expandedTagIds.has(String(t.id)))
    );
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
      case "rating":
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
      case "path":
        aVal = (a.folder?.path || "").toLowerCase();
        bVal = (b.folder?.path || "").toLowerCase();
        break;
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
    let galleries = await stashEntityService.getAllGalleries();

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
    const cacheVersion = await stashEntityService.getCacheVersion();

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

      // Apply content restrictions and hidden entity filtering
      // Hidden entities are ALWAYS filtered (for all users including admins)
      // Content restrictions (INCLUDE/EXCLUDE) are only applied to non-admins
      filteredGalleries = await userRestrictionService.filterGalleriesForUser(
        filteredGalleries,
        userId,
        requestingUser?.role === "ADMIN" // Skip content restrictions for admins
      );

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
    galleries = await applyGalleryFilters(galleries, mergedFilter);

    // Step 5: Sort
    galleries = sortGalleries(galleries, sortField, sortDirection);

    // Step 6: Paginate
    const total = galleries.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    let paginatedGalleries = galleries.slice(startIndex, endIndex);

    // Step 6.5: For single-entity requests (detail pages), get gallery with computed counts
    if (ids && ids.length === 1 && paginatedGalleries.length === 1) {
      const galleryWithCounts = await stashEntityService.getGallery(ids[0]);
      if (galleryWithCounts) {
        const existingGallery = paginatedGalleries[0];
        paginatedGalleries = [
          {
            ...existingGallery,
            image_count: galleryWithCounts.image_count,
          },
        ];
        logger.info("Computed counts for gallery detail", {
          galleryId: existingGallery.id,
          galleryTitle: existingGallery.title,
          imageCount: galleryWithCounts.image_count,
        });
      }
    }

    // Step 7: Hydrate studios with full data (name, etc.)
    const studioIds = [
      ...new Set(
        paginatedGalleries
          .map((g) => g.studio?.id)
          .filter((id): id is string => !!id)
      ),
    ];

    if (studioIds.length > 0) {
      const studios = await stashEntityService.getStudiosByIds(studioIds);
      const studioMap = new Map(studios.map((s) => [s.id, s]));

      for (const gallery of paginatedGalleries) {
        if (gallery.studio?.id) {
          const fullStudio = studioMap.get(gallery.studio.id);
          if (fullStudio) {
            gallery.studio = fullStudio;
          }
        }
      }
    }

    // Add stashUrl to each gallery
    const galleriesWithStashUrl = paginatedGalleries.map((gallery) => ({
      ...gallery,
      stashUrl: buildStashEntityUrl("gallery", gallery.id),
    }));

    res.json({
      findGalleries: {
        count: total,
        galleries: galleriesWithStashUrl,
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

    let gallery = await stashEntityService.getGallery(id);

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
      const performerIds = mergedGallery.performers.map((p) => p.id);
      const cachedPerformers = await stashEntityService.getPerformersByIds(performerIds);
      const performerMap = new Map(cachedPerformers.map((p) => [p.id, p]));

      mergedGallery.performers = mergedGallery.performers.map((performer) => {
        const cachedPerformer = performerMap.get(performer.id);
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
      const cachedStudio = await stashEntityService.getStudio(mergedGallery.studio.id);
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
      const tagIds = mergedGallery.tags.map((t) => t.id);
      const cachedTags = await stashEntityService.getTagsByIds(tagIds);
      const tagMap = new Map(cachedTags.map((t) => [t.id, t]));

      mergedGallery.tags = mergedGallery.tags.map((tag) => {
        const cachedTag = tagMap.get(tag.id);
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
    let galleries = await stashEntityService.getAllGalleries();

    if (galleries.length === 0) {
      logger.warn("Gallery cache not initialized, returning empty result");
      return res.json({
        galleries: [],
      });
    }

    // Step 2: Merge with user data (for favorites)
    galleries = await mergeGalleriesWithUserData(galleries, userId);

    // Step 2.5: Apply content restrictions and hidden entity filtering
    // Hidden entities are ALWAYS filtered (for all users including admins)
    // Content restrictions (INCLUDE/EXCLUDE) are only applied to non-admins
    const requestingUser = req.user;
    galleries = await userRestrictionService.filterGalleriesForUser(
      galleries,
      userId,
      requestingUser?.role === "ADMIN" // Skip content restrictions for admins
    );

    // Step 3: Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      galleries = galleries.filter((g) => {
        const title = g.title || "";
        return title.toLowerCase().includes(lowerQuery);
      });
    }

    // Step 3.5: Filter empty galleries (non-admins only)
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
 * Get images for a specific gallery from local database
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

    // Fetch the gallery data for inheritance context
    const gallery = await stashEntityService.getGallery(galleryId);

    // Query images from local database filtered by gallery
    const dbImages = await prisma.stashImage.findMany({
      where: {
        deletedAt: null,
        galleries: {
          some: { galleryId },
        },
      },
      include: {
        performers: { include: { performer: true } },
        tags: { include: { tag: true } },
        studio: true,
      },
      orderBy: { filePath: "asc" },
    });

    // Build gallery context for inheritance (used by client-side getEffectiveImageMetadata)
    // Include full performer data from cache for proper display (image_path, gender, etc.)
    let galleryContext = null;
    if (gallery) {
      // Hydrate gallery performers with full cached data
      let hydratedPerformers: NormalizedPerformer[] = [];
      if (gallery.performers && gallery.performers.length > 0) {
        const performerIds = gallery.performers.map((p) => p.id);
        const cachedPerformers =
          await stashEntityService.getPerformersByIds(performerIds);
        const performerMap = new Map(cachedPerformers.map((p) => [p.id, p]));
        hydratedPerformers = gallery.performers.map((performer) => {
          const cachedPerformer = performerMap.get(performer.id);
          return cachedPerformer || (performer as NormalizedPerformer);
        });
      }

      // Hydrate gallery tags with full cached data
      let hydratedTags: NormalizedTag[] = [];
      if (gallery.tags && gallery.tags.length > 0) {
        const tagIds = gallery.tags.map((t) => t.id);
        const cachedTags = await stashEntityService.getTagsByIds(tagIds);
        const tagMap = new Map(cachedTags.map((t) => [t.id, t]));
        hydratedTags = gallery.tags.map((tag) => {
          const cachedTag = tagMap.get(tag.id);
          return cachedTag || (tag as NormalizedTag);
        });
      }

      // Hydrate gallery studio with full cached data (gallery.studio only has id)
      let hydratedStudio = null;
      if (gallery.studio?.id) {
        const cachedStudio = await stashEntityService.getStudio(gallery.studio.id);
        hydratedStudio = cachedStudio || gallery.studio;
      }

      galleryContext = {
        id: gallery.id,
        title: gallery.title,
        date: gallery.date,
        details: gallery.details,
        photographer: gallery.photographer,
        studio: hydratedStudio,
        studioId: hydratedStudio?.id,
        performers: hydratedPerformers,
        tags: hydratedTags,
        urls: gallery.urls,
      };
    }

    // Transform to API format with proxy URLs
    const transformedImages = dbImages.map((image) => ({
      id: image.id,
      title: image.title,
      code: image.code,
      details: image.details,
      photographer: image.photographer,
      date: image.date,
      paths: {
        thumbnail: `/api/proxy/image/${image.id}/thumbnail`,
        preview: `/api/proxy/image/${image.id}/preview`,
        image: `/api/proxy/image/${image.id}/image`,
      },
      width: image.width,
      height: image.height,
      rating100: image.rating100,
      o_counter: image.oCounter,
      filePath: image.filePath,
      fileSize: image.fileSize ? Number(image.fileSize) : null,
      performers: image.performers.map((ip) => ({
        id: ip.performer.id,
        name: ip.performer.name,
      })),
      tags: image.tags.map((it) => ({
        id: it.tag.id,
        name: it.tag.name,
      })),
      studio: image.studio
        ? { id: image.studio.id, name: image.studio.name }
        : null,
      stashCreatedAt: image.stashCreatedAt?.toISOString() ?? null,
      stashUpdatedAt: image.stashUpdatedAt?.toISOString() ?? null,
      // Include galleries array for inheritance support
      // This allows getEffectiveImageMetadata to work properly on the client
      galleries: galleryContext ? [galleryContext] : [],
    }));

    // Merge images with user data (ratings/favorites)
    const mergedImages = await mergeImagesWithUserData(
      transformedImages,
      userId
    );

    res.json({
      images: mergedImages,
      count: mergedImages.length,
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
