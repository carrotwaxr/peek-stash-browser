import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Play } from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { usePaginatedLightbox } from "../../hooks/usePaginatedLightbox.js";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys.js";
import { libraryApi } from "../../services/api.js";
import { galleryTitle } from "../../utils/gallery.js";
import {
  Button,
  FavoriteButton,
  LazyImage,
  Lightbox,
  LoadingSpinner,
  PageHeader,
  Pagination,
  RatingSlider,
  TagChips,
} from "../ui/index.js";
import ViewInStashButton from "../ui/ViewInStashButton.jsx";

const PER_PAGE = 100;

const GalleryDetail = () => {
  const { galleryId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [gallery, setGallery] = useState(null);
  const [images, setImages] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [rating, setRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Paginated lightbox state and handlers
  const lightbox = usePaginatedLightbox({
    perPage: PER_PAGE,
    totalCount,
  });

  // Set page title to gallery name
  usePageTitle(gallery ? galleryTitle(gallery) : "Gallery");

  useEffect(() => {
    const fetchGallery = async () => {
      try {
        setIsLoading(true);
        const galleryData = await libraryApi.findGalleryById(galleryId);
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
  }, [galleryId]);

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

  // Check if there's any sidebar content to display (tags moved to main content)
  const hasSidebarContent =
    gallery &&
    ((gallery.scenes && gallery.scenes.length > 0) || gallery.details);

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
            onClick={() =>
              navigate(location.state?.referrerUrl || "/galleries")
            }
            variant="secondary"
            icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
            title="Back to Galleries"
          >
            <span className="hidden sm:inline">Back to Galleries</span>
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
                <FavoriteButton
                  isFavorite={isFavorite}
                  onChange={handleFavoriteChange}
                  size="large"
                />
                <ViewInStashButton stashUrl={gallery?.stashUrl} size={24} />
              </div>
            }
            subtitle={
              <div className="flex flex-wrap gap-3 items-center text-base mt-2">
                {gallery.studio && (
                  <>
                    <Link
                      to={`/studio/${gallery.studio.id}`}
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
          <div className="mt-4 max-w-md">
            <RatingSlider
              rating={rating}
              onChange={handleRatingChange}
              showClearButton={true}
            />
          </div>

          {/* Performers Row */}
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
                    to={`/performer/${performer.id}`}
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

        {/* Images Grid - Conditional sidebar layout */}
        <div
          className={
            hasSidebarContent
              ? "grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6"
              : "mb-6"
          }
        >
          {/* Main Content - Images Grid (full width) */}
          <div>
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
                    alt={image.title || `Image ${index + 1}`}
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

          {/* Sidebar - Metadata (only render if there's content) */}
          {hasSidebarContent && (
            <aside className="space-y-4">
              {/* Linked Scenes */}
              {gallery.scenes && gallery.scenes.length > 0 && (
                <Card title="Related Scenes">
                  <div className="flex flex-col gap-2">
                    {gallery.scenes.map((scene) => (
                      <Button
                        key={scene.id}
                        variant="secondary"
                        onClick={() => navigate(`/scene/${scene.id}`)}
                        className="w-full text-left justify-start truncate"
                        title={scene.title || `Scene ${scene.id}`}
                      >
                        {scene.title || `Scene ${scene.id}`}
                      </Button>
                    ))}
                  </div>
                </Card>
              )}

              {/* Details */}
              {gallery.details && (
                <Card title="Details">
                  <p
                    className="text-sm whitespace-pre-wrap"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {gallery.details}
                  </p>
                </Card>
              )}
            </aside>
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
      />
    </div>
  );
};

// Reusable Card component
const Card = ({ title, children }) => {
  return (
    <div
      className="p-6 rounded-lg border"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      {title && (
        <h3
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
      )}
      {children}
    </div>
  );
};

export default GalleryDetail;
