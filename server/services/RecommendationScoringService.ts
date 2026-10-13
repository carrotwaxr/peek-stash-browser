/**
 * Recommended's scoring, as pure functions.
 *
 * `buildEntityAffinity` turns the user's ratings, favorites, rated scenes
 * and viewing rankings into one affinity in [-1, 1] per performer, studio
 * and tag; `scoreScene` weighs a scene by its leads, its partners, its
 * studio, its tags (rarer tags count more) and its own rating; and
 * `watchMultiplier` moves that score by what the user already watched.
 *
 * Every map and set is keyed by entityKey(id, instanceId): two Stash servers
 * reuse small ids, and a favorite on one says nothing about the other.
 */
import type { RecommendationPreferences } from "@peek/shared-types/recommendationPreferences.js";
import { entityKey } from "../utils/entityRef.js";
import type { SeededRandom } from "../utils/seededRandom.js";

// ─── Entity affinity ────────────────────────────────────────────────────────

/** A favorite performer, studio or tag's explicit affinity */
export const FAVORITE_AFFINITY = 1;
/** A favorite scene counts at least this, rated or not */
export const FAVORITE_SCENE_VALUE = 0.7;
/** Pseudo-count that shrinks a rated-scene average toward 0 */
export const RATED_SCENE_PRIOR = 3;
/** Weight of the rated-scene average in an entity's affinity */
export const RATED_SCENES_WEIGHT = 0.6;
/** Weight of the ranking's implicit affinity in an entity's affinity */
export const IMPLICIT_WEIGHT = 0.6;
/** What a tag or studio without an entry keeps of its parent's, per step */
export const HIERARCHY_DECAY = 0.8;

// ─── Scene score ────────────────────────────────────────────────────────────

/** Weight of the leads' score */
export const LEAD_WEIGHT = 3;
/** Weight of the studio's affinity */
export const STUDIO_WEIGHT = 1.5;
/** Weight of the tags' score */
export const TAG_WEIGHT = 1.5;
/** Weight of the scene's own rating */
export const SELF_WEIGHT = 2;
/** A performer of neither a lead nor a partner gender counts this much of a lead */
export const OTHER_LEAD_SHARE = 0.5;
/** Each further positive lead counts this much of the one before */
export const LEAD_DECAY = 0.5;
/**
 * The partners multiply the score by 1 + this * the mean affinity of those
 * with one: a partner makes or breaks a scene, and more of them add nothing
 */
export const PARTNER_STRENGTH = 0.6;
/** The partners' multiplier stays within these bounds */
export const PARTNER_MULT_MIN = 0.4;
export const PARTNER_MULT_MAX = 1.6;
/** A scene with leads and no partner, under "less", unless every lead is a favorite */
export const NO_PARTNER_MULT = 0.35;
/** How many positive tag contributions count */
export const TOP_TAGS = 5;
/** An inherited-only tag counts this much of a direct one */
export const INHERITED_TAG_SHARE = 0.6;
/** A tag's rarity weight stays within these bounds */
export const TAG_IDF_MIN = 0.05;
export const TAG_IDF_MAX = 1;

// ─── Watch multiplier ───────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
type Discovery = RecommendationPreferences["discovery"];

/** A scene with no history row */
export const UNSEEN_MULT: Record<Discovery, number> = {
  new: 1,
  balanced: 1,
  rewatch: 0.8,
};
/** A history row that is not kept: opened and abandoned */
export const ABANDONED_MULT: Record<Discovery, number> = {
  new: 0.6,
  balanced: 0.5,
  rewatch: 0.4,
};
/** Kept scenes, by days since last played: under 1, under 14, under 60, more */
export const KEPT_MULT: Record<
  Discovery,
  readonly [number, number, number, number]
> = {
  new: [0, 0.075, 0.2, 0.375],
  balanced: [0, 0.15, 0.4, 0.75],
  rewatch: [0, 0.21, 0.56, 1.05],
};
/** The age bounds of KEPT_MULT's bands, in days */
export const KEPT_AGE_DAYS = [1, 14, 60] as const;
/** A kept scene gains this per O, up to O_BOOST_CAP O's */
export const O_BOOST: Record<Discovery, number> = {
  new: 0.04,
  balanced: 0.04,
  rewatch: 0.08,
};
export const O_BOOST_CAP = 10;

