import { Request, Response } from "express";
import { clipService } from "../services/ClipService.js";
import { logger } from "../utils/logger.js";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { parseRandomSort } from "../utils/seededRandom.js";

/**
 * GET /api/clips
 * Browse clips with filtering
 */
export const getClips = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
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
    const { sortField: sortBy, randomSeed } = parseRandomSort(sortByRaw as string, userId);

    const result = await clipService.getClips(userId, {
      page: parseInt(page as string, 10),
      perPage: parseInt(perPage as string, 10),
      sortBy,
      sortDir: sortDir as "asc" | "desc",
      isGenerated: isGenerated === "true",
      sceneId: sceneId as string | undefined,
      tagIds: tagIds ? (tagIds as string).split(",") : undefined,
      sceneTagIds: sceneTagIds ? (sceneTagIds as string).split(",") : undefined,
      performerIds: performerIds
        ? (performerIds as string).split(",")
        : undefined,
      studioId: studioId as string | undefined,
      q: q as string | undefined,
      randomSeed,
      allowedInstanceIds: instanceId ? [instanceId as string] : undefined,
    });

    res.json({
      clips: result.clips,
      total: result.total,
      page: parseInt(page as string, 10),
      perPage: parseInt(perPage as string, 10),
      totalPages: Math.ceil(result.total / parseInt(perPage as string, 10)),
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
export const getClipById = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
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
export const getClipsForScene = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { id } = req.params;
    const { includeUngenerated = "false", instanceId } = req.query;

    const clips = await clipService.getClipsForScene(
      id,
      userId,
      includeUngenerated === "true",
      instanceId ? [instanceId as string] : undefined
    );

    res.json({ clips });
  } catch (error) {
    logger.error("Failed to get clips for scene", { error });
    res.status(500).json({ error: "Failed to get clips" });
  }
};
