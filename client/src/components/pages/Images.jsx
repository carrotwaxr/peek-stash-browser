import { useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
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
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const columns = useGridColumns("images");

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [initMessage, setInitMessage] = useState(null);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

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
      const result = await getImages(newQuery);
      setData(result);
      setIsLoading(false);
    } catch (err) {
      if (err.isInitializing && retryCount < 60) {
        setInitMessage("Server is syncing library, please wait...");
        setTimeout(() => {
          handleQueryChange(newQuery, retryCount + 1);
        }, 5000);
        return;
      }
      setError(err.message || "An error occurred");
      setIsLoading(false);
    }
  };

  const currentImages = data?.images || [];
  const totalCount = data?.count || 0;

  const urlPerPage = parseInt(searchParams.get("per_page")) || 24;
  const totalPages = Math.ceil(totalCount / urlPerPage);

  // Handle image click - open lightbox
  const handleImageClick = (image) => {
    const index = currentImages.findIndex((img) => img.id === image.id);
    setLightboxIndex(index >= 0 ? index : 0);
    setLightboxOpen(true);
  };

  // Handle O counter change from card - update local state
  const handleOCounterChange = (imageId, newCount) => {
    setData((prev) => ({
      ...prev,
      images: prev.images.map((img) =>
        img.id === imageId ? { ...img, oCounter: newCount } : img
      ),
    }));
  };

  // TV Navigation - use shared hook for all grid pages
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
          totalPages={totalPages}
          totalCount={totalCount}
          {...searchControlsProps}
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
                      referrerUrl={`${location.pathname}${location.search}`}
                      tabIndex={isTVMode ? itemProps.tabIndex : -1}
                      onOCounterChange={handleOCounterChange}
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
            isOpen={lightboxOpen}
            images={currentImages.map((img) => ({
              id: img.id,
              paths: {
                image: img.paths?.image || `/api/proxy/image/${img.id}/image`,
                preview: img.paths?.preview || img.paths?.thumbnail,
                thumbnail: img.paths?.thumbnail || `/api/proxy/image/${img.id}/thumbnail`,
              },
              title: img.title,
              width: img.width,
              height: img.height,
              rating100: img.rating100,
              favorite: img.favorite,
              oCounter: img.oCounter ?? 0,
            }))}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxOpen(false)}
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
          />
        )}
      </div>
    </PageLayout>
  );
};

const getImages = async (query) => {
  const response = await libraryApi.findImages(query);

  const findImages = response?.findImages;
  const result = {
    images: findImages?.images || [],
    count: findImages?.count || 0,
  };

  return result;
};

export default Images;
