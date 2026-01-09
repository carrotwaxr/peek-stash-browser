import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
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
  fromPageTitle,
  syncToUrl = true, // Whether to sync pagination/filters to URL
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const columns = useGridColumns("scenes");

  const { data, isLoading, error, initMessage, execute, setData } = useCancellableQuery();

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

    // Only capture fromPageTitle if provided
    if (fromPageTitle) {
      navigationState.fromPageTitle = fromPageTitle;
    }

    navigate(`/scene/${scene.id}`, { state: navigationState });
    return true; // Prevent fallback navigation in SceneCard
  };

  const handleQueryChange = useCallback(
    (newQuery) => {
      execute((signal) => getScenes(newQuery, signal));
    },
    [execute]
  );

  const currentScenes = data?.scenes || [];

  const totalCount = data?.count || 0;

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page")) || 24
  );
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

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
        onPerPageStateChange={setEffectivePerPage}
        permanentFilters={permanentFilters}
        permanentFiltersMetadata={permanentFiltersMetadata}
        totalPages={totalPages}
        totalCount={totalCount}
        syncToUrl={syncToUrl}
        {...searchControlsProps}
      >
        <SceneGrid
          scenes={currentScenes || []}
          loading={isLoading}
          error={error}
          onSceneClick={handleSceneClick}
          onHideSuccess={handleHideSuccess}
          fromPageTitle={fromPageTitle}
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

const getScenes = async (query, signal) => {
  const response = await libraryApi.findScenes(query, signal);

  // Extract scenes and count from server response structure
  const findScenes = response?.findScenes;
  const result = {
    scenes: findScenes?.scenes || [],
    count: findScenes?.count || 0,
  };
  return result;
};

export default SceneSearch;
