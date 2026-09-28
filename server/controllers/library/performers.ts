import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindPerformersMinimalRequest,
  FindPerformersMinimalResponse,
  FindPerformersRequest,
  FindPerformersResponse,
  TypedAuthRequest,
  TypedResponse,
} from "../../types/api/index.js";
import { disambiguateEntityNames } from "../../utils/entityInstanceId.js";
import { hydrateEntityTags } from "../../utils/hierarchyUtils.js";
import { toLegacyFilter } from "../../utils/legacyFilter.js";
import {
  logDropped,
  parseListRequest,
  parseMinimalRequest,
  singleIdRef,
} from "../../utils/listRequest.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Find performers using SQL query builder
 * Uses PerformerQueryBuilder for SQL-native filtering, sorting, and pagination.
 */
export const findPerformers = async (
  req: TypedAuthRequest<FindPerformersRequest>,
  res: TypedResponse<
    FindPerformersResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("performer", req.body, {
    userId: req.user.id,
  });
  logDropped("POST /library/performers", request.dropped);

  try {
    const startTime = Date.now();
    const userId = req.user.id;
    const { page, perPage, specificInstanceId } = request;
    // A detail page asks for its performer by id
    const lookup = singleIdRef(request.filter.ids);

    // Exclusions apply to every user; an admin's rows hold only their own hides
    const applyExclusions = true;

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    const { performers, total } = await performerQueryBuilder.execute({
      userId,
      filters: toLegacyFilter("performer", request.filter),
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
    // This happens when the same ID exists in multiple Stash instances
    if (lookup && !specificInstanceId && performers.length > 1) {
      logger.warn("Ambiguous performer lookup", {
        id: lookup.id,
        matchCount: performers.length,
        instances: performers.map((p) => p.instanceId),
      });
      res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple performers found with ID ${lookup.id}. Specify instance_id parameter.`,
        matches: performers.map((p) => ({
          id: p.id,
          name: p.name,
          instanceId: p.instanceId,
        })),
      });
      return;
    }

    // For single-entity requests (detail pages), hydrate tags
    let resultPerformers = performers;
    if (lookup && performers.length === 1) {
      resultPerformers = await hydrateEntityTags(performers);
    }

    // Add stashUrl to each performer
    const performersWithStashUrl = resultPerformers.map((performer) => ({
      ...performer,
      stashUrl: buildStashEntityUrl(
        "performer",
        performer.id,
        performer.instanceId,
        req.user
      ),
    }));

    logger.debug("findPerformers completed", {
      totalTime: `${Date.now() - startTime}ms`,
      totalCount: total,
      returnedCount: performersWithStashUrl.length,
      page,
      perPage,
    });

    res.json({
      findPerformers: {
        count: total,
        performers: performersWithStashUrl,
      },
    });
  } catch (error) {
    logger.error("Error in findPerformers", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find performers",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get minimal performers (id + name only) for filter dropdowns
 */
export const findPerformersMinimal = async (
  req: TypedAuthRequest<FindPerformersMinimalRequest>,
  res: TypedResponse<FindPerformersMinimalResponse | ApiErrorResponse>
) => {
  // q, name order, a page of 50 unless the request names 1..250, and the
  // count minimums; a ValidationError (400) reaches the central error handler
  const request = parseMinimalRequest("performer", req.body, {
    userId: req.user.id,
  });
  logDropped("POST /library/performers/minimal", request.dropped);

  try {
    const { q: searchQuery, direction: sortDirection, perPage } = request;
    const count_filter = request.countFilter;

    let performers = await stashEntityService.getAllPerformers();

    // Apply pre-computed exclusions (includes restrictions, hidden, cascade, and empty)
    const userId = req.user?.id;
    performers = await entityExclusionHelper.filterExcluded(
      performers,
      userId,
      "performer"
    );

    // Apply count filters (OR logic - pass if ANY condition is met)
    if (count_filter) {
      const {
        min_scene_count,
        min_gallery_count,
        min_image_count,
        min_group_count,
      } = count_filter;
      performers = performers.filter((p) => {
        const conditions: boolean[] = [];
        if (min_scene_count !== undefined)
          conditions.push(p.scene_count >= min_scene_count);
        if (min_gallery_count !== undefined)
          conditions.push(p.gallery_count >= min_gallery_count);
        if (min_image_count !== undefined)
          conditions.push(p.image_count >= min_image_count);
        if (min_group_count !== undefined)
          conditions.push(p.group_count >= min_group_count);
        return conditions.length === 0 || conditions.some((c) => c);
      });
    }

    // Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      performers = performers.filter((p) => {
        const name = p.name || "";
        const aliases = p.alias_list?.join(" ") || "";
        return (
          name.toLowerCase().includes(lowerQuery) ||
          aliases.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Name order
    performers.sort((a, b) => {
      const comparison = a.name.localeCompare(b.name);
      return sortDirection === "DESC" ? -comparison : comparison;
    });

    // The first page: the pickers never page
    const paginatedPerformers = performers.slice(0, perPage);

    // Disambiguate names for entities with same name across different instances
    // Only non-default instances get suffixed with instance name when duplicates exist
    const entitiesWithInstance = paginatedPerformers.map((p) => ({
      id: p.id,
      name: p.name,
      instanceId: p.instanceId,
    }));
    const minimal = disambiguateEntityNames(entitiesWithInstance);

    res.json({
      performers: minimal,
    });
  } catch (error) {
    logger.error("Error in findPerformersMinimal", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find performers",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
