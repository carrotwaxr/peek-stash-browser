/**
 * Tests for URL parameter serialization/deserialization
 * Focuses on the singular-to-plural param mapping with instance support
 * for card indicator click navigation.
 */
import { describe, it, expect } from "vitest";
import { buildSearchParams as _buildSearchParams, parseSearchParams } from "@/utils/urlParams";

// Wrapper with defaults for optional params to avoid repeating them in every test
const buildSearchParams = (params: Record<string, any>) =>
  _buildSearchParams({
    viewMode: "",
    zoomLevel: "",
    gridDensity: "",
    timelinePeriod: null,
    ...params,
  } as Parameters<typeof _buildSearchParams>[0]);

// Minimal filterOptions for testing - matches the shape from filterConfig.js
const mockFilterOptions = [
  { key: "performerIds", type: "searchable-select", multi: true },
  { key: "tagIds", type: "searchable-select", multi: true },
  { key: "studioId", type: "searchable-select", multi: false },
  { key: "groupIds", type: "searchable-select", multi: true },
  { key: "galleryIds", type: "searchable-select", multi: true },
];

describe("parseSearchParams", () => {
  describe("singular entity params with instance", () => {
    it("maps performerId + instance to performerIds array with composite key", () => {
      const params = new URLSearchParams("performerId=82&instance=server-1");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.filters.performerIds).toEqual(["82:server-1"]);
    });

    it("maps tagId + instance to tagIds array with composite key", () => {
      const params = new URLSearchParams("tagId=5&instance=server-2");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.filters.tagIds).toEqual(["5:server-2"]);
    });

    it("maps studioId + instance to studioId string (single-select)", () => {
      const params = new URLSearchParams("studioId=3&instance=server-1");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.filters.studioId).toBe("3:server-1");
    });

    it("maps groupId + instance to groupIds array with composite key", () => {
      const params = new URLSearchParams("groupId=10&instance=server-1");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.filters.groupIds).toEqual(["10:server-1"]);
    });

    it("maps galleryId + instance to galleryIds array with composite key", () => {
      const params = new URLSearchParams("galleryId=7&instance=abc-123");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.filters.galleryIds).toEqual(["7:abc-123"]);
    });
  });

  describe("singular entity params without instance", () => {
    it("maps performerId without instance to bare ID", () => {
      const params = new URLSearchParams("performerId=82");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.filters.performerIds).toEqual(["82"]);
    });

    it("maps studioId without instance to bare string", () => {
      const params = new URLSearchParams("studioId=3");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.filters.studioId).toBe("3");
    });
  });

  describe("standard filter params (plural keys)", () => {
    it("parses multi-select comma-separated values", () => {
      const params = new URLSearchParams("performerIds=82:server-1,5:server-2");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.filters.performerIds).toEqual(["82:server-1", "5:server-2"]);
    });

    it("parses single-select value", () => {
      const params = new URLSearchParams("studioId=3:server-1");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.filters.studioId).toBe("3:server-1");
    });
  });

  describe("non-filter params", () => {
    it("parses search text", () => {
      const params = new URLSearchParams("q=test");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.searchText).toBe("test");
    });

    it("parses sort and direction", () => {
      const params = new URLSearchParams("sort=date&dir=ASC");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.sortField).toBe("date");
      expect(result.sortDirection).toBe("ASC");
    });

    it("parses page and perPage", () => {
      const params = new URLSearchParams("page=3&per_page=48");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.currentPage).toBe(3);
      expect(result.perPage).toBe(48);
    });

    it("parses view mode", () => {
      const params = new URLSearchParams("view=wall");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.viewMode).toBe("wall");
    });

    it("uses defaults for missing params", () => {
      const params = new URLSearchParams("");
      const result = parseSearchParams(params, mockFilterOptions);
      expect(result.searchText).toBe("");
      expect(result.sortField).toBe("o_counter");
      expect(result.sortDirection).toBe("DESC");
      expect(result.currentPage).toBe(1);
      expect(result.perPage).toBe(24);
      expect(result.viewMode).toBe("grid");
    });
  });
});

describe("buildSearchParams", () => {
  it("serializes composite filter values as comma-separated", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { performerIds: ["82:server-1", "5:server-2"] },
      filterOptions: mockFilterOptions,
    });
    expect(params.get("performerIds")).toBe("82:server-1,5:server-2");
  });

  it("serializes single-select composite value", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { studioId: "3:server-1" },
      filterOptions: mockFilterOptions,
    });
    expect(params.get("studioId")).toBe("3:server-1");
  });

  it("skips empty filters", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { performerIds: [] },
      filterOptions: mockFilterOptions,
    });
    expect(params.has("performerIds")).toBe(false);
  });

  it("only includes non-default view params", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      viewMode: "grid",
      zoomLevel: "medium",
      gridDensity: "medium",
      filters: {},
      filterOptions: mockFilterOptions,
    });
    expect(params.has("view")).toBe(false);
    expect(params.has("zoom")).toBe(false);
    expect(params.has("grid_density")).toBe(false);
  });
});

