// server/services/RankingComputeService.ts
/**
 * Service to compute and store percentile rankings for user engagement stats.
 * Performer, studio and tag rankings are pre-computed and stored in the
 * UserEntityRanking table, for the stats page's top lists and Recommended.
 *
 * Algorithm:
 * 1. Fetch all entities of a type that the user has engaged with
 * 2. Calculate raw engagement score: (oCount × 5) + (normalizedDuration) + (playCount)
 * 3. Calculate engagement rate: engagementScore / libraryPresence
 * 4. Compute percentile rank within the user's engaged entities
 * 5. Store results in UserEntityRanking table
 *
 * Scenes are not stored: the stats page ranks its top scenes from the
 * user's watch history when it loads (UserStatsAggregationService, with
 * these weights and `percentileRank`). They were 92 % of each recompute's
 * writes for one top-10 list: a user with 17k watched scenes at 200k scenes
 * held the lock 0.5 s to rewrite them, where the read costs 50 ms.
 *
 * Only live entities count: a soft-deleted performer, studio or tag gets no
 * ranking, and a deleted scene adds nothing to an entity's library presence
 * or watch time, nor to the average scene duration. The user's watch history
 * drives each scene lookup (`WatchHistory w CROSS JOIN StashScene s`): left
 * to itself, SQLite may walk every live scene and probe the history instead
 * (0.12 s against 0.03 s at 200k scenes).
 *
 * `ensureFresh` is the entry point: each user is recomputed at most once an
 * hour, and callers arriving during a recompute share it. `forget` makes the
 * next call recompute at once (after an import, a history clear, a user
 * deletion); a recompute already running then writes nothing more, since
 * it read what came before, and the one started after it has the last word.
 */
import { Prisma } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import { dbWrite, dbWriteBatchIf } from "../utils/dbWrite.js";
import { logger } from "../utils/logger.js";

/** Engagement score = oCount × 5 + watched time / average scene length + plays */
export const RANKING_WEIGHTS = {
  oCount: 5,
  duration: 1,
  playCount: 1,
} as const;

/** How long a user's rankings stay fresh after a recompute starts */
const FRESH_FOR_MS = 60 * 60 * 1000;

type EntityType = "performer" | "studio" | "tag";

/**
 * Whether the recompute is still the user's: false once `forget` was called
 * after it started. Asked from memory, so a write unit can ask it when it
 * starts.
 */
type StillCurrent = () => boolean;

const ALWAYS_CURRENT: StillCurrent = () => true;

/**
 * The percentile of the entity at `index` (0 = the most engaged) among
 * `count`: 100 for the first, 0 for the last (and for one alone). Entities
 * tied with the one before them take its index.
 */
export function percentileRank(index: number, count: number): number {
  return Math.round((100 * (count - index - 1)) / Math.max(count - 1, 1));
}

/** One user's last recompute, kept for the life of the process */
interface Freshness {
  /** When the last successful recompute started (ms since the epoch); 0 when none is known */
  computedAt: number;
  /** The check or recompute in progress, shared by every caller */
  running?: Promise<void>;
}

// Raw SQL hands integers back as bigint (a COUNT, a SUM, a COALESCE with a
// literal), and a column can read as a float (#410): every number here goes
// through Number(), and the Int ones through Math.round()
interface RawEntityStats {
  entityId: string;
  instanceId: string;
  playCount: number | bigint;
  oCount: number | bigint;
  playDuration: number | bigint;
  libraryPresence: number | bigint;
}

interface ComputedRanking extends Omit<
  RawEntityStats,
  "playCount" | "oCount" | "playDuration" | "libraryPresence"
> {
  playCount: number;
  oCount: number;
  playDuration: number;
  libraryPresence: number;
  engagementScore: number;
  engagementRate: number;
  percentileRank: number;
}

class RankingComputeService {
  private readonly freshness = new Map<number, Freshness>();

