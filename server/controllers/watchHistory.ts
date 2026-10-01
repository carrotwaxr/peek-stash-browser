import prisma from "../prisma/singleton.js";
import { resolveAccessibleInstanceId } from "../services/EntityAccessService.js";
import { rankingComputeService } from "../services/RankingComputeService.js";
import { recommendationService } from "../services/RecommendationService.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import { userStatsService } from "../services/UserStatsService.js";
import {
  findWatchedScenes,
  parseWatchedScenesQuery,
} from "../services/WatchHistoryQueryService.js";
import type {
  ApiErrorResponse,
  ClearAllWatchHistoryResponse,
  GetWatchHistoryParams,
  GetWatchHistoryResponse,
  GetWatchedScenesQuery,
  GetWatchedScenesResponse,
  IncrementOCounterRequest,
  IncrementOCounterResponse,
  IncrementPlayCountRequest,
  IncrementPlayCountResponse,
  SaveActivityRequest,
  SaveActivityResponse,
  TypedAuthRequest,
  TypedLibraryRequest,
  TypedResponse,
} from "../types/api/index.js";
import { dbWrite, dbWriteBatch, dbWriteTransaction } from "../utils/dbWrite.js";
import { compositeKey } from "../utils/entityRef.js";
import { readHistory } from "../utils/historyJson.js";
import { logger } from "../utils/logger.js";
import { requireInstanceId } from "../utils/routeHelpers.js";
import { INSTANCE_ID_PATTERN } from "../utils/stashMediaPath.js";

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

  if (!requireInstanceId(requestInstanceId, res)) return;

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
  // The scene's performers, studio and tags, read before the unit
  const statsWrites = await userStatsService.statsWritesForScene(
    userId,
    sceneId,
    instanceId,
    { oCount: 1, playCount: 0, lastOAt: now }
  );

  // Read, then create or update, and the O's stats, in one transaction:
  // another write to this scene's history waits for it to commit, then sees
  // its row, and the O is stored with its stats or not at all.
  const watchHistory = await dbWriteTransaction(
    "history.o",
    async (tx) => {
      const existing = await tx.watchHistory.findUnique({
        where: { userId_instanceId_sceneId: { userId, instanceId, sceneId } },
      });
      const row = existing
        ? await tx.watchHistory.update({
            where: { id: existing.id },
            data: {
              oCount: { increment: 1 },
              oHistory: [...readHistory(existing.oHistory), now.toISOString()],
            },
          })
        : await tx.watchHistory.create({
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
      await statsWrites(tx);
      return row;
    },
    // A stats rebuild that read the history before this O reads again
    { afterCommit: () => userStatsService.bumpWriteGeneration(userId) }
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
  const { instanceId } = req.query;
  const userId = req.user.id;

  if (!sceneId) {
    res.status(400).json({ error: "Missing required parameter: sceneId" });
    return;
  }

  if (typeof instanceId !== "string" || !INSTANCE_ID_PATTERN.test(instanceId)) {
    res.status(400).json({ error: "instanceId is required" });
    return;
  }

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
 * The viewer's watched scenes they can see, one page: `view` all,
 * in_progress or completed, `sort` recent, most_watched or
 * longest_duration, with the view's totals unless `count=false`. Unknown
 * parameters or values are a ValidationError (400) through the central
 * handler.
 */
export async function getWatchedScenes(
  req: TypedLibraryRequest<
    unknown,
    Record<string, string>,
    GetWatchedScenesQuery
  >,
  res: TypedResponse<GetWatchedScenesResponse | ApiErrorResponse>
) {
  const request = parseWatchedScenesQuery(req.query);
  res.json(
    await findWatchedScenes({
      userId: req.user.id,
      allowedInstanceIds: req.allowedInstanceIds,
      request,
    })
  );
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
  ] = await dbWriteBatch(
    "history.clear",
    [
      prisma.watchHistory.deleteMany({ where: { userId } }),
      prisma.userPerformerStats.deleteMany({ where: { userId } }),
      prisma.userStudioStats.deleteMany({ where: { userId } }),
      prisma.userTagStats.deleteMany({ where: { userId } }),
      prisma.userEntityRanking.deleteMany({ where: { userId } }),
    ],
    {
      // Inside the unit, once it commits: the next stats page recomputes
      // the rankings at once rather than within the hour, and a recompute
      // still running from before, its write queued behind this unit
      // included, stops without writing or marking the user fresh.
      // Recommended rescores, and a stats rebuild that read the history
      // before the clear reads it again rather than write it back.
      afterCommit: () => {
        rankingComputeService.forget(userId);
        recommendationService.forget(userId);
        userStatsService.bumpWriteGeneration(userId);
      },
    }
  );

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

  if (!requireInstanceId(requestInstanceId, res)) return;

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
  // atomic on its own; the history transactions above see its row. A
  // user-path write, so a unit of the writer queue.
  const watchHistory = await dbWrite("history.activity", () =>
    prisma.watchHistory.upsert({
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
    })
  );

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

/** How long a play token counts as used, and how many are remembered */
const PLAY_TOKEN_TTL_MS = 10 * 60 * 1000;
const PLAY_TOKEN_CAP = 5000;
const PLAY_TOKEN_MAX_LENGTH = 64;

/**
 * Play tokens already claimed, as user, instance, scene and token to the
 * time the claim lapses. Insertion order is expiry order (one TTL for all),
 * so the head is the oldest. In memory: a restart forgets them, which only
 * costs a retry spanning the restart one more play.
 */
const claimedPlayTokens = new Map<string, number>();

/**
 * Claim a play token. True when it was free (now held until its time is
 * up); false when it is held, which means the play is already counted or on
 * its way. The check and the claim are one synchronous step, so two requests
 * with one token cannot both pass, whatever the write queue is doing.
 */
function claimPlayToken(key: string, now: number): boolean {
  const heldUntil = claimedPlayTokens.get(key);
  if (heldUntil !== undefined && heldUntil > now) return false;
  claimedPlayTokens.delete(key);
  for (const [oldKey, expiry] of claimedPlayTokens) {
    if (expiry > now && claimedPlayTokens.size < PLAY_TOKEN_CAP) break;
    claimedPlayTokens.delete(oldKey);
  }
  claimedPlayTokens.set(key, now + PLAY_TOKEN_TTL_MS);
  return true;
}

/**
 * Increment play count for a scene
 * Called by track-activity plugin when minimum play percentage is reached.
 * A `playToken` makes the request safe to retry: the same token (per user,
 * scene and instance) within 10 minutes adds no second play.
 */
export async function incrementPlayCount(
  req: TypedAuthRequest<IncrementPlayCountRequest>,
  res: TypedResponse<IncrementPlayCountResponse | ApiErrorResponse>
) {
  const { sceneId, instanceId: requestInstanceId, playToken } = req.body;
  const userId = req.user.id;

  if (!sceneId) {
    res.status(400).json({ error: "Missing required field: sceneId" });
    return;
  }

  if (!requireInstanceId(requestInstanceId, res)) return;

  if (
    playToken !== undefined &&
    (typeof playToken !== "string" ||
      playToken.length < 1 ||
      playToken.length > PLAY_TOKEN_MAX_LENGTH)
  ) {
    res.status(400).json({
      error: `playToken must be 1 to ${PLAY_TOKEN_MAX_LENGTH} characters`,
    });
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

  // A repeat of a counted (or counting) play answers the row as it stands
  // and writes nothing. The claim comes before any await, so a retry that
  // arrives while the first request is still in its write unit is a repeat
  // too.
  const tokenKey =
    playToken === undefined
      ? undefined
      : compositeKey(String(userId), instanceId, sceneId, playToken);
  if (tokenKey !== undefined && !claimPlayToken(tokenKey, Date.now())) {
    const current = await prisma.watchHistory.findUnique({
      where: { userId_instanceId_sceneId: { userId, instanceId, sceneId } },
    });
    res.json({
      success: true,
      watchHistory: {
        playCount: current?.playCount ?? 0,
        playDuration: current?.playDuration ?? 0,
        resumeTime: current?.resumeTime ?? 0,
        lastPlayedAt: current?.lastPlayedAt ?? null,
      },
    });
    return;
  }

  const now = new Date();
  let watchHistory;
  try {
    watchHistory = await writePlay(userId, sceneId, instanceId, now);
  } catch (error) {
    // Nothing was stored: the client's retry has to count
    if (tokenKey !== undefined) claimedPlayTokens.delete(tokenKey);
    throw error;
  }

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

/** The play's write unit: the history row and the play's stats */
async function writePlay(
  userId: number,
  sceneId: string,
  instanceId: string,
  now: Date
) {
  // The scene's performers, studio and tags, read before the unit
  const statsWrites = await userStatsService.statsWritesForScene(
    userId,
    sceneId,
    instanceId,
    { oCount: 0, playCount: 1, lastPlayedAt: now }
  );

  // Read, then create or update, and the play's stats, in one transaction:
  // the play history append needs the row as it is when the write lands,
  // another write to this scene's history waits for it to commit, and the
  // play is stored with its stats or not at all.
  return dbWriteTransaction(
    "history.play",
    async (tx) => {
      const existing = await tx.watchHistory.findUnique({
        where: { userId_instanceId_sceneId: { userId, instanceId, sceneId } },
      });
      const row = existing
        ? await tx.watchHistory.update({
            where: { id: existing.id },
            data: {
              playCount: { increment: 1 },
              playHistory: [
                ...readHistory(existing.playHistory),
                now.toISOString(),
              ],
              lastPlayedAt: now,
            },
          })
        : await tx.watchHistory.create({
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
      await statsWrites(tx);
      return row;
    },
    // A stats rebuild that read the history before this play reads again
    { afterCommit: () => userStatsService.bumpWriteGeneration(userId) }
  );
}
