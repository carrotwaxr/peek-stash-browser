import { forwardRef, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
import { libraryApi } from "../../services/api.js";
import {
  CacheLoadingBanner,
  ErrorMessage,
  GridCard,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";

const Studios = () => {
  usePageTitle("Studios");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const columns = 3;

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [initMessage, setInitMessage] = useState(null);

  // Note: We don't fetch initial data here anymore.
  // SearchControls will trigger the initial query via onQueryChange based on URL params.

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
      const result = await getStudios(newQuery);
      setData(result);
      setIsLoading(false);
    } catch (err) {
      // If server is initializing, show a message and retry after delay
      if (err.isInitializing && retryCount < 60) {
        setInitMessage("Server is loading cache, please wait...");
        setTimeout(() => {
          handleQueryChange(newQuery, retryCount + 1);
        }, 5000); // Retry every 5 seconds
        return; // Don't set loading to false, keep the loading state
      }

      setError(err.message || "An error occurred");
      setIsLoading(false);
    }
  };

  const currentStudios = data?.studios || [];
  const totalCount = data?.count || 0;

  // Calculate totalPages based on URL params
  const urlPerPage = parseInt(searchParams.get("per_page")) || 24;
  const totalPages = Math.ceil(totalCount / urlPerPage);

  // TV Navigation - use shared hook for all grid pages
  const {
    isTVMode,
    tvNavigation,
    searchControlsProps,
    gridItemProps,
  } = useGridPageTVNavigation({
    items: currentStudios,
    columns,
    totalPages,
    onItemSelect: (studio) => navigate(`/studio/${studio.id}`),
  });

  // Initial focus
  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !isLoading && currentStudios.length > 0 && isTVMode
  );

  // Only show error page for non-initializing errors
  if (error && !initMessage) {
    return (
      <PageLayout>
        <PageHeader title="Studios" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader
          title="Studios"
          subtitle="Browse studios and production companies in your library"
        />

        {initMessage && <CacheLoadingBanner message={initMessage} />}

        {/* Controls Section */}
        <SearchControls
          artifactType="studio"
          initialSort="scenes_count"
          onQueryChange={handleQueryChange}
          totalPages={totalPages}
          totalCount={totalCount}
          {...searchControlsProps}
        >
          {isLoading ? (
            <div className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg animate-pulse"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    height: "18rem",
                  }}
                />
              ))}
            </div>
          ) : (
            <>
              <div ref={gridRef} className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
                {currentStudios.map((studio, index) => {
                  const itemProps = gridItemProps(index);
                  return (
                    <StudioCard
                      key={studio.id}
                      studio={studio}
                      isTVMode={isTVMode}
                      referrerUrl={`${location.pathname}${location.search}`}
                      {...itemProps}
                    />
                  );
                })}
              </div>
            </>
          )}
        </SearchControls>
      </div>
    </PageLayout>
  );
};

const StudioCard = forwardRef(
  ({ studio, tabIndex, isTVMode = false, referrerUrl, ...others }, ref) => {
    const navigate = useNavigate();

    return (
      <GridCard
        description={studio.description}
        entityType="studio"
        imagePath={studio.image_path}
        indicators={[
          { type: "PLAY_COUNT", count: studio.play_count },
          {
            type: "SCENES",
            count: studio.scene_count,
            onClick: studio.scene_count > 0 ? () => navigate(`/scenes?studioId=${studio.id}`) : undefined,
          },
          {
            type: "IMAGES",
            count: studio.image_count,
            onClick: studio.image_count > 0 ? () => navigate(`/images?studioId=${studio.id}`) : undefined,
          },
          {
            type: "GALLERIES",
            count: studio.gallery_count,
            onClick: studio.gallery_count > 0 ? () => navigate(`/galleries?studioId=${studio.id}`) : undefined,
          },
          {
            type: "PERFORMERS",
            count: studio.performer_count,
            onClick: studio.performer_count > 0 ? () => navigate(`/performers?studioId=${studio.id}`) : undefined,
          },
          {
            type: "TAGS",
            count: studio.tags?.length || 0,
            onClick: studio.tags?.length > 0 ? () => navigate(`/tags?studioId=${studio.id}`) : undefined,
          },
        ]}
        linkTo={`/studio/${studio.id}`}
        ratingControlsProps={{
          entityId: studio.id,
          initialRating: studio.rating,
          initialFavorite: studio.favorite || false,
          initialOCounter: studio.o_counter,
        }}
        ref={ref}
        referrerUrl={referrerUrl}
        tabIndex={isTVMode ? tabIndex : -1}
        title={studio.name}
        {...others}
      />
    );
  }
);

StudioCard.displayName = "StudioCard";

const getStudios = async (query) => {
  const response = await libraryApi.findStudios(query);

  // Extract studios and count from server response structure
  const findStudios = response?.findStudios;
  const result = {
    studios: findStudios?.studios || [],
    count: findStudios?.count || 0,
  };
  return result;
};

export default Studios;
