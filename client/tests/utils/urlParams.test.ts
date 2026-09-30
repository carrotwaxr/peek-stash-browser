/**
 * Tests for URL parameter serialization/deserialization
 * Focuses on the singular-to-plural param mapping with instance support
 * for card indicator click navigation.
 */
import { describe, expect, it } from "vitest";
import {
  IMAGE_FILTER_OPTIONS,
  SCENE_FILTER_OPTIONS,
  buildImageFilter,
  buildSceneFilter,
} from "@/utils/filterConfig";
import {
  LIST_OWNED_KEYS,
  buildSearchParams as _buildSearchParams,
  listOwnedKeys,
  parseSearchParams,
  readListParams,
  writeListParams,
} from "@/utils/urlParams";

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
      expect(result.filters.performerIds).toEqual([
        "82:server-1",
        "5:server-2",
      ]);
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

    it("per_page=500 in the URL parses to 250, per_page=0 to 24", () => {
      const parse = (query: string) =>
        parseSearchParams(new URLSearchParams(query), mockFilterOptions)
          .perPage;

      expect(parse("per_page=500")).toBe(250);
      expect(parse("per_page=250")).toBe(250);
      expect(parse("per_page=1")).toBe(1);
      expect(parse("per_page=0")).toBe(24);
      expect(parse("per_page=-5")).toBe(24);
      expect(parse("per_page=abc")).toBe(24);
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

  it("serializes a numeric single-select value", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { studioId: 3 },
      filterOptions: mockFilterOptions,
    });
    expect(params.get("studioId")).toBe("3");
  });

  it("leaves out a single-select value that has no URL form", () => {
    const params = buildSearchParams({
      searchText: "",
      sortField: "",
      sortDirection: "",
      currentPage: 1,
      perPage: 24,
      filters: { studioId: { id: "3" } },
      filterOptions: mockFilterOptions,
    });
    expect(params.has("studioId")).toBe(false);
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
    {
      key: "performerIds",
      type: "searchable-select",
      multi: true,
      modifierKey: "performerIdsModifier",
      hierarchyKey: "performerIdsDepth",
    },
    {
      key: "tagIds",
      type: "searchable-select",
      multi: true,
      modifierKey: "tagIdsModifier",
    },
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
    const params = new URLSearchParams(
      "date_start=2024-01-01&date_end=2024-12-31"
    );
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.date).toEqual({
      start: "2024-01-01",
      end: "2024-12-31",
    });
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
    const params = new URLSearchParams(
      "performerIds=1,2&performerIdsModifier=INCLUDES_ALL"
    );
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

  it("a singular param sets the option's value; its modifier and depth are still read", () => {
    const params = new URLSearchParams(
      "performerId=82&instance=server-1&performerIdsModifier=EXCLUDES&performerIdsDepth=2"
    );
    const result = parseSearchParams(params, extendedFilterOptions);
    expect(result.filters.performerIds).toEqual(["82:server-1"]);
    expect(result.filters.performerIdsModifier).toBe("EXCLUDES");
    expect(result.filters.performerIdsDepth).toBe(2);
  });
});

describe("parseSearchParams - a list page reads only the entity params it declares (FILTERS-11)", () => {
  it("a galleryId param on a page without a galleryIds option is ignored", () => {
    // The Scenes page has no gallery filter
    const { filters } = parseSearchParams(
      new URLSearchParams("galleryId=12&instance=abc"),
      [...SCENE_FILTER_OPTIONS]
    );
    expect(filters).not.toHaveProperty("galleryIds");
    expect(buildSceneFilter(filters)).not.toHaveProperty("galleries");
  });

  it("studioId on the Images page sets its Studios filter, studioIds, with the instance", () => {
    const { filters } = parseSearchParams(
      new URLSearchParams("studioId=3&instance=abc"),
      [...IMAGE_FILTER_OPTIONS]
    );
    expect(filters.studioIds).toEqual(["3:abc"]);
    expect(filters).not.toHaveProperty("studioId");
    expect(buildImageFilter(filters).studios).toEqual({
      value: ["3:abc"],
      modifier: "INCLUDES",
    });
  });

  it("every entity option reads its key in the singular, with the instance", () => {
    const options = [
      { key: "sceneId", type: "searchable-select", multi: false },
      { key: "sceneTagIds", type: "searchable-select", multi: true },
    ];
    const { filters } = parseSearchParams(
      new URLSearchParams("sceneId=5&sceneTagId=9&instance=abc"),
      options
    );
    expect(filters.sceneId).toBe("5:abc");
    expect(filters.sceneTagIds).toEqual(["9:abc"]);
  });

  it("a single-select value that names its instance keeps it beside the page's instance", () => {
    // A detail page's URL: instance is the page's entity, studioId the
    // user's filter, written as "id:instance"
    const { filters } = parseSearchParams(
      new URLSearchParams("instance=abc&studioId=3:def&studioIdDepth=-1"),
      [...SCENE_FILTER_OPTIONS]
    );
    expect(filters.studioId).toBe("3:def");
    expect(filters.studioIdDepth).toBe(-1);
  });

  it("an empty singular param is ignored", () => {
    const { filters } = parseSearchParams(
      new URLSearchParams("tagId=&instance=abc"),
      mockFilterOptions
    );
    expect(filters).not.toHaveProperty("tagIds");
  });

  it("a single-select value is never split on commas", () => {
    const { filters } = parseSearchParams(
      new URLSearchParams("studioId=3,4"),
      mockFilterOptions
    );
    expect(filters.studioId).toBe("3,4");
  });
});

