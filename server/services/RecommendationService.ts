/**
 * Recommended scenes: one ranked list per user, scored once per change.
 *
 * Scoring reads every scene the user can see (`getScenesForScoring`: the
 * exclusions, the allowed instances and the watch data applied in SQL) and
 * keeps the varied top 500 as (id, instance) refs, about 50 KB. Each
 * performer, studio and tag gets one affinity in [-1, 1] from the user's
 * favorites and ratings, the rated scenes it is in and its ranking's
 * affinity (a tag or studio with none inherits a decayed share of its
 * parent's). A scene scores by its leads (the performers of the user's lead
 * genders; everyone when none is chosen), its partners (a multiplier), its
 * studio, its tags (rarer tags weigh more, inherited ones less, ignored ones
 * not at all) and its own rating, times what its watch history keeps of it
 * under the user's discovery mode: a scene played today scores 0, an
 * abandoned one less, a kept one more as it ages and by its O count. The
 * rules live in `RecommendationScoringService`.
 *
 * The list is reused while the user's stamp is unchanged: one query
 * (about 3 ms at 200k scenes) over the count and newest change of the
 * user's four rating tables, watch history, rankings and scene exclusions,
 * and the scene sync state. A rating, favorite, play, hide, restriction,
 * ranking recompute or scene sync changes it and the next page rescores.
 * The cache key also carries the day (the daily shuffle seed), the allowed
 * instances and the user's recommendation preferences (one small read per
 * page), so a new day, an instance selection change or a preference change
 * rescores.
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
import { RECOMMENDED_LIMIT } from "@peek/shared-types/filters/index.js";
import { parseEntityRef } from "@peek/shared-types/instanceAwareId.js";
import {
  type RecommendationPreferences,
  readRecommendationPreferences,
} from "@peek/shared-types/recommendationPreferences.js";
import prisma from "../prisma/singleton.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import { logger } from "../utils/logger.js";
import { SeededRandom, generateDailySeed } from "../utils/seededRandom.js";
import { instanceClause } from "../utils/sqlClauses.js";
import { jsonListOrEmpty } from "../utils/sqlJson.js";
import {
  type AffinityInput,
  type RatingRow,
  type SceneScoringContext,
  type ScoringScene,
  type UserCriteriaCounts,
  buildEntityAffinity,
  countUserCriteria,
  hasAnyCriteria,
  pickVaried,
  sceneTopLead,
  scoreScene,
  watchMultiplier,
} from "./RecommendationScoringService.js";
import { stashEntityService } from "./StashEntityService.js";

/** How many ranked scenes are kept per user */
export const RANKED_LIMIT = RECOMMENDED_LIMIT;
/** How many users' lists are kept */
const CACHED_USERS = 100;

export interface RankedRecommendations {
  /** The ranked, diversified top scenes, best first */
  refs: readonly EntityRef[];
  /** What the user has rated and favorited, for the empty-state message */
  criteria: UserCriteriaCounts;
}

interface CacheEntry {
  /** userId, the day's seed, the allowed instances and the preferences */
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
    const prefs = await this.readPreferences(userId);
    const key = [
      userId,
      generateDailySeed(userId),
      [...allowedInstanceIds].sort().join(","),
      preferencesKey(prefs),
    ].join("|");
    const stamp = await this.readStamp(userId);

    const known = this.entries.get(userId);
    if (known && known.key === key && known.stamp === stamp) {
      // Most recently used: last in insertion order
      this.entries.delete(userId);
      this.entries.set(userId, known);
      return known.result;
    }

    const result = this.compute(userId, allowedInstanceIds, prefs);
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

