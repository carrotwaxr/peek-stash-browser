import prisma from "../prisma/singleton.js";
import { resolveAccessibleInstanceId } from "../services/EntityAccessService.js";
import type {
  ApiErrorResponse,
  GetImageViewHistoryParams,
  GetImageViewHistoryResponse,
  IncrementImageOCounterRequest,
  IncrementImageOCounterResponse,
  RecordImageViewRequest,
  RecordImageViewResponse,
  TypedAuthRequest,
  TypedResponse,
} from "../types/api/index.js";
import { dbWriteTransaction } from "../utils/dbWrite.js";
import { getEntityInstanceId } from "../utils/entityInstanceId.js";
import { readHistory } from "../utils/historyJson.js";
import { logger } from "../utils/logger.js";

/**
 * Increment O counter for an image
 */
export async function incrementImageOCounter(
  req: TypedAuthRequest<IncrementImageOCounterRequest>,
  res: TypedResponse<IncrementImageOCounterResponse | ApiErrorResponse>
) {
  try {
    const { imageId, instanceId: requestInstanceId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (!imageId) {
      res.status(400).json({ error: "Missing required field: imageId" });
      return;
    }

    if (
      requestInstanceId !== undefined &&
      (typeof requestInstanceId !== "string" || requestInstanceId === "")
    ) {
      res.status(400).json({ error: "instanceId must be a non-empty string" });
      return;
    }

    // Get user settings for syncToStash, and the image's instance if this
    // user can see it
    const [user, instanceId] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { syncToStash: true },
      }),
      resolveAccessibleInstanceId(userId, "image", imageId, requestInstanceId),
    ]);

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (!instanceId) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    const now = new Date();

    // Read, then create or update, in one transaction: a view or another O
    // press on this image waits for it to commit, then sees its row.
    const viewHistory = await dbWriteTransaction(
      "imageHistory.o",
      async (tx) => {
        const existing = await tx.imageViewHistory.findUnique({
          where: { userId_instanceId_imageId: { userId, instanceId, imageId } },
        });
        if (!existing) {
          return tx.imageViewHistory.create({
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
        }
        return tx.imageViewHistory.update({
          where: { id: existing.id },
          data: {
            oCount: { increment: 1 },
            oHistory: [...readHistory(existing.oHistory), now.toISOString()],
          },
        });
      }
    );

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
    const { imageId, instanceId: requestInstanceId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (!imageId) {
      res.status(400).json({ error: "Missing required field: imageId" });
      return;
    }

    if (
      requestInstanceId !== undefined &&
      (typeof requestInstanceId !== "string" || requestInstanceId === "")
    ) {
      res.status(400).json({ error: "instanceId must be a non-empty string" });
      return;
    }

    // The image's instance, if this user can see it
    const instanceId = await resolveAccessibleInstanceId(
      userId,
      "image",
      imageId,
      requestInstanceId
    );

    if (!instanceId) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    const now = new Date();

    // Read, then create or update, in one transaction: an O press or another
    // view of this image waits for it to commit, then sees its row.
    const viewHistory = await dbWriteTransaction(
      "imageHistory.view",
      async (tx) => {
        const existing = await tx.imageViewHistory.findUnique({
          where: { userId_instanceId_imageId: { userId, instanceId, imageId } },
        });
        if (!existing) {
          return tx.imageViewHistory.create({
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
        }
        return tx.imageViewHistory.update({
          where: { id: existing.id },
          data: {
            viewCount: { increment: 1 },
            viewHistory: [
              ...readHistory(existing.viewHistory),
              now.toISOString(),
            ],
            lastViewedAt: now,
          },
        });
      }
    );

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
    const requestInstanceId = req.query.instanceId;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "User not authenticated" });
      return;
    }

    if (!imageId) {
      res.status(400).json({ error: "Missing required parameter: imageId" });
      return;
    }

    // Get image instanceId (prefer frontend-provided, fall back to auto-lookup)
    const instanceId =
      requestInstanceId || (await getEntityInstanceId("image", imageId));

    const viewHistory = await prisma.imageViewHistory.findUnique({
      where: { userId_instanceId_imageId: { userId, instanceId, imageId } },
    });

    if (!viewHistory) {
      res.json({
        exists: false,
        viewCount: 0,
        oCount: 0,
      });
      return;
    }

    res.json({
      exists: true,
      viewCount: viewHistory.viewCount,
      viewHistory: readHistory(viewHistory.viewHistory),
      oCount: viewHistory.oCount,
      oHistory: readHistory(viewHistory.oHistory),
      lastViewedAt: viewHistory.lastViewedAt,
    });
  } catch (error) {
    logger.error("Error getting image view history", { error });
    res.status(500).json({ error: "Failed to get image view history" });
  }
}
