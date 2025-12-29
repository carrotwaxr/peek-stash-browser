import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LucideArrowDown, LucideArrowUp } from "lucide-react";
import { apiGet } from "../../services/api.js";
import { useTVMode } from "../../hooks/useTVMode.js";
import { useHorizontalNavigation } from "../../hooks/useHorizontalNavigation.js";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext.js";
import {
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
  buildGalleryFilter,
  buildGroupFilter,
  buildImageFilter,
  buildPerformerFilter,
  buildSceneFilter,
  buildStudioFilter,
  buildTagFilter,
} from "../../utils/filterConfig";
import { buildSearchParams, parseSearchParams } from "../../utils/urlParams";
import {
  ActiveFilterChips,
  Button,
  FilterControl,
  FilterPanel,
  FilterPresets,
  Pagination,
  SearchInput,
  SortControl,
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
  paginationHandlerRef, // Optional ref to expose handlePageChange for TV mode
  permanentFilters = {},
  permanentFiltersMetadata = {},
  totalPages,
  totalCount,
  syncToUrl = true,
  // TV Mode props
  tvSearchZoneActive = false,
  tvTopPaginationZoneActive = false,
  tvBottomPaginationZoneActive = false,
}) => {
  // Use context if provided, otherwise fall back to artifactType
  const effectiveContext = context || artifactType;
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [highlightedFilterKey, setHighlightedFilterKey] = useState(null);
  const hasInitialized = useRef(false); // Prevent double initialization
  const topPaginationRef = useRef(null); // Ref for top pagination element
  const filterRefs = useRef({}); // Refs for filter controls (for scroll-to-highlight)
  const randomSeedRef = useRef(-1); // Random seed for stable pagination (-1 = uninitialized)

  // TV Mode
  const { isTVMode } = useTVMode();

  // Unit preference for filter conversions
  const { unitPreference } = useUnitPreference();

  // Search zone items: SearchInput, SortControl, SortDirection, Filters, FilterPresets
  const searchZoneItems = useMemo(() => [
    { id: "search-input", name: "Search" },
    { id: "sort-control", name: "Sort" },
    { id: "sort-direction", name: "Direction" },
    { id: "filters-button", name: "Filters" },
    { id: "filter-presets", name: "Presets" },
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

  // Determine if we need to load defaults (only if URL has no filter/sort params)
  const needsDefaultPreset = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    for (const [key] of params.entries()) {
      if (key !== "page" && key !== "per_page") {
        return false; // URL has params, don't need defaults
      }
    }
    return true; // No params, need to fetch defaults
  }, [searchParams]);

  const [isLoadingDefaults, setIsLoadingDefaults] =
    useState(needsDefaultPreset);

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

  // Parse URL params to get current state (updates when URL changes)
  const urlState = useMemo(() => {
    return parseSearchParams(searchParams, filterOptions, {
      sortField: initialSort,
      sortDirection: "DESC",
      searchText: "",
      filters: { ...permanentFilters },
    });
  }, [searchParams, filterOptions, initialSort, permanentFilters]); // Re-parse when URL changes

  const [currentPage, setCurrentPage] = useState(urlState.currentPage);
  const [perPage, setPerPage] = useState(urlState.perPage);
  const [filters, setFilters] = useState(urlState.filters);
  const [searchText, setSearchText] = useState(urlState.searchText);
  const [[sortField, sortDirection], setSort] = useState([
    urlState.sortField,
    urlState.sortDirection,
  ]);

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

  // Initialize component: Determine initial state from URL or default preset
  useEffect(() => {
    // Prevent double initialization in dev mode (React StrictMode)
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initializeState = async () => {
      let initialState;

      // Always try to load default preset to merge with URL params
      try {
        const [presetsResponse, defaultsResponse] = await Promise.all([
          apiGet("/user/filter-presets"),
          apiGet("/user/default-presets"),
        ]);

        const allPresets = presetsResponse?.presets || {};
        const defaults = defaultsResponse?.defaults || {};
        const defaultPresetId = defaults[effectiveContext];

        // Find the default preset for this context
        // Scene grid contexts (scene_performer, etc.) use "scene" presets
        const presetArtifactType = effectiveContext.startsWith("scene_")
          ? "scene"
          : effectiveContext;
        const presets = allPresets[presetArtifactType] || [];
        const defaultPreset = presets.find((p) => p.id === defaultPresetId);

        if (!needsDefaultPreset) {
          // Priority 1: URL has params → Merge with default preset
          const baseState = defaultPreset
            ? {
                filters: { ...permanentFilters, ...defaultPreset.filters },
                sortField: defaultPreset.sort,
                sortDirection: defaultPreset.direction,
              }
            : {
                filters: { ...permanentFilters },
                sortField: initialSort,
                sortDirection: "DESC",
              };

          // Parse URL params and merge with base state
          const parsedUrlState = parseSearchParams(searchParams, filterOptions, baseState);

          initialState = {
            currentPage: parsedUrlState.currentPage,
            perPage: parsedUrlState.perPage,
            searchText: parsedUrlState.searchText,
            filters: parsedUrlState.filters, // Already merged by parseSearchParams
            sortField: parsedUrlState.sortField,
            sortDirection: parsedUrlState.sortDirection,
          };
        } else if (defaultPreset) {
          // Priority 2: No URL params + default preset exists → Use default preset
          initialState = {
            currentPage: 1,
            perPage: urlState.perPage,
            searchText: "",
            filters: { ...permanentFilters, ...defaultPreset.filters },
            sortField: defaultPreset.sort,
            sortDirection: defaultPreset.direction,
          };
        } else {
          // Priority 3: No URL params + no default preset → Use hardcoded defaults
          initialState = {
            currentPage: urlState.currentPage,
            perPage: urlState.perPage,
            searchText: "",
            filters: { ...permanentFilters },
            sortField: initialSort,
            sortDirection: "DESC",
          };
        }
      } catch (err) {
        console.error("Error loading default preset:", err);
        // Fallback to URL state or hardcoded defaults on error
        initialState = !needsDefaultPreset
          ? urlState
          : {
              currentPage: urlState.currentPage,
              perPage: urlState.perPage,
              searchText: "",
              filters: { ...permanentFilters },
              sortField: initialSort,
              sortDirection: "DESC",
            };
      } finally {
        setIsLoadingDefaults(false);
      }

      // Set all state at once
      setCurrentPage(initialState.currentPage);
      setPerPage(initialState.perPage);
      setSearchText(initialState.searchText);
      setFilters(initialState.filters);
      setSort([initialState.sortField, initialState.sortDirection]);

      // Trigger initial query with loaded state
      const query = {
        filter: {
          direction: initialState.sortDirection,
          page: initialState.currentPage,
          per_page: initialState.perPage,
          q: initialState.searchText,
          sort: getSortWithSeed(initialState.sortField),
        },
        ...buildFilter(artifactType, initialState.filters, unitPreference),
      };
      onQueryChange(query);

      // Mark as initialized (will trigger URL sync on next render)
      setIsInitialized(true);
    };

    initializeState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitPreference]); // Re-run when unit preference changes

  // Update URL params whenever state changes (one-way: State → URL)
  useEffect(() => {
    // Only sync after initialization is complete
    if (!isInitialized || !syncToUrl) {
      return;
    }

    const params = buildSearchParams({
      searchText,
      sortField,
      sortDirection,
      currentPage,
      perPage,
      filters,
      filterOptions,
    });

    const newUrl = params.toString();
    const currentUrl = searchParams.toString();

    // Only update if URL would actually change
    if (newUrl !== currentUrl) {
      setSearchParams(params, { replace: true });
    }
    // Note: searchParams is intentionally NOT in deps to prevent infinite loop
    // We only want this to run when state changes, not when URL changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isInitialized,
    searchText,
    sortField,
    sortDirection,
    currentPage,
    perPage,
    filters,
    filterOptions,
    setSearchParams,
    syncToUrl,
  ]);

  // Clear all filters
  const clearFilters = () => {
    setCurrentPage(1);
    setFilters({ ...permanentFilters });
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
  };

  // Handle filter change, but not submitted yet
  const handleFilterChange = useCallback((filterKey, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterKey]: value === "" ? undefined : value,
    }));
  }, []);

  // Handle filter submission - applies filters and closes panel
  const handleFilterSubmit = () => {
    setCurrentPage(1); // Reset to first page when filters change
    setIsFilterPanelOpen(false); // Close the filter panel

    // Trigger search with new filters
    const query = {
      filter: {
        direction: sortDirection,
        page: 1,
        per_page: perPage,
        q: searchText,
        sort: getSortWithSeed(sortField),
      },
      ...buildFilter(artifactType, filters, unitPreference),
    };

    onQueryChange(query);
  };

  // Handle removing a single filter chip
  const handleRemoveFilter = useCallback(
    (filterKey) => {
      setCurrentPage(1); // Reset to first page

      // Remove the filter by resetting it to default value
      const newFilters = { ...filters };
      delete newFilters[filterKey];

      // Re-apply permanent filters
      const updatedFilters = { ...newFilters, ...permanentFilters };
      setFilters(updatedFilters);

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
      setCurrentPage(1); // Reset to first page
      setFilters({ ...permanentFilters, ...preset.filters });
      setSort([preset.sort, preset.direction]);

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
    [permanentFilters, perPage, searchText, artifactType, onQueryChange, unitPreference, getSortWithSeed, resetRandomSeed]
  );

  const handlePageChange = (page) => {
    setCurrentPage(page);

    // Trigger search with new page
    const query = {
      filter: {
        direction: sortDirection,
        page,
        per_page: perPage,
        q: searchText,
        sort: getSortWithSeed(sortField),
      },
      ...buildFilter(artifactType, filters, unitPreference),
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
  };

  // Expose pagination handler to parent via ref (for TV mode PageUp/PageDown)
  useEffect(() => {
    if (paginationHandlerRef) {
      paginationHandlerRef.current = handlePageChange;
    }
  }, [paginationHandlerRef, handlePageChange]);

  const handleChangeSearchText = (searchStr) => {
    if (searchStr === searchText) return; // No change
    setSearchText(searchStr);
    setCurrentPage(1); // Reset to first page on new search

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
  };

  // Handle sort change
  const handleSortChange = (field) => {
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
    setSort([newSortField, newSortDirection]);

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
  };

  const handleToggleFilterPanel = () => {
    setIsFilterPanelOpen((prev) => !prev);
  };

  const handlePerPageChange = (newPerPage) => {
    setPerPage(newPerPage);
    setCurrentPage(1); // Reset to first page when changing per page

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
  };

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
  if (isLoadingDefaults) {
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
      {/* Mobile-responsive controls - optimized for minimal vertical space */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
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

        {/* Sort, Filter, Presets - Wrap on narrow widths */}
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
              permanentFilters={permanentFilters}
              onLoadPreset={handleLoadPreset}
            />
          </div>
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
        onClear={clearFilters}
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
              value={filters[key] || defaultValue}
              type={type}
              modifierOptions={modifierOptions}
              modifierValue={filters[modifierKey] || defaultModifier}
              onModifierChange={(value) =>
                modifierKey && handleFilterChange(modifierKey, value)
              }
              supportsHierarchy={supportsHierarchy}
              hierarchyLabel={hierarchyLabel}
              hierarchyValue={hierarchyKey ? filters[hierarchyKey] : undefined}
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
      {children}
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
