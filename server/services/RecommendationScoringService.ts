// server/services/RecommendationScoringService.ts
import type { NormalizedScene, SceneScoringData } from "../types/index.js";

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
export const TAG_PERFORMER_FAVORITE_WEIGHT = 0.3;
export const TAG_PERFORMER_RATED_WEIGHT = 0.15;
export const TAG_STUDIO_FAVORITE_WEIGHT = 0.5;
export const TAG_STUDIO_RATED_WEIGHT = 0.25;

// Implicit engagement weights (from watch history / UserEntityRanking)
// These scale the engagementRate (which is already normalized by library presence)
export const IMPLICIT_PERFORMER_WEIGHT = 3;
export const IMPLICIT_STUDIO_WEIGHT = 2;
export const IMPLICIT_TAG_WEIGHT = 0.8;

export interface SceneRatingInput {
  sceneId: string;
  rating: number | null;
  favorite: boolean;
}

export interface EntityPreferences {
  favoritePerformers: Set<string>;
  highlyRatedPerformers: Set<string>;
  favoriteStudios: Set<string>;
  highlyRatedStudios: Set<string>;
  favoriteTags: Set<string>;
  highlyRatedTags: Set<string>;
  // Derived weights from scenes (accumulated per entity)
  derivedPerformerWeights: Map<string, number>;
  derivedStudioWeights: Map<string, number>;
  derivedTagWeights: Map<string, number>;
  // Implicit weights from watch history engagement (from UserEntityRanking)
  implicitPerformerWeights: Map<string, number>;
  implicitStudioWeights: Map<string, number>;
  implicitTagWeights: Map<string, number>;
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
 * Build derived entity weights from rated/favorited scenes
 */
export function buildDerivedWeightsFromScenes(
  sceneRatings: SceneRatingInput[],
  getSceneById: (sceneId: string) => NormalizedScene | undefined
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

    const scene = getSceneById(sceneRating.sceneId);
    if (!scene) continue;

    // Accumulate performer weights
    if (scene.performers) {
      for (const performer of scene.performers) {
        const performerId = String(performer.id);
        const current = derivedPerformerWeights.get(performerId) || 0;
        derivedPerformerWeights.set(performerId, current + multiplier);
      }
    }

    // Accumulate studio weight
    if (scene.studio) {
      const studioId = String(scene.studio.id);
      const current = derivedStudioWeights.get(studioId) || 0;
      derivedStudioWeights.set(studioId, current + multiplier);
    }

    // Accumulate tag weights (scene tags only, not performer/studio tags)
    if (scene.tags) {
      for (const tag of scene.tags) {
        const tagId = String(tag.id);
        const current = derivedTagWeights.get(tagId) || 0;
        derivedTagWeights.set(tagId, current + multiplier);
      }
    }
  }

  return {
    derivedPerformerWeights,
    derivedStudioWeights,
    derivedTagWeights,
  };
}

/**
 * Ranking data from UserEntityRanking table
 */
export interface EntityRankingData {
  entityId: string;
  entityType: string;
  engagementRate: number;
  percentileRank: number;
}

/**
 * Build implicit entity weights from UserEntityRanking data
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

    switch (ranking.entityType) {
      case "performer":
        implicitPerformerWeights.set(ranking.entityId, weight);
        break;
      case "studio":
        implicitStudioWeights.set(ranking.entityId, weight);
        break;
      case "tag":
        implicitTagWeights.set(ranking.entityId, weight);
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
 * Score a scene based on user preferences (explicit + derived)
 * Returns the base score before watch status modifiers
 */
