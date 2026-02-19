import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { stashEntityService } from "./StashEntityService.js";

// Separator for composite map keys (entityId + instanceId).
// Using a character that won't appear in UUIDs or Stash numeric IDs.
export const KEY_SEP = "\0";

/**
 * UserStatsService
 *
 * Manages pre-computed per-user statistics for performers, studios, and tags.
 * These stats are cached in the database to avoid expensive real-time calculations
 * from watch history on every request.
 *
 * Performance Impact:
 * - BEFORE: O(all_scenes × avg_performers_per_scene) ~60k operations per request
 * - AFTER: O(visible_performers) ~40 DB lookups per request
 * - Expected: 90-95% reduction in request time
 */

interface PerformerStats {
  performerId: string;
  oCounter: number;
  playCount: number;
  lastPlayedAt: string | null;
  lastOAt: string | null;
}

interface StudioStats {
  studioId: string;
  oCounter: number;
  playCount: number;
}

interface TagStats {
  tagId: string;
  oCounter: number;
  playCount: number;
}

class UserStatsService {
  /**
   * Get all performer stats for a user
   * Returns a Map for O(1) lookup by performerId
   */
  async getPerformerStats(
    userId: number
  ): Promise<Map<string, Omit<PerformerStats, "performerId">>> {
    const stats = await prisma.userPerformerStats.findMany({
      where: { userId },
      select: {
        performerId: true,
        instanceId: true,
        oCounter: true,
        playCount: true,
        lastPlayedAt: true,
        lastOAt: true,
      },
    });

    return new Map(
      stats.map((s) => [
        `${s.performerId}${KEY_SEP}${s.instanceId}`,
        {
          oCounter: s.oCounter,
          playCount: s.playCount,
          lastPlayedAt: s.lastPlayedAt?.toISOString() || null,
          lastOAt: s.lastOAt?.toISOString() || null,
        },
      ])
    );
  }

  /**
   * Get all studio stats for a user
   * Returns a Map for O(1) lookup by studioId
   */
  async getStudioStats(
    userId: number
  ): Promise<Map<string, Omit<StudioStats, "studioId">>> {
    const stats = await prisma.userStudioStats.findMany({
      where: { userId },
      select: {
        studioId: true,
        instanceId: true,
        oCounter: true,
        playCount: true,
      },
    });

    return new Map(
      stats.map((s) => [
        `${s.studioId}${KEY_SEP}${s.instanceId}`,
        {
          oCounter: s.oCounter,
          playCount: s.playCount,
        },
      ])
    );
  }

  /**
   * Get all tag stats for a user
   * Returns a Map for O(1) lookup by tagId
   */
  async getTagStats(
    userId: number
  ): Promise<Map<string, Omit<TagStats, "tagId">>> {
    const stats = await prisma.userTagStats.findMany({
      where: { userId },
      select: {
        tagId: true,
        instanceId: true,
        oCounter: true,
        playCount: true,
      },
    });

    return new Map(
      stats.map((s) => [
        `${s.tagId}${KEY_SEP}${s.instanceId}`,
        {
          oCounter: s.oCounter,
          playCount: s.playCount,
        },
      ])
    );
  }