/** Scene ratings at or above this count as rated scenes in the criteria */
const CRITERIA_SCENE_RATING = 40;
/** Entity ratings at or above this count as rated in the criteria */
const CRITERIA_ENTITY_RATING = 80;

// ─── Types ──────────────────────────────────────────────────────────────────

/** The user's rating of one performer, studio or tag */
export interface RatingRow {
  id: string;
  instanceId: string;
  rating: number | null;
  favorite: boolean;
}

/**
 * One scene as scoring reads it: its ids (all on the scene's instance), the
 * user's watch data on it and the user's own rating of it.
 */
export interface ScoringScene {
  id: string;
  instanceId: string;
  studioId: string | null;
  performerIds: string[];
  tagIds: string[];
  inheritedTagIds: string[];
  oCount: number;
  /** Played, O'd or watched for KEPT_MIN_SECONDS */
  kept: boolean;
  hasHistory: boolean;
  lastPlayedAt: Date | null;
  rating: number | null;
  favorite: boolean;
}

/** A scene as the library query reads it, before the user's own rating */
export type LibraryScoringScene = Omit<ScoringScene, "rating" | "favorite">;

export interface AffinityInput {
  performerRatings: RatingRow[];
  studioRatings: RatingRow[];
  tagRatings: RatingRow[];
  /** Scenes with a rating or a favorite (their own rating and favorite fields) */
  ratedScenes: ScoringScene[];
  rankings: Array<{
    entityType: "performer" | "studio" | "tag";
    entityId: string;
    instanceId: string;
    affinity: number;
  }>;
  /** entityKey -> parent entityKeys */
  tagParents: Map<string, string[]>;
  /** entityKey -> parent entityKey */
  studioParents: Map<string, string>;
  /** entityKeys */
  ignoredTags: Set<string>;
}

export interface EntityAffinity {
  performer: Map<string, number>;
  studio: Map<string, number>;
  tag: Map<string, number>;
  /** Performers the user favorited explicitly */
  favoritePerformers: Set<string>;
}

export interface SceneScoringContext {
  affinity: EntityAffinity;
  prefs: RecommendationPreferences;
  /** Performer entityKey -> gender; no entry means unknown */
  genders: Map<string, string>;
  /** Tag entityKey -> how many live scenes on its instance carry it */
  tagDf: Map<string, number>;
  /** Instance id -> its live scenes: the N of a tag's rarity on that instance */
  sceneCounts: Map<string, number>;
  /** entityKeys */
  ignoredTags: Set<string>;
}

export interface UserCriteriaCounts {
  favoritedPerformers: number;
  ratedPerformers: number;
  favoritedStudios: number;
  ratedStudios: number;
  favoritedTags: number;
  ratedTags: number;
  favoritedScenes: number;
  ratedScenes: number;
  /** Performers, studios and tags the user's viewing likes (affinity > 0) */
  rankedEntities: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/** A rating of 0..100 as -1..1 */
const ratingValue = (rating: number) => (rating - 50) / 50;

/**
 * A rated or favorited item's value: its rating as -1..1, at least
 * FAVORITE_SCENE_VALUE when a favorite; null with neither.
 */
function sceneValue(rating: number | null, favorite: boolean): number | null {
  const rated = rating === null ? null : ratingValue(rating);
  if (!favorite) return rated;
  return rated === null
    ? FAVORITE_SCENE_VALUE
    : Math.max(rated, FAVORITE_SCENE_VALUE);
}

interface Parts {
  explicit?: number;
  sum: number;
  count: number;
  implicit?: number;
}

/** The affinity of every key with at least one part */
function combine(parts: Map<string, Parts>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, p] of parts) {
    const s = p.count > 0 ? p.sum / (p.count + RATED_SCENE_PRIOR) : 0;
    out.set(
      key,
      clamp(
        (p.explicit ?? 0) +
          RATED_SCENES_WEIGHT * s +
          IMPLICIT_WEIGHT * (p.implicit ?? 0),
        -1,
        1
      )
    );
  }
  return out;
}