  /**
   * Makes the user's rankings at most an hour old. A recompute already
   * running is joined, not repeated, and one that finds nothing to rank
   * still counts, so a user with no engagement is recomputed once an hour
   * rather than on every call. After a restart, the newest ranking row says
   * when the last recompute ran.
   *
   * With `wait` (the stats page), resolves once the rankings are fresh and
   * rejects when the recompute fails. Without it (login, Recommended),
   * returns at once and the recompute runs in the background. A failure is
   * logged either way, and the next call tries again.
   */
  async ensureFresh(
    userId: number,
    { wait = false }: { wait?: boolean } = {}
  ): Promise<void> {
    const refresh = this.refresh(userId);
    if (wait) {
      await refresh;
      return;
    }
    // Already logged by refresh; the next call tries again
    refresh.catch(() => undefined);
  }

  /**
   * Forgets when the user's rankings were computed: the next `ensureFresh`
   * recomputes them. A recompute running now read what came before, so it
   * stops: a write of it still waiting in the writer queue writes nothing,
   * it starts no other, and it records nothing. For a deleted user, and
   * after a change to what the rankings are computed from, once that change
   * is written. The user stays known, as stale, rather than removed: an
   * unknown user's freshness is read from their newest ranking row (after a
   * restart), which cannot tell that anything changed since.
   */
  forget(userId: number): void {
    this.freshness.set(userId, { computedAt: 0 });
  }

  private refresh(userId: number): Promise<void> {
    const known = this.freshness.get(userId);
    if (known?.running) return known.running;
    if (known && Date.now() - known.computedAt < FRESH_FOR_MS) {
      return Promise.resolve();
    }

    const entry: Freshness = { computedAt: known?.computedAt ?? 0 };
    // The entry stays the user's until the recompute lands, unless `forget`
    // replaces it: a recompute that started before `forget` then writes and
    // records nothing more
    const current: StillCurrent = () => this.freshness.get(userId) === entry;
    const record = (computedAt: number) => {
      if (current()) this.freshness.set(userId, { computedAt });
    };
    entry.running = this.recomputeIfStale(
      userId,
      known?.computedAt,
      current
    ).then(
      (computedAt) => {
        record(computedAt);
      },
      (error: unknown) => {
        // computedAt stays as it was, so the next call tries again
        record(entry.computedAt);
        logger.error("Ranking recompute failed", { userId, error });
        throw error;
      }
    );
    this.freshness.set(userId, entry);
    return entry.running;
  }

