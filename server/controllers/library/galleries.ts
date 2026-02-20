import type {
  TypedAuthRequest,
  TypedResponse,
  FindGalleriesRequest,
  FindGalleriesResponse,
  GetGalleryImagesQuery,
  GetGalleryImagesResponse,
  FindGalleriesMinimalRequest,
  FindGalleriesMinimalResponse,
  ApiErrorResponse,
  AmbiguousLookupResponse,
} from "../../types/api/index.js";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import {
  NormalizedGallery,
  NormalizedPerformer,
  NormalizedTag,
  PeekGalleryFilter,
} from "../../types/index.js";
import { expandStudioIds, expandTagIds } from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import { parseRandomSort } from "../../utils/seededRandom.js";
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

  const KEY_SEP = "\0";
  const ratingMap = new Map(
    ratings.map((r) => [
      `${r.galleryId}${KEY_SEP}${r.instanceId || ""}`,
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
    ...ratingMap.get(`${gallery.id}${KEY_SEP}${gallery.instanceId || ""}`),
  }));
}

/**
 * Merge images with user rating/favorite data
 */
async function mergeImagesWithUserData<T extends { id: string; instanceId?: string | null }>(
  images: T[],
  userId: number
): Promise<(T & { rating?: number | null; rating100?: number | null; favorite?: boolean })[]> {
  const ratings = await prisma.imageRating.findMany({ where: { userId } });

  const KEY_SEP = "\0";
  const ratingMap = new Map(
    ratings.map((r) => [
      `${r.imageId}${KEY_SEP}${r.instanceId || ""}`,
      {
        rating: r.rating,
        rating100: r.rating,
        favorite: r.favorite,
      },
    ])
  );

  return images.map((image) => ({
    ...image,
    ...ratingMap.get(`${image.id}${KEY_SEP}${image.instanceId || ""}`),
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
  if (filters.ids?.value && filters.ids.value.length > 0) {
    const idSet = new Set(filters.ids.value);
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
 * Find galleries endpoint
 * Uses GalleryQueryBuilder for SQL-native filtering (Phase 3 scalability)
 */
export const findGalleries = async (
  req: TypedAuthRequest<FindGalleriesRequest>,
  res: TypedResponse<FindGalleriesResponse | ApiErrorResponse | AmbiguousLookupResponse>
) => {
  try {
    const startTime = Date.now();
    const userId = req.user?.id;
    const { filter, gallery_filter, ids } = req.body;

    const sortFieldRaw = filter?.sort || "title";
    const sortDirection = (filter?.direction || "ASC") as "ASC" | "DESC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Admins skip exclusions to see everything
    const requestingUser = req.user;
    const applyExclusions = requestingUser?.role !== "ADMIN";

    // Parse random sort to extract seed for consistent pagination
    const { sortField, randomSeed } = parseRandomSort(sortFieldRaw, requestingUser.id);

    // Merge root-level ids with gallery_filter
    const normalizedIds = ids
      ? { value: ids, modifier: "INCLUDES" }
      : gallery_filter?.ids;
    const mergedFilter: PeekGalleryFilter & Record<string, unknown> = {
      ...gallery_filter,
      ids: normalizedIds,
    };

    // Extract specific instance ID for disambiguation (from gallery_filter.instance_id)
    const specificInstanceId = gallery_filter?.instance_id as string | undefined;

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    // Use SQL-native query builder
    const { galleries, total } = await galleryQueryBuilder.execute({
      userId,
      filters: mergedFilter,
      applyExclusions,
      allowedInstanceIds,
      specificInstanceId,
      sort: sortField,
      sortDirection,
      page,
      perPage,
      searchQuery,
      randomSeed,
    });

    // Check for ambiguous results on single-ID lookups
    if (ids && ids.length === 1 && !specificInstanceId && galleries.length > 1) {
      logger.warn("Ambiguous gallery lookup", {
        id: ids[0],
        matchCount: galleries.length,
        instances: galleries.map(g => g.instanceId),
      });
      return res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple galleries found with ID ${ids[0]}. Specify instance_id parameter.`,
        matches: galleries.map(g => ({
          id: g.id,
          title: g.title,
          instanceId: g.instanceId,
        })),
      });
    }

    // For single-entity requests (detail pages), get gallery with computed counts
    let paginatedGalleries = galleries;
    if (ids && ids.length === 1 && paginatedGalleries.length === 1) {
      const existingGallery = paginatedGalleries[0];
      const galleryWithCounts = await stashEntityService.getGallery(ids[0], existingGallery.instanceId);
      if (galleryWithCounts) {
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

    // Add stashUrl to each gallery
    const galleriesWithStashUrl = paginatedGalleries.map((gallery) => ({
      ...gallery,
      stashUrl: buildStashEntityUrl("gallery", gallery.id),
    }));

    logger.info("findGalleries completed", {
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
  req: TypedAuthRequest<unknown, { id: string }>,
  res: TypedResponse<NormalizedGallery | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const galleryInstanceId = req.query.instanceId as string | undefined;
    let gallery = await stashEntityService.getGallery(id, galleryInstanceId);

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
    const galleryInstId = gallery.instanceId || galleryInstanceId;
    if (mergedGallery.performers && mergedGallery.performers.length > 0) {
      const performerIds = mergedGallery.performers.map((p) => p.id);
      const cachedPerformers = await stashEntityService.getPerformersByIds(performerIds, galleryInstId);
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
      const cachedStudio = await stashEntityService.getStudio(mergedGallery.studio.id, galleryInstId);
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
      const cachedTags = await stashEntityService.getTagsByIds(tagIds, galleryInstId);
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
  req: TypedAuthRequest<FindGalleriesMinimalRequest>,
  res: TypedResponse<FindGalleriesMinimalResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const { filter, count_filter } = req.body;
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

    // Step 2.5: Apply pre-computed exclusions (includes restrictions, hidden, cascade, and empty)
    // Admins skip exclusions to see everything
    const requestingUser = req.user;
    if (requestingUser?.role !== "ADMIN") {
      galleries = await entityExclusionHelper.filterExcluded(
        galleries,
        userId,
        "gallery"
      );
    }

    // Step 2.6: Apply count filters (OR logic - pass if ANY condition is met)
    if (count_filter) {
      const { min_image_count } = count_filter;
      galleries = galleries.filter((g) => {
        const conditions: boolean[] = [];
        if (min_image_count !== undefined) conditions.push(g.image_count >= min_image_count);
        return conditions.length === 0 || conditions.some((c) => c);
      });
    }

    // Step 3: Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      galleries = galleries.filter((g) => {
        const title = g.title || "";
        return title.toLowerCase().includes(lowerQuery);
      });
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
      title: g.title || "", // Galleries use 'title' not 'name'
      instanceId: g.instanceId || "",
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
  req: TypedAuthRequest<unknown, { galleryId: string }, GetGalleryImagesQuery>,
  res: TypedResponse<GetGalleryImagesResponse | ApiErrorResponse>
) => {
  try {
    const { galleryId } = req.params;
    const userId = req.user?.id;
    const instanceId = req.query.instance;

    // Pagination parameters (optional - defaults to loading all for backwards compat)
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 0; // 0 = no limit (all)
    const skip = perPage > 0 ? (page - 1) * perPage : 0;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Fetch the gallery data for inheritance context (with instanceId for multi-stash support)
    const gallery = await stashEntityService.getGallery(galleryId, instanceId);

    // Build query options (filter by instanceId if provided for multi-stash support)
    const whereClause = {
      deletedAt: null,
      ...(instanceId && { stashInstanceId: instanceId }),
      galleries: {
        some: { galleryId },
      },
    };

    // Get total count for pagination metadata
    const totalCount = perPage > 0
      ? await prisma.stashImage.count({ where: whereClause })
      : 0;

    // Query images from local database filtered by gallery
    // PERFORMANCE: Uses pagination when per_page is specified to avoid loading huge galleries
    const dbImages = await prisma.stashImage.findMany({
      where: whereClause,
      include: {
        performers: { include: { performer: true } },
        tags: { include: { tag: true } },
        studio: true,
      },
      orderBy: { filePath: "asc" },
      ...(perPage > 0 && { skip, take: perPage }),
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
          await stashEntityService.getPerformersByIds(performerIds, instanceId || gallery.instanceId);
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
        const cachedTags = await stashEntityService.getTagsByIds(tagIds, instanceId || gallery.instanceId);
        const tagMap = new Map(cachedTags.map((t) => [t.id, t]));
        hydratedTags = gallery.tags.map((tag) => {
          const cachedTag = tagMap.get(tag.id);
          return cachedTag || (tag as NormalizedTag);
        });
      }

      // Hydrate gallery studio with full cached data (gallery.studio only has id)
      let hydratedStudio = null;
      if (gallery.studio?.id) {
        const cachedStudio = await stashEntityService.getStudio(gallery.studio.id, instanceId || gallery.instanceId);
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

    // Build response with optional pagination metadata
    const response: {
      images: typeof mergedImages;
      count: number;
      pagination?: {
        page: number;
        per_page: number;
        total: number;
        total_pages: number;
      };
    } = {
      images: mergedImages,
      count: mergedImages.length,
    };

    // Include pagination metadata when per_page is specified
    if (perPage > 0) {
      response.pagination = {
        page,
        per_page: perPage,
        total: totalCount,
        total_pages: Math.ceil(totalCount / perPage),
      };
    }

    // Cast needed: transformed gallery images have structural differences from
    // GalleryImageWithContext (e.g. nested studio type) that are compatible at runtime
    res.json(response as unknown as GetGalleryImagesResponse);
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
