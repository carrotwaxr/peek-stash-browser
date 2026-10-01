import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import MediaImage from "../ui/MediaImage";

interface Props {
  src: string | null | undefined;
  alt: string;
  /** The entity's shape, as a CSS aspect-ratio ("1/1", "7/10", "16/9") */
  aspect: string;
  fit: "contain" | "cover";
  /** Shown without an image, or when it fails to load */
  fallbackIcon: LucideIcon;
  /** The image may be a video (tag images from tag-import plugins) */
  media?: boolean;
}

/**
 * A detail page's main image, in the entity's shape, at most half the
 * screen tall; its fallback icon without an image or when it fails.
 */
const EntityHeroImage = ({
  src,
  alt,
  aspect,
  fit,
  fallbackIcon: FallbackIcon,
  media = false,
}: Props) => {
  const [failed, setFailed] = useState(false);
  // A new image gets its own chance to load
  const [failedFor, setFailedFor] = useState(src);
  if (failedFor !== src) {
    setFailedFor(src);
    setFailed(false);
  }

  const showImage = !!src && !failed;
  const imageStyle = { width: "100%", height: "100%", objectFit: fit };
  return (
    <div
      className="rounded-xl overflow-hidden shadow-lg flex items-center justify-center"
      style={{
        backgroundColor: "var(--bg-card)",
        aspectRatio: aspect,
        width: "100%",
        maxHeight: "50vh",
      }}
    >
      {showImage && media && (
        <MediaImage
          src={src}
          alt={alt}
          style={imageStyle}
          onError={() => setFailed(true)}
        />
      )}
      {showImage && !media && (
        <img
          src={src}
          alt={alt}
          style={imageStyle}
          onError={() => setFailed(true)}
        />
      )}
      {!showImage && (
        <FallbackIcon
          data-testid="hero-fallback"
          aria-hidden="true"
          className="w-24 h-24"
          style={{ color: "var(--text-muted)" }}
        />
      )}
    </div>
  );
};

export default EntityHeroImage;