  /**
   * Recomputes the user's rankings, unless nothing is known about them yet
   * (after a restart) and the newest ranking row is under an hour old.
   * Resolves to the time the rankings in the table were computed.
   */
  private async recomputeIfStale(
    userId: number,
    knownComputedAt: number | undefined,
    current: StillCurrent
  ): Promise<number> {
    if (knownComputedAt === undefined) {
      const newest = await prisma.userEntityRanking.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      });
      const writtenAt = newest?.updatedAt.getTime();
      if (writtenAt !== undefined && Date.now() - writtenAt < FRESH_FOR_MS) {
        return writtenAt;
      }
    }
    const startedAt = Date.now();
    await this.recomputeAllRankings(userId, current);
    return startedAt;
  }

  /**
   * Recompute all rankings for a user, whatever their age. Callers go
   * through `ensureFresh`, which also logs a failure. Once `current` says
   * no, the recompute stops and writes nothing more.
   */
  async recomputeAllRankings(
    userId: number,
    current: StillCurrent = ALWAYS_CURRENT
  ): Promise<void> {
    const startTime = Date.now();
    logger.debug("Starting ranking computation", { userId });

    // Get average scene duration for normalization
    const avgSceneDuration = await this.getAverageSceneDuration();

    // One type after another: run together, the reads contend for the
    // pool's connections and the disk
    const types = [
      () => this.computePerformerRankings(userId, avgSceneDuration, current),
      () => this.computeStudioRankings(userId, avgSceneDuration, current),
      () => this.computeTagRankings(userId, avgSceneDuration, current),
    ];
    let rankings = 0;
    for (const compute of types) {
      if (!current()) {
        logger.debug("Ranking recompute stopped: the user was forgotten", {
          userId,
        });
        return;
      }
      rankings += await compute();
    }

    logger.info("Ranking computation complete", {
      userId,
      durationMs: Date.now() - startTime,
      rankings,
    });
  }

  /**
   * The average live scene duration in seconds, which normalizes watch
   * times (1200 when no scene has one)
   */
  async getAverageSceneDuration(): Promise<number> {
    const result = await prisma.$queryRaw<
      Array<{ avgDuration: number | null }>
    >`
      SELECT AVG(duration) as avgDuration
      FROM StashScene
      WHERE duration > 0 AND deletedAt IS NULL
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
  private computePercentileRanks(
    entities: RawEntityStats[],
    avgSceneDuration: number
  ): ComputedRanking[] {
    if (entities.length === 0) return [];

    // Calculate scores (convert BigInt values from SQL to Number)
    // Round Int fields to prevent "cannot be converted to a BigInt" errors
    // when SQLite returns float values due to type affinity edge cases
    const scored = entities.map((e) => {
      const playCount = Math.round(Number(e.playCount));
      const oCount = Math.round(Number(e.oCount));
      const playDuration = Number(e.playDuration);
      const libraryPresence = Math.round(Number(e.libraryPresence));

      const normalizedDuration = playDuration / avgSceneDuration;
      const engagementScore = this.calculateEngagementScore(
        oCount,
        normalizedDuration,
        playCount
      );
      const engagementRate = engagementScore / Math.max(libraryPresence, 1);
      return {
        entityId: e.entityId,
        instanceId: e.instanceId,
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
      const item = scored[i] as (typeof scored)[number];
      item.percentileRank = percentileRank(i, n);
    }

    // Handle ties: entities with same engagement rate get same percentile
    for (let i = 1; i < n; i++) {
      const current = scored[i] as (typeof scored)[number];
      const previous = scored[i - 1] as (typeof scored)[number];
      if (Math.abs(current.engagementRate - previous.engagementRate) < 0.0001) {
        current.percentileRank = previous.percentileRank;
      }
    }

    return scored;
  }

  /**
   * Replaces the user's rankings of the type, unless `current` says no
   * when the write unit starts: a recompute that started before `forget`
   * read what came before, and one started after it may already have
   * written, so this write would put the old rankings back.
   */
  private async upsertRankings(
    userId: number,
    entityType: EntityType,
    rankings: ComputedRanking[],
    current: StillCurrent
  ): Promise<void> {
    if (rankings.length === 0) {
      // Clear any existing rankings for this entity type
      await dbWrite("rankings", async () =>
        current()
          ? prisma.userEntityRanking.deleteMany({
              where: { userId, entityType },
            })
          : null
      );
      return;
    }

    // Replace this user's rankings of the type in one batch: the statements
    // are built first, so the unit makes no Node round trip under the lock.
    // A user deleted while this recompute ran (deleteUser's unit ran first)
    // has no row for the foreign key: the batch is refused and rolls back,
    // and there is nothing left to write for them.
    try {
      await dbWriteBatchIf("rankings", current, [
        prisma.userEntityRanking.deleteMany({
          where: { userId, entityType },
        }),
        prisma.userEntityRanking.createMany({
          data: rankings.map((r) => ({
            userId,
            instanceId: r.instanceId,
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
        }),
      ]);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        logger.debug("Rankings not written: the user no longer exists", {
          userId,
          entityType,
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Compute performer rankings.
   *
   * Library presence is the performer's live scenes: all its junction rows
   * (a covering-index scan) minus those of soft-deleted scenes, which are
   * few and found from the scene side (`StashScene s CROSS JOIN
   * ScenePerformer sp`; otherwise SQLite walks every junction row). Joining
   * every junction row to StashScene for its deletedAt instead costs 0.4 s
   * at 200k scenes, against 0.1 s this way. At least 1, as before.
   */
  private async computePerformerRankings(
    userId: number,
    avgSceneDuration: number,
    current: StillCurrent
  ): Promise<number> {
    const stats = await prisma.$queryRaw<RawEntityStats[]>`
      SELECT
        ups.performerId as entityId,
        ups.instanceId,
        ups.playCount,
        ups.oCounter as oCount,
        COALESCE(dur.totalDuration, 0) as playDuration,
        MAX(COALESCE(lib.sceneCount, 0) - COALESCE(gone.sceneCount, 0), 1) as libraryPresence
      FROM UserPerformerStats ups
      JOIN StashPerformer p
        ON p.id = ups.performerId
        AND p.stashInstanceId = ups.instanceId
        AND p.deletedAt IS NULL
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'performer'
        AND e.entityId = ups.performerId
        AND (e.instanceId = '' OR e.instanceId = ups.instanceId)
      LEFT JOIN (
        SELECT sp.performerId, sp.performerInstanceId as instanceId, SUM(w.playDuration) as totalDuration
        FROM WatchHistory w
        CROSS JOIN StashScene s ON s.id = w.sceneId AND s.stashInstanceId = w.instanceId AND s.deletedAt IS NULL
        JOIN ScenePerformer sp ON sp.sceneId = w.sceneId AND sp.sceneInstanceId = w.instanceId
        WHERE w.userId = ${userId}
        GROUP BY sp.performerId, sp.performerInstanceId
      ) dur ON dur.performerId = ups.performerId AND dur.instanceId = ups.instanceId
      LEFT JOIN (
        SELECT performerId, performerInstanceId as instanceId, COUNT(*) as sceneCount
        FROM ScenePerformer
        GROUP BY performerId, performerInstanceId
      ) lib ON lib.performerId = ups.performerId AND lib.instanceId = ups.instanceId
      LEFT JOIN (
        SELECT sp.performerId, sp.performerInstanceId as instanceId, COUNT(*) as sceneCount
        FROM StashScene s
        CROSS JOIN ScenePerformer sp ON sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
        WHERE s.deletedAt IS NOT NULL
        GROUP BY sp.performerId, sp.performerInstanceId
      ) gone ON gone.performerId = ups.performerId AND gone.instanceId = ups.instanceId
      WHERE ups.userId = ${userId}
        AND e.id IS NULL
        AND (ups.playCount > 0 OR ups.oCounter > 0)
    `;

    const rankings = this.computePercentileRanks(stats, avgSceneDuration);
    await this.upsertRankings(userId, "performer", rankings, current);
    return rankings.length;
  }

  /**
   * Compute studio rankings
   */
  private async computeStudioRankings(
    userId: number,
    avgSceneDuration: number,
    current: StillCurrent
  ): Promise<number> {
    const stats = await prisma.$queryRaw<RawEntityStats[]>`
      SELECT
        uss.studioId as entityId,
        uss.instanceId,
        uss.playCount,
        uss.oCounter as oCount,
        COALESCE(dur.totalDuration, 0) as playDuration,
        COALESCE(lib.sceneCount, 1) as libraryPresence
      FROM UserStudioStats uss
      JOIN StashStudio st
        ON st.id = uss.studioId
        AND st.stashInstanceId = uss.instanceId
        AND st.deletedAt IS NULL
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'studio'
        AND e.entityId = uss.studioId
        AND (e.instanceId = '' OR e.instanceId = uss.instanceId)
      LEFT JOIN (
        SELECT s.studioId, s.stashInstanceId as instanceId, SUM(w.playDuration) as totalDuration
        FROM WatchHistory w
        CROSS JOIN StashScene s ON s.id = w.sceneId AND s.stashInstanceId = w.instanceId AND s.deletedAt IS NULL
        WHERE w.userId = ${userId} AND s.studioId IS NOT NULL
        GROUP BY s.studioId, s.stashInstanceId
      ) dur ON dur.studioId = uss.studioId AND dur.instanceId = uss.instanceId
      LEFT JOIN (
        SELECT studioId, stashInstanceId as instanceId, COUNT(*) as sceneCount
        FROM StashScene
        WHERE studioId IS NOT NULL AND deletedAt IS NULL
        GROUP BY studioId, stashInstanceId
      ) lib ON lib.studioId = uss.studioId AND lib.instanceId = uss.instanceId
      WHERE uss.userId = ${userId}
        AND e.id IS NULL
        AND (uss.playCount > 0 OR uss.oCounter > 0)
    `;

    const rankings = this.computePercentileRanks(stats, avgSceneDuration);
    await this.upsertRankings(userId, "studio", rankings, current);
    return rankings.length;
  }

  /**
   * Compute tag rankings. Library presence is counted as for performers:
   * all the tag's junction rows minus those of soft-deleted scenes (0.15 s
   * at 200k scenes, against 0.6 s joining every row to StashScene).
   */
  private async computeTagRankings(
    userId: number,
    avgSceneDuration: number,
    current: StillCurrent
  ): Promise<number> {
    const stats = await prisma.$queryRaw<RawEntityStats[]>`
      SELECT
        uts.tagId as entityId,
        uts.instanceId,
        uts.playCount,
        uts.oCounter as oCount,
        COALESCE(dur.totalDuration, 0) as playDuration,
        MAX(COALESCE(lib.sceneCount, 0) - COALESCE(gone.sceneCount, 0), 1) as libraryPresence
      FROM UserTagStats uts
      JOIN StashTag t
        ON t.id = uts.tagId
        AND t.stashInstanceId = uts.instanceId
        AND t.deletedAt IS NULL
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'tag'
        AND e.entityId = uts.tagId
        AND (e.instanceId = '' OR e.instanceId = uts.instanceId)
      LEFT JOIN (
        SELECT st.tagId, st.tagInstanceId as instanceId, SUM(w.playDuration) as totalDuration
        FROM WatchHistory w
        CROSS JOIN StashScene s ON s.id = w.sceneId AND s.stashInstanceId = w.instanceId AND s.deletedAt IS NULL
        JOIN SceneTag st ON st.sceneId = w.sceneId AND st.sceneInstanceId = w.instanceId
        WHERE w.userId = ${userId}
        GROUP BY st.tagId, st.tagInstanceId
      ) dur ON dur.tagId = uts.tagId AND dur.instanceId = uts.instanceId
      LEFT JOIN (
        SELECT tagId, tagInstanceId as instanceId, COUNT(*) as sceneCount
        FROM SceneTag
        GROUP BY tagId, tagInstanceId
      ) lib ON lib.tagId = uts.tagId AND lib.instanceId = uts.instanceId
      LEFT JOIN (
        SELECT st.tagId, st.tagInstanceId as instanceId, COUNT(*) as sceneCount
        FROM StashScene s
        CROSS JOIN SceneTag st ON st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId
        WHERE s.deletedAt IS NOT NULL
        GROUP BY st.tagId, st.tagInstanceId
      ) gone ON gone.tagId = uts.tagId AND gone.instanceId = uts.instanceId
      WHERE uts.userId = ${userId}
        AND e.id IS NULL
        AND (uts.playCount > 0 OR uts.oCounter > 0)
    `;

    const rankings = this.computePercentileRanks(stats, avgSceneDuration);
    await this.upsertRankings(userId, "tag", rankings, current);
    return rankings.length;
  }
}

export const rankingComputeService = new RankingComputeService();
export default rankingComputeService;
