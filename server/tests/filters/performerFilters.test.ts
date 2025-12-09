/**
 * Unit Tests for Performer Filtering Logic
 *
 * Tests the performer filtering implementation in controllers/library/performers.ts
 * Uses mock data to validate filter behavior without database dependency
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { NormalizedPerformer, PeekPerformerFilter } from "../../types/index.js";
import { applyPerformerFilters } from "../../controllers/library/performers.js";
import {
  createMockPerformer,
  createMockPerformers,
  createMockTags,
} from "../helpers/mockDataGenerators.js";

describe("Performer Filters", () => {
  let mockTags: ReturnType<typeof createMockTags>;
  let mockPerformers: NormalizedPerformer[];

  beforeEach(() => {
    // Create mock data for testing
    mockTags = createMockTags(15);
    mockPerformers = createMockPerformers(50);
  });

  describe("ID Filter", () => {
    it("should filter performers by single ID", async () => {
      const targetId = mockPerformers[0].id;
      const filter: PeekPerformerFilter = {
        ids: [targetId],
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(targetId);
    });

    it("should filter performers by multiple IDs", async () => {
      const targetIds = [mockPerformers[0].id, mockPerformers[5].id, mockPerformers[10].id];
      const filter: PeekPerformerFilter = {
        ids: targetIds,
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      expect(result).toHaveLength(3);
      result.forEach((performer) => {
        expect(targetIds).toContain(performer.id);
      });
    });

    it("should return all performers when ids array is empty", async () => {
      const filter: PeekPerformerFilter = {
        ids: [],
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      expect(result).toHaveLength(mockPerformers.length);
    });

    it("should return empty array when no performers match the IDs", async () => {
      const filter: PeekPerformerFilter = {
        ids: ["non-existent-id"],
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      expect(result).toHaveLength(0);
    });
  });

  describe("Favorite Filter", () => {
    it("should filter favorite performers when favorite=true", async () => {
      const filter: PeekPerformerFilter = {
        favorite: true,
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.favorite).toBe(true);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter non-favorite performers when favorite=false", async () => {
      const filter: PeekPerformerFilter = {
        favorite: false,
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.favorite).toBe(false);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should return all performers when favorite filter not specified", async () => {
      const result = await applyPerformerFilters(mockPerformers, {});

      expect(result).toHaveLength(mockPerformers.length);
    });
  });

  describe("Gender Filter", () => {
    it("should filter by gender with EQUALS modifier", async () => {
      const filter: PeekPerformerFilter = {
        gender: { value: "FEMALE", modifier: "EQUALS" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.gender).toBe("FEMALE");
      });
    });

    it("should filter by gender with NOT_EQUALS modifier", async () => {
      const filter: PeekPerformerFilter = {
        gender: { value: "MALE", modifier: "NOT_EQUALS" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.gender).not.toBe("MALE");
      });
    });

    it("should filter non-binary performers", async () => {
      const filter: PeekPerformerFilter = {
        gender: { value: "NON_BINARY", modifier: "EQUALS" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.gender).toBe("NON_BINARY");
      });
    });
  });

  describe("Tags Filter", () => {
    it("should filter by tags with INCLUDES_ALL modifier", async () => {
      const performer1 = createMockPerformer({
        id: "p1",
        tags: [mockTags[0], mockTags[1], mockTags[2]],
      });
      const performer2 = createMockPerformer({
        id: "p2",
        tags: [mockTags[0], mockTags[1]],
      });
      const performer3 = createMockPerformer({
        id: "p3",
        tags: [mockTags[1]],
      });
      const testPerformers = [performer1, performer2, performer3];

      const filter: PeekPerformerFilter = {
        tags: {
          value: [mockTags[0].id, mockTags[1].id],
          modifier: "INCLUDES_ALL",
        },
      };

      const result = await applyPerformerFilters(testPerformers, filter);

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.id)).toContain("p1");
      expect(result.map((p) => p.id)).toContain("p2");
    });

    it("should filter by tags with INCLUDES modifier", async () => {
      const performer1 = createMockPerformer({
        id: "p1",
        tags: [mockTags[0], mockTags[1]],
      });
      const performer2 = createMockPerformer({
        id: "p2",
        tags: [mockTags[1]],
      });
      const performer3 = createMockPerformer({
        id: "p3",
        tags: [mockTags[5]],
      });
      const testPerformers = [performer1, performer2, performer3];

      const filter: PeekPerformerFilter = {
        tags: {
          value: [mockTags[0].id, mockTags[1].id],
          modifier: "INCLUDES",
        },
      };

      const result = await applyPerformerFilters(testPerformers, filter);

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.id)).toContain("p1");
      expect(result.map((p) => p.id)).toContain("p2");
    });

    it("should filter by tags with EXCLUDES modifier", async () => {
      const performer1 = createMockPerformer({
        id: "p1",
        tags: [mockTags[0], mockTags[1]],
      });
      const performer2 = createMockPerformer({
        id: "p2",
        tags: [mockTags[5]],
      });
      const performer3 = createMockPerformer({
        id: "p3",
        tags: [],
      });
      const testPerformers = [performer1, performer2, performer3];

      const filter: PeekPerformerFilter = {
        tags: {
          value: [mockTags[0].id, mockTags[1].id],
          modifier: "EXCLUDES",
        },
      };

      const result = await applyPerformerFilters(testPerformers, filter);

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.id)).toContain("p2");
      expect(result.map((p) => p.id)).toContain("p3");
    });

    it("should return all performers when tags array is empty", async () => {
      const filter: PeekPerformerFilter = {
        tags: {
          value: [],
          modifier: "INCLUDES",
        },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      expect(result).toHaveLength(mockPerformers.length);
    });
  });

  describe("Rating Filter", () => {
    it("should filter by rating100 with GREATER_THAN modifier", async () => {
      const threshold = 50;
      const filter: PeekPerformerFilter = {
        rating100: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        const rating = performer.rating100 || 0;
        expect(rating).toBeGreaterThan(threshold);
      });
    });

    it("should filter by rating100 with LESS_THAN modifier", async () => {
      const threshold = 50;
      const filter: PeekPerformerFilter = {
        rating100: { value: threshold, modifier: "LESS_THAN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        const rating = performer.rating100 || 0;
        expect(rating).toBeLessThan(threshold);
      });
    });

    it("should filter by rating100 with EQUALS modifier", async () => {
      const rating = 80;
      const filter: PeekPerformerFilter = {
        rating100: { value: rating, modifier: "EQUALS" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.rating100).toBe(rating);
      });
    });

    it("should filter by rating100 with NOT_EQUALS modifier", async () => {
      const rating = 0;
      const filter: PeekPerformerFilter = {
        rating100: { value: rating, modifier: "NOT_EQUALS" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.rating100).not.toBe(rating);
      });
    });

    it("should filter by rating100 with BETWEEN modifier", async () => {
      const min = 20;
      const max = 80;
      const filter: PeekPerformerFilter = {
        rating100: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        const rating = performer.rating100 || 0;
        expect(rating).toBeGreaterThanOrEqual(min);
        expect(rating).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("O Counter Filter", () => {
    it("should filter by o_counter with GREATER_THAN modifier", async () => {
      const threshold = 10;
      const filter: PeekPerformerFilter = {
        o_counter: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        const oCounter = performer.o_counter || 0;
        expect(oCounter).toBeGreaterThan(threshold);
      });
    });

    it("should filter by o_counter with LESS_THAN modifier", async () => {
      const threshold = 50;
      const filter: PeekPerformerFilter = {
        o_counter: { value: threshold, modifier: "LESS_THAN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        const oCounter = performer.o_counter || 0;
        expect(oCounter).toBeLessThan(threshold);
      });
    });

    it("should filter by o_counter with EQUALS modifier", async () => {
      const count = 25;
      const filter: PeekPerformerFilter = {
        o_counter: { value: count, modifier: "EQUALS" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.o_counter).toBe(count);
      });
    });

    it("should filter by o_counter with BETWEEN modifier", async () => {
      const min = 10;
      const max = 50;
      const filter: PeekPerformerFilter = {
        o_counter: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        const oCounter = performer.o_counter || 0;
        expect(oCounter).toBeGreaterThanOrEqual(min);
        expect(oCounter).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Play Count Filter", () => {
    it("should filter by play_count with GREATER_THAN modifier", async () => {
      const threshold = 20;
      const filter: PeekPerformerFilter = {
        play_count: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        const playCount = performer.play_count || 0;
        expect(playCount).toBeGreaterThan(threshold);
      });
    });

    it("should filter by play_count with LESS_THAN modifier", async () => {
      const threshold = 100;
      const filter: PeekPerformerFilter = {
        play_count: { value: threshold, modifier: "LESS_THAN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        const playCount = performer.play_count || 0;
        expect(playCount).toBeLessThan(threshold);
      });
    });

    it("should filter by play_count with BETWEEN modifier", async () => {
      const min = 20;
      const max = 80;
      const filter: PeekPerformerFilter = {
        play_count: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        const playCount = performer.play_count || 0;
        expect(playCount).toBeGreaterThanOrEqual(min);
        expect(playCount).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Scene Count Filter", () => {
    it("should filter by scene_count with GREATER_THAN modifier", async () => {
      const threshold = 50;
      const filter: PeekPerformerFilter = {
        scene_count: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        const sceneCount = performer.scene_count || 0;
        expect(sceneCount).toBeGreaterThan(threshold);
      });
    });

    it("should filter by scene_count with LESS_THAN modifier", async () => {
      const threshold = 100;
      const filter: PeekPerformerFilter = {
        scene_count: { value: threshold, modifier: "LESS_THAN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        const sceneCount = performer.scene_count || 0;
        expect(sceneCount).toBeLessThan(threshold);
      });
    });

    it("should filter by scene_count with EQUALS modifier", async () => {
      const count = 75;
      const filter: PeekPerformerFilter = {
        scene_count: { value: count, modifier: "EQUALS" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.scene_count).toBe(count);
      });
    });

    it("should filter by scene_count with BETWEEN modifier", async () => {
      const min = 30;
      const max = 100;
      const filter: PeekPerformerFilter = {
        scene_count: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        const sceneCount = performer.scene_count || 0;
        expect(sceneCount).toBeGreaterThanOrEqual(min);
        expect(sceneCount).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Date Filters", () => {
    it("should filter by created_at with GREATER_THAN modifier", async () => {
      const threshold = new Date(Date.now() - 180 * 86400000); // 180 days ago
      const filter: PeekPerformerFilter = {
        created_at: {
          value: threshold.toISOString(),
          modifier: "GREATER_THAN",
        },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.created_at).toBeTruthy();
        const performerDate = new Date(performer.created_at!);
        expect(performerDate.getTime()).toBeGreaterThan(threshold.getTime());
      });
    });

    it("should filter by created_at with LESS_THAN modifier", async () => {
      const threshold = new Date(Date.now() - 30 * 86400000); // 30 days ago
      const filter: PeekPerformerFilter = {
        created_at: {
          value: threshold.toISOString(),
          modifier: "LESS_THAN",
        },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.created_at).toBeTruthy();
        const performerDate = new Date(performer.created_at!);
        expect(performerDate.getTime()).toBeLessThan(threshold.getTime());
      });
    });

    it("should filter by created_at with BETWEEN modifier", async () => {
      const min = new Date(Date.now() - 180 * 86400000);
      const max = new Date(Date.now() - 30 * 86400000);
      const filter: PeekPerformerFilter = {
        created_at: {
          value: min.toISOString(),
          value2: max.toISOString(),
          modifier: "BETWEEN",
        },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.created_at).toBeTruthy();
        const performerDate = new Date(performer.created_at!);
        expect(performerDate.getTime()).toBeGreaterThanOrEqual(min.getTime());
        expect(performerDate.getTime()).toBeLessThanOrEqual(max.getTime());
      });
    });

    it("should filter by updated_at with GREATER_THAN modifier", async () => {
      const threshold = new Date(Date.now() - 90 * 86400000); // 90 days ago
      const filter: PeekPerformerFilter = {
        updated_at: {
          value: threshold.toISOString(),
          modifier: "GREATER_THAN",
        },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.updated_at).toBeTruthy();
        const performerDate = new Date(performer.updated_at!);
        expect(performerDate.getTime()).toBeGreaterThan(threshold.getTime());
      });
    });

    it("should exclude performers with null created_at when filter is applied", async () => {
      const performerWithNull = createMockPerformer({
        id: "null_created",
        created_at: null,
      });
      const testPerformers = [...mockPerformers.slice(0, 5), performerWithNull];

      const threshold = new Date(Date.now() - 30 * 86400000);
      const filter: PeekPerformerFilter = {
        created_at: {
          value: threshold.toISOString(),
          modifier: "GREATER_THAN",
        },
      };

      const result = await applyPerformerFilters(testPerformers, filter);

      // Performer with null created_at should not be in results
      expect(result.find((p) => p.id === "null_created")).toBeUndefined();
    });
  });

  describe("Multiple Combined Filters", () => {
    it("should apply multiple filters together (AND logic)", async () => {
      const filter: PeekPerformerFilter = {
        favorite: true,
        rating100: { value: 60, modifier: "GREATER_THAN" },
        scene_count: { value: 50, modifier: "GREATER_THAN" },
      };

      const result = await applyPerformerFilters(mockPerformers, filter);

      result.forEach((performer) => {
        expect(performer.favorite).toBe(true);
        expect(performer.rating100 || 0).toBeGreaterThan(60);
        expect(performer.scene_count || 0).toBeGreaterThan(50);
      });
    });

    it("should combine gender and tags filters", async () => {
      const performer1 = createMockPerformer({
        id: "p1",
        gender: "FEMALE",
        tags: [mockTags[0], mockTags[1]],
      });
      const performer2 = createMockPerformer({
        id: "p2",
        gender: "FEMALE",
        tags: [mockTags[2]],
      });
      const performer3 = createMockPerformer({
        id: "p3",
        gender: "MALE",
        tags: [mockTags[0]],
      });
      const testPerformers = [performer1, performer2, performer3];

      const filter: PeekPerformerFilter = {
        gender: { value: "FEMALE", modifier: "EQUALS" },
        tags: { value: [mockTags[0].id], modifier: "INCLUDES" },
      };

      const result = await applyPerformerFilters(testPerformers, filter);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("p1");
    });
  });

  describe("Edge Cases", () => {
    it("should handle null/undefined filters", async () => {
      const result1 = await applyPerformerFilters(mockPerformers, null);
      const result2 = await applyPerformerFilters(mockPerformers, undefined);

      expect(result1).toHaveLength(mockPerformers.length);
      expect(result2).toHaveLength(mockPerformers.length);
    });

    it("should handle empty filter object", async () => {
      const result = await applyPerformerFilters(mockPerformers, {});

      expect(result).toHaveLength(mockPerformers.length);
    });

    it("should handle performers with null ratings correctly", async () => {
      const performersWithNullRatings = mockPerformers.filter((p) => !p.rating100);

      const filter: PeekPerformerFilter = {
        rating100: { value: 0, modifier: "GREATER_THAN" },
      };

      const result = await applyPerformerFilters(performersWithNullRatings, filter);

      // Performers with null ratings should be treated as 0
      expect(result.length).toBe(0);
    });

    it("should handle performers with zero scene_count correctly", async () => {
      const performerWithZeroScenes = createMockPerformer({
        id: "zero_scenes",
        scene_count: 0,
      });

      const filter: PeekPerformerFilter = {
        scene_count: { value: 0, modifier: "EQUALS" },
      };

      const result = await applyPerformerFilters([performerWithZeroScenes], filter);

      expect(result).toHaveLength(1);
      expect(result[0].scene_count).toBe(0);
    });
  });
});
