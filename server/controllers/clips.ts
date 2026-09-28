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
import type { TypedAuthRequest, TypedResponse } from "../types/api/express.js";
import { toLegacyClipFilter } from "../utils/legacyFilter.js";
import {
  logDropped,
  parseClipQuery,
  parseSceneClipsRequest,
  parseStashId,
} from "../utils/listRequest.js";
import { logger } from "../utils/logger.js";

/**
 * GET /api/clips
 * Browse clips with filtering
 */
export const getClips = async (
  req: TypedAuthRequest<never, Record<string, string>, GetClipsQuery>,
  res: TypedResponse<GetClipsResponse | ApiErrorResponse>
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseClipQuery(req.query, { userId: req.user.id });
  logDropped("GET /clips", request.dropped);

  try {
    const userId = req.user.id;
    const { page, perPage, specificInstanceId } = request;

    const result = await clipService.getClips(userId, {
      ...toLegacyClipFilter(request.filter),
      page,
      perPage,
      sortBy: request.sort.field,
      sortDir: request.sort.direction === "ASC" ? "asc" : "desc",
      q: request.q,
      randomSeed: request.sort.seed,
      allowedInstanceIds: specificInstanceId ? [specificInstanceId] : undefined,
    });

    res.json({
      clips: result.clips,
      total: result.total,
      page,
      perPage,
      totalPages: Math.ceil(result.total / perPage),
    });
  } catch (error) {
    logger.error("Failed to get clips", { error });
    res.status(500).json({ error: "Failed to get clips" });
  }
};

/**
 * GET /api/clips/:id
 * Get single clip
 */
export const getClipById = async (
  req: TypedAuthRequest<never, GetClipByIdParams>,
  res: TypedResponse<GetClipByIdResponse | ApiErrorResponse>
) => {
  // A ValidationError (400) reaches the central error handler
  const id = parseStashId(req.params.id, "id");

  try {
    const userId = req.user.id;

    const clip = await clipService.getClipById(id, userId);

    if (!clip) {
      res.status(404).json({ error: "Clip not found" });
      return;
    }

    res.json(clip);
  } catch (error) {
    logger.error("Failed to get clip", { error });
    res.status(500).json({ error: "Failed to get clip" });
  }
};

/**
 * GET /api/scenes/:id/clips
 * Get clips for a scene
 */
export const getClipsForScene = async (
  req: TypedAuthRequest<never, GetClipsForSceneParams, GetClipsForSceneQuery>,
  res: TypedResponse<GetClipsForSceneResponse | ApiErrorResponse>
) => {
  // A ValidationError (400) reaches the central error handler
  const request = parseSceneClipsRequest(req.params.id, req.query, {
    userId: req.user.id,
  });
  logDropped("GET /scenes/:id/clips", request.dropped);

  try {
    const userId = req.user.id;
    const { sceneId, includeUngenerated, specificInstanceId } = request;

    const clips = await clipService.getClipsForScene(
      sceneId,
      userId,
      includeUngenerated,
      specificInstanceId ? [specificInstanceId] : undefined
    );

    res.json({ clips });
  } catch (error) {
    logger.error("Failed to get clips for scene", { error });
    res.status(500).json({ error: "Failed to get clips" });
  }
};
