import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Info, Maximize, Minimize, Pause, Play, X } from "lucide-react";
import { useSwipeable } from "react-swipeable";
import { useFullscreen } from "../../hooks/useFullscreen.js";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys.js";
import { imageViewHistoryApi, libraryApi } from "../../services/api.js";
import { getImageTitle } from "../../utils/imageGalleryInheritance.js";
import MetadataDrawer from "./MetadataDrawer.jsx";

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
  const { isFullscreen, toggleFullscreen, supportsFullscreen } = useFullscreen();
  const controlsTimeoutRef = useRef(null);

  // Reset index when initialIndex changes
  useEffect(() => {
    setCurrentIndex(initialIndex);
    setImageLoaded(false);
  }, [initialIndex]);

  // Track the current image ID to detect when images array changes during page transitions
  const currentImageId = images[currentIndex]?.id;
  const prevImageIdRef = useRef(currentImageId);

  // Reset imageLoaded when the actual image changes (e.g., during page transitions)
  // This handles the case where initialIndex stays the same (e.g., 0) but images array changes
  useEffect(() => {
    if (prevImageIdRef.current !== currentImageId) {
      setImageLoaded(false);
      prevImageIdRef.current = currentImageId;
    }
  }, [currentImageId]);

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

  // Navigation functions with cross-page support
  const goToPrevious = useCallback(() => {
    if (currentIndex === 0) {
      // At first image - check for previous page
      if (onPageBoundary && onPageBoundary("prev")) {
        // Page change handled by parent, index will be set via initialIndex prop
        setImageLoaded(false);
        return;
      }
      // No previous page or no handler - wrap to end
      setCurrentIndex(images.length - 1);
    } else {
      setCurrentIndex((prev) => prev - 1);
    }
    setImageLoaded(false);
  }, [currentIndex, images.length, onPageBoundary]);

  const goToNext = useCallback(() => {
    if (currentIndex === images.length - 1) {
      // At last image - check for next page
      if (onPageBoundary && onPageBoundary("next")) {
        // Page change handled by parent, index will be set via initialIndex prop
        setImageLoaded(false);
        return;
      }
      // No next page or no handler - wrap to start
      setCurrentIndex(0);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
    setImageLoaded(false);
  }, [currentIndex, images.length, onPageBoundary]);

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
        await libraryApi.updateRating("image", currentImage.id, newRating);
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
        await libraryApi.updateFavorite("image", currentImage.id, newFavorite);
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

  // Reset auto-hide on mouse movement (desktop)
  const handleMouseMove = useCallback(() => {
    showControls();
  }, [showControls]);

  // Toggle controls on tap (mobile)
  const handleTap = useCallback(() => {
    setControlsVisible((prev) => !prev);
  }, []);

  // Swipe gesture handlers
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => goToNext(),
    onSwipedRight: () => goToPrevious(),
    onSwipedUp: () => setDrawerOpen(true),
    onSwipedDown: () => {
      if (drawerOpen) {
        setDrawerOpen(false);
      } else {
        onClose();
      }
    },
    onTap: handleTap,
    delta: 50,
    preventScrollOnSwipe: true,
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
          } else if (isFullscreen) {
            // Browser handles fullscreen exit, but we track state
          } else {
            onClose();
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
  }, [isOpen, onClose, goToPrevious, goToNext, toggleSlideshow, drawerOpen, isFullscreen, toggleFullscreen, showControls]);

  // Cleanup controls timeout
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
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

  // Handle backdrop click - close drawer if open, otherwise close lightbox
  const handleBackdropClick = () => {
    if (drawerOpen) {
      setDrawerOpen(false);
    } else {
      onClose();
    }
  };

  return (
    <div
      {...swipeHandlers}
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
            onClick={onClose}
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

      {/* Loading spinner - show when image loading OR page transitioning */}
      {(!imageLoaded || isPageTransitioning) && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ color: "var(--text-primary)" }}
        >
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current" />
        </div>
      )}

      {/* Image container - hide during page transition to prevent showing stale image */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        style={{
          visibility: isPageTransitioning ? "hidden" : "visible",
        }}
      >
        {/* Image */}
        <img
          src={imageSrc}
          alt={imageTitle}
          className="max-w-full max-h-[90vh] object-contain"
          style={{
            opacity: imageLoaded ? 1 : 0,
            transition: "opacity 0.2s ease-in-out",
          }}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageLoaded(true)}
        />
      </div>

      {/* Image title - hide during page transition to prevent showing stale title */}
      {imageTitle && !isPageTransitioning && (
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
