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
 * @returns {Object} Lightbox and pagination state/handlers
 */
export function usePaginatedLightbox({
  perPage = 100,
  totalCount = 0,
  onPageChange,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxAutoPlay, setLightboxAutoPlay] = useState(false);

  // Track pending page load for lightbox cross-page navigation
  const pendingLightboxNav = useRef(null);

  // Track current lightbox index for page sync on close
  const currentLightboxIndex = useRef(0);

  const totalPages = Math.ceil(totalCount / perPage);

  // Handle page change (internal + notify parent)
  const handlePageChange = useCallback(
    (newPage) => {
      setCurrentPage(newPage);
      if (onPageChange) {
        onPageChange(newPage);
      }
    },
    [onPageChange]
  );

  // Handle lightbox reaching page boundary
  // Returns true if navigation was handled (crossing page boundary), false otherwise
  const handlePageBoundary = useCallback(
    (direction) => {
      if (direction === "next" && currentPage < totalPages) {
        // User navigated past last image on current page - load next page
        pendingLightboxNav.current = 0; // First image of next page
        handlePageChange(currentPage + 1);
        return true;
      } else if (direction === "prev" && currentPage > 1) {
        // User navigated before first image on current page - load previous page
        pendingLightboxNav.current = perPage - 1; // Last image of previous page
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
