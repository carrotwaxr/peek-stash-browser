import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "../services/api.js";
import { parseSearchParams } from "../utils/urlParams.js";

/**
 * High-level hook for filter state management with URL sync and presets.
 */
export const useFilterState = ({
  artifactType = "scene",
  context,
  initialSort = "o_counter",
  permanentFilters = {},
  filterOptions = [],
  // syncToUrl reserved for future use
} = {}) => {
  const effectiveContext = context || artifactType;
  const [searchParams] = useSearchParams();
  const initializedRef = useRef(false);
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

        let finalState;

        if (hasFilterParams) {
          // URL has filter params: use preset SORT only, URL filters
          finalState = {
            filters: urlState.filters,
            sortField: urlState.sortField || defaultPreset?.sort || initialSort,
            sortDirection: urlState.sortDirection || defaultPreset?.direction || "DESC",
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

  return {
    filters,
    sort,
    pagination,
    searchText,
    isInitialized,
    isLoadingPresets,
    // Actions (placeholders for now)
    setFilter: () => {},
    setFilters: () => {},
    removeFilter: () => {},
    clearFilters: () => {},
    setSort: () => {},
    setPage: () => {},
    setPerPage: () => {},
    setSearchText: () => {},
    loadPreset: () => {},
  };
};
