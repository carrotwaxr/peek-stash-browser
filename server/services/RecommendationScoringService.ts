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
 * Score a scene based on user preferences (explicit + derived)
 * Returns the base score before watch status modifiers
 */
export function scoreSceneByPreferences(
  scene: NormalizedScene,
  prefs: EntityPreferences
): number {
  let baseScore = 0;

  // Score performers with diminishing returns (sqrt scaling)
  if (scene.performers) {
    let favoritePerformerCount = 0;
    let highlyRatedPerformerCount = 0;
    let derivedPerformerWeight = 0;

    for (const performer of scene.performers) {
      const performerId = String(performer.id);

      if (prefs.favoritePerformers.has(performerId)) {
        favoritePerformerCount++;
      } else if (prefs.highlyRatedPerformers.has(performerId)) {
        highlyRatedPerformerCount++;
      }

      // Add derived weight
      const derived = prefs.derivedPerformerWeights.get(performerId);
      if (derived) {
        derivedPerformerWeight += derived;
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
  }

  // Score studio
  if (scene.studio) {
    const studioId = String(scene.studio.id);

    if (prefs.favoriteStudios.has(studioId)) {
      baseScore += STUDIO_FAVORITE_WEIGHT;
    } else if (prefs.highlyRatedStudios.has(studioId)) {
      baseScore += STUDIO_RATED_WEIGHT;
    }

    // Add derived studio weight
    const derivedStudio = prefs.derivedStudioWeights.get(studioId);
    if (derivedStudio) {
      baseScore += STUDIO_FAVORITE_WEIGHT * Math.sqrt(derivedStudio);
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

  for (const tagId of sceneTags) {
    if (prefs.favoriteTags.has(tagId)) favoriteSceneTagCount++;
    else if (prefs.highlyRatedTags.has(tagId)) ratedSceneTagCount++;

    const derived = prefs.derivedTagWeights.get(tagId);
    if (derived) derivedTagWeight += derived;
  }

  for (const tagId of performerTags) {
    if (!sceneTags.has(tagId)) {
      if (prefs.favoriteTags.has(tagId)) favoritePerformerTagCount++;
      else if (prefs.highlyRatedTags.has(tagId)) ratedPerformerTagCount++;
    }
  }

  for (const tagId of studioTags) {
    if (!sceneTags.has(tagId) && !performerTags.has(tagId)) {
      if (prefs.favoriteTags.has(tagId)) favoriteStudioTagCount++;
      else if (prefs.highlyRatedTags.has(tagId)) ratedStudioTagCount++;
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

  for (const performerId of scoringData.performerIds) {
    if (prefs.favoritePerformers.has(performerId)) {
      favoritePerformerCount++;
    } else if (prefs.highlyRatedPerformers.has(performerId)) {
      highlyRatedPerformerCount++;
    }

    const derived = prefs.derivedPerformerWeights.get(performerId);
    if (derived) {
      derivedPerformerWeight += derived;
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

  // Score studio
  if (scoringData.studioId) {
    if (prefs.favoriteStudios.has(scoringData.studioId)) {
      baseScore += STUDIO_FAVORITE_WEIGHT;
    } else if (prefs.highlyRatedStudios.has(scoringData.studioId)) {
      baseScore += STUDIO_RATED_WEIGHT;
    }

    const derivedStudio = prefs.derivedStudioWeights.get(scoringData.studioId);
    if (derivedStudio) {
      baseScore += STUDIO_FAVORITE_WEIGHT * Math.sqrt(derivedStudio);
    }
  }

  // Score scene tags only (no performer/studio tag data in lightweight scoring)
  let favoriteTagCount = 0;
  let ratedTagCount = 0;
  let derivedTagWeight = 0;

  for (const tagId of scoringData.tagIds) {
    if (prefs.favoriteTags.has(tagId)) {
      favoriteTagCount++;
    } else if (prefs.highlyRatedTags.has(tagId)) {
      ratedTagCount++;
    }

    const derived = prefs.derivedTagWeights.get(tagId);
    if (derived) {
      derivedTagWeight += derived;
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

  return baseScore;
}
