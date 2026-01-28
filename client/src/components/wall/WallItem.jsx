import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { getEntityPath, getScenePathWithTime } from "../../utils/entityLinks.js";

/**
 * Individual item in the WallView with hover overlay and optional video preview.
 */
const WallItem = ({
  item,
  config,
  entityType,
  width,
  height,
  playbackMode = "autoplay", // "autoplay" | "hover" | "static"
  onClick,
}) => {
  const { hasMultipleInstances } = useConfig();
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const overlayTimeoutRef = useRef(null);

  const imageUrl = config.getImageUrl(item);
  const previewUrl = config.getPreviewUrl(item);
  const title = config.getTitle(item);
  const subtitle = config.getSubtitle(item);
  const hasPreview = config.hasPreview && previewUrl;

  // Compute link path with multi-instance support
  // Clips are special: they link to scene with timestamp
  const linkPath = entityType === "clip"
    ? getScenePathWithTime({ id: item.sceneId, instanceId: item.instanceId }, item.seconds, hasMultipleInstances)
    : getEntityPath(entityType, item, hasMultipleInstances);

  // Intersection Observer for autoplay mode
  useEffect(() => {
    if (playbackMode !== "autoplay" || !hasPreview) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.5 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [playbackMode, hasPreview]);

  // Video playback control
  useEffect(() => {
    if (!videoRef.current || !hasPreview) return;

    const shouldPlay =
      playbackMode === "autoplay"
        ? isInView
        : playbackMode === "hover"
          ? isHovering
          : false;

    if (shouldPlay) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [playbackMode, isInView, isHovering, hasPreview]);

  // Overlay show delay (500ms)
  useEffect(() => {
    if (isHovering) {
      overlayTimeoutRef.current = setTimeout(() => {
        setShowOverlay(true);
      }, 500);
    } else {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
      setShowOverlay(false);
    }

    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, [isHovering]);

  const handleClick = (e) => {
    if (onClick) {
      e.preventDefault();
      onClick(item);
    }
  };

  return (
    <Link
      ref={containerRef}
      to={linkPath}
      onClick={handleClick}
      className="wall-item relative block overflow-hidden"
      style={{ width, height, backgroundColor: "var(--bg-tertiary)" }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Loading spinner */}
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="animate-spin rounded-full border-2 border-t-transparent"
            style={{
              width: "24px",
              height: "24px",
              borderColor: "var(--text-muted)",
              borderTopColor: "transparent",
            }}
          />
        </div>
      )}

      {/* Background image */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
          style={{ opacity: imageLoaded ? 1 : 0 }}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
        />
      )}

      {/* Video preview (for scenes) */}
      {hasPreview && playbackMode !== "static" && (
        <video
          ref={videoRef}
          src={previewUrl}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          loop
          playsInline
          preload="none"
        />
      )}

      {/* Gradient overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none transition-opacity duration-300"
        style={{
          height: "100px",
          background: "linear-gradient(transparent, rgba(0, 0, 0, 0.7))",
          opacity: showOverlay ? 1 : 0,
        }}
      />

      {/* Text overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 p-4 transition-opacity duration-300"
        style={{ opacity: showOverlay ? 1 : 0 }}
      >
        <h3
          className="text-sm font-medium truncate"
          style={{ color: "white" }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            className="text-xs truncate mt-0.5"
            style={{ color: "rgba(255, 255, 255, 0.7)" }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </Link>
  );
};

export default WallItem;
