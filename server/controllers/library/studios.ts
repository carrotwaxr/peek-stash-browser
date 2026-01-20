import type {
  TypedAuthRequest,
  TypedResponse,
  FindStudiosRequest,
  FindStudiosResponse,
  FindStudiosMinimalRequest,
  FindStudiosMinimalResponse,
  UpdateStudioParams,
  UpdateStudioRequest,
  UpdateStudioResponse,
  ApiErrorResponse,
} from "../../types/api/index.js";
import prisma from "../../prisma/singleton.js";
import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { userStatsService } from "../../services/UserStatsService.js";
import type { NormalizedStudio, PeekStudioFilter } from "../../types/index.js";
import { hydrateStudioRelationships } from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Merge user-specific data into studios
 * OPTIMIZED: Now uses pre-computed stats from database instead of calculating on-the-fly
 */
export async function mergeStudiosWithUserData(
  studios: NormalizedStudio[],
  userId: number
): Promise<NormalizedStudio[]> {
  // Fetch user ratings and stats in parallel
  const [ratings, studioStats] = await Promise.all([
    prisma.studioRating.findMany({ where: { userId } }),
    userStatsService.getStudioStats(userId),
  ]);

  const ratingMap = new Map(
    ratings.map((r) => [
      r.studioId,
      {
        rating: r.rating,
        rating100: r.rating,
        favorite: r.favorite,
      },
    ])
  );

  // Merge data
  return studios.map((studio) => {
    const stats = studioStats.get(studio.id) || {
      oCounter: 0,
      playCount: 0,
    };
    return {
      ...studio,
      ...ratingMap.get(studio.id),
      o_counter: stats.oCounter,
      play_count: stats.playCount,
    };
  });
}

/**
 * findStudios using SQL query builder
 */
