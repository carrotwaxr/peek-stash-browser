/**
 * Unit Tests for Filter Configuration
 *
 * Tests that filter builder functions correctly transform UI filter values
 * into the GraphQL filter format expected by the backend
 */
import {
  type EntityKind,
  type FieldSpec,
  LIST_FIELDS,
  LIST_KINDS,
  type ListKind,
  UI_KEYS,
} from "@peek/shared-types";
import { must } from "@tests/testUtils";
import { describe, expect, it } from "vitest";
import {
  CLIP_FILTER_OPTIONS,
  type FilterOption,
  GALLERY_FILTER_OPTIONS,
  GROUP_FILTER_OPTIONS,
  IMAGE_FILTER_OPTIONS,
  PERFORMER_FILTER_OPTIONS,
  SCENE_FILTER_OPTIONS,
  STUDIO_FILTER_OPTIONS,
  TAG_FILTER_OPTIONS,
  buildClipFilter,
  buildGalleryFilter,
  buildGroupFilter,
  buildImageFilter,
  buildPerformerFilter,
  buildSceneFilter,
  buildStudioFilter,
  buildTagFilter,
} from "../../src/utils/filterConfig";

describe("buildSceneFilter", () => {
  describe("Orientation Filter", () => {
    it("should build orientation filter with LANDSCAPE value", () => {
      const uiFilters = {
        orientation: "LANDSCAPE",
      };

      const result = buildSceneFilter(uiFilters);

      expect(result.orientation).toEqual({
        value: ["LANDSCAPE"],
      });
    });

    it("should build orientation filter with PORTRAIT value", () => {
      const uiFilters = {
        orientation: "PORTRAIT",
      };

      const result = buildSceneFilter(uiFilters);

      expect(result.orientation).toEqual({
        value: ["PORTRAIT"],
      });
    });

    it("should build orientation filter with SQUARE value", () => {
      const uiFilters = {
        orientation: "SQUARE",
      };

      const result = buildSceneFilter(uiFilters);

      expect(result.orientation).toEqual({
        value: ["SQUARE"],
      });
    });

    it("should not include orientation filter when value is empty string", () => {
      const uiFilters = {
        orientation: "",
      };

      const result = buildSceneFilter(uiFilters);

      expect(result.orientation).toBeUndefined();
    });

    it("should not include orientation filter when value is undefined", () => {
      const uiFilters = {};

      const result = buildSceneFilter(uiFilters);

      expect(result.orientation).toBeUndefined();
    });
  });

  describe("Boolean Filters", () => {
    it("should build favorite filter when true", () => {
      const uiFilters = { favorite: true };
      const result = buildSceneFilter(uiFilters);
      expect(result.favorite).toBe(true);
    });

    it("should build performer_favorite filter when true", () => {
      const uiFilters = { performerFavorite: true };
      const result = buildSceneFilter(uiFilters);
      expect(result.performer_favorite).toBe(true);
    });

    it("should build studio_favorite filter when true", () => {
      const uiFilters = { studioFavorite: true };
      const result = buildSceneFilter(uiFilters);
      expect(result.studio_favorite).toBe(true);
    });

    it("should build tag_favorite filter when true", () => {
      const uiFilters = { tagFavorite: true };
      const result = buildSceneFilter(uiFilters);
      expect(result.tag_favorite).toBe(true);
    });

    it("should not include false boolean filters", () => {
      const uiFilters = { favorite: false };
      const result = buildSceneFilter(uiFilters);
      expect(result.favorite).toBeUndefined();
    });
  });

  describe("Array-based Filters (Performers, Tags, Studios, Groups)", () => {
    it("should build performers filter with INCLUDES modifier", () => {
      const uiFilters = {
        performerIds: ["1", "2"],
        performerIdsModifier: "INCLUDES",
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.performers).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES",
      });
    });

    it("should build performers filter with INCLUDES_ALL modifier", () => {
      const uiFilters = {
        performerIds: ["1", "2"],
        performerIdsModifier: "INCLUDES_ALL",
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.performers).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES_ALL",
      });
    });

    it("should build performers filter with EXCLUDES modifier", () => {
      const uiFilters = {
        performerIds: ["1", "2"],
        performerIdsModifier: "EXCLUDES",
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.performers).toEqual({
        value: ["1", "2"],
        modifier: "EXCLUDES",
      });
    });

    it("should not include performers filter when array is empty", () => {
      const uiFilters = { performerIds: [] };
      const result = buildSceneFilter(uiFilters);
      expect(result.performers).toBeUndefined();
    });

    it("should build studios filter with INCLUDES modifier", () => {
      const uiFilters = { studioId: "123" };
      const result = buildSceneFilter(uiFilters);
      expect(result.studios).toEqual({
        value: ["123"],
        modifier: "INCLUDES",
      });
    });

    it("should build tags filter with default INCLUDES_ALL modifier", () => {
      const uiFilters = { tagIds: ["1", "2", "3"] };
      const result = buildSceneFilter(uiFilters);
      expect(result.tags).toEqual({
        value: ["1", "2", "3"],
        modifier: "INCLUDES_ALL",
      });
    });

    it("should build groups filter with INCLUDES modifier", () => {
      const uiFilters = {
        groupIds: ["1"],
        groupIdsModifier: "INCLUDES",
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.groups).toEqual({
        value: ["1"],
        modifier: "INCLUDES",
      });
    });

    it("sends galleries for the scene panel's Galleries picker", () => {
      const uiFilters = {
        galleryIds: ["1"],
        galleryIdsModifier: "INCLUDES",
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.galleries).toEqual({ value: ["1"], modifier: "INCLUDES" });
    });

    it("should build galleries filter from permanent filters", () => {
      const uiFilters = {
        galleries: {
          value: ["123"],
          modifier: "INCLUDES",
        },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.galleries).toEqual({
        value: ["123"],
        modifier: "INCLUDES",
      });
    });
  });

  describe("Range Filters", () => {
    it("should build rating100 filter with BETWEEN modifier", () => {
      const uiFilters = {
        rating: { min: 20, max: 80 },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.rating100).toEqual({
        value: 20,
        value2: 80,
        modifier: "BETWEEN",
      });
    });

    it("should build rating100 filter with a lone minimum as BETWEEN (min only)", () => {
      const uiFilters = {
        rating: { min: 50 },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.rating100).toEqual({
        value: 50,
        modifier: "BETWEEN",
      });
    });

    it("should build rating100 filter with a lone maximum as BETWEEN (max only)", () => {
      const uiFilters = {
        rating: { max: 50 },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.rating100).toEqual({
        value2: 50,
        modifier: "BETWEEN",
      });
    });

    it("should build duration filter with BETWEEN modifier (converts minutes to seconds)", () => {
      const uiFilters = {
        duration: { min: 10, max: 30 },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.duration).toEqual({
        value: 600, // 10 * 60
        value2: 1800, // 30 * 60
        modifier: "BETWEEN",
      });
    });

    it("should build o_counter filter with BETWEEN modifier", () => {
      const uiFilters = {
        oCount: { min: 5, max: 20 },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.o_counter).toEqual({
        value: 5,
        value2: 20,
        modifier: "BETWEEN",
      });
    });

    it("should build play_count filter with a lone minimum as BETWEEN", () => {
      const uiFilters = {
        playCount: { min: 10 },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.play_count).toEqual({
        value: 10,
        modifier: "BETWEEN",
      });
    });

    it("should build bitrate filter with BETWEEN modifier (converts Mbps to bps)", () => {
      const uiFilters = {
        bitrate: { min: 5, max: 10 },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.bitrate).toEqual({
        value: 5000000, // 5 * 1000000
        value2: 10000000, // 10 * 1000000
        modifier: "BETWEEN",
      });
    });

    it("should build framerate filter with a lone maximum as BETWEEN", () => {
      const uiFilters = {
        framerate: { max: 60 },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.framerate).toEqual({
        value2: 60,
        modifier: "BETWEEN",
      });
    });

    it("should build performer_count filter with BETWEEN modifier", () => {
      const uiFilters = {
        performerCount: { min: 2, max: 5 },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.performer_count).toEqual({
        value: 2,
        value2: 5,
        modifier: "BETWEEN",
      });
    });

    it("should build tag_count filter with a lone minimum as BETWEEN", () => {
      const uiFilters = {
        tagCount: { min: 3 },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.tag_count).toEqual({
        value: 3,
        modifier: "BETWEEN",
      });
    });
  });

  describe("Date Range Filters", () => {
    it("should build created_at filter with BETWEEN modifier", () => {
      const uiFilters = {
        createdAt: { start: "2024-01-01", end: "2024-12-31" },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.created_at).toEqual({
        value: "2024-01-01",
        value2: "2024-12-31",
        modifier: "BETWEEN",
      });
    });

    it("should build created_at filter with a lone minimum as BETWEEN (start only)", () => {
      const uiFilters = {
        createdAt: { start: "2024-01-01" },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.created_at).toEqual({
        value: "2024-01-01",
        modifier: "BETWEEN",
      });
    });

    it("should build updated_at filter with BETWEEN modifier", () => {
      const uiFilters = {
        updatedAt: { start: "2024-01-01", end: "2024-12-31" },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.updated_at).toEqual({
        value: "2024-01-01",
        value2: "2024-12-31",
        modifier: "BETWEEN",
      });
    });

    it("should build last_played_at filter with BETWEEN modifier", () => {
      const uiFilters = {
        lastPlayedAt: { start: "2024-01-01", end: "2024-12-31" },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.last_played_at).toEqual({
        value: "2024-01-01",
        value2: "2024-12-31",
        modifier: "BETWEEN",
      });
    });

    it("should build date filter with a lone minimum as BETWEEN (start only)", () => {
      const uiFilters = {
        date: { start: "2024-01-01" },
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.date).toEqual({
        value: "2024-01-01",
        modifier: "BETWEEN",
      });
    });
  });

  describe("Text Search Filters", () => {
    it("should build title filter with INCLUDES modifier", () => {
      const uiFilters = { title: "search term" };
      const result = buildSceneFilter(uiFilters);
      expect(result.title).toEqual({
        value: "search term",
        modifier: "INCLUDES",
      });
    });

    it("should build details filter with INCLUDES modifier", () => {
      const uiFilters = { details: "description text" };
      const result = buildSceneFilter(uiFilters);
      expect(result.details).toEqual({
        value: "description text",
        modifier: "INCLUDES",
      });
    });

    it("should build director filter with INCLUDES modifier", () => {
      const uiFilters = { director: "director name" };
      const result = buildSceneFilter(uiFilters);
      expect(result.director).toEqual({
        value: "director name",
        modifier: "INCLUDES",
      });
    });

    it("should build audio_codec filter with INCLUDES modifier", () => {
      const uiFilters = { audioCodec: "aac" };
      const result = buildSceneFilter(uiFilters);
      expect(result.audio_codec).toEqual({
        value: "aac",
        modifier: "INCLUDES",
      });
    });
  });

  describe("Resolution Filter", () => {
    it("should build resolution filter with EQUALS modifier", () => {
      const uiFilters = { resolution: "FULL_HD" };
      const result = buildSceneFilter(uiFilters);
      expect(result.resolution).toEqual({
        value: "FULL_HD",
        modifier: "EQUALS",
      });
    });

    it("should build resolution filter for 720p with its modifier", () => {
      const uiFilters = {
        resolution: "STANDARD_HD",
        resolutionModifier: "GREATER_THAN",
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.resolution).toEqual({
        value: "STANDARD_HD",
        modifier: "GREATER_THAN",
      });
    });

    it("sends no resolution the contract does not name (a stale URL's 1080)", () => {
      const result = buildSceneFilter({ resolution: "1080" });
      expect(result.resolution).toBeUndefined();
    });
  });

  describe("Multiple Combined Filters", () => {
    it("should build multiple filters correctly", () => {
      const uiFilters = {
        favorite: true,
        performerIds: ["1", "2"],
        performerIdsModifier: "INCLUDES_ALL",
        rating: { min: 60, max: 100 },
        title: "test",
        orientation: "LANDSCAPE",
      };

      const result = buildSceneFilter(uiFilters);

      expect(result.favorite).toBe(true);
      expect(result.performers).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES_ALL",
      });
      expect(result.rating100).toEqual({
        value: 60,
        value2: 100,
        modifier: "BETWEEN",
      });
      expect(result.title).toEqual({
        value: "test",
        modifier: "INCLUDES",
      });
      expect(result.orientation).toEqual({
        value: ["LANDSCAPE"],
      });
    });
  });

  describe("Edge Cases", () => {
    it("should return empty object when no filters provided", () => {
      const result = buildSceneFilter({});
      expect(result).toEqual({});
    });

    it("should ignore empty string values", () => {
      const uiFilters = {
        title: "",
        director: "",
        orientation: "",
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.title).toBeUndefined();
      expect(result.director).toBeUndefined();
      expect(result.orientation).toBeUndefined();
    });

    it("should ignore empty range values", () => {
      const uiFilters = {
        rating: {},
      };
      const result = buildSceneFilter(uiFilters);
      expect(result.rating100).toBeUndefined();
    });

    it("should not include duration filter when min and max are empty strings", () => {
      const uiFilters = {
        duration: { min: "", max: "" },
      };
      const result = buildSceneFilter(uiFilters);
      // Empty strings should not produce a filter property (avoids sending empty objects to API)
      expect(result.duration).toBeUndefined();
    });
  });
});

