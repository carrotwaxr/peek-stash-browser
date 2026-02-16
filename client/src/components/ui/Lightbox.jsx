import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Heart, Info, Maximize, Minimize, Pause, Play, Plus, X } from "lucide-react";
import { useSwipeable } from "react-swipeable";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useFullscreen } from "../../hooks/useFullscreen.js";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys.js";
import { apiGet, imageViewHistoryApi, libraryApi } from "../../services/api.js";
import { getImageTitle } from "../../utils/imageGalleryInheritance.js";
import MetadataDrawer from "./MetadataDrawer.jsx";

// Percentage of screen width on each side that triggers navigation on click
const EDGE_ZONE_PERCENT = 0.15;

const Lightbox = ({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  autoPlay = false,
  onImagesUpdate,
  // Cross-page navigation support
  onPageBoundary, // (direction: 'next' | 'prev') => boolean - returns true if page change handled
  totalCount, // Total images across all pages (for counter display)
  pageOffset = 0, // Offset of current page (e.g., page 2 with 100/page = 100)
  onIndexChange, // (index: number) => void - called when current index changes (for syncing with parent)
  isPageTransitioning = false, // Whether we're loading a new page (show loading state, hide current image)
  transitionKey = 0, // Increments on each page boundary crossing to force index reset
  prefetchImages = [], // Images from adjacent pages to prefetch into browser cache
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [intervalDuration, setIntervalDuration] = useState(5000); // Default 5 seconds
  const intervalRef = useRef(null);
  const viewTimerRef = useRef(null);

  // Rating, favorite, and O counter state for current image
  const [rating, setRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [oCounter, setOCounter] = useState(0);

  // New state for enhanced features
  const [controlsVisible, setControlsVisible] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hasHoverCapability, setHasHoverCapability] = useState(true);
  const { isFullscreen, toggleFullscreen, supportsFullscreen } = useFullscreen({
    autoOnLandscape: true,
    enabled: isOpen,
  });
  const controlsTimeoutRef = useRef(null);

  // Zoom/pan state
  const [zoomScale, setZoomScale] = useState(1);
  const transformRef = useRef(null);

  // Double-tap/double-click preference and feedback
  const [doubleTapAction, setDoubleTapAction] = useState("favorite");
  const [doubleTapFeedback, setDoubleTapFeedback] = useState(null); // "favorite" | "o_counter" | "fullscreen" | null
  const lastTapTimeRef = useRef(0);
  const doubleTapFeedbackTimerRef = useRef(null);
  const doubleTapGuardRef = useRef(0);

  // Fetch user's lightbox double-tap preference
  useEffect(() => {
    if (!isOpen) return;
    apiGet("/user/settings")
      .then((data) => {
        const action = data?.settings?.lightboxDoubleTapAction;
        if (action) setDoubleTapAction(action);
      })
      .catch(() => {
        // Silently fall back to default
      });
  }, [isOpen]);

  // Reset index when initialIndex changes, lightbox opens, or page transition occurs.
  // transitionKey ensures this fires even when initialIndex is the same value
  // (e.g., 0 on consecutive forward page boundary crossings).
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setImageLoaded(false);
    }
  }, [initialIndex, isOpen, transitionKey]);

  // Track whether we just completed a page transition.
  // When isPageTransitioning goes true→false, the image container would briefly show
  // the old image before currentIndex updates. We keep it hidden until imageLoaded fires.
  const [isPostTransition, setIsPostTransition] = useState(false);
  const prevTransitioningRef = useRef(isPageTransitioning);

  useEffect(() => {
    if (prevTransitioningRef.current && !isPageTransitioning) {
      // Transition just ended — keep hidden until new image loads
      setIsPostTransition(true);
      setImageLoaded(false);
    }
    prevTransitioningRef.current = isPageTransitioning;
  }, [isPageTransitioning]);

  // Clear post-transition flag when image loads
  useEffect(() => {
    if (imageLoaded && isPostTransition) {
      setIsPostTransition(false);
    }
  }, [imageLoaded, isPostTransition]);

  // Track the current image ID to detect when images array changes during page transitions
  const currentImageId = images[currentIndex]?.id;
  const prevImageIdRef = useRef(currentImageId);

  // Track "stale" image ID when crossing page boundaries
  // When we navigate across a page boundary, we store the current image ID as stale.
  // We refuse to show any image with this ID, preventing the flash of the wrong image
  // while waiting for the new page's data to arrive.
  const staleImageIdRef = useRef(null);

  // Check if current image is stale (should not be displayed)
  const isShowingStaleImage = staleImageIdRef.current !== null && currentImageId === staleImageIdRef.current;

  // Clear stale ref when we get a new (non-stale) image
  useEffect(() => {
    if (staleImageIdRef.current !== null && currentImageId !== staleImageIdRef.current) {
      staleImageIdRef.current = null;
    }
  }, [currentImageId]);

  // Reset imageLoaded when the actual image changes (e.g., during page transitions)
  // This handles the case where initialIndex stays the same (e.g., 0) but images array changes
  useEffect(() => {
    if (prevImageIdRef.current !== currentImageId) {
      setImageLoaded(false);
      prevImageIdRef.current = currentImageId;
    }
  }, [currentImageId]);

  // Reset zoom when image changes
  useEffect(() => {
    if (transformRef.current) {
      transformRef.current.resetTransform(0); // instant reset (0ms)
      setZoomScale(1);
    }
  }, [currentIndex]);

  // Notify parent of index changes (for syncing page on close)
  useEffect(() => {
    if (onIndexChange && isOpen) {
      onIndexChange(currentIndex);
    }
  }, [currentIndex, onIndexChange, isOpen]);

  // Auto-start slideshow if autoPlay is enabled
  useEffect(() => {
    if (isOpen && autoPlay) {
      setIsPlaying(true);
    } else if (!isOpen) {
      setIsPlaying(false);
    }
  }, [isOpen, autoPlay]);

  // Detect hover capability (mouse/trackpad vs touch-only) to hide keyboard hints on mobile
  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover)");
    setHasHoverCapability(mediaQuery.matches);

    const handleChange = (e) => setHasHoverCapability(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Prefetch images from adjacent pages into browser cache
  useEffect(() => {
    if (!isOpen || prefetchImages.length === 0) return;

    // Use fetch with low priority to avoid blocking the main image request
    // AbortController lets us cancel prefetches if component unmounts or images change
    const controller = new AbortController();

    prefetchImages.forEach((img) => {
      const url = img?.paths?.image || img?.paths?.preview;
      if (url) {
        fetch(url, {
          signal: controller.signal,
          priority: "low",
        }).catch(() => {
          // Silently ignore - prefetch is best-effort
        });
      }
    });

    return () => controller.abort();
  }, [isOpen, prefetchImages]);

  // Navigation functions with cross-page support
  const goToPrevious = useCallback(() => {
    if (currentIndex === 0) {
      // At first image - check for previous page
      if (onPageBoundary) {
        // Mark current image as stale BEFORE triggering page change
        // This prevents showing the wrong image while new page loads
        staleImageIdRef.current = images[currentIndex]?.id;
        if (onPageBoundary("prev")) {
          // Page change handled by parent, index will be set via initialIndex prop
          setImageLoaded(false);
          return;
        }
        // No previous page available - clear stale marker
        staleImageIdRef.current = null;
      }
      // No previous page or no handler - wrap to end
      setCurrentIndex(images.length - 1);
    } else {
      setCurrentIndex((prev) => prev - 1);
    }
    setImageLoaded(false);
  }, [currentIndex, images, onPageBoundary]);

  const goToNext = useCallback(() => {
    if (currentIndex === images.length - 1) {
      // At last image - check for next page
      if (onPageBoundary) {
        // Mark current image as stale BEFORE triggering page change
        // This prevents showing the wrong image while new page loads
        staleImageIdRef.current = images[currentIndex]?.id;
        if (onPageBoundary("next")) {
          // Page change handled by parent, index will be set via initialIndex prop
          setImageLoaded(false);
          return;
        }
        // No next page available - clear stale marker
        staleImageIdRef.current = null;
      }
      // No next page or no handler - wrap to start
      setCurrentIndex(0);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
    setImageLoaded(false);
  }, [currentIndex, images, onPageBoundary]);

  // Slideshow control
  const toggleSlideshow = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  // Handle rating change
  const handleRatingChange = useCallback(
    async (newRating) => {
      const currentImage = images[currentIndex];
      if (!currentImage?.id) return;

      // Optimistic update
      const previousRating = rating;
      setRating(newRating);

      // Update the images array so navigation preserves the change
      const updatedImages = [...images];
      updatedImages[currentIndex] = {
        ...currentImage,
        rating100: newRating,
        rating: newRating,
      };
      // Call parent update if provided
      if (onImagesUpdate) {
        onImagesUpdate(updatedImages);
      }

      try {
        await libraryApi.updateRating("image", currentImage.id, newRating, currentImage.instanceId);
      } catch (error) {
        console.error("Failed to update image rating:", error);
        // Revert on error
        setRating(previousRating);
        if (onImagesUpdate) {
          onImagesUpdate(images);
        }
      }
    },
    [images, currentIndex, rating, onImagesUpdate]
  );

  // Handle favorite change
  const handleFavoriteChange = useCallback(
    async (newFavorite) => {
      const currentImage = images[currentIndex];
      if (!currentImage?.id) return;

      // Optimistic update
      const previousFavorite = isFavorite;
      setIsFavorite(newFavorite);

      // Update the images array so navigation preserves the change
      const updatedImages = [...images];
      updatedImages[currentIndex] = {
        ...currentImage,
        favorite: newFavorite,
      };
      // Call parent update if provided
      if (onImagesUpdate) {
        onImagesUpdate(updatedImages);
      }

      try {
        await libraryApi.updateFavorite("image", currentImage.id, newFavorite, currentImage.instanceId);
      } catch (error) {
        console.error("Failed to update image favorite:", error);
        // Revert on error
        setIsFavorite(previousFavorite);
        if (onImagesUpdate) {
          onImagesUpdate(images);
        }
      }
    },
    [images, currentIndex, isFavorite, onImagesUpdate]
  );

  // Handle O counter change
  const handleOCounterChange = useCallback(
    (newCount) => {
      const currentImage = images[currentIndex];
      if (!currentImage?.id) return;

      setOCounter(newCount);

      // Update the images array so navigation preserves the change
      const updatedImages = [...images];
      updatedImages[currentIndex] = {
        ...currentImage,
        oCounter: newCount,
      };
      if (onImagesUpdate) {
        onImagesUpdate(updatedImages);
      }
    },
    [images, currentIndex, onImagesUpdate]
  );

  // Trigger double-tap/double-click action with visual feedback
  const triggerDoubleTapAction = useCallback(() => {
    // Debounce guard: on mobile, both onTap (manual double-tap detection) and
    // native onDoubleClick can fire for the same gesture, causing a double-toggle.
    // Block re-entry within 500ms.
    if (Date.now() - doubleTapGuardRef.current < 500) return;
    doubleTapGuardRef.current = Date.now();

    const currentImage = images[currentIndex];
    if (!currentImage?.id) return;

    // Clear any existing feedback timer
    if (doubleTapFeedbackTimerRef.current) {
      clearTimeout(doubleTapFeedbackTimerRef.current);
    }

    if (doubleTapAction === "o_counter") {
      const newCount = oCounter + 1;
      handleOCounterChange(newCount);
      imageViewHistoryApi.incrementO(currentImage.id).catch((err) => {
        console.error("Failed to increment O counter:", err);
      });
      setDoubleTapFeedback("o_counter");
    } else if (doubleTapAction === "fullscreen") {
      toggleFullscreen();
      setDoubleTapFeedback("fullscreen");
    } else {
      handleFavoriteChange(!isFavorite);
      setDoubleTapFeedback("favorite");
    }

    // Clear feedback after animation
    doubleTapFeedbackTimerRef.current = setTimeout(() => {
      setDoubleTapFeedback(null);
      doubleTapFeedbackTimerRef.current = null;
    }, 800);
  }, [images, currentIndex, doubleTapAction, oCounter, isFavorite, handleOCounterChange, handleFavoriteChange, toggleFullscreen]);

  // Desktop double-click handler on image container
  const handleDoubleClick = useCallback((e) => {
    // Only trigger in center zone (not edge navigation zones)
    const clickX = e.clientX;
    const screenWidth = window.innerWidth;
    const clickPercent = clickX / screenWidth;
    if (clickPercent < EDGE_ZONE_PERCENT || clickPercent > 1 - EDGE_ZONE_PERCENT) return;

    triggerDoubleTapAction();
  }, [triggerDoubleTapAction]);

  // Auto-hide controls after inactivity
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (!drawerOpen) {
        setControlsVisible(false);
      }
    }, 3000);
  }, [drawerOpen]);

  // Exit fullscreen before closing lightbox (for all close triggers)
  const handleCloseWithFullscreenExit = useCallback(() => {
    // Exit browser fullscreen if active
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        // Ignore errors (e.g., if already exiting)
      });
    }
    onClose();
  }, [onClose]);

  // Reset auto-hide on mouse movement (desktop)
  const handleMouseMove = useCallback(() => {
    showControls();
  }, [showControls]);

  // Toggle controls on tap (mobile), with double-tap detection
  const handleTap = useCallback((e) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;
    lastTapTimeRef.current = now;

    if (timeSinceLastTap < 300) {
      // Double-tap detected — check if in center zone
      const tapX = e?.event?.clientX ?? window.innerWidth / 2;
      const screenWidth = window.innerWidth;
      const tapPercent = tapX / screenWidth;
      if (tapPercent >= EDGE_ZONE_PERCENT && tapPercent <= 1 - EDGE_ZONE_PERCENT) {
        triggerDoubleTapAction();
        return;
      }
    }

    setControlsVisible((prev) => !prev);
  }, [triggerDoubleTapAction]);

  const isZoomed = zoomScale > 1;

  // Swipe gesture handlers — disabled when zoomed in so pan gestures work
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => { if (!isZoomed) goToNext(); },
    onSwipedRight: () => { if (!isZoomed) goToPrevious(); },
    onSwipedUp: () => { if (!isZoomed) setDrawerOpen(true); },
    onSwipedDown: () => {
      if (isZoomed) return;
      if (drawerOpen) {
        setDrawerOpen(false);
      } else {
        handleCloseWithFullscreenExit();
      }
    },
    onTap: handleTap,
    delta: 50,
    preventScrollOnSwipe: !isZoomed,
    trackMouse: false,
  });

  // Update rating/favorite/oCounter when image changes
  useEffect(() => {
    const currentImage = images[currentIndex];
    // Note: Images from Stash don't have rating/favorite fields by default
    // We'd need to fetch them separately or include them in the query
    // For now, set to defaults (will be updated when user interacts)
    setRating(currentImage?.rating100 ?? null);
    setIsFavorite(currentImage?.favorite ?? false);
    setOCounter(currentImage?.oCounter ?? 0);
  }, [currentIndex, images]);

  // Track image view with 3-second dwell time
  // Only records if user views image for 3+ seconds (filters rapid navigation)
  // Timer starts after image finishes loading, not when loading begins
  useEffect(() => {
    const currentImage = images[currentIndex];

    // Clear any existing timer
    if (viewTimerRef.current) {
      clearTimeout(viewTimerRef.current);
      viewTimerRef.current = null;
    }

    // Only start timer when image is loaded and lightbox is open
    if (!currentImage?.id || !isOpen || !imageLoaded) return;

    // Start 3-second dwell timer
    viewTimerRef.current = setTimeout(() => {
      imageViewHistoryApi.recordView(currentImage.id).catch((err) => {
        console.error("Failed to record image view:", err);
      });
      viewTimerRef.current = null;
    }, 3000);

    // Cleanup on navigation/close
    return () => {
      if (viewTimerRef.current) {
        clearTimeout(viewTimerRef.current);
        viewTimerRef.current = null;
      }
    };
  }, [currentIndex, images, isOpen, imageLoaded]);

  // Rating hotkeys (r + 1-5 for ratings, r + 0 to clear)
  useRatingHotkeys({
    enabled: isOpen && images.length > 0,
    setRating: handleRatingChange,
    toggleFavorite: () => handleFavoriteChange(!isFavorite),
  });

  // Auto-advance slideshow
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        goToNext();
      }, intervalDuration);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, intervalDuration, goToNext]);

  // Keyboard controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      // Ignore if typing in an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      switch (e.key) {
        case "Escape":
          if (drawerOpen) {
            setDrawerOpen(false);
          } else {
            handleCloseWithFullscreenExit();
          }
          break;
        case "ArrowLeft":
          goToPrevious();
          break;
        case "ArrowRight":
          goToNext();
          break;
        case " ":
          e.preventDefault();
          toggleSlideshow();
          break;
        case "i":
        case "I":
          setDrawerOpen((prev) => !prev);
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        default:
          break;
      }
      showControls();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleCloseWithFullscreenExit, goToPrevious, goToNext, toggleSlideshow, drawerOpen, isFullscreen, toggleFullscreen, showControls]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (doubleTapFeedbackTimerRef.current) {
        clearTimeout(doubleTapFeedbackTimerRef.current);
      }
    };
  }, []);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !images || images.length === 0) return null;

  const currentImage = images[currentIndex];
  const imageSrc = currentImage?.paths?.image || currentImage?.paths?.preview;
  const imageTitle = getImageTitle(currentImage);

  // Handle backdrop click - edge zones navigate, center does nothing
  // Left 15% = previous, right 15% = next, center = no action
  const handleBackdropClick = (e) => {
    // Close drawer if open
    if (drawerOpen) {
      setDrawerOpen(false);
      return;
    }

    // Calculate click position as percentage of screen width
    const clickX = e.clientX;
    const screenWidth = window.innerWidth;
    const clickPercent = clickX / screenWidth;

    if (clickPercent < EDGE_ZONE_PERCENT) {
      goToPrevious();
    } else if (clickPercent > 1 - EDGE_ZONE_PERCENT) {
      goToNext();
    }
    // Center clicks do nothing - user must use X button or Esc to close
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.95)",
      }}
      onMouseMove={handleMouseMove}
      onClick={handleBackdropClick}
    >
      {/* Top controls bar - single row on desktop, wraps on mobile */}
      <div
        className={`absolute top-4 left-4 right-4 z-50 flex flex-wrap justify-between items-center gap-2 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Left side - Slideshow controls */}
        <div className="flex items-center gap-2">
          {/* Play/Pause slideshow */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleSlideshow();
            }}
            className="p-2 rounded-full transition-colors"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              color: "var(--text-primary)",
            }}
            aria-label={isPlaying ? "Pause slideshow" : "Play slideshow"}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>

          {/* Interval selector */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              color: "var(--text-primary)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Clock size={16} />
            <select
              value={intervalDuration}
              onChange={(e) => {
                setIntervalDuration(Number(e.target.value));
                // Restart slideshow if playing
                if (isPlaying) {
                  setIsPlaying(false);
                  setTimeout(() => setIsPlaying(true), 0);
                }
              }}
              className="bg-transparent border-0 outline-none cursor-pointer text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              <option value={2000} style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>2s</option>
              <option value={3000} style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>3s</option>
              <option value={5000} style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>5s</option>
              <option value={10000} style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>10s</option>
              <option value={15000} style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>15s</option>
            </select>
          </div>

        </div>

        {/* Right side - Lightbox controls */}
        <div className="flex items-center gap-2">
          {/* Info button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDrawerOpen(true);
            }}
            className="p-2 rounded-full transition-colors"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              color: "var(--text-primary)",
            }}
            aria-label="Show image info"
          >
            <Info size={24} />
          </button>

          {/* Fullscreen button */}
          {supportsFullscreen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className="p-2 rounded-full transition-colors"
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                color: "var(--text-primary)",
              }}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
            </button>
          )}

          {/* Close button */}
          <button
            onClick={handleCloseWithFullscreenExit}
            className="p-2 rounded-full transition-colors"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              color: "var(--text-primary)",
            }}
            aria-label="Close lightbox"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Image counter - bottom left, hide during page transition to prevent showing stale count */}
      {!isPageTransitioning && (
        <div
          className={`absolute bottom-4 left-4 z-50 px-4 py-2 rounded-lg text-lg font-medium transition-opacity duration-300 ${
            controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            color: "var(--text-primary)",
          }}
        >
          {/* Show global position if totalCount provided, otherwise local position */}
          {totalCount
            ? `${pageOffset + currentIndex + 1} / ${totalCount}`
            : `${currentIndex + 1} / ${images.length}`}
        </div>
      )}

      {/* Previous button - show if multiple images OR if cross-page navigation available */}
      {(images.length > 1 || (totalCount && totalCount > images.length)) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goToPrevious();
          }}
          className={`absolute left-4 top-1/2 transform -translate-y-1/2 z-50 p-3 rounded-full transition-all duration-300 ${
            controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            color: "var(--text-primary)",
          }}
          aria-label="Previous image"
        >
          <ChevronLeft size={32} />
        </button>
      )}

      {/* Next button - show if multiple images OR if cross-page navigation available */}
      {(images.length > 1 || (totalCount && totalCount > images.length)) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goToNext();
          }}
          className={`absolute right-4 top-1/2 transform -translate-y-1/2 z-50 p-3 rounded-full transition-all duration-300 ${
            controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            color: "var(--text-primary)",
          }}
          aria-label="Next image"
        >
          <ChevronRight size={32} />
        </button>
      )}

      {/* Loading spinner - show when image loading, page transitioning, post-transition, or showing stale image */}
      {(!imageLoaded || isPageTransitioning || isPostTransition || isShowingStaleImage) && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ color: "var(--text-primary)" }}
        >
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current" />
        </div>
      )}

      {/* Image container - swipe handlers here so they don't block button taps on letterbox areas */}
      <div
        {...swipeHandlers}
        className={`relative flex items-center justify-center ${isFullscreen ? "w-screen h-screen" : "w-[90vw] h-[90vh]"}`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={handleDoubleClick}
        style={{
          visibility: isPageTransitioning || isShowingStaleImage || isPostTransition ? "hidden" : "visible",
        }}
      >
        {/* Image with pinch-to-zoom and pan support */}
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={1}
          maxScale={5}
          doubleClick={{ disabled: true }}
          onTransformed={(_ref, state) => setZoomScale(state.scale)}
          panning={{ disabled: zoomScale <= 1 }}
          wheel={{ step: 0.2 }}
        >
          <TransformComponent
            wrapperStyle={{ width: "100%", height: "100%" }}
            contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <img
              src={imageSrc}
              alt={imageTitle}
              className="max-w-full max-h-full object-contain"
              style={{
                opacity: imageLoaded ? 1 : 0,
                transition: "opacity 0.2s ease-in-out",
              }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
            />
          </TransformComponent>
        </TransformWrapper>

        {/* Double-tap/double-click visual feedback */}
        {doubleTapFeedback && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
            key={Date.now()}
          >
            <div className="animate-ping-once rounded-full bg-white/20 p-6">
              {doubleTapFeedback === "favorite" ? (
                <Heart size={48} className="text-red-500 fill-red-500" />
              ) : doubleTapFeedback === "fullscreen" ? (
                <Maximize size={48} className="text-white" />
              ) : (
                <div className="flex items-center gap-1 text-white text-3xl font-bold">
                  <Plus size={32} />
                  <span>O</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Image title - hide during page transition or stale image to prevent showing wrong title */}
      {imageTitle && !isPageTransitioning && !isShowingStaleImage && (
        <div
          className={`absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-center max-w-[80vw] transition-opacity duration-300 ${
            controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            color: "var(--text-primary)",
          }}
        >
          {imageTitle}
        </div>
      )}

      {/* Keyboard hints - only show on devices with hover capability (not touch-only) */}
      {hasHoverCapability && (
        <div
          className={`absolute bottom-4 right-4 z-50 px-3 py-2 rounded-lg text-xs transition-opacity duration-300 ${
            controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            color: "var(--text-muted)",
          }}
        >
          <div>← → Navigate</div>
          <div>Space Slideshow</div>
          <div>i Info • f Fullscreen</div>
          <div>Esc Close</div>
        </div>
      )}

      {/* Metadata Drawer */}
      <MetadataDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        image={currentImage}
        rating={rating}
        isFavorite={isFavorite}
        oCounter={oCounter}
        onRatingChange={handleRatingChange}
        onFavoriteChange={handleFavoriteChange}
        onOCounterChange={handleOCounterChange}
      />
    </div>
  );
};

export default Lightbox;
