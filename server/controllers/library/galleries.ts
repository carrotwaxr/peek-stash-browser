import { coerceEntityRefs } from "@peek/shared-types/instanceAwareId.js";
import prisma from "../../prisma/singleton.js";
import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindGalleriesMinimalRequest,
  FindGalleriesMinimalResponse,
  FindGalleriesRequest,
  FindGalleriesResponse,
  TypedAuthRequest,
  TypedResponse,
} from "../../types/api/index.js";
import type {
  NormalizedGallery,
  PeekGalleryFilter,
} from "../../types/index.js";
import { entityKey } from "../../utils/entityRef.js";
import { logger } from "../../utils/logger.js";
import { parseRandomSort } from "../../utils/seededRandom.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

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
      entityKey(r.galleryId, r.instanceId ?? ""),
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
    ...ratingMap.get(entityKey(gallery.id, gallery.instanceId)),
  }));
}

/**
 * Find galleries endpoint
 * Uses GalleryQueryBuilder for SQL-native filtering (Phase 3 scalability)
 */
export const findGalleries = async (
  req: TypedAuthRequest<FindGalleriesRequest>,
  res: TypedResponse<
    FindGalleriesResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  try {
    const startTime = Date.now();
    const userId = req.user?.id;
    const { filter, gallery_filter, ids } = req.body;

    const sortFieldRaw = filter?.sort || "title";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Exclusions apply to every user; an admin's rows hold only their own hides
    const requestingUser = req.user;
    const applyExclusions = true;

    // Parse random sort to extract seed for consistent pagination
    const { sortField, randomSeed } = parseRandomSort(
      sortFieldRaw,
      requestingUser.id
    );

    // Merge root-level ids with gallery_filter
    const normalizedIds = ids
      ? { value: coerceEntityRefs(ids), modifier: "INCLUDES" }
      : gallery_filter?.ids;
    const mergedFilter: PeekGalleryFilter & Record<string, unknown> = {
      ...gallery_filter,
      ids: normalizedIds,
    };

    // Extract specific instance ID for disambiguation (from gallery_filter.instance_id)
    const specificInstanceId = gallery_filter?.instance_id;

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
    if (
      ids &&
      ids.length === 1 &&
      !specificInstanceId &&
      galleries.length > 1
    ) {
      logger.warn("Ambiguous gallery lookup", {
        id: ids[0],
        matchCount: galleries.length,
        instances: galleries.map((g) => g.instanceId),
      });
      res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple galleries found with ID ${ids[0]}. Specify instance_id parameter.`,
        matches: galleries.map((g) => ({
          id: g.id,
          title: g.title,
          instanceId: g.instanceId,
        })),
      });
      return;
    }

    // For single-entity requests (detail pages), get gallery with computed counts
    let paginatedGalleries = galleries;
    if (ids && ids.length === 1 && paginatedGalleries.length === 1) {
      const existingGallery =
        paginatedGalleries[0] as (typeof paginatedGalleries)[number];
      const galleryWithCounts = await stashEntityService.getGallery(
        ids[0] as string,
        existingGallery.instanceId
      );
      if (galleryWithCounts) {
        paginatedGalleries = [
          {
            ...existingGallery,
            image_count: galleryWithCounts.image_count,
          },
        ];
        logger.debug("Computed counts for gallery detail", {
          galleryId: existingGallery.id,
          galleryTitle: existingGallery.title,
          imageCount: galleryWithCounts.image_count,
        });
      }
    }

    // Add stashUrl to each gallery
    const galleriesWithStashUrl = paginatedGalleries.map((gallery) => ({
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
      res.json({
        galleries: [],
      });
      return;
    }

    // Step 2: Merge with user data (for favorites)
    galleries = await mergeGalleriesWithUserData(galleries, userId);

    // Step 2.5: Apply pre-computed exclusions (includes restrictions, hidden, cascade, and empty)
    galleries = await entityExclusionHelper.filterExcluded(
      galleries,
      userId,
      "gallery"
    );

    // Step 2.6: Apply count filters (OR logic - pass if ANY condition is met)
    if (count_filter) {
      const { min_image_count } = count_filter;
      galleries = galleries.filter((g) => {
        const conditions: boolean[] = [];
        if (min_image_count !== undefined)
          conditions.push(g.image_count >= min_image_count);
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
