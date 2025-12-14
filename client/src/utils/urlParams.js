/**
 * Utility functions for persisting filter/sort state to URL query parameters
 */

/**
 * Serialize filter state to URL query parameters
 *
 * @param {Object} filters - Filter state object
 * @param {Array} filterOptions - Filter configuration from filterConfig.js
 * @returns {URLSearchParams} URL search params object
 */
const filtersToUrlParams = (filters, filterOptions) => {
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
          params.set(key, value);
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
            params.set(key, value);
          }
        }
        // Serialize modifier if present
        if (modifierKey && filters[modifierKey]) {
          params.set(modifierKey, filters[modifierKey]);
        }
        // Serialize hierarchy depth if present
        if (hierarchyKey && filters[hierarchyKey] !== undefined) {
          params.set(hierarchyKey, filters[hierarchyKey].toString());
        }
        break;

      case "range":
        if (value?.min) params.set(`${key}_min`, value.min);
        if (value?.max) params.set(`${key}_max`, value.max);
        break;

      case "date-range":
        if (value?.start) params.set(`${key}_start`, value.start);
        if (value?.end) params.set(`${key}_end`, value.end);
        break;
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
const urlParamsToFilters = (searchParams, filterOptions) => {
  const filters = {};

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

      case "searchable-select":
        if (searchParams.has(key)) {
          const value = searchParams.get(key);
          if (multi) {
            // Multi-select: deserialize comma-separated string to array
            // Keep as strings (Stash uses string IDs)
            filters[key] = value.split(",").filter(Boolean);
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
          filters[hierarchyKey] = parseInt(searchParams.get(hierarchyKey), 10);
        }
        break;

      case "range": {
        const min = searchParams.get(`${key}_min`);
        const max = searchParams.get(`${key}_max`);
        if (min || max) {
          filters[key] = {};
          if (min) filters[key].min = min;
          if (max) filters[key].max = max;
        }
        break;
      }

      case "date-range": {
        const start = searchParams.get(`${key}_start`);
        const end = searchParams.get(`${key}_end`);
        if (start || end) {
          filters[key] = {};
          if (start) filters[key].start = start;
          if (end) filters[key].end = end;
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
}) => {
  const params = filtersToUrlParams(filters, filterOptions);

  if (searchText) params.set("q", searchText);
  if (sortField) params.set("sort", sortField);
  if (sortDirection) params.set("dir", sortDirection);
  if (currentPage > 1) params.set("page", currentPage.toString());
  if (perPage !== 24) params.set("per_page", perPage.toString());

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
  searchParams,
  filterOptions,
  defaults = {}
) => {
  return {
    searchText: searchParams.get("q") || defaults.searchText || "",
    sortField: searchParams.get("sort") || defaults.sortField || "o_counter",
    sortDirection: searchParams.get("dir") || defaults.sortDirection || "DESC",
    currentPage: parseInt(searchParams.get("page") || "1", 10),
    perPage: parseInt(searchParams.get("per_page") || "24", 10),
    filters: {
      ...defaults.filters,
      ...urlParamsToFilters(searchParams, filterOptions),
    },
  };
};
