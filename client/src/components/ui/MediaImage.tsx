import { useState, useCallback, useEffect } from "react";

/**
 * MediaImage - Smart image component that detects video content and renders appropriately
 *
 * Problem: Some tags have video files (.mp4, .webm) as their images (e.g., from feederbox
 * tag-import plugin). Standard <img> tags can't play these, so they appear broken.
 *
 * Solution: When an image fails to load, check the Content-Type via HEAD request.
 * If it's a video type, render as a <video> element instead.
 *
 * @param {string} src - Image/video source URL
 * @param {string} alt - Alt text for the image
 * @param {string} className - CSS classes to apply
 * @param {Function} onLoad - Callback when image loads successfully
 * @param {Function} onError - Callback when both image and video fail
 * @param {Object} style - Inline styles
 * @param {Object} props - Additional props passed to img/video element
 */
const MediaImage = ({
  src,
  alt = "",
  className = "",
  onLoad,
  onError,
  style = {},
  ...props
}) => {
  const [isVideo, setIsVideo] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Reset state when src changes
  useEffect(() => {
    setIsVideo(false);
    setHasError(false);
  }, [src]);

  const handleImageError = useCallback(async () => {
    if (!src) {
      setHasError(true);
      onError?.();
      return;
    }

    // Check Content-Type via HEAD request to determine if it's actually a video
    try {
      const res = await fetch(src, { method: "HEAD" });
      const contentType = res.headers.get("Content-Type");

      if (contentType?.startsWith("video/")) {
        setIsVideo(true);
        return;
      }
    } catch {
      // Network error or CORS issue - fall through to error state
    }

    setHasError(true);
    onError?.();
  }, [src, onError]);

  const handleVideoError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  // Show nothing if there's an error (let parent handle placeholder)
  if (hasError) {
    return null;
  }

  if (isVideo) {
    return (
      <video
        src={src}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        className={className}
        style={style}
        onError={handleVideoError}
        {...props}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      onLoad={onLoad}
      onError={handleImageError}
      {...props}
    />
  );
};

export default MediaImage;
