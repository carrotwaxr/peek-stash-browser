import { WatchHistory } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import type {
  TypedAuthRequest,
  TypedResponse,
  ApiErrorResponse,
  PingWatchHistoryRequest,
  PingWatchHistoryResponse,
  SaveActivityRequest,
  SaveActivityResponse,
  IncrementPlayCountRequest,
  IncrementPlayCountResponse,
  IncrementOCounterRequest,
  IncrementOCounterResponse,
  GetAllWatchHistoryQuery,
  GetAllWatchHistoryResponse,
  GetWatchHistoryParams,
  GetWatchHistoryResponse,
  ClearAllWatchHistoryResponse,
} from "../types/api/index.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import { userStatsService } from "../services/UserStatsService.js";
import { logger } from "../utils/logger.js";

// Session tracking: prevent duplicate play_count increments per viewing session
// Key format: "userId:sceneId"
const sessionPlayCountIncrements = new Map<string, boolean>();

function getSessionKey(userId: number, sceneId: string): string {
  return `${userId}:${sceneId}`;
}

/**
 * Update watch history with periodic ping from video player
 * Tracks playback progress matching Stash's pattern with per-user tracking
 */
export async function pingWatchHistory(
  req: TypedAuthRequest<PingWatchHistoryRequest>,
  res: TypedResponse<PingWatchHistoryResponse | ApiErrorResponse>
) {
  try {
    const { sceneId, currentTime, quality, sessionStart, seekEvents } =
      req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not found" });
    }

    if (!sceneId || typeof currentTime !== "number") {
      return res
        .status(400)
        .json({ error: "Missing required fields: sceneId, currentTime" });
    }

    logger.info("Watch history ping", {
      userId,
      sceneId,
      currentTime: currentTime.toFixed(2),
      quality,
    });

    // Get user settings for minimumPlayPercent and syncToStash
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { minimumPlayPercent: true, syncToStash: true },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Get scene duration from cache
    let sceneDuration = 0;
    try {
      const scene = await prisma.stashScene.findUnique({
        where: { id: sceneId },
        select: { duration: true },
      });
      sceneDuration = scene?.duration || 0;
    } catch (error) {
      logger.error("Failed to fetch scene duration from cache", {
        sceneId,
        error,
      });
      // Continue without duration - won't be able to calculate percentages
    }

    // Get or create watch history record
    let watchHistory = await prisma.watchHistory.findUnique({
      where: { userId_sceneId: { userId, sceneId } },
    });

    const now = new Date();

    if (!watchHistory) {
      // Create new watch history record
      watchHistory = await prisma.watchHistory.create({
        data: {
          userId,
          sceneId,
          playCount: 0,
          playDuration: 0,
          resumeTime: currentTime,
          lastPlayedAt: now,
          oCount: 0,
          oHistory: [],
          playHistory: [],
        },
      });
    }

    // Calculate actual playback duration delta
    let playbackDelta = 0;

    if (sessionStart) {
      const sessionStartTime = new Date(sessionStart);

      // Detect if this is a new session vs continuing an existing session
      // If lastPlayedAt is >2 minutes before sessionStart, treat as new session
      const SESSION_BOUNDARY_SECONDS = 120;
      let lastPingTime = sessionStartTime;

      if (watchHistory.lastPlayedAt) {
        const timeSinceLastPlayed =
          (sessionStartTime.getTime() - watchHistory.lastPlayedAt.getTime()) /
          1000;

        if (timeSinceLastPlayed <= SESSION_BOUNDARY_SECONDS) {
          // Continuing recent session, use lastPlayedAt
          lastPingTime = watchHistory.lastPlayedAt;
        } else {
          // New session after significant gap, use sessionStart
          logger.info("New viewing session detected", {
            userId,
            sceneId,
            timeSinceLastPlayed: timeSinceLastPlayed.toFixed(2),
            usingSessionStart: true,
          });
        }
      }

      const timeSinceLastPing = (now.getTime() - lastPingTime.getTime()) / 1000;

      // Start with the time delta
      playbackDelta = timeSinceLastPing;

      // Subtract seek distances from the delta
      if (seekEvents && Array.isArray(seekEvents) && seekEvents.length > 0) {
        let totalSeekDistance = 0;
        for (const seek of seekEvents) {
          const distance = Math.abs(seek.to - seek.from);
          totalSeekDistance += distance;
        }

        // Don't let seek distance exceed the time delta (prevent negative values)
        playbackDelta = Math.max(0, timeSinceLastPing - totalSeekDistance);

        logger.info("Adjusted playback delta for seeks", {
          userId,
          sceneId,
          timeSinceLastPing: timeSinceLastPing.toFixed(2),
          totalSeekDistance: totalSeekDistance.toFixed(2),
          playbackDelta: playbackDelta.toFixed(2),
        });
      }

      // Cap playback delta to reasonable maximum (60 seconds)
      // Pings happen every ~10 seconds, so >60s indicates tab was backgrounded/sleeping
      const MAX_PING_DELTA = 60;
      if (playbackDelta > MAX_PING_DELTA) {
        logger.warn("Capping excessive playback delta", {
          userId,
          sceneId,
          originalDelta: playbackDelta.toFixed(2),
          cappedDelta: MAX_PING_DELTA,
          timeSinceLastPing: timeSinceLastPing.toFixed(2),
        });
        playbackDelta = MAX_PING_DELTA;
      }
    }

    // Calculate new total play duration
    const newPlayDuration = watchHistory.playDuration + playbackDelta;

    // Calculate percentages (Stash's pattern)
    const percentPlayed =
      sceneDuration > 0 ? (newPlayDuration / sceneDuration) * 100 : 0;
    const percentCompleted =
      sceneDuration > 0 ? (currentTime / sceneDuration) * 100 : 0;

    // Session tracking: check if we've already incremented play_count for this session
    const sessionKey = getSessionKey(userId, sceneId);
    const hasIncrementedThisSession =
      sessionPlayCountIncrements.get(sessionKey) || false;

    // Increment play count ONCE per session when threshold is met
    let newPlayCount = watchHistory.playCount;
    let playCountIncremented = false;
    const playHistoryArray = Array.isArray(watchHistory.playHistory)
      ? watchHistory.playHistory
      : JSON.parse((watchHistory.playHistory as string) || "[]");

    if (
      !hasIncrementedThisSession &&
      percentPlayed >= user.minimumPlayPercent
    ) {
      newPlayCount++;
      playCountIncremented = true;
      sessionPlayCountIncrements.set(sessionKey, true);

      // Append timestamp to play history (Stash's pattern)
      playHistoryArray.push(now.toISOString());

      logger.info("Play count incremented (percentage threshold met)", {
        userId,
        sceneId,
        newPlayCount,
        percentPlayed: percentPlayed.toFixed(2),
        threshold: user.minimumPlayPercent,
      });
    }

    // Reset resume_time to 0 when video is 98%+ complete (Stash's pattern)
    const resumeTime = percentCompleted >= 98 ? 0 : currentTime;

    // Update watch history in Peek database
    const updated = await prisma.watchHistory.update({
      where: { id: watchHistory.id },
      data: {
        resumeTime,
        lastPlayedAt: now,
        playCount: newPlayCount,
        playDuration: newPlayDuration,
        playHistory: JSON.stringify(playHistoryArray),
      },
    });

    // Update pre-computed stats if playCount was incremented
    if (playCountIncremented) {
      // Increment playCount for all entities in this scene (performers, studio, tags)
      await userStatsService.updateStatsForScene(
        userId,
        sceneId,
        0, // oCountDelta (not changed in ping)
        1, // playCountDelta (increased by 1)
        now, // lastPlayedAt
        undefined // lastOAt (not changed)
      );
    }

    // Sync to Stash if user has sync enabled
    if (user.syncToStash) {
      try {
        const stash = stashInstanceManager.getDefault();
        // Save activity (resume time and play duration) on every ping
        await stash.sceneSaveActivity({
          id: sceneId,
          resume_time: resumeTime,
          playDuration: playbackDelta,
        });

        // Add play history timestamp if play_count was incremented
        if (playCountIncremented) {
          const addPlayResult = await stash.sceneAddPlay({
            id: sceneId,
            times: [now.toISOString()],
          });

          logger.info("Added play timestamp to Stash", {
            userId,
            sceneId,
            stashPlayCount: addPlayResult.sceneAddPlay.count,
            stashPlayHistory: addPlayResult.sceneAddPlay.history,
            peekPlayCount: newPlayCount,
          });
        }

        logger.info("Synced activity to Stash", {
          userId,
          sceneId,
          resumeTime,
          playbackDelta,
          playCountIncremented,
        });
      } catch (stashError) {
        // Don't fail the request if Stash sync fails - Peek DB is source of truth
        logger.error("Failed to sync activity to Stash", {
          sceneId,
          error: stashError,
        });
      }
    }

    res.json({
      success: true,
      watchHistory: {
        playCount: updated.playCount,
        playDuration: updated.playDuration,
        resumeTime: updated.resumeTime,
        lastPlayedAt: updated.lastPlayedAt,
      },
    });
  } catch (error) {
    logger.error("Error updating watch history", { error });
    res.status(500).json({ error: "Failed to update watch history" });
  }
}

