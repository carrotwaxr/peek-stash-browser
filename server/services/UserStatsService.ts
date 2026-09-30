import type { Prisma } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import type { NormalizedScene } from "../types/index.js";
import { dbWriteBatchIf } from "../utils/dbWrite.js";
import { entityKey } from "../utils/entityRef.js";
import { readHistory } from "../utils/historyJson.js";
import { logger } from "../utils/logger.js";
import { rankingComputeService } from "./RankingComputeService.js";
import { stashEntityService } from "./StashEntityService.js";

/**
 * UserStatsService
 *
 * Pre-computed per-user play and O stats for performers, studios and tags,
 * each row on its entity's instance, kept so the stats page and the
 * rankings never aggregate the whole watch history per request.
 *
 * Two writers keep them:
 * - A play or an O press adds its increments inside the history
 *   transaction (`statsWritesForScene`), so the history row and its stats
 *   commit together or not at all.
 * - A rebuild (`rebuildAllStatsForUser`) replaces a user's stats from their
 *   history. Every history unit that changes what the rebuild reads bumps
 *   the user's write generation after it commits (`bumpWriteGeneration`),
 *   and the rebuild writes only while the generation is the one it took
 *   before its read (`dbWriteBatchIf`); otherwise it reads again.
 */

/** What one play or O press adds to each entity of its scene. */
export interface StatsDeltas {
  oCount: number;
  playCount: number;
  lastPlayedAt?: Date;
  lastOAt?: Date;
}

/**
 * The stats upserts of one scene, built from its relations read before the
 * history unit: run them on the unit's transaction, after the history write.
 */
export type StatsWrites = (tx: Prisma.TransactionClient) => Promise<void>;

/**
 * How often a rebuild reads the history: once, then again up to three times
 * while plays keep landing between its read and its write.
 */
const REBUILD_ATTEMPTS = 4;

/** A rebuild's statements, and how many rows of each type it writes. */
interface RebuildBatch {
  ops: Prisma.PrismaPromise<unknown>[];
  performerCount: number;
  studioCount: number;
  tagCount: number;
}

class UserStatsService {
  /**
   * Bumped by each history unit that changes the plays or O presses a
   * rebuild reads, after it commits (in its `afterCommit`). In memory: a
   * rebuild runs in this process, against this process's writes.
   */
  private readonly writeGenerations = new Map<number, number>();

  /** The user's history changed: a rebuild that read it before gives way. */
  bumpWriteGeneration(userId: number): void {
    this.writeGenerations.set(userId, this.writeGeneration(userId) + 1);
  }

  private writeGeneration(userId: number): number {
    return this.writeGenerations.get(userId) ?? 0;
  }

  /**
   * The stats upserts for one play or O press of a scene: one
   * INSERT ... ON CONFLICT DO UPDATE per performer, the studio and each tag,
   * carrying the increments, on the scene's instance. The scene's relations
   * are read here, before the caller's history unit; the upserts run inside
   * it, on its transaction, so a failed one fails the history write too (the
   * player retries). A scene missing from the cache gets no stats writes.
   */
  async statsWritesForScene(
    userId: number,
    sceneId: string,
    instanceId: string,
    deltas: StatsDeltas
  ): Promise<StatsWrites> {
    const scene = await stashEntityService.getScene(sceneId, instanceId);
    if (!scene) {
      logger.warn("Scene not found in cache for stats update", {
        userId,
        sceneId,
        instanceId,
      });
      return () => Promise.resolve();
    }

    const { oCount, playCount, lastPlayedAt, lastOAt } = deltas;
    const created = {
      oCounter: Math.max(0, oCount),
      playCount: Math.max(0, playCount),
    };
    const increments = {
      oCounter: { increment: oCount },
      playCount: { increment: playCount },
    };
    const performerIds = scene.performers.map((p) => p.id);
    const studioId = scene.studio?.id;
    const tagIds = scene.tags.map((t) => t.id);

    return async (tx) => {
      for (const performerId of performerIds) {
        await tx.userPerformerStats.upsert({
          where: {
            userId_instanceId_performerId: { userId, instanceId, performerId },
          },
          create: {
            userId,
            instanceId,
            performerId,
            ...created,
            ...(lastPlayedAt !== undefined ? { lastPlayedAt } : {}),
            ...(lastOAt !== undefined ? { lastOAt } : {}),
          },
          update: {
            ...increments,
            ...(lastPlayedAt !== undefined
              ? { lastPlayedAt: { set: lastPlayedAt } }
              : {}),
            ...(lastOAt !== undefined ? { lastOAt: { set: lastOAt } } : {}),
          },
        });
      }
      if (studioId !== undefined) {
        await tx.userStudioStats.upsert({
          where: {
            userId_instanceId_studioId: { userId, instanceId, studioId },
          },
          create: { userId, instanceId, studioId, ...created },
          update: increments,
        });
      }
      for (const tagId of tagIds) {
        await tx.userTagStats.upsert({
          where: { userId_instanceId_tagId: { userId, instanceId, tagId } },
          create: { userId, instanceId, tagId, ...created },
          update: increments,
        });
      }
    };
  }

