import type { WatchHistory } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import { resolveAccessibleInstanceId } from "../services/EntityAccessService.js";
import { rankingComputeService } from "../services/RankingComputeService.js";
import { recommendationService } from "../services/RecommendationService.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import { userStatsService } from "../services/UserStatsService.js";
import type {
  ApiErrorResponse,
  ClearAllWatchHistoryResponse,
  GetAllWatchHistoryQuery,
  GetAllWatchHistoryResponse,
  GetWatchHistoryParams,
  GetWatchHistoryResponse,
  IncrementOCounterRequest,
  IncrementOCounterResponse,
  IncrementPlayCountRequest,
  IncrementPlayCountResponse,
  PingWatchHistoryRequest,
  PingWatchHistoryResponse,
  SaveActivityRequest,
  SaveActivityResponse,
  TypedAuthRequest,
  TypedResponse,
} from "../types/api/index.js";
import { dbWriteBatch, dbWriteTransaction } from "../utils/dbWrite.js";
import { getEntityInstanceId } from "../utils/entityInstanceId.js";
import { compositeKey } from "../utils/entityRef.js";
import { readHistory } from "../utils/historyJson.js";
import { logger } from "../utils/logger.js";

// Session tracking: prevent duplicate play_count increments per viewing session
// Keyed by user and scene id
const sessionPlayCountIncrements = new Map<string, boolean>();

function getSessionKey(userId: number, sceneId: string): string {
  return compositeKey(String(userId), sceneId);
}

/**
 * Update watch history with periodic ping from video player
 * Tracks playback progress matching Stash's pattern with per-user tracking
 */
