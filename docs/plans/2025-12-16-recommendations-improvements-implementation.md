# Recommendations Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable scene-based recommendations, add inline user feedback, improve error handling, and add unit tests.

**Architecture:** Extract a pure `RecommendationScoringService` from the controller to make scoring logic testable. The service calculates entity weights from both explicit ratings and scene-derived preferences. Controller handles HTTP concerns only.

**Tech Stack:** TypeScript, Vitest, Prisma, React

---

## Task 1: Extract Recommendation Scoring Service

Create a pure service with testable scoring functions.

**Files:**
- Create: `server/services/RecommendationScoringService.ts`

**Step 1: Create the service file with types and constants**

```typescript
// server/services/RecommendationScoringService.ts
import type { NormalizedScene } from "../types/index.js";

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
```

**Step 2: Run TypeScript compiler to verify no errors**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/RecommendationScoringService.ts
git commit -m "feat: extract RecommendationScoringService with scoring logic"
```

---

## Task 2: Unit Tests for Scene Weight Calculation

**Files:**
- Create: `server/tests/recommendations/recommendationScoring.test.ts`

**Step 1: Create test file with weight calculation tests**

```typescript
// server/tests/recommendations/recommendationScoring.test.ts
import { describe, it, expect } from "vitest";
import {
  calculateSceneWeightMultiplier,
  SCENE_WEIGHT_BASE,
  SCENE_WEIGHT_FAVORITE_BONUS,
  SCENE_RATING_FLOOR,
  SCENE_FAVORITED_IMPLICIT_RATING,
} from "../../services/RecommendationScoringService.js";

