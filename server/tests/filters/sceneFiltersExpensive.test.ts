/**
 * Unit Tests for Scene Expensive Filtering Logic
 *
 * Tests the scene "expensive" filters (require merged user data) in controllers/library/scenes.ts
 * These filters access user-specific data like ratings, favorites, watch history
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { NormalizedScene, PeekSceneFilter } from "../../types/index.js";
import { applyExpensiveSceneFilters } from "../../controllers/library/scenes.js";
import {
  createMockScene,
  createMockScenes,
  createMockPerformers,
  createMockStudios,
  createMockTags,
  createMockGroups,
} from "../helpers/mockDataGenerators.js";

describe("Scene Filters - Expensive Filters (User-Specific Data)", () => {
  let mockPerformers: ReturnType<typeof createMockPerformers>;
  let mockStudios: ReturnType<typeof createMockStudios>;
  let mockTags: ReturnType<typeof createMockTags>;
  let mockGroups: ReturnType<typeof createMockGroups>;
  let mockScenes: NormalizedScene[];

  beforeEach(() => {
    // Create mock data for testing with realistic user data
    mockPerformers = createMockPerformers(10);
    mockStudios = createMockStudios(5);
    mockTags = createMockTags(15);
    mockGroups = createMockGroups(8);
    mockScenes = createMockScenes(
      50,
      mockPerformers,
      mockStudios,
      mockTags,
      mockGroups
    );
  });

  describe("Favorite Filter", () => {
    it("should filter favorite scenes when favorite=true", () => {
      const filter: PeekSceneFilter = {
        favorite: true,
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.favorite).toBe(true);
      });

      // Verify we actually got some results
      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter non-favorite scenes when favorite=false", () => {
      const filter: PeekSceneFilter = {
        favorite: false,
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.favorite).toBe(false);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should return all scenes when favorite filter not specified", () => {
      const result = applyExpensiveSceneFilters(mockScenes, {});

      expect(result.length).toBe(mockScenes.length);
    });
  });

  describe("Rating Filter", () => {
    it("should filter by rating100 with GREATER_THAN modifier", () => {
      const threshold = 50;
      const filter: PeekSceneFilter = {
        rating100: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const rating = scene.rating100 || 0;
        expect(rating).toBeGreaterThan(threshold);
      });
    });

    it("should filter by rating100 with EQUALS modifier", () => {
      const rating = 80;
      const filter: PeekSceneFilter = {
        rating100: { value: rating, modifier: "EQUALS" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.rating100).toBe(rating);
      });
    });

    it("should filter by rating100 with NOT_EQUALS modifier", () => {
      const rating = 0;
      const filter: PeekSceneFilter = {
        rating100: { value: rating, modifier: "NOT_EQUALS" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.rating100).not.toBe(rating);
      });
    });

    it("should filter by rating100 with BETWEEN modifier", () => {
      const min = 20;
      const max = 80;
      const filter: PeekSceneFilter = {
        rating100: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const rating = scene.rating100 || 0;
        expect(rating).toBeGreaterThanOrEqual(min);
        expect(rating).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("O Counter Filter", () => {
    it("should filter by o_counter with GREATER_THAN modifier", () => {
      const threshold = 5;
      const filter: PeekSceneFilter = {
        o_counter: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const oCounter = scene.o_counter || 0;
        expect(oCounter).toBeGreaterThan(threshold);
      });
    });

    it("should filter by o_counter with EQUALS modifier (find scenes with exact count)", () => {
      const count = 10;
      const filter: PeekSceneFilter = {
        o_counter: { value: count, modifier: "EQUALS" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.o_counter).toBe(count);
      });
    });

    it("should filter by o_counter with NOT_EQUALS modifier (exclude specific count)", () => {
      const count = 0;
      const filter: PeekSceneFilter = {
        o_counter: { value: count, modifier: "NOT_EQUALS" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.o_counter).not.toBe(count);
      });
    });

    it("should filter by o_counter with BETWEEN modifier", () => {
      const min = 5;
      const max = 20;
      const filter: PeekSceneFilter = {
        o_counter: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const oCounter = scene.o_counter || 0;
        expect(oCounter).toBeGreaterThanOrEqual(min);
        expect(oCounter).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Play Count Filter", () => {
    it("should filter by play_count with GREATER_THAN modifier", () => {
      const threshold = 10;
      const filter: PeekSceneFilter = {
        play_count: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const playCount = scene.play_count || 0;
        expect(playCount).toBeGreaterThan(threshold);
      });
    });

    it("should filter by play_count with LESS_THAN modifier", () => {
      const threshold = 50;
      const filter: PeekSceneFilter = {
        play_count: { value: threshold, modifier: "LESS_THAN" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const playCount = scene.play_count || 0;
        expect(playCount).toBeLessThan(threshold);
      });
    });

    it("should filter by play_count with BETWEEN modifier", () => {
      const min = 20;
      const max = 60;
      const filter: PeekSceneFilter = {
        play_count: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const playCount = scene.play_count || 0;
        expect(playCount).toBeGreaterThanOrEqual(min);
        expect(playCount).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Play Duration Filter", () => {
    it("should filter by play_duration with GREATER_THAN modifier", () => {
      const threshold = 1000; // seconds
      const filter: PeekSceneFilter = {
        play_duration: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const playDuration = scene.play_duration || 0;
        expect(playDuration).toBeGreaterThan(threshold);
      });
    });

    it("should filter by play_duration with BETWEEN modifier", () => {
      const min = 500;
      const max = 5000;
      const filter: PeekSceneFilter = {
        play_duration: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const playDuration = scene.play_duration || 0;
        expect(playDuration).toBeGreaterThanOrEqual(min);
        expect(playDuration).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Last Played Date Filter", () => {
    it("should filter by last_played_at with GREATER_THAN modifier", () => {
      const threshold = new Date(Date.now() - 30 * 86400000); // 30 days ago
      const filter: PeekSceneFilter = {
        last_played_at: {
          value: threshold.toISOString(),
          modifier: "GREATER_THAN",
        },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.last_played_at).toBeTruthy();
        const lastPlayedDate = new Date(scene.last_played_at!);
        expect(lastPlayedDate.getTime()).toBeGreaterThan(threshold.getTime());
      });
    });

    it("should filter by last_played_at with BETWEEN modifier", () => {
      const min = new Date(Date.now() - 60 * 86400000);
      const max = new Date(Date.now() - 10 * 86400000);
      const filter: PeekSceneFilter = {
        last_played_at: {
          value: min.toISOString(),
          value2: max.toISOString(),
          modifier: "BETWEEN",
        },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.last_played_at).toBeTruthy();
        const lastPlayedDate = new Date(scene.last_played_at!);
        expect(lastPlayedDate.getTime()).toBeGreaterThanOrEqual(
          min.getTime()
        );
        expect(lastPlayedDate.getTime()).toBeLessThanOrEqual(max.getTime());
      });
    });

    it("should exclude scenes with null last_played_at when filter is applied", () => {
      const threshold = new Date(Date.now() - 30 * 86400000);
      const filter: PeekSceneFilter = {
        last_played_at: {
          value: threshold.toISOString(),
          modifier: "GREATER_THAN",
        },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      // All results should have last_played_at defined
      result.forEach((scene) => {
        expect(scene.last_played_at).not.toBeNull();
      });
    });
  });

  describe("Last O Date Filter", () => {
    it("should filter by last_o_at with LESS_THAN modifier", () => {
      const threshold = new Date(Date.now() - 7 * 86400000); // 7 days ago
      const filter: PeekSceneFilter = {
        last_o_at: {
          value: threshold.toISOString(),
          modifier: "LESS_THAN",
        },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.last_o_at).toBeTruthy();
        const lastODate = new Date(scene.last_o_at!);
        expect(lastODate.getTime()).toBeLessThan(threshold.getTime());
      });
    });

    it("should exclude scenes with null last_o_at when filter is applied", () => {
      const threshold = new Date(Date.now() - 30 * 86400000);
      const filter: PeekSceneFilter = {
        last_o_at: {
          value: threshold.toISOString(),
          modifier: "GREATER_THAN",
        },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      // All results should have last_o_at defined
      result.forEach((scene) => {
        expect(scene.last_o_at).not.toBeNull();
      });
    });
  });

  describe("Nested Entity Favorite Filters", () => {
    it("should filter scenes with favorite performers", () => {
      const filter: PeekSceneFilter = {
        performer_favorite: true,
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const hasFavoritePerformer = scene.performers?.some(
          (p) => p.favorite === true
        );
        expect(hasFavoritePerformer).toBe(true);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter scenes with favorite studio", () => {
      const filter: PeekSceneFilter = {
        studio_favorite: true,
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.studio).toBeTruthy();
        expect(scene.studio!.favorite).toBe(true);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter scenes with favorite tags", () => {
      const filter: PeekSceneFilter = {
        tag_favorite: true,
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const hasFavoriteTag = scene.tags?.some((t) => t.favorite === true);
        expect(hasFavoriteTag).toBe(true);
      });

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("Multiple Expensive Filters Combined", () => {
    it("should apply multiple expensive filters together (AND logic)", () => {
      const filter: PeekSceneFilter = {
        favorite: true,
        rating100: { value: 60, modifier: "GREATER_THAN" },
        play_count: { value: 5, modifier: "GREATER_THAN" },
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.favorite).toBe(true);
        expect(scene.rating100 || 0).toBeGreaterThan(60);
        expect(scene.play_count || 0).toBeGreaterThan(5);
      });
    });

    it("should combine nested entity favorite filters", () => {
      const filter: PeekSceneFilter = {
        performer_favorite: true,
        studio_favorite: true,
      };

      const result = applyExpensiveSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const hasFavoritePerformer = scene.performers?.some(
          (p) => p.favorite === true
        );
        expect(hasFavoritePerformer).toBe(true);
        expect(scene.studio).toBeTruthy();
        expect(scene.studio!.favorite).toBe(true);
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle scenes with null ratings correctly", () => {
      const scenesWithNullRatings = mockScenes.filter((s) => !s.rating100);

      const filter: PeekSceneFilter = {
        rating100: { value: 0, modifier: "GREATER_THAN" },
      };

      const result = applyExpensiveSceneFilters(scenesWithNullRatings, filter);

      // Scenes with null ratings should be treated as 0
      expect(result.length).toBe(0);
    });

    it("should handle scenes with zero play_count correctly", () => {
      const scenesWithZeroPlays = mockScenes.filter((s) => s.play_count === 0);

      const filter: PeekSceneFilter = {
        play_count: { value: 0, modifier: "EQUALS" },
      };

      const result = applyExpensiveSceneFilters(scenesWithZeroPlays, filter);

      expect(result.length).toBe(scenesWithZeroPlays.length);
      result.forEach((scene) => {
        expect(scene.play_count).toBe(0);
      });
    });

    it("should handle scenes with no studio when studio_favorite filter is applied", () => {
      const scenesWithoutStudio = mockScenes.filter((s) => !s.studio);

      const filter: PeekSceneFilter = {
        studio_favorite: true,
      };

      const result = applyExpensiveSceneFilters(scenesWithoutStudio, filter);

      // Scenes without studios should not match studio_favorite filter
      expect(result.length).toBe(0);
    });

    it("should handle scenes with no performers when performer_favorite filter is applied", () => {
      const sceneWithoutPerformers = createMockScene({
        id: "no_performers",
        performers: [],
      });

      const filter: PeekSceneFilter = {
        performer_favorite: true,
      };

      const result = applyExpensiveSceneFilters([sceneWithoutPerformers], filter);

      expect(result.length).toBe(0);
    });
  });
});
