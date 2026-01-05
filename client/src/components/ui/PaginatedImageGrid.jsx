import { getImageTitle } from "../../utils/imageGalleryInheritance.js";
import { LazyImage } from "./CardComponents.jsx";
import Lightbox from "./Lightbox.jsx";
import Pagination from "./Pagination.jsx";

/**
 * Reusable component for displaying a paginated grid of images with lightbox support.
 * Works with useImagesPagination hook.
 *
 * @param {Object} props
 * @param {Array} props.images - Array of image objects
 * @param {number} props.totalCount - Total number of images across all pages
 * @param {boolean} props.isLoading - Whether images are loading
 * @param {Object} props.lightbox - Lightbox state from usePaginatedLightbox
 * @param {Function} props.setImages - Function to update images (for lightbox edits)
 * @param {string} props.emptyMessage - Message to show when no images
 * @param {string} props.className - Additional className for wrapper
 */
const PaginatedImageGrid = ({
  images,
  totalCount,
  isLoading,
  lightbox,
  setImages,
  emptyMessage = "No images found",
  className = "",
}) => {
  // Render grid content based on loading/empty state
  const renderGridContent = () => {
    if (isLoading) {
      return (
        <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 ${className}`}>
          {[...Array(12)].map((_, index) => (
            <div
              key={index}
              className="aspect-square rounded-lg animate-pulse"
              style={{
                backgroundColor: "var(--bg-tertiary)",
              }}
            />
          ))}
        </div>
      );
    }

    if (!images || images.length === 0) {
      return (
        <div
          className={`text-center py-12 ${className}`}
          style={{ color: "var(--text-muted)" }}
        >
          {emptyMessage}
        </div>
      );
    }

    return (
      <>
        {/* Pagination - Top */}
        {lightbox.totalPages > 1 && (
          <div className={className}>
            <Pagination
              currentPage={lightbox.currentPage}
              totalPages={lightbox.totalPages}
              onPageChange={lightbox.setCurrentPage}
            />
          </div>
        )}

        <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 ${className}`}>
          {images.map((image, index) => (
            <LazyImage
              key={image.id}
              src={image.paths?.thumbnail}
              alt={getImageTitle(image) || `Image ${index + 1}`}
              className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-80 hover:scale-105 transition-all border"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-color)",
              }}
              onClick={() => lightbox.openLightbox(index)}
            />
          ))}
        </div>

        {/* Pagination - Bottom */}
        {lightbox.totalPages > 1 && (
          <div className={className}>
            <Pagination
              currentPage={lightbox.currentPage}
              totalPages={lightbox.totalPages}
              onPageChange={lightbox.setCurrentPage}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <>
      {renderGridContent()}

      {/* Lightbox - always mounted to persist during page transitions */}
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
      />
    </>
  );
};

export default PaginatedImageGrid;
