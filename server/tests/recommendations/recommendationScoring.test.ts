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
