import { useCallback, useEffect, useRef, useState } from "react";
import { usePaginatedLightbox } from "./usePaginatedLightbox.js";

/**
 * Hook for managing paginated images with lightbox support.
 * Handles all state management, pagination, and lightbox integration.
 *
 * @param {Object} options
 * @param {Function} options.fetchImages - Async function (page, perPage) => { images: [], count: number }
 * @param {Array} options.dependencies - Additional dependencies for re-fetching (besides page)
 * @param {number} options.perPage - Images per page (default: 100)
 * @param {number} options.externalPage - External page number (from URL), makes hook use external state
 * @param {Function} options.onExternalPageChange - Callback to change external page (required if externalPage provided)
 * @returns {Object} All state and handlers needed for PaginatedImageGrid
 */
export function useImagesPagination({
  fetchImages,
  dependencies = [],
  perPage = 100,
  externalPage,
  onExternalPageChange,
}) {
  const [images, setImages] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const fetchImagesRef = useRef(fetchImages);

  // Keep fetchImages ref up to date
  useEffect(() => {
    fetchImagesRef.current = fetchImages;
  }, [fetchImages]);

  // Fetch function for prefetching adjacent pages
  const fetchPage = useCallback(async (page) => {
    const result = await fetchImagesRef.current(page, perPage);
    return { images: result.images || [] };
  }, [perPage]);

  // Paginated lightbox state and handlers
  const lightbox = usePaginatedLightbox({
    perPage,
    totalCount,
    externalPage,
    onExternalPageChange,
    fetchPage,
  });

  // Fetch images when page or dependencies change
  useEffect(() => {
    const loadImages = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await fetchImagesRef.current(lightbox.currentPage, perPage);
        setImages(result.images || []);
        setTotalCount(result.count || 0);

        // Handle pending lightbox navigation after page loads
        lightbox.consumePendingLightboxIndex();
      } catch (err) {
        console.error("Error loading images:", err);
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadImages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox.currentPage, ...dependencies]);

  // Wrapper to update images (for lightbox modifications like rating changes)
  const handleImagesUpdate = useCallback((updatedImages) => {
    setImages(updatedImages);
  }, []);

  return {
    // Data state
    images,
    totalCount,
    isLoading,
    error,

    // Lightbox integration
    lightbox,

    // Handlers
    setImages: handleImagesUpdate,
  };
}
