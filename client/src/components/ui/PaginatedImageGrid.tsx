import { getImageTitle } from "../../utils/imageGalleryInheritance";
import { LazyImage } from "./CardComponents";
import Lightbox from "./Lightbox";
import Pagination from "./Pagination";
import type { NormalizedImage } from "@peek/shared-types";

interface LightboxState {
  currentPage: number;
  totalPages: number;
  setCurrentPage: (page: number) => void;
  lightboxIndex: number;
  lightboxOpen: boolean;
  lightboxAutoPlay: boolean;
  openLightbox: (index: number) => void;
  closeLightbox: () => void;
  onPageBoundary: (direction: "next" | "prev") => boolean;
  pageOffset: number;
  onIndexChange: (index: number) => void;
  isPageTransitioning: boolean;
  transitionKey: number;
  prefetchImages: NormalizedImage[];
}

interface Props {
  images: NormalizedImage[];
  totalCount: number;
  isLoading: boolean;
  lightbox: LightboxState;
  setImages: (images: NormalizedImage[]) => void;
  emptyMessage?: string;
  className?: string;
}

const PaginatedImageGrid = ({
  images,
  totalCount,
  isLoading,
  lightbox,
  setImages,
  emptyMessage = "No images found",
  className = "",
}: Props) => {
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
              alt={getImageTitle(image as Parameters<typeof getImageTitle>[0]) || `Image ${index + 1}`}
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
        transitionKey={lightbox.transitionKey}
        prefetchImages={lightbox.prefetchImages}
      />
    </>
  );
};

export default PaginatedImageGrid;
