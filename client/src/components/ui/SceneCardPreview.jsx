import { useState, useEffect, useRef } from "react";
import {
  fetchAndParseVTT,
  getEvenlySpacedSprites,
} from "../../utils/spriteSheet.js";

/**
 * Animated sprite preview for scene cards
 * Cycles through evenly spaced sprite thumbnails based on input method and layout:
 * - When autoplayOnScroll=true: Preview when scrolled into view (mobile-first, ignores hover detection)
 * - When autoplayOnScroll=false on hover-capable devices: Preview on hover
 * - When autoplayOnScroll=false on touch-only devices: No preview (static screenshot)
 *
 * Note: autoplayOnScroll takes priority over hover detection to fix issues where mobile browsers
 * incorrectly report hover capability (e.g., Chrome on Android).
 *
 * @param {Object} scene - Scene object with paths.sprite and paths.vtt
 * @param {boolean} autoplayOnScroll - Enable scroll-based autoplay (typically for 1-column mobile layouts)
 * @param {number} cycleInterval - Milliseconds between sprite changes (default: 800ms)
 * @param {number} spriteCount - Number of sprites to cycle through (default: 5)
 */
const SceneCardPreview = ({ scene, autoplayOnScroll = false, cycleInterval = 800, spriteCount = 5 }) => {
  const [sprites, setSprites] = useState([]);
  const [currentSpriteIndex, setCurrentSpriteIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hasHoverCapability, setHasHoverCapability] = useState(true);
  const [containerElement, setContainerElement] = useState(null);
  const intervalRef = useRef(null);


  // Detect hover capability (mouse/trackpad vs touch-only)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(hover: hover)');
    setHasHoverCapability(mediaQuery.matches);

    const handleChange = (e) => {
      setHasHoverCapability(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

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
          const newIsInView = entry.isIntersecting && entry.intersectionRatio >= 0.9;
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

  // Load and parse VTT file
  useEffect(() => {
    if (!scene?.paths?.vtt) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchAndParseVTT(scene.paths.vtt)
      .then((parsedCues) => {
        if (parsedCues.length > 0) {
          const evenlySpaced = getEvenlySpacedSprites(parsedCues, spriteCount);
          setSprites(evenlySpaced);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("[SceneCardPreview] Error loading VTT:", err);
        setIsLoading(false);
      });
  }, [scene?.paths?.vtt, spriteCount]);

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

  // Cycle through sprites based on input method and layout
  useEffect(() => {
    // Determine if we should animate based on hover capability and autoplayOnScroll setting
    // IMPORTANT: When autoplayOnScroll is explicitly enabled, prioritize scroll-based animation
    // This fixes issues where mobile browsers incorrectly report hover capability
    const shouldAnimate = autoplayOnScroll
      ? isInView // When autoplayOnScroll is enabled, animate when in view (mobile-first)
      : (hasHoverCapability ? isHovering : false); // Otherwise, use hover detection

    if (!shouldAnimate || sprites.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCurrentSpriteIndex(0);
      return;
    }

    // Start cycling
    intervalRef.current = setInterval(() => {
      setCurrentSpriteIndex((prev) => (prev + 1) % sprites.length);
    }, cycleInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isHovering, isInView, hasHoverCapability, autoplayOnScroll, sprites.length, cycleInterval]);

  // Don't render anything if no sprite data
  if (
    !scene?.paths?.sprite ||
    !scene?.paths?.vtt ||
    sprites.length === 0 ||
    isLoading
  ) {
    return (
      <img
        src={scene?.paths?.screenshot}
        alt={scene?.title || "Scene"}
        className="w-full h-full object-cover pointer-events-none"
        loading="lazy"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      />
    );
  }

  // Calculate scale factor based on container width vs sprite thumbnail width
  const currentSprite = sprites[currentSpriteIndex];
  const scale =
    currentSprite && containerWidth > 0
      ? containerWidth / currentSprite.width
      : 1;

  // Use same logic as animation check - prioritize autoplayOnScroll when enabled
  const shouldShowAnimation = autoplayOnScroll
    ? isInView
    : (hasHoverCapability ? isHovering : false);

  return (
    <div
      ref={setContainerElement}
      className="w-full h-full relative overflow-hidden"
      onMouseEnter={() => hasHoverCapability && setIsHovering(true)}
      onMouseLeave={() => hasHoverCapability && setIsHovering(false)}
    >
      {/* Show screenshot when not animating */}
      {!shouldShowAnimation && scene?.paths?.screenshot && (
        <img
          src={scene.paths.screenshot}
          alt={scene?.title || "Scene"}
          className="w-full h-full object-cover pointer-events-none"
          loading="lazy"
        />
      )}

      {/* Show animated sprite preview when hovering (desktop) or in view (mobile) */}
      {shouldShowAnimation && currentSprite && (
        <div className="w-full h-full relative overflow-hidden pointer-events-none">
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
    </div>
  );
};

export default SceneCardPreview;
