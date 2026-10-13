// server/services/RankingComputeService.ts
/**
 * Service to compute and store percentile rankings for user engagement stats.
 * Performer, studio and tag rankings are pre-computed and stored in the
 * UserEntityRanking table, for the stats page's top lists and Recommended.
 *
 * Algorithm, per type, over every entity on a scene in the user's history:
 * 1. Per history row, eng = oCount × 5 + watched time / average scene length
 *    + plays, and a decay by when it was last played (1 under 90 days, then
 *    0.8, 0.6, 0.4, and 0.25 past two years or never)
 * 2. engagementScore = the entity's eng, all time; percentileRank orders by it
 * 3. engagementRate = its decayed eng per live scene, smoothed toward the
 *    user's mean over k = max(5, median presence) scenes, so a few plays
 *    of a one-scene performer stay near the mean
 * 4. affinity, in [-1, 1]: half the rate's lift over the mean (likes only),
 *    half the lift of how often the user kept (played, O'd or watched two
 *    minutes of) the entity's scenes they opened over their own kept rate,
 *    both decayed; skipped opens push it below 0, which is how dislikes
 *    show, except for an entity the user pressed O on
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
 * `count`: 100 for the first (and for one alone), 0 for the last of several.
 * Entities tied with the one before them take its index.
 */