/**
 * Increment O counter for a scene
 */
export async function incrementOCounter(
  req: TypedAuthRequest<IncrementOCounterRequest>,
  res: TypedResponse<IncrementOCounterResponse | ApiErrorResponse>
) {
  try {
    const { sceneId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not found" });
    }

    if (!sceneId) {
      return res.status(400).json({ error: "Missing required field: sceneId" });
    }

    // Get user settings for syncToStash
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { syncToStash: true },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Get or create watch history record
    let watchHistory = await prisma.watchHistory.findUnique({
      where: { userId_sceneId: { userId, sceneId } },
    });

    const now = new Date();

    // Track if this is a new record to prevent double-counting stats
    const isNewRecord = !watchHistory;

    if (!watchHistory) {
      // Create new watch history record
      watchHistory = await prisma.watchHistory.create({
        data: {
          userId,
          sceneId,
          playCount: 0,
          playDuration: 0,
          oCount: 1,
          oHistory: [now.toISOString()],
          playHistory: [],
          lastPlayedAt: now,
        },
      });
    } else {
      // Parse existing O history
      const oHistory = Array.isArray(watchHistory.oHistory)
        ? watchHistory.oHistory
        : JSON.parse((watchHistory.oHistory as string) || "[]");

      // Update with incremented O counter
      watchHistory = await prisma.watchHistory.update({
        where: { id: watchHistory.id },
        data: {
          oCount: watchHistory.oCount + 1,
          oHistory: JSON.stringify([...oHistory, now.toISOString()]),
        },
      });

      // Update pre-computed stats for existing records
      await userStatsService.updateStatsForScene(
        userId,
        sceneId,
        1, // oCountDelta (increased by 1)
        0, // playCountDelta (not changed)
        undefined, // lastPlayedAt (not changed)
        now // lastOAt
      );
    }

    // Update pre-computed stats for new records ONLY
    // (prevents double-counting when existing record has playCount=0 and gets oCount incremented to 1)
    if (isNewRecord) {
      await userStatsService.updateStatsForScene(
        userId,
        sceneId,
        1, // oCountDelta
        0, // playCountDelta
        undefined, // lastPlayedAt (set above during create)
        now // lastOAt
      );
    }

    // Sync to Stash if user has sync enabled
    if (user.syncToStash) {
      try {
        logger.info("Syncing O counter increment to Stash", { sceneId });
        const stash = stashInstanceManager.getDefault();
        const result = await stash.sceneIncrementO({ id: sceneId });
        logger.info("Successfully incremented O counter in Stash", {
          sceneId,
          stashGlobalCount: result.sceneIncrementO,
          peekUserCount: watchHistory.oCount,
        });
      } catch (stashError) {
        // Don't fail the request if Stash sync fails - Peek DB is source of truth
        logger.error("Failed to sync O counter increment to Stash", {
          sceneId,
          error: stashError,
          errorMessage: (stashError as Error).message,
          errorStack: (stashError as Error).stack,
        });
      }
    }

    // Always return the user's personal Peek count (not Stash's global count)
    res.json({
      success: true,
      oCount: watchHistory.oCount,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error("Error incrementing O counter", { error });
    res.status(500).json({ error: "Failed to increment O counter" });
  }
}

/**
 * Get watch history for a specific scene
 */
export async function getWatchHistory(
  req: TypedAuthRequest<unknown, GetWatchHistoryParams>,
  res: TypedResponse<GetWatchHistoryResponse | ApiErrorResponse>
) {
  try {
    const { sceneId } = req.params;
    const userId = req.user?.id;

    if (!sceneId) {
      return res
        .status(400)
        .json({ error: "Missing required parameter: sceneId" });
    }

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const watchHistory = await prisma.watchHistory.findUnique({
      where: { userId_sceneId: { userId, sceneId } },
    });

    if (!watchHistory) {
      return res.json({
        exists: false,
        resumeTime: null,
        playCount: 0,
        oCount: 0,
      });
    }

    // Parse JSON fields
    const oHistory = Array.isArray(watchHistory.oHistory)
      ? watchHistory.oHistory
      : JSON.parse((watchHistory.oHistory as string) || "[]");

    const playHistory = Array.isArray(watchHistory.playHistory)
      ? watchHistory.playHistory
      : JSON.parse((watchHistory.playHistory as string) || "[]");

    res.json({
      exists: true,
      resumeTime: watchHistory.resumeTime,
      playCount: watchHistory.playCount,
      playDuration: watchHistory.playDuration,
      lastPlayedAt: watchHistory.lastPlayedAt,
      oCount: watchHistory.oCount,
      oHistory,
      playHistory,
    });
  } catch (error) {
    logger.error("Error getting watch history", { error });
    logger.error("Error details", {
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ error: "Failed to get watch history" });
  }
}

/**
 * Get all watch history for current user (for Continue Watching carousel)
 */
export async function getAllWatchHistory(
  req: TypedAuthRequest<unknown, Record<string, string>, GetAllWatchHistoryQuery>,
  res: TypedResponse<GetAllWatchHistoryResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const onlyInProgress = req.query.inProgress === "true";

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    let where: { userId: number; resumeTime?: { not: null } } = { userId };

    if (onlyInProgress) {
      // Only return scenes with resume time (partially watched)
      where.resumeTime = { not: null };
    }

    const watchHistory = await prisma.watchHistory.findMany({
      where,
      orderBy: { lastPlayedAt: "desc" },
      take: limit,
    });

    // Parse JSON fields for each record
    const parsed = watchHistory.map((record: WatchHistory) => ({
      ...record,
      oHistory: Array.isArray(record.oHistory)
        ? record.oHistory
        : JSON.parse((record.oHistory as string) || "[]"),
      playHistory: Array.isArray(record.playHistory)
        ? record.playHistory
        : JSON.parse((record.playHistory as string) || "[]"),
    }));

    res.json({ watchHistory: parsed });
  } catch (error) {
    logger.error("Error getting all watch history", { error });
    res.status(500).json({ error: "Failed to get watch history" });
  }
}

/**
 * Clear all watch history for current user
 * Also clears all pre-computed stats (performers, studios, tags)
 * This includes O counters, play counts, and all viewing statistics
 */
export async function clearAllWatchHistory(
  req: TypedAuthRequest,
  res: TypedResponse<ClearAllWatchHistoryResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    logger.info("Clearing all watch history and stats", { userId });

    // Delete watch history, all related stats, and rankings in parallel
    const [
      watchHistoryResult,
      performerStatsResult,
      studioStatsResult,
      tagStatsResult,
      rankingsResult,
    ] = await Promise.all([
      prisma.watchHistory.deleteMany({ where: { userId } }),
      prisma.userPerformerStats.deleteMany({ where: { userId } }),
      prisma.userStudioStats.deleteMany({ where: { userId } }),
      prisma.userTagStats.deleteMany({ where: { userId } }),
      prisma.userEntityRanking.deleteMany({ where: { userId } }),
    ]);

    logger.info("Watch history and stats cleared", {
      userId,
      watchHistoryDeleted: watchHistoryResult.count,
      performerStatsDeleted: performerStatsResult.count,
      studioStatsDeleted: studioStatsResult.count,
      tagStatsDeleted: tagStatsResult.count,
      rankingsDeleted: rankingsResult.count,
    });

    res.json({
      success: true,
      deletedCounts: {
        watchHistory: watchHistoryResult.count,
        performerStats: performerStatsResult.count,
        studioStats: studioStatsResult.count,
        tagStats: tagStatsResult.count,
        rankings: rankingsResult.count,
      },
      message: `Cleared ${watchHistoryResult.count} watch history records and all associated statistics`,
    });
  } catch (error) {
    logger.error("Error clearing watch history", { error });
    res.status(500).json({ error: "Failed to clear watch history" });
  }
}

