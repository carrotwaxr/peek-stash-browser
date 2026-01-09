import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "../services/api.js";
import { parseSearchParams, buildSearchParams } from "../utils/urlParams.js";

/**
 * High-level hook for filter state management with URL sync and presets.
 */
export const useFilterState = ({
  artifactType = "scene",
  context,
  initialSort = "o_counter",
  permanentFilters = {},
  filterOptions = [],
  syncToUrl = true,
} = {}) => {
  const effectiveContext = context || artifactType;
  const [searchParams, setSearchParams] = useSearchParams();
  const initializedRef = useRef(false);
  const searchDebounceRef = useRef(null);
  const stateRef = useRef(null); // For capturing current state in debounced callbacks
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoadingPresets, setIsLoadingPresets] = useState(true);

  // State
  const [filters, setFiltersState] = useState({});
  const [sort, setSortState] = useState({ field: initialSort, direction: "DESC" });
  const [pagination, setPaginationState] = useState({ page: 1, perPage: 24 });
  const [searchText, setSearchTextState] = useState("");

  // Initialize on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initialize = async () => {
      try {
        // Check if URL has filter params (not just page/per_page)
        let hasFilterParams = false;
        for (const [key] of searchParams.entries()) {
          if (key !== "page" && key !== "per_page") {
            hasFilterParams = true;
            break;
          }
        }

        // Load presets
        const [presetsRes, defaultsRes] = await Promise.all([
          apiGet("/user/filter-presets"),
          apiGet("/user/default-presets"),
        ]);

        const allPresets = presetsRes?.presets || {};
        const defaults = defaultsRes?.defaults || {};
        const defaultPresetId = defaults[effectiveContext];

        const presetArtifactType = effectiveContext.startsWith("scene_")
          ? "scene"
          : effectiveContext;
        const presets = allPresets[presetArtifactType] || [];
        const defaultPreset = presets.find((p) => p.id === defaultPresetId);

        // Parse URL params
        const urlState = parseSearchParams(searchParams, filterOptions, {
          sortField: initialSort,
          sortDirection: "DESC",
          filters: { ...permanentFilters },
        });

        // Check if URL explicitly has sort params
        const hasUrlSort = searchParams.has("sort");
        const hasUrlDirection = searchParams.has("dir");

        let finalState;

        if (hasFilterParams) {
          // URL has filter params: use URL sort if explicit, otherwise preset SORT, URL filters
          finalState = {
            filters: urlState.filters,
            sortField: hasUrlSort ? urlState.sortField : (defaultPreset?.sort || initialSort),
            sortDirection: hasUrlDirection ? urlState.sortDirection : (defaultPreset?.direction || "DESC"),
            currentPage: urlState.currentPage,
            perPage: urlState.perPage,
            searchText: urlState.searchText,
          };
        } else if (defaultPreset) {
          // No URL params: use full preset
          finalState = {
            filters: { ...permanentFilters, ...defaultPreset.filters },
            sortField: defaultPreset.sort,
            sortDirection: defaultPreset.direction,
            currentPage: 1,
            perPage: urlState.perPage,
            searchText: "",
          };
        } else {
          // No URL params, no preset: use defaults
          finalState = {
            filters: { ...permanentFilters },
            sortField: initialSort,
            sortDirection: "DESC",
            currentPage: 1,
            perPage: urlState.perPage,
            searchText: "",
          };
        }

        // Set state
        setFiltersState(finalState.filters);
        setSortState({ field: finalState.sortField, direction: finalState.sortDirection });
        setPaginationState({ page: finalState.currentPage, perPage: finalState.perPage });
        setSearchTextState(finalState.searchText);

      } catch (err) {
        console.error("Error loading presets:", err);
        // Fallback to URL/defaults
        const urlState = parseSearchParams(searchParams, filterOptions, {
          sortField: initialSort,
          sortDirection: "DESC",
          filters: { ...permanentFilters },
        });
        setFiltersState(urlState.filters);
        setSortState({ field: urlState.sortField, direction: urlState.sortDirection });
        setPaginationState({ page: urlState.currentPage, perPage: urlState.perPage });
        setSearchTextState(urlState.searchText);
      } finally {
        setIsLoadingPresets(false);
        setIsInitialized(true);
      }
    };

    initialize();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup search debounce on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  // Keep stateRef updated with current values for use in debounced callbacks
  useEffect(() => {
    stateRef.current = { filters, sort, pagination, searchText };
  }, [filters, sort, pagination, searchText]);

  // URL sync helper - writes to URL without reading back
  const syncToUrlParams = useCallback((state, options = {}) => {
    if (!syncToUrl || !isInitialized) return;

    const { replace = false } = options;
    const params = buildSearchParams({
      searchText: state.searchText,
      sortField: state.sort.field,
      sortDirection: state.sort.direction,
      currentPage: state.pagination.page,
      perPage: state.pagination.perPage,
      filters: state.filters,
      filterOptions,
    });

    setSearchParams(params, { replace });
  }, [syncToUrl, isInitialized, filterOptions, setSearchParams]);

  // Actions
  const setPage = useCallback((page) => {
    setPaginationState((prev) => ({ ...prev, page }));
    syncToUrlParams({
      filters,
      sort,
      pagination: { ...pagination, page },
      searchText,
    });
  }, [filters, sort, pagination, searchText, syncToUrlParams]);

  const setPerPage = useCallback((perPage) => {
    setPaginationState({ page: 1, perPage });
    syncToUrlParams({
      filters,
      sort,
      pagination: { page: 1, perPage },
      searchText,
    });
  }, [filters, sort, searchText, syncToUrlParams]);

  const setSort = useCallback((field, direction) => {
    const newDirection = direction || (sort.field === field && sort.direction === "DESC" ? "ASC" : "DESC");
    setSortState({ field, direction: newDirection });
    syncToUrlParams({
      filters,
      sort: { field, direction: newDirection },
      pagination,
      searchText,
    });
  }, [filters, sort, pagination, searchText, syncToUrlParams]);

  const setFilter = useCallback((key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFiltersState(newFilters);
    setPaginationState((prev) => ({ ...prev, page: 1 }));
    syncToUrlParams({
      filters: newFilters,
      sort,
      pagination: { ...pagination, page: 1 },
      searchText,
    });
  }, [filters, sort, pagination, searchText, syncToUrlParams]);

  const setFilters = useCallback((newFilters) => {
    setFiltersState(newFilters);
    setPaginationState((prev) => ({ ...prev, page: 1 }));
    syncToUrlParams({
      filters: newFilters,
      sort,
      pagination: { ...pagination, page: 1 },
      searchText,
    });
  }, [sort, pagination, searchText, syncToUrlParams]);

  const removeFilter = useCallback((key) => {
    const newFilters = { ...filters };
    delete newFilters[key];
    // Re-apply permanent filters
    Object.assign(newFilters, permanentFilters);
    setFiltersState(newFilters);
    setPaginationState((prev) => ({ ...prev, page: 1 }));
    syncToUrlParams({
      filters: newFilters,
      sort,
      pagination: { ...pagination, page: 1 },
      searchText,
    });
  }, [filters, permanentFilters, sort, pagination, searchText, syncToUrlParams]);

  const clearFilters = useCallback(() => {
    const newFilters = { ...permanentFilters };
    setFiltersState(newFilters);
    setPaginationState((prev) => ({ ...prev, page: 1 }));
    syncToUrlParams({
      filters: newFilters,
      sort,
      pagination: { ...pagination, page: 1 },
      searchText,
    });
  }, [permanentFilters, sort, pagination, searchText, syncToUrlParams]);

  const setSearchText = useCallback((text) => {
    setSearchTextState(text);
    setPaginationState((prev) => ({ ...prev, page: 1 }));

    // Clear any pending debounce
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Debounce URL update (500ms) to avoid history pollution while typing
    // Uses stateRef to get current values at timeout execution time, avoiding stale closures
    searchDebounceRef.current = setTimeout(() => {
      const current = stateRef.current;
      syncToUrlParams({
        filters: current.filters,
        sort: current.sort,
        pagination: { ...current.pagination, page: 1 },
        searchText: text,
      }, { replace: true });
    }, 500);
  }, [syncToUrlParams]);

  const loadPreset = useCallback((preset) => {
    const newFilters = { ...permanentFilters, ...preset.filters };
    setFiltersState(newFilters);
    setSortState({ field: preset.sort, direction: preset.direction });
    setPaginationState((prev) => ({ ...prev, page: 1 }));
    syncToUrlParams({
      filters: newFilters,
      sort: { field: preset.sort, direction: preset.direction },
      pagination: { ...pagination, page: 1 },
      searchText,
    });
  }, [permanentFilters, pagination, searchText, syncToUrlParams]);

  return {
    filters,
    sort,
    pagination,
    searchText,
    isInitialized,
    isLoadingPresets,
    // Actions
    setFilter,
    setFilters,
    removeFilter,
    clearFilters,
    setSort,
    setPage,
    setPerPage,
    setSearchText,
    loadPreset,
  };
};
