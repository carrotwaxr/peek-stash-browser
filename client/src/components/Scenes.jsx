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

const Scenes = () => {
  const navigate = useNavigate();
  const [searchMode, setSearchMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const {
    data: paginatedData,
    loading,
    error,
    refetch,
  } = useScenesPaginated({
    page: currentPage,
    perPage: 24,
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
