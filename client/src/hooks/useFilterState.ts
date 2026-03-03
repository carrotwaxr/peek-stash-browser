import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "../api";
import { parseSearchParams, buildSearchParams } from "../utils/urlParams";

/**
 * High-level hook for filter state management with URL sync and presets.
 */
interface UseFilterStateOptions {
  artifactType?: string;
  context?: string;
  initialSort?: string;
  permanentFilters?: Record<string, any>;
  filterOptions?: any[];
  syncToUrl?: boolean;
  defaultViewMode?: string;
  defaultGridDensity?: string;
  defaultZoomLevel?: string;
}

interface FilterState {
  filters: Record<string, any>;
  sort: { field: string; direction: string };
  pagination: { page: number; perPage: number };
  searchText: string;
  viewMode: string;
  zoomLevel: string;
  gridDensity: string;
  timelinePeriod: string | null;
}

export const useFilterState = ({
  artifactType = "scene",
  context,
  initialSort = "o_counter",
  permanentFilters = {},
  filterOptions = [],
  syncToUrl = true,
  defaultViewMode = "grid",
  defaultGridDensity = "medium",
  defaultZoomLevel = "medium",
}: UseFilterStateOptions = {}) => {
  const effectiveContext = context || artifactType;
  const [searchParams, setSearchParams] = useSearchParams();
  const initializedRef = useRef(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<FilterState | null>(null); // For capturing current state in debounced callbacks
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoadingPresets, setIsLoadingPresets] = useState(true);

  // State
  const [filters, setFiltersState] = useState<Record<string, any>>({});
  const [sort, setSortState] = useState({ field: initialSort, direction: "DESC" });
  const [pagination, setPaginationState] = useState({ page: 1, perPage: 24 });
  const [searchText, setSearchTextState] = useState("");
  const [viewMode, setViewModeState] = useState(defaultViewMode);
  const [zoomLevel, setZoomLevelState] = useState(defaultZoomLevel);
  const [gridDensity, setGridDensityState] = useState(defaultGridDensity);
  const [tableColumns, setTableColumnsState] = useState<any>(null);
  const [timelinePeriod, setTimelinePeriodState] = useState<string | null>(null);

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
          apiGet<{ presets: Record<string, Array<{ id: string; name: string; filters: Record<string, unknown>; sort?: string; direction?: string; perPage?: number; viewMode?: string; zoomLevel?: string; gridDensity?: string; tableColumns?: Record<string, unknown> | null }>> }>("/user/filter-presets"),
          apiGet<{ defaults: Record<string, string> }>("/user/default-presets"),
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

        // Check if URL explicitly has sort/pagination params
        const hasUrlSort = searchParams.has("sort");
        const hasUrlDirection = searchParams.has("dir");
        const hasUrlPerPage = searchParams.has("per_page");

        let finalState;

        if (hasFilterParams) {
          // URL has filter params: use URL sort/perPage if explicit, otherwise preset values, URL filters
          finalState = {
            filters: urlState.filters,
            sortField: hasUrlSort ? urlState.sortField : (defaultPreset?.sort || initialSort),
            sortDirection: hasUrlDirection ? urlState.sortDirection : (defaultPreset?.direction || "DESC"),
            currentPage: urlState.currentPage,
            perPage: hasUrlPerPage ? urlState.perPage : (defaultPreset?.perPage || urlState.perPage),
            searchText: urlState.searchText,
            viewMode: urlState.viewMode,
            zoomLevel: urlState.zoomLevel,
            gridDensity: urlState.gridDensity,
            timelinePeriod: urlState.timelinePeriod,
          };
        } else if (defaultPreset) {
          // No URL filter params: use full preset, but URL per_page takes precedence
          finalState = {
            filters: { ...permanentFilters, ...defaultPreset.filters },
            sortField: defaultPreset.sort,
            sortDirection: defaultPreset.direction,
            currentPage: 1,
            perPage: hasUrlPerPage ? urlState.perPage : (defaultPreset.perPage || urlState.perPage),
            searchText: "",
            viewMode: defaultPreset.viewMode || defaultViewMode,
            zoomLevel: defaultPreset.zoomLevel || defaultZoomLevel,
            gridDensity: defaultPreset.gridDensity || defaultGridDensity,
            timelinePeriod: null,
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
            viewMode: defaultViewMode,
            zoomLevel: defaultZoomLevel,
            gridDensity: defaultGridDensity,
            timelinePeriod: null,
          };
        }

        // Set state
        setFiltersState(finalState.filters);
        setSortState({ field: finalState.sortField ?? initialSort ?? "random", direction: finalState.sortDirection ?? "DESC" });
        setPaginationState({ page: finalState.currentPage, perPage: finalState.perPage });
        setSearchTextState(finalState.searchText);
        setViewModeState(finalState.viewMode as string);
        setZoomLevelState(finalState.zoomLevel as string);
        setGridDensityState(finalState.gridDensity as string);
        setTimelinePeriodState(finalState.timelinePeriod as string | null);

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
        setViewModeState(urlState.viewMode as string);
        setZoomLevelState(urlState.zoomLevel as string);
        setGridDensityState(urlState.gridDensity as string);
        setTimelinePeriodState(urlState.timelinePeriod as string | null);
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
    stateRef.current = { filters, sort, pagination, searchText, viewMode, zoomLevel, gridDensity, timelinePeriod };
  }, [filters, sort, pagination, searchText, viewMode, zoomLevel, gridDensity, timelinePeriod]);

  // URL sync helper - writes to URL without reading back
  // Preserves unknown params (like folderPath) that other components may use
  const syncToUrlParams = useCallback((state: FilterState, options: { replace?: boolean } = {}) => {
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
      viewMode: state.viewMode,
      zoomLevel: state.zoomLevel,
      gridDensity: state.gridDensity,
      timelinePeriod: state.timelinePeriod,
    });

    // Preserve specific params we don't manage (folderPath from FolderView)
    const preserveParams = ["folderPath", "instance"];

    setSearchParams((prev) => {
      // Start with new params
      const merged = new URLSearchParams(params);
      // Copy over preserved params from previous URL
      for (const key of preserveParams) {
        if (prev.has(key) && !merged.has(key)) {
          merged.set(key, prev.get(key) as string);
        }
      }
      return merged;
    }, { replace });
  }, [syncToUrl, isInitialized, filterOptions, setSearchParams]);

  // Actions
  const setPage = useCallback((page: number) => {
    setPaginationState((prev) => ({ ...prev, page }));
    syncToUrlParams({
      filters,
      sort,
      pagination: { ...pagination, page },
      searchText,
      viewMode,
      zoomLevel,
      gridDensity,
      timelinePeriod,
    });
  }, [filters, sort, pagination, searchText, viewMode, zoomLevel, gridDensity, timelinePeriod, syncToUrlParams]);

  const setPerPage = useCallback((perPage: number) => {
    setPaginationState({ page: 1, perPage });
    syncToUrlParams({
      filters,
      sort,
      pagination: { page: 1, perPage },
      searchText,
      viewMode,
      zoomLevel,
      gridDensity,
      timelinePeriod,
    });
  }, [filters, sort, searchText, viewMode, zoomLevel, gridDensity, timelinePeriod, syncToUrlParams]);

  const setSort = useCallback((field: string, direction?: string) => {
    const newDirection = direction || (sort.field === field && sort.direction === "DESC" ? "ASC" : "DESC");
    setSortState({ field, direction: newDirection });
    syncToUrlParams({
      filters,
      sort: { field, direction: newDirection },
      pagination,
      searchText,
      viewMode,
      zoomLevel,
      gridDensity,
      timelinePeriod,
    });
  }, [filters, sort, pagination, searchText, viewMode, zoomLevel, gridDensity, timelinePeriod, syncToUrlParams]);

  const setFilter = useCallback((key: string, value: any) => {
    const newFilters: Record<string, any> = { ...filters, [key]: value };
    setFiltersState(newFilters);
    setPaginationState((prev) => ({ ...prev, page: 1 }));
    syncToUrlParams({
      filters: newFilters,
      sort,
      pagination: { ...pagination, page: 1 },
      searchText,
      viewMode,
      zoomLevel,
      gridDensity,
      timelinePeriod,
    });
  }, [filters, sort, pagination, searchText, viewMode, zoomLevel, gridDensity, timelinePeriod, syncToUrlParams]);

  const setFilters = useCallback((newFilters: Record<string, any>) => {
    setFiltersState(newFilters);
    setPaginationState((prev) => ({ ...prev, page: 1 }));
    syncToUrlParams({
      filters: newFilters,
      sort,
      pagination: { ...pagination, page: 1 },
      searchText,
      viewMode,
      zoomLevel,
      gridDensity,
      timelinePeriod,
    });
  }, [sort, pagination, searchText, viewMode, zoomLevel, gridDensity, timelinePeriod, syncToUrlParams]);

  const removeFilter = useCallback((key: string) => {
    const newFilters: Record<string, any> = { ...filters };
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
      viewMode,
      zoomLevel,
      gridDensity,
      timelinePeriod,
    });
  }, [filters, permanentFilters, sort, pagination, searchText, viewMode, zoomLevel, gridDensity, timelinePeriod, syncToUrlParams]);

  const clearFilters = useCallback(() => {
    const newFilters: Record<string, any> = { ...permanentFilters };
    setFiltersState(newFilters);
    setPaginationState((prev) => ({ ...prev, page: 1 }));
    syncToUrlParams({
      filters: newFilters,
      sort,
      pagination: { ...pagination, page: 1 },
      searchText,
      viewMode,
      zoomLevel,
      gridDensity,
      timelinePeriod,
    });
  }, [permanentFilters, sort, pagination, searchText, viewMode, zoomLevel, gridDensity, timelinePeriod, syncToUrlParams]);

  const setSearchText = useCallback((text: string) => {
    setSearchTextState(text);
    setPaginationState((prev) => ({ ...prev, page: 1 }));

    // Clear any pending debounce
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Debounce URL update (500ms) to avoid history pollution while typing
    // Uses stateRef to get current values at timeout execution time, avoiding stale closures
    searchDebounceRef.current = setTimeout(() => {
      const current = stateRef.current!;
      syncToUrlParams({
        filters: current.filters,
        sort: current.sort,
        pagination: { ...current.pagination, page: 1 },
        searchText: text,
        viewMode: current.viewMode,
        zoomLevel: current.zoomLevel,
        gridDensity: current.gridDensity,
        timelinePeriod: current.timelinePeriod,
      }, { replace: true });
    }, 500);
  }, [syncToUrlParams]);

  const loadPreset = useCallback((preset: any) => {
    const newFilters = { ...permanentFilters, ...preset.filters };
    const newViewMode = preset.viewMode || defaultViewMode;
    const newZoomLevel = preset.zoomLevel || defaultZoomLevel;
    const newGridDensity = preset.gridDensity || defaultGridDensity;
    const newTableColumns = preset.tableColumns || null;
    // Only update perPage if preset has it (null = don't change)
    const newPerPage = preset.perPage || pagination.perPage;
    setFiltersState(newFilters);
    setSortState({ field: preset.sort, direction: preset.direction });
    setPaginationState((prev) => ({ ...prev, page: 1, perPage: newPerPage }));
    setViewModeState(newViewMode);
    setZoomLevelState(newZoomLevel);
    setGridDensityState(newGridDensity);
    setTableColumnsState(newTableColumns);
    // Clear timeline period when loading preset (presets don't include timeline state)
    setTimelinePeriodState(null);
    syncToUrlParams({
      filters: newFilters,
      sort: { field: preset.sort, direction: preset.direction },
      pagination: { ...pagination, page: 1, perPage: newPerPage },
      searchText,
      viewMode: newViewMode,
      zoomLevel: newZoomLevel,
      gridDensity: newGridDensity,
      timelinePeriod: null,
    });
  }, [permanentFilters, pagination, searchText, syncToUrlParams, defaultViewMode, defaultZoomLevel, defaultGridDensity]);

  const setTableColumns = useCallback((columns: any) => {
    setTableColumnsState(columns);
  }, []);

  const setViewMode = useCallback((mode: string) => {
    setViewModeState(mode);
    // Clear timeline period when switching away from timeline view
    const newTimelinePeriod = mode === "timeline" ? timelinePeriod : null;
    if (mode !== "timeline") {
      setTimelinePeriodState(null);
    }
    syncToUrlParams({
      filters,
      sort,
      pagination,
      searchText,
      viewMode: mode,
      zoomLevel,
      gridDensity,
      timelinePeriod: newTimelinePeriod,
    });
  }, [filters, sort, pagination, searchText, zoomLevel, gridDensity, timelinePeriod, syncToUrlParams]);

  const setZoomLevel = useCallback((level: string) => {
    setZoomLevelState(level);
    syncToUrlParams({
      filters,
      sort,
      pagination,
      searchText,
      viewMode,
      zoomLevel: level,
      gridDensity,
      timelinePeriod,
    });
  }, [filters, sort, pagination, searchText, viewMode, gridDensity, timelinePeriod, syncToUrlParams]);

  const setGridDensity = useCallback((density: string) => {
    setGridDensityState(density);
    syncToUrlParams({
      filters,
      sort,
      pagination,
      searchText,
      viewMode,
      zoomLevel,
      gridDensity: density,
      timelinePeriod,
    });
  }, [filters, sort, pagination, searchText, viewMode, zoomLevel, timelinePeriod, syncToUrlParams]);

  const setTimelinePeriod = useCallback((period: string | null) => {
    setTimelinePeriodState(period);
    // Reset to page 1 when timeline period changes
    setPaginationState((prev) => ({ ...prev, page: 1 }));
    // Use replace: true to avoid polluting browser history with every period selection
    syncToUrlParams({
      filters,
      sort,
      pagination: { ...pagination, page: 1 },
      searchText,
      viewMode,
      zoomLevel,
      gridDensity,
      timelinePeriod: period,
    }, { replace: true });
  }, [filters, sort, pagination, searchText, viewMode, zoomLevel, gridDensity, syncToUrlParams]);

  return {
    filters,
    sort,
    pagination,
    searchText,
    viewMode,
    zoomLevel,
    gridDensity,
    tableColumns,
    timelinePeriod,
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
    setViewMode,
    setZoomLevel,
    setGridDensity,
    setTableColumns,
    setTimelinePeriod,
    loadPreset,
  };
};
