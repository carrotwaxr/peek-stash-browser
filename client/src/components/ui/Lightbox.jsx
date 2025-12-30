import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Info, Maximize, Minimize, Pause, Play, X } from "lucide-react";
import { useSwipeable } from "react-swipeable";
import { useFullscreen } from "../../hooks/useFullscreen.js";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys.js";
import { imageViewHistoryApi, libraryApi } from "../../services/api.js";
import MetadataDrawer from "./MetadataDrawer.jsx";

const Lightbox = ({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  autoPlay = false,
  onImagesUpdate,
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
  const { isFullscreen, toggleFullscreen, supportsFullscreen } = useFullscreen();
  const controlsTimeoutRef = useRef(null);

  // Reset index when initialIndex changes
  useEffect(() => {
    setCurrentIndex(initialIndex);
    setImageLoaded(false);
  }, [initialIndex]);

  // Auto-start slideshow if autoPlay is enabled
  useEffect(() => {
    if (isOpen && autoPlay) {
      setIsPlaying(true);
    } else if (!isOpen) {
      setIsPlaying(false);
    }
  }, [isOpen, autoPlay]);

  // Navigation functions
  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setImageLoaded(false);
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setImageLoaded(false);
  }, [images.length]);

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
  const imageTitle = currentImage?.title || `Image ${currentIndex + 1}`;

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

      {/* Image counter - bottom left */}
      <div
        className={`absolute bottom-4 left-4 z-50 px-4 py-2 rounded-lg text-lg font-medium transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          color: "var(--text-primary)",
        }}
      >
        {currentIndex + 1} / {images.length}
      </div>

      {/* Previous button */}
      {images.length > 1 && (
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

      {/* Next button */}
      {images.length > 1 && (
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

      {/* Loading spinner - centered in viewport, not in image container */}
      {!imageLoaded && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ color: "var(--text-primary)" }}
        >
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current" />
        </div>
      )}

      {/* Image container */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
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

      {/* Image title */}
      {imageTitle && (
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

      {/* Keyboard hints */}
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
