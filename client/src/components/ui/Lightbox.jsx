import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Play, Pause, Clock } from "lucide-react";
import Button from "./Button.jsx";

const Lightbox = ({ images, initialIndex = 0, isOpen, onClose, autoPlay = false }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [intervalDuration, setIntervalDuration] = useState(5000); // Default 5 seconds
  const intervalRef = useRef(null);

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
      switch (e.key) {
        case "Escape":
          onClose();
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
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, goToPrevious, goToNext, toggleSlideshow]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.95)",
      }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2 rounded-full transition-colors"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          color: "var(--text-primary)",
        }}
        aria-label="Close lightbox"
      >
        <X size={24} />
      </button>

      {/* Image counter */}
      <div
        className="absolute top-4 left-4 z-50 px-4 py-2 rounded-lg text-lg font-medium"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          color: "var(--text-primary)",
        }}
      >
        {currentIndex + 1} / {images.length}
      </div>

      {/* Slideshow control */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-3">
        <Button
          onClick={(e) => {
            e.stopPropagation();
            toggleSlideshow();
          }}
          variant={isPlaying ? "primary" : "secondary"}
          icon={isPlaying ? <Pause size={20} /> : <Play size={20} />}
        >
          {isPlaying ? "Pause" : "Play"} Slideshow
        </Button>

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

      {/* Previous button */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goToPrevious();
          }}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 z-50 p-3 rounded-full transition-colors"
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
          className="absolute right-4 top-1/2 transform -translate-y-1/2 z-50 p-3 rounded-full transition-colors"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            color: "var(--text-primary)",
          }}
          aria-label="Next image"
        >
          <ChevronRight size={32} />
        </button>
      )}

      {/* Image container */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loading spinner */}
        {!imageLoaded && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ color: "var(--text-primary)" }}
          >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current" />
          </div>
        )}

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
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-center max-w-[80vw]"
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
        className="absolute bottom-4 right-4 z-50 px-3 py-2 rounded-lg text-xs"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          color: "var(--text-muted)",
        }}
      >
        <div>← → Navigate</div>
        <div>Space Slideshow</div>
        <div>Esc Close</div>
      </div>
    </div>
  );
};

export default Lightbox;
