/**
 * A playlist's suggestions: "Scenes like this" with the playlist's items as
 * the seed. What the items share weighs by how many of them share it, so a
 * playlist's theme leads and a one-off guest or tag drops out.
 *
 * Per instance holding items the viewer sees (`visibleItem`: live, allowed,
 * not excluded for the viewer), with `n` those items:
 * - each performer, direct tag and studio counts the items carrying it
 *   (its support); from 5 items on, one carried by a single item drops;
 * - its weight is its share of the items (`support / n`) times what Similar
 *   Scenes gives one shared entity: a performer 3, or 1.5 as a partner under
 *   the viewer's preferences (`performerBaseWeight`); a studio 2; a tag 1.5
 *   times its rarity on the instance (`tagIdf`), none for an ignored tag;
 * - the 30 best performers, 30 tags and 10 studios weigh in; the
 *   performers, studios and the tags within TAG_ROW_BUDGET find the
 *   candidates (`getWeightedSceneCandidates`, which leaves out every item of
 *   the playlist on the instance and what the viewer's exclusions hide),
 *   and the other tags add their weight to the candidates found.
 *
 * The instances' lists merge in the candidate query's order, the viewer's
 * watch state reorders them (`applyWatchFactor`), and the best 500 are the
 * suggestions. The viewer is whoever asks: a recipient of a shared playlist
 * gets suggestions under their own exclusions and preferences.
 */
import type { RecommendationPreferences } from "@peek/shared-types/recommendationPreferences.js";
import prisma from "../prisma/singleton.js";
import type { NormalizedScene } from "../types/index.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import { logger } from "../utils/logger.js";
import { visibleItem } from "./PlaylistQueryService.js";
import { tagIdf } from "./RecommendationScoringService.js";
import { sceneQueryBuilder } from "./SceneQueryBuilder.js";
import {
  SIMILAR_CANDIDATE_LIMIT,
  SIMILAR_LIST_LIMIT,
  SIMILAR_STUDIO_WEIGHT,
  SIMILAR_TAG_WEIGHT,
  applyWatchFactor,
  compareCandidates,
  performerBaseWeight,
} from "./SimilarScenesService.js";
import {
  type SimilarSceneCandidate,
  stashEntityService,
} from "./StashEntityService.js";
import { liveSceneCounts } from "./liveSceneCounts.js";
import {
  ignoredTagKeys,
  readUserRecommendationPreferences,
} from "./userRecommendationPreferences.js";

/** At most this many weighted entities of each kind reach the SQL */
export const SUGGESTION_TOP_PERFORMERS = 30;
export const SUGGESTION_TOP_TAGS = 30;
export const SUGGESTION_TOP_STUDIOS = 10;

/** From this many visible items on, an entity needs MIN_SUPPORT of them */
const SUPPORT_FLOOR_FROM = 5;
const MIN_SUPPORT = 2;

export const SUGGESTIONS_PER_PAGE = 24;

/**
 * At most this many tagged scenes (the tags' `sceneCountAll`, summed) feed
 * the candidate query. A tag's branch reads one junction row per scene it
 * tags, so a playlist themed on common tags would read most of the library
 * (30 common tags at 200k scenes: 712k rows, 1.4 s); the tags past the
 * budget only add their weight to the candidates the rest found. At 200k
 * scenes 25,000 rows keep the candidate query near 125 ms (50,000: 195 ms).
 */
export const TAG_ROW_BUDGET = 25_000;

/** What the visible items of one instance carry, each with its support */
export interface InstanceSupport {
  instanceId: string;
  performers: Array<{ id: string; gender: string | null; support: number }>;
  /** Direct tags only, as Similar Scenes reads them */
  tags: Array<{ id: string; sceneCountAll: number; support: number }>;
  studios: Array<{ id: string; support: number }>;
}

/** [id, weight] on one instance, best first */
export interface SuggestionWeights {
  performers: Array<[string, number]>;
  tags: Array<[string, number]>;
  studios: Array<[string, number]>;
}

/** Weight desc, then id */
function byWeightThenId(
  [aId, aWeight]: readonly [string, number],
  [bId, bWeight]: readonly [string, number]
): number {
  return bWeight - aWeight || (aId < bId ? -1 : aId > bId ? 1 : 0);
}

