import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LucideArrowDown, LucideArrowUp } from "lucide-react";
import { useTVMode } from "../../hooks/useTVMode.js";
import { useHorizontalNavigation } from "../../hooks/useHorizontalNavigation.js";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { useFilterState } from "../../hooks/useFilterState.js";
import {
  CLIP_FILTER_OPTIONS,
  CLIP_SORT_OPTIONS,
  GALLERY_FILTER_OPTIONS,
  GALLERY_SORT_OPTIONS,
  GROUP_FILTER_OPTIONS,
  GROUP_SORT_OPTIONS,
  IMAGE_FILTER_OPTIONS,
  IMAGE_SORT_OPTIONS,
  PERFORMER_FILTER_OPTIONS,
  PERFORMER_SORT_OPTIONS,
  SCENE_FILTER_OPTIONS,
  SCENE_INDEX_SORT_OPTION,
  SCENE_SORT_OPTIONS,
  SCENE_SORT_OPTIONS_BASE,
  STUDIO_FILTER_OPTIONS,
  STUDIO_SORT_OPTIONS,
  TAG_FILTER_OPTIONS,
  TAG_SORT_OPTIONS,
  buildClipFilter,
  buildGalleryFilter,
  buildGroupFilter,
  buildImageFilter,
  buildPerformerFilter,
  buildSceneFilter,
  buildStudioFilter,
  buildTagFilter,
} from "../../utils/filterConfig";
// Note: parseSearchParams and buildSearchParams now handled by useFilterState hook
import {
  ActiveFilterChips,
  Button,
  ContextSettings,
  FilterControl,
  FilterPanel,
  FilterPresets,
  Pagination,
  SearchInput,
  SortControl,
  ViewModeToggle,
  ZoomSlider,
} from "./index.js";

const buildFilter = (artifactType, filters, unitPreference) => {
  switch (artifactType) {
    case "performer":
      return { performer_filter: buildPerformerFilter(filters, unitPreference) };
    case "studio":
      return { studio_filter: buildStudioFilter(filters) };
    case "tag":
      return { tag_filter: buildTagFilter(filters) };
    case "group":
      return { group_filter: buildGroupFilter(filters) };
    case "gallery":
      return { gallery_filter: buildGalleryFilter(filters) };
    case "image":
      return { image_filter: buildImageFilter(filters) };
    case "clip":
      return { clip_filter: buildClipFilter(filters) };
    case "scene":
    default:
      return { scene_filter: buildSceneFilter(filters) };
  }
};

const getSortOptions = (artifactType) => {
  switch (artifactType) {
    case "performer":
      return PERFORMER_SORT_OPTIONS;
    case "studio":
      return STUDIO_SORT_OPTIONS;
    case "tag":
      return TAG_SORT_OPTIONS;
    case "group":
      return GROUP_SORT_OPTIONS;
    case "gallery":
      return GALLERY_SORT_OPTIONS;
    case "image":
      return IMAGE_SORT_OPTIONS;
    case "clip":
      return CLIP_SORT_OPTIONS;
    case "scene":
    default:
      return SCENE_SORT_OPTIONS;
  }
};

