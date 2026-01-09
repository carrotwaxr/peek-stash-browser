/**
 * Unit Tests for Group Filter Configuration
 *
 * Tests that buildGroupFilter correctly transforms UI filter values
 * into the GraphQL filter format expected by the backend
 */
import { describe, it, expect } from "vitest";
import { buildGroupFilter } from "../../src/utils/filterConfig.js";

describe("buildGroupFilter", () => {
  describe("Boolean Filters", () => {
    it("should build favorite filter when true", () => {
      const uiFilters = { favorite: true };
      const result = buildGroupFilter(uiFilters);
      expect(result.favorite).toBe(true);
    });

    it("should build favorite filter when string 'TRUE'", () => {
      const uiFilters = { favorite: "TRUE" };
      const result = buildGroupFilter(uiFilters);
      expect(result.favorite).toBe(true);
    });

    it("should not include favorite filter when false", () => {
      const uiFilters = { favorite: false };
      const result = buildGroupFilter(uiFilters);
      expect(result.favorite).toBeUndefined();
    });
  });

  describe("Tags Filter", () => {
    it("should build tags filter with INCLUDES_ALL modifier (default)", () => {
      const uiFilters = {
        tagIds: ["1", "2"],
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES_ALL",
      });
    });

    it("should build tags filter with INCLUDES modifier", () => {
      const uiFilters = {
        tagIds: ["1", "2"],
        tagIdsModifier: "INCLUDES",
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES",
      });
    });

    it("should build tags filter with EXCLUDES modifier", () => {
      const uiFilters = {
        tagIds: ["1", "2"],
        tagIdsModifier: "EXCLUDES",
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "EXCLUDES",
      });
    });

    it("should convert numeric tag IDs to strings", () => {
      const uiFilters = {
        tagIds: [1, 2, 3],
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.tags).toEqual({
        value: ["1", "2", "3"],
        modifier: "INCLUDES_ALL",
      });
    });

    it("should not include tags filter when array is empty", () => {
      const uiFilters = { tagIds: [] };
      const result = buildGroupFilter(uiFilters);
      expect(result.tags).toBeUndefined();
    });
  });

  describe("Rating Filter", () => {
    it("should build rating filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        rating: { min: 60, max: 90 },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 60,
        value2: 90,
      });
    });

    it("should build rating filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        rating: { min: 70 },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "GREATER_THAN",
        value: 69, // min - 1
      });
    });

    it("should build rating filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        rating: { max: 50 },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "LESS_THAN",
        value: 51, // max + 1
      });
    });

    it("should not include rating filter when min and max are empty strings", () => {
      const uiFilters = {
        rating: { min: "", max: "" },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.rating100).toEqual({});
    });
  });

  describe("Scene Count Filter", () => {
    it("should build scene_count filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        sceneCount: { min: 50, max: 200 },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.scene_count).toEqual({
        modifier: "BETWEEN",
        value: 50,
        value2: 200,
      });
    });

    it("should build scene_count filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        sceneCount: { min: 100 },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.scene_count).toEqual({
        modifier: "GREATER_THAN",
        value: 99, // min - 1
      });
    });

    it("should build scene_count filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        sceneCount: { max: 75 },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.scene_count).toEqual({
        modifier: "LESS_THAN",
        value: 76, // max + 1
      });
    });
  });

  describe("Duration Filter", () => {
    it("should build duration filter with BETWEEN modifier (both min and max in minutes)", () => {
      const uiFilters = {
        duration: { min: 30, max: 90 }, // Minutes
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.duration).toEqual({
        modifier: "BETWEEN",
        value: 1800, // 30 * 60
        value2: 5400, // 90 * 60
      });
    });

    it("should build duration filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        duration: { min: 45 }, // Minutes
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.duration).toEqual({
        modifier: "GREATER_THAN",
        value: 2699, // 45 * 60 - 1
      });
    });

    it("should build duration filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        duration: { max: 60 }, // Minutes
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.duration).toEqual({
        modifier: "LESS_THAN",
        value: 3601, // 60 * 60 + 1
      });
    });
  });

  describe("Date Range Filters", () => {
    it("should build date filter with GREATER_THAN modifier (start only)", () => {
      const uiFilters = {
        date: { start: "2023-01-01" },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.date).toEqual({
        value: "2023-01-01",
        modifier: "GREATER_THAN",
      });
    });

    it("should build date filter with BETWEEN modifier (both start and end)", () => {
      const uiFilters = {
        date: { start: "2023-01-01", end: "2023-12-31" },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.date).toEqual({
        value: "2023-01-01",
        modifier: "BETWEEN",
        value2: "2023-12-31",
      });
    });

    it("should build created_at filter with GREATER_THAN modifier (start only)", () => {
      const uiFilters = {
        createdAt: { start: "2023-01-01" },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.created_at).toEqual({
        value: "2023-01-01",
        modifier: "GREATER_THAN",
      });
    });

    it("should build created_at filter with BETWEEN modifier (both start and end)", () => {
      const uiFilters = {
        createdAt: { start: "2023-01-01", end: "2023-12-31" },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.created_at).toEqual({
        value: "2023-01-01",
        modifier: "BETWEEN",
        value2: "2023-12-31",
      });
    });

    it("should build updated_at filter with GREATER_THAN modifier (start only)", () => {
      const uiFilters = {
        updatedAt: { start: "2024-01-01" },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.updated_at).toEqual({
        value: "2024-01-01",
        modifier: "GREATER_THAN",
      });
    });

    it("should build updated_at filter with BETWEEN modifier (both start and end)", () => {
      const uiFilters = {
        updatedAt: { start: "2024-01-01", end: "2024-12-31" },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.updated_at).toEqual({
        value: "2024-01-01",
        modifier: "BETWEEN",
        value2: "2024-12-31",
      });
    });
  });

  describe("Text Search Filters", () => {
    it("should build name filter with INCLUDES modifier", () => {
      const uiFilters = { name: "My Group" };
      const result = buildGroupFilter(uiFilters);
      expect(result.name).toEqual({
        value: "My Group",
        modifier: "INCLUDES",
      });
    });

    it("should build synopsis filter with INCLUDES modifier", () => {
      const uiFilters = { synopsis: "beach vacation" };
      const result = buildGroupFilter(uiFilters);
      expect(result.synopsis).toEqual({
        value: "beach vacation",
        modifier: "INCLUDES",
      });
    });

    it("should build director filter with INCLUDES modifier", () => {
      const uiFilters = { director: "John Doe" };
      const result = buildGroupFilter(uiFilters);
      expect(result.director).toEqual({
        value: "John Doe",
        modifier: "INCLUDES",
      });
    });

    it("should not include text filters when undefined", () => {
      const uiFilters = {};
      const result = buildGroupFilter(uiFilters);
      expect(result.name).toBeUndefined();
      expect(result.synopsis).toBeUndefined();
      expect(result.director).toBeUndefined();
    });
  });

  describe("Multiple Combined Filters", () => {
    it("should build multiple filters together", () => {
      const uiFilters = {
        favorite: true,
        tagIds: ["1", "2"],
        tagIdsModifier: "INCLUDES",
        rating: { min: 70, max: 100 },
        sceneCount: { min: 50 },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.favorite).toBe(true);
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES",
      });
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 70,
        value2: 100,
      });
      expect(result.scene_count).toEqual({
        modifier: "GREATER_THAN",
        value: 49,
      });
    });

    it("should build all filter types together", () => {
      const uiFilters = {
        favorite: true,
        tagIds: ["1", "2"],
        rating: { min: 80 },
        sceneCount: { min: 100, max: 500 },
        duration: { min: 30, max: 120 },
        name: "Summer",
        synopsis: "beach",
        director: "John",
        date: { start: "2023-01-01", end: "2023-12-31" },
        createdAt: { start: "2023-01-01", end: "2023-12-31" },
      };
      const result = buildGroupFilter(uiFilters);

      expect(result.favorite).toBe(true);
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES_ALL",
      });
      expect(result.rating100).toEqual({
        modifier: "GREATER_THAN",
        value: 79,
      });
      expect(result.scene_count).toEqual({
        modifier: "BETWEEN",
        value: 100,
        value2: 500,
      });
      expect(result.duration).toEqual({
        modifier: "BETWEEN",
        value: 1800, // 30 * 60
        value2: 7200, // 120 * 60
      });
      expect(result.name).toEqual({ value: "Summer", modifier: "INCLUDES" });
      expect(result.synopsis).toEqual({ value: "beach", modifier: "INCLUDES" });
      expect(result.director).toEqual({ value: "John", modifier: "INCLUDES" });
      expect(result.date).toEqual({
        value: "2023-01-01",
        modifier: "BETWEEN",
        value2: "2023-12-31",
      });
      expect(result.created_at).toEqual({
        value: "2023-01-01",
        modifier: "BETWEEN",
        value2: "2023-12-31",
      });
    });
  });

  describe("Edge Cases", () => {
    it("should return empty object when no filters provided", () => {
      const result = buildGroupFilter({});
      expect(result).toEqual({});
    });

    it("should handle null values gracefully", () => {
      const uiFilters = {
        favorite: null,
        tagIds: null,
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.favorite).toBeUndefined();
      expect(result.tags).toBeUndefined();
    });

    it("should handle undefined nested properties", () => {
      const uiFilters = {
        rating: {},
        sceneCount: {},
        duration: {},
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.rating100).toBeUndefined();
      expect(result.scene_count).toBeUndefined();
      expect(result.duration).toBeUndefined();
    });

    it("should handle 0 as a valid min value for numeric filters", () => {
      const uiFilters = {
        rating: { min: 0, max: 50 },
        duration: { min: 0 },
      };
      const result = buildGroupFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 0,
        value2: 50,
      });
      expect(result.duration).toEqual({
        modifier: "GREATER_THAN",
        value: -1, // 0 * 60 - 1
      });
    });
  });
});
