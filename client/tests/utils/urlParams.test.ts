/**
 * Tests for URL parameter serialization/deserialization
 * Focuses on the singular-to-plural param mapping with instance support
 * for card indicator click navigation.
 */
import { type ReactNode, createElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  DEFAULT_SORT,
  type GetFilterPresetsResponse,
  LIST_KINDS,
  type ListKind,
  PANEL_FIELDS,
  type PanelField,
  SCENE_FIELDS,
} from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  type SavedPreset,
  defaultPresetsQueryOptions,
  presetsQueryOptions,
} from "@/api/hooks/usePresets";
import { useListUrlState } from "@/hooks/useListUrlState";
import {
  IMAGE_FILTER_OPTIONS,
  PERFORMER_FILTER_OPTIONS,
  SCENE_FILTER_OPTIONS,
  buildImageFilter,
  buildPerformerFilter,
  buildSceneFilter,
} from "@/utils/filterConfig";
import {
  CODECS,
  codecOf,
  filterOptionsOf,
  urlKeysOf,
} from "@/utils/filterFields";
import { sortOptionsFor, withoutLockedFilters } from "@/utils/listQuery";
import {
  heightBoundToCm,
  kgToLbs,
  lengthInchesToCm,
  weightBoundToKg,
} from "@/utils/unitConversions";
import {
  LIST_OWNED_KEYS,
  buildSearchParams as _buildSearchParams,
  listOwnedKeys,
  parseSearchParams,
  readListParams,
  writeListParams,
} from "@/utils/urlParams";
import { DETAILS_WITH_PRESENCE_ROW } from "../helpers/editorRows";
import { untrusted } from "../helpers/untrusted";

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
    // Options with no gallery filter (the Scenes page has one since F18)
    const { filters } = parseSearchParams(
      new URLSearchParams("galleryId=12&instance=abc"),
      mockFilterOptions.filter((option) => option.key !== "galleryIds")
    );
    expect(filters).not.toHaveProperty("galleryIds");
    expect(buildSceneFilter(filters)).not.toHaveProperty("galleries");
  });

  it("galleryId on the Scenes page sets its Galleries filter with the instance", () => {
    const { filters } = parseSearchParams(
      new URLSearchParams("galleryId=12&instance=abc"),
      [...SCENE_FILTER_OPTIONS]
    );
    expect(filters.galleryIds).toEqual(["12:abc"]);
    expect(buildSceneFilter(filters).galleries).toEqual({
      value: ["12:abc"],
      modifier: "INCLUDES",
    });
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
    // Scenes' Studios takes a list, so one value is a one-element list
    expect(filters.studioId).toEqual(["3:def"]);
    expect(filters.studioIdDepth).toBe(-1);
    // A single-select Studio keeps one value
    expect(
      parseSearchParams(new URLSearchParams("instance=abc&studioId=3:def"), [
        { key: "studioId", type: "searchable-select", multi: false },
      ]).filters.studioId
    ).toBe("3:def");
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

// ── The URL from the field table (C5) ─────────────────────────────────────

const writeCtx = (entity: ListKind) => ({
  entity,
  filterOptions: filterOptionsOf(entity),
  shown: {
    perPage: 24,
    viewMode: "grid",
    zoomLevel: "medium",
    gridDensity: "medium",
  },
});

/** A list's state through the URL: written, then read back */
function viaUrl(
  entity: ListKind,
  filters: Record<string, unknown>,
  unitPreference = "metric"
) {
  const options = filterOptionsOf(entity, unitPreference);
  const written = writeListParams(
    new URLSearchParams(),
    { filters },
    { ...writeCtx(entity), filterOptions: options }
  );
  return {
    query: written.toString(),
    read: readListParams(written, entity, options).filters,
  };
}

describe("a Resolution condition (FILTERS-23)", () => {
  it("a Resolution condition reaches the URL and back", () => {
    const state = { resolution: "FULL_HD", resolutionModifier: "GREATER_THAN" };

    const { query, read } = viaUrl("scene", state);

    expect(query).toBe("resolution=FULL_HD&resolutionModifier=GREATER_THAN");
    expect(read).toEqual(state);
    expect(buildSceneFilter(read).resolution).toEqual({
      value: "FULL_HD",
      modifier: "GREATER_THAN",
    });
  });

  it("no resolution writes no condition", () => {
    expect(viaUrl("scene", { resolutionModifier: "GREATER_THAN" }).query).toBe(
      "filters=none"
    );
  });
});

describe("body measures are metric in the URL (owner answer 12)", () => {
  it("an imperial Height reaches the URL in centimetres", () => {
    // An imperial viewer enters 5 ft 10 in to 6 ft 2 in: the whole cm range
    // that displays as that
    const min = heightBoundToCm(5, 10, "min");
    const max = heightBoundToCm(6, 2, "max");
    const state = { height: { min: String(min), max: String(max) } };

    const imperial = viaUrl("performer", state, "imperial");

    expect([min, max]).toEqual([177, 189]);
    expect(imperial.query).toBe("height_min=177&height_max=189");
    expect(imperial.read).toEqual(state);
    expect(buildPerformerFilter(imperial.read).height).toEqual({
      modifier: "BETWEEN",
      value: 177,
      value2: 189,
    });
    // A metric viewer opening the link sees 177 to 189 cm
    expect(viaUrl("performer", state, "metric").read).toEqual(state);
  });

  it("an imperial Weight and Penis Length are stored metric", () => {
    // At least 150 lbs: the lowest whole kg that shows as 150
    const kg = weightBoundToKg(150, "min");
    // 6 in, with two decimals
    const cm = lengthInchesToCm(6);

    const weight = viaUrl(
      "performer",
      { weight: { min: String(kg) } },
      "imperial"
    );
    const length = viaUrl(
      "performer",
      { penisLength: { min: String(cm) } },
      "imperial"
    );

    expect(weight.query).toBe("weight_min=68");
    // ...and shows 150 lbs again
    expect(kgToLbs(kg ?? 0)).toBe(150);
    expect(length.query).toBe("penisLength_min=15.24");
    // The request sends the URL's values, unconverted
    expect(buildPerformerFilter(weight.read).weight).toEqual({
      modifier: "BETWEEN",
      value: 68,
    });
  });

  it("the measure reader is lenient through the URL", () => {
    const read = (query: string) =>
      readListParams(
        new URLSearchParams(query),
        "performer",
        PERFORMER_FILTER_OPTIONS
      ).filters;

    expect(read("weight_min=abc")).toEqual({});
    expect(read("weight_min=abc&weight_max=80")).toEqual({
      weight: { max: "80" },
    });
    // Above the editor's bounds: kept, never clamped
    expect(read("height_min=250")).toEqual({ height: { min: "250" } });
    expect(read("height_max=9999")).toEqual({ height: { max: "9999" } });
    // Decimals are kept
    expect(read("height_min=177.8")).toEqual({ height: { min: "177.8" } });
    expect(read("penisLength_max=20.32")).toEqual({
      penisLength: { max: "20.32" },
    });
  });

  it("reads the old feet-and-inches height as centimetres", () => {
    const height = PANEL_FIELDS.performer.find((row) => row.key === "height");
    if (height?.editor !== "number") throw new Error("no height row");

    expect(
      CODECS.number.normalize(height, { feetMin: "5", inchesMin: "10" })
    ).toEqual({ min: 177.8 });
    expect(
      CODECS.number.normalize(height, {
        feetMin: "5",
        inchesMin: "10",
        feetMax: "6",
        inchesMax: "2",
      })
    ).toEqual({ min: 177.8, max: 187.96 });
    // A bound the state holds wins over a stale legacy one
    expect(
      CODECS.number.normalize(height, { min: "170", feetMin: "5" })
    ).toEqual({ min: "170" });
    expect(CODECS.number.normalize(height, { feetMin: "x" })).toBeUndefined();
    // The legacy shape written by a later change reaches the URL as centimetres
    expect(
      viaUrl("performer", { height: { feetMin: "5", inchesMin: "10" } }).query
    ).toBe("height_min=177.8");
    // The same row is active, and builds
    expect(CODECS.number.isActive(height, { height: { feetMin: "5" } })).toBe(
      true
    );
    expect(CODECS.number.isActive(height, { height: { feetMin: "x" } })).toBe(
      false
    );
  });

  /** A list's request through `useListUrlState`, the preset as the default or loaded */
  function renderPerformers(preset: SavedPreset, mode: "default" | "load") {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      presetsQueryOptions.queryKey,
      untrusted<GetFilterPresetsResponse>({
        presets: { performer: [preset] },
      })
    );
    queryClient.setQueryData(defaultPresetsQueryOptions.queryKey, {
      defaults: mode === "default" ? { performer: preset.id } : {},
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MemoryRouter,
          { initialEntries: ["/performers"] },
          children
        )
      );
    const view = renderHook(
      () =>
        useListUrlState({
          entityType: "performer",
          filterOptions: PERFORMER_FILTER_OPTIONS,
          sortOptions: (filters) => sortOptionsFor("performer", filters),
          viewModes: ["grid"],
          defaults: {
            sort: DEFAULT_SORT.performer.field,
            direction: "DESC",
            perPage: 24,
            viewMode: "grid",
            zoomLevel: "medium",
            gridDensity: "medium",
          },
        }),
      { wrapper }
    );
    if (mode === "load") {
      act(() => {
        view.result.current.loadPreset(preset);
      });
    }
    return view.result.current;
  }

  it.each(["default", "load"] as const)(
    "a preset holding the old height shape reads as centimetres, as a %s preset",
    (mode) => {
      const state = renderPerformers(
        untrusted<SavedPreset>({
          id: "p1",
          name: "Tall",
          filters: {
            height: { feetMin: "5", inchesMin: "10" },
            weight: { min: "abc", max: "9999" },
          },
          sort: "name",
          direction: "ASC",
        }),
        mode
      );

      expect(state.filters.height).toEqual(
        mode === "default" ? { min: 177.8 } : { min: "177.8" }
      );
      // Not a number: dropped; far outside the editor's bounds: kept
      expect(state.filters.weight).toEqual({ max: "9999" });
      expect(
        untrusted<{ performer_filter: unknown }>(JSON.parse(state.listKey))
          .performer_filter
      ).toMatchObject({
        height: { modifier: "BETWEEN", value: 177.8 },
        weight: { modifier: "BETWEEN", value2: 9999 },
      });
    }
  );
});

describe("a list owns what its codecs name", () => {
  /** A row's own keys, the singular and the range forms (C5) */
  const expectedKeys = (row: PanelField) => [
    ...new Set([
      ...codecOf(row).keys(row),
      row.key.endsWith("Ids") ? row.key.slice(0, -1) : row.key,
      ...["_min", "_max", "_start", "_end"].map((suffix) => row.key + suffix),
    ]),
  ];

  it.each(LIST_KINDS)(
    "a list owns every companion its codecs name: %s",
    (entity) => {
      const owned = listOwnedKeys(entity);
      for (const row of PANEL_FIELDS[entity] as readonly PanelField[]) {
        expect([...urlKeysOf(row)].sort(), row.key).toEqual(
          expectedKeys(row).sort()
        );
        for (const key of urlKeysOf(row)) {
          expect(owned, `${row.key}: ${key}`).toContain(key);
        }
      }
    }
  );

  it.each(LIST_KINDS)(
    "a locked field drops every key its codec names: %s",
    (entity) => {
      for (const row of PANEL_FIELDS[entity] as readonly PanelField[]) {
        const state = Object.fromEntries(
          codecOf(row)
            .keys(row)
            .map((key) => [key, "x"])
        );
        expect(
          withoutLockedFilters(entity, { ...state, kept: 1 }, [row.field]),
          row.key
        ).toEqual({ kept: 1 });
      }
    }
  );
});

describe("a zero bound survives", () => {
  it("rating: { max: 0 } writes rating_max=0 and reads back", () => {
    const { query, read } = viaUrl("scene", { rating: { max: 0 } });

    expect(query).toBe("rating_max=0");
    expect(read).toEqual({ rating: { max: "0" } });
    expect(buildSceneFilter(read).rating100).toEqual({
      modifier: "BETWEEN",
      value2: 0,
    });
  });

  it("a minimum of 0 writes, a blank or NaN does not", () => {
    expect(viaUrl("scene", { rating: { min: 0, max: "" } }).query).toBe(
      "rating_min=0"
    );
    expect(viaUrl("scene", { rating: { min: Number.NaN } }).query).toBe(
      "filters=none"
    );
  });
});

describe("every companion of a field is written and read, whatever its editor", () => {
  /** A value and a companion sample for a row */
  function sampleOf(row: PanelField): Record<string, unknown> | undefined {
    const companions = {
      ...(row.modifierKey === undefined
        ? {}
        : { [row.modifierKey]: "EXCLUDES" }),
      ...(row.hierarchyKey === undefined ? {} : { [row.hierarchyKey]: -1 }),
    };
    switch (row.editor) {
      case "ref":
        return {
          [row.key]: row.multi ? ["1:inst-a", "2:inst-b"] : "1:inst-a",
          ...companions,
        };
      case "enum": {
        const choice = row.choices[0];
        return choice === undefined
          ? undefined
          : { [row.key]: choice.value, ...companions };
      }
      case "text":
        return { [row.key]: "text", ...companions };
      case "toggle":
        return { [row.key]: true, ...companions };
      case "number":
      case "date":
      case "choice":
        return undefined;
    }
  }

  it.each(LIST_KINDS)("%s", (entity) => {
    const options = filterOptionsOf(entity);
    for (const row of PANEL_FIELDS[entity] as readonly PanelField[]) {
      if (row.modifierKey === undefined && row.hierarchyKey === undefined) {
        continue;
      }
      const sample = sampleOf(row);
      if (sample === undefined) continue;
      const written = writeListParams(
        new URLSearchParams(),
        { filters: sample },
        { ...writeCtx(entity), filterOptions: options }
      );
      expect(
        readListParams(written, entity, options).filters,
        `${row.key}: ${written.toString()}`
      ).toEqual(sample);
    }
  });

  it("the scene list has companions to check", () => {
    const rows = PANEL_FIELDS.scene as readonly PanelField[];
    expect(
      rows.filter((row) => row.modifierKey !== undefined && sampleOf(row))
        .length
    ).toBeGreaterThan(3);
  });
});

describe("include or exclude per value (F22a)", () => {
  it("include and exclude round-trip through the URL", () => {
    const state = {
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES_ALL",
      tagIdsExclude: ["2:b", "3"],
    };

    const { query, read } = viaUrl("scene", state);

    expect(new URLSearchParams(query).get("tagIdsExclude")).toBe("2:b,3");
    expect(read).toEqual(state);
    expect(buildSceneFilter(read).tags).toEqual({
      value: ["1:a"],
      excludes: ["2:b", "3"],
      modifier: "INCLUDES_ALL",
    });
    // Excludes alone keep their key too
    const alone = viaUrl("scene", { tagIdsExclude: ["2:b"] });
    expect(alone.query).toBe("tagIdsExclude=2%3Ab");
    expect(alone.read).toEqual({ tagIdsExclude: ["2:b"] });
  });

  /** The scene list's state at `url`, and the URL it writes */
  function renderScenes(url: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(presetsQueryOptions.queryKey, { presets: {} });
    queryClient.setQueryData(defaultPresetsQueryOptions.queryKey, {
      defaults: {},
    });
    const seen = { search: "" };
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, { initialEntries: [url] }, children)
      );
    const view = renderHook(
      () => {
        seen.search = useLocation().search;
        return useListUrlState({
          entityType: "scene",
          filterOptions: SCENE_FILTER_OPTIONS,
          sortOptions: (filters) => sortOptionsFor("scene", filters),
          viewModes: ["grid"],
          defaults: {
            sort: DEFAULT_SORT.scene.field,
            direction: "DESC",
            perPage: 24,
            viewMode: "grid",
            zoomLevel: "medium",
            gridDensity: "medium",
          },
        });
      },
      { wrapper }
    );
    return {
      state: () => view.result.current,
      params: () => new URLSearchParams(seen.search),
    };
  }

  it("removing the last excluded value, removing the chip and Clear All each drop `tagIdsExclude` from the URL", () => {
    const url = "/scenes?tagIds=1:a&tagIdsExclude=2:b&favorite=true";

    const last = renderScenes(url);
    expect(last.state().filters.tagIdsExclude).toEqual(["2:b"]);
    act(() => {
      last.state().applyFilters({
        ...last.state().filters,
        tagIdsExclude: [],
      });
    });
    expect(last.params().has("tagIdsExclude")).toBe(false);
    expect(last.params().get("tagIds")).toBe("1:a");

    const chip = renderScenes(url);
    act(() => {
      chip.state().removeFilter("tagIds");
    });
    expect(chip.params().has("tagIdsExclude")).toBe(false);
    expect(chip.params().has("tagIds")).toBe(false);
    expect(chip.params().get("favorite")).toBe("true");

    const excludesAlone = renderScenes("/scenes?tagIdsExclude=2:b");
    act(() => {
      excludesAlone.state().removeFilter("tagIds");
    });
    expect(excludesAlone.params().has("tagIdsExclude")).toBe(false);

    const clear = renderScenes(url);
    act(() => {
      clear.state().clearFilters();
    });
    expect(clear.params().has("tagIdsExclude")).toBe(false);
    expect(clear.params().get("filters")).toBe("none");
  });

  /** The scene Tags row offering Has none and Has any, as F18 opts it in */
  const tagsWithPresence = (): PanelField => {
    const row = PANEL_FIELDS.scene.find((each) => each.key === "tagIds");
    if (row?.editor !== "ref") throw new Error("no tags row");
    return { ...row, modifiers: [...row.modifiers, "IS_NULL", "NOT_NULL"] };
  };

  it("Has none writes `tagIdsModifier=IS_NULL` with no ids and reads back", () => {
    const row = tagsWithPresence();
    const codec = codecOf(row);
    const spec = SCENE_FIELDS.tags;
    // Picks left from before the choice are neither written nor sent
    const state = {
      tagIds: ["1:a"],
      tagIdsExclude: ["2:b"],
      tagIdsDepth: -1,
      tagIdsModifier: "IS_NULL",
    };

    const params = new URLSearchParams();
    codec.writeUrl(row, state, params);
    expect(params.toString()).toBe("tagIdsModifier=IS_NULL");
    // With no ids at all, the companion is still written
    const empty = new URLSearchParams();
    codec.writeUrl(row, { tagIdsModifier: "NOT_NULL" }, empty);
    expect(empty.toString()).toBe("tagIdsModifier=NOT_NULL");

    const read = codec.readUrl(row, params);
    expect(read).toEqual({ tagIdsModifier: "IS_NULL" });
    expect(codec.isActive(row, read)).toBe(true);
    expect(codec.toCriterion(row, spec, read)).toEqual({ modifier: "IS_NULL" });
    expect(codec.toCriterion(row, spec, state)).toEqual({
      modifier: "IS_NULL",
    });
    expect(codec.fromCriterion(row, spec, { modifier: "NOT_NULL" })).toEqual({
      tagIdsModifier: "NOT_NULL",
    });
  });

  it("an old URL with only `tagIds` reads as includes", () => {
    const read = readListParams(
      new URLSearchParams("tagIds=1:a,2:b&tagIdsModifier=INCLUDES"),
      "scene",
      SCENE_FILTER_OPTIONS
    ).filters;

    expect(read).toEqual({
      tagIds: ["1:a", "2:b"],
      tagIdsModifier: "INCLUDES",
    });
    expect(buildSceneFilter(read).tags).toEqual({
      value: ["1:a", "2:b"],
      modifier: "INCLUDES",
    });
  });

  it("a stored `tagIdsModifier: EXCLUDES` keeps Has NONE", () => {
    const stored = { tagIds: ["466"], tagIdsModifier: "EXCLUDES" };

    const { query, read } = viaUrl("image", stored);

    expect(query).toBe("tagIds=466&tagIdsModifier=EXCLUDES");
    expect(buildImageFilter(read).tags).toEqual({
      value: ["466"],
      modifier: "EXCLUDES",
    });
    // Under Has NONE every value excludes: an excluded pick joins the list
    expect(
      buildImageFilter({ ...stored, tagIdsExclude: ["5:a"] }).tags
    ).toEqual({ value: ["466", "5:a"], modifier: "EXCLUDES" });
  });
});