export async function pingWatchHistory(
  req: TypedAuthRequest<PingWatchHistoryRequest>,
  res: TypedResponse<PingWatchHistoryResponse | ApiErrorResponse>
) {
  const {
    sceneId,
    instanceId: requestInstanceId,
    currentTime,
    quality,
    sessionStart,
    seekEvents,
  } = req.body;
  const userId = req.user.id;

  if (!sceneId || typeof currentTime !== "number") {
    res
      .status(400)
      .json({ error: "Missing required fields: sceneId, currentTime" });
    return;
  }

  if (
    requestInstanceId !== undefined &&
    (typeof requestInstanceId !== "string" || requestInstanceId === "")
  ) {
    res.status(400).json({ error: "instanceId must be a non-empty string" });
    return;
  }

  logger.debug("Watch history ping", {
    userId,
    sceneId,
    currentTime: currentTime.toFixed(2),
    quality,
  });

  // Get user settings for minimumPlayPercent and syncToStash, and the
  // scene's instance if this user can see it
  const [user, instanceId] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { minimumPlayPercent: true, syncToStash: true },
    }),
    resolveAccessibleInstanceId(userId, "scene", sceneId, requestInstanceId),
  ]);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  if (!instanceId) {
    res.status(404).json({ error: "Scene not found" });
    return;
  }

  // Scene duration from the cache, on the resolved instance
  const scene = await prisma.stashScene.findFirst({
    where: { id: sceneId, stashInstanceId: instanceId },
    select: { duration: true },
  });
  const sceneDuration = scene?.duration || 0;

  const now = new Date();
  const sessionKey = getSessionKey(userId, sceneId);
  // Set when this ping counted the session's play, so a failed transaction
  // can take it back
  let countedPlay = false;

  // The read, the create, the delta and the update run in one transaction:
  // an O press, a play count, an activity save or another ping on this
  // scene waits for it to commit, then sees its row.
  const { updated, playbackDelta, playCountIncremented, resumeTime } =
    await dbWriteTransaction("history.ping", async (tx) => {
      // An earlier attempt of this ping found the database busy and
      // committed nothing: take back the flag it set
      if (countedPlay) {
        sessionPlayCountIncrements.delete(sessionKey);
        countedPlay = false;
      }

      const watchHistory =
        (await tx.watchHistory.findUnique({
          where: {
            userId_instanceId_sceneId: { userId, instanceId, sceneId },
          },
        })) ??
        (await tx.watchHistory.create({
          data: {
            userId,
            instanceId,
            sceneId,
            playCount: 0,
            playDuration: 0,
            resumeTime: currentTime,
            lastPlayedAt: now,
            oCount: 0,
            oHistory: [],
            playHistory: [],
          },
        }));

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
            logger.debug("New viewing session detected", {
              userId,
              sceneId,
              timeSinceLastPlayed: timeSinceLastPlayed.toFixed(2),
              usingSessionStart: true,
            });
          }
        }

        const timeSinceLastPing =
          (now.getTime() - lastPingTime.getTime()) / 1000;

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

          logger.debug("Adjusted playback delta for seeks", {
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

      // Total play duration after this ping
      const newPlayDuration = watchHistory.playDuration + playbackDelta;

      // Calculate percentages (Stash's pattern)
      const percentPlayed =
        sceneDuration > 0 ? (newPlayDuration / sceneDuration) * 100 : 0;
      const percentCompleted =
        sceneDuration > 0 ? (currentTime / sceneDuration) * 100 : 0;

      // Increment play count ONCE per session when threshold is met. The
      // check and the set run while this transaction holds the write lock,
      // so a second ping of the session queued behind it sees the flag.
      const hasIncrementedThisSession =
        sessionPlayCountIncrements.get(sessionKey) || false;
      let playCountIncremented = false;
      const playHistory = readHistory(watchHistory.playHistory);

      if (
        !hasIncrementedThisSession &&
        percentPlayed >= user.minimumPlayPercent
      ) {
        playCountIncremented = true;
        sessionPlayCountIncrements.set(sessionKey, true);
        countedPlay = true;

        // Append timestamp to play history (Stash's pattern)
        playHistory.push(now.toISOString());

        logger.debug("Play count incremented (percentage threshold met)", {
          userId,
          sceneId,
          newPlayCount: watchHistory.playCount + 1,
          percentPlayed: percentPlayed.toFixed(2),
          threshold: user.minimumPlayPercent,
        });
      }

      // Reset resume_time to 0 when video is 98%+ complete (Stash's pattern)
      const resumeTime = percentCompleted >= 98 ? 0 : currentTime;

      // Counts are incremented, never set from the values read above
      const updated = await tx.watchHistory.update({
        where: { id: watchHistory.id },
        data: {
          resumeTime,
          lastPlayedAt: now,
          playCount: { increment: playCountIncremented ? 1 : 0 },
          playDuration: { increment: playbackDelta },
          playHistory,
        },
      });

      return { updated, playbackDelta, playCountIncremented, resumeTime };
    }).catch((error: unknown) => {
      // Nothing was stored, so a retry of this session can still count
      if (countedPlay) {
        sessionPlayCountIncrements.delete(sessionKey);
      }
      throw error;
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
      undefined, // lastOAt (not changed)
      instanceId
    );
  }

  // Sync to Stash if user has sync enabled
  if (user.syncToStash) {
    try {
      const stash = stashInstanceManager.getForSync(instanceId);
      if (stash) {
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
            peekPlayCount: updated.playCount,
          });
        }

        logger.debug("Synced activity to Stash", {
          userId,
          sceneId,
          resumeTime,
          playbackDelta,
          playCountIncremented,
        });
      }
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
}

/**
 * Increment O counter for a scene
 */
