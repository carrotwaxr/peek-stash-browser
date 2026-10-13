/**
 * "Scenes like this", the parts around the candidate query: what each of
 * the seed's performers, studio and tags is worth to the viewer, and how
 * much of what the viewer already watched to take off the candidates.
 *
 * The weights are computed here from the seed and handed to
 * `StashEntityService.getSimilarSceneCandidates` as JSON; the watch factor
 * reorders its top candidates before the page is cut.
 */
import prisma from "../prisma/singleton.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import { rawDate } from "../utils/rawDate.js";
import { KEPT_MIN_SECONDS } from "./RankingComputeService.js";
import { tagIdf } from "./RecommendationScoringService.js";
import type { SimilarSceneCandidate } from "./StashEntityService.js";
import { liveSceneCounts } from "./liveSceneCounts.js";
import {
  ignoredTagKeys,
  readUserRecommendationPreferences,
} from "./userRecommendationPreferences.js";

/** A seed performer the viewer follows, or one with no partner logic */
export const SIMILAR_PERFORMER_WEIGHT = 3;
/** A seed performer who is a partner under the viewer's preferences */
export const SIMILAR_PARTNER_WEIGHT = 1.5;
export const SIMILAR_STUDIO_WEIGHT = 2;
/** A direct seed tag, times its rarity */
export const SIMILAR_TAG_WEIGHT = 1.5;

/**
 * How many candidates the SQL reads by weight alone, and how many the list
 * keeps once the watch factor has reordered them: a fresh candidate can rise
 * from below the first 500 past recently watched ones (a factor of 0.3 lets
 * one of a third the weight pass)
 */
export const SIMILAR_CANDIDATE_LIMIT = 1500;
export const SIMILAR_LIST_LIMIT = 500;

/** A candidate the viewer kept and last played under this many days ago */
const RECENT_DAYS = 14;
export const RECENT_KEPT_FACTOR = 0.3;
export const EARLIER_KEPT_FACTOR = 0.7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What the seed's shared performer, studio and tag are each worth */
export interface SimilarWeights {
  /** [performerId, weight] on the seed's instance */
  performers: Array<[string, number]>;
  studio: number;
  /** [tagId, weight] on the seed's instance; ignored tags are left out */
  tags: Array<[string, number]>;
}

/**
 * The weights for a seed scene as the viewer sees it. Performers weigh 3,
 * or 1.5 when the viewer's preferences make them a partner (the viewer has
 * leads and the performer's gender is a partner gender); the studio 2; a
 * direct tag 1.5 times its rarity among the seed's instance's live scenes;
 * a tag the viewer ignores nothing.
 */
export async function getSimilarWeights(
  seed: EntityRef,
  userId: number
): Promise<SimilarWeights> {
  const { id, instanceId } = seed;

  // Four light reads (a scene's junction rows, one user row, one indexed
  // count), independent of each other: sent together
  const [performerRows, tagRows, prefs, sceneCounts] = await Promise.all([
    prisma.scenePerformer.findMany({
      where: { sceneId: id, sceneInstanceId: instanceId },
      select: { performerId: true, performer: { select: { gender: true } } },
    }),
    prisma.sceneTag.findMany({
      where: { sceneId: id, sceneInstanceId: instanceId },
      select: { tagId: true, tag: { select: { sceneCountAll: true } } },
    }),
    readUserRecommendationPreferences(userId),
    liveSceneCounts([instanceId]),
  ]);

  const ignored = ignoredTagKeys(prefs);
  const keepsPartners = prefs.leadGenders.length > 0;
  const partnerGenders: readonly string[] = prefs.partnerGenders;

  const performers = performerRows.map((row): [string, number] => [
    row.performerId,
    keepsPartners &&
    row.performer.gender !== null &&
    partnerGenders.includes(row.performer.gender)
      ? SIMILAR_PARTNER_WEIGHT
      : SIMILAR_PERFORMER_WEIGHT,
  ]);

  const sceneCount = sceneCounts.get(instanceId) ?? 0;
  const tags = tagRows
    .filter((row) => !ignored.has(entityKey(row.tagId, instanceId)))
    .map((row): [string, number] => [
      row.tagId,
      SIMILAR_TAG_WEIGHT * tagIdf(row.tag.sceneCountAll, sceneCount),
    ]);

  return { performers, studio: SIMILAR_STUDIO_WEIGHT, tags };
}

interface WatchStateRow {
  sceneId: string;
  instanceId: string;
  kept: number | bigint;
  lastPlayedAt: Date | string | number | null;
}

/**
 * The viewer's history of the candidates, in one statement driven from the
 * candidate pairs (CROSS JOIN keeps the JSON list the outer loop).
 */
async function getWatchState(
  userId: number,
  candidates: readonly SimilarSceneCandidate[]
): Promise<WatchStateRow[]> {
  if (candidates.length === 0) return [];
  const pairs = JSON.stringify(
    candidates.map((c) => [c.sceneId, c.instanceId])
  );
  return prisma.$queryRawUnsafe<WatchStateRow[]>(
    `SELECT w.sceneId AS sceneId, w.instanceId AS instanceId,
       (w.playCount > 0 OR w.oCount > 0 OR w.playDuration >= ?) AS kept,
       w.lastPlayedAt AS lastPlayedAt
     FROM json_each(?) j
     CROSS JOIN WatchHistory w ON w.userId = ?
       AND w.sceneId = json_extract(j.value, '$[0]')
       AND w.instanceId = json_extract(j.value, '$[1]')`,
    KEPT_MIN_SECONDS,
    pairs,
    userId
  );
}

/** Weights that differ by float noise are equal */
const settle = (n: number) => Math.round(n * 1e9) / 1e9;

/** Descending, nulls last (as SQLite's DESC puts them) */
function compareDateDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}

/**
 * The candidates multiplied by the viewer's watch state: kept and last
 * played under 14 days ago 0.3, kept earlier (or with no date) 0.7,
 * otherwise 1. Ordered by that weight, then date, id and instance.
 */
export async function applyWatchFactor(
  userId: number,
  candidates: readonly SimilarSceneCandidate[],
  now: number = Date.now()
): Promise<SimilarSceneCandidate[]> {
  const rows = await getWatchState(userId, candidates);
  const factors = new Map<string, number>();
  for (const row of rows) {
    if (Number(row.kept) !== 1) continue;
    const playedAt = rawDate(row.lastPlayedAt);
    const recent =
      playedAt !== null && now - playedAt.getTime() < RECENT_DAYS * DAY_MS;
    factors.set(
      entityKey(row.sceneId, row.instanceId),
      recent ? RECENT_KEPT_FACTOR : EARLIER_KEPT_FACTOR
    );
  }
  if (factors.size === 0) return [...candidates];

  const adjusted = candidates.map((c) => ({
    candidate: c,
    weight: settle(
      c.weight * (factors.get(entityKey(c.sceneId, c.instanceId)) ?? 1)
    ),
  }));
  adjusted.sort(
    (a, b) =>
      b.weight - a.weight ||
      compareDateDesc(a.candidate.date, b.candidate.date) ||
      (a.candidate.sceneId < b.candidate.sceneId
        ? -1
        : a.candidate.sceneId > b.candidate.sceneId
          ? 1
          : 0) ||
      (a.candidate.instanceId < b.candidate.instanceId
        ? -1
        : a.candidate.instanceId > b.candidate.instanceId
          ? 1
          : 0)
  );
  return adjusted.map((a) => a.candidate);
}