export function scoreSceneByPreferences(
  scene: NormalizedScene,
  prefs: EntityPreferences
): number {
  let baseScore = 0;

  // Score performers with diminishing returns (sqrt scaling)
  const instId = scene.instanceId || "";
  if (scene.performers) {
    let favoritePerformerCount = 0;
    let highlyRatedPerformerCount = 0;
    let derivedPerformerWeight = 0;
    let implicitPerformerWeight = 0;

    for (const performer of scene.performers) {
      const performerId = String(performer.id);
      const perfKey = `${performerId}\0${instId}`;

      if (prefs.favoritePerformers.has(perfKey)) {
        favoritePerformerCount++;
      } else if (prefs.highlyRatedPerformers.has(perfKey)) {
        highlyRatedPerformerCount++;
      }

      // Add derived weight
      const derived = prefs.derivedPerformerWeights.get(performerId);
      if (derived) {
        derivedPerformerWeight += derived;
      }

      // Add implicit engagement weight
      const implicit = prefs.implicitPerformerWeights?.get(performerId);
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
      // Apply sqrt to accumulated derived weight, scale by favorite weight
      baseScore += PERFORMER_FAVORITE_WEIGHT * Math.sqrt(derivedPerformerWeight);
    }
    if (implicitPerformerWeight > 0) {
      // Implicit engagement signal from watch history
      baseScore += IMPLICIT_PERFORMER_WEIGHT * Math.sqrt(implicitPerformerWeight);
    }
  }

  // Score studio (using composite key for multi-instance)
  if (scene.studio) {
    const studioId = String(scene.studio.id);
    const studioKey = `${studioId}\0${instId}`;

    if (prefs.favoriteStudios.has(studioKey)) {
      baseScore += STUDIO_FAVORITE_WEIGHT;
    } else if (prefs.highlyRatedStudios.has(studioKey)) {
      baseScore += STUDIO_RATED_WEIGHT;
    }

    // Add derived studio weight
    const derivedStudio = prefs.derivedStudioWeights.get(studioId);
    if (derivedStudio) {
      baseScore += STUDIO_FAVORITE_WEIGHT * Math.sqrt(derivedStudio);
    }

    // Add implicit engagement weight
    const implicitStudio = prefs.implicitStudioWeights?.get(studioId);
    if (implicitStudio) {
      baseScore += IMPLICIT_STUDIO_WEIGHT * Math.sqrt(implicitStudio);
    }
  }

  // Score tags with source weighting
  const sceneTags = new Set<string>();
  const performerTags = new Set<string>();
  const studioTags = new Set<string>();

  (scene.tags || []).forEach((t) => sceneTags.add(String(t.id)));
  (scene.performers || []).forEach((p) => {
    (p.tags || []).forEach((t) => performerTags.add(String(t.id)));
  });
  if (scene.studio?.tags) {
    scene.studio.tags.forEach((t) => studioTags.add(String(t.id)));
  }

  let favoriteSceneTagCount = 0;
  let favoritePerformerTagCount = 0;
  let favoriteStudioTagCount = 0;
  let ratedSceneTagCount = 0;
  let ratedPerformerTagCount = 0;
  let ratedStudioTagCount = 0;
  let derivedTagWeight = 0;
  let implicitTagWeight = 0;

  for (const tagId of sceneTags) {
    const tagKey = `${tagId}\0${instId}`;
    if (prefs.favoriteTags.has(tagKey)) favoriteSceneTagCount++;
    else if (prefs.highlyRatedTags.has(tagKey)) ratedSceneTagCount++;

    const derived = prefs.derivedTagWeights.get(tagId);
    if (derived) derivedTagWeight += derived;

    const implicit = prefs.implicitTagWeights?.get(tagId);
    if (implicit) implicitTagWeight += implicit;
  }

  for (const tagId of performerTags) {
    if (!sceneTags.has(tagId)) {
      const tagKey = `${tagId}\0${instId}`;
      if (prefs.favoriteTags.has(tagKey)) favoritePerformerTagCount++;
      else if (prefs.highlyRatedTags.has(tagKey)) ratedPerformerTagCount++;
    }
  }

  for (const tagId of studioTags) {
    if (!sceneTags.has(tagId) && !performerTags.has(tagId)) {
      const tagKey = `${tagId}\0${instId}`;
      if (prefs.favoriteTags.has(tagKey)) favoriteStudioTagCount++;
      else if (prefs.highlyRatedTags.has(tagKey)) ratedStudioTagCount++;
    }
  }

  if (favoriteSceneTagCount > 0) {
    baseScore += TAG_SCENE_FAVORITE_WEIGHT * Math.sqrt(favoriteSceneTagCount);
  }
  if (favoritePerformerTagCount > 0) {
    baseScore += TAG_PERFORMER_FAVORITE_WEIGHT * Math.sqrt(favoritePerformerTagCount);
  }
  if (favoriteStudioTagCount > 0) {
    baseScore += TAG_STUDIO_FAVORITE_WEIGHT * Math.sqrt(favoriteStudioTagCount);
  }
  if (ratedSceneTagCount > 0) {
    baseScore += TAG_SCENE_RATED_WEIGHT * Math.sqrt(ratedSceneTagCount);
  }
  if (ratedPerformerTagCount > 0) {
    baseScore += TAG_PERFORMER_RATED_WEIGHT * Math.sqrt(ratedPerformerTagCount);
  }
  if (ratedStudioTagCount > 0) {
    baseScore += TAG_STUDIO_RATED_WEIGHT * Math.sqrt(ratedStudioTagCount);
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
    ratedPerformers: performerRatings.filter((r) => r.rating !== null && r.rating >= 80).length,
    favoritedStudios: studioRatings.filter((r) => r.favorite).length,
    ratedStudios: studioRatings.filter((r) => r.rating !== null && r.rating >= 80).length,
    favoritedTags: tagRatings.filter((r) => r.favorite).length,
    ratedTags: tagRatings.filter((r) => r.rating !== null && r.rating >= 80).length,
    favoritedScenes: sceneRatings.filter((r) => r.favorite).length,
    ratedScenes: sceneRatings.filter((r) => r.rating !== null && r.rating >= SCENE_RATING_FLOOR).length,
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
 * Used with SceneScoringData for efficient two-phase query architecture
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
 * Build derived entity weights from rated/favorited scenes using lightweight scoring data
 * Works with SceneScoringData (IDs only) instead of full NormalizedScene objects
 */
export function buildDerivedWeightsFromScoringData(
  sceneRatings: SceneRatingInput[],
  getScoringDataById: (sceneId: string) => SceneScoringData | undefined
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

    const scoringData = getScoringDataById(sceneRating.sceneId);
    if (!scoringData) continue;

    // Accumulate performer weights
    for (const performerId of scoringData.performerIds) {
      const current = derivedPerformerWeights.get(performerId) || 0;
      derivedPerformerWeights.set(performerId, current + multiplier);
    }

    // Accumulate studio weight
    if (scoringData.studioId) {
      const current = derivedStudioWeights.get(scoringData.studioId) || 0;
      derivedStudioWeights.set(scoringData.studioId, current + multiplier);
    }

    // Accumulate tag weights (scene tags only - no performer/studio tags in lightweight data)
    for (const tagId of scoringData.tagIds) {
      const current = derivedTagWeights.get(tagId) || 0;
      derivedTagWeights.set(tagId, current + multiplier);
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

  const sceneInstId = scoringData.instanceId || "";
  for (const performerId of scoringData.performerIds) {
    const compositeKey = `${performerId}\0${sceneInstId}`;
    if (prefs.favoritePerformers.has(compositeKey)) {
      favoritePerformerCount++;
    } else if (prefs.highlyRatedPerformers.has(compositeKey)) {
      highlyRatedPerformerCount++;
    }

    const derived = prefs.derivedPerformerWeights.get(performerId);
    if (derived) {
      derivedPerformerWeight += derived;
    }

    const implicit = prefs.implicitPerformerWeights?.get(performerId);
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
    const studioKey = `${scoringData.studioId}\0${sceneInstId}`;
    if (prefs.favoriteStudios.has(studioKey)) {
      baseScore += STUDIO_FAVORITE_WEIGHT;
    } else if (prefs.highlyRatedStudios.has(studioKey)) {
      baseScore += STUDIO_RATED_WEIGHT;
    }

    const derivedStudio = prefs.derivedStudioWeights.get(scoringData.studioId);
    if (derivedStudio) {
      baseScore += STUDIO_FAVORITE_WEIGHT * Math.sqrt(derivedStudio);
    }

    const implicitStudio = prefs.implicitStudioWeights?.get(scoringData.studioId);
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
    const tagKey = `${tagId}\0${sceneInstId}`;
    if (prefs.favoriteTags.has(tagKey)) {
      favoriteTagCount++;
    } else if (prefs.highlyRatedTags.has(tagKey)) {
      ratedTagCount++;
    }

    const derived = prefs.derivedTagWeights.get(tagId);
    if (derived) {
      derivedTagWeight += derived;
    }

    const implicit = prefs.implicitTagWeights?.get(tagId);
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
