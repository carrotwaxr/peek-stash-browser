import { z } from "zod";
import { ValidationError } from "../../middleware/errorHandler.js";
import { findMinimalEntities } from "../../services/MinimalEntityQuery.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { loadTagTree } from "../../services/TagTreeService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindTagTreeRequest,
  FindTagTreeResponse,
  FindTagsMinimalRequest,
  FindTagsMinimalResponse,
  FindTagsRequest,
  FindTagsResponse,
  TypedLibraryRequest,
  TypedResponse,
} from "../../types/api/index.js";
import type { FilterRef } from "../../types/parsedFilters.js";
import {
  parseFilterRef,
  parseListRequest,
  parseMinimalRequest,
  singleIdRef,
} from "../../utils/listRequest.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";
import { relationCountsHandler } from "./relationCounts.js";

/**
 * findTags using SQL query builder
 */
export const findTags = async (
  req: TypedLibraryRequest<FindTagsRequest>,
  res: TypedResponse<
    FindTagsResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("tag", req.body, { userId: req.user.id });

  const startTime = Date.now();
  const userId = req.user.id;
  const { page, perPage, specificInstanceId } = request;
  // A detail page asks for its tag by id
  const lookup = singleIdRef(request.filter.ids);

  const { allowedInstanceIds } = req;

  const { items: tags, total } = await tagQueryBuilder.execute({
    userId,
    allowedInstanceIds,
    request,
    // Exclusions apply to every user, by id too; an admin's rows hold only their own hides.
    // Parent tags stay visible because the empty phase exempts tags with a child tag on the same instance.
    applyExclusions: true,
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

  // A detail page reads its tag's counts from the row, as its card shows
  // them; its tabs count through GET /tags/:id/counts
  // Add stashUrl to each tag; its parents and children come with the row,
  // as the viewer may see them
  const tagsWithStashUrl = tags.map((tag) => ({
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
};

/**
 * One page of tags for an entity picker, in name order: the name and aliases
 * matched in SQL, or the ids a picker has selected; with scope "allEnabled",
 * on every enabled server (admins only). A ValidationError (400) or
 * ForbiddenError (403) reaches the central error handler.
 */
export const findTagsMinimal = async (
  req: TypedLibraryRequest<FindTagsMinimalRequest>,
  res: TypedResponse<FindTagsMinimalResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const request = parseMinimalRequest("tag", req.body, { userId });

  const tags = await findMinimalEntities(
    req.user,
    request,
    req.allowedInstanceIds
  );
  res.json({ tags });
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
  req: TypedLibraryRequest<FindTagTreeRequest | undefined>,
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
    allowedInstanceIds: req.allowedInstanceIds,
    scope: parsed.data.scope,
  });
  res.json({ tags });
};

/** GET /api/library/tags/:id/counts: the tag page's tab counts */
export const getTagCounts = relationCountsHandler("tag");
