import { clipService } from "../services/ClipService.js";
import { logger } from "../utils/logger.js";
import type { TypedAuthRequest, TypedResponse } from "../types/api/express.js";
import type { ApiErrorResponse } from "../types/api/common.js";
import type {
  GetClipsQuery,
  GetClipsResponse,
  GetClipByIdParams,
  GetClipByIdResponse,
  GetClipsForSceneParams,
  GetClipsForSceneQuery,
  GetClipsForSceneResponse,
} from "../types/api/clips.js";
import { parseRandomSort } from "../utils/seededRandom.js";

/**
 * GET /api/clips
 * Browse clips with filtering
 */
export const getClips = async (req: TypedAuthRequest<never, Record<string, string>, GetClipsQuery>, res: TypedResponse<GetClipsResponse | ApiErrorResponse>) => {
  try {
    const userId = req.user.id;
    const {
      page = "1",
      perPage = "24",
      sortBy: sortByRaw = "stashCreatedAt",
      sortDir = "desc",
      isGenerated = "true",
      sceneId,
      tagIds,
      sceneTagIds,
      performerIds,
      studioId,
      q,
      instanceId,
    } = req.query;

    // Parse random sort to extract seed for consistent pagination
    const { sortField: sortBy, randomSeed } = parseRandomSort(sortByRaw, userId);

    const result = await clipService.getClips(userId, {
      page: parseInt(page, 10),
      perPage: parseInt(perPage, 10),
      sortBy,
      sortDir: sortDir as "asc" | "desc",
      isGenerated: isGenerated === "true",
      sceneId,
      tagIds: tagIds ? tagIds.split(",") : undefined,
      sceneTagIds: sceneTagIds ? sceneTagIds.split(",") : undefined,
      performerIds: performerIds ? performerIds.split(",") : undefined,
      studioId,
      q,
      randomSeed,
      allowedInstanceIds: instanceId ? [instanceId] : undefined,
    });

    res.json({
      clips: result.clips,
      total: result.total,
      page: parseInt(page, 10),
      perPage: parseInt(perPage, 10),
      totalPages: Math.ceil(result.total / parseInt(perPage, 10)),
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
export const getClipById = async (req: TypedAuthRequest<never, GetClipByIdParams>, res: TypedResponse<GetClipByIdResponse | ApiErrorResponse>) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const clip = await clipService.getClipById(id, userId);

    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
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
export const getClipsForScene = async (req: TypedAuthRequest<never, GetClipsForSceneParams, GetClipsForSceneQuery>, res: TypedResponse<GetClipsForSceneResponse | ApiErrorResponse>) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { includeUngenerated = "false", instanceId } = req.query;

    const clips = await clipService.getClipsForScene(
      id,
      userId,
      includeUngenerated === "true",
      instanceId ? [instanceId] : undefined
    );

    res.json({ clips });
  } catch (error) {
    logger.error("Failed to get clips for scene", { error });
    res.status(500).json({ error: "Failed to get clips" });
  }
};