function partsOf(map: Map<string, Parts>, key: string): Parts {
  let p = map.get(key);
  if (!p) {
    p = { sum: 0, count: 0 };
    map.set(key, p);
  }
  return p;
}

/**
 * Fills each key without an entry from its nearest ancestors with one:
 * HIERARCHY_DECAY per step, the mean when several ancestors at that
 * distance have one. Reads the entries as given, so a filled key never
 * feeds another; a cycle ends at keys already seen.
 */
function fillFromAncestors(
  entries: Map<string, number>,
  parents: Map<string, readonly string[]>,
  skip: Set<string>
): void {
  const own = new Map(entries);
  for (const key of parents.keys()) {
    if (own.has(key) || skip.has(key)) continue;
    const seen = new Set([key]);
    let level = [key];
    let factor = 1;
    while (level.length > 0) {
      factor *= HIERARCHY_DECAY;
      const next: string[] = [];
      for (const k of level) {
        for (const parent of parents.get(k) ?? []) {
          if (seen.has(parent)) continue;
          seen.add(parent);
          next.push(parent);
        }
      }
      const found = next.flatMap((k) => {
        const v = own.get(k);
        return v === undefined ? [] : [v];
      });
      if (found.length > 0) {
        const mean = found.reduce((a, b) => a + b, 0) / found.length;
        entries.set(key, factor * mean);
        break;
      }
      level = next;
    }
  }
}

// ─── Affinity ───────────────────────────────────────────────────────────────

/**
 * Each performer's, studio's and tag's affinity: an explicit favorite (1)
 * or rating, plus 0.6 of the shrunken average of the rated scenes it is in,
 * plus 0.6 of its ranking's affinity, clamped to [-1, 1]. A tag or studio
 * with none of these takes 0.8 per step of its nearest ancestor's. Ignored
 * tags are absent.
 */
export function buildEntityAffinity(input: AffinityInput): EntityAffinity {
  const { ignoredTags } = input;
  const performer = new Map<string, Parts>();
  const studio = new Map<string, Parts>();
  const tag = new Map<string, Parts>();
  const favoritePerformers = new Set<string>();

  const explicit = (
    rows: readonly RatingRow[],
    into: Map<string, Parts>,
    skip?: Set<string>
  ) => {
    for (const row of rows) {
      const key = entityKey(row.id, row.instanceId);
      if (skip?.has(key)) continue;
      const value = row.favorite
        ? FAVORITE_AFFINITY
        : row.rating === null
          ? undefined
          : ratingValue(row.rating);
      if (value !== undefined) partsOf(into, key).explicit = value;
    }
  };
  explicit(input.performerRatings, performer);
  explicit(input.studioRatings, studio);
  explicit(input.tagRatings, tag, ignoredTags);
  for (const row of input.performerRatings) {
    if (row.favorite) favoritePerformers.add(entityKey(row.id, row.instanceId));
  }

  for (const scene of input.ratedScenes) {
    const v = sceneValue(scene.rating, scene.favorite);
    if (v === null) continue;
    const add = (into: Map<string, Parts>, key: string) => {
      const p = partsOf(into, key);
      p.sum += v;
      p.count += 1;
    };
    const inst = scene.instanceId;
    for (const id of scene.performerIds) add(performer, entityKey(id, inst));
    if (scene.studioId) add(studio, entityKey(scene.studioId, inst));
    for (const id of scene.tagIds) {
      const key = entityKey(id, inst);
      if (!ignoredTags.has(key)) add(tag, key);
    }
  }

  const byType = { performer, studio, tag };
  for (const r of input.rankings) {
    const key = entityKey(r.entityId, r.instanceId);
    if (r.entityType === "tag" && ignoredTags.has(key)) continue;
    partsOf(byType[r.entityType], key).implicit = r.affinity;
  }

  const tagAffinity = combine(tag);
  fillFromAncestors(tagAffinity, input.tagParents, ignoredTags);
  const studioAffinity = combine(studio);
  const studioParents = new Map<string, string[]>();
  for (const [key, parent] of input.studioParents) {
    studioParents.set(key, [parent]);
  }
  fillFromAncestors(studioAffinity, studioParents, new Set());

  return {
    performer: combine(performer),
    studio: studioAffinity,
    tag: tagAffinity,
    favoritePerformers,
  };
}

