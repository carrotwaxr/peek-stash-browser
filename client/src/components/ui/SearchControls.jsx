import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { LucideArrowDown, LucideArrowUp } from "lucide-react";
import Pagination from "./Pagination.jsx";
import SearchInput from "./SearchInput.jsx";
import ActiveFilterChips from "./ActiveFilterChips.jsx";
import FilterPresets from "./FilterPresets.jsx";
import Button from "./Button.jsx";
import {
  SortControl,
  FilterPanel,
  FilterControl,
} from "../ui/FilterControls.jsx";
import {
  ORGANIZED_OPTIONS,
  PERFORMER_FILTER_OPTIONS,
  PERFORMER_SORT_OPTIONS,
  RATING_OPTIONS,
  RESOLUTION_OPTIONS,
  SCENE_FILTER_OPTIONS,
  SCENE_SORT_OPTIONS,
  STUDIO_FILTER_OPTIONS,
  STUDIO_SORT_OPTIONS,
  TAG_FILTER_OPTIONS,
  TAG_SORT_OPTIONS,
  buildPerformerFilter,
  buildSceneFilter,
  buildStudioFilter,
  buildTagFilter,
} from "../../utils/filterConfig";
import { parseSearchParams, buildSearchParams } from "../../utils/urlParams";

const buildFilter = (artifactType, filters) => {
  switch (artifactType) {
    case "performer":
      return { performer_filter: buildPerformerFilter(filters) };
    case "studio":
      return { studio_filter: buildStudioFilter(filters) };
    case "tag":
      return { tag_filter: buildTagFilter(filters) };
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
    case "scene":
    default:
      return SCENE_SORT_OPTIONS;
  }
};

