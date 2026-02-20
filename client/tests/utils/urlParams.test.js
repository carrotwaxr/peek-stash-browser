/**
 * Tests for URL parameter serialization/deserialization
 * Focuses on the singular-to-plural param mapping with instance support
 * for card indicator click navigation.
 */
import { describe, it, expect } from "vitest";
import { buildSearchParams, parseSearchParams } from "@/utils/urlParams.js";

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