/** The `limit` heaviest, weight desc then id */
function top(
  weighted: Array<[string, number]>,
  limit: number
): Array<[string, number]> {
  return weighted.sort(byWeightThenId).slice(0, limit);
}

/**
 * The weights `n` visible items on one instance give their performers, tags
 * and studios, for a viewer with `prefs`; `liveCount` is the instance's live
 * scenes (a tag's rarity is among them)
 */
export function suggestionWeights(
  rows: InstanceSupport,
  n: number,
  prefs: RecommendationPreferences,
  liveCount: number
): SuggestionWeights {
  const kept = ({ support }: { support: number }) =>
    n < SUPPORT_FLOOR_FROM || support >= MIN_SUPPORT;
  const ignored = ignoredTagKeys(prefs);

  const performers = rows.performers
    .filter(kept)
    .map((r): [string, number] => [
      r.id,
      (r.support / n) * performerBaseWeight(r.gender, prefs),
    ]);
  const tags = rows.tags
    .filter((r) => kept(r) && !ignored.has(entityKey(r.id, rows.instanceId)))
    .map((r): [string, number] => [
      r.id,
      (r.support / n) * SIMILAR_TAG_WEIGHT * tagIdf(r.sceneCountAll, liveCount),
    ]);
  const studios = rows.studios
    .filter(kept)
    .map((r): [string, number] => [
      r.id,
      (r.support / n) * SIMILAR_STUDIO_WEIGHT,
    ]);

  return {
    performers: top(performers, SUGGESTION_TOP_PERFORMERS),
    tags: top(tags, SUGGESTION_TOP_TAGS),
    studios: top(studios, SUGGESTION_TOP_STUDIOS),
  };
}

export interface TagSplit {
  /** Tags that find candidates in the candidate query */
  generating: Array<[string, number]>;
  /** Tags that only add their weight to the candidates found */
  boosting: Array<[string, number]>;
}

/**
 * Splits weighted tags by `budget`: by weight desc (ties by id), a tag
 * generates while the generating tags' summed scene counts stay within the
 * budget, and boosts otherwise (a rarer tag further down may still fit). A
 * tag with no known count boosts. With no performer or studio weights
 * (`hasOtherWeights` false), the heaviest tag generates whatever its count,
 * so a playlist that shares only tags still finds candidates.
 */
export function splitTagsByBudget(
  tags: ReadonlyArray<readonly [string, number]>,
  sceneCounts: ReadonlyMap<string, number>,
  hasOtherWeights: boolean,
  budget: number = TAG_ROW_BUDGET
): TagSplit {
  const generating: Array<[string, number]> = [];
  const boosting: Array<[string, number]> = [];
  let rows = 0;
  for (const [id, weight] of [...tags].sort(byWeightThenId)) {
    const count = sceneCounts.get(id) ?? Infinity;
    if (rows + count <= budget) {
      generating.push([id, weight]);
      rows += count;
    } else {
      boosting.push([id, weight]);
    }
  }
  const heaviest = boosting[0];
  if (!hasOtherWeights && generating.length === 0 && heaviest !== undefined) {
    return { generating: [heaviest], boosting: boosting.slice(1) };
  }
  return { generating, boosting };
}

/**
 * The candidates with each one's boost (by its (id, instance); none adds
 * nothing) added to its weight, in the candidate query's order
 */
export function boostCandidates(
  candidates: readonly SimilarSceneCandidate[],
  boosts: ReadonlyMap<string, number>
): SimilarSceneCandidate[] {
  return candidates
    .map((c) => ({
      ...c,
      weight: c.weight + (boosts.get(entityKey(c.sceneId, c.instanceId)) ?? 0),
    }))
    .sort(compareCandidates);
}

/**
 * What the boosting tags add to each candidate on one instance (keyed by
 * `entityKey`; a candidate with none of them is absent): one statement
 * driven from the candidates and the tags (`json_each` with CROSS JOINs),
 * probing `SceneTag` by its primary key
 */