const SearchControls = ({
  artifactType = "scene",
  initialSort = "o_counter",
  onQueryChange,
  permanentFilters = {},
  permanentFiltersMetadata = {},
  totalPages,
  totalCount,
  syncToUrl = true,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const lastSyncedUrl = useRef(""); // Empty initially so first URL sync always runs

  // Get filter options for this artifact type
  const filterOptions = useMemo(() => {
    switch (artifactType) {
      case "performer":
        return [...PERFORMER_FILTER_OPTIONS];
      case "studio":
        return [...STUDIO_FILTER_OPTIONS];
      case "tag":
        return [...TAG_FILTER_OPTIONS];
      case "scene":
      default:
        return [...SCENE_FILTER_OPTIONS];
    }
  }, [artifactType]);

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

  // Sync state when URL changes externally (from navigation back with preserved filters)
  useEffect(() => {
    if (!isInitialized) return;

    const currentUrl = searchParams.toString();
    // Only sync if URL actually changed (not our own update)
    if (currentUrl === lastSyncedUrl.current) return;

    lastSyncedUrl.current = currentUrl;

    // Update state from URL
    setCurrentPage(urlState.currentPage);
    setPerPage(urlState.perPage);
    setSearchText(urlState.searchText);
    setSort([urlState.sortField, urlState.sortDirection]);
    setFilters(urlState.filters);

    // Trigger query with new URL values
    const query = {
      filter: {
        direction: urlState.sortDirection,
        page: urlState.currentPage,
        per_page: urlState.perPage,
        q: urlState.searchText,
        sort: urlState.sortField,
      },
      ...buildFilter(artifactType, urlState.filters),
    };
    onQueryChange(query);
  }, [searchParams, isInitialized, urlState, artifactType, onQueryChange]);

  // Update URL params whenever state changes (only if syncToUrl is true)
  useEffect(() => {
    if (!syncToUrl) {
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
      lastSyncedUrl.current = newUrl;
      setSearchParams(params, { replace: true });
    }
  }, [searchText, sortField, sortDirection, currentPage, perPage, filters, filterOptions, setSearchParams, syncToUrl, searchParams]);

  // Trigger initial query from URL params
  useEffect(() => {
    if (!isInitialized) {
      setIsInitialized(true);
      const query = {
        filter: {
          direction: sortDirection,
          page: currentPage,
          per_page: perPage,
          q: searchText,
          sort: sortField,
        },
        ...buildFilter(artifactType, filters),
      };
      onQueryChange(query);
    }
  }, [isInitialized]);

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
        sort: sortField,
      },
      ...buildFilter(artifactType, { ...permanentFilters }),
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
        sort: sortField,
      },
      ...buildFilter(artifactType, filters),
    };

    onQueryChange(query);
  };

  // Handle removing a single filter chip
  const handleRemoveFilter = useCallback((filterKey) => {
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
        sort: sortField,
      },
      ...buildFilter(artifactType, updatedFilters),
    };

    onQueryChange(query);
  }, [filters, permanentFilters, sortDirection, perPage, searchText, sortField, artifactType, onQueryChange]);

  // Handle loading a saved preset
  const handleLoadPreset = useCallback((preset) => {
    setCurrentPage(1); // Reset to first page
    setFilters({ ...permanentFilters, ...preset.filters });
    setSort([preset.sort, preset.direction]);

    // Trigger search with preset values
    const query = {
      filter: {
        direction: preset.direction,
        page: 1,
        per_page: perPage,
        q: searchText,
        sort: preset.sort,
      },
      ...buildFilter(artifactType, { ...permanentFilters, ...preset.filters }),
    };

    onQueryChange(query);
  }, [permanentFilters, perPage, searchText, artifactType, onQueryChange]);

  const handlePageChange = (page) => {
    setCurrentPage(page);

    // Trigger search with new page
    const query = {
      filter: {
        direction: sortDirection,
        page,
        per_page: perPage,
        q: searchText,
        sort: sortField,
      },
      ...buildFilter(artifactType, filters),
    };

    onQueryChange(query);
  };

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
        sort: sortField,
      },
      ...buildFilter(artifactType, filters),
    };

    onQueryChange(query);
  };

  // Handle sort change
  const handleSortChange = (field) => {
    let newSortDirection = "DESC";
    let newSortField = sortField;

    // If same field, toggle direction
    if (field === sortField) {
      newSortDirection = sortDirection === "ASC" ? "DESC" : "ASC";
    } else {
      // New field, default to DESC
      newSortField = field;
    }
    setSort([newSortField, newSortDirection]);

    // Trigger search with new sort
    const query = {
      filter: {
        direction: newSortDirection,
        page: currentPage,
        per_page: perPage,
        q: searchText,
        sort: newSortField,
      },
      ...buildFilter(artifactType, filters),
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
        sort: sortField,
      },
      ...buildFilter(artifactType, filters),
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

  const sortOptions = useMemo(
    () => getSortOptions(artifactType),
    [artifactType]
  );

  return (
    <div className="mb-6">
      {/* Mobile-responsive controls - wrap on small screens */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 mb-4">
        {/* Search Input - Full width on mobile */}
        <SearchInput
          placeholder="Search..."
          value={searchText}
          onSearch={handleChangeSearchText}
          className="w-full sm:w-80"
        />

        {/* Sort, Filter, Presets - Wrap on mobile */}
        <div className="flex items-center justify-center gap-6 flex-wrap">
          {/* Sort Control */}
          <div className="flex items-center space-x-1">
            <SortControl
              options={sortOptions}
              value={sortField}
              onChange={handleSortChange}
              label="Sort"
            />
            <Button
              onClick={() => handleSortChange(sortField)}
              variant="secondary"
              size="sm"
              className="py-1"
              icon={sortDirection === "ASC" ? <LucideArrowUp /> : <LucideArrowDown />}
            />
          </div>

          {/* Filters Toggle Button */}
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

          {/* Filter Presets */}
          <FilterPresets
            artifactType={artifactType}
            currentFilters={filters}
            currentSort={sortField}
            currentDirection={sortDirection}
            onLoadPreset={handleLoadPreset}
          />
        </div>
      </div>

      {/* Active Filter Chips */}
      <ActiveFilterChips
        filters={filters}
        filterOptions={filterOptions}
        onRemoveFilter={handleRemoveFilter}
        permanentFilters={permanentFilters}
        permanentFiltersMetadata={permanentFiltersMetadata}
      />

      {/* Top Pagination */}
      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination
            currentPage={currentPage}
            onPageChange={handlePageChange}
            perPage={perPage}
            onPerPageChange={handlePerPageChange}
            totalCount={totalCount}
            showInfo={true}
            totalPages={totalPages}
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
                    borderBottom: isCollapsed ? "none" : "2px solid var(--accent-primary)",
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
                      className={`w-4 h-4 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
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
          return (
            <FilterControl
              key={`FilterControl-${key}`}
              onChange={(value) => handleFilterChange(key, value)}
              value={filters[key] || defaultValue}
              type={type}
              {...rest}
            />
          );
        })}
      </FilterPanel>

    </div>
  );
};

export default SearchControls;
