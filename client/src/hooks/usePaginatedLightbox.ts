import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { makeCompositeKey } from "../utils/compositeKey";

// Number of images to prefetch ahead and behind current position
export const PREFETCH_COUNT = 3;

/** The URL param that names the open image, as "id:instanceId" */
export const IMAGE_PARAM = "image";

/** An image the lightbox can name in the URL */
interface KeyedImage {
  id?: unknown;
  instanceId?: unknown;
}

/** An image's "id:instanceId": two servers can hold the same id */
const imageKey = (image: KeyedImage) =>
  makeCompositeKey(
    String(image.id),
    typeof image.instanceId === "string" ? image.instanceId : undefined
  );

const NO_IMAGES: readonly KeyedImage[] = [];

/** How a page change asks for its history entry */
export interface PageChangeOptions {
  /** Replace the entry (a page turned from the lightbox) instead of pushing */
  replace?: boolean;
}

interface PaginatedLightboxOptions<TImage> {
  perPage?: number;
  totalCount?: number;
  /** Called after every page change, for side effects */
  onPageChange?: (page: number) => void;
  /** The page from the URL; with it the hook keeps no page of its own */
  externalPage?: number;
  /** Changes the external page; a lightbox crossing asks for a replace */
  onExternalPageChange?: (page: number, options?: PageChangeOptions) => void;
  /** Fetches a page of images for prefetching */
  fetchPage?: (page: number) => Promise<{ images: TImage[] }>;
  /** The current page's images in order: the `image` param names one */
  images?: readonly KeyedImage[];
  /**
   * False until the page's images are loaded (a detail page waits for its
   * entity too): an `image` param from the address opens nothing before
   */
  ready?: boolean;
}

/**
 * A paginated image grid's lightbox. The open image is in the URL as
 * `image=<id:instanceId>`: opening pushes it, so Back closes the lightbox;
 * moving within a page and across a boundary replaces it (the page through
 * `onExternalPageChange(page, { replace: true })`); closing removes it with a
 * replace. An address with the param opens the lightbox on that image once
 * its page is in.
 */
