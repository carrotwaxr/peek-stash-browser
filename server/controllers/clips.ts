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
import type { ApiErrorResponse } from "../types/api/common.js";
import type {
  TypedLibraryRequest,
  TypedResponse,
} from "../types/api/express.js";
import {
  parseClipQuery,
  parseSceneClipsRequest,
  parseStashId,
} from "../utils/listRequest.js";

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
 * Get single clip, on the user's instances, with their exclusions
 */
export const getClipById = async (
  req: TypedLibraryRequest<never, GetClipByIdParams>,
  res: TypedResponse<GetClipByIdResponse | ApiErrorResponse>
) => {
  // A ValidationError (400) reaches the central error handler
  const id = parseStashId(req.params.id, "id");

  const userId = req.user.id;
  const { allowedInstanceIds } = req;

  const clip = await clipService.getClipById({
    userId,
    allowedInstanceIds,
    id,
  });

  if (!clip) {
    res.status(404).json({ error: "Clip not found" });
    return;
  }

  res.json(clip);
};

/**
 * GET /api/scenes/:id/clips
 * Get clips for a scene: the scene on the `instanceId` parameter's instance,
 * else its id on every instance the user sees
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
  const { sceneId, includeUngenerated, specificInstanceId } = request;
  const { allowedInstanceIds } = req;

  const clips = await clipService.getClipsForScene({
    userId,
    allowedInstanceIds,
    scene: { id: sceneId, instanceId: specificInstanceId },
    includeUngenerated,
  });

  res.json({ clips });
};
