import { useEffect, useState } from "react";
import { getClipPreviewUrl } from "../../services/api.js";

/**
 * Animated preview for clip cards
 * Plays the generated MP4 preview on hover
 *
 * @param {Object} clip - Clip object with id, isGenerated, scene.pathScreenshot
 * @param {string} objectFit - CSS object-fit value: "contain" (default) or "cover"
 */
const ClipCardPreview = ({ clip, objectFit = "cover" }) => {
  const [isHovering, setIsHovering] = useState(false);
  const [hasHoverCapability, setHasHoverCapability] = useState(true);
  const [shouldLoadScreenshot, setShouldLoadScreenshot] = useState(false);
  const [containerElement, setContainerElement] = useState(null);

  // Get preview URLs
  const previewUrl = clip.isGenerated ? getClipPreviewUrl(clip.id) : null;
  // pathScreenshot is already transformed to a proxy URL by the server
  const screenshotUrl = clip.scene?.pathScreenshot || null;

  // Detect hover capability (mouse/trackpad vs touch-only)
  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover)");
    setHasHoverCapability(mediaQuery.matches);

    const handleChange = (e) => {
      setHasHoverCapability(e.matches);
    };
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Lazy loading for screenshots - only load when card enters viewport
  useEffect(() => {
    if (!containerElement || shouldLoadScreenshot) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadScreenshot(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "200px",
        threshold: 0,
      }
    );
    observer.observe(containerElement);

    return () => observer.disconnect();
  }, [containerElement, shouldLoadScreenshot]);

  const shouldShowVideo = isHovering && hasHoverCapability && previewUrl;
  const objectFitClass = objectFit === "cover" ? "object-cover" : "object-contain";

  return (
    <div
      ref={setContainerElement}
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