async function readTagBoosts(
  instanceId: string,
  candidates: readonly SimilarSceneCandidate[],
  tags: ReadonlyArray<readonly [string, number]>
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ sceneId: string; added: number }>
  >(
    `SELECT c.value AS sceneId, CAST(SUM(CAST(json_extract(b.value, '$[1]') AS REAL)) AS REAL) AS added
     FROM json_each(?) c
     CROSS JOIN json_each(?) b
     CROSS JOIN SceneTag st ON st.sceneId = c.value AND st.sceneInstanceId = ?
       AND st.tagId = json_extract(b.value, '$[0]') AND st.tagInstanceId = ?
     GROUP BY c.value`,
    JSON.stringify(candidates.map((c) => c.sceneId)),
    JSON.stringify(tags),
    instanceId,
    instanceId
  );
  return new Map(
    rows.map((row) => [entityKey(row.sceneId, instanceId), row.added])
  );
}

type Count = number | bigint;

/**
 * The viewer's visible items per instance and what they carry: four light
 * statements (a playlist's items and their junction rows), each driven from
 * the playlist's items through `visibleItem`
 */
async function readSupport(
  userId: number,
  allowedInstanceIds: readonly string[],
  playlistId: number
): Promise<Array<{ support: InstanceSupport; n: number }>> {
  const visible = visibleItem(userId, allowedInstanceIds);
  const from = `FROM PlaylistItem pi ${visible.join.sql}`;
  const where = `WHERE pi.playlistId = ? AND ${visible.where.sql}`;
  const params = [...visible.join.params, playlistId, ...visible.where.params];

  const [items, performers, tags, studios] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ instanceId: string; n: Count }>>(
      `SELECT pi.instanceId AS instanceId, COUNT(*) AS n
       ${from} ${where}
       GROUP BY pi.instanceId`,
      ...params
    ),
    prisma.$queryRawUnsafe<
      Array<{
        instanceId: string;
        id: string;
        gender: string | null;
        support: Count;
      }>
    >(
      `SELECT pi.instanceId AS instanceId, sp.performerId AS id, p.gender AS gender, COUNT(*) AS support
       ${from}
       CROSS JOIN ScenePerformer sp ON sp.sceneId = pi.sceneId AND sp.sceneInstanceId = pi.instanceId
         AND sp.performerInstanceId = pi.instanceId
       CROSS JOIN StashPerformer p ON p.id = sp.performerId AND p.stashInstanceId = sp.performerInstanceId
       ${where}
       GROUP BY pi.instanceId, sp.performerId`,
      ...params
    ),
    prisma.$queryRawUnsafe<
      Array<{
        instanceId: string;
        id: string;
        sceneCountAll: Count;
        support: Count;
      }>
    >(
      `SELECT pi.instanceId AS instanceId, st.tagId AS id, t.sceneCountAll AS sceneCountAll, COUNT(*) AS support
       ${from}
       CROSS JOIN SceneTag st ON st.sceneId = pi.sceneId AND st.sceneInstanceId = pi.instanceId
         AND st.tagInstanceId = pi.instanceId
       CROSS JOIN StashTag t ON t.id = st.tagId AND t.stashInstanceId = st.tagInstanceId
       ${where}
       GROUP BY pi.instanceId, st.tagId`,
      ...params
    ),
    prisma.$queryRawUnsafe<
      Array<{ instanceId: string; id: string; support: Count }>
    >(
      `SELECT pi.instanceId AS instanceId, s.studioId AS id, COUNT(*) AS support
       ${from} ${where} AND s.studioId IS NOT NULL
       GROUP BY pi.instanceId, s.studioId`,
      ...params
    ),
  ]);

  const byInstance = new Map<string, { support: InstanceSupport; n: number }>(
    items.map((row) => [
      row.instanceId,
      {
        support: {
          instanceId: row.instanceId,
          performers: [],
          tags: [],
          studios: [],
        },
        n: Number(row.n),
      },
    ])
  );
  for (const row of performers) {
    byInstance.get(row.instanceId)?.support.performers.push({
      id: row.id,
      gender: row.gender,
      support: Number(row.support),
    });
  }
  for (const row of tags) {
    byInstance.get(row.instanceId)?.support.tags.push({
      id: row.id,
      sceneCountAll: Number(row.sceneCountAll),
      support: Number(row.support),
    });
  }
  for (const row of studios) {
    byInstance.get(row.instanceId)?.support.studios.push({
      id: row.id,
      support: Number(row.support),
    });
  }
  return [...byInstance.values()].sort((a, b) =>
    a.support.instanceId < b.support.instanceId ? -1 : 1
  );
}

