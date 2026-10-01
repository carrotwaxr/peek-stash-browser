import { type CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { useMediaFallback } from "../../hooks/useMediaFallback";

interface Props extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "onLoad" | "onError" | "src"
> {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
  style?: CSSProperties;
}

/**
 * MediaImage - Smart image component that detects video content and renders appropriately
 *
 * Problem: Some tags have video files (.mp4, .webm) as their images (e.g., from feederbox
 * tag-import plugin). Standard <img> tags can't play these, so they appear broken.
 *
 * Solution: When an image fails to load, check the Content-Type via one cached,
 * abortable HEAD request (`useMediaFallback`).
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
}: Props) => {
  const { isVideo, hasError, onImageError, onVideoError } =
    useMediaFallback(src);

  // The parent hears about a failure once, however it came
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    if (hasError) onErrorRef.current?.();
  }, [hasError]);

  // Show nothing if there's an error (let parent handle placeholder)
  if (hasError) {
    return null;
  }

  if (isVideo) {
    return (
      <video
        src={src ?? undefined}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        className={className}
        style={style}
        onError={onVideoError}
      />
    );
  }

  return (
    <img
      src={src ?? undefined}
      alt={alt}
      className={className}
      style={style}
      onLoad={onLoad}
      onError={onImageError}
      {...props}
    />
  );
};

export default MediaImage;