describe("buildGalleryFilter", () => {
  describe("Date Range Filters", () => {
    it("should build date filter with BETWEEN modifier when both start and end provided", () => {
      const uiFilters = {
        date: { start: "2024-01-01", end: "2024-01-31" },
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.date).toEqual({
        value: "2024-01-01",
        value2: "2024-01-31",
        modifier: "BETWEEN",
      });
    });

    it("should build date filter with a lone minimum as BETWEEN when only start provided", () => {
      const uiFilters = {
        date: { start: "2024-03-15" },
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.date).toEqual({
        value: "2024-03-15",
        modifier: "BETWEEN",
      });
    });

    it("should not include date filter when date object is empty", () => {
      const uiFilters = {
        date: {},
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.date).toBeUndefined();
    });

    it("should not include date filter when date is undefined", () => {
      const uiFilters = {};
      const result = buildGalleryFilter(uiFilters);
      expect(result.date).toBeUndefined();
    });
  });

  describe("Other Filters", () => {
    it("should build favorite filter when true", () => {
      const uiFilters = { favorite: true };
      const result = buildGalleryFilter(uiFilters);
      expect(result.favorite).toBe(true);
    });

    it("should build rating100 filter with BETWEEN modifier", () => {
      const uiFilters = {
        rating: { min: 40, max: 80 },
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.rating100).toEqual({
        value: 40,
        value2: 80,
        modifier: "BETWEEN",
      });
    });

    it("should build tags filter with depth for hierarchical filtering", () => {
      const uiFilters = {
        tagIds: ["1", "2"],
        tagIdsModifier: "INCLUDES_ALL",
        tagIdsDepth: 2,
      };
      const result = buildGalleryFilter(uiFilters);
      expect(result.tags).toEqual({
        value: ["1", "2"],
        modifier: "INCLUDES_ALL",
        depth: 2,
      });
    });
  });

  describe("Combined Filters with Date", () => {
    it("should build multiple filters including date correctly", () => {
      const uiFilters = {
        favorite: true,
        date: { start: "2024-01-01", end: "2024-12-31" },
        tagIds: ["1"],
      };
      const result = buildGalleryFilter(uiFilters);

      expect(result.favorite).toBe(true);
      expect(result.date).toEqual({
        value: "2024-01-01",
        value2: "2024-12-31",
        modifier: "BETWEEN",
      });
      // Untouched, the option's default (Has ALL), as the panel shows it
      expect(result.tags).toEqual({
        value: ["1"],
        modifier: "INCLUDES_ALL",
      });
    });
  });
});

