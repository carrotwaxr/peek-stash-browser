/**
 * Recommended scenes: one ranked list per user, scored once per change.
 *
 * Scoring reads every scene the user can see (`getScenesForScoring`: the
 * exclusions, the allowed instances and the watch data applied in SQL),
 * weighs each by the user's favorites, ratings, rated scenes and engagement
 * rankings, and keeps the diversified top 500 as (id, instance) refs, about
 * 50 KB. The list is reused while the user's stamp is unchanged: one query
 * (about 3 ms at 200k scenes) over the count and newest change of the
 * user's four rating tables, watch history, rankings and scene exclusions,
 * and the scene sync state. A rating, favorite, play, hide, restriction,
 * ranking recompute or scene sync changes it and the next page rescores.
 * The cache key also carries the day (the daily shuffle seed) and the
 * allowed instances, so a new day or an instance selection change rescores.
 *
 * Rankings are refreshed (at most once an hour) by page 1 of the
 * Recommended list, which waits for a recompute, by login and by the stats
 * page; later pages start none, so a user's pages are scored with one set of
 * rankings.
 *
 * The cache holds the 100 most recently served users, in process memory,
 * keyed by user id: no user is ever answered with another's list. Callers
 * arriving while a list is being computed share the computation, and a
 * failed computation is dropped, so the next request tries again.
 *
 * Every entity key is entityKey(id, instanceId): two Stash servers reuse
 * small ids, and a favorite on one says nothing about the other.
 */
import prisma from "../prisma/singleton.js";
import type { ScoredSceneId } from "../types/api/index.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import { logger } from "../utils/logger.js";
import { SeededRandom, generateDailySeed } from "../utils/seededRandom.js";
import {
  type EntityRankingData,
  IMPLICIT_MIN_PERCENTILE,
  type LightweightEntityPreferences,
  type SceneRatingInput,
  type ScoringScene,
  type UserCriteriaCounts,
  buildDerivedWeightsFromScoringData,
  buildImplicitWeightsFromRankings,
  countUserCriteria,
  diversifyByScoreTier,
  hasAnyCriteria,
  scoreScoringDataByPreferences,
} from "./RecommendationScoringService.js";
import { stashEntityService } from "./StashEntityService.js";

/** How many ranked scenes are kept per user */
export const RANKED_LIMIT = 500;
/** How many users' lists are kept */
const CACHED_USERS = 100;

export interface RankedRecommendations {
  /** The ranked, diversified top scenes, best first */
  refs: readonly EntityRef[];
  /** What the user has rated and favorited, for the empty-state message */
  criteria: UserCriteriaCounts;
}

interface CacheEntry {
  /** userId, the day's seed and the allowed instances */
  key: string;
  stamp: string;
  result: Promise<RankedRecommendations>;
}

/**
 * The stamp's parts, as text: a count and the newest timestamp of each
 * input. Every part is the user's own rows (the sync state is shared).
 * The exclusion part uses the highest row id rather than computedAt:
 * ids are monotonic (a hide, a restriction recompute and a sync hold all
 * insert rows; an unhide deletes), where computedAt is written both as
 * epoch milliseconds and as text and MAX() over mixed types is not.
 */
interface StampRow {
  ratings: string;
  plays: string;
  rankings: string;
  exclusions: string;
  sync: string;
}

const STAMP_SQL = `
  SELECT
    (SELECT COUNT(*) || ':' || COALESCE(MAX(updatedAt), '') FROM PerformerRating WHERE userId = ?) || '|' ||
    (SELECT COUNT(*) || ':' || COALESCE(MAX(updatedAt), '') FROM StudioRating WHERE userId = ?) || '|' ||
    (SELECT COUNT(*) || ':' || COALESCE(MAX(updatedAt), '') FROM TagRating WHERE userId = ?) || '|' ||
    (SELECT COUNT(*) || ':' || COALESCE(MAX(updatedAt), '') FROM SceneRating WHERE userId = ?) AS ratings,
    (SELECT COUNT(*) || ':' || COALESCE(MAX(lastPlayedAt), '') || ':' || COALESCE(SUM(oCount), 0) FROM WatchHistory WHERE userId = ?) AS plays,
    (SELECT COUNT(*) || ':' || COALESCE(MAX(updatedAt), '') FROM UserEntityRanking WHERE userId = ?) AS rankings,
    (SELECT COUNT(*) || ':' || COALESCE(MAX(id), '') FROM UserExcludedEntity WHERE userId = ? AND entityType = 'scene') AS exclusions,
    (SELECT COUNT(*) || ':' || COALESCE(MAX(lastFullSyncActual), '') || ':' || COALESCE(MAX(lastIncrementalSyncActual), '')
      FROM SyncState WHERE entityType = 'scene') AS sync
`;

