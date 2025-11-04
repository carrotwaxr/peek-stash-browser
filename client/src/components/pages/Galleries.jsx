import { useState, useRef, forwardRef } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import deepEqual from "fast-deep-equal";
import {
  PageHeader,
  PageLayout,
  ErrorMessage,
  CardCountsIcons,
} from "../ui/index.js";
import CacheLoadingBanner from "../ui/CacheLoadingBanner.jsx";
import { truncateText } from "../../utils/format.js";
import { galleryTitle } from "../../utils/gallery.js";
import SearchControls from "../ui/SearchControls.jsx";
import RatingControls from "../ui/RatingControls.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { useTVMode } from "../../hooks/useTVMode.js";

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
            <div className="grid xs:grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
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
              <div
                ref={gridRef}
                className="grid xs:grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6"
              >
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
  (
    { gallery, tabIndex, className = "", isTVMode = false, referrerUrl },
    ref
  ) => {
    const coverImage = gallery.paths?.cover || null;

    return (
      <Link
        ref={ref}
        state={{ referrerUrl }}
        to={`/gallery/${gallery.id}`}
        tabIndex={isTVMode ? tabIndex : -1}
        className={`gallery-card block rounded-lg border p-4 hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer focus:outline-none ${className}`}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
        role="button"
        aria-label={`Gallery: ${galleryTitle(gallery)}`}
      >
        <div className="text-center">
          {/* Cover Image */}
          <div className="w-full aspect-[2/3] rounded mb-3 overflow-hidden">
            {coverImage ? (
              <img
                src={coverImage}
                alt={galleryTitle(gallery)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-sm"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-muted)",
                }}
              >
                No Cover
              </div>
            )}
          </div>

          {/* Title */}
          <h3
            className="font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
            title={galleryTitle(gallery)}
          >
            {truncateText(galleryTitle(gallery), 30)}
          </h3>

          {/* Image Count */}
          <CardCountsIcons
            className="mb-2 justify-center"
            imageCount={gallery.image_count}
          />

          {/* Date */}
          {gallery.date && (
            <div
              className="text-xs mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              {new Date(gallery.date).toLocaleDateString()}
            </div>
          )}

          {/* Rating and Favorite */}
          <div
            className="flex items-center justify-center"
            onClick={(e) => e.preventDefault()}
          >
            <RatingControls
              entityType="gallery"
              entityId={gallery.id}
              initialRating={gallery.rating}
              initialFavorite={gallery.favorite || false}
            />
          </div>
        </div>
      </Link>
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
