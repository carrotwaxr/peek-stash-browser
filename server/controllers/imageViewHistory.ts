import prisma from "../prisma/singleton.js";
import { resolveAccessibleInstanceId } from "../services/EntityAccessService.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import type {
  ApiErrorResponse,
  DecrementImageOCounterRequest,
  DecrementImageOCounterResponse,
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
import { readHistory, withoutNewest } from "../utils/historyJson.js";
import { logger } from "../utils/logger.js";
import { requireInstanceId } from "../utils/routeHelpers.js";
import { INSTANCE_ID_PATTERN } from "../utils/stashMediaPath.js";

/**
 * Increment O counter for an image
 */
export async function incrementImageOCounter(
  req: TypedAuthRequest<IncrementImageOCounterRequest>,
  res: TypedResponse<IncrementImageOCounterResponse | ApiErrorResponse>
) {
  const { imageId, instanceId: requestInstanceId } = req.body;
  const userId = req.user.id;

  if (!imageId) {
    res.status(400).json({ error: "Missing required field: imageId" });
    return;
  }

  if (!requireInstanceId(requestInstanceId, res)) return;

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
  const viewHistory = await dbWriteTransaction("imageHistory.o", async (tx) => {
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
  });

  // Sync to Stash if user has sync enabled
  if (user.syncToStash) {
    try {
      const stash = stashInstanceManager.getForSync(instanceId);
      if (stash) {
        const result = await stash.imageIncrementO({ id: imageId });
        logger.info("Synced image O counter increment to Stash", {
          imageId,
          stashGlobalCount: result.imageIncrementO,
          peekUserCount: viewHistory.oCount,
        });
      }
    } catch (stashError) {
      // Don't fail the request if Stash sync fails - Peek DB is source of truth
      logger.error("Failed to sync image O counter increment to Stash", {
        imageId,
        error: stashError,
      });
    }
  }

  res.json({
    success: true,
    oCount: viewHistory.oCount,
    timestamp: now.toISOString(),
  });
}

/**
 * Remove the user's newest O on an image ("Remove last O"): its time comes
 * off oHistory and oCount drops by 1, in one unit. A row whose oCount is
 * above 0 with no O times still loses 1. At 0 Os nothing is written and
 * Stash is not called.
 */
export async function decrementImageOCounter(
  req: TypedAuthRequest<DecrementImageOCounterRequest>,
  res: TypedResponse<DecrementImageOCounterResponse | ApiErrorResponse>
) {
  const { imageId, instanceId: requestInstanceId } = req.body;
  const userId = req.user.id;

  if (!imageId) {
    res.status(400).json({ error: "Missing required field: imageId" });
    return;
  }

  if (!requireInstanceId(requestInstanceId, res)) return;

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

  const where = {
    userId_instanceId_imageId: { userId, instanceId, imageId },
  };
  const current = await prisma.imageViewHistory.findUnique({ where });
  if (!current || current.oCount <= 0) {
    res.json({ success: true, oCount: 0 });
    return;
  }

  // Read again inside the unit: a removal queued ahead of this one may have
  // taken the last O, and then this one writes nothing.
  const { oCount, removed } = await dbWriteTransaction(
    "imageHistory.oRemove",
    async (tx) => {
      const existing = await tx.imageViewHistory.findUnique({ where });
      if (!existing || existing.oCount <= 0) {
        return { oCount: 0, removed: false };
      }
      const row = await tx.imageViewHistory.update({
        where: { id: existing.id },
        data: {
          oCount: { decrement: 1 },
          oHistory: withoutNewest(readHistory(existing.oHistory)),
        },
      });
      return { oCount: row.oCount, removed: true };
    }
  );

  if (removed && user.syncToStash) {
    try {
      const stash = stashInstanceManager.getForSync(instanceId);
      if (stash) {
        const result = await stash.imageDecrementO({ id: imageId });
        logger.info("Removed the last image O in Stash", {
          imageId,
          stashGlobalCount: result.imageDecrementO,
          peekUserCount: oCount,
        });
      }
    } catch (stashError) {
      // Don't fail the request if Stash sync fails - Peek DB is source of truth
      logger.error("Failed to sync image O counter removal to Stash", {
        imageId,
        error: stashError,
      });
    }
  }

  res.json({ success: true, oCount });
}

/**
 * Record image view (when opened in Lightbox)
 */
export async function recordImageView(
  req: TypedAuthRequest<RecordImageViewRequest>,
  res: TypedResponse<RecordImageViewResponse | ApiErrorResponse>
) {
  const { imageId, instanceId: requestInstanceId } = req.body;
  const userId = req.user.id;

  if (!imageId) {
    res.status(400).json({ error: "Missing required field: imageId" });
    return;
  }

  if (!requireInstanceId(requestInstanceId, res)) return;

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
}

/**
 * Get image view history for a specific image
 */
export async function getImageViewHistory(
  req: TypedAuthRequest<unknown, GetImageViewHistoryParams>,
  res: TypedResponse<GetImageViewHistoryResponse | ApiErrorResponse>
) {
  const { imageId } = req.params;
  const requestInstanceId = req.query.instanceId;
  const userId = req.user.id;

  if (!imageId) {
    res.status(400).json({ error: "Missing required parameter: imageId" });
    return;
  }

  if (
    typeof requestInstanceId !== "string" ||
    !INSTANCE_ID_PATTERN.test(requestInstanceId)
  ) {
    res.status(400).json({ error: "instanceId is required" });
    return;
  }
  const instanceId = requestInstanceId;

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
}
