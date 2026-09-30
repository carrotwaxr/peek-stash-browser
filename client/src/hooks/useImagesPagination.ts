import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PageChangeOptions,
  usePaginatedLightbox,
} from "./usePaginatedLightbox";

/**
 * Hook for managing paginated images with lightbox support.
 * Handles all state management, pagination, and lightbox integration.
 *
 * @param {Object} options
 * @param {Function} options.fetchImages - Async function (page, perPage) => { images: [], count: number }
 * @param {Array} options.dependencies - Additional dependencies for re-fetching (besides page)
 * @param {number} options.perPage - Images per page (default: 100)
 * @param {number} options.externalPage - External page number (from URL), makes hook use external state
 * @param {Function} options.onExternalPageChange - Callback to change external page (required if externalPage provided); a page turned from the lightbox passes `{ replace: true }`
 * @returns {Object} All state and handlers needed for PaginatedImageGrid
 */
interface ImageItem {
  id: string;
  instanceId?: string;
}

interface UseImagesPaginationOptions<T extends ImageItem = ImageItem> {
  fetchImages: (
    page: number,
    perPage: number
  ) => Promise<{ images?: T[]; count?: number }>;
  dependencies?: unknown[];
  perPage?: number;
  externalPage: number;
  onExternalPageChange: (page: number, options?: PageChangeOptions) => void;
}

export function useImagesPagination<T extends ImageItem = ImageItem>({
  fetchImages,
  dependencies = [],
  perPage = 100,
  externalPage,
  onExternalPageChange,
}: UseImagesPaginationOptions<T>) {
  const [images, setImages] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const fetchImagesRef = useRef(fetchImages);
  // The latest page request: an earlier one that answers later is dropped
  const requestSeqRef = useRef(0);

  // Keep fetchImages ref up to date
  useEffect(() => {
    fetchImagesRef.current = fetchImages;
  }, [fetchImages]);

  // Fetch function for prefetching adjacent pages
  const fetchPage = useCallback(
    async (page: number) => {
      const result = await fetchImagesRef.current(page, perPage);
      return { images: result.images ?? [] };
    },
    [perPage]
  );

  // Paginated lightbox state and handlers; the open image is in the URL
  const lightbox = usePaginatedLightbox({
    perPage,
    totalCount,
    externalPage,
    onExternalPageChange,
    fetchPage,
    images,
    ready: !isLoading,
  });

  // Fetch images when page or dependencies change
  useEffect(() => {
    const seq = ++requestSeqRef.current;
    const isLatest = () => seq === requestSeqRef.current;
    const loadImages = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await fetchImagesRef.current(
          lightbox.currentPage,
          perPage
        );
        if (!isLatest()) return;
        setImages(result.images ?? []);
        setTotalCount(result.count || 0);

        // Handle pending lightbox navigation after page loads
        lightbox.consumePendingLightboxIndex();
      } catch (err) {
        if (!isLatest()) return;
        console.error("Error loading images:", err);
        setError(err);
      } finally {
        if (isLatest()) setIsLoading(false);
      }
    };

    void loadImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox.currentPage, ...dependencies]);

  // Wrapper to update images (for lightbox modifications like rating changes)
  const handleImagesUpdate = useCallback((updatedImages: T[]) => {
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