  /**
   * Update stats for all entities (performers, studio, tags) in a scene
   * Called when watch history is created or updated
   *
   * @param userId - User ID
   * @param sceneId - Scene ID
   * @param oCountDelta - Change in O counter (can be negative for corrections)
   * @param playCountDelta - Change in play count (can be negative for corrections)
   * @param lastPlayedAt - Timestamp of last playback (optional)
   * @param lastOAt - Timestamp of last O (optional)
   */
  async updateStatsForScene(
    userId: number,
    sceneId: string,
    oCountDelta: number,
    playCountDelta: number,
    lastPlayedAt?: Date,
    lastOAt?: Date,
    instanceId?: string
  ): Promise<void> {
    try {
      // Get scene from cache to find all related entities
      const scene = await stashEntityService.getScene(sceneId, instanceId);
      if (!scene) {
        logger.warn("Scene not found in cache for stats update", { sceneId });
        return;
      }

      // Resolve instanceId: use provided value, or look up from DB, or default to ""
      let resolvedInstanceId = instanceId || "";
      if (!resolvedInstanceId) {
        const sceneRecord = await prisma.stashScene.findFirst({
          where: { id: sceneId },
          select: { stashInstanceId: true },
        });
        resolvedInstanceId = sceneRecord?.stashInstanceId || "";
      }

      // Update performer stats
      if (scene.performers && scene.performers.length > 0) {
        await Promise.all(
          scene.performers.map((performer) =>
            this.updatePerformerStats(
              userId,
              performer.id,
              oCountDelta,
              playCountDelta,
              lastPlayedAt,
              lastOAt,
              resolvedInstanceId
            )
          )
        );
      }

      // Update studio stats
      if (scene.studio) {
        await this.updateStudioStats(
          userId,
          scene.studio.id,
          oCountDelta,
          playCountDelta,
          resolvedInstanceId
        );
      }

      // Update tag stats
      if (scene.tags && scene.tags.length > 0) {
        await Promise.all(
          scene.tags.map((tag) =>
            this.updateTagStats(userId, tag.id, oCountDelta, playCountDelta, resolvedInstanceId)
          )
        );
      }
    } catch (error) {
      logger.error("Error updating stats for scene", {
        userId,
        sceneId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Update stats for a specific performer
   */
  private async updatePerformerStats(
    userId: number,
    performerId: string,
    oCountDelta: number,
    playCountDelta: number,
    lastPlayedAt?: Date,
    lastOAt?: Date,
    instanceId: string = ""
  ): Promise<void> {
    await prisma.userPerformerStats.upsert({
      where: {
        userId_instanceId_performerId: {
          userId,
          instanceId,
          performerId,
        },
      },
      create: {
        userId,
        instanceId,
        performerId,
        oCounter: Math.max(0, oCountDelta),
        playCount: Math.max(0, playCountDelta),
        lastPlayedAt,
        lastOAt,
      },
      update: {
        oCounter: {
          increment: oCountDelta,
        },
        playCount: {
          increment: playCountDelta,
        },
        ...(lastPlayedAt && {
          lastPlayedAt: {
            set: lastPlayedAt,
          },
        }),
        ...(lastOAt && {
          lastOAt: {
            set: lastOAt,
          },
        }),
      },
    });
  }

  /**
   * Update stats for a specific studio
   */
  private async updateStudioStats(
    userId: number,
    studioId: string,
    oCountDelta: number,
    playCountDelta: number,
    instanceId: string = ""
  ): Promise<void> {
    await prisma.userStudioStats.upsert({
      where: {
        userId_instanceId_studioId: {
          userId,
          instanceId,
          studioId,
        },
      },
      create: {
        userId,
        instanceId,
        studioId,
        oCounter: Math.max(0, oCountDelta),
        playCount: Math.max(0, playCountDelta),
      },
      update: {
        oCounter: {
          increment: oCountDelta,
        },
        playCount: {
          increment: playCountDelta,
        },
      },
    });
  }

  /**
   * Update stats for a specific tag
   */
  private async updateTagStats(
    userId: number,
    tagId: string,
    oCountDelta: number,
    playCountDelta: number,
    instanceId: string = ""
  ): Promise<void> {
    await prisma.userTagStats.upsert({
      where: {
        userId_instanceId_tagId: {
          userId,
          instanceId,
          tagId,
        },
      },
      create: {
        userId,
        instanceId,
        tagId,
        oCounter: Math.max(0, oCountDelta),
        playCount: Math.max(0, playCountDelta),
      },
      update: {
        oCounter: {
          increment: oCountDelta,
        },
        playCount: {
          increment: playCountDelta,
        },
      },
    });
  }

  /**
   * Rebuild all stats for a user from watch history
   * Useful for:
   * - Initial population
   * - Fixing corrupted data
   * - Admin tools
   *
   * WARNING: This is expensive! Only call when necessary.
   */
  async rebuildAllStatsForUser(userId: number): Promise<void> {
    try {
      logger.info("Rebuilding stats for user", { userId });

      // Clear existing stats
      await Promise.all([
        prisma.userPerformerStats.deleteMany({ where: { userId } }),
        prisma.userStudioStats.deleteMany({ where: { userId } }),
        prisma.userTagStats.deleteMany({ where: { userId } }),
      ]);

      // Get all watch history for user
      const watchHistory = await prisma.watchHistory.findMany({
        where: { userId },
      });

      // Aggregate stats by entity
      const performerStatsMap = new Map<
        string,
        {
          oCounter: number;
          playCount: number;
          lastPlayedAt: Date | null;
          lastOAt: Date | null;
        }
      >();
      const studioStatsMap = new Map<
        string,
        {
          oCounter: number;
          playCount: number;
        }
      >();
      const tagStatsMap = new Map<
        string,
        {
          oCounter: number;
          playCount: number;
        }
      >();

      // Batch load all scenes for the watch history (with relations for performers/tags/studio)
      const sceneIds = watchHistory.map((wh) => wh.sceneId);
      const scenes = await stashEntityService.getScenesByIdsWithRelations(sceneIds);
      // Use composite key (id + instanceId) to avoid cross-instance collisions
      const sceneMap = new Map(scenes.map((s) => [`${s.id}\0${s.instanceId || ''}`, s]));

      for (const wh of watchHistory) {
        const scene = sceneMap.get(`${wh.sceneId}\0${wh.instanceId || ''}`);
        if (!scene) continue;

        // Get instanceId from the watch history record
        const whInstanceId = wh.instanceId || "";

        // Parse O history for timestamps
        const oHistory = Array.isArray(wh.oHistory)
          ? wh.oHistory
          : JSON.parse((wh.oHistory as string) || "[]");
        const playHistory = Array.isArray(wh.playHistory)
          ? wh.playHistory
          : JSON.parse((wh.playHistory as string) || "[]");

        const lastPlayedAt =
          playHistory.length > 0
            ? new Date(playHistory[playHistory.length - 1])
            : null;
        const lastOAt =
          oHistory.length > 0 ? new Date(oHistory[oHistory.length - 1]) : null;

        // Aggregate performers (using composite key: performerId + instanceId)
        for (const performer of scene.performers || []) {
          const statsKey = `${performer.id}${KEY_SEP}${whInstanceId}`;
          const existing = performerStatsMap.get(statsKey) || {
            oCounter: 0,
            playCount: 0,
            lastPlayedAt: null,
            lastOAt: null,
          };

          performerStatsMap.set(statsKey, {
            oCounter: existing.oCounter + (wh.oCount || 0),
            playCount: existing.playCount + (wh.playCount || 0),
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

        // Aggregate studio (using composite key: studioId + instanceId)
        if (scene.studio) {
          const statsKey = `${scene.studio.id}${KEY_SEP}${whInstanceId}`;
          const existing = studioStatsMap.get(statsKey) || {
            oCounter: 0,
            playCount: 0,
          };

          studioStatsMap.set(statsKey, {
            oCounter: existing.oCounter + (wh.oCount || 0),
            playCount: existing.playCount + (wh.playCount || 0),
          });
        }

        // Aggregate tags (using composite key: tagId + instanceId)
        for (const tag of scene.tags || []) {
          const statsKey = `${tag.id}${KEY_SEP}${whInstanceId}`;
          const existing = tagStatsMap.get(statsKey) || {
            oCounter: 0,
            playCount: 0,
          };

          tagStatsMap.set(statsKey, {
            oCounter: existing.oCounter + (wh.oCount || 0),
            playCount: existing.playCount + (wh.playCount || 0),
          });
        }
      }

      // Bulk insert aggregated stats
      // Note: We already deleted all existing stats above, so no duplicates possible
      await Promise.all([
        // Performers
        prisma.userPerformerStats.createMany({
          data: Array.from(performerStatsMap.entries()).map(
            ([key, stats]) => {
              const [performerId, instanceId] = key.split(KEY_SEP);
              return {
                userId,
                instanceId: instanceId || "",
                performerId,
                oCounter: stats.oCounter,
                playCount: stats.playCount,
                lastPlayedAt: stats.lastPlayedAt,
                lastOAt: stats.lastOAt,
              };
            }
          ),
        }),
        // Studios
        prisma.userStudioStats.createMany({
          data: Array.from(studioStatsMap.entries()).map(
            ([key, stats]) => {
              const [studioId, instanceId] = key.split(KEY_SEP);
              return {
                userId,
                instanceId: instanceId || "",
                studioId,
                oCounter: stats.oCounter,
                playCount: stats.playCount,
              };
            }
          ),
        }),
        // Tags
        prisma.userTagStats.createMany({
          data: Array.from(tagStatsMap.entries()).map(([key, stats]) => {
            const [tagId, instanceId] = key.split(KEY_SEP);
            return {
              userId,
              instanceId: instanceId || "",
              tagId,
              oCounter: stats.oCounter,
              playCount: stats.playCount,
            };
          }),
        }),
      ]);

      logger.info("Stats rebuild complete", {
        userId,
        performerCount: performerStatsMap.size,
        studioCount: studioStatsMap.size,
        tagCount: tagStatsMap.size,
      });
    } catch (error) {
      logger.error("Error rebuilding stats", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
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
