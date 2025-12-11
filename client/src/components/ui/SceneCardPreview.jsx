import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth.js";
import {
  fetchAndParseVTT,
  getEvenlySpacedSprites,
} from "../../utils/spriteSheet.js";

/**
 * Animated preview for scene cards with user-controlled quality preference and smart fallback
 *
 * Preview Quality Modes (user preference):
 * - sprite: Low quality (160px VTT sprite sheet) - default, always available
 * - webp: High quality (640px WebP animation) - falls back to sprite if unavailable
 * - mp4: High quality (640px MP4 video) - falls back to sprite if unavailable
 *
 * Fallback Logic:
 * - sprite preference: Only use sprite (no HTTP requests for high quality)
 * - webp/mp4 preference: Try high quality, fallback to sprite on 404
 * - No cross-fallback between webp and mp4
 *
 * Preview behavior based on input method and layout:
 * - When autoplayOnScroll=true: Preview when scrolled into view (mobile-first)
 * - When autoplayOnScroll=false on hover-capable devices: Preview on hover
 * - When autoplayOnScroll=false on touch-only devices: No preview (static screenshot)
 *
 * Performance optimizations:
 * - Screenshots use IntersectionObserver for true lazy loading (only load when visible)
 * - Animations only fetched when user hovers or scrolls into view
 * - Results cached to prevent re-fetching on subsequent interactions
 * - Combined with backend concurrency limiting to prevent overwhelming Stash
 *
 * @param {Object} scene - Scene object with paths.preview, paths.webp, paths.sprite, paths.vtt
 * @param {boolean} autoplayOnScroll - Enable scroll-based autoplay (typically for 1-column mobile layouts)
 * @param {number} cycleInterval - Milliseconds between sprite changes for VTT previews (default: 800ms)
 * @param {number} spriteCount - Number of sprites to cycle through for VTT previews (default: 5)
 * @param {string} duration - Formatted duration string for bottom-left overlay (e.g., "2h03m")
 * @param {string} resolution - Formatted resolution string for top-right overlay (e.g., "1080p")
 */
