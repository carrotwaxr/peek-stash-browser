import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate, Link } from "react-router-dom";
import { libraryApi } from "../../services/api.js";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";
import Button from "../ui/Button.jsx";
import RatingSlider from "../ui/RatingSlider.jsx";
import FavoriteButton from "../ui/FavoriteButton.jsx";
import Lightbox from "../ui/Lightbox.jsx";
import { ArrowLeft, Play } from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { galleryTitle } from "../../utils/gallery.js";
import PageHeader from "../ui/PageHeader.jsx";

const GalleryDetail = () => {
  const { galleryId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [gallery, setGallery] = useState(null);
  const [images, setImages] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxAutoPlay, setLightboxAutoPlay] = useState(false);
  const [rating, setRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);

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
        const data = await libraryApi.getGalleryImages(galleryId);
        setImages(data.images || []);
      } catch (error) {
        console.error("Error loading images:", error);
      } finally {
        setImagesLoading(false);
      }
    };

    fetchImages();
  }, [galleryId]);

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
        {/* Back Button and Header */}
        <div className="mb-6">
          <Button
            onClick={() =>
              navigate(location.state?.referrerUrl || "/galleries")
            }
            variant="secondary"
            icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
            title="Back to Galleries"
            className="mb-4"
          >
            <span className="hidden sm:inline">Back to Galleries</span>
          </Button>

          <PageHeader
            title={
              <div className="flex flex-wrap gap-3 items-center">
                <span>{galleryTitle(gallery)}</span>
                <FavoriteButton
                  isFavorite={isFavorite}
                  onChange={handleFavoriteChange}
                  size="large"
                />
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
                {gallery.image_count && (
                  <span>
                    {gallery.image_count} image
                    {gallery.image_count !== 1 ? "s" : ""}
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
              <div className="flex gap-4 overflow-x-auto pb-2 scroll-smooth" style={{ scrollbarWidth: "thin" }}>
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
        </div>

        {/* Two-column layout on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6">
          {/* Main Content - Images Grid */}
          <div className="space-y-4">
            {/* Slideshow Button (above grid on mobile, in grid on desktop) */}
            <div className="flex items-center gap-4">
              <Button
                variant="primary"
                icon={<Play size={20} />}
                onClick={() => {
                  setLightboxIndex(0);
                  setLightboxAutoPlay(true);
                  setLightboxOpen(true);
                }}
                disabled={images.length === 0}
              >
                Play Slideshow
              </Button>
            </div>

            {/* Images Grid */}
            <div>
              {imagesLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {[...Array(gallery.image_count || 12)].map((_, index) => (
                    <div
                      key={index}
                      className="aspect-square rounded-lg animate-pulse"
                      style={{
                        backgroundColor: "var(--bg-tertiary)",
                      }}
                    />
                  ))}
                </div>
              ) : images.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {images.map((image, index) => (
                    <div
                      key={image.id}
                      className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-80 hover:scale-105 transition-all border"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        borderColor: "var(--border-color)",
                      }}
                      onClick={() => {
                        setLightboxIndex(index);
                        setLightboxAutoPlay(false);
                        setLightboxOpen(true);
                      }}
                    >
                      {image.paths?.thumbnail ? (
                        <img
                          src={image.paths.thumbnail}
                          alt={image.title || `Image ${index + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-sm"
                          style={{ color: "var(--text-muted)" }}
                        >
                          No Preview
                        </div>
                      )}
                    </div>
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
            </div>
          </div>

          {/* Sidebar - Metadata */}
          <aside className="space-y-4">
            {/* Tags */}
            {gallery.tags && gallery.tags.length > 0 && (
              <Card title="Tags">
                <div className="flex flex-wrap gap-2">
                  {gallery.tags.map((tag) => {
                    const hue = (parseInt(tag.id, 10) * 137.5) % 360;
                    return (
                      <button
                        key={tag.id}
                        onClick={() => navigate(`/tag/${tag.id}`)}
                        className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: `hsl(${hue}, 70%, 45%)`,
                          color: "white",
                        }}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}

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
        </div>
      </div>

      {/* Lightbox */}
      <Lightbox
        images={images}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        autoPlay={lightboxAutoPlay}
        onClose={() => setLightboxOpen(false)}
        onImagesUpdate={setImages}
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
