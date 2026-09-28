/**
 * Utility functions for persisting filter/sort state to URL query parameters
 */
import { makeCompositeKey, parseCompositeKey } from "./compositeKey";
import type { FilterOption } from "./filterConfig";

/** The most rows a list page asks for; the server holds `per_page` to it. */
export const PER_PAGE_MAX = 250;
const DEFAULT_PER_PAGE = 24;

/**
 * Reads `per_page` from the URL: above the maximum it becomes the maximum;
 * missing, zero, negative or not a number it becomes the default.
 */
const parsePerPage = (value: string | null): number => {
  const num = parseInt(value ?? "", 10);
  if (isNaN(num) || num < 1) return DEFAULT_PER_PAGE;
  return Math.min(num, PER_PAGE_MAX);
};

interface SearchState {
  searchText: string;
  sortField: string;
  sortDirection: string;
  currentPage: number;
  perPage: number;
  filters: Record<string, unknown>;
  filterOptions: FilterOption[];
  viewMode: string;
  zoomLevel: string;
  gridDensity: string;
  timelinePeriod: string | null;
}

/**
 * Sets a filter value that has a URL form (a string, number or boolean). Any
 * other value would be written as "[object Object]" or "null", so it is left
 * out.
 */
const setParam = (params: URLSearchParams, key: string, value: unknown) => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    params.set(key, String(value));
  }
};

const filtersToUrlParams = (
  filters: Record<string, unknown>,
  filterOptions: FilterOption[]
) => {
  const params = new URLSearchParams();

  filterOptions.forEach(({ key, type, multi, modifierKey, hierarchyKey }) => {
    const value = filters[key];

    if (value === undefined || value === "" || value === false) {
      return; // Skip empty values
    }

    switch (type) {
      case "checkbox":
        if (value === true) {
          params.set(key, "true");
        }
        break;

      case "select":
      case "text":
        if (value) {
          setParam(params, key, value);
        }
        break;

      case "searchable-select":
        if (multi) {
          // Multi-select: serialize array as comma-separated string
          if (Array.isArray(value) && value.length > 0) {
            params.set(key, value.join(","));
          }
        } else {
          // Single select: just set the value
          if (value) {
            setParam(params, key, value);
          }
        }
        // Serialize modifier if present
        if (modifierKey && filters[modifierKey]) {
          setParam(params, modifierKey, filters[modifierKey]);
        }
        // Serialize hierarchy depth if present
        if (hierarchyKey && filters[hierarchyKey] !== undefined) {
          setParam(params, hierarchyKey, filters[hierarchyKey]);
        }
        break;

      case "range": {
        const rangeVal = value as Record<string, string> | null;
        if (rangeVal?.min) params.set(`${key}_min`, rangeVal.min);
        if (rangeVal?.max) params.set(`${key}_max`, rangeVal.max);
        break;
      }

      case "date-range": {
        const dateVal = value as Record<string, string> | null;
        if (dateVal?.start) params.set(`${key}_start`, dateVal.start);
        if (dateVal?.end) params.set(`${key}_end`, dateVal.end);
        break;
      }
    }
  });

  return params;
};

/**
 * The URL param that sets an entity filter to one entity: the option's key in
 * the singular (`tagIds` reads `tagId`; `studioId` and `sceneId` read
 * themselves). With the page's `instance` param it becomes "id:instance".
 * Card counts link to a list with it (`getFilteredListPath`).
 */
export const entityParamFor = (key: string) =>
  key.endsWith("Ids") ? key.slice(0, -1) : key;

/**
 * One entity from a singular param: joined with the page's `instance` param
 * into "id:instance", unless the value names its instance already (a
 * single-select filter's own value on a detail page, whose `instance` is the
 * page's entity).
 */
const entityRefFromParam = (value: string, instance: string | null) =>
  parseCompositeKey(value).instanceId === undefined
    ? makeCompositeKey(value, instance)
    : value;

/**
 * Deserialize URL query parameters to filter state. Only the page's own
 * options are read: a param for a filter the page does not have is ignored.
 *
 * @param {URLSearchParams} searchParams - URL search params
 * @param {Array} filterOptions - Filter configuration from filterConfig.js
 * @returns {Object} Filter state object
 */
