import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { ErrorMessage, LoadingSpinner, PageHeader } from "../ui";
import SceneGrid from "./SceneGrid.jsx";
import SearchControls from "../ui/SearchControls.jsx";
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
  subtitle,
  title,
}) => {
  const navigate = useNavigate();

  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    const sceneFilter = buildSceneFilter({ ...permanentFilters });
    console.log("Built scene filter:", sceneFilter, permanentFilters);
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
        console.error("getScenes error:", err);
        setError(err.message || "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isAuthenticated]);

  const handleSceneClick = (scene) => {
    // Navigate to video player page with scene data
    navigate(`/video/${scene.id}`, { state: { scene } });
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
      console.error("getScenes error:", err);
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const currentScenes = data?.scenes || [];

  const totalCount = data?.count || 0;

  const perPage = lastQuery?.filter?.per_page || 24;
  const totalPages = Math.ceil(totalCount / perPage);

  if (error) {
    return (
      <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
        <PageHeader title={title} subtitle={subtitle} />
        <ErrorMessage error={error} />
      </div>
    );
  }

  return (
    <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
      <PageHeader title={title} subtitle={subtitle} />

      <SearchControls
        initialSort={initialSort}
        onQueryChange={handleQueryChange}
        permanentFilters={permanentFilters}
        totalPages={totalPages}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <SceneGrid
          scenes={currentScenes || []}
          loading={isLoading}
          error={error}
          onSceneClick={handleSceneClick}
          emptyMessage="No scenes found"
          emptyDescription="Try adjusting your search filters"
          enableKeyboard={true}
        />
      )}
    </div>
  );
};

const getScenes = async (query) => {
  console.log("Fetching Scenes with query:", query);
  const response = await libraryApi.findScenes(query);

  // Extract scenes and count from server response structure
  const findScenes = response?.findScenes;
  const result = {
    scenes: findScenes?.scenes || [],
    count: findScenes?.count || 0,
  };
  console.log("Got Scenes:", result);
  return result;
};

export default SceneSearch;