export const findStudios = async (
  req: TypedAuthRequest<FindStudiosRequest>,
  res: TypedResponse<FindStudiosResponse | ApiErrorResponse>
) => {
  try {
    const startTime = Date.now();
    const userId = req.user?.id;
    const requestingUser = req.user;
    const { filter, studio_filter, ids } = req.body;

    const sortField = filter?.sort || "name";
    const sortDirection = (filter?.direction || "ASC").toUpperCase() as "ASC" | "DESC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Merge root-level ids with studio_filter
    const normalizedIds = ids
      ? { value: ids, modifier: "INCLUDES" }
      : studio_filter?.ids;
    const mergedFilter: PeekStudioFilter = {
      ...studio_filter,
      ids: normalizedIds,
    };

    // Use SQL query builder - admins skip exclusions
    const applyExclusions = requestingUser?.role !== "ADMIN";

    const { studios, total } = await studioQueryBuilder.execute({
      userId,
      filters: mergedFilter,
      applyExclusions,
      sort: sortField,
      sortDirection,
      page,
      perPage,
      searchQuery,
    });

    // For single-entity requests (detail pages), get studio with computed counts
    let resultStudios = studios;
    if (ids && ids.length === 1 && resultStudios.length === 1) {
      // Get studio with computed counts from junction tables
      const studioWithCounts = await stashEntityService.getStudio(ids[0]);
      if (studioWithCounts) {
        // Merge with the studio data (which has user ratings/stats)
        const existingStudio = resultStudios[0];
        resultStudios = [
          {
            ...existingStudio,
            scene_count: studioWithCounts.scene_count,
            image_count: studioWithCounts.image_count,
            gallery_count: studioWithCounts.gallery_count,
            performer_count: studioWithCounts.performer_count,
            group_count: studioWithCounts.group_count,
          },
        ];

        logger.info("Computed counts for studio detail", {
          studioId: existingStudio.id,
          studioName: existingStudio.name,
          sceneCount: studioWithCounts.scene_count,
          imageCount: studioWithCounts.image_count,
          galleryCount: studioWithCounts.gallery_count,
          performerCount: studioWithCounts.performer_count,
          groupCount: studioWithCounts.group_count,
        });
      }
    }

    // Hydrate parent/child relationships with names
    // For single-studio requests (detail pages), we need all studios for accurate parent/child lookup
    let hydratedStudios: NormalizedStudio[];
    if (ids && ids.length === 1) {
      // Get all studios for hierarchy lookup, then hydrate
      const allStudios = await stashEntityService.getAllStudios();
      const allHydrated = await hydrateStudioRelationships(allStudios);
      hydratedStudios = allHydrated.filter((s) => resultStudios.some((r) => r.id === s.id));
      // Merge the computed counts back (preserving hydrated parent_studio and child_studios)
      hydratedStudios = hydratedStudios.map((h) => {
        const result = resultStudios.find((r) => r.id === h.id);
        if (!result) return h;
        return {
          ...result,
          ...h,
          // Override counts from result (which has freshly computed values)
          scene_count: result.scene_count,
          image_count: result.image_count,
          gallery_count: result.gallery_count,
          performer_count: result.performer_count,
          group_count: result.group_count,
        };
      });
    } else {
      hydratedStudios = await hydrateStudioRelationships(resultStudios);
    }

    // Add stashUrl to each studio
    const studiosWithStashUrl = hydratedStudios.map((studio) => ({
      ...studio,
      stashUrl: buildStashEntityUrl("studio", studio.id),
    }));

    logger.info("findStudios completed", {
      totalTime: `${Date.now() - startTime}ms`,
      totalCount: total,
      returnedCount: studiosWithStashUrl.length,
      page,
      perPage,
    });

    res.json({
      findStudios: {
        count: total,
        studios: studiosWithStashUrl,
      },
    });
  } catch (error) {
    logger.error("Error in findStudios", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find studios",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Apply studio filters
 */
export function applyStudioFilters(
  studios: NormalizedStudio[],
  filters: PeekStudioFilter | null | undefined
): NormalizedStudio[] {
  if (!filters) return studios;

  let filtered = studios;

  // Filter by IDs (for detail pages)
  if (filters.ids?.value && filters.ids.value.length > 0) {
    const idSet = new Set(filters.ids.value);
    filtered = filtered.filter((s) => idSet.has(s.id));
  }

  // Filter by favorite
  if (filters.favorite !== undefined) {
    filtered = filtered.filter((s) => s.favorite === filters.favorite);
  }

  // Filter by tags
  if (filters.tags) {
    const { modifier, value: tagIds } = filters.tags;
    if (tagIds && tagIds.length > 0) {
      filtered = filtered.filter((s) => {
        const studioTagIds = (s.tags || []).map((t: any) => String(t.id));
        const filterTagIds = tagIds.map(String);

        if (modifier === "INCLUDES_ALL") {
          return filterTagIds.every((id: string) => studioTagIds.includes(id));
        }
        if (modifier === "INCLUDES") {
          return filterTagIds.some((id: string) => studioTagIds.includes(id));
        }
        if (modifier === "EXCLUDES") {
          return !filterTagIds.some((id: string) => studioTagIds.includes(id));
        }
        return true;
      });
    }
  }

  // Filter by rating100
  if (filters.rating100) {
    const { modifier, value, value2 } = filters.rating100;
    filtered = filtered.filter((s) => {
      const rating = s.rating100 || 0;
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

  // Filter by o_counter
  if (filters.o_counter) {
    const { modifier, value, value2 } = filters.o_counter;
    filtered = filtered.filter((s) => {
      const oCounter = s.o_counter || 0;
      if (modifier === "GREATER_THAN")
        return value !== undefined && oCounter > value;
      if (modifier === "LESS_THAN")
        return value !== undefined && oCounter < value;
      if (modifier === "EQUALS") return oCounter === value;
      if (modifier === "NOT_EQUALS") return oCounter !== value;
      if (modifier === "BETWEEN")
        return (
          value !== undefined &&
          value2 !== null &&
          value2 !== undefined &&
          oCounter >= value &&
          oCounter <= value2
        );
      return true;
    });
  }

  // Filter by play_count
  if (filters.play_count) {
    const { modifier, value, value2 } = filters.play_count;
    filtered = filtered.filter((s) => {
      const playCount = s.play_count || 0;
      if (modifier === "GREATER_THAN")
        return value !== undefined && playCount > value;
      if (modifier === "LESS_THAN")
        return value !== undefined && playCount < value;
      if (modifier === "EQUALS") return playCount === value;
      if (modifier === "NOT_EQUALS") return playCount !== value;
      if (modifier === "BETWEEN")
        return (
          value !== undefined &&
          value2 !== null &&
          value2 !== undefined &&
          playCount >= value &&
          playCount <= value2
        );
      return true;
    });
  }

  // Filter by scene_count
  if (filters.scene_count) {
    const { modifier, value, value2 } = filters.scene_count;
    filtered = filtered.filter((s) => {
      const sceneCount = s.scene_count || 0;
      if (modifier === "GREATER_THAN") return sceneCount > value;
      if (modifier === "LESS_THAN") return sceneCount < value;
      if (modifier === "EQUALS") return sceneCount === value;
      if (modifier === "NOT_EQUALS") return sceneCount !== value;
      if (modifier === "BETWEEN")
        return (
          value2 !== null &&
          value2 !== undefined &&
          sceneCount >= value &&
          sceneCount <= value2
        );
      return true;
    });
  }

  // Filter by name (text search)
  if (filters.name) {
    const searchValue = filters.name.value.toLowerCase();
    filtered = filtered.filter((s) => {
      const name = s.name || "";
      return name.toLowerCase().includes(searchValue);
    });
  }

  // Filter by details (text search)
  if (filters.details) {
    const searchValue = filters.details.value.toLowerCase();
    filtered = filtered.filter((s) => {
      const details = s.details || "";
      return details.toLowerCase().includes(searchValue);
    });
  }

  // Filter by created_at (date)
  if (filters.created_at) {
    const { modifier, value, value2 } = filters.created_at;
    filtered = filtered.filter((s) => {
      if (!s.created_at) return false;
      const studioDate = new Date(s.created_at);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return studioDate > filterDate;
      if (modifier === "LESS_THAN") return studioDate < filterDate;
      if (modifier === "EQUALS") {
        return studioDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
        const filterDate2 = new Date(value2);
        return studioDate >= filterDate && studioDate <= filterDate2;
      }
      return true;
    });
  }

  // Filter by updated_at (date)
  if (filters.updated_at) {
    const { modifier, value, value2 } = filters.updated_at;
    filtered = filtered.filter((s) => {
      if (!s.updated_at) return false;
      const studioDate = new Date(s.updated_at);
      if (!value) return false;
      const filterDate = new Date(value);
      if (modifier === "GREATER_THAN") return studioDate > filterDate;
      if (modifier === "LESS_THAN") return studioDate < filterDate;
      if (modifier === "EQUALS") {
        return studioDate.toDateString() === filterDate.toDateString();
      }
      if (modifier === "BETWEEN") {
        if (!value2) return false;
        const filterDate2 = new Date(value2);
        return studioDate >= filterDate && studioDate <= filterDate2;
      }
      return true;
    });
  }

  return filtered;
}

/**
 * Get minimal studios (id + name only) for filter dropdowns
 */
export const findStudiosMinimal = async (
  req: TypedAuthRequest<FindStudiosMinimalRequest>,
  res: TypedResponse<FindStudiosMinimalResponse | ApiErrorResponse>
) => {
  try {
    const { filter, count_filter } = req.body;
    const searchQuery = filter?.q || "";
    const sortField = filter?.sort || "name";
    const sortDirection = filter?.direction || "ASC";
    const perPage = filter?.per_page || -1; // -1 means all results

    let studios = await stashEntityService.getAllStudios();

    // Apply pre-computed exclusions (includes restrictions, hidden, cascade, and empty)
    // Admins skip exclusions to see everything
    const requestingUser = req.user;
    const userId = req.user?.id;
    if (requestingUser?.role !== "ADMIN") {
      studios = await entityExclusionHelper.filterExcluded(
        studios,
        userId,
        "studio"
      );
    }

    // Apply count filters (OR logic - pass if ANY condition is met)
    if (count_filter) {
      const { min_scene_count, min_gallery_count, min_image_count, min_performer_count, min_group_count } = count_filter;
      studios = studios.filter((s) => {
        const conditions: boolean[] = [];
        if (min_scene_count !== undefined) conditions.push(s.scene_count >= min_scene_count);
        if (min_gallery_count !== undefined) conditions.push(s.gallery_count >= min_gallery_count);
        if (min_image_count !== undefined) conditions.push(s.image_count >= min_image_count);
        if (min_performer_count !== undefined) conditions.push(s.performer_count >= min_performer_count);
        if (min_group_count !== undefined) conditions.push(s.group_count >= min_group_count);
        return conditions.length === 0 || conditions.some((c) => c);
      });
    }

    // Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      studios = studios.filter((s) => {
        const name = s.name || "";
        const details = s.details || "";
        return (
          name.toLowerCase().includes(lowerQuery) ||
          details.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Sort
    studios.sort((a, b) => {
      const aValue = (a as Record<string, unknown>)[sortField] || "";
      const bValue = (b as Record<string, unknown>)[sortField] || "";
      const comparison =
        typeof aValue === "string" && typeof bValue === "string"
          ? aValue.localeCompare(bValue)
          : aValue > bValue
            ? 1
            : aValue < bValue
              ? -1
              : 0;
      return sortDirection.toUpperCase() === "DESC" ? -comparison : comparison;
    });

    // Paginate (if per_page !== -1)
    let paginatedStudios = studios;
    if (perPage !== -1 && perPage > 0) {
      paginatedStudios = studios.slice(0, perPage);
    }

    const minimal = paginatedStudios.map((s) => ({ id: s.id, name: s.name }));

    res.json({
      studios: minimal,
    });
  } catch (error) {
    logger.error("Error in findStudiosMinimal", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find studios",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateStudio = async (
  req: TypedAuthRequest<UpdateStudioRequest, UpdateStudioParams>,
  res: TypedResponse<UpdateStudioResponse | ApiErrorResponse>
) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const stash = stashInstanceManager.getDefault();
    const updatedStudio = await stash.studioUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    if (!updatedStudio.studioUpdate) {
      return res.status(500).json({ error: "Studio update returned null" });
    }

    res.json({ success: true, studio: updatedStudio.studioUpdate as NormalizedStudio });
  } catch (error) {
    console.error("Error updating studio:", error);
    res.status(500).json({ error: "Failed to update studio" });
  }
};