const urlParamsToFilters = (
  searchParams: URLSearchParams,
  filterOptions: FilterOption[]
) => {
  const filters: Record<string, unknown> = {};
  const instanceParam = searchParams.get("instance");

  filterOptions.forEach(({ key, type, multi, modifierKey, hierarchyKey }) => {
    switch (type) {
      case "checkbox":
        if (searchParams.has(key)) {
          filters[key] = searchParams.get(key) === "true";
        }
        break;

      case "select":
      case "text":
        if (searchParams.has(key)) {
          filters[key] = searchParams.get(key);
        }
        break;

      case "searchable-select": {
        // A card's count links with one entity and its instance
        // (/scenes?performerId=82&instance=abc-123 → performerIds:
        // ["82:abc-123"]); it wins over the option's own list
        const one = searchParams.get(entityParamFor(key));
        const value = searchParams.get(key);
        if (one) {
          const ref = entityRefFromParam(one, instanceParam);
          filters[key] = multi ? [ref] : ref;
        } else if (value !== null) {
          // A multi-select's value is a comma-separated list of refs, each
          // naming its own instance; a single-select's is one value
          filters[key] = multi ? value.split(",").filter(Boolean) : value;
        }
        const modifier = modifierKey ? searchParams.get(modifierKey) : null;
        if (modifierKey && modifier !== null) {
          filters[modifierKey] = modifier;
        }
        const depth = hierarchyKey ? searchParams.get(hierarchyKey) : null;
        if (hierarchyKey && depth !== null) {
          filters[hierarchyKey] = parseInt(depth, 10);
        }
        break;
      }

      case "range": {
        const min = searchParams.get(`${key}_min`);
        const max = searchParams.get(`${key}_max`);
        if (min || max) {
          const rangeObj: Record<string, string> = {};
          if (min) rangeObj.min = min;
          if (max) rangeObj.max = max;
          filters[key] = rangeObj;
        }
        break;
      }

      case "date-range": {
        const start = searchParams.get(`${key}_start`);
        const end = searchParams.get(`${key}_end`);
        if (start || end) {
          const dateObj: Record<string, string> = {};
          if (start) dateObj.start = start;
          if (end) dateObj.end = end;
          filters[key] = dateObj;
        }
        break;
      }
    }
  });

  return filters;
};

/**
 * Build complete URL search params from all state
 *
 * @param {Object} state - Complete search state
 * @param {string} state.searchText - Search query
 * @param {string} state.sortField - Sort field
 * @param {string} state.sortDirection - Sort direction (ASC/DESC)
 * @param {number} state.currentPage - Current page number
 * @param {number} state.perPage - Items per page
 * @param {Object} state.filters - Filter state object
 * @param {Array} state.filterOptions - Filter configuration
 * @param {string} state.viewMode - View mode (grid/wall)
 * @param {string} state.zoomLevel - Zoom level for wall view
 * @returns {URLSearchParams}
 */
export const buildSearchParams = ({
  searchText,
  sortField,
  sortDirection,
  currentPage,
  perPage,
  filters,
  filterOptions,
  viewMode,
  zoomLevel,
  gridDensity,
  timelinePeriod,
}: SearchState) => {
  const params = filtersToUrlParams(filters, filterOptions);

  if (searchText) params.set("q", searchText);
  if (sortField) params.set("sort", sortField);
  if (sortDirection) params.set("dir", sortDirection);
  if (currentPage > 1) params.set("page", currentPage.toString());
  if (perPage !== DEFAULT_PER_PAGE) params.set("per_page", perPage.toString());
  if (viewMode && viewMode !== "grid") params.set("view", viewMode);
  if (zoomLevel && zoomLevel !== "medium") params.set("zoom", zoomLevel);
  if (gridDensity && gridDensity !== "medium")
    params.set("grid_density", gridDensity);
  if (timelinePeriod) params.set("timeline_period", timelinePeriod);

  return params;
};

/**
 * Parse URL search params to complete search state
 *
 * @param {URLSearchParams} searchParams - URL search params
 * @param {Array} filterOptions - Filter configuration from filterConfig.js
 * @param {Object} defaults - Default values for search state
 * @returns {Object} Complete search state
 */
export const parseSearchParams = (
  searchParams: URLSearchParams,
  filterOptions: FilterOption[],
  defaults: Partial<SearchState> = {}
) => {
  return {
    searchText: searchParams.get("q") || defaults.searchText || "",
    sortField: searchParams.get("sort") || defaults.sortField || "o_counter",
    sortDirection: searchParams.get("dir") || defaults.sortDirection || "DESC",
    currentPage: parseInt(searchParams.get("page") || "1", 10),
    perPage: parsePerPage(searchParams.get("per_page")),
    viewMode: searchParams.get("view") || defaults.viewMode || "grid",
    zoomLevel: searchParams.get("zoom") || defaults.zoomLevel || "medium",
    gridDensity:
      searchParams.get("grid_density") || defaults.gridDensity || "medium",
    timelinePeriod:
      searchParams.get("timeline_period") || defaults.timelinePeriod || null,
    filters: {
      ...defaults.filters,
      ...urlParamsToFilters(searchParams, filterOptions),
    },
  };
};