/**
 * Save activity (resume time and play duration delta)
 * Simplified endpoint matching Stash's pattern - called by track-activity plugin
 */
export async function saveActivity(
  req: TypedAuthRequest<SaveActivityRequest>,
  res: TypedResponse<SaveActivityResponse | ApiErrorResponse>
) {
  try {
    const { sceneId, resumeTime, playDuration } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not found" });
    }

    if (!sceneId) {
      return res.status(400).json({ error: "Missing required field: sceneId" });
    }

    logger.info("Save activity", {
      userId,
      sceneId,
      resumeTime: resumeTime?.toFixed(2),
      playDuration: playDuration?.toFixed(2),
    });

    // Get user settings for syncToStash
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { syncToStash: true },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const now = new Date();

    // Use upsert to avoid race condition between concurrent saveActivity and incrementPlayCount calls
    const watchHistory = await prisma.watchHistory.upsert({
      where: { userId_sceneId: { userId, sceneId } },
      create: {
        userId,
        sceneId,
        playCount: 0,
        playDuration: playDuration || 0,
        resumeTime: resumeTime || 0,
        lastPlayedAt: now,
        oCount: 0,
        oHistory: [],
        playHistory: [],
      },
      update: {
        resumeTime: resumeTime,
        playDuration: { increment: playDuration || 0 },
        lastPlayedAt: now,
      },
    });

    // Sync to Stash if user has sync enabled
    if (user.syncToStash && playDuration) {
      try {
        const stash = stashInstanceManager.getDefault();
        await stash.sceneSaveActivity({
          id: sceneId,
          resume_time: resumeTime,
          playDuration: playDuration,
        });

        logger.info("Synced activity to Stash", {
          userId,
          sceneId,
          resumeTime,
          playDuration,
        });
      } catch (stashError) {
        logger.error("Failed to sync activity to Stash", {
          sceneId,
          error: stashError,
        });
      }
    }

    res.json({
      success: true,
      watchHistory: {
        playCount: watchHistory.playCount,
        playDuration: watchHistory.playDuration,
        resumeTime: watchHistory.resumeTime,
        lastPlayedAt: watchHistory.lastPlayedAt,
      },
    });
  } catch (error) {
    logger.error("Error saving activity", { error });
    res.status(500).json({ error: "Failed to save activity" });
  }
}

