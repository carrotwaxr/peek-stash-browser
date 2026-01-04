/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Unit Tests for Group Filtering Logic
 *
 * Tests the group filters in controllers/library/groups.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { NormalizedGroup, PeekGroupFilter } from "../../types/index.js";
import { applyGroupFilters } from "../../controllers/library/groups.js";
import {
  createMockGroup,
  createMockGroups,
  createMockTags,
} from "../helpers/mockDataGenerators.js";

describe("Group Filters", () => {
  let mockTags: ReturnType<typeof createMockTags>;
  let mockGroups: NormalizedGroup[];

  beforeEach(() => {
    mockTags = createMockTags(15);
    mockGroups = createMockGroups(50);
  });

  describe("ID Filter", () => {
    it("should filter groups by single ID", async () => {
      const filter: PeekGroupFilter = {
        ids: { value: [mockGroups[0].id], modifier: "INCLUDES" },
      };

      const result = await applyGroupFilters(mockGroups, filter);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe(mockGroups[0].id);
    });

    it("should filter groups by multiple IDs", async () => {
      const targetIds = [mockGroups[0].id, mockGroups[5].id, mockGroups[10].id];
      const filter: PeekGroupFilter = {
        ids: { value: targetIds, modifier: "INCLUDES" },
      };

      const result = await applyGroupFilters(mockGroups, filter);

      expect(result.length).toBe(3);
      result.forEach((group) => {
        expect(targetIds).toContain(group.id);
      });
    });

    it("should return empty array when filtering by non-existent ID", async () => {
      const filter: PeekGroupFilter = {
        ids: { value: ["nonexistent-id"], modifier: "INCLUDES" },
      };

      const result = await applyGroupFilters(mockGroups, filter);

      expect(result.length).toBe(0);
    });

    it("should return all groups when ids is empty array", async () => {
      const filter: PeekGroupFilter = {
        ids: { value: [], modifier: "INCLUDES" },
      };

      const result = await applyGroupFilters(mockGroups, filter);

      expect(result.length).toBe(mockGroups.length);
    });
  });

  describe("Favorite Filter", () => {
    it("should filter favorite groups when favorite=true", async () => {
      const filter: PeekGroupFilter = {
        favorite: true,
      };

      const result = await applyGroupFilters(mockGroups, filter);

      result.forEach((group) => {
        expect(group.favorite).toBe(true);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter non-favorite groups when favorite=false", async () => {
      const filter: PeekGroupFilter = {
        favorite: false,
      };

      const result = await applyGroupFilters(mockGroups, filter);

      result.forEach((group) => {
        expect(group.favorite).toBe(false);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should return all groups when favorite filter not specified", async () => {
      const result = await applyGroupFilters(mockGroups, {});

      expect(result.length).toBe(mockGroups.length);
    });
  });

  describe("Tags Filter", () => {
    it("should filter groups by tags with INCLUDES modifier", async () => {
      const tagId = mockTags[0].id;
      const filter: PeekGroupFilter = {
        tags: {
          value: [tagId],
          modifier: "INCLUDES",
        },
      };

      // Add tags to some groups
      const groupsWithTags = mockGroups.map((g, i) => ({
        ...g,
        tags: i % 3 === 0 ? [mockTags[0]] : [],
      }));

      const result = await applyGroupFilters(groupsWithTags, filter);

      result.forEach((group) => {
        const groupTagIds = (group.tags || []).map((t) => t.id);
        expect(groupTagIds).toContain(tagId);
      });
    });

    it("should filter groups by tags with INCLUDES_ALL modifier", async () => {
      const tagIds = [mockTags[0].id, mockTags[1].id];
      const filter: PeekGroupFilter = {
        tags: {
          value: tagIds,
          modifier: "INCLUDES_ALL",
        },
      };

      // Add both tags to some groups
      const groupsWithTags = mockGroups.map((g, i) => ({
        ...g,
        tags: i % 5 === 0 ? [mockTags[0], mockTags[1]] : i % 3 === 0 ? [mockTags[0]] : [],
      }));

      const result = await applyGroupFilters(groupsWithTags, filter);

      result.forEach((group) => {
        const groupTagIds = (group.tags || []).map((t) => t.id);
        tagIds.forEach((tagId) => {
          expect(groupTagIds).toContain(tagId);
        });
      });
    });

    it("should filter groups by tags with EXCLUDES modifier", async () => {
      const tagId = mockTags[0].id;
      const filter: PeekGroupFilter = {
        tags: {
          value: [tagId],
          modifier: "EXCLUDES",
        },
      };

      // Add tags to some groups
      const groupsWithTags = mockGroups.map((g, i) => ({
        ...g,
        tags: i % 3 === 0 ? [mockTags[0]] : [],
      }));

      const result = await applyGroupFilters(groupsWithTags, filter);

      result.forEach((group) => {
        const groupTagIds = (group.tags || []).map((t) => t.id);
        expect(groupTagIds).not.toContain(tagId);
      });
    });

    it("should return all groups when tags array is empty", async () => {
      const filter: PeekGroupFilter = {
        tags: {
          value: [],
          modifier: "INCLUDES",
        },
      };

      const result = await applyGroupFilters(mockGroups, filter);

      expect(result.length).toBe(mockGroups.length);
    });
  });

  describe("Rating Filter", () => {
    it("should filter by rating100 with GREATER_THAN modifier", async () => {
      const threshold = 50;
      const filter: PeekGroupFilter = {
        rating100: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = await applyGroupFilters(mockGroups, filter);

      result.forEach((group) => {
        const rating = group.rating100 || 0;
        expect(rating).toBeGreaterThan(threshold);
      });
    });

    it("should filter by rating100 with EQUALS modifier", async () => {
      const rating = 80;
      const filter: PeekGroupFilter = {
        rating100: { value: rating, modifier: "EQUALS" },
      };

      const result = await applyGroupFilters(mockGroups, filter);

      result.forEach((group) => {
        expect(group.rating100).toBe(rating);
      });
    });

    it("should filter by rating100 with NOT_EQUALS modifier", async () => {
      const rating = 0;
      const filter: PeekGroupFilter = {
        rating100: { value: rating, modifier: "NOT_EQUALS" },
      };

      const result = await applyGroupFilters(mockGroups, filter);

      result.forEach((group) => {
        expect(group.rating100).not.toBe(rating);
      });
    });

    it("should filter by rating100 with BETWEEN modifier", async () => {
      const min = 20;
      const max = 80;
      const filter: PeekGroupFilter = {
        rating100: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = await applyGroupFilters(mockGroups, filter);

      result.forEach((group) => {
        const rating = group.rating100 || 0;
        expect(rating).toBeGreaterThanOrEqual(min);
        expect(rating).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Multiple Combined Filters", () => {
    it("should apply multiple filters together (AND logic)", async () => {
      const filter: PeekGroupFilter = {
        favorite: true,
        rating100: { value: 60, modifier: "GREATER_THAN" },
      };

      const result = await applyGroupFilters(mockGroups, filter);

      result.forEach((group) => {
        expect(group.favorite).toBe(true);
        expect(group.rating100 || 0).toBeGreaterThan(60);
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle null filter gracefully", async () => {
      const result = await applyGroupFilters(mockGroups, null);

      expect(result.length).toBe(mockGroups.length);
    });

    it("should handle undefined filter gracefully", async () => {
      const result = await applyGroupFilters(mockGroups, undefined);

      expect(result.length).toBe(mockGroups.length);
    });

    it("should handle groups without ratings correctly", async () => {
      const groupsWithNullRatings = mockGroups.filter((g) => !g.rating100);

      const filter: PeekGroupFilter = {
        rating100: { value: 0, modifier: "GREATER_THAN" },
      };

      const result = await applyGroupFilters(groupsWithNullRatings, filter);

      // Groups with null ratings should be treated as 0
      expect(result.length).toBe(0);
    });

    it("should handle groups without tags correctly", async () => {
      const groupsWithoutTags = mockGroups.map((g) => ({ ...g, tags: [] }));

      const filter: PeekGroupFilter = {
        tags: {
          value: [mockTags[0].id],
          modifier: "INCLUDES",
        },
      };

      const result = await applyGroupFilters(groupsWithoutTags, filter);

      expect(result.length).toBe(0);
    });
  });
});