describe("buildImageFilter", () => {
  describe("Date Range Filters", () => {
    it("should build date filter with BETWEEN modifier when both start and end provided", () => {
      const uiFilters = {
        date: { start: "2024-02-01", end: "2024-02-29" },
      };
      const result = buildImageFilter(uiFilters);
      expect(result.date).toEqual({
        value: "2024-02-01",
        value2: "2024-02-29",
        modifier: "BETWEEN",
      });
    });

    it("should build date filter with a lone minimum as BETWEEN when only start provided", () => {
      const uiFilters = {
        date: { start: "2024-06-01" },
      };
      const result = buildImageFilter(uiFilters);
      expect(result.date).toEqual({
        value: "2024-06-01",
        modifier: "BETWEEN",
      });
    });

    it("should not include date filter when date object is empty", () => {
      const uiFilters = {
        date: {},
      };
      const result = buildImageFilter(uiFilters);
      expect(result.date).toBeUndefined();
    });

    it("should not include date filter when date is undefined", () => {
      const uiFilters = {};
      const result = buildImageFilter(uiFilters);
      expect(result.date).toBeUndefined();
    });
  });

  describe("Other Filters", () => {
    it("should build favorite filter when true", () => {
      const uiFilters = { favorite: true };
      const result = buildImageFilter(uiFilters);
      expect(result.favorite).toBe(true);
    });

    it("should build o_counter filter with BETWEEN modifier", () => {
      const uiFilters = {
        oCounter: { min: 1, max: 10 },
      };
      const result = buildImageFilter(uiFilters);
      expect(result.o_counter).toEqual({
        value: 1,
        value2: 10,
        modifier: "BETWEEN",
      });
    });

    it("should build galleries filter", () => {
      const uiFilters = {
        galleryIds: ["123", "456"],
        galleryIdsModifier: "INCLUDES",
      };
      const result = buildImageFilter(uiFilters);
      expect(result.galleries).toEqual({
        value: ["123", "456"],
        modifier: "INCLUDES",
      });
    });

    it("a detail page's fixed performers, studios and galleries criteria reach the filter", () => {
      const result = buildImageFilter({
        performers: { value: ["1:a"], modifier: "INCLUDES" },
        studios: { value: ["2:a"], modifier: "INCLUDES", depth: -1 },
        galleries: { value: ["3:a"], modifier: "INCLUDES" },
      });
      expect(result.performers).toEqual({
        value: ["1:a"],
        modifier: "INCLUDES",
      });
      expect(result.studios).toEqual({
        value: ["2:a"],
        modifier: "INCLUDES",
        depth: -1,
      });
      expect(result.galleries).toEqual({
        value: ["3:a"],
        modifier: "INCLUDES",
      });
    });
  });

  describe("Combined Filters with Date", () => {
    it("should build multiple filters including date correctly", () => {
      const uiFilters = {
        favorite: true,
        date: { start: "2024-01-01", end: "2024-06-30" },
        performerIds: ["perf1"],
      };
      const result = buildImageFilter(uiFilters);

      expect(result.favorite).toBe(true);
      expect(result.date).toEqual({
        value: "2024-01-01",
        value2: "2024-06-30",
        modifier: "BETWEEN",
      });
      expect(result.performers).toEqual({
        value: ["perf1"],
        modifier: "INCLUDES",
      });
    });
  });
});