describe("RecommendationScoringService", () => {
  describe("calculateSceneWeightMultiplier", () => {
    it("returns 0 for null rating without favorite", () => {
      expect(calculateSceneWeightMultiplier(null, false)).toBe(0);
    });

    it("returns correct multiplier for favorited-only scene (implicit 85)", () => {
      const expected = (SCENE_FAVORITED_IMPLICIT_RATING / 100) * SCENE_WEIGHT_BASE + SCENE_WEIGHT_FAVORITE_BONUS;
      expect(calculateSceneWeightMultiplier(null, true)).toBeCloseTo(expected, 5);
      // Should be ~0.49 (0.34 + 0.15)
      expect(calculateSceneWeightMultiplier(null, true)).toBeCloseTo(0.49, 2);
    });

    it("returns 0 for rating below floor (39)", () => {
      expect(calculateSceneWeightMultiplier(39, false)).toBe(0);
      expect(calculateSceneWeightMultiplier(39, true)).toBe(0);
    });

    it("returns correct multiplier for rating at floor (40)", () => {
      const expected = (40 / 100) * SCENE_WEIGHT_BASE;
      expect(calculateSceneWeightMultiplier(40, false)).toBeCloseTo(expected, 5);
      // Should be 0.16
      expect(calculateSceneWeightMultiplier(40, false)).toBeCloseTo(0.16, 2);
    });

    it("returns correct multiplier for rating 100 without favorite", () => {
      const expected = (100 / 100) * SCENE_WEIGHT_BASE;
      expect(calculateSceneWeightMultiplier(100, false)).toBeCloseTo(expected, 5);
      // Should be 0.40
      expect(calculateSceneWeightMultiplier(100, false)).toBeCloseTo(0.40, 2);
    });

    it("returns correct multiplier for rating 100 with favorite", () => {
      const expected = (100 / 100) * SCENE_WEIGHT_BASE + SCENE_WEIGHT_FAVORITE_BONUS;
      expect(calculateSceneWeightMultiplier(100, true)).toBeCloseTo(expected, 5);
      // Should be 0.55
      expect(calculateSceneWeightMultiplier(100, true)).toBeCloseTo(0.55, 2);
    });

    it("returns correct multiplier for rating 80 without favorite", () => {
      const expected = (80 / 100) * SCENE_WEIGHT_BASE;
      expect(calculateSceneWeightMultiplier(80, false)).toBeCloseTo(expected, 5);
      // Should be 0.32
      expect(calculateSceneWeightMultiplier(80, false)).toBeCloseTo(0.32, 2);
    });

    it("returns correct multiplier for rating 80 with favorite", () => {
      const expected = (80 / 100) * SCENE_WEIGHT_BASE + SCENE_WEIGHT_FAVORITE_BONUS;
      expect(calculateSceneWeightMultiplier(80, true)).toBeCloseTo(expected, 5);
      // Should be 0.47
      expect(calculateSceneWeightMultiplier(80, true)).toBeCloseTo(0.47, 2);
    });

    it("returns correct multiplier for rating 60 without favorite", () => {
      const expected = (60 / 100) * SCENE_WEIGHT_BASE;
      expect(calculateSceneWeightMultiplier(60, false)).toBeCloseTo(expected, 5);
      // Should be 0.24
      expect(calculateSceneWeightMultiplier(60, false)).toBeCloseTo(0.24, 2);
    });
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd server && npm test -- --run tests/recommendations/recommendationScoring.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add server/tests/recommendations/recommendationScoring.test.ts
git commit -m "test: add unit tests for scene weight calculation"
```

---

## Task 3: Unit Tests for Derived Weights and Scoring

**Files:**
- Modify: `server/tests/recommendations/recommendationScoring.test.ts`

**Step 1: Add tests for buildDerivedWeightsFromScenes**

Add to the existing test file:

```typescript
import {
  calculateSceneWeightMultiplier,
  buildDerivedWeightsFromScenes,
  scoreSceneByPreferences,
  countUserCriteria,
  hasAnyCriteria,
  SCENE_WEIGHT_BASE,
  SCENE_WEIGHT_FAVORITE_BONUS,
  SCENE_RATING_FLOOR,
  SCENE_FAVORITED_IMPLICIT_RATING,
  PERFORMER_FAVORITE_WEIGHT,
  type SceneRatingInput,
  type EntityPreferences,
} from "../../services/RecommendationScoringService.js";
import type { NormalizedScene } from "../../types/index.js";

// ... existing tests ...

describe("buildDerivedWeightsFromScenes", () => {
  const mockScene1: NormalizedScene = {
    id: "scene1",
    title: "Test Scene 1",
    performers: [
      { id: "perf1", name: "Performer 1" },
      { id: "perf2", name: "Performer 2" },
    ],
    studio: { id: "studio1", name: "Studio 1" },
    tags: [
      { id: "tag1", name: "Tag 1" },
      { id: "tag2", name: "Tag 2" },
    ],
  } as NormalizedScene;

  const mockScene2: NormalizedScene = {
    id: "scene2",
    title: "Test Scene 2",
    performers: [
      { id: "perf1", name: "Performer 1" }, // Same performer
      { id: "perf3", name: "Performer 3" },
    ],
    studio: { id: "studio2", name: "Studio 2" },
    tags: [{ id: "tag1", name: "Tag 1" }], // Same tag
  } as NormalizedScene;

  const sceneMap = new Map<string, NormalizedScene>([
    ["scene1", mockScene1],
    ["scene2", mockScene2],
  ]);

  const getSceneById = (id: string) => sceneMap.get(id);

  it("extracts performer weights from rated scene", () => {
    const sceneRatings: SceneRatingInput[] = [
      { sceneId: "scene1", rating: 100, favorite: false },
    ];

    const result = buildDerivedWeightsFromScenes(sceneRatings, getSceneById);

    expect(result.derivedPerformerWeights.get("perf1")).toBeCloseTo(0.4, 2);
    expect(result.derivedPerformerWeights.get("perf2")).toBeCloseTo(0.4, 2);
  });

  it("extracts studio weights from rated scene", () => {
    const sceneRatings: SceneRatingInput[] = [
      { sceneId: "scene1", rating: 100, favorite: false },
    ];

    const result = buildDerivedWeightsFromScenes(sceneRatings, getSceneById);

    expect(result.derivedStudioWeights.get("studio1")).toBeCloseTo(0.4, 2);
  });

  it("extracts tag weights from rated scene", () => {
    const sceneRatings: SceneRatingInput[] = [
      { sceneId: "scene1", rating: 100, favorite: false },
    ];

    const result = buildDerivedWeightsFromScenes(sceneRatings, getSceneById);

    expect(result.derivedTagWeights.get("tag1")).toBeCloseTo(0.4, 2);
    expect(result.derivedTagWeights.get("tag2")).toBeCloseTo(0.4, 2);
  });

  it("accumulates weights for same entity across multiple scenes", () => {
    const sceneRatings: SceneRatingInput[] = [
      { sceneId: "scene1", rating: 100, favorite: false }, // perf1: 0.4
      { sceneId: "scene2", rating: 100, favorite: false }, // perf1: +0.4 = 0.8
    ];

    const result = buildDerivedWeightsFromScenes(sceneRatings, getSceneById);

    expect(result.derivedPerformerWeights.get("perf1")).toBeCloseTo(0.8, 2);
    expect(result.derivedPerformerWeights.get("perf2")).toBeCloseTo(0.4, 2);
    expect(result.derivedPerformerWeights.get("perf3")).toBeCloseTo(0.4, 2);
  });

  it("skips scenes rated below floor", () => {
    const sceneRatings: SceneRatingInput[] = [
      { sceneId: "scene1", rating: 39, favorite: false },
    ];

    const result = buildDerivedWeightsFromScenes(sceneRatings, getSceneById);

    expect(result.derivedPerformerWeights.size).toBe(0);
    expect(result.derivedStudioWeights.size).toBe(0);
    expect(result.derivedTagWeights.size).toBe(0);
  });

  it("handles favorited-only scenes with implicit rating", () => {
    const sceneRatings: SceneRatingInput[] = [
      { sceneId: "scene1", rating: null, favorite: true },
    ];

    const result = buildDerivedWeightsFromScenes(sceneRatings, getSceneById);

    // Implicit 85 + favorite bonus = 0.49
    expect(result.derivedPerformerWeights.get("perf1")).toBeCloseTo(0.49, 2);
  });

  it("handles scene not found in cache", () => {
    const sceneRatings: SceneRatingInput[] = [
      { sceneId: "nonexistent", rating: 100, favorite: false },
    ];

    const result = buildDerivedWeightsFromScenes(sceneRatings, getSceneById);

    expect(result.derivedPerformerWeights.size).toBe(0);
  });
});

describe("countUserCriteria", () => {
  it("counts favorited and rated entities correctly", () => {
    const performerRatings = [
      { favorite: true, rating: null },
      { favorite: false, rating: 85 },
      { favorite: false, rating: 70 }, // Below 80, not counted as rated
    ];
    const studioRatings = [{ favorite: true, rating: 90 }];
    const tagRatings = [
      { favorite: false, rating: 80 },
      { favorite: false, rating: 80 },
    ];
    const sceneRatings = [
      { favorite: true, rating: null },
      { favorite: false, rating: 50 },
      { favorite: false, rating: 30 }, // Below 40, not counted
    ];

    const counts = countUserCriteria(
      performerRatings,
      studioRatings,
      tagRatings,
      sceneRatings
    );

    expect(counts.favoritedPerformers).toBe(1);
    expect(counts.ratedPerformers).toBe(1);
    expect(counts.favoritedStudios).toBe(1);
    expect(counts.ratedStudios).toBe(1);
    expect(counts.favoritedTags).toBe(0);
    expect(counts.ratedTags).toBe(2);
    expect(counts.favoritedScenes).toBe(1);
    expect(counts.ratedScenes).toBe(1); // Only rating >= 40 counts
  });
});

describe("hasAnyCriteria", () => {
  it("returns false when all counts are zero", () => {
    const counts = {
      favoritedPerformers: 0,
      ratedPerformers: 0,
      favoritedStudios: 0,
      ratedStudios: 0,
      favoritedTags: 0,
      ratedTags: 0,
      favoritedScenes: 0,
      ratedScenes: 0,
    };

    expect(hasAnyCriteria(counts)).toBe(false);
  });

  it("returns true when only scene favorites exist", () => {
    const counts = {
      favoritedPerformers: 0,
      ratedPerformers: 0,
      favoritedStudios: 0,
      ratedStudios: 0,
      favoritedTags: 0,
      ratedTags: 0,
      favoritedScenes: 1,
      ratedScenes: 0,
    };

    expect(hasAnyCriteria(counts)).toBe(true);
  });

  it("returns true when only scene ratings exist", () => {
    const counts = {
      favoritedPerformers: 0,
      ratedPerformers: 0,
      favoritedStudios: 0,
      ratedStudios: 0,
      favoritedTags: 0,
      ratedTags: 0,
      favoritedScenes: 0,
      ratedScenes: 3,
    };

    expect(hasAnyCriteria(counts)).toBe(true);
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd server && npm test -- --run tests/recommendations/recommendationScoring.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add server/tests/recommendations/recommendationScoring.test.ts
git commit -m "test: add unit tests for derived weights and criteria counting"
```

---

## Task 4: Unit Tests for Scene Scoring

**Files:**
- Modify: `server/tests/recommendations/recommendationScoring.test.ts`

**Step 1: Add tests for scoreSceneByPreferences**

Add to the existing test file:

```typescript
describe("scoreSceneByPreferences", () => {
  const createEmptyPrefs = (): EntityPreferences => ({
    favoritePerformers: new Set(),
    highlyRatedPerformers: new Set(),
    favoriteStudios: new Set(),
    highlyRatedStudios: new Set(),
    favoriteTags: new Set(),
    highlyRatedTags: new Set(),
    derivedPerformerWeights: new Map(),
    derivedStudioWeights: new Map(),
    derivedTagWeights: new Map(),
  });

  const mockScene: NormalizedScene = {
    id: "scene1",
    title: "Test Scene",
    performers: [
      { id: "perf1", name: "Performer 1", tags: [] },
      { id: "perf2", name: "Performer 2", tags: [] },
    ],
    studio: { id: "studio1", name: "Studio 1", tags: [] },
    tags: [{ id: "tag1", name: "Tag 1" }],
  } as NormalizedScene;

  it("returns 0 for scene with no matching preferences", () => {
    const prefs = createEmptyPrefs();
    const score = scoreSceneByPreferences(mockScene, prefs);
    expect(score).toBe(0);
  });

  it("scores favorite performer correctly (5 points)", () => {
    const prefs = createEmptyPrefs();
    prefs.favoritePerformers.add("perf1");

    const score = scoreSceneByPreferences(mockScene, prefs);

    expect(score).toBeCloseTo(PERFORMER_FAVORITE_WEIGHT, 2); // 5 * sqrt(1) = 5
  });

  it("applies sqrt diminishing returns for multiple favorite performers", () => {
    const prefs = createEmptyPrefs();
    prefs.favoritePerformers.add("perf1");
    prefs.favoritePerformers.add("perf2");

    const score = scoreSceneByPreferences(mockScene, prefs);

    // 5 * sqrt(2) ≈ 7.07
    expect(score).toBeCloseTo(PERFORMER_FAVORITE_WEIGHT * Math.sqrt(2), 2);
  });

  it("scores favorite studio correctly (3 points)", () => {
    const prefs = createEmptyPrefs();
    prefs.favoriteStudios.add("studio1");

    const score = scoreSceneByPreferences(mockScene, prefs);

    expect(score).toBe(3);
  });

  it("scores derived performer weights with sqrt scaling", () => {
    const prefs = createEmptyPrefs();
    // Accumulated weight of 0.8 from two scenes
    prefs.derivedPerformerWeights.set("perf1", 0.8);

    const score = scoreSceneByPreferences(mockScene, prefs);

    // 5 * sqrt(0.8) ≈ 4.47
    expect(score).toBeCloseTo(PERFORMER_FAVORITE_WEIGHT * Math.sqrt(0.8), 2);
  });

  it("combines explicit and derived preferences", () => {
    const prefs = createEmptyPrefs();
    prefs.favoritePerformers.add("perf1"); // 5 points
    prefs.favoriteStudios.add("studio1"); // 3 points
    prefs.derivedPerformerWeights.set("perf2", 0.4); // 5 * sqrt(0.4) ≈ 3.16

    const score = scoreSceneByPreferences(mockScene, prefs);

    const expected =
      PERFORMER_FAVORITE_WEIGHT * Math.sqrt(1) + // perf1 explicit
      3 + // studio
      PERFORMER_FAVORITE_WEIGHT * Math.sqrt(0.4); // perf2 derived

    expect(score).toBeCloseTo(expected, 1);
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd server && npm test -- --run tests/recommendations/recommendationScoring.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add server/tests/recommendations/recommendationScoring.test.ts
git commit -m "test: add unit tests for scene scoring with preferences"
```

---

## Task 5: Update Controller to Use Scoring Service

**Files:**
- Modify: `server/controllers/library/scenes.ts` (lines 1372-1687)

**Step 1: Add import for the scoring service**

At the top of the file with other imports, add:

```typescript
import {
  buildDerivedWeightsFromScenes,
  scoreSceneByPreferences,
  countUserCriteria,
  hasAnyCriteria,
  type EntityPreferences,
  type SceneRatingInput,
} from "../../services/RecommendationScoringService.js";
```

**Step 2: Update getRecommendedScenes to fetch scene ratings**

Replace lines 1385-1392 (the Promise.all that fetches ratings):

```typescript
    // Fetch user ratings and watch history
    const [performerRatings, studioRatings, tagRatings, sceneRatings, watchHistory] =
      await Promise.all([
        prisma.performerRating.findMany({ where: { userId } }),
        prisma.studioRating.findMany({ where: { userId } }),
        prisma.tagRating.findMany({ where: { userId } }),
        prisma.sceneRating.findMany({ where: { userId } }),
        prisma.watchHistory.findMany({ where: { userId } }),
      ]);
```

**Step 3: Update criteria checking to include scenes**

Replace lines 1394-1438 (building sets and hasCriteria check):

```typescript
    // Build sets of favorite and highly-rated entities
    const favoritePerformers = new Set(
      performerRatings.filter((r) => r.favorite).map((r) => r.performerId)
    );
    const highlyRatedPerformers = new Set(
      performerRatings
        .filter((r) => r.rating !== null && r.rating >= 80)
        .map((r) => r.performerId)
    );
    const favoriteStudios = new Set(
      studioRatings.filter((r) => r.favorite).map((r) => r.studioId)
    );
    const highlyRatedStudios = new Set(
      studioRatings
        .filter((r) => r.rating !== null && r.rating >= 80)
        .map((r) => r.studioId)
    );
    const favoriteTags = new Set(
      tagRatings.filter((r) => r.favorite).map((r) => r.tagId)
    );
    const highlyRatedTags = new Set(
      tagRatings
        .filter((r) => r.rating !== null && r.rating >= 80)
        .map((r) => r.tagId)
    );

    // Count user criteria for feedback
    const criteriaCounts = countUserCriteria(
      performerRatings,
      studioRatings,
      tagRatings,
      sceneRatings
    );

    // Check if user has any criteria (now includes scenes)
    if (!hasAnyCriteria(criteriaCounts)) {
      return res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
        message: "No recommendations yet",
        criteria: criteriaCounts,
      });
    }
```

**Step 4: Build derived weights from scene ratings**

After the hidden entities filtering (after line ~1468), add:

```typescript
    // Build derived weights from rated/favorited scenes
    const sceneRatingsForDerived: SceneRatingInput[] = sceneRatings.map((r) => ({
      sceneId: r.sceneId,
      rating: r.rating,
      favorite: r.favorite,
    }));

    const sceneMap = new Map(allScenes.map((s) => [s.id, s]));
    const getSceneById = (id: string) => sceneMap.get(id);

    const {
      derivedPerformerWeights,
      derivedStudioWeights,
      derivedTagWeights,
    } = buildDerivedWeightsFromScenes(sceneRatingsForDerived, getSceneById);

    // Build entity preferences object
    const prefs: EntityPreferences = {
      favoritePerformers,
      highlyRatedPerformers,
      favoriteStudios,
      highlyRatedStudios,
      favoriteTags,
      highlyRatedTags,
      derivedPerformerWeights,
      derivedStudioWeights,
      derivedTagWeights,
    };
```

**Step 5: Update scoring loop to use service**

Replace the scoring loop (lines ~1496-1619) with:

```typescript
    for (const scene of allScenes) {
      const baseScore = scoreSceneByPreferences(scene, prefs);

      // Skip if no base score (doesn't match any criteria)
      if (baseScore === 0) continue;

      // Watch status modifier (reduced dominance: was +100/-100, now +30/-30)
      let adjustedScore = baseScore;
      const watchData = watchMap.get(scene.id);
      if (!watchData || watchData.playCount === 0) {
        // Never watched
        adjustedScore += 30;
      } else if (watchData.lastPlayedAt) {
        const daysSinceWatched =
          (now.getTime() - watchData.lastPlayedAt.getTime()) /
          (24 * 60 * 60 * 1000);

        if (daysSinceWatched > 14) {
          // Not recently watched
          adjustedScore += 20;
        } else if (daysSinceWatched >= 1) {
          // Recently watched (1-14 days)
          adjustedScore -= 10;
        } else {
          // Very recently watched (<24 hours)
          adjustedScore -= 30;
        }
      }

      // Engagement quality multiplier
      const oCounter = scene.o_counter || 0;
      const engagementMultiplier = 1.0 + Math.min(oCounter, 10) * 0.03;
      const finalScore = adjustedScore * engagementMultiplier;

      // Only include scenes with positive final scores
      if (finalScore > 0) {
        scoredScenes.push({ scene, score: finalScore });
      }
    }
```

**Step 6: Run TypeScript compiler and lint**

Run: `cd server && npx tsc --noEmit && npm run lint`
Expected: No errors

**Step 7: Commit**

```bash
git add server/controllers/library/scenes.ts
git commit -m "feat: integrate scene-derived preferences into recommendations"
```

---

## Task 6: Add Criteria to Empty Response

**Files:**
- Modify: `server/controllers/library/scenes.ts`

**Step 1: Update response when scenes found but scored to zero**

After the diversification/pagination logic, before the final res.json, add a check for empty results:

```typescript
    // If no recommendations after scoring, include criteria for feedback
    if (cappedScenes.length === 0) {
      return res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
        message: "No matching recommendations found",
        criteria: criteriaCounts,
      });
    }
```

**Step 2: Run lint**

Run: `cd server && npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add server/controllers/library/scenes.ts
git commit -m "feat: include criteria counts in empty recommendation responses"
```

---

## Task 7: Improve Error Handling in Controller

**Files:**
- Modify: `server/controllers/library/scenes.ts` (lines 1681-1686)

**Step 1: Update catch block with better error logging**

Replace the catch block:

```typescript
  } catch (error) {
    const err = error as Error;
    logger.error("Error getting recommended scenes:", {
      message: err.message,
      name: err.name,
      stack: err.stack,
      userId: req.user?.id,
    });

    const errorType = err.name || "Unknown error";
    res.status(500).json({
      error: "Failed to get recommended scenes",
      errorType,
    });
  }
```

**Step 2: Run lint**

Run: `cd server && npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add server/controllers/library/scenes.ts
git commit -m "fix: improve error logging and response for recommendations"
```

---

## Task 8: Update Client to Display Criteria Feedback

**Files:**
- Modify: `client/src/components/pages/Recommended.jsx`

**Step 1: Add state for criteria**

Add to the state declarations (around line 25):

```jsx
const [criteria, setCriteria] = useState(null);
```

**Step 2: Update fetch handler to capture criteria**

Update the response destructuring (around line 52):

```jsx
const { scenes: fetchedScenes, count, message: msg, criteria: criteriaCounts } = response.data;

setScenes(fetchedScenes);
setTotalCount(count);
setCriteria(criteriaCounts || null);
if (msg) {
  setMessage(msg);
}
```

**Step 3: Update error handling to capture errorType**

Update the error handling (around line 76):

```jsx
setError({
  message: err.response?.data?.error || "Failed to load recommendations",
  errorType: err.response?.data?.errorType || null,
});
```

**Step 4: Update error display**

Update error prop passed to SceneGrid (around line 160):

```jsx
error={!initMessage && error ? error.message : null}
```

And add error type display after the PageHeader:

```jsx
{error && error.errorType && (
  <div className="mb-4 text-sm text-gray-500">
    (Error type: {error.errorType})
  </div>
)}
```

**Step 5: Create criteria display component**

Add helper function before the return statement:

```jsx
const renderCriteriaFeedback = () => {
  if (!criteria) return null;

  const hasAnyActivity =
    criteria.favoritedPerformers > 0 ||
    criteria.ratedPerformers > 0 ||
    criteria.favoritedStudios > 0 ||
    criteria.ratedStudios > 0 ||
    criteria.favoritedTags > 0 ||
    criteria.ratedTags > 0 ||
    criteria.favoritedScenes > 0 ||
    criteria.ratedScenes > 0;

  if (!hasAnyActivity) {
    return (
      <div className="text-gray-400 text-sm mt-2">
        <p>To get personalized suggestions, try favoriting or rating (7.0+) performers, studios, tags, or scenes you enjoy.</p>
      </div>
    );
  }

  return (
    <div className="text-gray-400 text-sm mt-2">
      <p className="mb-2">Your current activity:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>{criteria.favoritedPerformers} favorited performer{criteria.favoritedPerformers !== 1 ? 's' : ''}, {criteria.ratedPerformers} highly-rated</li>
        <li>{criteria.favoritedStudios} favorited studio{criteria.favoritedStudios !== 1 ? 's' : ''}, {criteria.ratedStudios} highly-rated</li>
        <li>{criteria.favoritedTags} favorited tag{criteria.favoritedTags !== 1 ? 's' : ''}, {criteria.ratedTags} highly-rated</li>
        <li>{criteria.favoritedScenes} favorited scene{criteria.favoritedScenes !== 1 ? 's' : ''}, {criteria.ratedScenes} rated scene{criteria.ratedScenes !== 1 ? 's' : ''}</li>
      </ul>
      <p className="mt-2 italic">Tip: Rating more scenes helps us learn your preferences!</p>
    </div>
  );
};
```

**Step 6: Update SceneGrid props to include criteria**

Update the SceneGrid component to pass criteria:

```jsx
<SceneGrid
  scenes={scenes}
  loading={loading}
  error={!initMessage && error ? error.message : null}
  currentPage={page}
  totalPages={totalPages}
  onPageChange={handlePageChange}
  onHideSuccess={handleHideSuccess}
  perPage={perPage}
  onPerPageChange={handlePerPageChange}
  totalCount={totalCount}
  emptyMessage={message || "No Recommendations Yet"}
  emptyDescription={
    criteria ? renderCriteriaFeedback() : "Rate or Favorite more items to get personalized recommendations."
  }
/>
```

**Step 7: Run client lint**

Run: `cd client && npm run lint`
Expected: No errors (or only pre-existing warnings)

**Step 8: Commit**

```bash
git add client/src/components/pages/Recommended.jsx
git commit -m "feat: display criteria feedback on empty recommendations page"
```

---

## Task 9: Integration Test - Manual Verification

**Files:** None (manual testing)

**Step 1: Start the dev server**

Run: `npm run dev` (or your dev command)

**Step 2: Test with no ratings**

1. Log in as a user with no ratings/favorites
2. Navigate to Recommended page
3. Verify: Empty state shows criteria counts (all zeros)
4. Verify: Message explains how to get recommendations

**Step 3: Test with only scene favorites**

1. Favorite 2-3 scenes from the library
2. Navigate to Recommended page
3. Verify: Recommendations appear (derived from scene content)
4. Verify: Scenes with matching performers/studios/tags are shown

**Step 4: Test with explicit + scene ratings**

1. Also favorite a performer explicitly
2. Navigate to Recommended page
3. Verify: Recommendations include both explicit matches and derived matches

**Step 5: Test error display**

1. Temporarily break the database connection
2. Navigate to Recommended page
3. Verify: Error message shows with error type

**Step 6: Document results**

Note any issues found for follow-up.

---

## Task 10: Run Full Test Suite

**Files:** None

**Step 1: Run all server tests**

Run: `cd server && npm test`
Expected: All tests PASS

**Step 2: Run client tests (if any)**

Run: `cd client && npm test` (if applicable)
Expected: All tests PASS

**Step 3: Final commit for any cleanup**

If any issues found, fix and commit.

**Step 4: Push branch**

```bash
git push -u origin feature/recommendations-improvements
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Extract RecommendationScoringService | `server/services/RecommendationScoringService.ts` |
| 2 | Unit tests for weight calculation | `server/tests/recommendations/recommendationScoring.test.ts` |
| 3 | Unit tests for derived weights | `server/tests/recommendations/recommendationScoring.test.ts` |
| 4 | Unit tests for scene scoring | `server/tests/recommendations/recommendationScoring.test.ts` |
| 5 | Update controller to use service | `server/controllers/library/scenes.ts` |
| 6 | Add criteria to empty response | `server/controllers/library/scenes.ts` |
| 7 | Improve error handling | `server/controllers/library/scenes.ts` |
| 8 | Update client for criteria feedback | `client/src/components/pages/Recommended.jsx` |
| 9 | Manual integration testing | - |
| 10 | Run full test suite | - |
