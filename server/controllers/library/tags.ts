import { z } from "zod";
import { ValidationError } from "../../middleware/errorHandler.js";
import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { loadTagTree } from "../../services/TagTreeService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindTagTreeRequest,
  FindTagTreeResponse,
  FindTagsMinimalRequest,
  FindTagsMinimalResponse,
  FindTagsRequest,
  FindTagsResponse,
  TypedAuthRequest,
  TypedResponse,
} from "../../types/api/index.js";
import type { NormalizedTag } from "../../types/index.js";
import type { FilterRef } from "../../types/parsedFilters.js";
import { disambiguateEntityNames } from "../../utils/entityInstanceId.js";
import { hydrateTagRelationships } from "../../utils/hierarchyUtils.js";
import { toLegacyFilter } from "../../utils/legacyFilter.js";
import {
  logDropped,
  parseFilterRef,
  parseListRequest,
  parseMinimalRequest,
  singleIdRef,
} from "../../utils/listRequest.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * findTags using SQL query builder
 */
export const findTags = async (
  req: TypedAuthRequest<FindTagsRequest>,
  res: TypedResponse<
    FindTagsResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("tag", req.body, { userId: req.user.id });
  logDropped("POST /library/tags", request.dropped);

  try {
    const startTime = Date.now();
    const userId = req.user.id;
    const { page, perPage, specificInstanceId } = request;
    // A detail page asks for its tag by id
    const lookup = singleIdRef(request.filter.ids);

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    const { tags, total } = await tagQueryBuilder.execute({
      userId,
      filters: toLegacyFilter("tag", request.filter),
      // Exclusions apply to every user, by id too; an admin's rows hold only their own hides.
      // Parent tags stay visible because the empty phase exempts tags with a child tag on the same instance.
      applyExclusions: true,
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
    if (lookup && !specificInstanceId && tags.length > 1) {
      logger.warn("Ambiguous tag lookup", {
        id: lookup.id,
        matchCount: tags.length,
        instances: tags.map((t) => t.instanceId),
      });
      res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple tags found with ID ${lookup.id}. Specify instance_id parameter.`,
        matches: tags.map((t) => ({
          id: t.id,
          name: t.name,
          instanceId: t.instanceId,
        })),
      });
      return;
    }

    // For single-entity requests (detail pages), get tag with computed counts
    let resultTags = tags;
    if (lookup && resultTags.length === 1) {
      const firstTag = resultTags[0] as (typeof resultTags)[number];
      const tagWithCounts = await stashEntityService.getTag(
        firstTag.id,
        firstTag.instanceId
      );
      if (tagWithCounts) {
        const existingTag = firstTag;
        resultTags = [
          {
            ...existingTag,
            scene_count: tagWithCounts.scene_count,
            image_count: tagWithCounts.image_count,
            gallery_count: tagWithCounts.gallery_count,
            performer_count: tagWithCounts.performer_count,
            studio_count: tagWithCounts.studio_count,
            group_count: tagWithCounts.group_count,
            scene_marker_count: tagWithCounts.scene_marker_count,
          },
        ];
        logger.debug("Computed counts for tag detail", {
          tagId: existingTag.id,
          tagName: existingTag.name,
          sceneCount: tagWithCounts.scene_count,
          imageCount: tagWithCounts.image_count,
          galleryCount: tagWithCounts.gallery_count,
          performerCount: tagWithCounts.performer_count,
          studioCount: tagWithCounts.studio_count,
          groupCount: tagWithCounts.group_count,
        });
      }
    }

    // Hydrate parent/child relationships with names
    // For single-tag requests (detail pages), we need all tags for accurate parent/child lookup
    let hydratedTags: NormalizedTag[];
    if (lookup) {
      // Get all tags for hierarchy lookup, then hydrate
      const allTags = await stashEntityService.getAllTags();
      const allHydrated = await hydrateTagRelationships(allTags);
      hydratedTags = allHydrated.filter((t) =>
        resultTags.some((r) => r.id === t.id && r.instanceId === t.instanceId)
      );
      // Merge the computed counts back
      hydratedTags = hydratedTags.map((h) => {
        const result = resultTags.find(
          (r) => r.id === h.id && r.instanceId === h.instanceId
        );
        return result ? { ...h, ...result } : h;
      });
    } else {
      hydratedTags = await hydrateTagRelationships(resultTags);
    }

    // Add stashUrl to each tag
    const tagsWithStashUrl = hydratedTags.map((tag) => ({
      ...tag,
      stashUrl: buildStashEntityUrl("tag", tag.id, tag.instanceId, req.user),
    }));

    logger.debug("findTags completed", {
      totalTime: `${Date.now() - startTime}ms`,
      totalCount: total,
      returnedCount: tagsWithStashUrl.length,
      page,
      perPage,
    });

    res.json({
      findTags: {
        count: total,
        tags: tagsWithStashUrl,
      },
    });
  } catch (error) {
    logger.error("Error in findTags", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find tags",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get minimal tags (id + name only) for filter dropdowns
 */
export const findTagsMinimal = async (
  req: TypedAuthRequest<FindTagsMinimalRequest>,
  res: TypedResponse<FindTagsMinimalResponse | ApiErrorResponse>
) => {
  // q, name order, a page of 50 unless the request names 1..250, and the
  // count minimums; a ValidationError (400) reaches the central error handler
  const request = parseMinimalRequest("tag", req.body, {
    userId: req.user.id,
  });
  logDropped("POST /library/tags/minimal", request.dropped);

  try {
    const { q: searchQuery, direction: sortDirection, perPage } = request;
    const count_filter = request.countFilter;

    let tags = await stashEntityService.getAllTags();

    const userId = req.user?.id;

    // Apply pre-computed exclusions (includes restrictions, hidden, cascade, and empty)
    tags = await entityExclusionHelper.filterExcluded(tags, userId, "tag");

    // Apply count filters (OR logic - pass if ANY condition is met)
    if (count_filter) {
      const {
        min_scene_count,
        min_gallery_count,
        min_image_count,
        min_performer_count,
        min_group_count,
      } = count_filter;
      tags = tags.filter((t) => {
        const conditions: boolean[] = [];
        if (min_scene_count !== undefined)
          conditions.push(t.scene_count >= min_scene_count);
        if (min_gallery_count !== undefined)
          conditions.push(t.gallery_count >= min_gallery_count);
        if (min_image_count !== undefined)
          conditions.push(t.image_count >= min_image_count);
        if (min_performer_count !== undefined)
          conditions.push(t.performer_count >= min_performer_count);
        if (min_group_count !== undefined)
          conditions.push(t.group_count >= min_group_count);
        return conditions.length === 0 || conditions.some((c) => c);
      });
    }

    // Apply search query if provided
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      tags = tags.filter((t) => {
        const name = t.name || "";
        const description = t.description || "";
        const aliases = (t.aliases || []).join(" ");
        return (
          name.toLowerCase().includes(lowerQuery) ||
          description.toLowerCase().includes(lowerQuery) ||
          aliases.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Name order
    tags.sort((a, b) => {
      const comparison = a.name.localeCompare(b.name);
      return sortDirection === "DESC" ? -comparison : comparison;
    });

    // The first page: the pickers never page
    const paginatedTags = tags.slice(0, perPage);

    // Disambiguate names for entities with same name across different instances
    // Only non-default instances get suffixed with instance name when duplicates exist
    const entitiesWithInstance = paginatedTags.map((t) => ({
      id: t.id,
      name: t.name,
      instanceId: t.instanceId,
    }));
    const minimal = disambiguateEntityNames(entitiesWithInstance);

    res.json({
      tags: minimal,
    });
  } catch (error) {
    logger.error("Error in findTagsMinimal", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find tags",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * The body of POST /library/tags/tree: an optional scope of one ref per
 * entity. Checked strictly in both filter policies: the endpoint is new, so
 * no stored rule or cached client sends anything else.
 */
const scopeRef = z.string().transform((raw, ctx): FilterRef => {
  const ref = parseFilterRef(raw);
  if (ref) return ref;
  ctx.addIssue({ code: "custom", message: "Expected an id or id:instanceId" });
  return z.NEVER;
});

const tagTreeRequest = z.strictObject({
  scope: z
    .strictObject({
      performer: scopeRef.optional(),
      tag: scopeRef.optional(),
      studio: scopeRef.optional(),
      group: scopeRef.optional(),
    })
    .optional(),
});

/**
 * The compact tag tree for the Tags page's hierarchy view and the folder
 * view: every tag the user can see, or with a scope the tags on its visible
 * scenes and their visible ancestors (services/TagTreeService.ts)
 */
export const findTagTree = async (
  req: TypedAuthRequest<FindTagTreeRequest | undefined>,
  res: TypedResponse<FindTagTreeResponse>
) => {
  const parsed = tagTreeRequest.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new ValidationError("Invalid request", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    });
  }
  const userId = req.user.id;
  const tags = await loadTagTree({
    userId,
    allowedInstanceIds: await getUserAllowedInstanceIds(userId),
    scope: parsed.data.scope,
  });
  res.json({ tags });
};