// ─── Scene score ────────────────────────────────────────────────────────────

/** A tag's rarity weight: ln(N / df) / ln(N), within [0.05, 1]; 1 when N < 2 */
export function tagIdf(df: number, n: number): number {
  if (n < 2) return TAG_IDF_MAX;
  return clamp(
    Math.log(n / Math.max(df, 1)) / Math.log(n),
    TAG_IDF_MIN,
    TAG_IDF_MAX
  );
}

interface Lead {
  key: string;
  /** 1 for a lead, OTHER_LEAD_SHARE for a performer of another gender */
  share: number;
}

/** The scene's leads and partners, by the user's genders */
function roles(
  scene: ScoringScene,
  ctx: SceneScoringContext
): { leads: Lead[]; partners: string[] } {
  const { leadGenders, partnerGenders } = ctx.prefs;
  const leads: Lead[] = [];
  const partners: string[] = [];
  for (const id of scene.performerIds) {
    const key = entityKey(id, scene.instanceId);
    if (leadGenders.length === 0) {
      leads.push({ key, share: 1 });
      continue;
    }
    const gender = ctx.genders.get(key);
    if (gender === undefined || (leadGenders as string[]).includes(gender)) {
      leads.push({ key, share: 1 });
    } else if ((partnerGenders as string[]).includes(gender)) {
      partners.push(key);
    } else {
      leads.push({ key, share: OTHER_LEAD_SHARE });
    }
  }
  return { leads, partners };
}

function leadScore(leads: readonly Lead[], ctx: SceneScoringContext): number {
  const values = leads.map(
    (l) => (ctx.affinity.performer.get(l.key) ?? 0) * l.share
  );
  const positives = values.filter((v) => v > 0).sort((a, b) => b - a);
  let score = 0;
  let weight = 1;
  for (const v of positives) {
    score += weight * v;
    weight *= LEAD_DECAY;
  }
  for (const v of values) if (v < 0) score += v;
  return score;
}

function tagScore(scene: ScoringScene, ctx: SceneScoringContext): number {
  const inst = scene.instanceId;
  const n = ctx.sceneCounts.get(inst) ?? 0;
  const share = new Map<string, number>();
  for (const id of scene.inheritedTagIds) {
    share.set(entityKey(id, inst), INHERITED_TAG_SHARE);
  }
  for (const id of scene.tagIds) share.set(entityKey(id, inst), 1);

  const positives: number[] = [];
  let negative = 0;
  for (const [key, s] of share) {
    if (ctx.ignoredTags.has(key)) continue;
    const a = ctx.affinity.tag.get(key) ?? 0;
    if (a === 0) continue;
    const c = a * tagIdf(ctx.tagDf.get(key) ?? 1, n) * s;
    if (c > 0) positives.push(c);
    else negative += c;
  }
  positives.sort((a, b) => b - a);
  return positives.slice(0, TOP_TAGS).reduce((sum, c) => sum + c, 0) + negative;
}

/**
 * A scene's score before the watch multiplier: its leads, studio, tags and
 * own rating, times its partners' multiplier and, under "less", the
 * no-partner multiplier.
 */
