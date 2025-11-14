import { forwardRef, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { useAuth } from "../../hooks/useAuth.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useTVMode } from "../../hooks/useTVMode.js";
import { libraryApi } from "../../services/api.js";
import { galleryTitle } from "../../utils/gallery.js";
import {
  CacheLoadingBanner,
  ErrorMessage,
  GridCard,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";

const Galleries = () => {
  usePageTitle("Galleries");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isTVMode } = useTVMode();
  const columns = useGridColumns("galleries");

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [initMessage, setInitMessage] = useState(null);

  const handleQueryChange = async (newQuery, retryCount = 0) => {
    if (isAuthLoading || !isAuthenticated) {
      return;
    }

    if (lastQuery && deepEqual(newQuery, lastQuery)) {
      return;
    }

    try {
      setIsLoading(true);
      setLastQuery(newQuery);
      setError(null);
      setInitMessage(null);
      const result = await getGalleries(newQuery);
      setData(result);
      setIsLoading(false);
    } catch (err) {
      if (err.isInitializing && retryCount < 60) {
        setInitMessage("Server is loading cache, please wait...");
        setTimeout(() => {
          handleQueryChange(newQuery, retryCount + 1);
        }, 5000);
        return;
      }
      setError(err.message || "An error occurred");
      setIsLoading(false);
    }
  };

  const currentGalleries = data?.galleries || [];
  const totalCount = data?.count || 0;

  const urlPage = parseInt(searchParams.get("page")) || 1;
  const urlPerPage = parseInt(searchParams.get("per_page")) || 24;
  const totalPages = Math.ceil(totalCount / urlPerPage);

  const { setItemRef, isFocused } = useSpatialNavigation({
    items: currentGalleries,
    columns,
    enabled: !isLoading && isTVMode,
    onSelect: (gallery) => navigate(`/gallery/${gallery.id}`),
    onPageUp: () =>
      urlPage > 1 &&
      handleQueryChange({
        ...lastQuery,
        filter: { ...lastQuery.filter, page: urlPage - 1 },
      }),
    onPageDown: () =>
      urlPage < totalPages &&
      handleQueryChange({
        ...lastQuery,
        filter: { ...lastQuery.filter, page: urlPage + 1 },
      }),
  });

  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !isLoading && currentGalleries.length > 0 && isTVMode
  );

  if (error && !initMessage) {
    return (
      <PageLayout>
        <PageHeader title="Galleries" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  const gridClassNames =
    "card-grid-responsive grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader
          title="Galleries"
          subtitle="Browse image galleries in your library"
        />

        {initMessage && <CacheLoadingBanner message={initMessage} />}

        <SearchControls
          artifactType="gallery"
          initialSort="created_at"
          onQueryChange={handleQueryChange}
          totalPages={totalPages}
          totalCount={totalCount}
        >
          {isLoading ? (
            <div className={gridClassNames}>
              {[...Array(24)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg animate-pulse"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    height: "20rem",
                  }}
                />
              ))}
            </div>
          ) : (
            <>
              <div ref={gridRef} className={gridClassNames}>
                {currentGalleries.map((gallery, index) => (
                  <GalleryCard
                    key={gallery.id}
                    ref={(el) => setItemRef(index, el)}
                    gallery={gallery}
                    tabIndex={isFocused(index) ? 0 : -1}
                    className={isFocused(index) ? "keyboard-focus" : ""}
                    isTVMode={isTVMode}
                    referrerUrl={`${location.pathname}${location.search}`}
                  />
                ))}
              </div>
            </>
          )}
        </SearchControls>
      </div>
    </PageLayout>
  );
};

const GalleryCard = forwardRef(
  ({ gallery, tabIndex, isTVMode = false, referrerUrl, ...others }, ref) => {
    const coverImage = gallery.paths?.cover || null;
    const title = galleryTitle(gallery);
    const date = gallery.date
      ? new Date(gallery.date).toLocaleDateString()
      : null;

    // Build subtitle with studio and date (like Groups and Scenes)
    const subtitle = (() => {
      if (gallery.studio && date) {
        return `${gallery.studio.name} • ${date}`;
      } else if (gallery.studio) {
        return gallery.studio.name;
      } else if (date) {
        return date;
      }
      return null;
    })();

    return (
      <GridCard
        description={gallery.description}
        entityType="gallery"
        imagePath={coverImage}
        indicators={[
          {
            type: "IMAGES",
            count: gallery.image_count,
            tooltipContent:
              gallery.image_count === 1
                ? "1 Image"
                : `${gallery.image_count} Images`,
          },
        ]}
        linkTo={`/gallery/${gallery.id}`}
        ratingControlsProps={{
          entityId: gallery.id,
          initialRating: gallery.rating,
          initialFavorite: gallery.favorite || false,
          initialOCounter: gallery.o_counter,
        }}
        ref={ref}
        referrerUrl={referrerUrl}
        subtitle={subtitle}
        tabIndex={isTVMode ? tabIndex : -1}
        title={title}
        {...others}
      />
    );
  }
);

GalleryCard.displayName = "GalleryCard";

const getGalleries = async (query) => {
  const response = await libraryApi.findGalleries(query);

  const findGalleries = response?.findGalleries;
  const result = {
    galleries: findGalleries?.galleries || [],
    count: findGalleries?.count || 0,
  };

  return result;
};

export default Galleries;