export function usePaginatedLightbox<TImage = unknown>({
  perPage = 100,
  totalCount = 0,
  onPageChange,
  externalPage,
  onExternalPageChange,
  fetchPage,
  images = NO_IMAGES,
  ready = true,
}: PaginatedLightboxOptions<TImage>) {
  // Internal page state - only used when externalPage is not provided
  const [internalPage, setInternalPage] = useState(1);

  // Use external page if provided, otherwise internal
  const currentPage = externalPage ?? internalPage;

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxAutoPlay, setLightboxAutoPlay] = useState(false);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  // Counter that increments on each page boundary crossing and on landing on
  // the new page. Ensures Lightbox resets currentIndex even when lightboxIndex
  // is the same value (e.g., 0 on consecutive forward crossings, or after key
  // repeat moved it within the old page while the new one loaded).
  const [transitionKey, setTransitionKey] = useState(0);
  // The index on a newly loaded page whose image the URL is to name
  const [landingIndex, setLandingIndex] = useState<number | null>(null);

  // Prefetch state for adjacent pages
  const [prevPageImages, setPrevPageImages] = useState<TImage[]>([]);
  const [nextPageImages, setNextPageImages] = useState<TImage[]>([]);
  const prefetchingRef = useRef<{ prev: number | null; next: number | null }>({
    prev: null,
    next: null,
  }); // Track which pages are being fetched

  // Track pending page load for lightbox cross-page navigation
  const pendingLightboxNav = useRef<number | null>(null);

  // Track current lightbox index reported by Lightbox component (for prefetch triggering)
  // This is separate from lightboxIndex which is used as initialIndex prop
  const [trackedIndex, setTrackedIndex] = useState(0);

  const totalPages = Math.ceil(totalCount / perPage);

  // --- The open image in the URL ---
  const [searchParams, setSearchParams] = useSearchParams();
  const imageParam = searchParams.get(IMAGE_PARAM);
  // Values this hook wrote that the URL has not shown yet, oldest first, and
  // the latest value written or seen: a write the router has not rendered
  // yet is not mistaken for Back or an edited address
  const ownWritesRef = useRef<(string | null)[]>([]);
  const latestRef = useRef<string | null>(null);
  // The last value seen in the URL (null first, so an address's param counts
  // as a change)
  const seenRef = useRef<string | null>(null);
  // An address's image, opened once its page is in
  const resolveRef = useRef<string | null>(null);

  const writeImage = useCallback(
    (key: string | null, history: "push" | "replace") => {
      if (key === latestRef.current) return;
      latestRef.current = key;
      ownWritesRef.current.push(key);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (key === null) next.delete(IMAGE_PARAM);
          else next.set(IMAGE_PARAM, key);
          return next;
        },
        { replace: history === "replace" }
      );
    },
    [setSearchParams]
  );

  // Follow the URL: Back (or an edit) that removes the param closes the
  // lightbox; a param this hook did not write (a reload, Forward, a link)
  // opens it on that image once the page's images are in
  useEffect(() => {
    if (imageParam !== seenRef.current) {
      seenRef.current = imageParam;
      const own = ownWritesRef.current.lastIndexOf(imageParam);
      if (own >= 0) {
        ownWritesRef.current.splice(0, own + 1);
        return;
      }
      ownWritesRef.current = [];
      latestRef.current = imageParam;
      resolveRef.current = imageParam;
      if (imageParam === null) {
        pendingLightboxNav.current = null;
        setIsPageTransitioning(false);
        setLandingIndex(null);
        setLightboxOpen(false);
        return;
      }
    }
    const key = resolveRef.current;
    if (key === null || !ready) return;
    const index = images.findIndex((image) => imageKey(image) === key);
    if (index < 0) return;
    resolveRef.current = null;
    setLightboxIndex(index);
    setLightboxAutoPlay(false);
    setLightboxOpen(true);
  }, [imageParam, images, ready]);

  // After a boundary crossing, name the new page's image once it is in
  useEffect(() => {
    if (landingIndex === null) return;
    setLandingIndex(null);
    if (!lightboxOpen || images.length === 0) return;
    const image = images[Math.min(landingIndex, images.length - 1)];
    if (image) writeImage(imageKey(image), "replace");
  }, [landingIndex, lightboxOpen, images, writeImage]);

  // Handle page change - use external callback if provided, otherwise internal
  const changePage = useCallback(
    (newPage: number, options?: PageChangeOptions) => {
      if (externalPage !== undefined && onExternalPageChange) {
        // External pagination mode - call the external handler
        if (options) onExternalPageChange(newPage, options);
        else onExternalPageChange(newPage);
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

  // A page picked in the grid's own pagination: a new history entry
  const handlePageChange = useCallback(
    (newPage: number) => changePage(newPage),
    [changePage]
  );

  // Handle lightbox reaching page boundary
  // Returns true if navigation was handled (crossing page boundary), false otherwise
  const handlePageBoundary = useCallback(
    (direction: "next" | "prev") => {
      if (direction === "next" && currentPage < totalPages) {
        // User navigated past last image on current page - load next page
        const targetIndex = 0; // First image of next page
        setLightboxIndex(targetIndex); // Update immediately to prevent counter flicker
        setTransitionKey((k) => k + 1); // Force Lightbox to reset even if index unchanged
        setIsPageTransitioning(true); // Show loading state until new data arrives
        pendingLightboxNav.current = targetIndex; // Also store for data callback
        changePage(currentPage + 1, { replace: true });
        return true;
      } else if (direction === "prev" && currentPage > 1) {
        // User navigated before first image on current page - load previous page
        const targetIndex = perPage - 1; // Last image of previous page
        setLightboxIndex(targetIndex); // Update immediately to prevent counter flicker
        setTransitionKey((k) => k + 1); // Force Lightbox to reset even if index unchanged
        setIsPageTransitioning(true); // Show loading state until new data arrives
        pendingLightboxNav.current = targetIndex; // Also store for data callback
        changePage(currentPage - 1, { replace: true });
        return true;
      }

      return false; // Let lightbox handle normal wrapping
    },
    [currentPage, totalPages, perPage, changePage]
  );

  // The lightbox moved: track it for prefetching and name its image in the
  // URL. While a crossing's page loads (or before its image is named) the
  // index is the old page's, so it names nothing.
  const handleLightboxIndexChange = useCallback(
    (index: number) => {
      setTrackedIndex(index);
      if (
        !lightboxOpen ||
        pendingLightboxNav.current !== null ||
        landingIndex !== null
      ) {
        return;
      }
      const image = images[index];
      if (image) writeImage(imageKey(image), "replace");
    },
    [lightboxOpen, landingIndex, images, writeImage]
  );

  // Handle lightbox close
  const handleLightboxClose = useCallback(() => {
    setLightboxOpen(false);
    pendingLightboxNav.current = null;
    setIsPageTransitioning(false);
    setLandingIndex(null);
    // The page was already changed via handlePageBoundary during navigation
    writeImage(null, "replace");
  }, [writeImage]);

  // Open lightbox at a specific image
  const openLightbox = useCallback(
    (index: number, autoPlay = false) => {
      setLightboxIndex(index);
      setLightboxAutoPlay(autoPlay);
      setLightboxOpen(true);
      const image = images[index];
      if (image) writeImage(imageKey(image), "push");
    },
    [images, writeImage]
  );

  // Get the pending lightbox index after a page load (for cross-page navigation)
  const consumePendingLightboxIndex = useCallback(() => {
    if (pendingLightboxNav.current !== null) {
      const targetIndex = pendingLightboxNav.current;
      pendingLightboxNav.current = null;
      setLightboxIndex(targetIndex);
      // Reset the lightbox to the target even when its index already is it
      setTransitionKey((k) => k + 1);
      setIsPageTransitioning(false); // New data has arrived, stop showing loading state
      setLandingIndex(targetIndex);
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
        .then(({ images: fetched }) => {
          // Only update if we're still on the same page
          if (prefetchingRef.current.next === currentPage + 1) {
            setNextPageImages(fetched.slice(0, PREFETCH_COUNT));
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
        .then(({ images: fetched }) => {
          // Only update if we're still on the same page
          if (prefetchingRef.current.prev === currentPage - 1) {
            setPrevPageImages(fetched.slice(-PREFETCH_COUNT));
          }
        })
        .catch(() => {
          // Silently fail - prefetching is best-effort
          prefetchingRef.current.prev = null;
        });
    }
  }, [
    lightboxOpen,
    trackedIndex,
    currentPage,
    totalPages,
    perPage,
    fetchPage,
    nextPageImages.length,
    prevPageImages.length,
  ]);

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
    transitionKey,

    // Lightbox handlers
    openLightbox,
    closeLightbox: handleLightboxClose,
    onPageBoundary: totalPages > 1 ? handlePageBoundary : () => false,
    onIndexChange: handleLightboxIndexChange,

    // For consuming pending navigation after page load
    consumePendingLightboxIndex,

    // Images to prefetch (from adjacent pages)
    prefetchImages,
  };
}
