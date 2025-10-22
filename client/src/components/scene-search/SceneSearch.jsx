import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { ErrorMessage, LoadingSpinner, PageHeader, PageLayout } from "../ui";
import SceneGrid from "./SceneGrid.jsx";
import SearchControls from "../ui/SearchControls.jsx";
import Pagination from "../ui/Pagination.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import { buildSceneFilter } from "../../utils/filterConfig.js";

/**
 * SceneSearch is one of the more core Components of the app. It appears on most pages, and utilizes the
 * search functionality of the Stash API to provide a consistent search experience across the app.
 *
 * It displays a search input, sorting & filtering options, and pagination controls. It also handles the logic for
 * performing searches and pagination. Consumers can optionally provide a title/header, permanent filters (for use on
 * a Performer, Studio, or Tag page for instance), and default sorting options.
 */
const SceneSearch = ({
  initialSort = "o_counter",
  permanentFilters = {},
  permanentFiltersMetadata = {},
  subtitle,
  title,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    const sceneFilter = buildSceneFilter({ ...permanentFilters });
    // Initial fetch with default parameters
    const query = {
      filter: {
        direction: "DESC",
        page: 1,
        per_page: 24,
        q: "",
        sort: initialSort,
      },
      scene_filter: sceneFilter,
    };

    const fetchInitialData = async () => {
      // Don't make API calls if not authenticated or still checking auth
      if (isAuthLoading || !isAuthenticated) {
        return;
      }

      try {
        setIsLoading(true);
        setLastQuery(query);
        setError(null);
        const result = await getScenes(query);
        setData(result);
      } catch (err) {
        setError(err.message || "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isAuthenticated]);

  const handleSceneClick = (scene) => {
    // Navigate to video player page with scene data and virtual playlist context
    const currentScenes = data?.scenes || [];
    const currentIndex = currentScenes.findIndex(s => s.id === scene.id);

    // Capture current URL with search params for Back button
    const referrerUrl = `${location.pathname}${location.search}`;

    navigate(`/video/${scene.id}`, {
      state: {
        scene,
        referrerUrl, // Store current URL to preserve filters when going back
        playlist: {
          id: "virtual-grid",
          name: title || "Scene Grid",
          shuffle: false,
          repeat: "none",
          scenes: currentScenes.map((s, idx) => ({
            sceneId: s.id,
            scene: s,
            position: idx
          })),
          currentIndex: currentIndex >= 0 ? currentIndex : 0
        }
      }
    });
  };

  const handleQueryChange = async (newQuery) => {
    // Don't make API calls if not authenticated or still checking auth
    if (isAuthLoading || !isAuthenticated) {
      return;
    }

    // Avoid duplicate queries
    if (lastQuery && deepEqual(newQuery, lastQuery)) {
      return;
    }

    try {
      setIsLoading(true);
      setLastQuery(newQuery);
      setError(null);
      const result = await getScenes(newQuery);
      setData(result);
    } catch (err) {
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const currentScenes = data?.scenes || [];

  const totalCount = data?.count || 0;

  // Read pagination state from lastQuery (SearchControls manages URL params)
  const currentPage = lastQuery?.filter?.page || 1;
  const currentPerPage = lastQuery?.filter?.per_page || 24;

  // Calculate totalPages based on currentPerPage from query
  const totalPages = Math.ceil(totalCount / currentPerPage);

  // Bottom pagination handlers - these update URL params which SearchControls will detect
  const handlePageChange = (newPage) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    setSearchParams(params, { replace: true });
  };

  const handlePerPageChange = (newPerPage) => {
    const params = new URLSearchParams(searchParams);
    params.set('per_page', newPerPage.toString());
    params.set('page', '1'); // Reset to first page when changing perPage
    setSearchParams(params, { replace: true });
  };

  if (error) {
    return (
      <PageLayout>
        <PageHeader title={title} subtitle={subtitle} />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader title={title} subtitle={subtitle} />

      <SearchControls
        initialSort={initialSort}
        onQueryChange={handleQueryChange}
        permanentFilters={permanentFilters}
        permanentFiltersMetadata={permanentFiltersMetadata}
        totalPages={totalPages}
        totalCount={totalCount}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <SceneGrid
            scenes={currentScenes || []}
            loading={isLoading}
            error={error}
            onSceneClick={handleSceneClick}
            emptyMessage="No scenes found"
            emptyDescription="Try adjusting your search filters"
            enableKeyboard={true}
          />

          {/* Bottom Pagination */}
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              onPageChange={handlePageChange}
              perPage={currentPerPage}
              onPerPageChange={handlePerPageChange}
              totalCount={totalCount}
              showInfo={true}
              showPerPageSelector={false}
              totalPages={totalPages}
            />
          )}
        </>
      )}
    </PageLayout>
  );
};

const getScenes = async (query) => {
  const response = await libraryApi.findScenes(query);

  // Extract scenes and count from server response structure
  const findScenes = response?.findScenes;
  const result = {
    scenes: findScenes?.scenes || [],
    count: findScenes?.count || 0,
  };
  return result;
};

export default SceneSearch;