export function scoreScene(
  scene: ScoringScene,
  ctx: SceneScoringContext
): number {
  const { leads, partners } = roles(scene, ctx);
  const { affinity, prefs } = ctx;

  const studioA = scene.studioId
    ? (affinity.studio.get(entityKey(scene.studioId, scene.instanceId)) ?? 0)
    : 0;
  const self = sceneValue(scene.rating, scene.favorite) ?? 0;
  const base =
    LEAD_WEIGHT * leadScore(leads, ctx) +
    STUDIO_WEIGHT * studioA +
    TAG_WEIGHT * tagScore(scene, ctx) +
    SELF_WEIGHT * self;

  // The partners with an affinity: their mean, so their number counts for
  // nothing; without one the multiplier is 1
  const partnerAffinities = partners.flatMap((key) => {
    const a = affinity.performer.get(key) ?? 0;
    return a === 0 ? [] : [a];
  });
  const partnerMult =
    partnerAffinities.length === 0
      ? 1
      : clamp(
          1 +
            (PARTNER_STRENGTH *
              partnerAffinities.reduce((sum, a) => sum + a, 0)) /
              partnerAffinities.length,
          PARTNER_MULT_MIN,
          PARTNER_MULT_MAX
        );

  const noPartnerMult =
    prefs.partnerGenders.length > 0 &&
    prefs.noPartnerScenes === "less" &&
    leads.length > 0 &&
    partners.length === 0 &&
    !leads.every((l) => affinity.favoritePerformers.has(l.key))
      ? NO_PARTNER_MULT
      : 1;

  return base * partnerMult * noPartnerMult;
}

/**
 * The entityKey of the scene's lead with the highest affinity (ties, and
 * leads without one, by id), else null without a lead.
 */
export function sceneTopLead(
  scene: ScoringScene,
  ctx: SceneScoringContext
): string | null {
  const { leads } = roles(scene, ctx);
  const ordered = leads
    .map((l) => ({ key: l.key, a: ctx.affinity.performer.get(l.key) ?? 0 }))
    .sort((x, y) => y.a - x.a || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  const first = ordered[0];
  return first ? first.key : null;
}

/**
 * How much of a scene's score its watch history keeps, by discovery mode:
 * unseen, opened and abandoned, or kept and by how long ago; kept scenes
 * gain by their O count.
 */
export function watchMultiplier(
  scene: Pick<ScoringScene, "hasHistory" | "kept" | "lastPlayedAt" | "oCount">,
  discovery: Discovery,
  now: number
): number {
  if (!scene.kept) {
    return scene.hasHistory
      ? ABANDONED_MULT[discovery]
      : UNSEEN_MULT[discovery];
  }
  const bands = KEPT_MULT[discovery];
  const ageDays =
    scene.lastPlayedAt === null
      ? Infinity
      : (now - scene.lastPlayedAt.getTime()) / DAY_MS;
  const band = KEPT_AGE_DAYS.findIndex((bound) => ageDays < bound);
  const mult = bands[band === -1 ? KEPT_AGE_DAYS.length : band] ?? 0;
  return mult * (1 + O_BOOST[discovery] * Math.min(scene.oCount, O_BOOST_CAP));
}

// ─── Criteria ───────────────────────────────────────────────────────────────

/**
 * Count user's criteria for feedback display
 */
export function countUserCriteria(
  performerRatings: Array<{ favorite: boolean; rating: number | null }>,
  studioRatings: Array<{ favorite: boolean; rating: number | null }>,
  tagRatings: Array<{ favorite: boolean; rating: number | null }>,
  sceneRatings: Array<{ favorite: boolean; rating: number | null }>,
  rankedEntities: number
): UserCriteriaCounts {
  const rated = (rows: Array<{ rating: number | null }>, min: number) =>
    rows.filter((r) => r.rating !== null && r.rating >= min).length;
  return {
    favoritedPerformers: performerRatings.filter((r) => r.favorite).length,
    ratedPerformers: rated(performerRatings, CRITERIA_ENTITY_RATING),
    favoritedStudios: studioRatings.filter((r) => r.favorite).length,
    ratedStudios: rated(studioRatings, CRITERIA_ENTITY_RATING),
    favoritedTags: tagRatings.filter((r) => r.favorite).length,
    ratedTags: rated(tagRatings, CRITERIA_ENTITY_RATING),
    favoritedScenes: sceneRatings.filter((r) => r.favorite).length,
    ratedScenes: rated(sceneRatings, CRITERIA_SCENE_RATING),
    rankedEntities,
  };
}

/**
 * Check if user has any criteria that could generate recommendations
 */
export function hasAnyCriteria(counts: UserCriteriaCounts): boolean {
  return (
    counts.favoritedPerformers > 0 ||
    counts.ratedPerformers > 0 ||
    counts.favoritedStudios > 0 ||
    counts.ratedStudios > 0 ||
    counts.favoritedTags > 0 ||
    counts.ratedTags > 0 ||
    counts.favoritedScenes > 0 ||
    counts.ratedScenes > 0 ||
    counts.rankedEntities > 0
  );
}

/** Scenes shuffled together in one window of the final order */
export const PICK_WINDOW = 20;
/** Value kept per earlier pick with the same top lead */
export const LEAD_REPEAT_FACTOR = 0.85;
/** Value kept per earlier pick from the same studio */
export const STUDIO_REPEAT_FACTOR = 0.92;

interface HeapEntry {
  index: number;
  value: number;
}

/** Whether `a` comes out of the heap before `b`: higher value, then earlier index */
function pops(a: HeapEntry, b: HeapEntry): boolean {
  return a.value > b.value || (a.value === b.value && a.index < b.index);
}

/** A binary max-heap of entries, ordered by `pops` */
class MaxHeap {
  private readonly items: HeapEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  peek(): HeapEntry | undefined {
    return this.items[0];
  }

  push(entry: HeapEntry): void {
    const items = this.items;
    items.push(entry);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const p = items[parent] as HeapEntry;
      if (!pops(entry, p)) break;
      items[i] = p;
      i = parent;
    }
    items[i] = entry;
  }

  pop(): HeapEntry | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (top === undefined || last === undefined) return top;
    if (items.length === 0) return top;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      if (left >= items.length) break;
      const right = left + 1;
      let child = left;
      if (
        right < items.length &&
        pops(items[right] as HeapEntry, items[left] as HeapEntry)
      ) {
        child = right;
      }
      const c = items[child] as HeapEntry;
      if (!pops(c, last)) break;
      items[i] = c;
      i = child;
    }
    items[i] = last;
    return top;
  }
}

