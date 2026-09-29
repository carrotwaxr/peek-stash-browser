// server/services/RecommendationScoringService.ts
import type { SceneScoringData } from "../types/index.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import type { SeededRandom } from "../utils/seededRandom.js";

// Configuration constants
export const SCENE_WEIGHT_BASE = 0.4;
export const SCENE_WEIGHT_FAVORITE_BONUS = 0.15;
export const SCENE_RATING_FLOOR = 40;
export const SCENE_FAVORITED_IMPLICIT_RATING = 85;

// Explicit entity scoring weights (from current algorithm)
export const PERFORMER_FAVORITE_WEIGHT = 5;
export const PERFORMER_RATED_WEIGHT = 3;
export const STUDIO_FAVORITE_WEIGHT = 3;
export const STUDIO_RATED_WEIGHT = 2;
export const TAG_SCENE_FAVORITE_WEIGHT = 1.0;
export const TAG_SCENE_RATED_WEIGHT = 0.5;

// Implicit engagement weights (from watch history / UserEntityRanking)
// These scale the engagementRate (which is already normalized by library presence)
export const IMPLICIT_PERFORMER_WEIGHT = 3;
export const IMPLICIT_STUDIO_WEIGHT = 2;
export const IMPLICIT_TAG_WEIGHT = 0.8;

/** A user's rating of one scene on one instance */
export interface SceneRatingInput {
  sceneId: string;
  instanceId: string;
  rating: number | null;
  favorite: boolean;
}

/**
 * One scene as the scoring pass reads it: its ids (all on the scene's
 * instance) and the user's watch data on it, from `getScenesForScoring`.
 */
export interface ScoringScene extends SceneScoringData {
  playCount: number;
  lastPlayedAt: Date | null;
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
}

/**
 * Calculate weight multiplier for a scene based on rating and favorite status
 * Returns 0 if scene should be skipped (below floor, no rating/favorite)
 */
export function calculateSceneWeightMultiplier(
  rating: number | null,
  favorite: boolean
): number {
  // Determine effective rating
  let effectiveRating: number | null = rating;

  if (effectiveRating === null && favorite) {
    effectiveRating = SCENE_FAVORITED_IMPLICIT_RATING;
  }

  if (effectiveRating === null) {
    return 0;
  }

  if (effectiveRating < SCENE_RATING_FLOOR) {
    return 0;
  }

  let multiplier = (effectiveRating / 100) * SCENE_WEIGHT_BASE;

  if (favorite) {
    multiplier += SCENE_WEIGHT_FAVORITE_BONUS;
  }

  return multiplier;
}

/**
 * Ranking data from UserEntityRanking table
 */
export interface EntityRankingData {
  entityId: string;
  instanceId: string;
  entityType: string;
  engagementRate: number;
  percentileRank: number;
}

/**
 * Build implicit entity weights from UserEntityRanking data, keyed by
 * entityKey(entityId, instanceId).
 * Uses engagementRate (already normalized by library presence) as the weight
 * Only includes entities above a minimum percentile threshold
 */
export function buildImplicitWeightsFromRankings(
  rankings: EntityRankingData[],
  minPercentile: number = 50 // Only include top half by default
): {
  implicitPerformerWeights: Map<string, number>;
  implicitStudioWeights: Map<string, number>;
  implicitTagWeights: Map<string, number>;
} {
  const implicitPerformerWeights = new Map<string, number>();
  const implicitStudioWeights = new Map<string, number>();
  const implicitTagWeights = new Map<string, number>();

  for (const ranking of rankings) {
    // Skip entities below the percentile threshold
    if (ranking.percentileRank < minPercentile) continue;

    // Use engagementRate as the weight (already normalized by library presence)
    // Scale by percentile to give more weight to top-ranked entities
    const weight = ranking.engagementRate * (ranking.percentileRank / 100);
    const key = entityKey(ranking.entityId, ranking.instanceId);

    switch (ranking.entityType) {
      case "performer":
        implicitPerformerWeights.set(key, weight);
        break;
      case "studio":
        implicitStudioWeights.set(key, weight);
        break;
      case "tag":
        implicitTagWeights.set(key, weight);
        break;
      // scenes are not used as preference signals
    }
  }

  return {
    implicitPerformerWeights,
    implicitStudioWeights,
    implicitTagWeights,
  };
}

/**
 * Count user's criteria for feedback display
 */
