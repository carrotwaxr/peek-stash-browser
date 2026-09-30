import { ValidationError } from "../middleware/errorHandler.js";
import { clipService } from "../services/ClipService.js";
import type {
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
import {
  parseClipQuery,
  parseFilterRef,
  parseSceneClipsRequest,
} from "../utils/listRequest.js";
import { logger } from "../utils/logger.js";

/**
 * GET /api/clips
 * Browse clips with filtering, on the user's instances (the `instanceId`
 * parameter narrows them to one)
 */
export const getClips = async (
  req: TypedLibraryRequest<never, Record<string, string>, GetClipsQuery>,
  res: TypedResponse<GetClipsResponse | ApiErrorResponse>
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseClipQuery(req.query, { userId: req.user.id });

  const userId = req.user.id;
  const { page, perPage } = request;
  const { allowedInstanceIds } = req;

  const result = await clipService.getClips({
    userId,
    allowedInstanceIds,
    request,
  });

  res.json({
    clips: result.clips,
    total: result.total,
    page,
    perPage,
    totalPages: Math.ceil(result.total / perPage),
  });
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