const SearchControls = ({
  artifactType = "scene",
  context, // Optional context override (e.g., "scene_performer", "scene_tag")
  children,
  initialSort = "o_counter",
  onQueryChange,
  onPerPageStateChange, // Callback to notify parent of perPage state changes (fixes stale URL param bug)
  paginationHandlerRef, // Optional ref to expose handlePageChange for TV mode
  permanentFilters = {},
  permanentFiltersMetadata = {},
  totalPages,
  totalCount,
  syncToUrl = true,
  // View mode props
  supportsWallView = false,
  viewModes, // Array of mode configs for ViewModeToggle (optional, overrides supportsWallView)
  onViewModeChange, // Callback when view mode changes (optional)
  wallPlayback = "autoplay",
  onWallPlaybackChange, // Callback when wall playback setting changes
  // Table view props
  currentTableColumns = null, // Current table columns config for saving to presets
  tableColumnsPopover = null, // ColumnConfigPopover component to render in toolbar
  // Context settings - config array for the settings cog
  contextSettings = [], // Array of setting configs: [{key, label, type, options}]
  // Timeline view props
  deferInitialQueryUntilFiltersReady = false, // When true, wait for permanentFilters to be non-empty before initial query
  // TV Mode props
  tvSearchZoneActive = false,
  tvTopPaginationZoneActive = false,
  tvBottomPaginationZoneActive = false,
}) => {
  // Use context if provided, otherwise fall back to artifactType
  const effectiveContext = context || artifactType;
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [highlightedFilterKey, setHighlightedFilterKey] = useState(null);
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
  const topPaginationRef = useRef(null); // Ref for top pagination element
  const filterRefs = useRef({}); // Refs for filter controls (for scroll-to-highlight)
  const randomSeedRef = useRef(-1); // Random seed for stable pagination (-1 = uninitialized)

  // TV Mode
  const { isTVMode } = useTVMode();

  // Unit preference for filter conversions
  const { unitPreference } = useUnitPreference();

  // Get default view mode and density settings from card display settings
  const { getSettings } = useCardDisplaySettings();
  const entitySettings = getSettings(artifactType);
  const defaultViewMode = entitySettings.defaultViewMode || "grid";
  const defaultGridDensity = entitySettings.defaultGridDensity || "medium";
  const defaultZoomLevel = entitySettings.defaultWallZoom || "medium";

  // Search zone items: SearchInput, SortControl, SortDirection, Filters, FilterPresets, ViewMode, Zoom, ContextSettings
  const searchZoneItems = useMemo(() => [
    { id: "search-input", name: "Search" },
    { id: "sort-control", name: "Sort" },
    { id: "sort-direction", name: "Direction" },
    { id: "filters-button", name: "Filters" },
    { id: "filter-presets", name: "Presets" },
    { id: "view-mode", name: "View" },
    { id: "zoom-level", name: "Zoom" },
    { id: "context-settings", name: "Settings" },
  ], []);

  // Horizontal navigation for search zone
  const searchZoneNav = useHorizontalNavigation({
    items: searchZoneItems,
    enabled: isTVMode && tvSearchZoneActive,
    onSelect: (item) => {
      // Trigger click on the focused element
      const element = document.querySelector(`[data-tv-search-item="${item.id}"]`);
      if (element) {
        element.click();
        // For search input, focus it
        if (item.id === "search-input") {
          const input = element.querySelector("input");
          if (input) input.focus();
        }
      }
    },
    onEscapeUp: () => {
      // Let parent handle zone transition
      window.dispatchEvent(new CustomEvent("tvSearchZoneEscape", { detail: { direction: "up" } }));
    },
    onEscapeDown: () => {
      window.dispatchEvent(new CustomEvent("tvSearchZoneEscape", { detail: { direction: "down" } }));
    },
  });

  // Get filter options for this artifact type
  const filterOptions = useMemo(() => {
    // Transform filter options based on unit preference
    const transformForUnits = (options) => {
      if (unitPreference !== "imperial") return options;
      return options.map((opt) => {
        // Transform height filter for imperial
        if (opt.key === "height") {
          return {
            ...opt,
            label: "Height (ft/in)",
            type: "imperial-height-range",
            // Store in separate keys that buildPerformerFilter will convert
          };
        }
        // Transform weight filter for imperial
        if (opt.key === "weight") {
          return {
            ...opt,
            label: "Weight (lbs)",
            min: 50,
            max: 500,
          };
        }
        // Transform penisLength filter for imperial
        if (opt.key === "penisLength") {
          return {
            ...opt,
            label: "Penis Length (inches)",
            min: 1,
            max: 15,
          };
        }
        return opt;
      });
    };

    switch (artifactType) {
      case "performer":
        return transformForUnits([...PERFORMER_FILTER_OPTIONS]);
      case "studio":
        return [...STUDIO_FILTER_OPTIONS];
      case "tag":
        return [...TAG_FILTER_OPTIONS];
      case "group":
        return [...GROUP_FILTER_OPTIONS];
      case "gallery":
        return [...GALLERY_FILTER_OPTIONS];
      case "image":
        return [...IMAGE_FILTER_OPTIONS];
      case "clip":
        return [...CLIP_FILTER_OPTIONS];
      case "scene":
      default:
        return [...SCENE_FILTER_OPTIONS];
    }
  }, [artifactType, unitPreference]);

  // Track collapsed state for each filter section
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const initial = {};
    filterOptions.forEach((opt) => {
      if (opt.type === "section-header" && opt.collapsible) {
        initial[opt.key] = !opt.defaultOpen;
      }
    });
    return initial;
  });

  // Use the centralized filter state hook for URL sync and preset loading
  const {
    filters,
    sort,
    pagination,
    searchText,
    viewMode,
    zoomLevel,
    isInitialized,
    isLoadingPresets,
    setFilters: setFiltersAction,
    removeFilter: removeFilterAction,
    clearFilters: clearFiltersAction,
    setSort: setSortAction,
    setPage,
    setPerPage: setPerPageAction,
    setSearchText: setSearchTextAction,
    setViewMode,
    setZoomLevel,
    gridDensity,
    setGridDensity,
    loadPreset,
    timelinePeriod,
    setTimelinePeriod,
  } = useFilterState({
    artifactType,
    context: effectiveContext,
    initialSort,
    permanentFilters,
    filterOptions,
    syncToUrl,
    defaultViewMode,
    defaultGridDensity,
    defaultZoomLevel,
  });

  // Extract values for compatibility with existing code
  const currentPage = pagination.page;
  const perPage = pagination.perPage;
  const sortField = sort.field;
  const sortDirection = sort.direction;

  // Notify parent of perPage state changes (fixes stale URL param bug)
  useEffect(() => {
    if (onPerPageStateChange) {
      onPerPageStateChange(perPage);
    }
  }, [perPage, onPerPageStateChange]);

  // Notify parent of view mode changes
  useEffect(() => {
    if (onViewModeChange) {
      onViewModeChange(viewMode);
    }
  }, [viewMode, onViewModeChange]);

  // Local filters state for filter panel editing (before submit)
  const [localFilters, setLocalFilters] = useState(filters);

  // Sync local filters when hook filters change (e.g., from preset load)
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  // Get sort value with embedded random seed when needed
  // Uses ref so seed persists across renders without causing re-renders
  const getSortWithSeed = useCallback((sort) => {
    // Normalize: treat both "random" and "random_*" as random sort
    // (latter can happen if saved in preset, though we try to avoid it)
    const isRandomSort = sort === 'random' || sort.startsWith('random_');

    if (isRandomSort) {
      if (randomSeedRef.current === -1) {
        // Generate new 8-digit seed on first call
        randomSeedRef.current = Math.floor(Math.random() * 1e8);
      }
      return `random_${randomSeedRef.current}`;
    }
    return sort;
  }, []);

  // Reset random seed (call when changing sort type or loading presets)
  const resetRandomSeed = useCallback(() => {
    randomSeedRef.current = -1;
  }, []);

  // Track if we've triggered the initial query
  const hasTriggeredInitialQuery = useRef(false);

  // Check if permanentFilters are ready (non-empty when deferring is enabled)
  const permanentFiltersReady = !deferInitialQueryUntilFiltersReady ||
    Object.keys(permanentFilters).length > 0;

  // Trigger initial query when hook is initialized and filters are ready
  useEffect(() => {
    if (!isInitialized || hasTriggeredInitialQuery.current || !permanentFiltersReady) return;
    hasTriggeredInitialQuery.current = true;

    // Include permanent filters in initial query
    const mergedFilters = { ...filters, ...permanentFilters };

    const query = {
      filter: {
        direction: sortDirection,
        page: currentPage,
        per_page: perPage,
        q: searchText,
        sort: getSortWithSeed(sortField),
      },
      ...buildFilter(artifactType, mergedFilters, unitPreference),
    };
    onQueryChange(query);
  }, [isInitialized, permanentFiltersReady, sortDirection, currentPage, perPage, searchText, sortField, filters, permanentFilters, artifactType, unitPreference, onQueryChange, getSortWithSeed]);

  // Track previous permanentFilters to detect changes
  const prevPermanentFiltersRef = useRef(permanentFilters);

  // Re-trigger query when permanentFilters change (e.g., timeline date filter)
  useEffect(() => {
    // Skip if not initialized or if initial query hasn't fired yet
    if (!isInitialized || !hasTriggeredInitialQuery.current) return;

    // Check if permanentFilters actually changed
    const prev = prevPermanentFiltersRef.current;
    const changed = JSON.stringify(prev) !== JSON.stringify(permanentFilters);

    if (changed) {
      prevPermanentFiltersRef.current = permanentFilters;

      // Merge new permanent filters with current filters
      const mergedFilters = { ...filters, ...permanentFilters };

      const query = {
        filter: {
          direction: sortDirection,
          page: 1, // Reset to first page when filters change
          per_page: perPage,
          q: searchText,
          sort: getSortWithSeed(sortField),
        },
        ...buildFilter(artifactType, mergedFilters, unitPreference),
      };
      onQueryChange(query);
    }
  }, [isInitialized, permanentFilters, filters, sortDirection, perPage, searchText, sortField, artifactType, unitPreference, onQueryChange, getSortWithSeed]);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    clearFiltersAction(); // Hook handles URL sync and resets to page 1
    setLocalFilters({ ...permanentFilters });
    setIsFilterPanelOpen(false);

    const query = {
      filter: {
        direction: sortDirection,
        page: 1,
        per_page: perPage,
        q: searchText,
        sort: getSortWithSeed(sortField),
      },
      ...buildFilter(artifactType, { ...permanentFilters }, unitPreference),
    };

    onQueryChange(query);
  }, [clearFiltersAction, permanentFilters, sortDirection, perPage, searchText, sortField, artifactType, unitPreference, onQueryChange, getSortWithSeed]);

  // Handle filter change in panel (editing before submit)
  const handleFilterChange = useCallback((filterKey, value) => {
    setLocalFilters((prev) => ({
      ...prev,
      [filterKey]: value === "" ? undefined : value,
    }));
  }, []);

  // Handle filter submission - applies local filters to hook state and closes panel
  const handleFilterSubmit = useCallback(() => {
    setFiltersAction(localFilters); // Hook handles URL sync and resets to page 1
    setIsFilterPanelOpen(false);

    // Trigger search with new filters
    const query = {
      filter: {
        direction: sortDirection,
        page: 1,
        per_page: perPage,
        q: searchText,
        sort: getSortWithSeed(sortField),
      },
      ...buildFilter(artifactType, localFilters, unitPreference),
    };

    onQueryChange(query);
  }, [setFiltersAction, localFilters, sortDirection, perPage, searchText, sortField, artifactType, unitPreference, onQueryChange, getSortWithSeed]);

  // Handle removing a single filter chip
  const handleRemoveFilter = useCallback(
    (filterKey) => {
      removeFilterAction(filterKey); // Hook handles URL sync and resets to page 1

      // Calculate updated filters for query
      const newFilters = { ...filters };
      delete newFilters[filterKey];
      const updatedFilters = { ...newFilters, ...permanentFilters };

      // Trigger search with updated filters
      const query = {
        filter: {
          direction: sortDirection,
          page: 1,
          per_page: perPage,
          q: searchText,
          sort: getSortWithSeed(sortField),
        },
        ...buildFilter(artifactType, updatedFilters, unitPreference),
      };

      onQueryChange(query);
    },
    [
      removeFilterAction,
      filters,
      permanentFilters,
      sortDirection,
      perPage,
      searchText,
      sortField,
      artifactType,
      onQueryChange,
      unitPreference,
      getSortWithSeed,
    ]
  );

  // Handle clicking on a filter chip to highlight that filter
  const handleFilterChipClick = useCallback(
    (filterKey) => {
      // Open filter panel if not already open
      setIsFilterPanelOpen(true);

      // Find which section this filter belongs to
      let sectionKey = null;
      for (let i = 0; i < filterOptions.length; i++) {
        if (filterOptions[i].type === "section-header") {
          sectionKey = filterOptions[i].key;
        } else if (filterOptions[i].key === filterKey) {
          break;
        }
      }

      // Expand the section if it's collapsed
      if (sectionKey && collapsedSections[sectionKey]) {
        setCollapsedSections((prev) => ({
          ...prev,
          [sectionKey]: false,
        }));
      }

      // Set the highlighted filter key (triggers scroll and animation)
      setHighlightedFilterKey(filterKey);
    },
    [filterOptions, collapsedSections]
  );

  // Clear highlight after animation completes
  useEffect(() => {
    if (highlightedFilterKey) {
      const timer = setTimeout(() => {
        setHighlightedFilterKey(null);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [highlightedFilterKey]);

  // Handle loading a saved preset
  const handleLoadPreset = useCallback(
    (preset) => {
      loadPreset(preset); // Hook handles URL sync and state updates

      // Reset random seed when loading preset (like Stash does)
      // This ensures fresh randomization each time a preset is loaded
      resetRandomSeed();

      // Trigger search with preset values
      const query = {
        filter: {
          direction: preset.direction,
          page: 1,
          per_page: perPage,
          q: searchText,
          sort: getSortWithSeed(preset.sort),
        },
        ...buildFilter(artifactType, {
          ...permanentFilters,
          ...preset.filters,
        }, unitPreference),
      };

      onQueryChange(query);
    },
    [loadPreset, permanentFilters, perPage, searchText, artifactType, onQueryChange, unitPreference, getSortWithSeed, resetRandomSeed]
  );

  const handlePageChange = useCallback((page) => {
    setPage(page); // Hook handles URL sync

    // Merge user filters with permanent filters (e.g., folder tag filter)
    const mergedFilters = { ...permanentFilters, ...filters };

    // Trigger search with new page
    const query = {
      filter: {
        direction: sortDirection,
        page,
        per_page: perPage,
        q: searchText,
        sort: getSortWithSeed(sortField),
      },
      ...buildFilter(artifactType, mergedFilters, unitPreference),
    };

    onQueryChange(query);

    // Scroll to top pagination if it's not in view
    setTimeout(() => {
      if (topPaginationRef.current) {
        const rect = topPaginationRef.current.getBoundingClientRect();
        const isInView = rect.top >= 0 && rect.bottom <= window.innerHeight;

        // Only scroll if not already in view
        if (!isInView) {
          topPaginationRef.current.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }
    }, 50);
  }, [setPage, sortDirection, perPage, searchText, sortField, filters, permanentFilters, artifactType, unitPreference, onQueryChange, getSortWithSeed]);

  // Expose pagination handler to parent via ref (for TV mode PageUp/PageDown)
  useEffect(() => {
    if (paginationHandlerRef) {
      paginationHandlerRef.current = handlePageChange;
    }
  }, [paginationHandlerRef, handlePageChange]);

  const handleChangeSearchText = useCallback((searchStr) => {
    if (searchStr === searchText) return; // No change
    setSearchTextAction(searchStr); // Hook handles URL sync and resets to page 1

    // Trigger search with new text
    const query = {
      filter: {
        direction: sortDirection,
        page: 1,
        per_page: perPage,
        q: searchStr,
        sort: getSortWithSeed(sortField),
      },
      ...buildFilter(artifactType, filters, unitPreference),
    };

    onQueryChange(query);
  }, [searchText, setSearchTextAction, sortDirection, perPage, sortField, filters, artifactType, unitPreference, onQueryChange, getSortWithSeed]);

  // Handle sort change
  const handleSortChange = useCallback((field) => {
    let newSortDirection = "DESC";
    let newSortField = sortField;

    // If same field, toggle direction (keep same seed for random)
    if (field === sortField) {
      newSortDirection = sortDirection === "ASC" ? "DESC" : "ASC";
    } else {
      // New field, default to DESC
      newSortField = field;

      // Reset random seed when changing TO or FROM random sort
      // This ensures fresh randomization when switching sort types
      if (field === 'random' || sortField === 'random') {
        resetRandomSeed();
      }
    }
    setSortAction(newSortField, newSortDirection); // Hook handles URL sync

    // Trigger search with new sort
    const query = {
      filter: {
        direction: newSortDirection,
        page: currentPage,
        per_page: perPage,
        q: searchText,
        sort: getSortWithSeed(newSortField),
      },
      ...buildFilter(artifactType, filters, unitPreference),
    };

    onQueryChange(query);
  }, [sortField, sortDirection, setSortAction, resetRandomSeed, currentPage, perPage, searchText, filters, artifactType, unitPreference, onQueryChange, getSortWithSeed]);

  const handleToggleFilterPanel = useCallback(() => {
    setIsFilterPanelOpen((prev) => !prev);
  }, []);

  const handlePerPageChange = useCallback((newPerPage) => {
    setPerPageAction(newPerPage); // Hook handles URL sync and resets to page 1

    // Trigger search with new per page value
    const query = {
      filter: {
        direction: sortDirection,
        page: 1,
        per_page: newPerPage,
        q: searchText,
        sort: getSortWithSeed(sortField),
      },
      ...buildFilter(artifactType, filters, unitPreference),
    };

    onQueryChange(query);
  }, [setPerPageAction, sortDirection, searchText, sortField, filters, artifactType, unitPreference, onQueryChange, getSortWithSeed]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some(
      (value) =>
        value !== undefined &&
        value !== "" &&
        (typeof value !== "object" ||
          Object.values(value).some((v) => v !== "" && v !== undefined))
    );
  }, [filters]);

  const sortOptions = useMemo(() => {
    const baseOptions = getSortOptions(artifactType);
    
    // For scenes, conditionally include scene_index based on group filter
    if (artifactType === "scene") {
      const hasGroupFilter = filters?.groups?.length > 0;
      if (hasGroupFilter) {
        return SCENE_SORT_OPTIONS; // Full list with scene_index
      }
      return SCENE_SORT_OPTIONS_BASE; // Without scene_index
    }
    
    return baseOptions;
  }, [artifactType, filters?.groups]);

  // Show loading state while fetching default presets
  if (isLoadingPresets) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div
            className="inline-block animate-spin rounded-full h-8 w-8 border-b-2"
            style={{ borderColor: "var(--accent-primary)" }}
          />
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Loading filters...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Collapsible Search Controls Container */}
      <div
        className="rounded-lg mb-4"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:opacity-80 transition-opacity"
          style={{
            borderBottom: isControlsCollapsed ? "none" : "1px solid var(--border-color)",
          }}
          onClick={() => setIsControlsCollapsed(!isControlsCollapsed)}
        >
          <h3
            className="font-semibold text-sm uppercase tracking-wide"
            style={{ color: "var(--text-primary)" }}
          >
            Search &amp; Filter
          </h3>
          <span style={{ color: "var(--text-secondary)" }}>
            {isControlsCollapsed ? "▶" : "▼"}
          </span>
        </div>

        {/* Collapsible controls content */}
        {!isControlsCollapsed && (
          <div className="p-3">
            {/* Row 1: Search, Sort, Filters - "What to show" */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-center gap-3 mb-3">
        {/* Search Input - Flexible width with min-width */}
        <div
          data-tv-search-item="search-input"
          ref={(el) => searchZoneNav.setItemRef(0, el)}
          className={`w-full sm:flex-1 sm:min-w-[180px] sm:max-w-sm ${
            searchZoneNav.isFocused(0) ? "keyboard-focus" : ""
          }`}
        >
          <SearchInput
            placeholder="Search..."
            value={searchText}
            onSearch={handleChangeSearchText}
            className="w-full"
          />
        </div>

        {/* Sort, Filter */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:flex-nowrap">
          {/* Sort Control - No label, just dropdown + direction button */}
          <div className="flex items-center gap-1">
            <div
              data-tv-search-item="sort-control"
              ref={(el) => searchZoneNav.setItemRef(1, el)}
              className={searchZoneNav.isFocused(1) ? "keyboard-focus" : ""}
            >
              <SortControl
                options={sortOptions}
                value={sortField}
                onChange={handleSortChange}
              />
            </div>
            <div
              data-tv-search-item="sort-direction"
              ref={(el) => searchZoneNav.setItemRef(2, el)}
              className={searchZoneNav.isFocused(2) ? "keyboard-focus" : ""}
            >
              <Button
                onClick={() => handleSortChange(sortField)}
                variant="secondary"
                size="sm"
                className="py-1"
                icon={
                  sortDirection === "ASC" ? (
                    <LucideArrowUp size={22} />
                  ) : (
                    <LucideArrowDown size={22} />
                  )
                }
              />
            </div>
          </div>

          {/* Filters Toggle Button */}
          <div
            data-tv-search-item="filters-button"
            ref={(el) => searchZoneNav.setItemRef(3, el)}
            className={searchZoneNav.isFocused(3) ? "keyboard-focus" : ""}
          >
            <Button
              onClick={handleToggleFilterPanel}
              variant={isFilterPanelOpen ? "primary" : "secondary"}
              size="sm"
              className="flex items-center space-x-2 font-medium"
              icon={
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
                    clipRule="evenodd"
                  />
                </svg>
              }
            >
              <span>Filters</span>
              {hasActiveFilters && !isFilterPanelOpen && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full ml-1"
                  style={{
                    backgroundColor: "var(--accent-secondary)",
                    color: "white",
                  }}
                >
                  {
                    Object.keys(filters).filter(
                      (key) =>
                        filters[key] !== undefined &&
                        filters[key] !== "" &&
                        (typeof filters[key] !== "object" ||
                          Object.values(filters[key]).some(
                            (v) => v !== "" && v !== undefined
                          ))
                    ).length
                  }
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Row 2: Presets, View Mode, Zoom, Settings - "How to show it" */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-4">
        {/* Filter Presets */}
        <div
          data-tv-search-item="filter-presets"
          ref={(el) => searchZoneNav.setItemRef(4, el)}
          className={searchZoneNav.isFocused(4) ? "keyboard-focus" : ""}
        >
          <FilterPresets
            artifactType={artifactType}
            context={effectiveContext}
            currentFilters={filters}
            currentSort={sortField}
            currentDirection={sortDirection}
            currentViewMode={viewMode}
            currentZoomLevel={zoomLevel}
            currentGridDensity={gridDensity}
            currentTableColumns={currentTableColumns}
            permanentFilters={permanentFilters}
            onLoadPreset={handleLoadPreset}
          />
        </div>

        {/* View Mode Toggle - Show if supportsWallView or viewModes provided */}
        {(supportsWallView || viewModes) && (
          <div
            data-tv-search-item="view-mode"
            ref={(el) => searchZoneNav.setItemRef(5, el)}
            className={searchZoneNav.isFocused(5) ? "keyboard-focus" : ""}
          >
            <ViewModeToggle
              modes={viewModes}
              value={viewMode}
              onChange={setViewMode}
            />
          </div>
        )}

        {/* Table Columns Popover - Only shown in table mode */}
        {viewMode === "table" && tableColumnsPopover && (
          <div>{tableColumnsPopover}</div>
        )}

        {/* Zoom Slider - Only shown in wall mode */}
        {(supportsWallView || viewModes?.some(m => m.id === "wall")) && viewMode === "wall" && (
          <div
            data-tv-search-item="zoom-level"
            ref={(el) => searchZoneNav.setItemRef(6, el)}
            className={searchZoneNav.isFocused(6) ? "keyboard-focus" : ""}
          >
            <ZoomSlider value={zoomLevel} onChange={setZoomLevel} />
          </div>
        )}

        {/* Grid Density Slider - Shown in grid, folder, and timeline modes */}
        {(viewMode === "grid" || viewMode === "folder" || viewMode === "timeline") && (
          <div
            data-tv-search-item="grid-density"
            ref={(el) => searchZoneNav.setItemRef(6, el)}
            className={searchZoneNav.isFocused(6) ? "keyboard-focus" : ""}
          >
            <ZoomSlider value={gridDensity} onChange={setGridDensity} />
          </div>
        )}

        {/* Context Settings Cog */}
        <div
          data-tv-search-item="context-settings"
          ref={(el) => searchZoneNav.setItemRef(7, el)}
          className={searchZoneNav.isFocused(7) ? "keyboard-focus" : ""}
        >
          <ContextSettings
            entityType={artifactType}
            settings={contextSettings}
            currentValues={{ wallPlayback }}
            onSettingChange={(key, value) => {
              if (key === "wallPlayback" && onWallPlaybackChange) {
                onWallPlaybackChange(value);
              }
            }}
          />
        </div>
      </div>

            {/* Active Filter Chips */}
            <ActiveFilterChips
              filters={filters}
              filterOptions={filterOptions}
              onRemoveFilter={handleRemoveFilter}
              onChipClick={handleFilterChipClick}
              permanentFilters={permanentFilters}
              permanentFiltersMetadata={permanentFiltersMetadata}
            />
          </div>
        )}
      </div>

      {/* Top Pagination */}
      {totalPages >= 1 && (
        <div ref={topPaginationRef} className="mt-4 mb-4">
          <Pagination
            currentPage={currentPage}
            onPageChange={handlePageChange}
            perPage={perPage}
            onPerPageChange={handlePerPageChange}
            totalCount={totalCount}
            showInfo={true}
            totalPages={totalPages}
            tvActive={isTVMode && tvTopPaginationZoneActive}
            onEscapeUp={() => {
              window.dispatchEvent(new CustomEvent("tvPaginationEscape", {
                detail: { zone: "top", direction: "up" }
              }));
            }}
            onEscapeDown={() => {
              window.dispatchEvent(new CustomEvent("tvPaginationEscape", {
                detail: { zone: "top", direction: "down" }
              }));
            }}
          />
        </div>
      )}

      {/* Filter Panel */}
      <FilterPanel
        isOpen={isFilterPanelOpen}
        onToggle={handleToggleFilterPanel}
        onClear={handleClearFilters}
        onSubmit={handleFilterSubmit}
        hasActiveFilters={hasActiveFilters}
        highlightedFilterKey={highlightedFilterKey}
        filterRefs={filterRefs}
      >
        {filterOptions.map((opt, index) => {
          const { defaultValue, key, type, ...rest } = opt;

          // Render section header
          if (type === "section-header") {
            const isCollapsed = collapsedSections[key] || false;
            const toggleSection = () => {
              setCollapsedSections((prev) => ({
                ...prev,
                [key]: !prev[key],
              }));
            };

            return (
              <div
                key={`section-${key}`}
                className="col-span-full"
                style={{ gridColumn: "1 / -1" }}
              >
                <div
                  className="flex items-center justify-between py-2 px-3 mb-3 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderBottom: isCollapsed
                      ? "none"
                      : "2px solid var(--accent-primary)",
                  }}
                  onClick={opt.collapsible ? toggleSection : undefined}
                >
                  <h3
                    className="font-semibold text-sm uppercase tracking-wide"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {opt.label}
                  </h3>
                  {opt.collapsible && (
                    <svg
                      className={`w-4 h-4 transition-transform ${
                        isCollapsed ? "" : "rotate-180"
                      }`}
                      style={{ color: "var(--text-muted)" }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  )}
                </div>
              </div>
            );
          }

          // Check if this filter should be hidden (if in a collapsed section)
          let currentSectionKey = null;
          for (let i = index - 1; i >= 0; i--) {
            if (filterOptions[i].type === "section-header") {
              currentSectionKey = filterOptions[i].key;
              break;
            }
          }

          const isInCollapsedSection =
            currentSectionKey && collapsedSections[currentSectionKey];

          if (isInCollapsedSection) {
            return null;
          }

          // Render regular filter control
          const {
            modifierOptions,
            modifierKey,
            defaultModifier,
            supportsHierarchy,
            hierarchyKey,
            hierarchyLabel,
            ...filterProps
          } = rest;

          return (
            <FilterControl
              key={`FilterControl-${key}`}
              ref={(el) => {
                if (el) filterRefs.current[key] = el;
              }}
              isHighlighted={highlightedFilterKey === key}
              onChange={(value) => handleFilterChange(key, value)}
              value={localFilters[key] || defaultValue}
              type={type}
              modifierOptions={modifierOptions}
              modifierValue={localFilters[modifierKey] || defaultModifier}
              onModifierChange={(value) =>
                modifierKey && handleFilterChange(modifierKey, value)
              }
              supportsHierarchy={supportsHierarchy}
              hierarchyLabel={hierarchyLabel}
              hierarchyValue={hierarchyKey ? localFilters[hierarchyKey] : undefined}
              onHierarchyChange={
                hierarchyKey
                  ? (value) => handleFilterChange(hierarchyKey, value)
                  : undefined
              }
              {...filterProps}
            />
          );
        })}
      </FilterPanel>
      {/* Children: render prop or direct children */}
      {typeof children === "function"
        ? children({ viewMode, zoomLevel, gridDensity, wallPlayback, sortField, sortDirection, onSort: handleSortChange, timelinePeriod, setTimelinePeriod })
        : children}
      {/* Bottom Pagination */}
      {totalPages >= 1 && (
        <div className="mt-4">
          <Pagination
            currentPage={currentPage}
            onPageChange={handlePageChange}
            perPage={perPage}
            onPerPageChange={handlePerPageChange}
            totalCount={totalCount}
            showInfo={true}
            totalPages={totalPages}
            tvActive={isTVMode && tvBottomPaginationZoneActive}
            onEscapeUp={() => {
              window.dispatchEvent(new CustomEvent("tvPaginationEscape", {
                detail: { zone: "bottom", direction: "up" }
              }));
            }}
            onEscapeDown={() => {
              window.dispatchEvent(new CustomEvent("tvPaginationEscape", {
                detail: { zone: "bottom", direction: "down" }
              }));
            }}
          />
        </div>
      )}
    </div>
  );
};

export default SearchControls;