export function countUserCriteria(
  performerRatings: Array<{ favorite: boolean; rating: number | null }>,
  studioRatings: Array<{ favorite: boolean; rating: number | null }>,
  tagRatings: Array<{ favorite: boolean; rating: number | null }>,
  sceneRatings: Array<{ favorite: boolean; rating: number | null }>
): UserCriteriaCounts {
  return {
    favoritedPerformers: performerRatings.filter((r) => r.favorite).length,
    ratedPerformers: performerRatings.filter(
      (r) => r.rating !== null && r.rating >= 80
    ).length,
    favoritedStudios: studioRatings.filter((r) => r.favorite).length,
    ratedStudios: studioRatings.filter(
      (r) => r.rating !== null && r.rating >= 80
    ).length,
    favoritedTags: tagRatings.filter((r) => r.favorite).length,
    ratedTags: tagRatings.filter((r) => r.rating !== null && r.rating >= 80)
      .length,
    favoritedScenes: sceneRatings.filter((r) => r.favorite).length,
    ratedScenes: sceneRatings.filter(
      (r) => r.rating !== null && r.rating >= SCENE_RATING_FLOOR
    ).length,
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
    counts.ratedScenes > 0
  );
}

/**
 * Lightweight entity preferences for scoring (excludes performer/studio tag data)
 * Used with SceneScoringData for efficient two-phase query architecture.
 * Every set and map is keyed by entityKey(id, instanceId): two Stash servers
 * reuse small ids, and a favorite on one says nothing about the other.
 */
export interface LightweightEntityPreferences {
  favoritePerformers: Set<string>;
  highlyRatedPerformers: Set<string>;
  favoriteStudios: Set<string>;
  highlyRatedStudios: Set<string>;
  favoriteTags: Set<string>;
  highlyRatedTags: Set<string>;
  derivedPerformerWeights: Map<string, number>;
  derivedStudioWeights: Map<string, number>;
  derivedTagWeights: Map<string, number>;
  // Implicit weights from watch history engagement (from UserEntityRanking)
  implicitPerformerWeights: Map<string, number>;
  implicitStudioWeights: Map<string, number>;
  implicitTagWeights: Map<string, number>;
}

/**
 * Build derived entity weights from rated/favorited scenes using lightweight
 * scoring data, keyed by entityKey(id, the rated scene's instance).
 */
export function buildDerivedWeightsFromScoringData(
  sceneRatings: readonly SceneRatingInput[],
  getScoringData: (ref: EntityRef) => SceneScoringData | undefined
): {
  derivedPerformerWeights: Map<string, number>;
  derivedStudioWeights: Map<string, number>;
  derivedTagWeights: Map<string, number>;
} {
  const derivedPerformerWeights = new Map<string, number>();
  const derivedStudioWeights = new Map<string, number>();
  const derivedTagWeights = new Map<string, number>();

  for (const sceneRating of sceneRatings) {
    const multiplier = calculateSceneWeightMultiplier(
      sceneRating.rating,
      sceneRating.favorite
    );

    if (multiplier === 0) continue;

    const scoringData = getScoringData({
      id: sceneRating.sceneId,
      instanceId: sceneRating.instanceId,
    });
    if (!scoringData) continue;
    const instanceId = scoringData.instanceId;

    // Accumulate performer weights
    for (const performerId of scoringData.performerIds) {
      const key = entityKey(performerId, instanceId);
      derivedPerformerWeights.set(
        key,
        (derivedPerformerWeights.get(key) ?? 0) + multiplier
      );
    }

    // Accumulate studio weight
    if (scoringData.studioId) {
      const key = entityKey(scoringData.studioId, instanceId);
      derivedStudioWeights.set(
        key,
        (derivedStudioWeights.get(key) ?? 0) + multiplier
      );
    }

    // Accumulate tag weights (scene tags only - no performer/studio tags in lightweight data)
    for (const tagId of scoringData.tagIds) {
      const key = entityKey(tagId, instanceId);
      derivedTagWeights.set(
        key,
        (derivedTagWeights.get(key) ?? 0) + multiplier
      );
    }
  }

  return {
    derivedPerformerWeights,
    derivedStudioWeights,
    derivedTagWeights,
  };
}

/**
 * Score a scene using lightweight scoring data (IDs only)
 * Simplified version that doesn't include performer/studio tag scoring
 * (those require full entity hydration which defeats the purpose of lightweight scoring)
 */
