/**
 * Unit Tests for Studio Filtering Logic
 *
 * Tests the studio filters in controllers/library/studios.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { NormalizedStudio, PeekStudioFilter } from "../../types/index.js";
import { applyStudioFilters } from "../../controllers/library/studios.js";
import {
  createMockStudio,
  createMockStudios,
  createMockTags,
} from "../helpers/mockDataGenerators.js";

describe("Studio Filters", () => {
  let mockTags: ReturnType<typeof createMockTags>;
  let mockStudios: NormalizedStudio[];

  beforeEach(() => {
    mockTags = createMockTags(15);
    mockStudios = createMockStudios(50);
  });

  describe("ID Filter", () => {
    it("should filter studios by single ID", () => {
      const filter: PeekStudioFilter = {
        ids: { value: [mockStudios[0].id], modifier: "INCLUDES" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe(mockStudios[0].id);
    });

    it("should filter studios by multiple IDs", () => {
      const targetIds = [mockStudios[0].id, mockStudios[5].id, mockStudios[10].id];
      const filter: PeekStudioFilter = {
        ids: { value: targetIds, modifier: "INCLUDES" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      expect(result.length).toBe(3);
      result.forEach((studio) => {
        expect(targetIds).toContain(studio.id);
      });
    });

    it("should return empty array when filtering by non-existent ID", () => {
      const filter: PeekStudioFilter = {
        ids: { value: ["nonexistent-id"], modifier: "INCLUDES" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      expect(result.length).toBe(0);
    });

    it("should return all studios when ids is empty array", () => {
      const filter: PeekStudioFilter = {
        ids: { value: [], modifier: "INCLUDES" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      expect(result.length).toBe(mockStudios.length);
    });
  });

  describe("Favorite Filter", () => {
    it("should filter favorite studios when favorite=true", () => {
      const filter: PeekStudioFilter = {
        favorite: true,
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        expect(studio.favorite).toBe(true);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter non-favorite studios when favorite=false", () => {
      const filter: PeekStudioFilter = {
        favorite: false,
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        expect(studio.favorite).toBe(false);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should return all studios when favorite filter not specified", () => {
      const result = applyStudioFilters(mockStudios, {});

      expect(result.length).toBe(mockStudios.length);
    });
  });

  describe("Tags Filter", () => {
    it("should filter studios by tags with INCLUDES modifier", () => {
      const tagId = mockTags[0].id;
      const filter: PeekStudioFilter = {
        tags: {
          value: [tagId],
          modifier: "INCLUDES",
        },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const studioTagIds = (studio.tags || []).map((t) => t.id);
        expect(studioTagIds).toContain(tagId);
      });
    });

    it("should filter studios by tags with INCLUDES_ALL modifier", () => {
      const tagIds = [mockTags[0].id, mockTags[1].id];
      const filter: PeekStudioFilter = {
        tags: {
          value: tagIds,
          modifier: "INCLUDES_ALL",
        },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const studioTagIds = (studio.tags || []).map((t) => t.id);
        tagIds.forEach((tagId) => {
          expect(studioTagIds).toContain(tagId);
        });
      });
    });

    it("should filter studios by tags with EXCLUDES modifier", () => {
      const tagId = mockTags[0].id;
      const filter: PeekStudioFilter = {
        tags: {
          value: [tagId],
          modifier: "EXCLUDES",
        },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const studioTagIds = (studio.tags || []).map((t) => t.id);
        expect(studioTagIds).not.toContain(tagId);
      });
    });

    it("should return all studios when tags array is empty", () => {
      const filter: PeekStudioFilter = {
        tags: {
          value: [],
          modifier: "INCLUDES",
        },
      };

      const result = applyStudioFilters(mockStudios, filter);

      expect(result.length).toBe(mockStudios.length);
    });
  });

  describe("Rating Filter", () => {
    it("should filter by rating100 with GREATER_THAN modifier", () => {
      const threshold = 50;
      const filter: PeekStudioFilter = {
        rating100: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const rating = studio.rating100 || 0;
        expect(rating).toBeGreaterThan(threshold);
      });
    });

    it("should filter by rating100 with EQUALS modifier", () => {
      const rating = 80;
      const filter: PeekStudioFilter = {
        rating100: { value: rating, modifier: "EQUALS" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        expect(studio.rating100).toBe(rating);
      });
    });

    it("should filter by rating100 with NOT_EQUALS modifier", () => {
      const rating = 0;
      const filter: PeekStudioFilter = {
        rating100: { value: rating, modifier: "NOT_EQUALS" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        expect(studio.rating100).not.toBe(rating);
      });
    });

    it("should filter by rating100 with BETWEEN modifier", () => {
      const min = 20;
      const max = 80;
      const filter: PeekStudioFilter = {
        rating100: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const rating = studio.rating100 || 0;
        expect(rating).toBeGreaterThanOrEqual(min);
        expect(rating).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("O Counter Filter", () => {
    it("should filter by o_counter with GREATER_THAN modifier", () => {
      const threshold = 5;
      const filter: PeekStudioFilter = {
        o_counter: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const oCounter = studio.o_counter || 0;
        expect(oCounter).toBeGreaterThan(threshold);
      });
    });

    it("should filter by o_counter with EQUALS modifier", () => {
      const count = 10;
      const filter: PeekStudioFilter = {
        o_counter: { value: count, modifier: "EQUALS" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        expect(studio.o_counter).toBe(count);
      });
    });

    it("should filter by o_counter with BETWEEN modifier", () => {
      const min = 5;
      const max = 20;
      const filter: PeekStudioFilter = {
        o_counter: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const oCounter = studio.o_counter || 0;
        expect(oCounter).toBeGreaterThanOrEqual(min);
        expect(oCounter).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Play Count Filter", () => {
    it("should filter by play_count with GREATER_THAN modifier", () => {
      const threshold = 10;
      const filter: PeekStudioFilter = {
        play_count: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const playCount = studio.play_count || 0;
        expect(playCount).toBeGreaterThan(threshold);
      });
    });

    it("should filter by play_count with LESS_THAN modifier", () => {
      const threshold = 50;
      const filter: PeekStudioFilter = {
        play_count: { value: threshold, modifier: "LESS_THAN" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const playCount = studio.play_count || 0;
        expect(playCount).toBeLessThan(threshold);
      });
    });

    it("should filter by play_count with BETWEEN modifier", () => {
      const min = 20;
      const max = 60;
      const filter: PeekStudioFilter = {
        play_count: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const playCount = studio.play_count || 0;
        expect(playCount).toBeGreaterThanOrEqual(min);
        expect(playCount).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Scene Count Filter", () => {
    it("should filter by scene_count with GREATER_THAN modifier", () => {
      const threshold = 50;
      const filter: PeekStudioFilter = {
        scene_count: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const sceneCount = studio.scene_count || 0;
        expect(sceneCount).toBeGreaterThan(threshold);
      });
    });

    it("should filter by scene_count with LESS_THAN modifier", () => {
      const threshold = 100;
      const filter: PeekStudioFilter = {
        scene_count: { value: threshold, modifier: "LESS_THAN" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const sceneCount = studio.scene_count || 0;
        expect(sceneCount).toBeLessThan(threshold);
      });
    });

    it("should filter by scene_count with BETWEEN modifier", () => {
      const min = 30;
      const max = 150;
      const filter: PeekStudioFilter = {
        scene_count: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        const sceneCount = studio.scene_count || 0;
        expect(sceneCount).toBeGreaterThanOrEqual(min);
        expect(sceneCount).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Text Search Filters", () => {
    it("should filter by name (case-insensitive)", () => {
      const searchTerm = "Studio";
      const filter: PeekStudioFilter = {
        name: {
          value: searchTerm,
          modifier: "INCLUDES",
        },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        expect(studio.name.toLowerCase()).toContain(searchTerm.toLowerCase());
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter by details (case-insensitive)", () => {
      const mockStudioWithDetails = createMockStudio({
        id: "details-test",
        details: "This is a test studio with special details",
      });
      const studiosWithDetails = [...mockStudios, mockStudioWithDetails];

      const filter: PeekStudioFilter = {
        details: {
          value: "special",
          modifier: "INCLUDES",
        },
      };

      const result = applyStudioFilters(studiosWithDetails, filter);

      result.forEach((studio) => {
        expect((studio.details || "").toLowerCase()).toContain("special");
      });

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("Date Filters", () => {
    it("should filter by created_at with GREATER_THAN modifier", () => {
      const threshold = new Date(Date.now() - 60 * 86400000); // 60 days ago
      const filter: PeekStudioFilter = {
        created_at: {
          value: threshold.toISOString(),
          modifier: "GREATER_THAN",
        },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        expect(studio.created_at).toBeTruthy();
        const studioDate = new Date(studio.created_at!);
        expect(studioDate.getTime()).toBeGreaterThan(threshold.getTime());
      });
    });

    it("should filter by created_at with BETWEEN modifier", () => {
      const min = new Date(Date.now() - 90 * 86400000);
      const max = new Date(Date.now() - 30 * 86400000);
      const filter: PeekStudioFilter = {
        created_at: {
          value: min.toISOString(),
          value2: max.toISOString(),
          modifier: "BETWEEN",
        },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        expect(studio.created_at).toBeTruthy();
        const studioDate = new Date(studio.created_at!);
        expect(studioDate.getTime()).toBeGreaterThanOrEqual(min.getTime());
        expect(studioDate.getTime()).toBeLessThanOrEqual(max.getTime());
      });
    });

    it("should filter by updated_at with LESS_THAN modifier", () => {
      const threshold = new Date(Date.now() - 7 * 86400000); // 7 days ago
      const filter: PeekStudioFilter = {
        updated_at: {
          value: threshold.toISOString(),
          modifier: "LESS_THAN",
        },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        expect(studio.updated_at).toBeTruthy();
        const studioDate = new Date(studio.updated_at!);
        expect(studioDate.getTime()).toBeLessThan(threshold.getTime());
      });
    });
  });

  describe("Multiple Combined Filters", () => {
    it("should apply multiple filters together (AND logic)", () => {
      const filter: PeekStudioFilter = {
        favorite: true,
        rating100: { value: 60, modifier: "GREATER_THAN" },
        scene_count: { value: 30, modifier: "GREATER_THAN" },
      };

      const result = applyStudioFilters(mockStudios, filter);

      result.forEach((studio) => {
        expect(studio.favorite).toBe(true);
        expect(studio.rating100 || 0).toBeGreaterThan(60);
        expect(studio.scene_count || 0).toBeGreaterThan(30);
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle null filter gracefully", () => {
      const result = applyStudioFilters(mockStudios, null);

      expect(result.length).toBe(mockStudios.length);
    });

    it("should handle undefined filter gracefully", () => {
      const result = applyStudioFilters(mockStudios, undefined);

      expect(result.length).toBe(mockStudios.length);
    });

    it("should handle studios with missing created_at when filtering by date", () => {
      const studioWithoutDate = createMockStudio({
        id: "no-date",
        created_at: undefined,
      });
      const studiosWithMissing = [...mockStudios, studioWithoutDate];

      const filter: PeekStudioFilter = {
        created_at: {
          value: new Date(Date.now() - 30 * 86400000).toISOString(),
          modifier: "GREATER_THAN",
        },
      };

      const result = applyStudioFilters(studiosWithMissing, filter);

      // Studio without created_at should be excluded
      expect(result.every((s) => s.id !== "no-date")).toBe(true);
    });

    it("should handle studios without ratings correctly", () => {
      const studiosWithNullRatings = mockStudios.filter((s) => !s.rating100);

      const filter: PeekStudioFilter = {
        rating100: { value: 0, modifier: "GREATER_THAN" },
      };

      const result = applyStudioFilters(studiosWithNullRatings, filter);

      // Studios with null ratings should be treated as 0
      expect(result.length).toBe(0);
    });
  });
});