describe("the text condition and playlist ids in the URL (F22b)", () => {
  /** The scene table's real row (F18) */
  const rowOf = (key: string): PanelField => {
    const row = (PANEL_FIELDS.scene as readonly PanelField[]).find(
      (each) => each.key === key
    );
    if (row === undefined) throw new Error(`no scene row ${key}`);
    return row;
  };
  /** A row's state through the URL: written by its codec, then read back */
  const throughUrl = (row: PanelField, state: Record<string, unknown>) => {
    const params = new URLSearchParams();
    codecOf(row).writeUrl(row, state, params);
    return {
      query: decodeURIComponent(params.toString()),
      read: codecOf(row).readUrl(row, params),
    };
  };

  it("a text condition round-trips as `<key>Modifier`", () => {
    const state = { path: "/media/new", pathModifier: "STARTS_WITH" };

    const { query, read } = throughUrl(rowOf("path"), state);

    expect(query).toBe("path=/media/new&pathModifier=STARTS_WITH");
    expect(read).toEqual(state);
    // Has none writes the condition alone, and reads back
    expect(
      throughUrl(DETAILS_WITH_PRESENCE_ROW, {
        details: "sunset",
        detailsModifier: "IS_NULL",
      })
    ).toEqual({
      query: "detailsModifier=IS_NULL",
      read: { detailsModifier: "IS_NULL" },
    });
  });

  it('playlist ids round-trip unjoined; `?playlistIds=12&instance=x` reads `["12"]`', () => {
    const state = {
      playlistIds: ["12", "7"],
      playlistIdsModifier: "INCLUDES_ALL",
    };

    const { query, read } = throughUrl(rowOf("playlistIds"), state);

    expect(query).toBe("playlistIds=12,7&playlistIdsModifier=INCLUDES_ALL");
    expect(read).toEqual(state);
    // The page's instance names a Stash server: never joined to a Peek id
    expect(
      codecOf(rowOf("playlistIds")).readUrl(
        rowOf("playlistIds"),
        new URLSearchParams("playlistIds=12&instance=x")
      )
    ).toEqual({ playlistIds: ["12"] });
    expect(
      codecOf(rowOf("playlistIds")).readUrl(
        rowOf("playlistIds"),
        new URLSearchParams("playlistId=12&instance=x")
      )
    ).toEqual({ playlistIds: ["12"] });
    // An option no row stands behind reads the same
    expect(
      parseSearchParams(new URLSearchParams("playlistId=12&instance=x"), [
        {
          key: "playlistIds",
          type: "searchable-select",
          multi: true,
          entityType: "playlists",
        },
      ]).filters
    ).toEqual({ playlistIds: ["12"] });
  });
});