describe("buildSearchParams - additional serialization", () => {
  const extendedFilterOptions = [
    { key: "favorite", type: "checkbox" },
    { key: "rating", type: "range" },
    { key: "date", type: "date-range" },
    { key: "orientation", type: "select" },
    { key: "title", type: "text" },
    {
      key: "performerIds",
      type: "searchable-select",
      multi: true,
      modifierKey: "performerIdsModifier",
      hierarchyKey: "performerIdsDepth",
    },
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
      filters: {
        performerIds: ["1", "2"],
        performerIdsModifier: "INCLUDES_ALL",
      },
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

describe("list-owned keys (useListUrlState)", () => {
  const missing = (keys: readonly string[], wanted: readonly string[]) =>
    wanted.filter((key) => !keys.includes(key));

  it("listOwnedKeys of scene includes tagIds, tagIdsModifier, tagIdsDepth and tagId", () => {
    const keys = listOwnedKeys("scene");
    expect(
      missing(keys, [
        "tagIds",
        "tagIdsModifier",
        "tagIdsDepth",
        "tagId",
        "performerId",
        "rating_min",
        "rating_max",
        "date_start",
        "date_end",
        "q",
        "sort",
        "dir",
        "page",
        "per_page",
        "view",
        "zoom",
        "grid_density",
        "timeline_period",
        "folderPath",
      ])
    ).toEqual([]);
    expect(
      keys.filter((key) =>
        [
          "tab",
          "instance",
          "includeSubTags",
          "includeSubStudios",
          "image",
        ].includes(key)
      )
    ).toEqual([]);
  });

  it("LIST_OWNED_KEYS holds every list's keys", () => {
    expect(
      missing(LIST_OWNED_KEYS, ["studioIds", "galleryId", "sceneTagIds", "q"])
    ).toEqual([]);
    expect(LIST_OWNED_KEYS).not.toContain("tab");
  });

  const ctx = {
    entity: "scene" as const,
    filterOptions: SCENE_FILTER_OPTIONS,
    shown: {
      perPage: 48,
      viewMode: "grid",
      zoomLevel: "medium",
      gridDensity: "medium",
    },
  };

  it("writeListParams leaves keys it does not own", () => {
    const prev = new URLSearchParams(
      "tab=scenes&instance=abc&includeSubTags=true&image=5:abc&favorite=true&rating_min=60&page=3"
    );
    const next = writeListParams(
      prev,
      { filters: { tagIds: ["1:abc"] }, page: 1 },
      ctx
    );
    expect(next.get("tab")).toBe("scenes");
    expect(next.get("instance")).toBe("abc");
    expect(next.get("includeSubTags")).toBe("true");
    expect(next.get("image")).toBe("5:abc");
    expect(next.get("tagIds")).toBe("1:abc");
    expect(next.has("favorite")).toBe(false);
    expect(next.has("rating_min")).toBe(false);
    expect(next.has("page")).toBe(false);
  });

  it("writeListParams writes a presentation key only when it differs from what the page shows without it", () => {
    const prev = new URLSearchParams("per_page=24&view=table");
    const next = writeListParams(
      prev,
      { perPage: 48, viewMode: "wall", gridDensity: "small" },
      ctx
    );
    expect(next.has("per_page")).toBe(false);
    expect(next.get("view")).toBe("wall");
    expect(next.get("grid_density")).toBe("small");
    expect(next.has("zoom")).toBe(false);
  });

  it("readListParams counts the range and date forms and q as filters, and nothing else", () => {
    const read = (query: string) =>
      readListParams(new URLSearchParams(query), "scene", SCENE_FILTER_OPTIONS)
        .hasFilters;
    expect(read("rating_min=60")).toBe(true);
    expect(read("date_start=2020-01-01")).toBe(true);
    expect(read("tagId=5&instance=abc")).toBe(true);
    expect(read("q=beach")).toBe(true);
    expect(
      read("instance=abc&tab=scenes&sort=title&view=wall&per_page=12&page=2")
    ).toBe(false);
  });
});