const SceneCardPreview = ({
  scene,
  autoplayOnScroll = false,
  cycleInterval = 800,
  spriteCount = 5,
  duration = null,
  resolution = null,
}) => {
  const { user } = useAuth();
  const [sprites, setSprites] = useState([]);
  const [currentSpriteIndex, setCurrentSpriteIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hasHoverCapability, setHasHoverCapability] = useState(true);
  const [containerElement, setContainerElement] = useState(null);
  const [previewDataLoaded, setPreviewDataLoaded] = useState(false);
  const [activePreviewType, setActivePreviewType] = useState(null); // Track which type is actually being used (after fallback)
  const [shouldLoadScreenshot, setShouldLoadScreenshot] = useState(false); // True lazy loading for screenshots
  const intervalRef = useRef(null);

  // Determine preview type based on user preference
  // Note: We don't check if paths exist yet - that happens in the lazy-load effect
  const preferredPreviewType = useMemo(() => {
    const userPref = user?.preferredPreviewQuality || "sprite";

    // For sprite preference, check if VTT/sprite are available
    if (userPref === "sprite") {
      return scene?.paths?.vtt && scene?.paths?.sprite ? "sprite" : null;
    }

    // For high quality preferences, we'll try the preference and fallback to sprite if needed
    return userPref; // 'webp' or 'mp4'
  }, [user?.preferredPreviewQuality, scene?.paths?.vtt, scene?.paths?.sprite]);

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

  // True lazy loading for screenshots - only load when card enters viewport
  // This prevents the browser from queuing all 24+ images at once
  useEffect(() => {
    if (!containerElement || shouldLoadScreenshot) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadScreenshot(true);
          observer.disconnect(); // Only need to trigger once
        }
      },
      {
        rootMargin: "200px", // Start loading slightly before visible
        threshold: 0,
      }
    );
    observer.observe(containerElement);

    return () => observer.disconnect();
  }, [containerElement, shouldLoadScreenshot]);

  // Intersection Observer for scroll-based autoplay (when autoplayOnScroll is enabled)
  useEffect(() => {
    // When autoplayOnScroll is enabled, use intersection observer regardless of hover capability
    // This fixes mobile devices that incorrectly report hover support
    if (!autoplayOnScroll || !containerElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Only autoplay when thumbnail is mostly visible (90%) with clearance from viewport edges
          // The 5% rootMargin shrink ensures thumbnail isn't right at viewport edge
          const newIsInView =
            entry.isIntersecting && entry.intersectionRatio >= 0.9;
          setIsInView(newIsInView);
        });
      },
      {
        threshold: [0, 0.5, 0.9, 1.0],
        rootMargin: "-5% 0px", // 5% clearance from top/bottom, no x-axis restriction
      }
    );
    observer.observe(containerElement);

    return () => observer.disconnect();
  }, [autoplayOnScroll, containerElement]);

  // Lazy-load preview data only when hovering or in view
  // Implements user preference with smart 404 fallback for high quality options
  useEffect(() => {
    // Determine if we should trigger loading
    const shouldTriggerLoad = autoplayOnScroll ? isInView : isHovering;

    // Don't load if not triggered yet, already loaded, no preview type, or already loading
    if (
      !shouldTriggerLoad ||
      previewDataLoaded ||
      !preferredPreviewType ||
      isLoading
    ) {
      return;
    }

    const loadPreview = async () => {
      setIsLoading(true);

      try {
        // Handle sprite preference (low quality, always use sprite)
        if (preferredPreviewType === "sprite") {
          const parsedCues = await fetchAndParseVTT(scene.paths.vtt);
          if (parsedCues.length > 0) {
            const evenlySpaced = getEvenlySpacedSprites(
              parsedCues,
              spriteCount
            );
            setSprites(evenlySpaced);
          }
          setActivePreviewType("sprite");
          setIsLoading(false);
          setPreviewDataLoaded(true);
          return;
        }

        // Handle high quality preferences (webp/mp4) with 404 fallback to sprite
        const previewUrl =
          preferredPreviewType === "mp4"
            ? `/api/proxy/scene/${scene.id}/preview`
            : `/api/proxy/scene/${scene.id}/webp`;

        // Test if high quality preview exists by doing a HEAD request
        const response = await fetch(previewUrl, { method: "HEAD" });

        if (response.ok) {
          // High quality preview available, use it
          setActivePreviewType(preferredPreviewType);
          setIsLoading(false);
          setPreviewDataLoaded(true);
        } else {
          // 404 or other error - fallback to sprite if available
          if (scene?.paths?.vtt && scene?.paths?.sprite) {
            const parsedCues = await fetchAndParseVTT(scene.paths.vtt);
            if (parsedCues.length > 0) {
              const evenlySpaced = getEvenlySpacedSprites(
                parsedCues,
                spriteCount
              );
              setSprites(evenlySpaced);
            }
            setActivePreviewType("sprite");
          } else {
            setActivePreviewType(null); // No fallback available
          }
          setIsLoading(false);
          setPreviewDataLoaded(true);
        }
      } catch (err) {
        console.error("[SceneCardPreview] Error loading preview:", err);
        // On error, try fallback to sprite
        if (scene?.paths?.vtt && scene?.paths?.sprite) {
          try {
            const parsedCues = await fetchAndParseVTT(scene.paths.vtt);
            if (parsedCues.length > 0) {
              const evenlySpaced = getEvenlySpacedSprites(
                parsedCues,
                spriteCount
              );
              setSprites(evenlySpaced);
            }
            setActivePreviewType("sprite");
          } catch {
            setActivePreviewType(null);
          }
        } else {
          setActivePreviewType(null);
        }
        setIsLoading(false);
        setPreviewDataLoaded(true);
      }
    };

    loadPreview();
  }, [
    isHovering,
    isInView,
    autoplayOnScroll,
    preferredPreviewType,
    previewDataLoaded,
    isLoading,
    scene?.paths?.vtt,
    scene?.paths?.sprite,
    scene?.id,
    spriteCount,
  ]);

  // Measure container width on mount and when hovering
  useEffect(() => {
    if (!containerElement) return;

    const updateWidth = () => {
      if (containerElement) {
        setContainerWidth(containerElement.offsetWidth);
      }
    };

    // Set initial width
    updateWidth();

    // Update on resize
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(containerElement);

    return () => resizeObserver.disconnect();
  }, [containerElement]);

  // Update width when starting to hover
  useEffect(() => {
    if (isHovering && containerElement && containerWidth === 0) {
      setContainerWidth(containerElement.offsetWidth);
    }
  }, [isHovering, containerWidth, containerElement]);

  // Cycle through sprites (only for sprite preview type)
  useEffect(() => {
    // Only cycle if we're using sprite preview type
    if (activePreviewType !== "sprite") {
      return;
    }

    // Determine if we should animate based on hover capability and autoplayOnScroll setting
    const shouldAnimate = autoplayOnScroll
      ? isInView // When autoplayOnScroll is enabled, animate when in view (mobile-first)
      : hasHoverCapability
        ? isHovering
        : false; // Otherwise, use hover detection

    if (!shouldAnimate || sprites.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCurrentSpriteIndex(0);
      return;
    }

    // Start cycling through sprite sheet
    intervalRef.current = setInterval(() => {
      setCurrentSpriteIndex((prev) => (prev + 1) % sprites.length);
    }, cycleInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    activePreviewType,
    isHovering,
    isInView,
    hasHoverCapability,
    autoplayOnScroll,
    sprites.length,
    cycleInterval,
  ]);

  // Determine if we should show animation based on hover/scroll state
  const shouldShowAnimation = autoplayOnScroll
    ? isInView
    : hasHoverCapability
      ? isHovering
      : false;

  // For sprite preview, calculate scale factor
  const currentSprite = sprites[currentSpriteIndex];
  const scale =
    currentSprite && containerWidth > 0
      ? containerWidth / currentSprite.width
      : 1;

  // Build preview URL for video/webp (proxied through backend to hide API keys)
  const getPreviewUrl = () => {
    if (activePreviewType === "mp4" && scene?.id) {
      return `/api/proxy/scene/${scene.id}/preview`;
    }
    if (activePreviewType === "webp" && scene?.id) {
      return `/api/proxy/scene/${scene.id}/webp`;
    }
    return null;
  };

  return (
    <div
      ref={setContainerElement}
      className="w-full h-full relative overflow-hidden"
      onMouseEnter={() => hasHoverCapability && setIsHovering(true)}
      onMouseLeave={() => hasHoverCapability && setIsHovering(false)}
    >
      {/* Screenshot base layer - true lazy loading via IntersectionObserver */}
      {/* Only set src when card enters viewport to prevent browser from queuing all images */}
      <img
        src={shouldLoadScreenshot ? scene?.paths?.screenshot : undefined}
        alt={scene?.title || "Scene"}
        className="w-full h-full object-contain pointer-events-none"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      />

      {/* Overlay: Video preview (MP4, high quality) */}
      {activePreviewType === "mp4" &&
        shouldShowAnimation &&
        previewDataLoaded && (
          <video
            src={getPreviewUrl()}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{ backgroundColor: "var(--bg-secondary)" }}
            autoPlay
            loop
            muted
            playsInline
          />
        )}

      {/* Overlay: WebP animated preview (high quality) */}
      {activePreviewType === "webp" &&
        shouldShowAnimation &&
        previewDataLoaded && (
          <img
            src={getPreviewUrl()}
            alt={scene?.title || "Scene preview"}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          />
        )}

      {/* Overlay: Sprite sheet preview (low quality / fallback) */}
      {activePreviewType === "sprite" &&
        shouldShowAnimation &&
        previewDataLoaded &&
        sprites.length > 0 &&
        currentSprite && (
          <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
            <img
              src={scene.paths.sprite}
              alt={scene?.title || "Scene preview"}
              className="pointer-events-none"
              style={{
                position: "absolute",
                left: `-${currentSprite.x * scale}px`,
                top: `-${currentSprite.y * scale}px`,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                maxWidth: "none",
              }}
            />
          </div>
        )}

      {/* Overlays: Duration (bottom-right) and Resolution (top-right) - hidden when preview is playing */}
      {!shouldShowAnimation && (
        <>
          {/* Duration badge */}
          {duration && (
            <div className="absolute bottom-1 right-1 pointer-events-none z-10">
              <span className="px-2 py-1 bg-black/70 text-white text-xs font-medium rounded">
                {duration}
              </span>
            </div>
          )}

          {/* Resolution badge */}
          {resolution && (
            <div className="absolute top-1 right-1 pointer-events-none z-10">
              <span className="px-2 py-1 bg-black/70 text-white text-xs font-medium rounded">
                {resolution}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SceneCardPreview;
