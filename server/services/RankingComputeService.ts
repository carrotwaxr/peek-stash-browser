// server/services/RankingComputeService.ts
/**
 * Service to compute and store percentile rankings for user engagement stats.
 * Rankings are pre-computed and stored in UserEntityRanking table for fast retrieval.
 *
 * Algorithm:
 * 1. Fetch all entities of a type that the user has engaged with
 * 2. Calculate raw engagement score: (oCount × 5) + (normalizedDuration) + (playCount)
 * 3. Calculate engagement rate: engagementScore / libraryPresence
 * 4. Compute percentile rank within the user's engaged entities
 * 5. Store results in UserEntityRanking table
 */

import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

const RANKING_WEIGHTS = {
  oCount: 5,
  duration: 1,
  playCount: 1,
};

type EntityType = "performer" | "studio" | "tag" | "scene";

interface RawEntityStats {
  entityId: string;
  instanceId: string;
  playCount: number;
  oCount: number;
  playDuration: number;
  libraryPresence: number;
}

interface ComputedRanking extends RawEntityStats {
  engagementScore: number;
  engagementRate: number;
  percentileRank: number;
}

class RankingComputeService {
  /**
   * Recompute all rankings for a user
   * Call this on login or after significant engagement changes
   */
  async recomputeAllRankings(userId: number): Promise<void> {
    const startTime = Date.now();
    logger.info("Starting ranking computation", { userId });

    try {
      // Get average scene duration for normalization
      const avgSceneDuration = await this.getAverageSceneDuration();

      // Compute rankings for each entity type in parallel
      await Promise.all([
        this.computePerformerRankings(userId, avgSceneDuration),
        this.computeStudioRankings(userId, avgSceneDuration),
        this.computeTagRankings(userId, avgSceneDuration),
        this.computeSceneRankings(userId, avgSceneDuration),
      ]);

      const duration = Date.now() - startTime;
      logger.info("Ranking computation complete", { userId, durationMs: duration });
    } catch (error) {
      logger.error("Failed to compute rankings", {
        userId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get average scene duration for normalizing watch times
   */
  private async getAverageSceneDuration(): Promise<number> {
    const result = await prisma.$queryRaw<Array<{ avgDuration: number | null }>>`
      SELECT AVG(duration) as avgDuration FROM StashScene WHERE duration > 0
    `;
    return Number(result[0]?.avgDuration) || 1200; // Default 20 min
  }

  /**
   * Calculate raw engagement score from metrics
   */
  private calculateEngagementScore(
    oCount: number,
    normalizedDuration: number,
    playCount: number
  ): number {
    return (
      oCount * RANKING_WEIGHTS.oCount +
      normalizedDuration * RANKING_WEIGHTS.duration +
      playCount * RANKING_WEIGHTS.playCount
    );
  }

  /**
   * Compute percentile ranks for a list of entities
   * Returns entities sorted by engagement rate with percentile ranks assigned
   */
  private computePercentileRanks(entities: RawEntityStats[], avgSceneDuration: number): ComputedRanking[] {
    if (entities.length === 0) return [];

    // Calculate scores (convert BigInt values from SQL to Number)
    const scored = entities.map((e) => {
      const playCount = Number(e.playCount);
      const oCount = Number(e.oCount);
      const playDuration = Number(e.playDuration);
      const libraryPresence = Number(e.libraryPresence);

      const normalizedDuration = playDuration / avgSceneDuration;
      const engagementScore = this.calculateEngagementScore(oCount, normalizedDuration, playCount);
      const engagementRate = engagementScore / Math.max(libraryPresence, 1);
      return {
        entityId: e.entityId,
        instanceId: e.instanceId || "",
        playCount,
        oCount,
        playDuration,
        libraryPresence,
        engagementScore,
        engagementRate,
        percentileRank: 0, // Will be computed below
      };
    });

    // Sort by engagement rate descending
    scored.sort((a, b) => b.engagementRate - a.engagementRate);

    // Assign percentile ranks (100 = best, 0 = worst)
    const n = scored.length;
    for (let i = 0; i < n; i++) {
      // Formula: percentile = 100 * (n - rank) / n
      // Where rank is 1-indexed position (1 = best)
      scored[i].percentileRank = Math.round((100 * (n - i - 1)) / Math.max(n - 1, 1));
    }

    // Handle ties: entities with same engagement rate get same percentile
    for (let i = 1; i < n; i++) {
      if (Math.abs(scored[i].engagementRate - scored[i - 1].engagementRate) < 0.0001) {
        scored[i].percentileRank = scored[i - 1].percentileRank;
      }
    }

    return scored;
  }

  /**
   * Upsert rankings into database
   */
  private async upsertRankings(
    userId: number,
    entityType: EntityType,
    rankings: ComputedRanking[]
  ): Promise<void> {
    if (rankings.length === 0) {
      // Clear any existing rankings for this entity type
      await prisma.userEntityRanking.deleteMany({
        where: { userId, entityType },
      });
      return;
    }

    // Delete existing rankings for this user/type and insert new ones
    // Using transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      await tx.userEntityRanking.deleteMany({
        where: { userId, entityType },
      });

      await tx.userEntityRanking.createMany({
        data: rankings.map((r) => ({
          userId,
          instanceId: r.instanceId || "",
          entityType,
          entityId: r.entityId,
          playCount: r.playCount,
          playDuration: r.playDuration,
          oCount: r.oCount,
          engagementScore: r.engagementScore,
          libraryPresence: r.libraryPresence,
          engagementRate: r.engagementRate,
          percentileRank: r.percentileRank,
        })),
      });
    });
  }

