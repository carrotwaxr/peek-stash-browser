import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Play } from "lucide-react";
import { useNavigationState } from "../../hooks/useNavigationState.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { usePaginatedLightbox } from "../../hooks/usePaginatedLightbox.js";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { libraryApi } from "../../services/api.js";
import { galleryTitle } from "../../utils/gallery.js";
import { getImageTitle } from "../../utils/imageGalleryInheritance.js";
import { getEntityPath } from "../../utils/entityLinks.js";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import {
  Button,
  FavoriteButton,
  LazyImage,
  Lightbox,
  LoadingSpinner,
  PageHeader,
  Pagination,
  RatingSlider,
  TabNavigation,
  TagChips,
} from "../ui/index.js";
import ViewInStashButton from "../ui/ViewInStashButton.jsx";

const PER_PAGE = 100;

const GalleryDetail = () => {
  const { galleryId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [gallery, setGallery] = useState(null);
  const [images, setImages] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [rating, setRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  // Card display settings
  const { getSettings } = useCardDisplaySettings();
  const settings = getSettings("gallery");

  // Get multi-instance config
  const { hasMultipleInstances } = useConfig();

  // Get instance from URL query param for multi-stash support
  const instanceId = searchParams.get("instance");

  // Get active tab from URL or default to 'images'
  const activeTab = searchParams.get('tab') || 'images';

  // URL-based page state for image pagination
  const urlPage = parseInt(searchParams.get('page')) || 1;

  const handleImagePageChange = useCallback((newPage) => {
    const params = new URLSearchParams(searchParams);
    if (newPage === 1) {
      params.delete('page');
    } else {
      params.set('page', String(newPage));
    }
    // Preserve tab param if present
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Fetch function for prefetching adjacent pages
  const fetchPage = useCallback(async (page) => {
    const data = await libraryApi.getGalleryImages(galleryId, {
      page,
      per_page: PER_PAGE,
    });
    return { images: data.images || [] };
  }, [galleryId]);

  // Paginated lightbox state and handlers
  const lightbox = usePaginatedLightbox({
    perPage: PER_PAGE,
    totalCount,
    externalPage: urlPage,
    onExternalPageChange: handleImagePageChange,
    fetchPage,
  });

  // Set page title to gallery name
  usePageTitle(gallery ? galleryTitle(gallery) : "Gallery");

  useEffect(() => {
    const fetchGallery = async () => {
      try {
        setIsLoading(true);
        const galleryData = await libraryApi.findGalleryById(galleryId, instanceId);
        setGallery(galleryData);
        setRating(galleryData.rating);
        setIsFavorite(galleryData.favorite || false);
      } catch (error) {
        console.error("Error loading gallery:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGallery();
  }, [galleryId, instanceId]);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        setImagesLoading(true);
        const data = await libraryApi.getGalleryImages(galleryId, {
          page: lightbox.currentPage,
          per_page: PER_PAGE,
        });
        setImages(data.images || []);
        setTotalCount(data.pagination?.total || data.images?.length || 0);

        // Handle pending lightbox navigation after page loads
        lightbox.consumePendingLightboxIndex();
      } catch (error) {
        console.error("Error loading images:", error);
      } finally {
        setImagesLoading(false);
      }
    };

    fetchImages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, lightbox.currentPage]);

  const handleRatingChange = async (newRating) => {
    setRating(newRating);
    try {
      await libraryApi.updateRating("gallery", galleryId, newRating);
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating(gallery.rating);
    }
  };

  const handleFavoriteChange = async (newValue) => {
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite("gallery", galleryId, newValue);
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite(gallery.favorite || false);
    }
  };

  const toggleFavorite = () => {
    handleFavoriteChange(!isFavorite);
  };

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)
  useRatingHotkeys({
    enabled: !isLoading && !!gallery,
    setRating: handleRatingChange,
    toggleFavorite,
  });

  // No longer using sidebar - all content moved to main header area

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl" style={{ color: "var(--text-primary)" }}>
          Gallery not found
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 lg:px-6 xl:px-8 py-6">
      <div className="max-w-none">
        {/* Back Button and Play Slideshow Button */}
        <div className="flex items-center justify-between mb-4">
          <Button
            onClick={goBack}
            variant="secondary"
            icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
            title={backButtonText}
          >
            <span className="hidden sm:inline">{backButtonText}</span>
          </Button>

          <Button
            variant="primary"
            icon={<Play size={20} />}
            onClick={() => lightbox.openLightbox(0, true)}
            disabled={images.length === 0}
            title="Play Slideshow"
          >
            <span className="hidden sm:inline">Play Slideshow</span>
          </Button>
        </div>

        {/* Header */}
        <div className="mb-6">
          <PageHeader
            title={
              <div className="flex flex-wrap gap-3 items-center">
                <span>{galleryTitle(gallery)}</span>
                {settings.showFavorite && (
                  <FavoriteButton
                    isFavorite={isFavorite}
                    onChange={handleFavoriteChange}
                    size="large"
                  />
                )}
                <ViewInStashButton stashUrl={gallery?.stashUrl} size={24} />
              </div>
            }
            subtitle={
              <div className="flex flex-wrap gap-3 items-center text-base mt-2">
                {gallery.studio && (
                  <>
                    <Link
                      to={getEntityPath('studio', gallery.studio, hasMultipleInstances)}
                      className="hover:underline"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      {gallery.studio.name}
                    </Link>
                    <span>•</span>
                  </>
                )}
                {totalCount > 0 && (
                  <span>
                    {totalCount} image{totalCount !== 1 ? "s" : ""}
                  </span>
                )}
                {gallery.date && (
                  <>
                    <span>•</span>
                    <span>{new Date(gallery.date).toLocaleDateString()}</span>
                  </>
                )}
                {gallery.photographer && (
                  <>
                    <span>•</span>
                    <span>by {gallery.photographer}</span>
                  </>
                )}
              </div>
            }
          />

          {/* Rating Slider */}
          {settings.showRating && (
            <div className="mt-4 max-w-md">
              <RatingSlider
                rating={rating}
                onChange={handleRatingChange}
                showClearButton={true}
              />
            </div>
          )}

          {/* Details */}
          {settings.showDescriptionOnDetail && gallery.details && (
            <div className="mt-6">
              <h3
                className="text-sm font-medium mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                Details
              </h3>
              <p
                className="text-sm whitespace-pre-wrap"
                style={{ color: "var(--text-primary)" }}
              >
                {gallery.details}
              </p>
            </div>
          )}

          {/* Performers Row (kept for at-a-glance importance) */}
          {gallery.performers && gallery.performers.length > 0 && (
            <div className="mt-6">
              <h3
                className="text-sm font-medium mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                Performers
              </h3>
              <div
                className="flex gap-4 overflow-x-auto pb-2 scroll-smooth"
                style={{ scrollbarWidth: "thin" }}
              >
                {gallery.performers.map((performer) => (
                  <Link
                    key={performer.id}
                    to={getEntityPath('performer', performer, hasMultipleInstances)}
                    className="flex flex-col items-center flex-shrink-0 group w-[120px]"
                  >
                    <div
                      className="aspect-[2/3] rounded-lg overflow-hidden mb-2 w-full border-2 border-transparent group-hover:border-[var(--accent-primary)] transition-all"
                      style={{
                        backgroundColor: "var(--border-color)",
                      }}
                    >
                      {performer.image_path ? (
                        <img
                          src={performer.image_path}
                          alt={performer.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span
                            className="text-4xl"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {performer.gender === "MALE" ? "♂" : "♀"}
                          </span>
                        </div>
                      )}
                    </div>
                    <span
                      className="text-xs font-medium text-center w-full line-clamp-2 group-hover:underline"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {performer.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Tags Row */}
          {gallery.tags && gallery.tags.length > 0 && (
            <div className="mt-6">
              <h3
                className="text-sm font-medium mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                Tags
              </h3>
              <TagChips tags={gallery.tags} />
            </div>
          )}
        </div>

        {/* Tabbed Content Section */}
        <div className="mb-6">
          <TabNavigation
            tabs={[
              { id: 'images', label: 'Images', count: totalCount || gallery.image_count || 0 },
              { id: 'scenes', label: 'Scenes', count: gallery.scenes?.length || 0 },
            ]}
            defaultTab="images"
          />

          {/* Images Tab */}
          {activeTab === 'images' && (
            <div className="mt-6">
              {/* Pagination - Top */}
              {lightbox.totalPages > 1 && (
                <div className="mb-4">
                  <Pagination
                    currentPage={lightbox.currentPage}
                    totalPages={lightbox.totalPages}
                    onPageChange={lightbox.setCurrentPage}
                  />
                </div>
              )}

              {imagesLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                  {[...Array(Math.min(PER_PAGE, gallery.image_count || 12))].map(
                    (_, index) => (
                      <div
                        key={index}
                        className="aspect-square rounded-lg animate-pulse"
                        style={{
                          backgroundColor: "var(--bg-tertiary)",
                        }}
                      />
                    )
                  )}
                </div>
              ) : images.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                  {images.map((image, index) => (
                    <LazyImage
                      key={image.id}
                      src={image.paths?.thumbnail}
                      alt={getImageTitle(image)}
                      className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-80 hover:scale-105 transition-all border"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        borderColor: "var(--border-color)",
                      }}
                      onClick={() => lightbox.openLightbox(index)}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="text-center py-12"
                  style={{ color: "var(--text-muted)" }}
                >
                  No images found in this gallery
                </div>
              )}

              {/* Pagination - Bottom */}
              {lightbox.totalPages > 1 && (
                <div className="mt-4">
                  <Pagination
                    currentPage={lightbox.currentPage}
                    totalPages={lightbox.totalPages}
                    onPageChange={lightbox.setCurrentPage}
                  />
                </div>
              )}
            </div>
          )}

          {/* Scenes Tab */}
          {activeTab === 'scenes' && (
            <SceneSearch
              context="gallery_scenes"
              permanentFilters={{
                galleries: {
                  value: [parseInt(galleryId, 10)],
                  modifier: "INCLUDES"
                }
              }}
              permanentFiltersMetadata={{
                galleries: [{ id: galleryId, title: galleryTitle(gallery) }]
              }}
              title={`Scenes in ${galleryTitle(gallery)}`}
              fromPageTitle={galleryTitle(gallery) || "Gallery"}
            />
          )}
        </div>
      </div>

      {/* Lightbox */}
      <Lightbox
        images={images}
        initialIndex={lightbox.lightboxIndex}
        isOpen={lightbox.lightboxOpen}
        autoPlay={lightbox.lightboxAutoPlay}
        onClose={lightbox.closeLightbox}
        onImagesUpdate={setImages}
        onPageBoundary={lightbox.onPageBoundary}
        totalCount={totalCount}
        pageOffset={lightbox.pageOffset}
        onIndexChange={lightbox.onIndexChange}
        isPageTransitioning={lightbox.isPageTransitioning}
        prefetchImages={lightbox.prefetchImages}
      />
    </div>
  );
};

export default GalleryDetail;
