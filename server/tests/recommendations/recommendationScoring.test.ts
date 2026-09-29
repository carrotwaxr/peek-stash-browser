// server/tests/recommendations/recommendationScoring.test.ts
import { describe, expect, it } from "vitest";
import {
  IMPLICIT_PERFORMER_WEIGHT,
  type LightweightEntityPreferences,
  PERFORMER_FAVORITE_WEIGHT,
  SCENE_FAVORITED_IMPLICIT_RATING,
  SCENE_WEIGHT_BASE,
  SCENE_WEIGHT_FAVORITE_BONUS,
  STUDIO_FAVORITE_WEIGHT,
  type SceneRatingInput,
  buildDerivedWeightsFromScoringData,
  buildImplicitWeightsFromRankings,
  calculateSceneWeightMultiplier,
  countUserCriteria,
  diversifyByScoreTier,
  hasAnyCriteria,
  scoreScoringDataByPreferences,
} from "../../services/RecommendationScoringService.js";
import type { SceneScoringData } from "../../types/index.js";
import { entityKey } from "../../utils/entityRef.js";
import { SeededRandom } from "../../utils/seededRandom.js";

describe("RecommendationScoringService", () => {
  describe("calculateSceneWeightMultiplier", () => {
    it("returns 0 for null rating without favorite", () => {
      expect(calculateSceneWeightMultiplier(null, false)).toBe(0);
    });

    it("returns correct multiplier for favorited-only scene (implicit 85)", () => {
      const expected =
        (SCENE_FAVORITED_IMPLICIT_RATING / 100) * SCENE_WEIGHT_BASE +
        SCENE_WEIGHT_FAVORITE_BONUS;
      expect(calculateSceneWeightMultiplier(null, true)).toBeCloseTo(
        expected,
        5
      );
      // Should be ~0.49 (0.34 + 0.15)
      expect(calculateSceneWeightMultiplier(null, true)).toBeCloseTo(0.49, 2);
    });

    it("returns 0 for rating below floor (39)", () => {
      expect(calculateSceneWeightMultiplier(39, false)).toBe(0);
      expect(calculateSceneWeightMultiplier(39, true)).toBe(0);
    });

    it("returns correct multiplier for rating at floor (40)", () => {
      const expected = (40 / 100) * SCENE_WEIGHT_BASE;
      expect(calculateSceneWeightMultiplier(40, false)).toBeCloseTo(
        expected,
        5
      );
      // Should be 0.16
      expect(calculateSceneWeightMultiplier(40, false)).toBeCloseTo(0.16, 2);
    });

    it("returns correct multiplier for rating 100 without favorite", () => {
      const expected = (100 / 100) * SCENE_WEIGHT_BASE;
      expect(calculateSceneWeightMultiplier(100, false)).toBeCloseTo(
        expected,
        5
      );
      // Should be 0.40
      expect(calculateSceneWeightMultiplier(100, false)).toBeCloseTo(0.4, 2);
    });

    it("returns correct multiplier for rating 100 with favorite", () => {
      const expected =
        (100 / 100) * SCENE_WEIGHT_BASE + SCENE_WEIGHT_FAVORITE_BONUS;
      expect(calculateSceneWeightMultiplier(100, true)).toBeCloseTo(
        expected,
        5
      );
      // Should be 0.55
      expect(calculateSceneWeightMultiplier(100, true)).toBeCloseTo(0.55, 2);
    });

    it("returns correct multiplier for rating 80 without favorite", () => {
      const expected = (80 / 100) * SCENE_WEIGHT_BASE;
      expect(calculateSceneWeightMultiplier(80, false)).toBeCloseTo(
        expected,
        5
      );
      // Should be 0.32
      expect(calculateSceneWeightMultiplier(80, false)).toBeCloseTo(0.32, 2);
    });

    it("returns correct multiplier for rating 80 with favorite", () => {
      const expected =
        (80 / 100) * SCENE_WEIGHT_BASE + SCENE_WEIGHT_FAVORITE_BONUS;
      expect(calculateSceneWeightMultiplier(80, true)).toBeCloseTo(expected, 5);
      // Should be 0.47
      expect(calculateSceneWeightMultiplier(80, true)).toBeCloseTo(0.47, 2);
    });

    it("returns correct multiplier for rating 60 without favorite", () => {
      const expected = (60 / 100) * SCENE_WEIGHT_BASE;
      expect(calculateSceneWeightMultiplier(60, false)).toBeCloseTo(
        expected,
        5
      );
      // Should be 0.24
      expect(calculateSceneWeightMultiplier(60, false)).toBeCloseTo(0.24, 2);
    });
  });

  describe("buildDerivedWeightsFromScoringData", () => {
    const A = "inst-a";
    const B = "inst-b";
    const scoring = (
      id: string,
      instanceId: string,
      performerIds: string[],
      studioId: string,
      tagIds: string[]
    ): SceneScoringData => ({
      id,
      instanceId,
      studioId,
      performerIds,
      tagIds,
      oCounter: 0,
    });
    const scenes = new Map(
      [
        scoring("scene1", A, ["perf1", "perf2"], "studio1", ["tag1", "tag2"]),
        scoring("scene2", A, ["perf1", "perf3"], "studio2", ["tag1"]),
        // The same scene id on B, with the same performer id
        scoring("scene1", B, ["perf1"], "studio1", ["tag1"]),
      ].map((s) => [entityKey(s.id, s.instanceId), s])
    );
    const getScoringData = (ref: { id: string; instanceId: string }) =>
      scenes.get(entityKey(ref.id, ref.instanceId));
    const rated = (
      sceneId: string,
      instanceId: string,
      rating: number | null,
      favorite = false
    ): SceneRatingInput => ({ sceneId, instanceId, rating, favorite });

    it("extracts performer weights from rated scene, keyed by its instance", () => {
      const result = buildDerivedWeightsFromScoringData(
        [rated("scene1", A, 100)],
        getScoringData
      );

      expect(
        result.derivedPerformerWeights.get(entityKey("perf1", A))
      ).toBeCloseTo(0.4, 2);
      expect(
        result.derivedPerformerWeights.get(entityKey("perf2", A))
      ).toBeCloseTo(0.4, 2);
      expect(result.derivedPerformerWeights.has(entityKey("perf1", B))).toBe(
        false
      );
    });

    it("extracts studio weights from rated scene", () => {
      const result = buildDerivedWeightsFromScoringData(
        [rated("scene1", A, 100)],
        getScoringData
      );

      expect(
        result.derivedStudioWeights.get(entityKey("studio1", A))
      ).toBeCloseTo(0.4, 2);
    });

    it("extracts tag weights from rated scene", () => {
      const result = buildDerivedWeightsFromScoringData(
        [rated("scene1", A, 100)],
        getScoringData
      );

      expect(result.derivedTagWeights.get(entityKey("tag1", A))).toBeCloseTo(
        0.4,
        2
      );
      expect(result.derivedTagWeights.get(entityKey("tag2", A))).toBeCloseTo(
        0.4,
        2
      );
    });

    it("accumulates weights for same entity across multiple scenes", () => {
      const result = buildDerivedWeightsFromScoringData(
        [rated("scene1", A, 100), rated("scene2", A, 100)],
        getScoringData
      );

      expect(
        result.derivedPerformerWeights.get(entityKey("perf1", A))
      ).toBeCloseTo(0.8, 2);
      expect(
        result.derivedPerformerWeights.get(entityKey("perf2", A))
      ).toBeCloseTo(0.4, 2);
      expect(
        result.derivedPerformerWeights.get(entityKey("perf3", A))
      ).toBeCloseTo(0.4, 2);
    });

    it("a rating of scene 1 on B weighs B's performer, not A's", () => {
      const result = buildDerivedWeightsFromScoringData(
        [rated("scene1", B, 100)],
        getScoringData
      );

      expect(
        result.derivedPerformerWeights.get(entityKey("perf1", B))
      ).toBeCloseTo(0.4, 2);
      expect(result.derivedPerformerWeights.has(entityKey("perf1", A))).toBe(
        false
      );
    });

    it("skips scenes rated below floor", () => {
      const result = buildDerivedWeightsFromScoringData(
        [rated("scene1", A, 39)],
        getScoringData
      );

      expect(result.derivedPerformerWeights.size).toBe(0);
      expect(result.derivedStudioWeights.size).toBe(0);
      expect(result.derivedTagWeights.size).toBe(0);
    });

    it("handles favorited-only scenes with implicit rating", () => {
      const result = buildDerivedWeightsFromScoringData(
        [rated("scene1", A, null, true)],
        getScoringData
      );

      // Implicit 85 + favorite bonus = 0.49
      expect(
        result.derivedPerformerWeights.get(entityKey("perf1", A))
      ).toBeCloseTo(0.49, 2);
    });

    it("handles scene not found", () => {
      const result = buildDerivedWeightsFromScoringData(
        [rated("nonexistent", A, 100)],
        getScoringData
      );

      expect(result.derivedPerformerWeights.size).toBe(0);
    });
  });

  describe("buildImplicitWeightsFromRankings", () => {
    const ranking = (
      entityType: string,
      entityId: string,
      instanceId: string,
      percentileRank: number,
      engagementRate = 1
    ) => ({ entityType, entityId, instanceId, percentileRank, engagementRate });

    it("keys each weight by the entity's instance and scales it by percentile", () => {
      const result = buildImplicitWeightsFromRankings([
        ranking("performer", "12", "inst-a", 100, 2),
        ranking("studio", "5", "inst-a", 80),
        ranking("tag", "7", "inst-b", 50),
      ]);

      expect(
        result.implicitPerformerWeights.get(entityKey("12", "inst-a"))
      ).toBe(2);
      expect(
        result.implicitPerformerWeights.has(entityKey("12", "inst-b"))
      ).toBe(false);
      expect(
        result.implicitStudioWeights.get(entityKey("5", "inst-a"))
      ).toBeCloseTo(0.8, 6);
      expect(
        result.implicitTagWeights.get(entityKey("7", "inst-b"))
      ).toBeCloseTo(0.5, 6);
    });

    it("leaves out entities below the percentile and scenes", () => {
      const result = buildImplicitWeightsFromRankings([
        ranking("performer", "12", "inst-a", 49),
        ranking("scene", "3", "inst-a", 100),
      ]);

      expect(result.implicitPerformerWeights.size).toBe(0);
      expect(result.implicitStudioWeights.size).toBe(0);
      expect(result.implicitTagWeights.size).toBe(0);
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

  describe("scoreScoringDataByPreferences", () => {
    const INST_ID = "inst-a";

    const createEmptyPrefs = (): LightweightEntityPreferences => ({
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

    const scene: SceneScoringData = {
      id: "scene1",
      instanceId: INST_ID,
      studioId: "studio1",
      performerIds: ["perf1", "perf2"],
      tagIds: ["tag1"],
      oCounter: 0,
    };

    it("returns 0 for scene with no matching preferences", () => {
      expect(scoreScoringDataByPreferences(scene, createEmptyPrefs())).toBe(0);
    });

    it("scores favorite performer correctly (5 points)", () => {
      const prefs = createEmptyPrefs();
      prefs.favoritePerformers.add(entityKey("perf1", INST_ID));

      expect(scoreScoringDataByPreferences(scene, prefs)).toBeCloseTo(
        PERFORMER_FAVORITE_WEIGHT,
        2
      );
    });

    it("applies sqrt diminishing returns for multiple favorite performers", () => {
      const prefs = createEmptyPrefs();
      prefs.favoritePerformers.add(entityKey("perf1", INST_ID));
      prefs.favoritePerformers.add(entityKey("perf2", INST_ID));

      // 5 * sqrt(2) = 7.07
      expect(scoreScoringDataByPreferences(scene, prefs)).toBeCloseTo(
        PERFORMER_FAVORITE_WEIGHT * Math.sqrt(2),
        2
      );
    });

    it("scores favorite studio correctly (3 points)", () => {
      const prefs = createEmptyPrefs();
      prefs.favoriteStudios.add(entityKey("studio1", INST_ID));

      expect(scoreScoringDataByPreferences(scene, prefs)).toBe(
        STUDIO_FAVORITE_WEIGHT
      );
    });

    it("scores derived performer weights with sqrt scaling", () => {
      const prefs = createEmptyPrefs();
      prefs.derivedPerformerWeights.set(entityKey("perf1", INST_ID), 0.64);

      // 5 * sqrt(0.64) = 4
      expect(scoreScoringDataByPreferences(scene, prefs)).toBeCloseTo(4, 2);
    });

    it("combines explicit, derived and implicit preferences", () => {
      const prefs = createEmptyPrefs();
      prefs.favoritePerformers.add(entityKey("perf1", INST_ID));
      prefs.derivedPerformerWeights.set(entityKey("perf2", INST_ID), 1);
      prefs.implicitPerformerWeights.set(entityKey("perf2", INST_ID), 1);

      expect(scoreScoringDataByPreferences(scene, prefs)).toBeCloseTo(
        PERFORMER_FAVORITE_WEIGHT +
          PERFORMER_FAVORITE_WEIGHT +
          IMPLICIT_PERFORMER_WEIGHT,
        2
      );
    });
  });

  describe("diversifyByScoreTier", () => {
    it("returns a single scored scene", () => {
      expect(
        diversifyByScoreTier([{ id: "1", score: 35 }], new SeededRandom(42))
      ).toEqual([{ id: "1", score: 35 }]);
    });

    it("keeps every scene when all scores are equal", () => {
      const scored = ["1", "2", "3", "4", "5"].map((id) => ({ id, score: 35 }));

      const ids = diversifyByScoreTier(scored, new SeededRandom(42)).map(
        (s) => s.id
      );

      // One tier, shuffled by the seed
      expect(ids).toEqual(["1", "2", "4", "5", "3"]);
    });

    it("puts a lower score band after a higher one", () => {
      const scored = [
        { id: "100", score: 100 },
        { id: "99", score: 99 },
        { id: "10", score: 10 },
      ];

      const ids = diversifyByScoreTier(scored, new SeededRandom(42)).map(
        (s) => s.id
      );

      expect([...ids].sort()).toEqual(["10", "100", "99"]);
      expect(ids[ids.length - 1]).toBe("10");
    });
  });
});