describe("parseSearchParams - additional filter types", () => {
  const extendedFilterOptions = [
    { key: "performerIds", type: "searchable-select", multi: true, modifierKey: "performerIdsModifier", hierarchyKey: "performerIdsDepth" },
    { key: "tagIds", type: "searchable-select", multi: true, modifierKey: "tagIdsModifier" },
    { key: "studioId", type: "searchable-select", multi: false },
    { key: "groupIds", type: "searchable-select", multi: true },
    { key: "galleryIds", type: "searchable-select", multi: true },
    { key: "favorite", type: "checkbox" },
    { key: "rating", type: "range" },
    { key: "date", type: "date-range" },
    { key: "orientation", type: "select" },
    { key: "title", type: "text" },
  ];

  it("parses checkbox filter as boolean true", () => {
    const params = new URLSearchParams("favorite=true");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.favorite).toBe(true);
  });

  it("parses checkbox filter as boolean false", () => {
    const params = new URLSearchParams("favorite=false");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.favorite).toBe(false);
  });

  it("parses range filter with both min and max", () => {
    const params = new URLSearchParams("rating_min=20&rating_max=80");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.rating).toEqual({ min: "20", max: "80" });
  });

  it("parses range filter with only min", () => {
    const params = new URLSearchParams("rating_min=50");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.rating).toEqual({ min: "50" });
  });

  it("parses range filter with only max", () => {
    const params = new URLSearchParams("rating_max=80");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.rating).toEqual({ max: "80" });
  });

  it("parses date-range filter with both start and end", () => {
    const params = new URLSearchParams("date_start=2024-01-01&date_end=2024-12-31");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.date).toEqual({ start: "2024-01-01", end: "2024-12-31" });
  });

  it("parses date-range filter with only start", () => {
    const params = new URLSearchParams("date_start=2024-06-01");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.date).toEqual({ start: "2024-06-01" });
  });

  it("parses date-range filter with only end", () => {
    const params = new URLSearchParams("date_end=2024-12-31");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.date).toEqual({ end: "2024-12-31" });
  });

  it("parses select filter value", () => {
    const params = new URLSearchParams("orientation=LANDSCAPE");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.orientation).toBe("LANDSCAPE");
  });

  it("parses text filter value", () => {
    const params = new URLSearchParams("title=test+scene");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.title).toBe("test scene");
  });

  it("parses modifier key for searchable-select", () => {
    const params = new URLSearchParams("performerIds=1,2&performerIdsModifier=INCLUDES_ALL");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.performerIds).toEqual(["1", "2"]);
    expect(result.filters.performerIdsModifier).toBe("INCLUDES_ALL");
  });

  it("parses hierarchy key for searchable-select", () => {
    const params = new URLSearchParams("performerIds=1&performerIdsDepth=3");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.performerIds).toEqual(["1"]);
    expect(result.filters.performerIdsDepth).toBe(3);
  });

  it("parses zoom level from URL", () => {
    const params = new URLSearchParams("zoom=large");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.zoomLevel).toBe("large");
  });

  it("parses grid density from URL", () => {
    const params = new URLSearchParams("grid_density=small");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.gridDensity).toBe("small");
  });

  it("parses timeline period from URL", () => {
    const params = new URLSearchParams("timeline_period=2024-01");
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.timelinePeriod).toBe("2024-01");
  });

  it("applies custom defaults when params are missing", () => {
    const params = new URLSearchParams("");
    const defaults = {
      searchText: "default search",
      sortField: "rating",
      sortDirection: "ASC",
      viewMode: "wall",
      zoomLevel: "large",
      gridDensity: "small",
      timelinePeriod: "2024-01",
    };
    const result = parseSearchParams(params, extendedFilterOptions, defaults);
    expect(result.searchText).toBe("default search");
    expect(result.sortField).toBe("rating");
    expect(result.sortDirection).toBe("ASC");
    expect(result.viewMode).toBe("wall");
    expect(result.zoomLevel).toBe("large");
    expect(result.gridDensity).toBe("small");
    expect(result.timelinePeriod).toBe("2024-01");
  });

  it("skips singularProcessedKeys when parsing standard filters", () => {
    // When performerId is present, it processes into performerIds
    // Then the regular performerIds handling (including modifierKey) is skipped
    const params = new URLSearchParams("performerId=82&instance=server-1");
    const result = parseSearchParams(params, extendedFilterOptions);
    // performerIds should come from singular mapping
    expect(result.filters.performerIds).toEqual(["82:server-1"]);
    // modifierKey is skipped because the key was handled by singular-to-plural mapping
    expect(result.filters.performerIdsModifier).toBeUndefined();
  });
});

