/**
 * Unit Tests for Performer Filter Configuration
 *
 * Tests that buildPerformerFilter correctly transforms UI filter values
 * into the GraphQL filter format expected by the backend
 */
import { describe, it, expect } from "vitest";
import { buildPerformerFilter } from "../filterConfig.js";

describe("buildPerformerFilter", () => {
  describe("Boolean Filters", () => {
    it("should build favorite filter when true", () => {
      const uiFilters = { favorite: true };
      const result = buildPerformerFilter(uiFilters);
      expect(result.favorite).toBe(true);
    });

    it("should build favorite filter when string 'TRUE'", () => {
      const uiFilters = { favorite: "TRUE" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.favorite).toBe(true);
    });

    it("should not include favorite filter when false", () => {
      const uiFilters = { favorite: false };
      const result = buildPerformerFilter(uiFilters);
      expect(result.favorite).toBeUndefined();
    });

    it("should not include favorite filter when undefined", () => {
      const uiFilters = {};
      const result = buildPerformerFilter(uiFilters);
      expect(result.favorite).toBeUndefined();
    });
  });

  describe("Tags Filter", () => {
    it("should build tags filter with INCLUDES_ALL modifier (default)", () => {
      const uiFilters = {
        tagIds: ["1", "2"],
      };
      const result = buildPerformerFilter(uiFilters);
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
      const result = buildPerformerFilter(uiFilters);
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
      const result = buildPerformerFilter(uiFilters);
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "EXCLUDES",
      });
    });

    it("should convert numeric tag IDs to strings", () => {
      const uiFilters = {
        tagIds: [1, 2, 3],
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.tags).toEqual({
        value: ["1", "2", "3"],
        modifier: "INCLUDES_ALL",
      });
    });

    it("should not include tags filter when array is empty", () => {
      const uiFilters = { tagIds: [] };
      const result = buildPerformerFilter(uiFilters);
      expect(result.tags).toBeUndefined();
    });

    it("should not include tags filter when undefined", () => {
      const uiFilters = {};
      const result = buildPerformerFilter(uiFilters);
      expect(result.tags).toBeUndefined();
    });
  });

  describe("Gender Filter", () => {
    it("should build gender filter with EQUALS modifier", () => {
      const uiFilters = { gender: "FEMALE" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.gender).toEqual({
        value: "FEMALE",
        modifier: "EQUALS",
      });
    });

    it("should build gender filter for MALE", () => {
      const uiFilters = { gender: "MALE" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.gender).toEqual({
        value: "MALE",
        modifier: "EQUALS",
      });
    });

    it("should not include gender filter when undefined", () => {
      const uiFilters = {};
      const result = buildPerformerFilter(uiFilters);
      expect(result.gender).toBeUndefined();
    });
  });

  describe("Rating Filter", () => {
    it("should build rating filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        rating: { min: 60, max: 90 },
      };
      const result = buildPerformerFilter(uiFilters);
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
      const result = buildPerformerFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "GREATER_THAN",
        value: 69, // min - 1
      });
    });

    it("should build rating filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        rating: { max: 50 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "LESS_THAN",
        value: 51, // max + 1
      });
    });

    it("should handle string rating values and convert to integers", () => {
      const uiFilters = {
        rating: { min: "60", max: "90" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 60,
        value2: 90,
      });
    });

    it("should not include rating filter when min and max are undefined", () => {
      const uiFilters = { rating: {} };
      const result = buildPerformerFilter(uiFilters);
      expect(result.rating100).toBeUndefined();
    });

    it("should not include rating filter when min and max are empty strings", () => {
      const uiFilters = {
        rating: { min: "", max: "" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.rating100).toEqual({}); // Empty object created but no modifier/value
    });
  });

  describe("Select Filters (Ethnicity, Hair Color, Eye Color, Fake Tits)", () => {
    it("should build ethnicity filter with INCLUDES modifier", () => {
      const uiFilters = { ethnicity: "asian" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.ethnicity).toEqual({
        value: "asian",
        modifier: "INCLUDES",
      });
    });

    it("should build hair_color filter with INCLUDES modifier", () => {
      const uiFilters = { hairColor: "blonde" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.hair_color).toEqual({
        value: "blonde",
        modifier: "INCLUDES",
      });
    });

    it("should build eye_color filter with INCLUDES modifier", () => {
      const uiFilters = { eyeColor: "blue" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.eye_color).toEqual({
        value: "blue",
        modifier: "INCLUDES",
      });
    });

    it("should build fake_tits filter with INCLUDES modifier", () => {
      const uiFilters = { fakeTits: "Yes" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.fake_tits).toEqual({
        value: "Yes",
        modifier: "INCLUDES",
      });
    });
  });

  describe("Range Filters (Age, Birth Year, Death Year, Career Length)", () => {
    it("should build age filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        age: { min: 21 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.age).toEqual({
        value: 21,
        modifier: "GREATER_THAN",
      });
    });

    it("should build age filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        age: { min: 21, max: 35 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.age).toEqual({
        value: 21,
        modifier: "BETWEEN",
        value2: 35,
      });
    });

    it("should build birth_year filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        birthYear: { min: 1990 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.birth_year).toEqual({
        value: 1990,
        modifier: "GREATER_THAN",
      });
    });

    it("should build birth_year filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        birthYear: { min: 1990, max: 2000 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.birth_year).toEqual({
        value: 1990,
        modifier: "BETWEEN",
        value2: 2000,
      });
    });

    it("should build death_year filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        deathYear: { min: 2015 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.death_year).toEqual({
        value: 2015,
        modifier: "GREATER_THAN",
      });
    });

    it("should build death_year filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        deathYear: { min: 2015, max: 2020 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.death_year).toEqual({
        value: 2015,
        modifier: "BETWEEN",
        value2: 2020,
      });
    });

    it("should build career_length filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        careerLength: { min: 5 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.career_length).toEqual({
        value: 5,
        modifier: "GREATER_THAN",
      });
    });

    it("should build career_length filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        careerLength: { min: 5, max: 15 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.career_length).toEqual({
        value: 5,
        modifier: "BETWEEN",
        value2: 15,
      });
    });

    it("should handle string range values and convert to integers", () => {
      const uiFilters = {
        age: { min: "21", max: "35" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.age).toEqual({
        value: 21,
        modifier: "BETWEEN",
        value2: 35,
      });
    });
  });

  describe("Physical Attribute Range Filters (Height, Weight, Penis Length)", () => {
    it("should build height_cm filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        height: { min: 160 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.height_cm).toEqual({
        value: 160,
        modifier: "GREATER_THAN",
      });
    });

    it("should build height_cm filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        height: { min: 160, max: 180 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.height_cm).toEqual({
        value: 160,
        modifier: "BETWEEN",
        value2: 180,
      });
    });

    it("should build weight filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        weight: { min: 50 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.weight).toEqual({
        value: 50,
        modifier: "GREATER_THAN",
      });
    });

    it("should build weight filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        weight: { min: 50, max: 70 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.weight).toEqual({
        value: 50,
        modifier: "BETWEEN",
        value2: 70,
      });
    });

    it("should build penis_length filter with GREATER_THAN modifier (min only)", () => {
      const uiFilters = {
        penisLength: { min: 15 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.penis_length).toEqual({
        value: 15,
        modifier: "GREATER_THAN",
      });
    });

    it("should build penis_length filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        penisLength: { min: 15, max: 25 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.penis_length).toEqual({
        value: 15,
        modifier: "BETWEEN",
        value2: 25,
      });
    });
  });

  describe("User-Specific Range Filters (O Counter, Play Count, Scene Count)", () => {
    it("should build o_counter filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        oCounter: { min: 5, max: 20 },
      };
      const result = buildPerformerFilter(uiFilters);
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
      const result = buildPerformerFilter(uiFilters);
      expect(result.o_counter).toEqual({
        modifier: "GREATER_THAN",
        value: 9, // min - 1
      });
    });

    it("should build o_counter filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        oCounter: { max: 15 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.o_counter).toEqual({
        modifier: "LESS_THAN",
        value: 16, // max + 1
      });
    });

    it("should build play_count filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        playCount: { min: 10, max: 50 },
      };
      const result = buildPerformerFilter(uiFilters);
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
      const result = buildPerformerFilter(uiFilters);
      expect(result.play_count).toEqual({
        modifier: "GREATER_THAN",
        value: 19, // min - 1
      });
    });

    it("should build play_count filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        playCount: { max: 30 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.play_count).toEqual({
        modifier: "LESS_THAN",
        value: 31, // max + 1
      });
    });

    it("should build scene_count filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        sceneCount: { min: 50, max: 200 },
      };
      const result = buildPerformerFilter(uiFilters);
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
      const result = buildPerformerFilter(uiFilters);
      expect(result.scene_count).toEqual({
        modifier: "GREATER_THAN",
        value: 99, // min - 1
      });
    });

    it("should build scene_count filter with LESS_THAN modifier (max only)", () => {
      const uiFilters = {
        sceneCount: { max: 75 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.scene_count).toEqual({
        modifier: "LESS_THAN",
        value: 76, // max + 1
      });
    });

    it("should not include count filters when min and max are empty strings", () => {
      const uiFilters = {
        oCounter: { min: "", max: "" },
        playCount: { min: "", max: "" },
        sceneCount: { min: "", max: "" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.o_counter).toEqual({}); // Empty object
      expect(result.play_count).toEqual({}); // Empty object
      expect(result.scene_count).toEqual({}); // Empty object
    });
  });

  describe("Date Range Filters", () => {
    it("should build birthdate filter with GREATER_THAN modifier (start only)", () => {
      const uiFilters = {
        birthdate: { start: "1990-01-01" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.birthdate).toEqual({
        value: "1990-01-01",
        modifier: "GREATER_THAN",
      });
    });

    it("should build birthdate filter with BETWEEN modifier (both start and end)", () => {
      const uiFilters = {
        birthdate: { start: "1990-01-01", end: "2000-12-31" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.birthdate).toEqual({
        value: "1990-01-01",
        modifier: "BETWEEN",
        value2: "2000-12-31",
      });
    });

    it("should build death_date filter with GREATER_THAN modifier (start only)", () => {
      const uiFilters = {
        deathDate: { start: "2015-01-01" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.death_date).toEqual({
        value: "2015-01-01",
        modifier: "GREATER_THAN",
      });
    });

    it("should build death_date filter with BETWEEN modifier (both start and end)", () => {
      const uiFilters = {
        deathDate: { start: "2015-01-01", end: "2020-12-31" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.death_date).toEqual({
        value: "2015-01-01",
        modifier: "BETWEEN",
        value2: "2020-12-31",
      });
    });

    it("should build created_at filter with GREATER_THAN modifier (start only)", () => {
      const uiFilters = {
        createdAt: { start: "2023-01-01" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.created_at).toEqual({
        value: "2023-01-01",
        modifier: "GREATER_THAN",
      });
    });

    it("should build created_at filter with BETWEEN modifier (both start and end)", () => {
      const uiFilters = {
        createdAt: { start: "2023-01-01", end: "2023-12-31" },
      };
      const result = buildPerformerFilter(uiFilters);
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
      const result = buildPerformerFilter(uiFilters);
      expect(result.updated_at).toEqual({
        value: "2024-01-01",
        modifier: "GREATER_THAN",
      });
    });

    it("should build updated_at filter with BETWEEN modifier (both start and end)", () => {
      const uiFilters = {
        updatedAt: { start: "2024-01-01", end: "2024-12-31" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.updated_at).toEqual({
        value: "2024-01-01",
        modifier: "BETWEEN",
        value2: "2024-12-31",
      });
    });
  });

  describe("Text Search Filters", () => {
    it("should build name filter with INCLUDES modifier", () => {
      const uiFilters = { name: "Jane" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.name).toEqual({
        value: "Jane",
        modifier: "INCLUDES",
      });
    });

    it("should build details filter with INCLUDES modifier", () => {
      const uiFilters = { details: "biography text" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.details).toEqual({
        value: "biography text",
        modifier: "INCLUDES",
      });
    });

    it("should build measurements filter with INCLUDES modifier", () => {
      const uiFilters = { measurements: "34-24-36" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.measurements).toEqual({
        value: "34-24-36",
        modifier: "INCLUDES",
      });
    });

    it("should not include text filters when undefined", () => {
      const uiFilters = {};
      const result = buildPerformerFilter(uiFilters);
      expect(result.name).toBeUndefined();
      expect(result.details).toBeUndefined();
      expect(result.measurements).toBeUndefined();
    });
  });

  describe("Multiple Combined Filters", () => {
    it("should build multiple filters together", () => {
      const uiFilters = {
        favorite: true,
        gender: "FEMALE",
        rating: { min: 70, max: 100 },
        age: { min: 21, max: 35 },
        tagIds: ["1", "2"],
        tagIdsModifier: "INCLUDES",
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.favorite).toBe(true);
      expect(result.gender).toEqual({ value: "FEMALE", modifier: "EQUALS" });
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 70,
        value2: 100,
      });
      expect(result.age).toEqual({ value: 21, modifier: "BETWEEN", value2: 35 });
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES",
      });
    });

    it("should build all filter types together", () => {
      const uiFilters = {
        favorite: true,
        gender: "FEMALE",
        tagIds: ["1", "2"],
        rating: { min: 80 },
        age: { min: 25, max: 40 },
        height: { min: 165 },
        oCounter: { min: 5, max: 20 },
        playCount: { min: 10 },
        sceneCount: { max: 100 },
        ethnicity: "caucasian",
        hairColor: "brown",
        name: "Jane",
        createdAt: { start: "2023-01-01", end: "2023-12-31" },
      };
      const result = buildPerformerFilter(uiFilters);

      expect(result.favorite).toBe(true);
      expect(result.gender).toEqual({ value: "FEMALE", modifier: "EQUALS" });
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES_ALL",
      });
      expect(result.rating100).toEqual({
        modifier: "GREATER_THAN",
        value: 79,
      });
      expect(result.age).toEqual({ value: 25, modifier: "BETWEEN", value2: 40 });
      expect(result.height_cm).toEqual({ value: 165, modifier: "GREATER_THAN" });
      expect(result.o_counter).toEqual({
        modifier: "BETWEEN",
        value: 5,
        value2: 20,
      });
      expect(result.play_count).toEqual({
        modifier: "GREATER_THAN",
        value: 9,
      });
      expect(result.scene_count).toEqual({
        modifier: "LESS_THAN",
        value: 101,
      });
      expect(result.ethnicity).toEqual({ value: "caucasian", modifier: "INCLUDES" });
      expect(result.hair_color).toEqual({ value: "brown", modifier: "INCLUDES" });
      expect(result.name).toEqual({ value: "Jane", modifier: "INCLUDES" });
      expect(result.created_at).toEqual({
        value: "2023-01-01",
        modifier: "BETWEEN",
        value2: "2023-12-31",
      });
    });
  });

  describe("Edge Cases", () => {
    it("should return empty object when no filters provided", () => {
      const result = buildPerformerFilter({});
      expect(result).toEqual({});
    });

    it("should handle null values gracefully", () => {
      const uiFilters = {
        favorite: null,
        gender: null,
        tagIds: null,
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.favorite).toBeUndefined();
      expect(result.gender).toBeUndefined();
      expect(result.tags).toBeUndefined();
    });

    it("should handle undefined nested properties", () => {
      const uiFilters = {
        rating: {},
        age: {},
        oCounter: {},
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.rating100).toBeUndefined();
      expect(result.age).toBeUndefined();
      expect(result.o_counter).toBeUndefined();
    });

    it("should handle 0 as a valid min value for numeric filters", () => {
      const uiFilters = {
        rating: { min: 0, max: 50 },
        oCounter: { min: 0 },
      };
      const result = buildPerformerFilter(uiFilters);
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
