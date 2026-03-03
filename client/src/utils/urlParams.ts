/**
 * Utility functions for persisting filter/sort state to URL query parameters
 */
import { makeCompositeKey } from "./compositeKey";
import type { FilterOption } from "./filterConfig";

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

const filtersToUrlParams = (filters: Record<string, unknown>, filterOptions: FilterOption[]) => {
  const params = new URLSearchParams();

  filterOptions.forEach(({ key, type, multi, modifierKey, hierarchyKey }) => {
    const value = filters[key] as unknown;

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
          params.set(key, String(value));
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
            params.set(key, String(value));
          }
        }
        // Serialize modifier if present
        if (modifierKey && filters[modifierKey]) {
          params.set(modifierKey, String(filters[modifierKey]));
        }
        // Serialize hierarchy depth if present
        if (hierarchyKey && filters[hierarchyKey] !== undefined) {
          params.set(hierarchyKey, String(filters[hierarchyKey]));
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
 * Deserialize URL query parameters to filter state
 *
 * @param {URLSearchParams} searchParams - URL search params
 * @param {Array} filterOptions - Filter configuration from filterConfig.js
 * @returns {Object} Filter state object
 */
const urlParamsToFilters = (searchParams: URLSearchParams, filterOptions: FilterOption[]) => {
  const filters: Record<string, unknown> = {};

  // Handle singular entity ID params from card indicator clicks
  // (e.g., /scenes?performerId=82&instance=abc-123 → performerIds: ["82:abc-123"])
  const instanceParam = searchParams.get("instance");
  const singularToPlural: Record<string, string> = {
    performerId: "performerIds",
    studioId: "studioId", // studioId is already the correct key (single-select)
    tagId: "tagIds",
    groupId: "groupIds",
    galleryId: "galleryIds",
  };

  const singularProcessedKeys = new Set<string>();
  for (const [singular, pluralKey] of Object.entries(singularToPlural)) {
    if (searchParams.has(singular)) {
      const rawId = searchParams.get(singular)!;
      const compositeId = makeCompositeKey(rawId, instanceParam);

      // Check if the plural key is multi-select or single-select
      const filterOption = filterOptions.find((opt: FilterOption) => opt.key === pluralKey);
      if (filterOption?.multi) {
        filters[pluralKey] = [compositeId];
      } else {
        filters[pluralKey] = compositeId;
      }
      singularProcessedKeys.add(pluralKey);
    }
  }

  filterOptions.forEach(({ key, type, multi, modifierKey, hierarchyKey }) => {
    // Skip keys already handled by singular-to-plural mapping above
    if (singularProcessedKeys.has(key)) return;

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

      case "searchable-select":
        if (searchParams.has(key)) {
          const value = searchParams.get(key);
          if (multi) {
            // Multi-select: deserialize comma-separated string to array
            // Keep as strings (Stash uses string IDs)
            filters[key] = value!.split(",").filter(Boolean);
          } else {
            // Single select: just set the value
            filters[key] = value;
          }
        }
        // Deserialize modifier if present
        if (modifierKey && searchParams.has(modifierKey)) {
          filters[modifierKey] = searchParams.get(modifierKey);
        }
        // Deserialize hierarchy depth if present
        if (hierarchyKey && searchParams.has(hierarchyKey)) {
          filters[hierarchyKey] = parseInt(searchParams.get(hierarchyKey)!, 10);
        }
        break;

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
  if (perPage !== 24) params.set("per_page", perPage.toString());
  if (viewMode && viewMode !== "grid") params.set("view", viewMode);
  if (zoomLevel && zoomLevel !== "medium") params.set("zoom", zoomLevel);
  if (gridDensity && gridDensity !== "medium") params.set("grid_density", gridDensity);
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
    perPage: parseInt(searchParams.get("per_page") || "24", 10),
    viewMode: searchParams.get("view") || defaults.viewMode || "grid",
    zoomLevel: searchParams.get("zoom") || defaults.zoomLevel || "medium",
    gridDensity: searchParams.get("grid_density") || defaults.gridDensity || "medium",
    timelinePeriod: searchParams.get("timeline_period") || defaults.timelinePeriod || null,
    filters: {
      ...defaults.filters,
      ...urlParamsToFilters(searchParams, filterOptions),
    },
  };
};