  /**
   * Rebuild all stats for a user from watch history
   * Useful for:
   * - Initial population
   * - Fixing corrupted data
   * - Admin tools
   *
   * WARNING: This is expensive! Only call when necessary.
   *
   * Reads the history and its scenes, then replaces the user's stats in one
   * `stats.rebuild` batch, written only if no play or O press committed
   * since the read (the user's write generation is unchanged when the unit
   * starts). When one did, it reads again, up to REBUILD_ATTEMPTS reads in
   * all; after that it keeps the stats as they are (every play unit kept
   * them current) and logs a warning. A written rebuild forgets the user's
   * rankings inside its unit: they are computed from these stats, so a
   * ranking write queued behind it writes nothing.
   */
  async rebuildAllStatsForUser(userId: number): Promise<void> {
    try {
      logger.info("Rebuilding stats for user", { userId });

      for (let attempt = 1; attempt <= REBUILD_ATTEMPTS; attempt++) {
        const generation = this.writeGeneration(userId);
        const batch = await this.buildRebuild(userId);
        const written = await dbWriteBatchIf(
          "stats.rebuild",
          () => this.writeGeneration(userId) === generation,
          batch.ops,
          { afterCommit: () => rankingComputeService.forget(userId) }
        );
        if (written !== null) {
          logger.info("Stats rebuild complete", {
            userId,
            attempt,
            performerCount: batch.performerCount,
            studioCount: batch.studioCount,
            tagCount: batch.tagCount,
          });
          return;
        }
      }

      logger.warn(
        "Stats rebuild kept the stats: plays kept landing while it read",
        { userId, attempts: REBUILD_ATTEMPTS }
      );
    } catch (error) {
      logger.error("Error rebuilding stats", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Reads the user's history and its scenes and builds the statements that
   * replace their stats: the old rows go and the aggregated ones land, with
   * nothing computed under the lock.
   */
  private async buildRebuild(userId: number): Promise<RebuildBatch> {
    const watchHistory = await prisma.watchHistory.findMany({
      where: { userId },
    });

    // Aggregate stats by entity, keyed by entity and instance; each value
    // is the row to write
    const performerStatsMap = new Map<
      string,
      {
        performerId: string;
        instanceId: string;
        oCounter: number;
        playCount: number;
        lastPlayedAt: Date | null;
        lastOAt: Date | null;
      }
    >();
    const studioStatsMap = new Map<
      string,
      {
        studioId: string;
        instanceId: string;
        oCounter: number;
        playCount: number;
      }
    >();
    const tagStatsMap = new Map<
      string,
      {
        tagId: string;
        instanceId: string;
        oCounter: number;
        playCount: number;
      }
    >();

    // Batch load the history's scenes (with performers, tags and studio),
    // one read per instance: a scene id means nothing without its instance
    const sceneIdsByInstance = new Map<string, string[]>();
    for (const wh of watchHistory) {
      const ids = sceneIdsByInstance.get(wh.instanceId);
      if (ids) ids.push(wh.sceneId);
      else sceneIdsByInstance.set(wh.instanceId, [wh.sceneId]);
    }
    const scenes: NormalizedScene[] = [];
    for (const [instanceId, ids] of sceneIdsByInstance) {
      scenes.push(
        ...(await stashEntityService.getScenesByIdsWithRelations(
          ids,
          instanceId
        ))
      );
    }
    const sceneMap = new Map(
      scenes.map((s) => [entityKey(s.id, s.instanceId), s])
    );

    for (const wh of watchHistory) {
      const scene = sceneMap.get(entityKey(wh.sceneId, wh.instanceId));
      if (!scene) continue;

      // Parse O history for timestamps
      const oHistory = readHistory(wh.oHistory);
      const playHistory = readHistory(wh.playHistory);

      const lastPlayEntry =
        playHistory.length > 0
          ? playHistory[playHistory.length - 1]
          : undefined;
      const lastPlayedAt = lastPlayEntry ? new Date(lastPlayEntry) : null;
      const lastOEntry =
        oHistory.length > 0 ? oHistory[oHistory.length - 1] : undefined;
      const lastOAt = lastOEntry ? new Date(lastOEntry) : null;

      // Aggregate performers (keyed by performer and instance)
      for (const performer of scene.performers) {
        const statsKey = entityKey(performer.id, wh.instanceId);
        const existing = performerStatsMap.get(statsKey) ?? {
          performerId: performer.id,
          instanceId: wh.instanceId,
          oCounter: 0,
          playCount: 0,
          lastPlayedAt: null,
          lastOAt: null,
        };

        performerStatsMap.set(statsKey, {
          ...existing,
          oCounter: existing.oCounter + wh.oCount,
          playCount: existing.playCount + wh.playCount,
          lastPlayedAt:
            lastPlayedAt &&
            (!existing.lastPlayedAt || lastPlayedAt > existing.lastPlayedAt)
              ? lastPlayedAt
              : existing.lastPlayedAt,
          lastOAt:
            lastOAt && (!existing.lastOAt || lastOAt > existing.lastOAt)
              ? lastOAt
              : existing.lastOAt,
        });
      }

      // Aggregate studio (keyed by studio and instance)
      if (scene.studio) {
        const statsKey = entityKey(scene.studio.id, wh.instanceId);
        const existing = studioStatsMap.get(statsKey) ?? {
          studioId: scene.studio.id,
          instanceId: wh.instanceId,
          oCounter: 0,
          playCount: 0,
        };

        studioStatsMap.set(statsKey, {
          ...existing,
          oCounter: existing.oCounter + wh.oCount,
          playCount: existing.playCount + wh.playCount,
        });
      }

      // Aggregate tags (keyed by tag and instance)
      for (const tag of scene.tags) {
        const statsKey = entityKey(tag.id, wh.instanceId);
        const existing = tagStatsMap.get(statsKey) ?? {
          tagId: tag.id,
          instanceId: wh.instanceId,
          oCounter: 0,
          playCount: 0,
        };

        tagStatsMap.set(statsKey, {
          ...existing,
          oCounter: existing.oCounter + wh.oCount,
          playCount: existing.playCount + wh.playCount,
        });
      }
    }

    return {
      ops: [
        prisma.userPerformerStats.deleteMany({ where: { userId } }),
        prisma.userStudioStats.deleteMany({ where: { userId } }),
        prisma.userTagStats.deleteMany({ where: { userId } }),
        prisma.userPerformerStats.createMany({
          data: Array.from(performerStatsMap.values(), (row) => ({
            userId,
            ...row,
          })),
        }),
        prisma.userStudioStats.createMany({
          data: Array.from(studioStatsMap.values(), (row) => ({
            userId,
            ...row,
          })),
        }),
        prisma.userTagStats.createMany({
          data: Array.from(tagStatsMap.values(), (row) => ({ userId, ...row })),
        }),
      ],
      performerCount: performerStatsMap.size,
      studioCount: studioStatsMap.size,
      tagCount: tagStatsMap.size,
    };
  }

  /**
   * Rebuild stats for all users
   * Admin tool - VERY expensive!
   */
  async rebuildAllStats(): Promise<void> {
    logger.info("Rebuilding stats for all users");

    const users = await prisma.user.findMany({
      select: { id: true },
    });

    for (const user of users) {
      await this.rebuildAllStatsForUser(user.id);
    }

    logger.info("All stats rebuild complete", { userCount: users.length });
  }
}

export const userStatsService = new UserStatsService();
export default userStatsService;
