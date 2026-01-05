import { useCallback, useRef, useState } from "react";

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
 * @returns {Object} Lightbox and pagination state/handlers
 */
export function usePaginatedLightbox({
  perPage = 100,
  totalCount = 0,
  onPageChange,
  externalPage,
  onExternalPageChange,
}) {
  // Internal page state - only used when externalPage is not provided
  const [internalPage, setInternalPage] = useState(1);

  // Use external page if provided, otherwise internal
  const currentPage = externalPage !== undefined ? externalPage : internalPage;

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxAutoPlay, setLightboxAutoPlay] = useState(false);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);

  // Track pending page load for lightbox cross-page navigation
  const pendingLightboxNav = useRef(null);

  // Track current lightbox index for page sync on close
  const currentLightboxIndex = useRef(0);

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

  // Handle lightbox index change (for tracking current position)
  const handleLightboxIndexChange = useCallback((index) => {
    currentLightboxIndex.current = index;
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
  };
}

export default usePaginatedLightbox;