export async function incrementOCounter(
  req: TypedAuthRequest<IncrementOCounterRequest>,
  res: TypedResponse<IncrementOCounterResponse | ApiErrorResponse>
) {
  const { sceneId, instanceId: requestInstanceId } = req.body;
  const userId = req.user.id;

  if (!sceneId) {
    res.status(400).json({ error: "Missing required field: sceneId" });
    return;
  }

  if (
    requestInstanceId !== undefined &&
    (typeof requestInstanceId !== "string" || requestInstanceId === "")
  ) {
    res.status(400).json({ error: "instanceId must be a non-empty string" });
    return;
  }

  // Get user settings for syncToStash, and the scene's instance if this
  // user can see it
  const [user, instanceId] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { syncToStash: true },
    }),
    resolveAccessibleInstanceId(userId, "scene", sceneId, requestInstanceId),
  ]);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  if (!instanceId) {
    res.status(404).json({ error: "Scene not found" });
    return;
  }

  const now = new Date();

  // Read, then create or update, in one transaction: another write to this
  // scene's history waits for it to commit, then sees its row.
  const watchHistory = await dbWriteTransaction("history.o", async (tx) => {
    const existing = await tx.watchHistory.findUnique({
      where: { userId_instanceId_sceneId: { userId, instanceId, sceneId } },
    });
    if (!existing) {
      return tx.watchHistory.create({
        data: {
          userId,
          instanceId,
          sceneId,
          playCount: 0,
          playDuration: 0,
          oCount: 1,
          oHistory: [now.toISOString()],
          playHistory: [],
          lastPlayedAt: now,
        },
      });
    }
    return tx.watchHistory.update({
      where: { id: existing.id },
      data: {
        oCount: { increment: 1 },
        oHistory: [...readHistory(existing.oHistory), now.toISOString()],
      },
    });
  });

  // Update pre-computed stats once, after the commit
  await userStatsService.updateStatsForScene(
    userId,
    sceneId,
    1, // oCountDelta
    0, // playCountDelta
    undefined, // lastPlayedAt (not changed)
    now, // lastOAt
    instanceId
  );

  // Sync to Stash if user has sync enabled
  if (user.syncToStash) {
    try {
      const stash = stashInstanceManager.getForSync(instanceId);
      if (stash) {
        logger.info("Syncing O counter increment to Stash", { sceneId });
        const result = await stash.sceneIncrementO({ id: sceneId });
        logger.info("Successfully incremented O counter in Stash", {
          sceneId,
          stashGlobalCount: result.sceneIncrementO,
          peekUserCount: watchHistory.oCount,
        });
      }
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
}

/**
 * Get watch history for a specific scene
 */
export async function getWatchHistory(
  req: TypedAuthRequest<unknown, GetWatchHistoryParams>,
  res: TypedResponse<GetWatchHistoryResponse | ApiErrorResponse>
) {
  const { sceneId } = req.params;
  const userId = req.user.id;

  if (!sceneId) {
    res.status(400).json({ error: "Missing required parameter: sceneId" });
    return;
  }

  // Get scene instanceId
  const instanceId = await getEntityInstanceId("scene", sceneId);

  const watchHistory = await prisma.watchHistory.findUnique({
    where: { userId_instanceId_sceneId: { userId, instanceId, sceneId } },
  });

  if (!watchHistory) {
    res.json({
      exists: false,
      resumeTime: null,
      playCount: 0,
      oCount: 0,
    });
    return;
  }

  const oHistory = readHistory(watchHistory.oHistory);
  const playHistory = readHistory(watchHistory.playHistory);

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
}

/**
 * Get all watch history for current user (for Continue Watching carousel)
 */
export async function getAllWatchHistory(
  req: TypedAuthRequest<
    unknown,
    Record<string, string>,
    GetAllWatchHistoryQuery
  >,
  res: TypedResponse<GetAllWatchHistoryResponse | ApiErrorResponse>
) {
  const userId = req.user.id;
  const limit = parseInt(req.query.limit as string) || 20;
  const onlyInProgress = req.query.inProgress === "true";

  const where: { userId: number; resumeTime?: { not: null } } = { userId };

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
    oHistory: readHistory(record.oHistory),
    playHistory: readHistory(record.playHistory),
  }));

  res.json({ watchHistory: parsed });
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
  const userId = req.user.id;

  logger.info("Clearing all watch history and stats", { userId });

  // Delete watch history, all related stats, and rankings as one unit
  const [
    watchHistoryResult,
    performerStatsResult,
    studioStatsResult,
    tagStatsResult,
    rankingsResult,
  ] = await dbWriteBatch("history.clear", [
    prisma.watchHistory.deleteMany({ where: { userId } }),
    prisma.userPerformerStats.deleteMany({ where: { userId } }),
    prisma.userStudioStats.deleteMany({ where: { userId } }),
    prisma.userTagStats.deleteMany({ where: { userId } }),
    prisma.userEntityRanking.deleteMany({ where: { userId } }),
  ]);
  // After the unit: the next stats page recomputes the rankings at once
  // rather than within the hour, and a recompute still running from
  // before stops without marking the user fresh. Recommended rescores.
  rankingComputeService.forget(userId);
  recommendationService.forget(userId);

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
}

/**
 * Save activity (resume time and play duration delta)
 * Simplified endpoint matching Stash's pattern - called by track-activity plugin
 */
