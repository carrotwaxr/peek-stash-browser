/**
 * Unit Tests for Gallery Filter Configuration
 *
 * Tests that buildGalleryFilter correctly transforms UI filter values
 * into the GraphQL filter format expected by the backend
 */
import { describe, it, expect } from "vitest";
import { buildGalleryFilter } from "../../src/utils/filterConfig.js";

describe("buildGalleryFilter", () => {
  describe("Boolean Filters", () => {
    it("should build favorite filter when true", () => {
      const uiFilters = { favorite: true };
      const result = buildGalleryFilter(uiFilters);
      expect(result.favorite).toBe(true);
    });

    it("should build favorite filter when string 'TRUE'", () => {
      const uiFilters = { favorite: "TRUE" };
      const result = buildGalleryFilter(uiFilters);
      expect(result.favorite).toBe(true);
    });

    it("should not include favorite filter when false", () => {
      const uiFilters = { favorite: false };
      const result = buildGalleryFilter(uiFilters);
      expect(result.favorite).toBeUndefined();
    });
  });

  describe("Rating Filter", () => {
    it("should build rating filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        rating: { min: 60, max: 90 },
      };
      const result = buildGalleryFilter(uiFilters);
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
      const result = buildGalleryFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "GREATER_THAN",
        value: 69, // min - 1
      });
    });

    it("should build rating filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        rating: { max: 50 },
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "LESS_THAN",
        value: 51, // max + 1
      });
    });

    it("should not include rating filter when min and max are empty strings", () => {
      const uiFilters = {
        rating: { min: "", max: "" },
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.rating100).toEqual({});
    });
  });

  describe("Image Count Filter", () => {
    it("should build image_count filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        imageCount: { min: 50, max: 200 },
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.image_count).toEqual({
        modifier: "BETWEEN",
        value: 50,
        value2: 200,
      });
    });

    it("should build image_count filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        imageCount: { min: 100 },
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.image_count).toEqual({
        modifier: "GREATER_THAN",
        value: 99, // min - 1
      });
    });

    it("should build image_count filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        imageCount: { max: 75 },
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.image_count).toEqual({
        modifier: "LESS_THAN",
        value: 76, // max + 1
      });
    });
  });

  describe("Text Search Filter", () => {
    it("should build title filter with INCLUDES modifier", () => {
      const uiFilters = { title: "Beach Gallery" };
      const result = buildGalleryFilter(uiFilters);
      expect(result.title).toEqual({
        value: "Beach Gallery",
        modifier: "INCLUDES",
      });
    });

    it("should not include title filter when undefined", () => {
      const uiFilters = {};
      const result = buildGalleryFilter(uiFilters);
      expect(result.title).toBeUndefined();
    });
  });

  describe("Studio Filter", () => {
    it("should build studios filter with INCLUDES modifier (default)", () => {
      const uiFilters = {
        studioIds: ["1", "2"],
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.studios).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES",
      });
    });

    it("should build studios filter with custom modifier", () => {
      const uiFilters = {
        studioIds: ["1", "2"],
        studioIdsModifier: "EXCLUDES",
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.studios).toEqual({
        value: ["1", "2"],
        modifier: "EXCLUDES",
      });
    });

    it("should convert numeric studio IDs to strings", () => {
      const uiFilters = {
        studioIds: [1, 2, 3],
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.studios).toEqual({
        value: ["1", "2", "3"],
        modifier: "INCLUDES",
      });
    });

    it("should not include studios filter when array is empty", () => {
      const uiFilters = { studioIds: [] };
      const result = buildGalleryFilter(uiFilters);
      expect(result.studios).toBeUndefined();
    });
  });

  describe("Performers Filter", () => {
    it("should build performers filter with INCLUDES modifier (default)", () => {
      const uiFilters = {
        performerIds: ["1", "2"],
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.performers).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES",
      });
    });

    it("should build performers filter with custom modifier", () => {
      const uiFilters = {
        performerIds: ["1", "2"],
        performerIdsModifier: "INCLUDES_ALL",
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.performers).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES_ALL",
      });
    });

    it("should convert numeric performer IDs to strings", () => {
      const uiFilters = {
        performerIds: [1, 2, 3],
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.performers).toEqual({
        value: ["1", "2", "3"],
        modifier: "INCLUDES",
      });
    });

    it("should not include performers filter when array is empty", () => {
      const uiFilters = { performerIds: [] };
      const result = buildGalleryFilter(uiFilters);
      expect(result.performers).toBeUndefined();
    });
  });

  describe("Tags Filter", () => {
    it("should build tags filter with INCLUDES modifier (default)", () => {
      const uiFilters = {
        tagIds: ["1", "2"],
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES",
      });
    });

    it("should build tags filter with custom modifier", () => {
      const uiFilters = {
        tagIds: ["1", "2"],
        tagIdsModifier: "INCLUDES_ALL",
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES_ALL",
      });
    });

    it("should build tags filter with EXCLUDES modifier", () => {
      const uiFilters = {
        tagIds: ["1", "2"],
        tagIdsModifier: "EXCLUDES",
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "EXCLUDES",
      });
    });

    it("should convert numeric tag IDs to strings", () => {
      const uiFilters = {
        tagIds: [1, 2, 3],
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.tags).toEqual({
        value: ["1", "2", "3"],
        modifier: "INCLUDES",
      });
    });

    it("should not include tags filter when array is empty", () => {
      const uiFilters = { tagIds: [] };
      const result = buildGalleryFilter(uiFilters);
      expect(result.tags).toBeUndefined();
    });
  });

  describe("Multiple Combined Filters", () => {
    it("should build multiple filters together", () => {
      const uiFilters = {
        favorite: true,
        rating: { min: 70, max: 100 },
        imageCount: { min: 50 },
        studioIds: ["1"],
        performerIds: ["2", "3"],
        tagIds: ["4", "5"],
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.favorite).toBe(true);
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 70,
        value2: 100,
      });
      expect(result.image_count).toEqual({
        modifier: "GREATER_THAN",
        value: 49,
      });
      expect(result.studios).toEqual({
        value: ["1"],
        modifier: "INCLUDES",
      });
      expect(result.performers).toEqual({
        value: ["2", "3"],
        modifier: "INCLUDES",
      });
      expect(result.tags).toEqual({
        value: ["4", "5"],
        modifier: "INCLUDES",
      });
    });

    it("should build all filter types together with modifiers", () => {
      const uiFilters = {
        favorite: true,
        rating: { min: 80 },
        imageCount: { min: 100, max: 500 },
        title: "Beach",
        studioIds: ["1", "2"],
        studioIdsModifier: "INCLUDES_ALL",
        performerIds: ["3"],
        performerIdsModifier: "INCLUDES",
        tagIds: ["4", "5"],
        tagIdsModifier: "EXCLUDES",
      };
      const result = buildGalleryFilter(uiFilters);

      expect(result.favorite).toBe(true);
      expect(result.rating100).toEqual({
        modifier: "GREATER_THAN",
        value: 79,
      });
      expect(result.image_count).toEqual({
        modifier: "BETWEEN",
        value: 100,
        value2: 500,
      });
      expect(result.title).toEqual({
        value: "Beach",
        modifier: "INCLUDES",
      });
      expect(result.studios).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES_ALL",
      });
      expect(result.performers).toEqual({
        value: ["3"],
        modifier: "INCLUDES",
      });
      expect(result.tags).toEqual({
        value: ["4", "5"],
        modifier: "EXCLUDES",
      });
    });
  });

  describe("Edge Cases", () => {
    it("should return empty object when no filters provided", () => {
      const result = buildGalleryFilter({});
      expect(result).toEqual({});
    });

    it("should handle null values gracefully", () => {
      const uiFilters = {
        favorite: null,
        studioIds: null,
        performerIds: null,
        tagIds: null,
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.favorite).toBeUndefined();
      expect(result.studios).toBeUndefined();
      expect(result.performers).toBeUndefined();
      expect(result.tags).toBeUndefined();
    });

    it("should handle undefined nested properties", () => {
      const uiFilters = {
        rating: {},
        imageCount: {},
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.rating100).toBeUndefined();
      expect(result.image_count).toBeUndefined();
    });

    it("should handle 0 as a valid min value for numeric filters", () => {
      const uiFilters = {
        rating: { min: 0, max: 50 },
        imageCount: { min: 0 },
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 0,
        value2: 50,
      });
      expect(result.image_count).toEqual({
        modifier: "GREATER_THAN",
        value: -1, // 0 - 1
      });
    });
  });
});
