import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindStudiosMinimalRequest,
  FindStudiosMinimalResponse,
  FindStudiosRequest,
  FindStudiosResponse,
  TypedAuthRequest,
  TypedResponse,
} from "../../types/api/index.js";
import type { NormalizedStudio } from "../../types/index.js";
import { disambiguateEntityNames } from "../../utils/entityInstanceId.js";
import { hydrateStudioRelationships } from "../../utils/hierarchyUtils.js";
import { toLegacyFilter } from "../../utils/legacyFilter.js";
import {
  logDropped,
  parseListRequest,
  singleIdRef,
} from "../../utils/listRequest.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * findStudios using SQL query builder
 */
export const findStudios = async (
  req: TypedAuthRequest<FindStudiosRequest>,
  res: TypedResponse<
    FindStudiosResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("studio", req.body, {
    userId: req.user.id,
  });
  logDropped("POST /library/studios", request.dropped);

  try {
    const startTime = Date.now();
    const userId = req.user.id;
    const { page, perPage, specificInstanceId } = request;
    // A detail page asks for its studio by id
    const lookup = singleIdRef(request.filter.ids);

    // Exclusions apply to every user; an admin's rows hold only their own hides
    const applyExclusions = true;

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    const { studios, total } = await studioQueryBuilder.execute({
      userId,
      filters: toLegacyFilter("studio", request.filter),
      applyExclusions,
      allowedInstanceIds,
      specificInstanceId,
      sort: request.sort.field,
      sortDirection: request.sort.direction,
      page,
      perPage,
      searchQuery: request.q,
      randomSeed: request.sort.seed,
    });

    // Check for ambiguous results on single-ID lookups
    if (lookup && !specificInstanceId && studios.length > 1) {
      logger.warn("Ambiguous studio lookup", {
        id: lookup.id,
        matchCount: studios.length,
        instances: studios.map((s) => s.instanceId),
      });
      res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple studios found with ID ${lookup.id}. Specify instance_id parameter.`,
        matches: studios.map((s) => ({
          id: s.id,
          name: s.name,
          instanceId: s.instanceId,
        })),
      });
      return;
    }

    // For single-entity requests (detail pages), get studio with computed counts
    let resultStudios = studios;
    if (lookup && resultStudios.length === 1) {
      // Get studio with computed counts from junction tables
      const firstStudio = resultStudios[0] as (typeof resultStudios)[number];
      const studioWithCounts = await stashEntityService.getStudio(
        firstStudio.id,
        firstStudio.instanceId
      );
      if (studioWithCounts) {
        // Merge with the studio data (which has user ratings/stats)
        const existingStudio = firstStudio;
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

        logger.debug("Computed counts for studio detail", {
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
    if (lookup) {
      // Get all studios for hierarchy lookup, then hydrate
      const allStudios = await stashEntityService.getAllStudios();
      const allHydrated = await hydrateStudioRelationships(allStudios);
      // Filter by both id AND instanceId to handle multi-instance correctly
      hydratedStudios = allHydrated.filter((s) =>
        resultStudios.some(
          (r) => r.id === s.id && r.instanceId === s.instanceId
        )
      );
      // Merge the computed counts back (preserving hydrated parent_studio and child_studios)
      hydratedStudios = hydratedStudios.map((h) => {
        // Match by both id AND instanceId
        const result = resultStudios.find(
          (r) => r.id === h.id && r.instanceId === h.instanceId
        );
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
      stashUrl: buildStashEntityUrl(
        "studio",
        studio.id,
        studio.instanceId,
        req.user
      ),
    }));

    logger.debug("findStudios completed", {
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
    const userId = req.user?.id;
    studios = await entityExclusionHelper.filterExcluded(
      studios,
      userId,
      "studio"
    );

    // Apply count filters (OR logic - pass if ANY condition is met)
    if (count_filter) {
      const {
        min_scene_count,
        min_gallery_count,
        min_image_count,
        min_performer_count,
        min_group_count,
      } = count_filter;
      studios = studios.filter((s) => {
        const conditions: boolean[] = [];
        if (min_scene_count !== undefined)
          conditions.push(s.scene_count >= min_scene_count);
        if (min_gallery_count !== undefined)
          conditions.push(s.gallery_count >= min_gallery_count);
        if (min_image_count !== undefined)
          conditions.push(s.image_count >= min_image_count);
        if (min_performer_count !== undefined)
          conditions.push(s.performer_count >= min_performer_count);
        if (min_group_count !== undefined)
          conditions.push(s.group_count >= min_group_count);
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
      const aValue = (a as unknown as Record<string, unknown>)[sortField] || "";
      const bValue = (b as unknown as Record<string, unknown>)[sortField] || "";
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

    // Disambiguate names for entities with same name across different instances
    // Only non-default instances get suffixed with instance name when duplicates exist
    const entitiesWithInstance = paginatedStudios.map((s) => ({
      id: s.id,
      name: s.name,
      instanceId: s.instanceId,
    }));
    const minimal = disambiguateEntityNames(entitiesWithInstance);

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