const HIGHLY_RATED = 80;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What every per-user rating row holds */
interface RatingRow {
  instanceId: string;
  favorite: boolean;
  rating: number | null;
}

export class RecommendationService {
  /** Insertion order is the LRU order: the oldest entry comes first */
  private readonly entries = new Map<number, CacheEntry>();

  /**
   * The user's ranked recommendations for the instances they may see,
   * scored now or reused from the last request while nothing changed.
   */
  async getRankedRefs(
    userId: number,
    allowedInstanceIds: readonly string[]
  ): Promise<RankedRecommendations> {
    const key = [
      userId,
      generateDailySeed(userId),
      [...allowedInstanceIds].sort().join(","),
    ].join("|");
    const stamp = await this.readStamp(userId);

    const known = this.entries.get(userId);
    if (known && known.key === key && known.stamp === stamp) {
      // Most recently used: last in insertion order
      this.entries.delete(userId);
      this.entries.set(userId, known);
      return known.result;
    }

    const result = this.compute(userId, allowedInstanceIds);
    const entry: CacheEntry = { key, stamp, result };
    this.entries.delete(userId);
    this.entries.set(userId, entry);
    // A failed computation is never served again: the next request rescores
    result.catch(() => {
      if (this.entries.get(userId) === entry) this.entries.delete(userId);
    });
    while (this.entries.size > CACHED_USERS) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return result;
  }

  /**
   * Forgets the user's list, whatever its stamp: their next page scores
   * again. For a deleted user, and for a change the stamp cannot see. A
   * computation running now still answers the pages waiting on it, and is
   * not kept.
   */
  forget(userId: number): void {
    this.entries.delete(userId);
  }

  /** Forgets every list (tests) */
  clear(): void {
    this.entries.clear();
  }

