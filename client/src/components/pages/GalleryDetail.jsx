import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { libraryApi } from "../../services/api.js";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";
import Button from "../ui/Button.jsx";
import RatingControls from "../ui/RatingControls.jsx";
import { ArrowLeft, Play } from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { galleryTitle } from "../../utils/gallery.js";

const GalleryDetail = () => {
  const { galleryId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [gallery, setGallery] = useState(null);

  // Set page title to gallery name
  usePageTitle(gallery ? galleryTitle(gallery) : "Gallery");

  useEffect(() => {
    const fetchGallery = async () => {
      try {
        setIsLoading(true);
        const galleryData = await libraryApi.findGalleryById(galleryId);
        setGallery(galleryData);
      } catch (error) {
        console.error("Error loading gallery:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGallery();
  }, [galleryId]);

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
    <div className="min-h-screen px-4 lg:px-6 xl:px-8">
      <div className="max-w-none">
        {/* Back Button */}
        <div className="mt-6 mb-6">
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
        </div>

        {/* Gallery Header */}
        <div className="mb-8">
          <h1
            className="text-5xl font-bold mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            {galleryTitle(gallery)}
          </h1>

          {/* Gallery metadata */}
          <div className="flex flex-wrap gap-4 mb-4 text-lg" style={{ color: "var(--text-secondary)" }}>
            {gallery.image_count && (
              <span>
                {gallery.image_count} image{gallery.image_count !== 1 ? "s" : ""}
              </span>
            )}
            {gallery.date && (
              <span>
                {new Date(gallery.date).toLocaleDateString()}
              </span>
            )}
            {gallery.photographer && (
              <span>
                by {gallery.photographer}
              </span>
            )}
          </div>

          {/* Rating Controls */}
          <div className="mt-4">
            <RatingControls
              entityType="gallery"
              entityId={gallery.id}
              initialRating={gallery.rating}
              initialFavorite={gallery.favorite || false}
              size={24}
            />
          </div>
        </div>

        {/* Gallery Content */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Content - Images Grid */}
          <div className="flex-1">
            {/* Slideshow Button */}
            <div className="mb-6">
              <Button
                variant="primary"
                icon={<Play size={20} />}
                onClick={() => {
                  // TODO: Open lightbox in slideshow mode
                  console.log("Start slideshow");
                }}
              >
                Play Slideshow
              </Button>
            </div>

            {/* Images Grid - Placeholder for now */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {/* TODO: Load and display actual images */}
              {[...Array(gallery.image_count || 0)].map((_, index) => (
                <div
                  key={index}
                  className="aspect-[2/3] rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                  }}
                  onClick={() => {
                    // TODO: Open lightbox at this image
                    console.log(`Open image ${index}`);
                  }}
                >
                  <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
                    Image {index + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar - Gallery Info */}
          <div className="lg:w-80 space-y-6">
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

            {/* Studio */}
            {gallery.studio && (
              <Card title="Studio">
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/studio/${gallery.studio.id}`)}
                  className="w-full"
                >
                  {gallery.studio.name}
                </Button>
              </Card>
            )}

            {/* Performers */}
            {gallery.performers && gallery.performers.length > 0 && (
              <Card title="Performers">
                <div className="space-y-2">
                  {gallery.performers.map((performer) => (
                    <Button
                      key={performer.id}
                      variant="secondary"
                      onClick={() => navigate(`/performer/${performer.id}`)}
                      className="w-full"
                    >
                      {performer.name}
                    </Button>
                  ))}
                </div>
              </Card>
            )}

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
                <div className="space-y-2">
                  {gallery.scenes.map((scene) => (
                    <Button
                      key={scene.id}
                      variant="secondary"
                      onClick={() => navigate(`/scene/${scene.id}`)}
                      className="w-full text-left"
                    >
                      {scene.title || `Scene ${scene.id}`}
                    </Button>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
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
