import { useState } from "react";
import { Link } from "react-router-dom";
import { useTagsPaginated, useTagsSearch } from "../../hooks/useLibrary.js";
import {
  PageHeader,
  SearchInput,
  ErrorMessage,
  LoadingSpinner,
  EmptyState,
  Pagination,
} from "../ui/index.js";
import {
  SortControl,
  FilterPanel,
  FilterControl,
} from "../ui/FilterControls.jsx";
import { useSortAndFilter } from "../../hooks/useSortAndFilter.js";
import { TAG_SORT_OPTIONS, buildTagFilter } from "../../utils/filterConfig.js";
import { truncateText } from "../../utils/format.js";

const Tags = () => {
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
  } = useSortAndFilter("NAME", "tag");

  const {
    data: tags,
    loading,
    error,
    refetch,
  } = useTagsPaginated({
    page: currentPage,
    perPage: 24,
    sort: sort || undefined,
    sortDirection: sortDirection || undefined,
    filter: buildTagFilter(filters),
  });
  const {
    query,
    setQuery,
    results: searchResults,
    loading: searchLoading,
    error: searchError,
    clearSearch,
  } = useTagsSearch();

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
  const currentTags = searchMode
    ? searchResults?.findTags?.tags
    : tags?.tags || [];

  const totalCount = searchMode
    ? searchResults?.findTags?.count || 0
    : tags?.count || 0;

  const totalPages = Math.ceil(totalCount / 24);

  if (currentError) {
    return (
      <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
        <PageHeader
          title="Tags"
          subtitle="Browse and manage tags in your library"
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
        title="Tags"
        subtitle="Browse and manage tags in your library"
      >
        <SearchInput
          placeholder="Search tags..."
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
                options={TAG_SORT_OPTIONS}
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
                  type="number"
                  label="Min Scene Count"
                  value={filters.sceneCount || ""}
                  onChange={(value) => handleFilterChange("sceneCount", value)}
                  placeholder="0"
                  min="0"
                />
                <FilterControl
                  type="checkbox"
                  label="Favorites Only"
                  value={filters.favorite || false}
                  onChange={(value) => handleFilterChange("favorite", value)}
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

      {!currentLoading && (!currentTags || currentTags.length === 0) && (
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
                d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
          }
          title={searchMode ? "No tags found" : "No tags"}
          description={
            searchMode
              ? `No tags match your search for "${query}"`
              : "No tags found in your library"
          }
        />
      )}

      {!currentLoading && currentTags && currentTags.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentTags.map((tag) => (
              <TagCard key={tag.id} tag={tag} />
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

const TagCard = ({ tag }) => {
  const getTagColor = (name) => {
    // Generate a consistent color based on the tag name
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-yellow-500",
      "bg-red-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
    ];

    const hash = name.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);

    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <Link
      to={`/tag/${tag.id}`}
      className="block rounded-lg border p-6 hover:shadow-lg transition-shadow cursor-pointer"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="flex items-start space-x-4">
        {tag.image_path ? (
          <img
            src={tag.image_path}
            alt={tag.name}
            className="w-16 h-16 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 ${getTagColor(
              tag.name
            )} text-white text-2xl font-bold`}
          >
            #
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3
            className="font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
            title={tag.name}
          >
            {truncateText(tag.name, 30)}
          </h3>

          {tag.scene_count > 0 && (
            <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
              {tag.scene_count} scene{tag.scene_count !== 1 ? "s" : ""}
            </p>
          )}

          {tag.description && (
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              {truncateText(tag.description, 80)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
};

export default Tags;