export function percentileRank(index: number, count: number): number {
  if (count <= 1) return 100;
  return Math.round((100 * (count - index - 1)) / (count - 1));
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
/** One entity's totals over the user's history rows on its live scenes */
export interface RawEntityStats {
  entityId: string;
  instanceId: string;
  playCount: number | bigint;
  oCount: number | bigint;
  playDuration: number | bigint;
  /** The same three sums, each history row weighted by its decay */
  decayedPlayCount: number | bigint;
  decayedOCount: number | bigint;
  decayedPlayDuration: number | bigint;
  /** History rows: scenes of the entity the user opened */
  openedCount: number | bigint;
  /** Of those, the ones kept: played, O'd or watched `KEPT_MIN_SECONDS` */
  keptCount: number | bigint;
  /** The same two counts, each history row weighted by its decay */
  decayedOpened: number | bigint;
  decayedKept: number | bigint;
  libraryPresence: number | bigint;
}

export interface ComputedRanking {
  entityId: string;
  instanceId: string;
  playCount: number;
  oCount: number;
  playDuration: number;
  openedCount: number;
  keptCount: number;
  libraryPresence: number;
  engagementScore: number;
  engagementRate: number;
  percentileRank: number;
  affinity: number;
}

/** What `computeRankings` needs beside the rows */
export interface RankingInputs {
  /** The average live scene duration in seconds, which normalizes watch time */
  avgSceneDuration: number;
  /**
   * The user's kept share of all their history rows on live scenes, each
   * row weighted by its decay
   */
  keptBase: number;
}

/** Days since the last play, and each band's weight; older or never: 0.25 */
const DECAY_BANDS = [
  { days: 90, weight: 1 },
  { days: 180, weight: 0.8 },
  { days: 365, weight: 0.6 },
  { days: 730, weight: 0.4 },
] as const;
const DECAY_FLOOR = 0.25;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A history row is kept when the user played it, pressed O on it, or
 * watched at least this many seconds of it; a shorter open is a skip
 */
export const KEPT_MIN_SECONDS = 120;

/** The smoothing's prior weight in scenes is at least this */
const MIN_PRIOR_SCENES = 5;
/** The kept rate's prior weight, in opened scenes */
const KEPT_PRIOR_OPENS = 4;

/**
 * Each history row's decay weight by `w.lastPlayedAt` (epoch milliseconds,
 * as Prisma stores it), against cutoffs bound from `now`
 */
function decaySql(now: number): Prisma.Sql {
  const arms = DECAY_BANDS.map(
    ({ days, weight }) =>
      Prisma.sql`WHEN w.lastPlayedAt >= ${now - days * DAY_MS} THEN ${weight}`
  );
  return Prisma.sql`(CASE ${Prisma.join(arms, " ")} ELSE ${DECAY_FLOOR} END)`;
}

/** 1 when the history row `w` is kept, else 0 */
const keptSql = (): Prisma.Sql =>
  Prisma.sql`(w.playCount > 0 OR w.oCount > 0 OR w.playDuration >= ${KEPT_MIN_SECONDS})`;

/**
 * One entity's sums over the history rows of `w` grouped under it (the
 * columns of `RawEntityStats` but its key and presence), each row decayed
 * by its age at `now`
 */
function historySums(now: number): Prisma.Sql {
  const decay = decaySql(now);
  const kept = keptSql();
  return Prisma.sql`SUM(w.playCount) AS playCount,
          SUM(w.oCount) AS oCount,
          SUM(w.playDuration) AS playDuration,
          SUM(${decay} * w.playCount) AS decayedPlayCount,
          SUM(${decay} * w.oCount) AS decayedOCount,
          SUM(${decay} * w.playDuration) AS decayedPlayDuration,
          COUNT(*) AS openedCount,
          SUM(${kept}) AS keptCount,
          SUM(${decay}) AS decayedOpened,
          SUM(${decay} * ${kept}) AS decayedKept`;
}

/** The outer select list of `historySums`' subquery `h` */
const HISTORY_COLUMNS = Prisma.sql`h.entityId, h.instanceId, h.playCount,
        h.oCount, h.playDuration, h.decayedPlayCount, h.decayedOCount,
        h.decayedPlayDuration, h.openedCount, h.keptCount, h.decayedOpened,
        h.decayedKept`;

/** Engagement: oCount × 5 + watched time / average scene length + plays */
function engagement(
  oCount: number,
  playDuration: number,
  playCount: number,
  avgSceneDuration: number
): number {
  return (
    oCount * RANKING_WEIGHTS.oCount +
    (playDuration / avgSceneDuration) * RANKING_WEIGHTS.duration +
    playCount * RANKING_WEIGHTS.playCount
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * Ranks one type's entities for a user: the engagement score and its
 * percentile, the smoothed decayed rate and the affinity (see the header).
 * Returned in descending engagement score.
 */
export function computeRankings(
  rows: RawEntityStats[],
  { avgSceneDuration, keptBase }: RankingInputs
): ComputedRanking[] {
  if (rows.length === 0) return [];

  const read = rows.map((e) => {
    const playCount = Math.round(Number(e.playCount));
    const oCount = Math.round(Number(e.oCount));
    const playDuration = Number(e.playDuration);
    return {
      entityId: e.entityId,
      instanceId: e.instanceId,
      playCount,
      oCount,
      playDuration,
      openedCount: Math.round(Number(e.openedCount)),
      keptCount: Math.round(Number(e.keptCount)),
      decayedOpened: Number(e.decayedOpened),
      decayedKept: Number(e.decayedKept),
      libraryPresence: Math.max(Math.round(Number(e.libraryPresence)), 1),
      engagementScore: engagement(
        oCount,
        playDuration,
        playCount,
        avgSceneDuration
      ),
      decayed: engagement(
        Number(e.decayedOCount),
        Number(e.decayedPlayDuration),
        Number(e.decayedPlayCount),
        avgSceneDuration
      ),
    };
  });

  const totalDecayed = read.reduce((sum, e) => sum + e.decayed, 0);
  const totalPresence = read.reduce((sum, e) => sum + e.libraryPresence, 0);
  const mu = totalDecayed / totalPresence;
  const k = Math.max(
    MIN_PRIOR_SCENES,
    median(read.map((e) => e.libraryPresence))
  );

  const ranked: ComputedRanking[] = read.map(
    ({ decayed, decayedOpened, decayedKept, ...e }) => {
      const rate = (decayed + k * mu) / (e.libraryPresence + k);
      const lift = mu > 0 ? rate / mu : 1;
      // Old and undated opens count as little as old plays. A user who kept
      // nothing anywhere gives no kept signal.
      const keptLift =
        keptBase > 0
          ? (decayedKept + KEPT_PRIOR_OPENS * keptBase) /
            (decayedOpened + KEPT_PRIOR_OPENS) /
            keptBase
          : 1;
      const affinity = clamp(
        0.5 * Math.max(0, Math.log2(lift)) + 0.5 * Math.log2(keptLift),
        -1,
        1
      );
      // An O is an explicit like: no pattern of skips outweighs it, so an
      // entity the user pressed O on is never disliked
      return {
        ...e,
        engagementRate: rate,
        affinity: e.oCount > 0 ? Math.max(0, affinity) : affinity,
        percentileRank: 0,
      };
    }
  );

  // Percentile by engagement score, 100 = the most engaged; an entity tied
  // with the one before it takes its percentile
  ranked.sort((a, b) => b.engagementScore - a.engagementScore);
  const n = ranked.length;
  ranked.forEach((item, i) => {
    const previous = ranked[i - 1];
    item.percentileRank =
      previous &&
      Math.abs(item.engagementScore - previous.engagementScore) < 0.0001
        ? previous.percentileRank
        : percentileRank(i, n);
  });
  return ranked;
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

    const now = Date.now();
    const inputs: RankingInputs = {
      avgSceneDuration: await this.getAverageSceneDuration(),
      keptBase: await this.getKeptBase(userId, now),
    };

    // One type after another: run together, the reads contend for the
    // pool's connections and the disk
    const types: Array<[EntityType, () => Promise<RawEntityStats[]>]> = [
      ["performer", () => this.performerStats(userId, now)],
      ["studio", () => this.studioStats(userId, now)],
      ["tag", () => this.tagStats(userId, now)],
    ];
    let rankings = 0;
    for (const [entityType, read] of types) {
      if (!current()) {
        logger.debug("Ranking recompute stopped: the user was forgotten", {
          userId,
        });
        return;
      }
      const ranked = computeRankings(await read(), inputs);
      await this.upsertRankings(userId, entityType, ranked, current);
      rankings += ranked.length;
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
   * The share of the user's history rows on live scenes that they kept
   * (`keptSql`), each row weighted by its decay at `now`, against which each
   * entity's kept rate is read; 1 with no history
   */
  private async getKeptBase(userId: number, now: number): Promise<number> {
    const decay = decaySql(now);
    const [row] = await prisma.$queryRaw<
      Array<{
        opened: number | bigint | null;
        kept: number | bigint | null;
      }>
    >`
      SELECT SUM(${decay}) AS opened, SUM(${decay} * ${keptSql()}) AS kept
      FROM WatchHistory w
      CROSS JOIN StashScene s ON s.id = w.sceneId AND s.stashInstanceId = w.instanceId AND s.deletedAt IS NULL
      WHERE w.userId = ${userId}
    `;
    const opened = Number(row?.opened ?? 0);
    return opened > 0 ? Number(row?.kept ?? 0) / opened : 1;
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
            openedCount: r.openedCount,
            keptCount: r.keptCount,
            affinity: r.affinity,
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
   * The user's performers, each with its history totals and library
   * presence.
   *
   * Library presence is the performer's live scenes: all its junction rows
   * (a covering-index scan) minus those of soft-deleted scenes, which are
   * few and found from the scene side (`StashScene s CROSS JOIN
   * ScenePerformer sp`; otherwise SQLite walks every junction row). Joining
   * every junction row to StashScene for its deletedAt instead costs 0.4 s
   * at 200k scenes, against 0.1 s this way. At least 1, as before.
   */
  private performerStats(
    userId: number,
    now: number
  ): Promise<RawEntityStats[]> {
    return prisma.$queryRaw<RawEntityStats[]>`
      SELECT
        ${HISTORY_COLUMNS},
        MAX(COALESCE(lib.sceneCount, 0) - COALESCE(gone.sceneCount, 0), 1) as libraryPresence
      FROM (
        SELECT sp.performerId AS entityId, sp.performerInstanceId AS instanceId,
          ${historySums(now)}
        FROM WatchHistory w
        CROSS JOIN StashScene s ON s.id = w.sceneId AND s.stashInstanceId = w.instanceId AND s.deletedAt IS NULL
        JOIN ScenePerformer sp ON sp.sceneId = w.sceneId AND sp.sceneInstanceId = w.instanceId
        WHERE w.userId = ${userId}
        GROUP BY sp.performerId, sp.performerInstanceId
      ) h
      JOIN StashPerformer p
        ON p.id = h.entityId
        AND p.stashInstanceId = h.instanceId
        AND p.deletedAt IS NULL
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'performer'
        AND e.entityId = h.entityId
        AND (e.instanceId = '' OR e.instanceId = h.instanceId)
      LEFT JOIN (
        SELECT performerId, performerInstanceId as instanceId, COUNT(*) as sceneCount
        FROM ScenePerformer
        GROUP BY performerId, performerInstanceId
      ) lib ON lib.performerId = h.entityId AND lib.instanceId = h.instanceId
      LEFT JOIN (
        SELECT sp.performerId, sp.performerInstanceId as instanceId, COUNT(*) as sceneCount
        FROM StashScene s
        CROSS JOIN ScenePerformer sp ON sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
        WHERE s.deletedAt IS NOT NULL
        GROUP BY sp.performerId, sp.performerInstanceId
      ) gone ON gone.performerId = h.entityId AND gone.instanceId = h.instanceId
      WHERE e.id IS NULL
    `;
  }

  /** The user's studios, each with its history totals and live scene count */
  private studioStats(userId: number, now: number): Promise<RawEntityStats[]> {
    return prisma.$queryRaw<RawEntityStats[]>`
      SELECT
        ${HISTORY_COLUMNS},
        COALESCE(lib.sceneCount, 1) as libraryPresence
      FROM (
        SELECT s.studioId AS entityId, s.stashInstanceId AS instanceId,
          ${historySums(now)}
        FROM WatchHistory w
        CROSS JOIN StashScene s ON s.id = w.sceneId AND s.stashInstanceId = w.instanceId AND s.deletedAt IS NULL
        WHERE w.userId = ${userId} AND s.studioId IS NOT NULL
        GROUP BY s.studioId, s.stashInstanceId
      ) h
      JOIN StashStudio st
        ON st.id = h.entityId
        AND st.stashInstanceId = h.instanceId
        AND st.deletedAt IS NULL
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'studio'
        AND e.entityId = h.entityId
        AND (e.instanceId = '' OR e.instanceId = h.instanceId)
      LEFT JOIN (
        SELECT studioId, stashInstanceId as instanceId, COUNT(*) as sceneCount
        FROM StashScene
        WHERE studioId IS NOT NULL AND deletedAt IS NULL
        GROUP BY studioId, stashInstanceId
      ) lib ON lib.studioId = h.entityId AND lib.instanceId = h.instanceId
      WHERE e.id IS NULL
    `;
  }

  /**
   * The user's tags, each with its history totals and library presence,
   * counted as for performers: all the tag's junction rows minus those of
   * soft-deleted scenes (0.15 s at 200k scenes, against 0.6 s joining every
   * row to StashScene).
   */
  private tagStats(userId: number, now: number): Promise<RawEntityStats[]> {
    return prisma.$queryRaw<RawEntityStats[]>`
      SELECT
        ${HISTORY_COLUMNS},
        MAX(COALESCE(lib.sceneCount, 0) - COALESCE(gone.sceneCount, 0), 1) as libraryPresence
      FROM (
        SELECT st.tagId AS entityId, st.tagInstanceId AS instanceId,
          ${historySums(now)}
        FROM WatchHistory w
        CROSS JOIN StashScene s ON s.id = w.sceneId AND s.stashInstanceId = w.instanceId AND s.deletedAt IS NULL
        JOIN SceneTag st ON st.sceneId = w.sceneId AND st.sceneInstanceId = w.instanceId
        WHERE w.userId = ${userId}
        GROUP BY st.tagId, st.tagInstanceId
      ) h
      JOIN StashTag t
        ON t.id = h.entityId
        AND t.stashInstanceId = h.instanceId
        AND t.deletedAt IS NULL
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'tag'
        AND e.entityId = h.entityId
        AND (e.instanceId = '' OR e.instanceId = h.instanceId)
      LEFT JOIN (
        SELECT tagId, tagInstanceId as instanceId, COUNT(*) as sceneCount
        FROM SceneTag
        GROUP BY tagId, tagInstanceId
      ) lib ON lib.tagId = h.entityId AND lib.instanceId = h.instanceId
      LEFT JOIN (
        SELECT st.tagId, st.tagInstanceId as instanceId, COUNT(*) as sceneCount
        FROM StashScene s
        CROSS JOIN SceneTag st ON st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId
        WHERE s.deletedAt IS NOT NULL
        GROUP BY st.tagId, st.tagInstanceId
      ) gone ON gone.tagId = h.entityId AND gone.instanceId = h.instanceId
      WHERE e.id IS NULL
    `;
  }
}

export const rankingComputeService = new RankingComputeService();
export default rankingComputeService;