  /** The user's recommendation preferences, defaults for anything unreadable */
  private async readPreferences(
    userId: number
  ): Promise<RecommendationPreferences> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { recommendationPreferences: true },
    });
    return readRecommendationPreferences(user?.recommendationPreferences);
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
    allowedInstanceIds: readonly string[],
    prefs: RecommendationPreferences
  ): Promise<RankedRecommendations> {
    const startTime = Date.now();
    const { criteria, scored, sceneCount } = await this.score(
      userId,
      allowedInstanceIds,
      prefs
    );

    // The best scenes with variety across leads and studios, in an order
    // that holds for the day (no duplicates across pages) and changes with it
    const diversified = pickVaried(
      scored,
      RANKED_LIMIT,
      new SeededRandom(generateDailySeed(userId))
    );
    const refs = diversified.map(({ id, instanceId }) => ({ id, instanceId }));

    logger.debug("Recommendations scored", {
      userId,
      ms: Date.now() - startTime,
      scenes: sceneCount,
      scored: scored.length,
      kept: refs.length,
    });

    return { refs, criteria };
  }

  /**
   * Every scene the user can see with a positive final score, unordered,
   * and the user's criteria; no scene is read when the user has none.
   * The statements run in turn: several are heavy at 200k scenes.
   */
  private async score(
    userId: number,
    allowedInstanceIds: readonly string[],
    prefs: RecommendationPreferences
  ): Promise<{
    criteria: UserCriteriaCounts;
    scored: ScoredScene[];
    sceneCount: number;
  }> {
    const performerRatings = await prisma.performerRating.findMany({
      where: { userId },
    });
    const studioRatings = await prisma.studioRating.findMany({
      where: { userId },
    });
    const tagRatings = await prisma.tagRating.findMany({ where: { userId } });
    const sceneRatings = await prisma.sceneRating.findMany({
      where: { userId },
    });
    const engagementRankings = await prisma.userEntityRanking.findMany({
      where: { userId, entityType: { in: ["performer", "studio", "tag"] } },
      select: {
        entityId: true,
        instanceId: true,
        entityType: true,
        affinity: true,
      },
    });

    // A user who only watches has no ratings or favorites, but the
    // performers, studios and tags their viewing likes are criteria all the
    // same
    const criteria = countUserCriteria(
      performerRatings,
      studioRatings,
      tagRatings,
      sceneRatings,
      engagementRankings.filter((r) => r.affinity > 0).length
    );
    if (!hasAnyCriteria(criteria)) {
      return { criteria, scored: [], sceneCount: 0 };
    }

    const genders =
      prefs.leadGenders.length > 0
        ? await readGenders(allowedInstanceIds)
        : new Map<string, string>();
    const { tagParents, tagDf } = await readTags(allowedInstanceIds);
    const studioParents = await readStudioParents(allowedInstanceIds);
    const scenes = await stashEntityService.getScenesForScoring(userId, [
      ...allowedInstanceIds,
    ]);

    const sceneRating = new Map(
      sceneRatings.map((r) => [entityKey(r.sceneId, r.instanceId), r])
    );
    const scoringScenes: ScoringScene[] = scenes.map((s) => {
      const own = sceneRating.get(entityKey(s.id, s.instanceId));
      return {
        ...s,
        rating: own?.rating ?? null,
        favorite: own?.favorite ?? false,
      };
    });

    const ratingRows = <T extends Omit<RatingRow, "id">>(
      rows: readonly T[],
      id: (row: T) => string
    ): RatingRow[] =>
      rows.map((r) => ({
        id: id(r),
        instanceId: r.instanceId,
        rating: r.rating,
        favorite: r.favorite,
      }));
    const ignoredTags = new Set(
      prefs.ignoredTagIds.flatMap((value) => {
        const { id, instanceId } = parseEntityRef(value);
        return instanceId ? [entityKey(id, instanceId)] : [];
      })
    );
    const input: AffinityInput = {
      performerRatings: ratingRows(performerRatings, (r) => r.performerId),
      studioRatings: ratingRows(studioRatings, (r) => r.studioId),
      tagRatings: ratingRows(tagRatings, (r) => r.tagId),
      ratedScenes: scoringScenes.filter((s) => s.rating !== null || s.favorite),
      rankings: engagementRankings.flatMap((r) =>
        r.entityType === "performer" ||
        r.entityType === "studio" ||
        r.entityType === "tag"
          ? [{ ...r, entityType: r.entityType }]
          : []
      ),
      tagParents,
      studioParents,
      ignoredTags,
    };
    const ctx: SceneScoringContext = {
      affinity: buildEntityAffinity(input),
      prefs,
      genders,
      tagDf,
      sceneCount: scoringScenes.length,
      ignoredTags,
    };

    return {
      criteria,
      scored: scoreScenes(scoringScenes, ctx),
      sceneCount: scoringScenes.length,
    };
  }
}

