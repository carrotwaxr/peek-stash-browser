/**
 * Unit Tests for Tag Filtering Logic
 *
 * Tests the tag filters in controllers/library/tags.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { NormalizedTag, PeekTagFilter } from "../../types/index.js";
import { applyTagFilters } from "../../controllers/library/tags.js";
import { createMockTag, createMockTags } from "../helpers/mockDataGenerators.js";

describe("Tag Filters", () => {
  let mockTags: NormalizedTag[];

  beforeEach(() => {
    mockTags = createMockTags(50);
  });

  describe("ID Filter", () => {
    it("should filter tags by single ID", async () => {
      const filter: PeekTagFilter = {
        ids: [mockTags[0].id],
      };

      const result = await applyTagFilters(mockTags, filter);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe(mockTags[0].id);
    });

    it("should filter tags by multiple IDs", async () => {
      const targetIds = [mockTags[0].id, mockTags[5].id, mockTags[10].id];
      const filter: PeekTagFilter = {
        ids: targetIds,
      };

      const result = await applyTagFilters(mockTags, filter);

      expect(result.length).toBe(3);
      result.forEach((tag) => {
        expect(targetIds).toContain(tag.id);
      });
    });

    it("should return empty array when filtering by non-existent ID", async () => {
      const filter: PeekTagFilter = {
        ids: ["nonexistent-id"],
      };

      const result = await applyTagFilters(mockTags, filter);

      expect(result.length).toBe(0);
    });

    it("should return all tags when ids is empty array", async () => {
      const filter: PeekTagFilter = {
        ids: [],
      };

      const result = await applyTagFilters(mockTags, filter);

      expect(result.length).toBe(mockTags.length);
    });
  });

  describe("Favorite Filter", () => {
    it("should filter favorite tags when favorite=true", async () => {
      const filter: PeekTagFilter = {
        favorite: true,
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        expect(tag.favorite).toBe(true);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter non-favorite tags when favorite=false", async () => {
      const filter: PeekTagFilter = {
        favorite: false,
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        expect(tag.favorite).toBe(false);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should return all tags when favorite filter not specified", async () => {
      const result = await applyTagFilters(mockTags, {});

      expect(result.length).toBe(mockTags.length);
    });
  });

  describe("Rating Filter", () => {
    it("should filter by rating100 with GREATER_THAN modifier", async () => {
      const threshold = 50;
      const filter: PeekTagFilter = {
        rating100: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        const rating = tag.rating100 || 0;
        expect(rating).toBeGreaterThan(threshold);
      });
    });

    it("should filter by rating100 with EQUALS modifier", async () => {
      const rating = 80;
      const filter: PeekTagFilter = {
        rating100: { value: rating, modifier: "EQUALS" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        expect(tag.rating100).toBe(rating);
      });
    });

    it("should filter by rating100 with NOT_EQUALS modifier", async () => {
      const rating = 0;
      const filter: PeekTagFilter = {
        rating100: { value: rating, modifier: "NOT_EQUALS" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        expect(tag.rating100).not.toBe(rating);
      });
    });

    it("should filter by rating100 with BETWEEN modifier", async () => {
      const min = 20;
      const max = 80;
      const filter: PeekTagFilter = {
        rating100: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        const rating = tag.rating100 || 0;
        expect(rating).toBeGreaterThanOrEqual(min);
        expect(rating).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("O Counter Filter", () => {
    it("should filter by o_counter with GREATER_THAN modifier", async () => {
      const threshold = 5;
      const filter: PeekTagFilter = {
        o_counter: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        const oCounter = tag.o_counter || 0;
        expect(oCounter).toBeGreaterThan(threshold);
      });
    });

    it("should filter by o_counter with EQUALS modifier", async () => {
      const count = 10;
      const filter: PeekTagFilter = {
        o_counter: { value: count, modifier: "EQUALS" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        expect(tag.o_counter).toBe(count);
      });
    });

    it("should filter by o_counter with BETWEEN modifier", async () => {
      const min = 5;
      const max = 20;
      const filter: PeekTagFilter = {
        o_counter: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        const oCounter = tag.o_counter || 0;
        expect(oCounter).toBeGreaterThanOrEqual(min);
        expect(oCounter).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Play Count Filter", () => {
    it("should filter by play_count with GREATER_THAN modifier", async () => {
      const threshold = 10;
      const filter: PeekTagFilter = {
        play_count: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        const playCount = tag.play_count || 0;
        expect(playCount).toBeGreaterThan(threshold);
      });
    });

    it("should filter by play_count with LESS_THAN modifier", async () => {
      const threshold = 50;
      const filter: PeekTagFilter = {
        play_count: { value: threshold, modifier: "LESS_THAN" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        const playCount = tag.play_count || 0;
        expect(playCount).toBeLessThan(threshold);
      });
    });

    it("should filter by play_count with BETWEEN modifier", async () => {
      const min = 20;
      const max = 60;
      const filter: PeekTagFilter = {
        play_count: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        const playCount = tag.play_count || 0;
        expect(playCount).toBeGreaterThanOrEqual(min);
        expect(playCount).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Scene Count Filter", () => {
    it("should filter by scene_count with GREATER_THAN modifier", async () => {
      const threshold = 50;
      const filter: PeekTagFilter = {
        scene_count: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        const sceneCount = tag.scene_count || 0;
        expect(sceneCount).toBeGreaterThan(threshold);
      });
    });

    it("should filter by scene_count with LESS_THAN modifier", async () => {
      const threshold = 100;
      const filter: PeekTagFilter = {
        scene_count: { value: threshold, modifier: "LESS_THAN" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        const sceneCount = tag.scene_count || 0;
        expect(sceneCount).toBeLessThan(threshold);
      });
    });

    it("should filter by scene_count with BETWEEN modifier", async () => {
      const min = 30;
      const max = 150;
      const filter: PeekTagFilter = {
        scene_count: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        const sceneCount = tag.scene_count || 0;
        expect(sceneCount).toBeGreaterThanOrEqual(min);
        expect(sceneCount).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Text Search Filters", () => {
    it("should filter by name (case-insensitive)", async () => {
      const searchTerm = "Tag";
      const filter: PeekTagFilter = {
        name: {
          value: searchTerm,
          modifier: "INCLUDES",
        },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        expect(tag.name.toLowerCase()).toContain(searchTerm.toLowerCase());
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter by description (case-insensitive)", async () => {
      const mockTagWithDescription = createMockTag({
        id: "description-test",
        description: "This is a test tag with special description",
      });
      const tagsWithDescription = [...mockTags, mockTagWithDescription];

      const filter: PeekTagFilter = {
        description: {
          value: "special",
          modifier: "INCLUDES",
        },
      };

      const result = await applyTagFilters(tagsWithDescription, filter);

      result.forEach((tag) => {
        expect((tag.description || "").toLowerCase()).toContain("special");
      });

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("Date Filters", () => {
    it("should filter by created_at with GREATER_THAN modifier", async () => {
      const threshold = new Date(Date.now() - 60 * 86400000); // 60 days ago
      const filter: PeekTagFilter = {
        created_at: {
          value: threshold.toISOString(),
          modifier: "GREATER_THAN",
        },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        expect(tag.created_at).toBeTruthy();
        const tagDate = new Date(tag.created_at!);
        expect(tagDate.getTime()).toBeGreaterThan(threshold.getTime());
      });
    });

    it("should filter by created_at with BETWEEN modifier", async () => {
      const min = new Date(Date.now() - 90 * 86400000);
      const max = new Date(Date.now() - 30 * 86400000);
      const filter: PeekTagFilter = {
        created_at: {
          value: min.toISOString(),
          value2: max.toISOString(),
          modifier: "BETWEEN",
        },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        expect(tag.created_at).toBeTruthy();
        const tagDate = new Date(tag.created_at!);
        expect(tagDate.getTime()).toBeGreaterThanOrEqual(min.getTime());
        expect(tagDate.getTime()).toBeLessThanOrEqual(max.getTime());
      });
    });

    it("should filter by updated_at with LESS_THAN modifier", async () => {
      const threshold = new Date(Date.now() - 7 * 86400000); // 7 days ago
      const filter: PeekTagFilter = {
        updated_at: {
          value: threshold.toISOString(),
          modifier: "LESS_THAN",
        },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        expect(tag.updated_at).toBeTruthy();
        const tagDate = new Date(tag.updated_at!);
        expect(tagDate.getTime()).toBeLessThan(threshold.getTime());
      });
    });
  });

  describe("Multiple Combined Filters", () => {
    it("should apply multiple filters together (AND logic)", async () => {
      const filter: PeekTagFilter = {
        favorite: true,
        rating100: { value: 60, modifier: "GREATER_THAN" },
        scene_count: { value: 30, modifier: "GREATER_THAN" },
      };

      const result = await applyTagFilters(mockTags, filter);

      result.forEach((tag) => {
        expect(tag.favorite).toBe(true);
        expect(tag.rating100 || 0).toBeGreaterThan(60);
        expect(tag.scene_count || 0).toBeGreaterThan(30);
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle null filter gracefully", async () => {
      const result = await applyTagFilters(mockTags, null);

      expect(result.length).toBe(mockTags.length);
    });

    it("should handle undefined filter gracefully", async () => {
      const result = await applyTagFilters(mockTags, undefined);

      expect(result.length).toBe(mockTags.length);
    });

    it("should handle tags with missing created_at when filtering by date", async () => {
      const tagWithoutDate = createMockTag({
        id: "no-date",
        created_at: undefined,
      });
      const tagsWithMissing = [...mockTags, tagWithoutDate];

      const filter: PeekTagFilter = {
        created_at: {
          value: new Date(Date.now() - 30 * 86400000).toISOString(),
          modifier: "GREATER_THAN",
        },
      };

      const result = await applyTagFilters(tagsWithMissing, filter);

      // Tag without created_at should be excluded
      expect(result.every((t) => t.id !== "no-date")).toBe(true);
    });

    it("should handle tags without ratings correctly", async () => {
      const tagsWithNullRatings = mockTags.filter((t) => !t.rating100);

      const filter: PeekTagFilter = {
        rating100: { value: 0, modifier: "GREATER_THAN" },
      };

      const result = await applyTagFilters(tagsWithNullRatings, filter);

      // Tags with null ratings should be treated as 0
      expect(result.length).toBe(0);
    });
  });
});