/**
 * Increment play count for a scene
 * Called by track-activity plugin when minimum play percentage is reached
 */
export async function incrementPlayCount(
  req: TypedAuthRequest<IncrementPlayCountRequest>,
  res: TypedResponse<IncrementPlayCountResponse | ApiErrorResponse>
) {
  try {
    const { sceneId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not found" });
    }

    if (!sceneId) {
      return res.status(400).json({ error: "Missing required field: sceneId" });
    }

    logger.info("Increment play count", { userId, sceneId });

    // Get user settings for syncToStash
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { syncToStash: true },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const now = new Date();

    // First, get existing record to build play history (upsert doesn't support array append)
    const existing = await prisma.watchHistory.findUnique({
      where: { userId_sceneId: { userId, sceneId } },
    });

    const existingPlayHistory = existing
      ? Array.isArray(existing.playHistory)
        ? existing.playHistory
        : JSON.parse((existing.playHistory as string) || "[]")
      : [];

    const newPlayHistory = [...existingPlayHistory, now.toISOString()];

    // Use upsert to avoid race condition between concurrent saveActivity and incrementPlayCount calls
    const watchHistory = await prisma.watchHistory.upsert({
      where: { userId_sceneId: { userId, sceneId } },
      create: {
        userId,
        sceneId,
        playCount: 1,
        playDuration: 0,
        resumeTime: 0,
        lastPlayedAt: now,
        oCount: 0,
        oHistory: [],
        playHistory: [now.toISOString()],
      },
      update: {
        playCount: { increment: 1 },
        playHistory: JSON.stringify(newPlayHistory),
        lastPlayedAt: now,
      },
    });

    // Update pre-computed stats
    await userStatsService.updateStatsForScene(
      userId,
      sceneId,
      0, // oCountDelta
      1, // playCountDelta
      now, // lastPlayedAt
      undefined // lastOAt
    );

    // Sync to Stash if user has sync enabled
    if (user.syncToStash) {
      try {
        const stash = stashInstanceManager.getDefault();
        const addPlayResult = await stash.sceneAddPlay({
          id: sceneId,
          times: [now.toISOString()],
        });

        logger.info("Synced play count to Stash", {
          userId,
          sceneId,
          stashPlayCount: addPlayResult.sceneAddPlay.count,
        });
      } catch (stashError) {
        logger.error("Failed to sync play count to Stash", {
          sceneId,
          error: stashError,
        });
      }
    }

    res.json({
      success: true,
      watchHistory: {
        playCount: watchHistory.playCount,
        playDuration: watchHistory.playDuration,
        resumeTime: watchHistory.resumeTime,
        lastPlayedAt: watchHistory.lastPlayedAt,
      },
    });
  } catch (error) {
    logger.error("Error incrementing play count", { error });
    res.status(500).json({ error: "Failed to increment play count" });
  }
}