/**
 * The preferences as a cache-key part: the lists sorted, since their order
 * changes no score
 */
function preferencesKey(prefs: RecommendationPreferences): string {
  return JSON.stringify({
    leadGenders: [...prefs.leadGenders].sort(),
    partnerGenders: [...prefs.partnerGenders].sort(),
    noPartnerScenes: prefs.noPartnerScenes,
    discovery: prefs.discovery,
    ignoredTagIds: [...prefs.ignoredTagIds].sort(),
  });
}

/** Each live performer's gender on the allowed instances, by entityKey */
async function readGenders(
  allowedInstanceIds: readonly string[]
): Promise<Map<string, string>> {
  const instances = instanceClause("p", allowedInstanceIds);
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; stashInstanceId: string; gender: string }>
  >(
    `SELECT p.id, p.stashInstanceId, p.gender FROM StashPerformer p
      WHERE p.deletedAt IS NULL AND p.gender IS NOT NULL AND ${instances.sql}`,
    ...instances.params
  );
  return new Map(
    rows.map((r) => [entityKey(r.id, r.stashInstanceId), r.gender])
  );
}

/**
 * The live tags on the allowed instances: each one's parents (on its own
 * instance) and how many scenes carry it, directly or inherited, by
 * entityKey. One row per tag and parent.
 */
async function readTags(allowedInstanceIds: readonly string[]): Promise<{
  tagParents: Map<string, string[]>;
  tagDf: Map<string, number>;
}> {
  const instances = instanceClause("t", allowedInstanceIds);
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      stashInstanceId: string;
      sceneCountAll: number | bigint;
      parentId: string | number | null;
    }>
  >(
    `SELECT t.id, t.stashInstanceId, t.sceneCountAll, p.value AS parentId
      FROM StashTag t
      LEFT JOIN json_each(${jsonListOrEmpty("t.parentIds")}) p
      WHERE t.deletedAt IS NULL AND ${instances.sql}`,
    ...instances.params
  );
  const tagParents = new Map<string, string[]>();
  const tagDf = new Map<string, number>();
  for (const row of rows) {
    const key = entityKey(row.id, row.stashInstanceId);
    tagDf.set(key, Number(row.sceneCountAll));
    if (row.parentId === null) continue;
    const parent = entityKey(String(row.parentId), row.stashInstanceId);
    const parents = tagParents.get(key);
    if (parents) parents.push(parent);
    else tagParents.set(key, [parent]);
  }
  return { tagParents, tagDf };
}

/** Each live studio's parent on its own instance, by entityKey */
async function readStudioParents(
  allowedInstanceIds: readonly string[]
): Promise<Map<string, string>> {
  const instances = instanceClause("st", allowedInstanceIds);
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; stashInstanceId: string; parentId: string }>
  >(
    `SELECT st.id, st.stashInstanceId, st.parentId FROM StashStudio st
      WHERE st.deletedAt IS NULL AND st.parentId IS NOT NULL AND ${instances.sql}`,
    ...instances.params
  );
  return new Map(
    rows.map((r) => [
      entityKey(r.id, r.stashInstanceId),
      entityKey(r.parentId, r.stashInstanceId),
    ])
  );
}

interface ScoredScene {
  id: string;
  instanceId: string;
  final: number;
  topLead: string | null;
  studio: string | null;
}

/**
 * Each scene's final score: its preference score times its watch
 * multiplier; only positive scores are kept.
 */
function scoreScenes(
  scenes: readonly ScoringScene[],
  ctx: SceneScoringContext
): ScoredScene[] {
  const now = Date.now();
  const scored: ScoredScene[] = [];
  for (const scene of scenes) {
    const score = scoreScene(scene, ctx);
    if (score <= 0) continue;
    const final = score * watchMultiplier(scene, ctx.prefs.discovery, now);
    if (final > 0) {
      scored.push({
        id: scene.id,
        instanceId: scene.instanceId,
        final,
        topLead: sceneTopLead(scene, ctx),
        studio: scene.studioId
          ? entityKey(scene.studioId, scene.instanceId)
          : null,
      });
    }
  }
  return scored;
}

export const recommendationService = new RecommendationService();