/**
 * Pick up to `limit` scenes, best first, with variety: each pick's value is
 * its `final` times LEAD_REPEAT_FACTOR for every earlier pick with the same
 * `topLead` and STUDIO_REPEAT_FACTOR for every earlier pick from the same
 * `studio` (null adds no penalty). Values only fall as picks accumulate, so a
 * heap of last-computed values is re-checked lazily: pop, recompute, accept if
 * it still beats the next entry, else push it back. Ties go to the earlier
 * input. The picks are then shuffled with `rng` within consecutive windows of
 * PICK_WINDOW, so the order holds for the day and changes with the seed.
 */
export function pickVaried<
  T extends { final: number; topLead: string | null; studio: string | null },
>(scored: readonly T[], limit: number, rng: SeededRandom): T[] {
  const heap = new MaxHeap();
  scored.forEach((s, index) => heap.push({ index, value: s.final }));

  const leadCounts = new Map<string, number>();
  const studioCounts = new Map<string, number>();
  const picked: T[] = [];
  const target = Math.min(limit, scored.length);

  while (picked.length < target) {
    const entry = heap.pop();
    if (!entry) break;
    const s = scored[entry.index] as T;
    const value =
      s.final *
      LEAD_REPEAT_FACTOR ** (s.topLead ? (leadCounts.get(s.topLead) ?? 0) : 0) *
      STUDIO_REPEAT_FACTOR **
        (s.studio ? (studioCounts.get(s.studio) ?? 0) : 0);
    const current = { index: entry.index, value };
    const next = heap.peek();
    if (next && !pops(current, next)) {
      heap.push(current);
      continue;
    }
    picked.push(s);
    if (s.topLead)
      leadCounts.set(s.topLead, (leadCounts.get(s.topLead) ?? 0) + 1);
    if (s.studio)
      studioCounts.set(s.studio, (studioCounts.get(s.studio) ?? 0) + 1);
  }

  for (let start = 0; start < picked.length; start += PICK_WINDOW) {
    const window = rng.shuffle(picked.slice(start, start + PICK_WINDOW));
    picked.splice(start, window.length, ...window);
  }
  return picked;
}