  private async readStamp(userId: number): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<StampRow[]>(
      STAMP_SQL,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId
    );
    const row = rows[0];
    if (!row) return "";
    return [
      row.ratings,
      row.plays,
      row.rankings,
      row.exclusions,
      row.sync,
    ].join("|");
  }

  private async compute(
    userId: number,
    allowedInstanceIds: readonly string[]
  ): Promise<RankedRecommendations> {
    const startTime = Date.now();

    const [
      performerRatings,
      studioRatings,
      tagRatings,
      sceneRatings,
      engagementRankings,
    ] = await Promise.all([
      prisma.performerRating.findMany({ where: { userId } }),
      prisma.studioRating.findMany({ where: { userId } }),
      prisma.tagRating.findMany({ where: { userId } }),
      prisma.sceneRating.findMany({ where: { userId } }),
      prisma.userEntityRanking.findMany({
        where: { userId, entityType: { in: ["performer", "studio", "tag"] } },
        select: {
          entityId: true,
          instanceId: true,
          entityType: true,
          engagementRate: true,
          percentileRank: true,
        },
      }),
    ]);

    // A user who only watches has no ratings or favorites, but their most
    // engaged performers, studios and tags are criteria all the same
    const criteria = countUserCriteria(
      performerRatings,
      studioRatings,
      tagRatings,
      sceneRatings,
      engagementRankings.filter(
        (r) => r.percentileRank >= IMPLICIT_MIN_PERCENTILE
      ).length
    );
    if (!hasAnyCriteria(criteria)) {
      return { refs: [], criteria };
    }

    const scenes = await stashEntityService.getScenesForScoring(userId, [
      ...allowedInstanceIds,
    ]);

    const sets = <T extends RatingRow>(rows: T[], id: (row: T) => string) => ({
      favorites: new Set(
        rows
          .filter((r) => r.favorite)
          .map((r) => entityKey(id(r), r.instanceId))
      ),
      highlyRated: new Set(
        rows
          .filter((r) => r.rating !== null && r.rating >= HIGHLY_RATED)
          .map((r) => entityKey(id(r), r.instanceId))
      ),
    });
    const performers = sets(performerRatings, (r) => r.performerId);
    const studios = sets(studioRatings, (r) => r.studioId);
    const tags = sets(tagRatings, (r) => r.tagId);

    const sceneRatingsForDerived: SceneRatingInput[] = sceneRatings.map(
      (r) => ({
        sceneId: r.sceneId,
        instanceId: r.instanceId,
        rating: r.rating,
        favorite: r.favorite,
      })
    );
    const sceneByKey = new Map(
      scenes.map((s) => [entityKey(s.id, s.instanceId), s])
    );
    const { derivedPerformerWeights, derivedStudioWeights, derivedTagWeights } =
      buildDerivedWeightsFromScoringData(sceneRatingsForDerived, (ref) =>
        sceneByKey.get(entityKey(ref.id, ref.instanceId))
      );

    const rankingData: EntityRankingData[] = engagementRankings;
    const {
      implicitPerformerWeights,
      implicitStudioWeights,
      implicitTagWeights,
    } = buildImplicitWeightsFromRankings(rankingData, IMPLICIT_MIN_PERCENTILE);

    const prefs: LightweightEntityPreferences = {
      favoritePerformers: performers.favorites,
      highlyRatedPerformers: performers.highlyRated,
      favoriteStudios: studios.favorites,
      highlyRatedStudios: studios.highlyRated,
      favoriteTags: tags.favorites,
      highlyRatedTags: tags.highlyRated,
      derivedPerformerWeights,
      derivedStudioWeights,
      derivedTagWeights,
      implicitPerformerWeights,
      implicitStudioWeights,
      implicitTagWeights,
    };

    const scored = scoreScenes(scenes, prefs);
    scored.sort((a, b) => b.score - a.score);

    // Variety within score bands, in an order that holds for the day (no
    // duplicates across pages) and changes with it
    const diversified = diversifyByScoreTier(
      scored,
      new SeededRandom(generateDailySeed(userId))
    );
    const refs = diversified
      .slice(0, RANKED_LIMIT)
      .map(({ id, instanceId }) => ({ id, instanceId }));

    logger.debug("Recommendations scored", {
      userId,
      ms: Date.now() - startTime,
      scenes: scenes.length,
      scored: scored.length,
      kept: refs.length,
    });

    return { refs, criteria };
  }
}

/**
 * Each scene's final score: its preference score, when it has one, moved by
 * its watch status (never watched +30, not for two weeks +20, in the last
 * two weeks -10, today -30) and scaled by its O count; only positive
 * scores are kept.
 */
function scoreScenes(
  scenes: readonly ScoringScene[],
  prefs: LightweightEntityPreferences
): ScoredSceneId[] {
  const now = Date.now();
  const scored: ScoredSceneId[] = [];
  for (const scene of scenes) {
    const baseScore = scoreScoringDataByPreferences(scene, prefs);
    if (baseScore === 0) continue;

    let adjustedScore = baseScore;
    if (scene.playCount === 0) {
      adjustedScore += 30;
    } else if (scene.lastPlayedAt) {
      const daysSinceWatched = (now - scene.lastPlayedAt.getTime()) / DAY_MS;
      if (daysSinceWatched > 14) {
        adjustedScore += 20;
      } else if (daysSinceWatched >= 1) {
        adjustedScore -= 10;
      } else {
        adjustedScore -= 30;
      }
    }

    const engagementMultiplier = 1.0 + Math.min(scene.oCounter, 10) * 0.03;
    const finalScore = adjustedScore * engagementMultiplier;
    if (finalScore > 0) {
      scored.push({
        id: scene.id,
        instanceId: scene.instanceId,
        score: finalScore,
        oCounter: scene.oCounter,
      });
    }
  }
  return scored;
}

export const recommendationService = new RecommendationService();
