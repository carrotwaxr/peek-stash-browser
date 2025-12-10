import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { useAuth } from "../../hooks/useAuth.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
import { libraryApi } from "../../services/api.js";
import {
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";
import SceneGrid from "./SceneGrid.jsx";

/**
 * SceneSearch is one of the more core Components of the app. It appears on most pages, and utilizes the
 * search functionality of the Stash API to provide a consistent search experience across the app.
 *
 * It displays a search input, sorting & filtering options, and pagination controls. It also handles the logic for
 * performing searches and pagination. Consumers can optionally provide a title/header, permanent filters (for use on
 * a Performer, Studio, or Tag page for instance), and default sorting options.
 */
const SceneSearch = ({
  context, // Optional context for filter preset defaults (scene_performer, scene_tag, etc.)
  initialSort = "o_counter",
  permanentFilters = {},
  permanentFiltersMetadata = {},
  subtitle,
  title,
  captureReferrer = true,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();  // eslint-disable-line no-unused-vars

  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const columns = useGridColumns("scenes");

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [initMessage, setInitMessage] = useState(null);

  // Note: We don't fetch initial data here anymore.
  // SearchControls will trigger the initial query via onQueryChange based on URL params.

  // Handle successful hide - remove scene from state
  const handleHideSuccess = (sceneId) => {
    setData((prevData) => {
      if (!prevData) return prevData;
      return {
        ...prevData,
        scenes: prevData.scenes.filter((s) => s.id !== sceneId),
        count: Math.max(0, prevData.count - 1),
      };
    });
  };

  const handleSceneClick = (scene) => {
    // Navigate to video player page with scene data and virtual playlist context
    const currentScenes = data?.scenes || [];
    const currentIndex = currentScenes.findIndex((s) => s.id === scene.id);

    // Build navigation state
    const navigationState = {
      scene,
      playlist: {
        id: "virtual-grid",
        name: title || "Scene Grid",
        shuffle: false,
        repeat: "none",
        scenes: currentScenes.map((s, idx) => ({
          sceneId: s.id,
          scene: s,
          position: idx,
        })),
        currentIndex: currentIndex >= 0 ? currentIndex : 0,
      },
    };

    // Only capture referrerUrl if captureReferrer is true
    if (captureReferrer) {
      navigationState.referrerUrl = `${location.pathname}${location.search}`;
    }

    navigate(`/scene/${scene.id}`, { state: navigationState });
    return true; // Prevent fallback navigation in SceneCard
  };

  const handleQueryChange = async (newQuery, retryCount = 0) => {
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
      setInitMessage(null);
      const result = await getScenes(newQuery);
      setData(result);
      setIsLoading(false);
    } catch (err) {
      // If server is initializing, show a message and retry after delay
      // Increased retry limit to 60 (5 minutes at 5s intervals) to match server retry logic
      if (err.isInitializing && retryCount < 60) {
        setInitMessage("Server is syncing library, please wait...");
        setTimeout(() => {
          handleQueryChange(newQuery, retryCount + 1);
        }, 5000); // Retry every 5 seconds
        return; // Don't set loading to false, keep the loading state
      }

      setError(err.message || "An error occurred");
      setIsLoading(false);
    }
  };

  const currentScenes = data?.scenes || [];

  const totalCount = data?.count || 0;

  // Read pagination state from lastQuery (SearchControls manages URL params)
  const currentPerPage = lastQuery?.filter?.per_page || 24;

  // Calculate totalPages based on currentPerPage from query
  const totalPages = Math.ceil(totalCount / currentPerPage);

  // TV Navigation - use shared hook for all grid pages
  const {
    isTVMode,
    tvNavigation,
    gridNavigation,
    searchControlsProps,
    gridItemProps,
  } = useGridPageTVNavigation({
    items: currentScenes,
    columns,
    totalPages,
    onItemSelect: handleSceneClick,
  });

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

      {initMessage && <SyncProgressBanner message={initMessage} />}

      <SearchControls
        artifactType="scene"
        context={context}
        initialSort={initialSort}
        onQueryChange={handleQueryChange}
        permanentFilters={permanentFilters}
        permanentFiltersMetadata={permanentFiltersMetadata}
        totalPages={totalPages}
        totalCount={totalCount}
        syncToUrl={captureReferrer}
        {...searchControlsProps}
      >
        <SceneGrid
          scenes={currentScenes || []}
          loading={isLoading}
          error={error}
          onSceneClick={handleSceneClick}
          onHideSuccess={handleHideSuccess}
          emptyMessage="No scenes found"
          emptyDescription="Try adjusting your search filters"
          enableKeyboard={true}
          isTVMode={isTVMode}
          tvGridZoneActive={isTVMode && tvNavigation.isZoneActive("grid")}
          gridNavigation={gridNavigation}
          gridItemProps={gridItemProps}
        />
      </SearchControls>
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
