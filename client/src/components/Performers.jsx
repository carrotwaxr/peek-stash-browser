import { useState } from "react";
import { Link } from "react-router-dom";
import {
  usePerformersPaginated,
  usePerformersSearch,
} from "../hooks/useLibrary.js";
import {
  PageHeader,
  SearchInput,
  ErrorMessage,
  LoadingSpinner,
  EmptyState,
  Pagination,
} from "./ui/index.js";
import { formatRating, getInitials, truncateText } from "../utils/format.js";

const Performers = () => {
  const [searchMode, setSearchMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const {
    data: paginatedData,
    loading,
    error,
    refetch,
  } = usePerformersPaginated({ page: currentPage });
  const {
    query,
    setQuery,
    results: searchResults,
    loading: searchLoading,
    error: searchError,
    clearSearch,
  } = usePerformersSearch();

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

  const currentError = error || searchError;
  const currentLoading = searchMode ? searchLoading : loading;
  const currentPerformers = searchMode
    ? searchResults?.findPerformers?.performers
    : paginatedData?.performers || [];

  const totalCount = searchMode
    ? searchResults?.findPerformers?.count || 0
    : paginatedData?.count || 0;

  const totalPages = Math.ceil(totalCount / 24);

  if (currentError) {
    return (
      <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
        <PageHeader
          title="Performers"
          subtitle="Browse performers and talent in your library"
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
        title="Performers"
        subtitle="Browse and manage performers in your library"
      >
        <SearchInput
          placeholder="Search performers..."
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

      {currentLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {!currentLoading &&
        (!currentPerformers || currentPerformers.length === 0) && (
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
                  d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                  clipRule="evenodd"
                />
              </svg>
            }
            title={searchMode ? "No performers found" : "No performers"}
            description={
              searchMode
                ? `No performers match your search for "${query}"`
                : "No performers found in your library"
            }
          />
        )}

      {!currentLoading && currentPerformers && currentPerformers.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
            {currentPerformers.map((performer) => (
              <PerformerCard key={performer.id} performer={performer} />
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

const PerformerCard = ({ performer }) => {
  return (
    <Link
      to={`/performer/${performer.id}`}
      className="block rounded-lg border p-4 hover:shadow-lg transition-shadow cursor-pointer"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="text-center">
        {performer.image_path ? (
          <img
            src={performer.image_path}
            alt={performer.name}
            className="w-16 h-16 rounded-full mx-auto mb-3 object-cover"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-lg font-semibold"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
            }}
          >
            {getInitials(performer.name)}
          </div>
        )}

        <h3
          className="font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
          title={performer.name}
        >
          {truncateText(performer.name, 20)}
        </h3>

        {performer.rating100 && (
          <p className="text-sm mb-1" style={{ color: "var(--text-muted)" }}>
            {formatRating(performer.rating100)}
          </p>
        )}

        {performer.scene_count > 0 && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {performer.scene_count} scene
            {performer.scene_count !== 1 ? "s" : ""}
          </p>
        )}

        {performer.favorite && (
          <div className="mt-2">
            <span className="text-yellow-500 text-sm">★ Favorite</span>
          </div>
        )}
      </div>
    </Link>
  );
};

export default Performers;
