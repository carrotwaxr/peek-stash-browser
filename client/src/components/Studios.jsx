import { useState } from "react";
import { Link } from "react-router-dom";
import { useStudiosPaginated, useStudiosSearch } from "../hooks/useLibrary.js";
import {
  PageHeader,
  SearchInput,
  ErrorMessage,
  LoadingSpinner,
  EmptyState,
  Pagination,
} from "./ui/index.js";
import {
  SortControl,
  FilterPanel,
  FilterControl,
} from "./ui/FilterControls.jsx";
import { useSortAndFilter } from "../hooks/useSortAndFilter.js";
import {
  STUDIO_SORT_OPTIONS,
  RATING_OPTIONS,
  buildStudioFilter,
} from "../utils/filterConfig.js";
import { truncateText } from "../utils/format.js";

const Studios = () => {
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
  } = useSortAndFilter("NAME", "studio");

  const {
    data: studios,
    loading,
    error,
    refetch,
  } = useStudiosPaginated({
    page: currentPage,
    perPage: 24,
    sort: sort || undefined,
    sortDirection: sortDirection || undefined,
    filter: buildStudioFilter(filters),
  });
  const {
    query,
    setQuery,
    results: searchResults,
    loading: searchLoading,
    error: searchError,
    clearSearch,
  } = useStudiosSearch();

  const handleSearch = (searchQuery) => {
    setQuery(searchQuery);
    setSearchMode(!!searchQuery);
    setCurrentPage(1);
  };

  const handleClearSearch = () => {
    clearSearch();
    setSearchMode(false);
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const currentError = error || searchError;
  const currentLoading = searchMode ? searchLoading : loading;
  const currentStudios = searchMode
    ? searchResults?.findStudios?.studios
    : studios?.studios || [];

  const totalCount = searchMode
    ? searchResults?.findStudios?.count || 0
    : studios?.count || 0;

  const totalPages = Math.ceil(totalCount / 24);

  if (currentError) {
    return (
      <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
        <PageHeader
          title="Studios"
          subtitle="Browse studios and production companies"
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
        title="Studios"
        subtitle="Browse studios and production companies"
      >
        <SearchInput
          placeholder="Search studios..."
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
                options={STUDIO_SORT_OPTIONS}
                value={sort}
                onChange={handleSortChange}
              />
              <button
                onClick={() => handleSortChange(sort)}
                className="px-3 py-2 border rounded-md text-sm"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                title={`Sort ${
                  sortDirection === "ASC" ? "Descending" : "Ascending"
                }`}
              >
                {sortDirection === "ASC" ? "↑" : "↓"}
              </button>
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center space-x-4">
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-2 text-sm border border-red-500 text-red-500 rounded hover:bg-red-50 transition-colors"
                >
                  Clear Filters
                </button>
              )}
              <button
                onClick={toggleFilterPanel}
                className="px-4 py-2 border rounded-md text-sm transition-colors"
                style={{
                  backgroundColor: isFilterPanelOpen
                    ? "var(--accent-primary)"
                    : "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: isFilterPanelOpen ? "white" : "var(--text-primary)",
                }}
              >
                Filters {hasActiveFilters && `(${Object.keys(filters).length})`}
              </button>
            </div>
          </div>

          {/* Filter Panel */}
          {isFilterPanelOpen && (
            <FilterPanel>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FilterControl
                  type="select"
                  label="Rating"
                  value={filters.rating || ""}
                  onChange={(value) => handleFilterChange("rating", value)}
                  options={RATING_OPTIONS}
                />
                <FilterControl
                  type="checkbox"
                  label="Favorites Only"
                  value={filters.favorite || false}
                  onChange={(value) => handleFilterChange("favorite", value)}
                />
                <FilterControl
                  type="number"
                  label="Min Scene Count"
                  value={filters.sceneCount || ""}
                  onChange={(value) => handleFilterChange("sceneCount", value)}
                  placeholder="0"
                  min="0"
                />
              </div>
            </FilterPanel>
          )}
        </>
      )}

      {currentLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {!currentLoading && (!currentStudios || currentStudios.length === 0) && (
        <EmptyState
          icon={
            <svg
              className="w-16 h-16 mx-auto mb-4"
              style={{ color: "var(--text-muted)" }}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                clipRule="evenodd"
              />
            </svg>
          }
          title={searchMode ? "No studios found" : "No studios"}
          description={
            searchMode
              ? `No studios match your search for "${query}"`
              : "No studios found in your library"
          }
        />
      )}

      {!currentLoading && currentStudios && currentStudios.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentStudios.map((studio) => (
              <StudioCard key={studio.id} studio={studio} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && !searchMode && (
            <div className="mt-8">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

const StudioCard = ({ studio }) => {
  return (
    <Link
      to={`/studio/${studio.id}`}
      className="block rounded-lg border p-6 hover:shadow-lg transition-shadow cursor-pointer"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="flex items-start space-x-4">
        {studio.image_path ? (
          <img
            src={studio.image_path}
            alt={studio.name}
            className="w-16 h-16 rounded object-cover flex-shrink-0"
          />
        ) : (
          <div
            className="w-16 h-16 rounded flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
            }}
          >
            🏢
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3
            className="font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
            title={studio.name}
          >
            {truncateText(studio.name, 30)}
          </h3>

          {studio.scene_count > 0 && (
            <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
              {studio.scene_count} scene{studio.scene_count !== 1 ? "s" : ""}
            </p>
          )}

          {studio.url && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {truncateText(studio.url, 40)}
            </p>
          )}

          {studio.details && (
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              {truncateText(studio.details, 80)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
};

export default Studios;