export async function saveActivity(
  req: TypedAuthRequest<SaveActivityRequest>,
  res: TypedResponse<SaveActivityResponse | ApiErrorResponse>
) {
  const {
    sceneId,
    instanceId: requestInstanceId,
    resumeTime,
    playDuration,
  } = req.body;
  const userId = req.user.id;

  if (!sceneId) {
    res.status(400).json({ error: "Missing required field: sceneId" });
    return;
  }

  if (
    requestInstanceId !== undefined &&
    (typeof requestInstanceId !== "string" || requestInstanceId === "")
  ) {
    res.status(400).json({ error: "instanceId must be a non-empty string" });
    return;
  }

  logger.debug("Save activity", {
    userId,
    sceneId,
    resumeTime: resumeTime?.toFixed(2),
    playDuration: playDuration?.toFixed(2),
  });

  // Get user settings for syncToStash, and the scene's instance if this
  // user can see it
  const [user, instanceId] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { syncToStash: true },
    }),
    resolveAccessibleInstanceId(userId, "scene", sceneId, requestInstanceId),
  ]);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  if (!instanceId) {
    res.status(404).json({ error: "Scene not found" });
    return;
  }

  const now = new Date();

  // One INSERT ... ON CONFLICT DO UPDATE with the increment in it, so it is
  // atomic on its own; the history transactions above see its row.
  const watchHistory = await prisma.watchHistory.upsert({
    where: { userId_instanceId_sceneId: { userId, instanceId, sceneId } },
    create: {
      userId,
      instanceId,
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
      ...(resumeTime !== undefined ? { resumeTime } : {}),
      playDuration: { increment: playDuration || 0 },
      lastPlayedAt: now,
    },
  });

  // Sync to Stash if user has sync enabled
  if (user.syncToStash && playDuration) {
    try {
      const stash = stashInstanceManager.getForSync(instanceId);
      if (stash) {
        await stash.sceneSaveActivity({
          id: sceneId,
          resume_time: resumeTime,
          playDuration: playDuration,
        });

        logger.debug("Synced activity to Stash", {
          userId,
          sceneId,
          resumeTime,
          playDuration,
        });
      }
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
}

/**
 * Increment play count for a scene
 * Called by track-activity plugin when minimum play percentage is reached
 */
export async function incrementPlayCount(
  req: TypedAuthRequest<IncrementPlayCountRequest>,
  res: TypedResponse<IncrementPlayCountResponse | ApiErrorResponse>
) {
  const { sceneId, instanceId: requestInstanceId } = req.body;
  const userId = req.user.id;

  if (!sceneId) {
    res.status(400).json({ error: "Missing required field: sceneId" });
    return;
  }

  if (
    requestInstanceId !== undefined &&
    (typeof requestInstanceId !== "string" || requestInstanceId === "")
  ) {
    res.status(400).json({ error: "instanceId must be a non-empty string" });
    return;
  }

  logger.debug("Increment play count", { userId, sceneId });

  // Get user settings for syncToStash, and the scene's instance if this
  // user can see it
  const [user, instanceId] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { syncToStash: true },
    }),
    resolveAccessibleInstanceId(userId, "scene", sceneId, requestInstanceId),
  ]);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  if (!instanceId) {
    res.status(404).json({ error: "Scene not found" });
    return;
  }

  const now = new Date();

  // Read, then create or update, in one transaction: the play history
  // append needs the row as it is when the write lands, and another write
  // to this scene's history waits for it to commit.
  const watchHistory = await dbWriteTransaction("history.play", async (tx) => {
    const existing = await tx.watchHistory.findUnique({
      where: { userId_instanceId_sceneId: { userId, instanceId, sceneId } },
    });
    if (!existing) {
      return tx.watchHistory.create({
        data: {
          userId,
          instanceId,
          sceneId,
          playCount: 1,
          playDuration: 0,
          resumeTime: 0,
          lastPlayedAt: now,
          oCount: 0,
          oHistory: [],
          playHistory: [now.toISOString()],
        },
      });
    }
    return tx.watchHistory.update({
      where: { id: existing.id },
      data: {
        playCount: { increment: 1 },
        playHistory: [...readHistory(existing.playHistory), now.toISOString()],
        lastPlayedAt: now,
      },
    });
  });

  // Update pre-computed stats
  await userStatsService.updateStatsForScene(
    userId,
    sceneId,
    0, // oCountDelta
    1, // playCountDelta
    now, // lastPlayedAt
    undefined, // lastOAt
    instanceId
  );

  // Sync to Stash if user has sync enabled
  if (user.syncToStash) {
    try {
      const stash = stashInstanceManager.getForSync(instanceId);
      if (stash) {
        const addPlayResult = await stash.sceneAddPlay({
          id: sceneId,
          times: [now.toISOString()],
        });

        logger.info("Synced play count to Stash", {
          userId,
          sceneId,
          stashPlayCount: addPlayResult.sceneAddPlay.count,
        });
      }
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
}
