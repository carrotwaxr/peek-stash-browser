import { useCallback, useMemo, useState } from "react";
import { Pagination, SearchInput } from "../ui";
import {
  SortControl,
  FilterPanel,
  FilterControl,
} from "../ui/FilterControls.jsx";
import {
  ORGANIZED_OPTIONS,
  RATING_OPTIONS,
  RESOLUTION_OPTIONS,
  SCENE_SORT_OPTIONS,
  buildSceneFilter,
} from "../../utils/filterConfig";
import { LucideArrowDown, LucideArrowUp } from "lucide-react";

const SearchControls = ({
  initialSort = "o_counter",
  onQueryChange,
  permanentSceneFilters = {},
  totalPages,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({ ...permanentSceneFilters });
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [[sortField, sortDirection], setSort] = useState([initialSort, "DESC"]);

  // Clear all filters
  const clearFilters = () => {
    setCurrentPage(1);
    setFilters({ ...permanentSceneFilters });
    setIsFilterPanelOpen(false);

    const query = {
      filter: {
        direction: sortDirection,
        page: 1,
        per_page: 24,
        q: searchText,
        sort: sortField,
      },
      scene_filter: buildSceneFilter({ ...permanentSceneFilters }),
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
        per_page: 24,
        q: searchText,
        sort: sortField,
      },
      scene_filter: buildSceneFilter(filters),
    };

    onQueryChange(query);
  };

  const handlePageChange = (page) => {
    console.log("Page change to:", page);
    setCurrentPage(page);

    // Trigger search with new page
    const query = {
      filter: {
        direction: sortDirection,
        page,
        per_page: 24,
        q: searchText,
        sort: sortField,
      },
      scene_filter: buildSceneFilter(filters),
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
        per_page: 24,
        q: searchStr,
        sort: sortField,
      },
      scene_filter: buildSceneFilter(filters),
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
        per_page: 24,
        q: searchText,
        sort: newSortField,
      },
      scene_filter: buildSceneFilter(filters),
    };

    onQueryChange(query);
  };

  const handleToggleFilterPanel = () => {
    setIsFilterPanelOpen((prev) => !prev);
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

  return (
    <div className="mb-6">
      <div className="flex items-center justify-center gap-6 mb-4">
        <SearchInput
          placeholder="Search..."
          onSearch={handleChangeSearchText}
          className="w-80"
        />
        {/* Sort Control */}
        <div className="flex items-center space-x-1">
          <SortControl
            options={SCENE_SORT_OPTIONS}
            value={sortField}
            onChange={handleSortChange}
          />
          <button
            onClick={() => handleSortChange(sortField)} // This will toggle direction for same field
            className="py-1 border rounded-md text-sm"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            {sortDirection === "ASC" ? <LucideArrowUp /> : <LucideArrowDown />}
          </button>
        </div>

        {/* Filters Toggle Button */}
        <button
          onClick={handleToggleFilterPanel}
          className="px-4 py-2 border rounded-md text-sm font-medium transition-colors hover:bg-opacity-80 flex items-center space-x-2"
          style={{
            backgroundColor: isFilterPanelOpen
              ? "var(--accent-primary)"
              : "var(--bg-card)",
            borderColor: isFilterPanelOpen
              ? "var(--accent-primary)"
              : "var(--border-color)",
            color: isFilterPanelOpen ? "white" : "var(--text-primary)",
          }}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
              clipRule="evenodd"
            />
          </svg>
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
        </button>
      </div>

      {/* Filter Panel */}
      <FilterPanel
        isOpen={isFilterPanelOpen}
        onToggle={handleToggleFilterPanel}
        onClear={clearFilters}
        onSubmit={handleFilterSubmit}
        hasActiveFilters={hasActiveFilters}
      >
        <FilterControl
          type="select"
          label="Rating"
          value={filters.rating || ""}
          onChange={(value) => handleFilterChange("rating", value)}
          options={RATING_OPTIONS}
          placeholder="Any rating"
        />

        <FilterControl
          type="range"
          label="Duration (minutes)"
          value={filters.duration || {}}
          onChange={(value) => handleFilterChange("duration", value)}
          min={1}
          max={300}
        />

        <FilterControl
          type="range"
          label="O Count"
          value={filters.oCount || {}}
          onChange={(value) => handleFilterChange("oCount", value)}
          min={0}
          max={50}
        />

        <FilterControl
          type="select"
          label="Resolution"
          value={filters.resolution || ""}
          onChange={(value) => handleFilterChange("resolution", value)}
          options={RESOLUTION_OPTIONS}
          placeholder="Any resolution"
        />

        <FilterControl
          type="select"
          label="Organized"
          value={filters.organized || ""}
          onChange={(value) => handleFilterChange("organized", value)}
          options={ORGANIZED_OPTIONS}
          placeholder="Any"
        />
      </FilterPanel>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          onPageChange={handlePageChange}
          showInfo={false}
          totalPages={totalPages}
        />
      )}
    </div>
  );
};

export default SearchControls;
