import { ValidationError } from "../middleware/errorHandler.js";
import { clipService } from "../services/ClipService.js";
import type {
  FindClipsRequest,
  FindClipsResponse,
  GetClipByIdParams,
  GetClipByIdResponse,
  GetClipsForSceneParams,
  GetClipsForSceneQuery,
  GetClipsForSceneResponse,
  GetClipsQuery,
  GetClipsResponse,
} from "../types/api/clips.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
} from "../types/api/common.js";
import type {
  TypedLibraryRequest,
  TypedResponse,
} from "../types/api/express.js";
import type { ListCount } from "../types/api/library.js";
import type { ClipListRequest } from "../types/parsedFilters.js";
import {
  parseClipQuery,
  parseFilterRef,
  parseListRequest,
  parseSceneClipsRequest,
} from "../utils/listRequest.js";
import { logger } from "../utils/logger.js";

/** One page of clips for the request, as both clip routes answer it */
async function clipPage(
  req: {
    user: { id: number };
    allowedInstanceIds: readonly string[];
    timeZone: string;
  },
  request: ClipListRequest
): Promise<GetClipsResponse<ListCount>> {
  const { page, perPage } = request;
  const result = await clipService.getClips({
    userId: req.user.id,
    allowedInstanceIds: req.allowedInstanceIds,
    timeZone: req.timeZone,
    request,
  });
  return {
    clips: result.clips,
    total: result.total,
    page,
    perPage,
    // count false: the page alone, the client keeps the total it holds
    totalPages:
      result.total === null ? null : Math.ceil(result.total / perPage),
  };
}

/**
 * POST /api/library/clips
 * Browse clips with the clip filter body (`clip_filter`), on the user's
 * instances (`clip_filter.instance_id` narrows them to one)
 */
export const findClips = async (
  req: TypedLibraryRequest<FindClipsRequest>,
  res: TypedResponse<FindClipsResponse<ListCount> | ApiErrorResponse>
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("clip", req.body, { userId: req.user.id });
  res.json(await clipPage(req, request));
};

/**
 * GET /api/clips
 * Browse clips with today's query parameters, kept for old links and
 * callers: each is read onto its `clip_filter` field (`parseClipQuery`),
 * on the user's instances (the `instanceId` parameter narrows them to one)
 */
export const getClips = async (
  req: TypedLibraryRequest<never, Record<string, string>, GetClipsQuery>,
  res: TypedResponse<GetClipsResponse<ListCount> | ApiErrorResponse>
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseClipQuery(req.query, { userId: req.user.id });
  res.json(await clipPage(req, request));
};

/**
 * GET /api/clips/:id
 * Get single clip, on the user's instances, with their exclusions. `:id` is
 * `id` or `id:instanceId`; a bare id held by several instances answers 400.
 */
export const getClipById = async (
  req: TypedLibraryRequest<never, GetClipByIdParams>,
  res: TypedResponse<
    GetClipByIdResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  const ref = parseFilterRef(req.params.id);
  if (!ref) {
    // A ValidationError (400) reaches the central error handler
    throw new ValidationError("Invalid request", {
      issues: [{ path: "id", message: "Expected an id or id:instanceId" }],
    });
  }

  const userId = req.user.id;
  const { allowedInstanceIds } = req;

  const clips = await clipService.getClipById({
    userId,
    allowedInstanceIds,
    ref,
  });

  const [clip] = clips;
  if (!clip) {
    res.status(404).json({ error: "Clip not found" });
    return;
  }

  if (clips.length > 1) {
    logger.warn("Ambiguous clip lookup", {
      id: ref.id,
      matchCount: clips.length,
      instances: clips.map((c) => c.instanceId),
    });
    res.status(400).json({
      error: "Ambiguous lookup",
      message: `Multiple clips found with ID ${ref.id}. Use id:instanceId.`,
      matches: clips.map((c) => ({
        id: c.id,
        title: c.title,
        instanceId: c.instanceId,
      })),
    });
    return;
  }

  res.json(clip);
};

/**
 * GET /api/scenes/:id/clips
 * Get clips for a scene: the scene on the required `instanceId` parameter's
 * instance
 */
export const getClipsForScene = async (
  req: TypedLibraryRequest<
    never,
    GetClipsForSceneParams,
    GetClipsForSceneQuery
  >,
  res: TypedResponse<GetClipsForSceneResponse | ApiErrorResponse>
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseSceneClipsRequest(req.params.id, req.query, {
    userId: req.user.id,
  });

  const userId = req.user.id;
  const { sceneId, includeUngenerated, instanceId } = request;
  const { allowedInstanceIds } = req;

  const clips = await clipService.getClipsForScene({
    userId,
    allowedInstanceIds,
    scene: { id: sceneId, instanceId },
    includeUngenerated,
  });

  res.json({ clips });
};
