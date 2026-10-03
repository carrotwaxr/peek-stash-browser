/**
 * Unit Tests for Performer Filter Configuration
 *
 * Tests that buildPerformerFilter correctly transforms UI filter values
 * into the GraphQL filter format expected by the backend
 */
import { describe, expect, it } from "vitest";
import { buildPerformerFilter } from "../../src/utils/filterConfig";

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
    it("a gender stored as one value sends a one-element list under INCLUDES", () => {
      const uiFilters = { gender: "FEMALE" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.gender).toEqual({
        value: ["FEMALE"],
        modifier: "INCLUDES",
      });
    });

    it("several genders under Is NONE of these send EXCLUDES", () => {
      const uiFilters = {
        gender: ["MALE", "TRANSGENDER_MALE"],
        genderModifier: "EXCLUDES",
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.gender).toEqual({
        value: ["MALE", "TRANSGENDER_MALE"],
        modifier: "EXCLUDES",
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

    it("should build rating filter with a lone minimum as BETWEEN (min only)", () => {
      const uiFilters = {
        rating: { min: 70 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 70,
      });
    });

    it("should build rating filter with a lone maximum as BETWEEN (max only)", () => {
      const uiFilters = {
        rating: { max: 50 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value2: 50,
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
      // Bug #2 fix: Empty range values should not create filter objects
      expect(result.rating100).toBeUndefined();
    });
  });

  describe("Select Filters (Ethnicity, Hair Color, Eye Color, Fake Tits)", () => {
    it("should build ethnicity filter with EQUALS modifier", () => {
      const uiFilters = { ethnicity: "asian" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.ethnicity).toEqual({
        value: "asian",
        modifier: "EQUALS",
      });
    });

    it("should build hair_color filter with EQUALS modifier", () => {
      const uiFilters = { hairColor: "blonde" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.hair_color).toEqual({
        value: "blonde",
        modifier: "EQUALS",
      });
    });

    it("should build eye_color filter with EQUALS modifier", () => {
      const uiFilters = { eyeColor: "blue" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.eye_color).toEqual({
        value: "blue",
        modifier: "EQUALS",
      });
    });

    it("should build fake_tits filter with EQUALS modifier", () => {
      const uiFilters = { fakeTits: "Natural" };
      const result = buildPerformerFilter(uiFilters);
      expect(result.fake_tits).toEqual({
        value: "Natural",
        modifier: "EQUALS",
      });
    });
  });

  describe("Range Filters (Age, Birth Year, Death Year, Career Length)", () => {
    it("should build age filter with a lone minimum as BETWEEN (min only)", () => {
      const uiFilters = {
        age: { min: 21 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.age).toEqual({
        value: 21,
        modifier: "BETWEEN",
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

    it("should build birth_year filter with a lone minimum as BETWEEN (min only)", () => {
      const uiFilters = {
        birthYear: { min: 1990 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.birth_year).toEqual({
        value: 1990,
        modifier: "BETWEEN",
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

    it("should build death_year filter with a lone minimum as BETWEEN (min only)", () => {
      const uiFilters = {
        deathYear: { min: 2015 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.death_year).toEqual({
        value: 2015,
        modifier: "BETWEEN",
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

    it("should build career_length filter with a lone minimum as BETWEEN (min only)", () => {
      const uiFilters = {
        careerLength: { min: 5 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.career_length).toEqual({
        value: 5,
        modifier: "BETWEEN",
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

    it("should build age filter with a lone maximum as BETWEEN (max only)", () => {
      const uiFilters = {
        age: { max: 30 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.age).toEqual({
        value2: 30,
        modifier: "BETWEEN",
      });
    });

    it("should build birth_year filter with a lone maximum as BETWEEN (max only)", () => {
      const uiFilters = {
        birthYear: { max: 2000 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.birth_year).toEqual({
        value2: 2000,
        modifier: "BETWEEN",
      });
    });

    it("should build death_year filter with a lone maximum as BETWEEN (max only)", () => {
      const uiFilters = {
        deathYear: { max: 2020 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.death_year).toEqual({
        value2: 2020,
        modifier: "BETWEEN",
      });
    });

    it("should build career_length filter with a lone maximum as BETWEEN (max only)", () => {
      const uiFilters = {
        careerLength: { max: 10 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.career_length).toEqual({
        value2: 10,
        modifier: "BETWEEN",
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
    it("should build height filter with a lone minimum as BETWEEN (min only)", () => {
      const uiFilters = {
        height: { min: 160 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.height).toEqual({
        value: 160,
        modifier: "BETWEEN",
      });
    });

    it("should build height filter with BETWEEN modifier (both min and max)", () => {
      const uiFilters = {
        height: { min: 160, max: 180 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.height).toEqual({
        value: 160,
        modifier: "BETWEEN",
        value2: 180,
      });
    });

    it("should build weight filter with a lone minimum as BETWEEN (min only)", () => {
      const uiFilters = {
        weight: { min: 50 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.weight).toEqual({
        value: 50,
        modifier: "BETWEEN",
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

    it("should build height filter with a lone maximum as BETWEEN (max only)", () => {
      const uiFilters = {
        height: { max: 180 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.height).toEqual({
        value2: 180,
        modifier: "BETWEEN",
      });
    });

    it("should build weight filter with a lone maximum as BETWEEN (max only)", () => {
      const uiFilters = {
        weight: { max: 70 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.weight).toEqual({
        value2: 70,
        modifier: "BETWEEN",
      });
    });

    it("should build penis_length filter with a lone maximum as BETWEEN (max only)", () => {
      const uiFilters = {
        penisLength: { max: 20 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.penis_length).toEqual({
        value2: 20,
        modifier: "BETWEEN",
      });
    });

    it("should build penis_length filter with a lone minimum as BETWEEN (min only)", () => {
      const uiFilters = {
        penisLength: { min: 15 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.penis_length).toEqual({
        value: 15,
        modifier: "BETWEEN",
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

    it("should build o_counter filter with a lone minimum as BETWEEN (min only)", () => {
      const uiFilters = {
        oCounter: { min: 10 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.o_counter).toEqual({
        modifier: "BETWEEN",
        value: 10,
      });
    });

    it("should build o_counter filter with a lone maximum as BETWEEN (max only)", () => {
      const uiFilters = {
        oCounter: { max: 15 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.o_counter).toEqual({
        modifier: "BETWEEN",
        value2: 15,
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

    it("should build play_count filter with a lone minimum as BETWEEN (min only)", () => {
      const uiFilters = {
        playCount: { min: 20 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.play_count).toEqual({
        modifier: "BETWEEN",
        value: 20,
      });
    });

    it("should build play_count filter with a lone maximum as BETWEEN (max only)", () => {
      const uiFilters = {
        playCount: { max: 30 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.play_count).toEqual({
        modifier: "BETWEEN",
        value2: 30,
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

    it("should build scene_count filter with a lone minimum as BETWEEN (min only)", () => {
      const uiFilters = {
        sceneCount: { min: 100 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.scene_count).toEqual({
        modifier: "BETWEEN",
        value: 100,
      });
    });

    it("should build scene_count filter with a lone maximum as BETWEEN (max only)", () => {
      const uiFilters = {
        sceneCount: { max: 75 },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.scene_count).toEqual({
        modifier: "BETWEEN",
        value2: 75,
      });
    });

    it("should not include count filters when min and max are empty strings", () => {
      const uiFilters = {
        oCounter: { min: "", max: "" },
        playCount: { min: "", max: "" },
        sceneCount: { min: "", max: "" },
      };
      const result = buildPerformerFilter(uiFilters);
      // Bug #2 fix: Empty range values should not create filter objects
      expect(result.o_counter).toBeUndefined();
      expect(result.play_count).toBeUndefined();
      expect(result.scene_count).toBeUndefined();
    });
  });

  describe("Date Range Filters", () => {
    it("should build birthdate filter with a lone minimum as BETWEEN (start only)", () => {
      const uiFilters = {
        birthdate: { start: "1990-01-01" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.birthdate).toEqual({
        value: "1990-01-01",
        modifier: "BETWEEN",
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

    it("should build death_date filter with a lone minimum as BETWEEN (start only)", () => {
      const uiFilters = {
        deathDate: { start: "2015-01-01" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.death_date).toEqual({
        value: "2015-01-01",
        modifier: "BETWEEN",
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

    it("should build created_at filter with a lone minimum as BETWEEN (start only)", () => {
      const uiFilters = {
        createdAt: { start: "2023-01-01" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.created_at).toEqual({
        value: "2023-01-01",
        modifier: "BETWEEN",
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

    it("should build updated_at filter with a lone minimum as BETWEEN (start only)", () => {
      const uiFilters = {
        updatedAt: { start: "2024-01-01" },
      };
      const result = buildPerformerFilter(uiFilters);
      expect(result.updated_at).toEqual({
        value: "2024-01-01",
        modifier: "BETWEEN",
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
      expect(result.gender).toEqual({
        value: ["FEMALE"],
        modifier: "INCLUDES",
      });
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 70,
        value2: 100,
      });
      expect(result.age).toEqual({
        value: 21,
        modifier: "BETWEEN",
        value2: 35,
      });
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
      expect(result.gender).toEqual({
        value: ["FEMALE"],
        modifier: "INCLUDES",
      });
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES_ALL",
      });
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 80,
      });
      expect(result.age).toEqual({
        value: 25,
        modifier: "BETWEEN",
        value2: 40,
      });
      expect(result.height).toEqual({ value: 165, modifier: "BETWEEN" });
      expect(result.o_counter).toEqual({
        modifier: "BETWEEN",
        value: 5,
        value2: 20,
      });
      expect(result.play_count).toEqual({
        modifier: "BETWEEN",
        value: 10,
      });
      expect(result.scene_count).toEqual({
        modifier: "BETWEEN",
        value2: 100,
      });
      expect(result.ethnicity).toEqual({
        value: "caucasian",
        modifier: "EQUALS",
      });
      expect(result.hair_color).toEqual({ value: "brown", modifier: "EQUALS" });
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
        modifier: "BETWEEN",
        value: 0, // 0 - 1
      });
    });
  });

  describe("Body measures are metric", () => {
    it("sends Height as the centimetres the state holds", () => {
      // An imperial viewer's editor stored 5'10" to 6'2" as 177 to 189 cm
      const result = buildPerformerFilter({
        height: { min: "177", max: "189" },
      });
      expect(result.height).toEqual({
        modifier: "BETWEEN",
        value: 177,
        value2: 189,
      });
    });

    it("sends Height min only as the centimetres the state holds", () => {
      const result = buildPerformerFilter({ height: { min: "167" } });
      expect(result.height).toEqual({
        modifier: "BETWEEN",
        value: 167,
      });
    });

    it("sends Weight as the kilograms the state holds", () => {
      // An imperial viewer's 110 to 180 lbs, stored as 50 to 82 kg
      const result = buildPerformerFilter({ weight: { min: "50", max: "82" } });
      expect(result.weight).toEqual({
        modifier: "BETWEEN",
        value: 50,
        value2: 82,
      });
    });

    it("sends Penis Length as the centimetres the state holds", () => {
      // 5 in to 8 in stored as 12.7 and 20.32 cm; the request keeps both decimals
      const result = buildPerformerFilter({
        penisLength: { min: "12.7", max: "20.32" },
      });
      expect(result.penis_length).toEqual({
        modifier: "BETWEEN",
        value: 12.7,
        value2: 20.32,
      });
    });

    it("reads the old feet-and-inches height shape as centimetres", () => {
      // A preset saved by an imperial viewer before the state went metric
      const result = buildPerformerFilter({
        height: { feetMin: "5", inchesMin: "10", feetMax: "6", inchesMax: "2" },
      });
      // 5'10" = 177.8 cm, the request keeps the decimals; a maximum is the
      // top of its inch, 6'2" up to 189 cm as the editor writes it
      expect(result.height).toEqual({
        modifier: "BETWEEN",
        value: 177.8,
        value2: 189,
      });
    });
  });
});
