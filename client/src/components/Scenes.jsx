import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SceneGrid } from "./SceneGrid/SceneGrid.jsx";
import { useScenesPaginated, useScenesSearch } from "../hooks/useLibrary.js";
import {
  PageHeader,
  SearchInput,
  ErrorMessage,
  LoadingSpinner,
} from "./ui/index.js";
import {
  SortControl,
  FilterPanel,
  FilterControl,
} from "./ui/FilterControls.jsx";
import { useSortAndFilter } from "../hooks/useSortAndFilter.js";
import {
  SCENE_SORT_OPTIONS,
  RATING_OPTIONS,
  RESOLUTION_OPTIONS,
  ORGANIZED_OPTIONS,
  buildSceneFilter,
} from "../utils/filterConfig.js";

const Scenes = () => {
  const navigate = useNavigate();
  const [searchMode, setSearchMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const {
    sort,
    sortDirection,
    handleSortChange,
    filters,
    handleFilterChange,
    clearFilters,
    hasActiveFilters,
    isFilterPanelOpen,
    toggleFilterPanel,
  } = useSortAndFilter("TITLE", "scene");

  const {
    data: paginatedData,
    loading,
    error,
    refetch,
  } = useScenesPaginated({
    page: currentPage,
    perPage: 24,
    sort: sort || undefined,
    direction: sortDirection,
    scene_filter: buildSceneFilter(filters),
  });

  const {
    query,
    setQuery,
    results: searchResults,
    loading: searchLoading,
    error: searchError,
    clearSearch,
  } = useScenesSearch();

  const handleSearch = (searchQuery) => {
    setQuery(searchQuery);
    setSearchMode(!!searchQuery);
    setCurrentPage(1); // Reset to first page on new search
  };

  const handleClearSearch = () => {
    clearSearch();
    setSearchMode(false);
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleSceneClick = (scene) => {
    // Navigate to video player page with scene data
    navigate(`/video/${scene.id}`, { state: { scene } });
  };

  const currentError = error || searchError;
  const currentLoading = searchMode ? searchLoading : loading;

  // Handle both paginated and search results
  const currentScenes = searchMode
    ? searchResults?.findScenes?.scenes
    : paginatedData?.scenes;

  const totalCount = searchMode
    ? searchResults?.findScenes?.count || 0
    : paginatedData?.count || 0;

  const totalPages = Math.ceil(totalCount / 24);

  if (currentError) {
    return (
      <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
        <PageHeader
          title="All Scenes"
          subtitle="Browse your complete scene library"
        />
        <ErrorMessage
          error={currentError}
          onRetry={searchMode ? () => setQuery(query) : refetch}
        />
      </div>
    );
  }

  return (
    <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
      <PageHeader
        title="All Scenes"
        subtitle="Browse your complete scene library"
      >
        <SearchInput
          placeholder="Search scenes..."
          onSearch={handleSearch}
          className="w-80"
        />
        {searchMode && (
          <button
            onClick={handleClearSearch}
            className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Show All
          </button>
        )}
      </PageHeader>

      {/* Sorting and Filtering Controls */}
      {!searchMode && (
        <>
          <div className="flex items-center justify-between mb-6">
            {/* Sort Control */}
            <div className="flex items-center space-x-4">
              <SortControl
                options={SCENE_SORT_OPTIONS}
                value={sort}
                onChange={handleSortChange}
              />
              <button
                onClick={() => handleSortChange(sort)} // This will toggle direction for same field
                className="px-3 py-2 border rounded-md text-sm"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                {sortDirection === "ASC" ? "↑ Ascending" : "↓ Descending"}
              </button>
            </div>
          </div>

          {/* Filter Panel */}
          <FilterPanel
            isOpen={isFilterPanelOpen}
            onToggle={toggleFilterPanel}
            onClear={clearFilters}
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
        </>
      )}

      <SceneGrid
        scenes={currentScenes || []}
        loading={currentLoading}
        error={currentError}
        currentPage={searchMode ? 1 : currentPage}
        totalPages={searchMode ? 1 : totalPages}
        onPageChange={searchMode ? undefined : handlePageChange}
        onSceneClick={handleSceneClick}
        emptyMessage={
          searchMode ? "No scenes match your search" : "No scenes found"
        }
        emptyDescription={
          searchMode
            ? "Try adjusting your search terms"
            : "Check your media library configuration"
        }
        enableKeyboard={true}
      />
    </div>
  );
};

export default Scenes;
