/**
 * Unit Tests for Tag Filter Configuration
 *
 * Tests that buildTagFilter correctly transforms UI filter values
 * into the GraphQL filter format expected by the backend
 */
import { describe, it, expect } from "vitest";
import { buildTagFilter } from "../../src/utils/filterConfig.js";

describe("buildTagFilter", () => {
  describe("Boolean Filters", () => {
    it("should build favorite filter when true", () => {
      const uiFilters = { favorite: true };
      const result = buildTagFilter(uiFilters);
      expect(result.favorite).toBe(true);
    });

    it("should build favorite filter when string 'TRUE'", () => {
      const uiFilters = { favorite: "TRUE" };
      const result = buildTagFilter(uiFilters);
      expect(result.favorite).toBe(true);
    });

    it("should not include favorite filter when false", () => {
      const uiFilters = { favorite: false };
      const result = buildTagFilter(uiFilters);
      expect(result.favorite).toBeUndefined();
    });
  });

  describe("Rating Filter", () => {
    it("should build rating filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        rating: { min: 60, max: 90 },
      };
      const result = buildTagFilter(uiFilters);
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
      const result = buildTagFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "GREATER_THAN",
        value: 69, // min - 1
      });
    });

    it("should build rating filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        rating: { max: 50 },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "LESS_THAN",
        value: 51, // max + 1
      });
    });

    it("should not include rating filter when min and max are empty strings", () => {
      const uiFilters = {
        rating: { min: "", max: "" },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.rating100).toEqual({});
    });
  });

  describe("Scene Count Filter", () => {
    it("should build scene_count filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        sceneCount: { min: 50, max: 200 },
      };
      const result = buildTagFilter(uiFilters);
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
      const result = buildTagFilter(uiFilters);
      expect(result.scene_count).toEqual({
        modifier: "GREATER_THAN",
        value: 99, // min - 1
      });
    });

    it("should build scene_count filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        sceneCount: { max: 75 },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.scene_count).toEqual({
        modifier: "LESS_THAN",
        value: 76, // max + 1
      });
    });
  });

  describe("User-Specific Range Filters (O Counter, Play Count)", () => {
    it("should build o_counter filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        oCounter: { min: 5, max: 20 },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.o_counter).toEqual({
        modifier: "BETWEEN",
        value: 5,
        value2: 20,
      });
    });

    it("should build o_counter filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        oCounter: { min: 10 },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.o_counter).toEqual({
        modifier: "GREATER_THAN",
        value: 9, // min - 1
      });
    });

    it("should build o_counter filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        oCounter: { max: 15 },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.o_counter).toEqual({
        modifier: "LESS_THAN",
        value: 16, // max + 1
      });
    });

    it("should build play_count filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        playCount: { min: 10, max: 50 },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.play_count).toEqual({
        modifier: "BETWEEN",
        value: 10,
        value2: 50,
      });
    });

    it("should build play_count filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        playCount: { min: 20 },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.play_count).toEqual({
        modifier: "GREATER_THAN",
        value: 19, // min - 1
      });
    });

    it("should build play_count filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        playCount: { max: 30 },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.play_count).toEqual({
        modifier: "LESS_THAN",
        value: 31, // max + 1
      });
    });

    it("should not include count filters when min and max are empty strings", () => {
      const uiFilters = {
        oCounter: { min: "", max: "" },
        playCount: { min: "", max: "" },
        sceneCount: { min: "", max: "" },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.o_counter).toEqual({});
      expect(result.play_count).toEqual({});
      expect(result.scene_count).toEqual({});
    });
  });

  describe("Date Range Filters", () => {
    it("should build created_at filter with GREATER_THAN modifier (start only)", () => {
      const uiFilters = {
        createdAt: { start: "2023-01-01" },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.created_at).toEqual({
        value: "2023-01-01",
        modifier: "GREATER_THAN",
      });
    });

    it("should build created_at filter with BETWEEN modifier (both start and end)", () => {
      const uiFilters = {
        createdAt: { start: "2023-01-01", end: "2023-12-31" },
      };
      const result = buildTagFilter(uiFilters);
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
      const result = buildTagFilter(uiFilters);
      expect(result.updated_at).toEqual({
        value: "2024-01-01",
        modifier: "GREATER_THAN",
      });
    });

    it("should build updated_at filter with BETWEEN modifier (both start and end)", () => {
      const uiFilters = {
        updatedAt: { start: "2024-01-01", end: "2024-12-31" },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.updated_at).toEqual({
        value: "2024-01-01",
        modifier: "BETWEEN",
        value2: "2024-12-31",
      });
    });
  });

  describe("Text Search Filters", () => {
    it("should build name filter with INCLUDES modifier", () => {
      const uiFilters = { name: "Outdoor" };
      const result = buildTagFilter(uiFilters);
      expect(result.name).toEqual({
        value: "Outdoor",
        modifier: "INCLUDES",
      });
    });

    it("should build description filter with INCLUDES modifier", () => {
      const uiFilters = { description: "beach scenes" };
      const result = buildTagFilter(uiFilters);
      expect(result.description).toEqual({
        value: "beach scenes",
        modifier: "INCLUDES",
      });
    });

    it("should not include text filters when undefined", () => {
      const uiFilters = {};
      const result = buildTagFilter(uiFilters);
      expect(result.name).toBeUndefined();
      expect(result.description).toBeUndefined();
    });
  });

  describe("Multiple Combined Filters", () => {
    it("should build multiple filters together", () => {
      const uiFilters = {
        favorite: true,
        rating: { min: 70, max: 100 },
        sceneCount: { min: 50 },
        oCounter: { min: 5, max: 20 },
        playCount: { min: 10 },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.favorite).toBe(true);
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 70,
        value2: 100,
      });
      expect(result.scene_count).toEqual({
        modifier: "GREATER_THAN",
        value: 49,
      });
      expect(result.o_counter).toEqual({
        modifier: "BETWEEN",
        value: 5,
        value2: 20,
      });
      expect(result.play_count).toEqual({
        modifier: "GREATER_THAN",
        value: 9,
      });
    });

    it("should build all filter types together", () => {
      const uiFilters = {
        favorite: true,
        rating: { min: 80 },
        sceneCount: { min: 100, max: 500 },
        oCounter: { min: 5, max: 20 },
        playCount: { min: 10 },
        name: "Outdoor",
        description: "beach",
        createdAt: { start: "2023-01-01", end: "2023-12-31" },
      };
      const result = buildTagFilter(uiFilters);

      expect(result.favorite).toBe(true);
      expect(result.rating100).toEqual({
        modifier: "GREATER_THAN",
        value: 79,
      });
      expect(result.scene_count).toEqual({
        modifier: "BETWEEN",
        value: 100,
        value2: 500,
      });
      expect(result.o_counter).toEqual({
        modifier: "BETWEEN",
        value: 5,
        value2: 20,
      });
      expect(result.play_count).toEqual({
        modifier: "GREATER_THAN",
        value: 9,
      });
      expect(result.name).toEqual({ value: "Outdoor", modifier: "INCLUDES" });
      expect(result.description).toEqual({ value: "beach", modifier: "INCLUDES" });
      expect(result.created_at).toEqual({
        value: "2023-01-01",
        modifier: "BETWEEN",
        value2: "2023-12-31",
      });
    });
  });

  describe("Edge Cases", () => {
    it("should return empty object when no filters provided", () => {
      const result = buildTagFilter({});
      expect(result).toEqual({});
    });

    it("should handle null values gracefully", () => {
      const uiFilters = {
        favorite: null,
      };
      const result = buildTagFilter(uiFilters);
      expect(result.favorite).toBeUndefined();
    });

    it("should handle undefined nested properties", () => {
      const uiFilters = {
        rating: {},
        sceneCount: {},
        oCounter: {},
      };
      const result = buildTagFilter(uiFilters);
      expect(result.rating100).toBeUndefined();
      expect(result.scene_count).toBeUndefined();
      expect(result.o_counter).toBeUndefined();
    });

    it("should handle 0 as a valid min value for numeric filters", () => {
      const uiFilters = {
        rating: { min: 0, max: 50 },
        oCounter: { min: 0 },
      };
      const result = buildTagFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 0,
        value2: 50,
      });
      expect(result.o_counter).toEqual({
        modifier: "GREATER_THAN",
        value: -1, // 0 - 1
      });
    });
  });
});
