import { useRef, useState } from "react";
import { getClipPreviewUrl } from "../../api";
import { useHoverCapable } from "../../hooks/useHoverCapable";
import { useInView } from "../../hooks/useInView";
import type { Clip } from "./ClipCard";

interface Props {
  clip: Clip;
  objectFit?: "contain" | "cover";
}

const ClipCardPreview = ({ clip, objectFit = "cover" }: Props) => {
  const [isHovering, setIsHovering] = useState(false);
  const hasHoverCapability = useHoverCapable();
  const containerRef = useRef<HTMLDivElement>(null);
  // The screenshot loads once the card comes within 200px of the viewport
  const shouldLoadScreenshot = useInView(containerRef, {
    rootMargin: "200px",
    once: true,
  });

  // Get preview URLs (every clip from the API carries its instance)
  const previewUrl = clip.isGenerated
    ? getClipPreviewUrl(clip.id, clip.instanceId)
    : null;
  // Prefer the marker's own screenshot over the scene cover
  const screenshotUrl =
    clip.screenshotUrl || clip.scene?.pathScreenshot || null;

  const shouldShowVideo = isHovering && hasHoverCapability && previewUrl;
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
          alt={clip.title || "Clip"}
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
          src={previewUrl}
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
