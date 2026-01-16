import { useCallback, useEffect, useRef, useState } from "react";

// Number of images to prefetch ahead and behind current position
export const PREFETCH_COUNT = 3;

/**
 * Hook for managing paginated image grids with lightbox support.
 * Handles cross-page navigation in the lightbox and syncs the grid page
 * when the lightbox closes.
 *
 * @param {Object} options
 * @param {number} options.perPage - Images per page
 * @param {number} options.totalCount - Total images across all pages
 * @param {Function} options.onPageChange - Callback when page changes (receives new page number)
 * @param {number} options.externalPage - External page number (from URL), makes hook use external state
 * @param {Function} options.onExternalPageChange - Callback to change external page (required if externalPage provided)
 * @param {Function} options.fetchPage - (page: number) => Promise<{ images: Image[] }> - fetches a page of images for prefetching
 * @returns {Object} Lightbox and pagination state/handlers
 */
export function usePaginatedLightbox({
  perPage = 100,
  totalCount = 0,
  onPageChange,
  externalPage,
  onExternalPageChange,
  fetchPage,
}) {
  // Internal page state - only used when externalPage is not provided
  const [internalPage, setInternalPage] = useState(1);

  // Use external page if provided, otherwise internal
  const currentPage = externalPage !== undefined ? externalPage : internalPage;

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxAutoPlay, setLightboxAutoPlay] = useState(false);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);

  // Prefetch state for adjacent pages
  const [prevPageImages, setPrevPageImages] = useState([]);
  const [nextPageImages, setNextPageImages] = useState([]);
  const prefetchingRef = useRef({ prev: null, next: null }); // Track which pages are being fetched

  // Track pending page load for lightbox cross-page navigation
  const pendingLightboxNav = useRef(null);

  // Track current lightbox index reported by Lightbox component (for prefetch triggering)
  // This is separate from lightboxIndex which is used as initialIndex prop
  const [trackedIndex, setTrackedIndex] = useState(0);

  const totalPages = Math.ceil(totalCount / perPage);

  // Handle page change - use external callback if provided, otherwise internal
  const handlePageChange = useCallback(
    (newPage) => {
      if (externalPage !== undefined && onExternalPageChange) {
        // External pagination mode - call the external handler
        onExternalPageChange(newPage);
      } else {
        // Internal pagination mode - update internal state
        setInternalPage(newPage);
      }
      // Always call onPageChange if provided (for additional side effects)
      if (onPageChange) {
        onPageChange(newPage);
      }
    },
    [externalPage, onExternalPageChange, onPageChange]
  );

  // Handle lightbox reaching page boundary
  // Returns true if navigation was handled (crossing page boundary), false otherwise
  const handlePageBoundary = useCallback(
    (direction) => {
      if (direction === "next" && currentPage < totalPages) {
        // User navigated past last image on current page - load next page
        const targetIndex = 0; // First image of next page
        setLightboxIndex(targetIndex); // Update immediately to prevent counter flicker
        setIsPageTransitioning(true); // Show loading state until new data arrives
        pendingLightboxNav.current = targetIndex; // Also store for data callback
        handlePageChange(currentPage + 1);
        return true;
      } else if (direction === "prev" && currentPage > 1) {
        // User navigated before first image on current page - load previous page
        const targetIndex = perPage - 1; // Last image of previous page
        setLightboxIndex(targetIndex); // Update immediately to prevent counter flicker
        setIsPageTransitioning(true); // Show loading state until new data arrives
        pendingLightboxNav.current = targetIndex; // Also store for data callback
        handlePageChange(currentPage - 1);
        return true;
      }

      return false; // Let lightbox handle normal wrapping
    },
    [currentPage, totalPages, perPage, handlePageChange]
  );

  // Handle lightbox index change (for tracking current position for prefetching)
  const handleLightboxIndexChange = useCallback((index) => {
    setTrackedIndex(index);
  }, []);

  // Handle lightbox close
  const handleLightboxClose = useCallback(() => {
    setLightboxOpen(false);
    // The page was already changed via handlePageBoundary during navigation
  }, []);

  // Open lightbox at a specific image
  const openLightbox = useCallback((index, autoPlay = false) => {
    setLightboxIndex(index);
    setLightboxAutoPlay(autoPlay);
    setLightboxOpen(true);
  }, []);

  // Get the pending lightbox index after a page load (for cross-page navigation)
  const consumePendingLightboxIndex = useCallback(() => {
    if (pendingLightboxNav.current !== null) {
      const targetIndex = pendingLightboxNav.current;
      pendingLightboxNav.current = null;
      setLightboxIndex(targetIndex);
      setIsPageTransitioning(false); // New data has arrived, stop showing loading state
      return targetIndex;
    }
    return null;
  }, []);

  // Clear prefetched pages when current page changes (they're no longer adjacent)
  useEffect(() => {
    setPrevPageImages([]);
    setNextPageImages([]);
    prefetchingRef.current = { prev: null, next: null };
  }, [currentPage]);

  // Prefetch adjacent pages when near page boundaries
  useEffect(() => {
    if (!lightboxOpen || !fetchPage) return;

    // Near end of page - prefetch next page
    if (
      trackedIndex >= perPage - PREFETCH_COUNT &&
      currentPage < totalPages &&
      prefetchingRef.current.next !== currentPage + 1 &&
      nextPageImages.length === 0
    ) {
      prefetchingRef.current.next = currentPage + 1;
      fetchPage(currentPage + 1)
        .then(({ images }) => {
          // Only update if we're still on the same page
          if (prefetchingRef.current.next === currentPage + 1) {
            setNextPageImages(images.slice(0, PREFETCH_COUNT));
          }
        })
        .catch(() => {
          // Silently fail - prefetching is best-effort
          prefetchingRef.current.next = null;
        });
    }

    // Near start of page - prefetch previous page
    if (
      trackedIndex < PREFETCH_COUNT &&
      currentPage > 1 &&
      prefetchingRef.current.prev !== currentPage - 1 &&
      prevPageImages.length === 0
    ) {
      prefetchingRef.current.prev = currentPage - 1;
      fetchPage(currentPage - 1)
        .then(({ images }) => {
          // Only update if we're still on the same page
          if (prefetchingRef.current.prev === currentPage - 1) {
            setPrevPageImages(images.slice(-PREFETCH_COUNT));
          }
        })
        .catch(() => {
          // Silently fail - prefetching is best-effort
          prefetchingRef.current.prev = null;
        });
    }
  }, [lightboxOpen, trackedIndex, currentPage, totalPages, perPage, fetchPage, nextPageImages.length, prevPageImages.length]);

  // Compute prefetch images from adjacent pages
  const prefetchImages = [...prevPageImages, ...nextPageImages];

  return {
    // Pagination state
    currentPage,
    totalPages,
    setCurrentPage: handlePageChange,
    pageOffset: (currentPage - 1) * perPage,

    // Lightbox state
    lightboxOpen,
    lightboxIndex,
    lightboxAutoPlay,
    isPageTransitioning,

    // Lightbox handlers
    openLightbox,
    closeLightbox: handleLightboxClose,
    onPageBoundary: totalPages > 1 ? handlePageBoundary : undefined,
    onIndexChange: handleLightboxIndexChange,

    // For consuming pending navigation after page load
    consumePendingLightboxIndex,

    // Images to prefetch (from adjacent pages)
    prefetchImages,
  };
}

export default usePaginatedLightbox;
