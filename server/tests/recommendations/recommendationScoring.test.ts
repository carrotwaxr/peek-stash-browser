// server/tests/recommendations/recommendationScoring.test.ts
import { describe, it, expect } from "vitest";
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

  describe("scoreSceneByPreferences", () => {
    const INST_ID = "inst-a";

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
      implicitPerformerWeights: new Map(),
      implicitStudioWeights: new Map(),
      implicitTagWeights: new Map(),
    });

    const mockScene = {
      id: "scene1",
      title: "Test Scene",
      instanceId: INST_ID,
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
      prefs.favoritePerformers.add(`perf1\0${INST_ID}`);

      const score = scoreSceneByPreferences(mockScene, prefs);

      expect(score).toBeCloseTo(PERFORMER_FAVORITE_WEIGHT, 2); // 5 * sqrt(1) = 5
    });

    it("applies sqrt diminishing returns for multiple favorite performers", () => {
      const prefs = createEmptyPrefs();
      prefs.favoritePerformers.add(`perf1\0${INST_ID}`);
      prefs.favoritePerformers.add(`perf2\0${INST_ID}`);

      const score = scoreSceneByPreferences(mockScene, prefs);

      // 5 * sqrt(2) ≈ 7.07
      expect(score).toBeCloseTo(PERFORMER_FAVORITE_WEIGHT * Math.sqrt(2), 2);
    });

    it("scores favorite studio correctly (3 points)", () => {
      const prefs = createEmptyPrefs();
      prefs.favoriteStudios.add(`studio1\0${INST_ID}`);

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
      prefs.favoritePerformers.add(`perf1\0${INST_ID}`); // 5 points
      prefs.favoriteStudios.add(`studio1\0${INST_ID}`); // 3 points
      prefs.derivedPerformerWeights.set("perf2", 0.4); // 5 * sqrt(0.4) ≈ 3.16

      const score = scoreSceneByPreferences(mockScene, prefs);

      const expected =
        PERFORMER_FAVORITE_WEIGHT * Math.sqrt(1) + // perf1 explicit
        3 + // studio
        PERFORMER_FAVORITE_WEIGHT * Math.sqrt(0.4); // perf2 derived

      expect(score).toBeCloseTo(expected, 1);
    });
  });
});