describe("buildSearchParams - additional serialization", () => {
  const extendedFilterOptions = [
    { key: "favorite", type: "checkbox" },
    { key: "rating", type: "range" },
    { key: "date", type: "date-range" },
    { key: "orientation", type: "select" },
    { key: "title", type: "text" },
    { key: "performerIds", type: "searchable-select", multi: true, modifierKey: "performerIdsModifier", hierarchyKey: "performerIdsDepth" },
  ];

  it("serializes checkbox filter", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { favorite: true },
      filterOptions: extendedFilterOptions,
    });
    expect(params.get("favorite")).toBe("true");
  });

  it("skips false checkbox filter", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { favorite: false },
      filterOptions: extendedFilterOptions,
    });
    expect(params.has("favorite")).toBe(false);
  });

  it("serializes range filter with both min and max", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { rating: { min: "20", max: "80" } },
      filterOptions: extendedFilterOptions,
    });
    expect(params.get("rating_min")).toBe("20");
    expect(params.get("rating_max")).toBe("80");
  });

  it("serializes date-range filter", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { date: { start: "2024-01-01", end: "2024-12-31" } },
      filterOptions: extendedFilterOptions,
    });
    expect(params.get("date_start")).toBe("2024-01-01");
    expect(params.get("date_end")).toBe("2024-12-31");
  });

  it("serializes select filter", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { orientation: "LANDSCAPE" },
      filterOptions: extendedFilterOptions,
    });
    expect(params.get("orientation")).toBe("LANDSCAPE");
  });

  it("serializes text filter", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { title: "test scene" },
      filterOptions: extendedFilterOptions,
    });
    expect(params.get("title")).toBe("test scene");
  });

  it("serializes modifier key for searchable-select", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { performerIds: ["1", "2"], performerIdsModifier: "INCLUDES_ALL" },
      filterOptions: extendedFilterOptions,
    });
    expect(params.get("performerIds")).toBe("1,2");
    expect(params.get("performerIdsModifier")).toBe("INCLUDES_ALL");
  });

  it("serializes hierarchy key for searchable-select", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { performerIds: ["1"], performerIdsDepth: 3 },
      filterOptions: extendedFilterOptions,
    });
    expect(params.get("performerIdsDepth")).toBe("3");
  });

  it("includes non-default view params", () => {
    const params = _buildSearchParams({
      searchText: "test",
      sortField: "rating",
      sortDirection: "ASC",
      currentPage: 3,
      perPage: 48,
      viewMode: "wall",
      zoomLevel: "large",
      gridDensity: "small",
      timelinePeriod: "2024-01",
      filters: {},
      filterOptions: [],
    });
    expect(params.get("q")).toBe("test");
    expect(params.get("sort")).toBe("rating");
    expect(params.get("dir")).toBe("ASC");
    expect(params.get("page")).toBe("3");
    expect(params.get("per_page")).toBe("48");
    expect(params.get("view")).toBe("wall");
    expect(params.get("zoom")).toBe("large");
    expect(params.get("grid_density")).toBe("small");
    expect(params.get("timeline_period")).toBe("2024-01");
  });

  it("skips empty/default values", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { orientation: "" },
      filterOptions: extendedFilterOptions,
    });
    expect(params.has("orientation")).toBe(false);
    expect(params.has("q")).toBe(false);
    expect(params.has("sort")).toBe(false);
    expect(params.has("page")).toBe(false);
    expect(params.has("per_page")).toBe(false);
  });
});

describe("composite key round-tripping", () => {
  it("preserves composite keys through buildSearchParams → parseSearchParams", () => {
    const originalFilters = { tagIds: ["82:inst-1", "15:inst-2"] };

    // Serialize to URL params
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: originalFilters,
      filterOptions: mockFilterOptions,
    });

    // Deserialize back
    const result = parseSearchParams(params, mockFilterOptions);
    expect(result.filters.tagIds).toEqual(["82:inst-1", "15:inst-2"]);
  });

  it("does NOT apply instance param to multi-select tagIds (instance is for parent entity)", () => {
    const params = new URLSearchParams(
      "tagIds=82:tag-inst,15:tag-inst&instance=studio-inst"
    );
    const result = parseSearchParams(params, mockFilterOptions);

    // The instance param should NOT override the instance IDs already embedded in tagIds
    expect(result.filters.tagIds).toEqual(["82:tag-inst", "15:tag-inst"]);
  });

  it("singular tagId gets instance param, multi tagIds do not", () => {
    // Singular: tagId=82&instance=inst-1 → tagIds: ["82:inst-1"]
    const singularParams = new URLSearchParams("tagId=82&instance=inst-1");
    const singularResult = parseSearchParams(singularParams, mockFilterOptions);
    expect(singularResult.filters.tagIds).toEqual(["82:inst-1"]);

    // Multi: tagIds=82,15&instance=inst-1 → tagIds: ["82", "15"] (instance NOT applied)
    const multiParams = new URLSearchParams("tagIds=82,15&instance=inst-1");
    const multiResult = parseSearchParams(multiParams, mockFilterOptions);
    expect(multiResult.filters.tagIds).toEqual(["82", "15"]);
  });
});