describe("buildPerformerFilter", () => {
  describe("Range Filters - age", () => {
    it("should build age filter with BETWEEN when both min and max provided", () => {
      const result = buildPerformerFilter({ age: { min: 20, max: 30 } });
      expect(result.age).toEqual({
        modifier: "BETWEEN",
        value: 20,
        value2: 30,
      });
    });

    it("should build age filter with a lone minimum as BETWEEN when only min provided", () => {
      const result = buildPerformerFilter({ age: { min: 25 } });
      expect(result.age).toEqual({
        modifier: "BETWEEN",
        value: 25,
      });
    });

    it("should build age filter with a lone maximum as BETWEEN when only max provided", () => {
      const result = buildPerformerFilter({ age: { max: 30 } });
      expect(result.age).toEqual({
        modifier: "BETWEEN",
        value2: 30,
      });
    });
  });

  describe("Range Filters - birthYear", () => {
    it("should build birth_year filter with BETWEEN when both min and max provided", () => {
      const result = buildPerformerFilter({
        birthYear: { min: 1990, max: 2000 },
      });
      expect(result.birth_year).toEqual({
        modifier: "BETWEEN",
        value: 1990,
        value2: 2000,
      });
    });

    it("should build birth_year filter with a lone minimum as BETWEEN when only min provided", () => {
      const result = buildPerformerFilter({ birthYear: { min: 1990 } });
      expect(result.birth_year).toEqual({
        modifier: "BETWEEN",
        value: 1990,
      });
    });

    it("should build birth_year filter with a lone maximum as BETWEEN when only max provided", () => {
      const result = buildPerformerFilter({ birthYear: { max: 2000 } });
      expect(result.birth_year).toEqual({
        modifier: "BETWEEN",
        value2: 2000,
      });
    });
  });

  describe("Range Filters - deathYear", () => {
    it("should build death_year filter with a lone maximum as BETWEEN when only max provided", () => {
      const result = buildPerformerFilter({ deathYear: { max: 2020 } });
      expect(result.death_year).toEqual({
        modifier: "BETWEEN",
        value2: 2020,
      });
    });

    it("should build death_year filter with a lone minimum as BETWEEN when only min provided", () => {
      const result = buildPerformerFilter({ deathYear: { min: 2010 } });
      expect(result.death_year).toEqual({
        modifier: "BETWEEN",
        value: 2010,
      });
    });
  });

  describe("Range Filters - careerLength", () => {
    it("should build career_length filter with a lone maximum as BETWEEN when only max provided", () => {
      const result = buildPerformerFilter({ careerLength: { max: 15 } });
      expect(result.career_length).toEqual({
        modifier: "BETWEEN",
        value2: 15,
      });
    });

    it("should build career_length filter with BETWEEN when both provided", () => {
      const result = buildPerformerFilter({
        careerLength: { min: 5, max: 15 },
      });
      expect(result.career_length).toEqual({
        modifier: "BETWEEN",
        value: 5,
        value2: 15,
      });
    });
  });

  describe("Range Filters - height (uses convertedFilters)", () => {
    it("should build height filter with BETWEEN when both min and max provided", () => {
      const result = buildPerformerFilter({ height: { min: 160, max: 180 } });
      expect(result.height).toEqual({
        modifier: "BETWEEN",
        value: 160,
        value2: 180,
      });
    });

    it("should build height filter with a lone minimum as BETWEEN when only min provided", () => {
      const result = buildPerformerFilter({ height: { min: 170 } });
      expect(result.height).toEqual({
        modifier: "BETWEEN",
        value: 170,
      });
    });

    it("should build height filter with a lone maximum as BETWEEN when only max provided", () => {
      const result = buildPerformerFilter({ height: { max: 180 } });
      expect(result.height).toEqual({
        modifier: "BETWEEN",
        value2: 180,
      });
    });
  });

  describe("Range Filters - weight (uses convertedFilters)", () => {
    it("should build weight filter with a lone maximum as BETWEEN when only max provided", () => {
      const result = buildPerformerFilter({ weight: { max: 80 } });
      expect(result.weight).toEqual({
        modifier: "BETWEEN",
        value2: 80,
      });
    });

    it("should build weight filter with a lone minimum as BETWEEN when only min provided", () => {
      const result = buildPerformerFilter({ weight: { min: 60 } });
      expect(result.weight).toEqual({
        modifier: "BETWEEN",
        value: 60,
      });
    });
  });

  describe("Range Filters - penisLength (uses convertedFilters)", () => {
    it("should build penis_length filter with a lone maximum as BETWEEN when only max provided", () => {
      const result = buildPerformerFilter({ penisLength: { max: 20 } });
      expect(result.penis_length).toEqual({
        modifier: "BETWEEN",
        value2: 20,
      });
    });

    it("should build penis_length filter with BETWEEN when both provided", () => {
      const result = buildPerformerFilter({
        penisLength: { min: 10, max: 20 },
      });
      expect(result.penis_length).toEqual({
        modifier: "BETWEEN",
        value: 10,
        value2: 20,
      });
    });
  });

  describe("Range Filters - rating100 (conditional assignment pattern)", () => {
    it("should build rating100 with BETWEEN when both min and max provided", () => {
      const result = buildPerformerFilter({ rating: { min: 40, max: 80 } });
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 40,
        value2: 80,
      });
    });

    it("should build rating100 with a lone minimum as BETWEEN when only min provided", () => {
      const result = buildPerformerFilter({ rating: { min: 60 } });
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value: 60,
      });
    });

    it("should build rating100 with a lone maximum as BETWEEN when only max provided", () => {
      const result = buildPerformerFilter({ rating: { max: 80 } });
      expect(result.rating100).toEqual({
        modifier: "BETWEEN",
        value2: 80,
      });
    });
  });

  describe("Range Filters - o_counter (conditional assignment pattern)", () => {
    it("should build o_counter with BETWEEN when both min and max provided", () => {
      const result = buildPerformerFilter({ oCounter: { min: 1, max: 10 } });
      expect(result.o_counter).toEqual({
        modifier: "BETWEEN",
        value: 1,
        value2: 10,
      });
    });

    it("should build o_counter with a lone maximum as BETWEEN when only max provided", () => {
      const result = buildPerformerFilter({ oCounter: { max: 5 } });
      expect(result.o_counter).toEqual({
        modifier: "BETWEEN",
        value2: 5,
      });
    });
  });

  describe("Range Filters - play_count (conditional assignment pattern)", () => {
    it("should build play_count with a lone minimum as BETWEEN when only min provided", () => {
      const result = buildPerformerFilter({ playCount: { min: 10 } });
      expect(result.play_count).toEqual({
        modifier: "BETWEEN",
        value: 10,
      });
    });

    it("should build play_count with a lone maximum as BETWEEN when only max provided", () => {
      const result = buildPerformerFilter({ playCount: { max: 20 } });
      expect(result.play_count).toEqual({
        modifier: "BETWEEN",
        value2: 20,
      });
    });
  });

  describe("Range Filters - scene_count (conditional assignment pattern)", () => {
    it("should build scene_count with BETWEEN when both min and max provided", () => {
      const result = buildPerformerFilter({
        sceneCount: { min: 5, max: 50 },
      });
      expect(result.scene_count).toEqual({
        modifier: "BETWEEN",
        value: 5,
        value2: 50,
      });
    });

    it("should build scene_count with a lone maximum as BETWEEN when only max provided", () => {
      const result = buildPerformerFilter({ sceneCount: { max: 25 } });
      expect(result.scene_count).toEqual({
        modifier: "BETWEEN",
        value2: 25,
      });
    });
  });

  describe("Edge Cases", () => {
    it("should return empty object when no filters provided", () => {
      const result = buildPerformerFilter({});
      expect(result).toEqual({});
    });

    it("should not include age filter when age object is empty", () => {
      const result = buildPerformerFilter({ age: {} });
      expect(result.age).toBeUndefined();
    });

    it("should not include height filter when height object is empty", () => {
      const result = buildPerformerFilter({ height: {} });
      expect(result.height).toBeUndefined();
    });
  });
});