export interface PlaylistSuggestionsOptions {
  /** The viewer: the owner or a recipient */
  userId: number;
  playlistId: number;
  /** `req.allowedInstanceIds`: none means nothing is visible */
  allowedInstanceIds: readonly string[];
  /** From 1 */
  page: number;
  perPage?: number;
  /** TAG_ROW_BUDGET unless a test sets another */
  tagRowBudget?: number;
}

export interface PlaylistSuggestions {
  scenes: NormalizedScene[];
  /** Every suggestion, at most SIMILAR_LIST_LIMIT */
  count: number;
  page: number;
  perPage: number;
}

/**
 * A page of the playlist's suggestions for the viewer. The caller has
 * checked the viewer may open the playlist.
 */
export async function getPlaylistSuggestions(
  options: PlaylistSuggestionsOptions
): Promise<PlaylistSuggestions> {
  const startTime = Date.now();
  const {
    userId,
    playlistId,
    allowedInstanceIds,
    page,
    perPage = SUGGESTIONS_PER_PAGE,
    tagRowBudget = TAG_ROW_BUDGET,
  } = options;

  // Light reads (one user row, the playlist's items), sent together
  const [instances, prefs] = await Promise.all([
    readSupport(userId, allowedInstanceIds, playlistId),
    readUserRecommendationPreferences(userId),
  ]);
  if (instances.length === 0) return { scenes: [], count: 0, page, perPage };

  const liveCounts = await liveSceneCounts(
    instances.map((i) => i.support.instanceId)
  );

  // The candidate query is heavy: one instance at a time
  const ranked: SimilarSceneCandidate[] = [];
  for (const { support, n } of instances) {
    const { instanceId } = support;
    const weights = suggestionWeights(
      support,
      n,
      prefs,
      liveCounts.get(instanceId) ?? 0
    );
    const { generating, boosting } = splitTagsByBudget(
      weights.tags,
      new Map(support.tags.map((t) => [t.id, t.sceneCountAll])),
      weights.performers.length > 0 || weights.studios.length > 0,
      tagRowBudget
    );
    if (
      weights.performers.length === 0 &&
      weights.studios.length === 0 &&
      generating.length === 0
    ) {
      continue;
    }
    const found = await stashEntityService.getWeightedSceneCandidates({
      instanceId,
      userId,
      performers: weights.performers,
      studios: weights.studios,
      tags: generating,
      exclude: { playlistId },
      maxCandidates: SIMILAR_CANDIDATE_LIMIT,
    });
    const boosts =
      boosting.length > 0 && found.length > 0
        ? await readTagBoosts(instanceId, found, boosting)
        : new Map<string, number>();
    ranked.push(...boostCandidates(found, boosts));
  }
  ranked.sort(compareCandidates);

  // What the viewer already kept sinks, before the list is cut
  const candidates = (await applyWatchFactor(userId, ranked)).slice(
    0,
    SIMILAR_LIST_LIMIT
  );

  const startIndex = (page - 1) * perPage;
  const pageRefs: EntityRef[] = candidates
    .slice(startIndex, startIndex + perPage)
    .map((c) => ({ id: c.sceneId, instanceId: c.instanceId }));
  if (pageRefs.length === 0) {
    return { scenes: [], count: candidates.length, page, perPage };
  }

  const scenes = await sceneQueryBuilder.getByRefs({
    userId,
    refs: pageRefs,
    allowedInstanceIds: [...allowedInstanceIds],
  });
  // Back into candidate order, each scene by its (id, instance)
  const sceneByKey = new Map(
    scenes.map((s) => [entityKey(s.id, s.instanceId), s])
  );
  const orderedScenes = pageRefs
    .map((ref) => sceneByKey.get(entityKey(ref.id, ref.instanceId)))
    .filter((s): s is NormalizedScene => s !== undefined);

  logger.debug("getPlaylistSuggestions completed", {
    totalTime: `${Date.now() - startTime}ms`,
    playlistId,
    instances: instances.length,
    candidateCount: candidates.length,
    resultCount: orderedScenes.length,
    page,
  });

  return { scenes: orderedScenes, count: candidates.length, page, perPage };
}
