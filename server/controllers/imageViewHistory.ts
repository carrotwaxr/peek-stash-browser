import prisma from "../prisma/singleton.js";
import type {
  TypedAuthRequest,
  TypedResponse,
  ApiErrorResponse,
  IncrementImageOCounterRequest,
  IncrementImageOCounterResponse,
  RecordImageViewRequest,
  RecordImageViewResponse,
  GetImageViewHistoryParams,
  GetImageViewHistoryResponse,
} from "../types/api/index.js";
import { logger } from "../utils/logger.js";
import { getEntityInstanceId } from "../utils/entityInstanceId.js";

/**
 * Increment O counter for an image
 */
export async function incrementImageOCounter(
  req: TypedAuthRequest<IncrementImageOCounterRequest>,
  res: TypedResponse<IncrementImageOCounterResponse | ApiErrorResponse>
) {
  try {
    const { imageId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not found" });
    }

    if (!imageId) {
      return res.status(400).json({ error: "Missing required field: imageId" });
    }

    // Get user settings for syncToStash and image instanceId
    const [user, instanceId] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { syncToStash: true },
      }),
      getEntityInstanceId('image', imageId),
    ]);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const now = new Date();

    // Get or create image view history record
    let viewHistory = await prisma.imageViewHistory.findUnique({
      where: { userId_instanceId_imageId: { userId, instanceId, imageId } },
    });

    if (!viewHistory) {
      viewHistory = await prisma.imageViewHistory.create({
        data: {
          userId,
          instanceId,
          imageId,
          viewCount: 0,
          viewHistory: [],
          oCount: 1,
          oHistory: [now.toISOString()],
          lastViewedAt: now,
        },
      });
    } else {
      const oHistory = Array.isArray(viewHistory.oHistory)
        ? viewHistory.oHistory
        : JSON.parse((viewHistory.oHistory as string) || "[]");

      viewHistory = await prisma.imageViewHistory.update({
        where: { id: viewHistory.id },
        data: {
          oCount: viewHistory.oCount + 1,
          oHistory: JSON.stringify([...oHistory, now.toISOString()]),
        },
      });
    }

    // Sync to Stash if user has sync enabled
    // Note: imageIncrementO is not yet in stashapp-api, so we log a warning for now
    // TODO: Add imageIncrementO to stashapp-api and enable sync
    if (user.syncToStash) {
      logger.warn("Image O counter sync to Stash not yet implemented", {
        imageId,
        peekUserCount: viewHistory.oCount,
      });
    }

    res.json({
      success: true,
      oCount: viewHistory.oCount,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error("Error incrementing image O counter", { error });
    res.status(500).json({ error: "Failed to increment image O counter" });
  }
}

/**
 * Record image view (when opened in Lightbox)
 */
export async function recordImageView(
  req: TypedAuthRequest<RecordImageViewRequest>,
  res: TypedResponse<RecordImageViewResponse | ApiErrorResponse>
) {
  try {
    const { imageId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not found" });
    }

    if (!imageId) {
      return res.status(400).json({ error: "Missing required field: imageId" });
    }

    // Get image instanceId
    const instanceId = await getEntityInstanceId('image', imageId);

    const now = new Date();

    // Get or create image view history record
    let viewHistory = await prisma.imageViewHistory.findUnique({
      where: { userId_instanceId_imageId: { userId, instanceId, imageId } },
    });

    if (!viewHistory) {
      viewHistory = await prisma.imageViewHistory.create({
        data: {
          userId,
          instanceId,
          imageId,
          viewCount: 1,
          viewHistory: [now.toISOString()],
          oCount: 0,
          oHistory: [],
          lastViewedAt: now,
        },
      });
    } else {
      const existingViewHistory = Array.isArray(viewHistory.viewHistory)
        ? viewHistory.viewHistory
        : JSON.parse((viewHistory.viewHistory as string) || "[]");

      viewHistory = await prisma.imageViewHistory.update({
        where: { id: viewHistory.id },
        data: {
          viewCount: viewHistory.viewCount + 1,
          viewHistory: JSON.stringify([...existingViewHistory, now.toISOString()]),
          lastViewedAt: now,
        },
      });
    }

    res.json({
      success: true,
      viewCount: viewHistory.viewCount,
      lastViewedAt: viewHistory.lastViewedAt,
    });
  } catch (error) {
    logger.error("Error recording image view", { error });
    res.status(500).json({ error: "Failed to record image view" });
  }
}

/**
 * Get image view history for a specific image
 */
export async function getImageViewHistory(
  req: TypedAuthRequest<unknown, GetImageViewHistoryParams>,
  res: TypedResponse<GetImageViewHistoryResponse | ApiErrorResponse>
) {
  try {
    const { imageId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!imageId) {
      return res.status(400).json({ error: "Missing required parameter: imageId" });
    }

    // Get image instanceId
    const instanceId = await getEntityInstanceId('image', imageId);

    const viewHistory = await prisma.imageViewHistory.findUnique({
      where: { userId_instanceId_imageId: { userId, instanceId, imageId } },
    });

    if (!viewHistory) {
      return res.json({
        exists: false,
        viewCount: 0,
        oCount: 0,
      });
    }

    res.json({
      exists: true,
      viewCount: viewHistory.viewCount,
      viewHistory: Array.isArray(viewHistory.viewHistory)
        ? viewHistory.viewHistory
        : JSON.parse((viewHistory.viewHistory as string) || "[]"),
      oCount: viewHistory.oCount,
      oHistory: Array.isArray(viewHistory.oHistory)
        ? viewHistory.oHistory
        : JSON.parse((viewHistory.oHistory as string) || "[]"),
      lastViewedAt: viewHistory.lastViewedAt,
    });
  } catch (error) {
    logger.error("Error getting image view history", { error });
    res.status(500).json({ error: "Failed to get image view history" });
  }
}
