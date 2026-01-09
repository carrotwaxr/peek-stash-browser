import { useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
import { usePaginatedLightbox } from "../../hooks/usePaginatedLightbox.js";
import { libraryApi } from "../../services/api.js";
import { ImageCard } from "../cards/index.js";
import {
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";
import Lightbox from "../ui/Lightbox.jsx";

const Images = () => {
  usePageTitle("Images");
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const columns = useGridColumns("images");

  // Extract URL pagination params early (needed for hooks)
  const urlPerPage = parseInt(searchParams.get("per_page")) || 24;
  const urlPage = parseInt(searchParams.get("page")) || 1;

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(urlPerPage);

  // Ref to expose SearchControls pagination handler for external use
  const paginationHandlerRef = useRef(null);

  // Ref to store the lightbox consumePendingLightboxIndex function
  // This avoids circular dependency between usePaginatedLightbox and useCancellableQuery
  const consumePendingLightboxIndexRef = useRef(null);

  // Query hook with onDataChange to consume pending lightbox index when data loads
  const { data, isLoading, error, initMessage, execute, setData } = useCancellableQuery({
    onDataChange: () => {
      // Synchronously consume pending lightbox index when new data arrives
      // This fixes flicker during cross-page navigation
      consumePendingLightboxIndexRef.current?.();
    },
  });

  const currentImages = useMemo(() => data?.images || [], [data?.images]);
  const totalCount = data?.count || 0;
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;
  const pageOffset = (urlPage - 1) * urlPerPage;

  // Paginated lightbox with external pagination (synced to URL)
  const lightbox = usePaginatedLightbox({
    perPage: urlPerPage,
    totalCount,
    externalPage: urlPage,
    onExternalPageChange: (newPage) => {
      // Delegate to SearchControls pagination handler
      if (paginationHandlerRef.current) {
        paginationHandlerRef.current(newPage);
      }
    },
  });

  // Destructure for stable references in callbacks
  const { openLightbox } = lightbox;

  // Store the consume function in ref for the onDataChange callback
  consumePendingLightboxIndexRef.current = lightbox.consumePendingLightboxIndex;

  const handleQueryChange = useCallback(
    (newQuery) => {
      execute((signal) => getImages(newQuery, signal));
    },
    [execute]
  );

  // Handle image click - open lightbox
  const handleImageClick = useCallback(
    (image) => {
      const index = currentImages.findIndex((img) => img.id === image.id);
      openLightbox(index >= 0 ? index : 0);
    },
    [currentImages, openLightbox]
  );

  // Handle O counter change from card - update local state
  const handleOCounterChange = useCallback((imageId, newCount) => {
    setData((prev) => ({
      ...prev,
      images: prev.images.map((img) =>
        img.id === imageId ? { ...img, oCounter: newCount } : img
      ),
    }));
  }, [setData]);

  // Handle rating change from card - update local state
  const handleRatingChange = useCallback((imageId, newRating) => {
    setData((prev) => ({
      ...prev,
      images: prev.images.map((img) =>
        img.id === imageId ? { ...img, rating100: newRating } : img
      ),
    }));
  }, [setData]);

  // Handle favorite change from card - update local state
  const handleFavoriteChange = useCallback((imageId, newFavorite) => {
    setData((prev) => ({
      ...prev,
      images: prev.images.map((img) =>
        img.id === imageId ? { ...img, favorite: newFavorite } : img
      ),
    }));
  }, [setData]);

  // TV Navigation - use shared hook for all grid pages
  // Note: We use our own paginationHandlerRef for lightbox cross-page navigation
  const {
    isTVMode,
    _tvNavigation,
    searchControlsProps,
    gridItemProps,
  } = useGridPageTVNavigation({
    items: currentImages,
    columns,
    totalPages,
    onItemSelect: handleImageClick,
  });

  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !isLoading && currentImages.length > 0 && isTVMode
  );

  if (error && !initMessage) {
    return (
      <PageLayout>
        <PageHeader title="Images" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader
          title="Images"
          subtitle="Browse all images in your library"
        />

        {initMessage && <SyncProgressBanner message={initMessage} />}

        <SearchControls
          artifactType="image"
          initialSort="created_at"
          onQueryChange={handleQueryChange}
          onPerPageStateChange={setEffectivePerPage}
          totalPages={totalPages}
          totalCount={totalCount}
          {...searchControlsProps}
          paginationHandlerRef={paginationHandlerRef}
        >
          {isLoading ? (
            <div className={`${STANDARD_GRID_CONTAINER_CLASSNAMES} xl:grid-cols-4 2xl:grid-cols-5`}>
              {[...Array(24)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg animate-pulse"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    height: "16rem",
                  }}
                />
              ))}
            </div>
          ) : (
            <>
              <div ref={gridRef} className={`${STANDARD_GRID_CONTAINER_CLASSNAMES} xl:grid-cols-4 2xl:grid-cols-5`}>
                {currentImages.map((image, index) => {
                  const itemProps = gridItemProps(index);
                  return (
                    <ImageCard
                      key={image.id}
                      image={image}
                      onClick={() => handleImageClick(image)}
                      fromPageTitle="Images"
                      tabIndex={isTVMode ? itemProps.tabIndex : -1}
                      onOCounterChange={handleOCounterChange}
                      onRatingChange={handleRatingChange}
                      onFavoriteChange={handleFavoriteChange}
                      {...itemProps}
                    />
                  );
                })}
              </div>
            </>
          )}
        </SearchControls>

        {/* Lightbox for viewing images */}
        {currentImages.length > 0 && (
          <Lightbox
            isOpen={lightbox.lightboxOpen}
            images={currentImages.map((img) => ({
              ...img,
              paths: {
                image: img.paths?.image || `/api/proxy/image/${img.id}/image`,
                preview: img.paths?.preview || img.paths?.thumbnail,
                thumbnail: img.paths?.thumbnail || `/api/proxy/image/${img.id}/thumbnail`,
              },
              oCounter: img.oCounter ?? 0,
            }))}
            initialIndex={lightbox.lightboxIndex}
            onClose={lightbox.closeLightbox}
            onImagesUpdate={(updatedImages) => {
              // Sync updated images back to page state
              setData((prev) => ({
                ...prev,
                images: prev.images.map((img) => {
                  const updated = updatedImages.find((u) => u.id === img.id);
                  return updated ? { ...img, ...updated } : img;
                }),
              }));
            }}
            // Cross-page navigation support
            onPageBoundary={lightbox.onPageBoundary}
            totalCount={totalCount}
            pageOffset={pageOffset}
            isPageTransitioning={lightbox.isPageTransitioning}
          />
        )}
      </div>
    </PageLayout>
  );
};

const getImages = async (query, signal) => {
  const response = await libraryApi.findImages(query, signal);

  const findImages = response?.findImages;
  const result = {
    images: findImages?.images || [],
    count: findImages?.count || 0,
  };

  return result;
};

export default Images;