export function scoreScoringDataByPreferences(
  scoringData: SceneScoringData,
  prefs: LightweightEntityPreferences
): number {
  let baseScore = 0;

  // Score performers with diminishing returns (sqrt scaling)
  let favoritePerformerCount = 0;
  let highlyRatedPerformerCount = 0;
  let derivedPerformerWeight = 0;
  let implicitPerformerWeight = 0;

  const sceneInstId = scoringData.instanceId;
  for (const performerId of scoringData.performerIds) {
    const performerKey = entityKey(performerId, sceneInstId);
    if (prefs.favoritePerformers.has(performerKey)) {
      favoritePerformerCount++;
    } else if (prefs.highlyRatedPerformers.has(performerKey)) {
      highlyRatedPerformerCount++;
    }

    const derived = prefs.derivedPerformerWeights.get(performerKey);
    if (derived) {
      derivedPerformerWeight += derived;
    }

    const implicit = prefs.implicitPerformerWeights.get(performerKey);
    if (implicit) {
      implicitPerformerWeight += implicit;
    }
  }

  if (favoritePerformerCount > 0) {
    baseScore += PERFORMER_FAVORITE_WEIGHT * Math.sqrt(favoritePerformerCount);
  }
  if (highlyRatedPerformerCount > 0) {
    baseScore += PERFORMER_RATED_WEIGHT * Math.sqrt(highlyRatedPerformerCount);
  }
  if (derivedPerformerWeight > 0) {
    baseScore += PERFORMER_FAVORITE_WEIGHT * Math.sqrt(derivedPerformerWeight);
  }
  if (implicitPerformerWeight > 0) {
    baseScore += IMPLICIT_PERFORMER_WEIGHT * Math.sqrt(implicitPerformerWeight);
  }

  // Score studio (using composite key for multi-instance)
  if (scoringData.studioId) {
    const studioKey = entityKey(scoringData.studioId, sceneInstId);
    if (prefs.favoriteStudios.has(studioKey)) {
      baseScore += STUDIO_FAVORITE_WEIGHT;
    } else if (prefs.highlyRatedStudios.has(studioKey)) {
      baseScore += STUDIO_RATED_WEIGHT;
    }

    const derivedStudio = prefs.derivedStudioWeights.get(studioKey);
    if (derivedStudio) {
      baseScore += STUDIO_FAVORITE_WEIGHT * Math.sqrt(derivedStudio);
    }

    const implicitStudio = prefs.implicitStudioWeights.get(studioKey);
    if (implicitStudio) {
      baseScore += IMPLICIT_STUDIO_WEIGHT * Math.sqrt(implicitStudio);
    }
  }

  // Score scene tags only (no performer/studio tag data in lightweight scoring)
  let favoriteTagCount = 0;
  let ratedTagCount = 0;
  let derivedTagWeight = 0;
  let implicitTagWeight = 0;

  for (const tagId of scoringData.tagIds) {
    const tagKey = entityKey(tagId, sceneInstId);
    if (prefs.favoriteTags.has(tagKey)) {
      favoriteTagCount++;
    } else if (prefs.highlyRatedTags.has(tagKey)) {
      ratedTagCount++;
    }

    const derived = prefs.derivedTagWeights.get(tagKey);
    if (derived) {
      derivedTagWeight += derived;
    }

    const implicit = prefs.implicitTagWeights.get(tagKey);
    if (implicit) {
      implicitTagWeight += implicit;
    }
  }

  if (favoriteTagCount > 0) {
    baseScore += TAG_SCENE_FAVORITE_WEIGHT * Math.sqrt(favoriteTagCount);
  }
  if (ratedTagCount > 0) {
    baseScore += TAG_SCENE_RATED_WEIGHT * Math.sqrt(ratedTagCount);
  }
  if (derivedTagWeight > 0) {
    baseScore += TAG_SCENE_FAVORITE_WEIGHT * Math.sqrt(derivedTagWeight);
  }
  if (implicitTagWeight > 0) {
    baseScore += IMPLICIT_TAG_WEIGHT * Math.sqrt(implicitTagWeight);
  }

  return baseScore;
}

/**
 * Add variety to a ranked list while keeping its rough order: the scores fall
 * into 10 bands (10% of the range each), highest first, and each band is
 * shuffled with `rng`. When every score is equal (range 0, one scored scene
 * included) all scenes share the first band.
 */
export function diversifyByScoreTier<T extends { score: number }>(
  scored: readonly T[], // sorted by score, highest first
  rng: SeededRandom
): T[] {
  const first = scored[0];
  const last = scored[scored.length - 1];
  if (!first || !last) return [];
  const range = first.score - last.score;
  const tierSize = range / 10;
  const tiers: T[][] = Array.from({ length: 10 }, () => []);
  for (const s of scored) {
    // One tier when every score is equal: no division by zero
    const index =
      range > 0
        ? Math.min(9, Math.floor((first.score - s.score) / tierSize))
        : 0;
    tiers[index]?.push(s);
  }
  return tiers.flatMap((tier) => rng.shuffle(tier));
}
