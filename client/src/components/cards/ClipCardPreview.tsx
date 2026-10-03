import { useRef, useState } from "react";
import { getClipPreviewUrl } from "../../api";
import { useHoverCapable } from "../../hooks/useHoverCapable";
import { useInView } from "../../hooks/useInView";
import { usePreviewVideoRef } from "../../hooks/usePreviewVideoRef";
import { clipTitle } from "../../utils/clipTitle";
import type { Clip } from "./ClipCard";

interface Props {
  clip: Clip;
  objectFit?: "contain" | "cover";
  /**
   * Preview while the card is in view (a single-column touch layout, where
   * nothing hovers) instead of while the pointer is over it
   */
  autoplayOnScroll?: boolean;
}

const ClipCardPreview = ({
  clip,
  objectFit = "cover",
  autoplayOnScroll = false,
}: Props) => {
  const [isHovering, setIsHovering] = useState(false);
  const hasHoverCapability = useHoverCapable();
  const containerRef = useRef<HTMLDivElement>(null);
  // The screenshot loads once the card comes within 200px of the viewport
  const shouldLoadScreenshot = useInView(containerRef, {
    rootMargin: "200px",
    once: true,
  });
  // Scroll autoplay, as on the scene cards: the thumbnail is 90% visible,
  // clear of the viewport's top and bottom 5%
  const isInView = useInView(containerRef, {
    rootMargin: "-5% 0px",
    threshold: [0, 0.5, 0.9, 1.0],
    minRatio: 0.9,
    skip: !autoplayOnScroll,
  });

  // Get preview URLs (every clip from the API carries its instance)
  const previewUrl = clip.isGenerated
    ? getClipPreviewUrl(clip.id, clip.instanceId)
    : null;
  // The video's ref loads the preview and releases it on leave
  const previewVideoRef = usePreviewVideoRef(previewUrl);
  // Prefer the marker's own screenshot over the scene cover
  const screenshotUrl =
    clip.screenshotUrl || clip.scene?.pathScreenshot || null;

  const shouldShowVideo =
    (autoplayOnScroll ? isInView : isHovering && hasHoverCapability) &&
    previewUrl;
  const objectFitClass =
    objectFit === "cover" ? "object-cover" : "object-contain";

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      onMouseEnter={() => hasHoverCapability && setIsHovering(true)}
      onMouseLeave={() => hasHoverCapability && setIsHovering(false)}
    >
      {/* Screenshot base layer - lazy loaded */}
      {screenshotUrl ? (
        <img
          src={shouldLoadScreenshot ? screenshotUrl : undefined}
          alt={clipTitle(clip)}
          className={`w-full h-full pointer-events-none ${objectFitClass}`}
          style={{ backgroundColor: "var(--bg-secondary)" }}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ backgroundColor: "var(--bg-tertiary)" }}
        >
          <span style={{ color: "var(--text-tertiary)" }}>No preview</span>
        </div>
      )}

      {/* Video preview overlay - only render when hovering to trigger load */}
      {shouldShowVideo && (
        <video
          ref={previewVideoRef}
          className={`absolute inset-0 w-full h-full pointer-events-none ${objectFitClass}`}
          style={{ backgroundColor: "var(--bg-secondary)" }}
          autoPlay
          loop
          muted
          playsInline
        />
      )}
    </div>
  );
};

export default ClipCardPreview;