/**
 * The panel's requests follow the shared contract (item 38): what each
 * builder sends is what the server's parser accepts, with the modifier the
 * panel shows. The server walks the same options into SQL
 * (`server/integration/api/filter-contract.integration.test.ts`).
 */
describe("filter requests follow the contract", () => {
  type Build = (state: Record<string, unknown>) => unknown;

  const LISTS: Record<
    ListKind,
    { options: readonly FilterOption[]; build: Build }
  > = {
    scene: { options: SCENE_FILTER_OPTIONS, build: buildSceneFilter },
    performer: {
      options: PERFORMER_FILTER_OPTIONS,
      build: (state) => buildPerformerFilter(state),
    },
    studio: { options: STUDIO_FILTER_OPTIONS, build: buildStudioFilter },
    tag: { options: TAG_FILTER_OPTIONS, build: buildTagFilter },
    group: { options: GROUP_FILTER_OPTIONS, build: buildGroupFilter },
    gallery: { options: GALLERY_FILTER_OPTIONS, build: buildGalleryFilter },
    image: { options: IMAGE_FILTER_OPTIONS, build: buildImageFilter },
    clip: { options: CLIP_FILTER_OPTIONS, build: buildClipFilter },
  };

  const ENTITY_LISTS = LIST_KINDS.filter(
    (kind): kind is EntityKind => kind !== "clip"
  );

  /** Where a list's request carries the field a panel key fills */
  const pathOf = (kind: ListKind, key: string): readonly string[] => {
    const uiKey = must(
      UI_KEYS[kind].find((candidate) => candidate.key === key),
      `${kind} UI key ${key}`
    );
    const fields: Readonly<Record<string, FieldSpec>> = LIST_FIELDS[kind];
    const spec = must(fields[uiKey.field], `${kind} field ${uiKey.field}`);
    return spec.kind === "ref" && spec.path ? spec.path : [uiKey.field];
  };

  const readPath = (value: unknown, path: readonly string[]): unknown =>
    path.reduce<unknown>(
      (at, part) =>
        typeof at === "object" && at !== null
          ? (at as Record<string, unknown>)[part]
          : undefined,
      value
    );

  const optionsOfType = <K extends ListKind>(
    type: string,
    kinds: readonly K[]
  ) =>
    kinds.flatMap((kind) =>
      LISTS[kind].options
        .filter((option) => option.type === type)
        .map((option) => ({ kind, option }))
    );

  const DATE_OPTIONS = optionsOfType("date-range", ENTITY_LISTS).map(
    ({ kind, option }) => ({ kind, key: option.key })
  );

  it.each(DATE_OPTIONS)(
    "an end-only $kind $key range sends a one-sided BETWEEN with value2 and a start-only one with value",
    ({ kind, key }) => {
      const { build } = LISTS[kind];
      const path = pathOf(kind, key);

      expect(readPath(build({ [key]: { end: "2024-12-31" } }), path)).toEqual({
        modifier: "BETWEEN",
        value2: "2024-12-31",
      });
      expect(readPath(build({ [key]: { start: "2020-01-01" } }), path)).toEqual(
        { modifier: "BETWEEN", value: "2020-01-01" }
      );
      expect(
        readPath(
          build({ [key]: { start: "2020-01-01", end: "2024-12-31" } }),
          path
        )
      ).toEqual({
        modifier: "BETWEEN",
        value: "2020-01-01",
        value2: "2024-12-31",
      });
    }
  );

  const MULTI_SELECTS = optionsOfType("searchable-select", LIST_KINDS).filter(
    ({ option }) => option.multi === true
  );

  /** The modifier a multi-select's request carries, and its ids */
  const sentRef = (
    kind: ListKind,
    option: FilterOption,
    state: Record<string, unknown>
  ) => {
    const sent = LISTS[kind].build(state);
    const criterion = readPath(sent, pathOf(kind, option.key));
    return {
      value: readPath(criterion, ["value"]),
      modifier: readPath(criterion, ["modifier"]),
    };
  };

  it.each(MULTI_SELECTS.map(({ kind, option }) => ({ kind, option })))(
    "every multi-select sends its modifier, which is the defaultModifier when untouched: $kind $option.key",
    ({ kind, option }) => {
      // Playlist ids are Peek's own: sent as numbers
      const playlists = option.entityType === "playlists";
      const ids = playlists ? ["10", "11"] : ["10:server-a", "11:server-a"];
      const sentIds = playlists ? [10, 11] : ids;

      expect(sentRef(kind, option, { [option.key]: ids })).toEqual({
        value: sentIds,
        modifier: option.defaultModifier ?? "INCLUDES",
      });
      for (const { value: modifier } of option.modifierOptions ?? []) {
        // Has none and Has any are sent with no ids
        const presence = modifier === "IS_NULL" || modifier === "NOT_NULL";
        expect(
          sentRef(kind, option, {
            [option.key]: ids,
            [must(option.modifierKey, `${option.key} modifierKey`)]: modifier,
          })
        ).toEqual({ value: presence ? undefined : sentIds, modifier });
      }
    }
  );

  it("clip tag, scene tag and performer filters send their modifiers", () => {
    expect(
      buildClipFilter({
        tagIds: ["1:server-a"],
        tagIdsModifier: "EXCLUDES",
        sceneTagIds: ["2:server-a", "3:server-a"],
        sceneTagIdsModifier: "INCLUDES_ALL",
        performerIds: ["4:server-a"],
        performerIdsModifier: "EXCLUDES",
      })
    ).toEqual({
      tags: { value: ["1:server-a"], modifier: "EXCLUDES" },
      scene_tags: {
        value: ["2:server-a", "3:server-a"],
        modifier: "INCLUDES_ALL",
      },
      performers: { value: ["4:server-a"], modifier: "EXCLUDES" },
      is_generated: true,
    });
  });

  it("clips list with a preview until the panel picks otherwise, and All clips sends no is_generated", () => {
    const isGenerated = must(
      CLIP_FILTER_OPTIONS.find((option) => option.key === "isGenerated"),
      "the clip isGenerated option"
    );
    const allClips = must(
      isGenerated.options?.find((choice) => choice.label === "All clips"),
      "the All clips choice"
    );

    expect(buildClipFilter({})).toEqual({ is_generated: true });
    expect(buildClipFilter({ isGenerated: "true" })).toEqual({
      is_generated: true,
    });
    expect(buildClipFilter({ isGenerated: "false" })).toEqual({
      is_generated: false,
    });
    // The panel stores "" as no choice, so All clips needs a value of its own
    expect(allClips.value).not.toBe("");
    expect(buildClipFilter({ isGenerated: allClips.value })).toEqual({});
  });

  it.each([
    ["gallery", GALLERY_FILTER_OPTIONS],
    ["image", IMAGE_FILTER_OPTIONS],
  ] as const)(
    "%s studio options offer Has ANY and Has NONE, then Has none and Has any",
    (_kind, options) => {
      const studios = must(
        options.find((option) => option.key === "studioIds"),
        "the studioIds option"
      );

      expect(studios.modifierOptions).toEqual([
        { value: "INCLUDES", label: "Has ANY of these" },
        { value: "EXCLUDES", label: "Has NONE of these" },
        { value: "IS_NULL", label: "Has none" },
        { value: "NOT_NULL", label: "Has any" },
      ]);
    }
  );

  it("the Scene picker is gone from Tags and Collections, and performers send no scene_filter", () => {
    const keys = (options: readonly FilterOption[]) =>
      options.map((option) => option.key);

    expect(keys(TAG_FILTER_OPTIONS)).not.toContain("sceneId");
    expect(keys(GROUP_FILTER_OPTIONS)).not.toContain("sceneId");
    expect(buildPerformerFilter({ sceneId: "1:server-a" })).toEqual({});
    // The performers' Collections is the performer filter's own `groups`
    expect(buildPerformerFilter({ groupIds: ["2:server-a"] })).toEqual({
      groups: { value: ["2:server-a"], modifier: "INCLUDES" },
    });
  });

  it.each([
    ["gallery", buildGalleryFilter],
    ["image", buildImageFilter],
  ] as const)(
    "the %s folder view's tag reaches the request, with its sub-tags",
    (_kind, build) => {
      const folder = { value: ["5:server-a"], modifier: "INCLUDES", depth: -1 };

      expect(build({ tags: folder }).tags).toEqual(folder);
    }
  );
});
