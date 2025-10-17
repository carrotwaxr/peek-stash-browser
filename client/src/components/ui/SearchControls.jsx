import { useCallback, useMemo, useState } from "react";
import { LucideArrowDown, LucideArrowUp } from "lucide-react";
import Pagination from "./Pagination.jsx";
import SearchInput from "./SearchInput.jsx";
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
  totalPages,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(24);
  const [filters, setFilters] = useState({ ...permanentFilters });
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [[sortField, sortDirection], setSort] = useState([initialSort, "DESC"]);

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
      ...buildFilter(artifactType, { ...permanentFilters }),
    };

    onQueryChange(query);
  };

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
            options={sortOptions}
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
        {filterOptions.map((opt) => {
          const { defaultValue, key, ...rest } = opt;
          return (
            <FilterControl
              key={`FilterControl-${key}`}
              onChange={(value) => handleFilterChange(key, value)}
              value={filters[key] || defaultValue}
              {...rest}
            />
          );
        })}
      </FilterPanel>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          onPageChange={handlePageChange}
          perPage={perPage}
          onPerPageChange={handlePerPageChange}
          showInfo={false}
          totalPages={totalPages}
        />
      )}
    </div>
  );
};

export default SearchControls;