  /**
   * Compute performer rankings
   */
  private async computePerformerRankings(userId: number, avgSceneDuration: number): Promise<void> {
    const stats = await prisma.$queryRaw<RawEntityStats[]>`
      SELECT
        ups.performerId as entityId,
        ups.instanceId,
        ups.playCount,
        ups.oCounter as oCount,
        COALESCE(dur.totalDuration, 0) as playDuration,
        COALESCE(lib.sceneCount, 1) as libraryPresence
      FROM UserPerformerStats ups
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'performer'
        AND e.entityId = ups.performerId
      LEFT JOIN (
        SELECT sp.performerId, SUM(w.playDuration) as totalDuration
        FROM ScenePerformer sp
        JOIN WatchHistory w ON w.sceneId = sp.sceneId AND w.userId = ${userId}
        GROUP BY sp.performerId
      ) dur ON dur.performerId = ups.performerId
      LEFT JOIN (
        SELECT performerId, COUNT(*) as sceneCount
        FROM ScenePerformer
        GROUP BY performerId
      ) lib ON lib.performerId = ups.performerId
      WHERE ups.userId = ${userId}
        AND e.id IS NULL
        AND (ups.playCount > 0 OR ups.oCounter > 0)
    `;

    const rankings = this.computePercentileRanks(stats, avgSceneDuration);
    await this.upsertRankings(userId, "performer", rankings);
  }

  /**
   * Compute studio rankings
   */
  private async computeStudioRankings(userId: number, avgSceneDuration: number): Promise<void> {
    const stats = await prisma.$queryRaw<RawEntityStats[]>`
      SELECT
        uss.studioId as entityId,
        uss.instanceId,
        uss.playCount,
        uss.oCounter as oCount,
        COALESCE(dur.totalDuration, 0) as playDuration,
        COALESCE(lib.sceneCount, 1) as libraryPresence
      FROM UserStudioStats uss
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'studio'
        AND e.entityId = uss.studioId
      LEFT JOIN (
        SELECT s.studioId, SUM(w.playDuration) as totalDuration
        FROM StashScene s
        JOIN WatchHistory w ON w.sceneId = s.id AND w.userId = ${userId}
        WHERE s.studioId IS NOT NULL
        GROUP BY s.studioId
      ) dur ON dur.studioId = uss.studioId
      LEFT JOIN (
        SELECT studioId, COUNT(*) as sceneCount
        FROM StashScene
        WHERE studioId IS NOT NULL
        GROUP BY studioId
      ) lib ON lib.studioId = uss.studioId
      WHERE uss.userId = ${userId}
        AND e.id IS NULL
        AND (uss.playCount > 0 OR uss.oCounter > 0)
    `;

    const rankings = this.computePercentileRanks(stats, avgSceneDuration);
    await this.upsertRankings(userId, "studio", rankings);
  }

  /**
   * Compute tag rankings
   */
  private async computeTagRankings(userId: number, avgSceneDuration: number): Promise<void> {
    const stats = await prisma.$queryRaw<RawEntityStats[]>`
      SELECT
        uts.tagId as entityId,
        uts.instanceId,
        uts.playCount,
        uts.oCounter as oCount,
        COALESCE(dur.totalDuration, 0) as playDuration,
        COALESCE(lib.sceneCount, 1) as libraryPresence
      FROM UserTagStats uts
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'tag'
        AND e.entityId = uts.tagId
      LEFT JOIN (
        SELECT st.tagId, SUM(w.playDuration) as totalDuration
        FROM SceneTag st
        JOIN WatchHistory w ON w.sceneId = st.sceneId AND w.userId = ${userId}
        GROUP BY st.tagId
      ) dur ON dur.tagId = uts.tagId
      LEFT JOIN (
        SELECT tagId, COUNT(*) as sceneCount
        FROM SceneTag
        GROUP BY tagId
      ) lib ON lib.tagId = uts.tagId
      WHERE uts.userId = ${userId}
        AND e.id IS NULL
        AND (uts.playCount > 0 OR uts.oCounter > 0)
    `;

    const rankings = this.computePercentileRanks(stats, avgSceneDuration);
    await this.upsertRankings(userId, "tag", rankings);
  }

  /**
   * Compute scene rankings
   * Scenes don't have library presence normalization - just raw engagement scores
   */
  private async computeSceneRankings(userId: number, avgSceneDuration: number): Promise<void> {
    const stats = await prisma.$queryRaw<RawEntityStats[]>`
      SELECT
        w.sceneId as entityId,
        COALESCE(w.instanceId, '') as instanceId,
        w.playCount,
        w.oCount,
        w.playDuration,
        1 as libraryPresence
      FROM WatchHistory w
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'scene'
        AND e.entityId = w.sceneId
      WHERE w.userId = ${userId}
        AND e.id IS NULL
        AND (w.playCount > 0 OR w.oCount > 0 OR w.playDuration > 0)
    `;

    const rankings = this.computePercentileRanks(stats, avgSceneDuration);
    await this.upsertRankings(userId, "scene", rankings);
  }
}

export const rankingComputeService = new RankingComputeService();
export default rankingComputeService;
