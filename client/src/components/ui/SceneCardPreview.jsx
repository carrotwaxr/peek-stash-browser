import { useState, useEffect, useRef } from 'react';
import { fetchAndParseVTT, getEvenlySpacedSprites } from '../../utils/spriteSheet.js';

/**
 * Animated sprite preview for scene cards
 * Cycles through evenly spaced sprite thumbnails on hover (desktop) or when in view (mobile)
 *
 * @param {Object} scene - Scene object with paths.sprite and paths.vtt
 * @param {number} cycleInterval - Milliseconds between sprite changes (default: 800ms)
 * @param {number} spriteCount - Number of sprites to cycle through (default: 5)
 */
const SceneCardPreview = ({ scene, cycleInterval = 800, spriteCount = 5 }) => {
  const [sprites, setSprites] = useState([]);
  const [currentSpriteIndex, setCurrentSpriteIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const intervalRef = useRef(null);
  const containerRef = useRef(null);

  // Detect touch device
  useEffect(() => {
    const checkTouchDevice = () => {
      return (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0
      );
    };
    setIsTouchDevice(checkTouchDevice());
  }, []);

  // Intersection Observer for mobile auto-play
  useEffect(() => {
    if (!isTouchDevice || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Only autoplay if at least 30% visible and intersecting
          setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.3);
        });
      },
      {
        threshold: [0, 0.3, 0.5, 0.7, 1.0], // Multiple thresholds for smooth detection
        rootMargin: '50px', // Start detecting 50px before entering viewport
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isTouchDevice]);

  // Load and parse VTT file
  useEffect(() => {
    if (!scene?.paths?.vtt) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchAndParseVTT(scene.paths.vtt)
      .then(parsedCues => {
        if (parsedCues.length > 0) {
          const evenlySpaced = getEvenlySpacedSprites(parsedCues, spriteCount);
          setSprites(evenlySpaced);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('[SceneCardPreview] Error loading VTT:', err);
        setIsLoading(false);
      });
  }, [scene?.paths?.vtt, spriteCount]);

  // Measure container width on mount and when hovering
  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    // Set initial width
    updateWidth();

    // Update on resize
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Update width when starting to hover
  useEffect(() => {
    if (isHovering && containerRef.current && containerWidth === 0) {
      setContainerWidth(containerRef.current.offsetWidth);
    }
  }, [isHovering, containerWidth]);

  // Cycle through sprites on hover (desktop) or in view (mobile)
  useEffect(() => {
    const shouldAnimate = isTouchDevice ? isInView : isHovering;

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
      setCurrentSpriteIndex(prev => (prev + 1) % sprites.length);
    }, cycleInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isHovering, isInView, isTouchDevice, sprites.length, cycleInterval]);

  // Don't render anything if no sprite data
  if (!scene?.paths?.sprite || !scene?.paths?.vtt || sprites.length === 0 || isLoading) {
    return (
      <img
        src={scene?.paths?.screenshot}
        alt={scene?.title || 'Scene'}
        className="w-full h-full object-cover pointer-events-none"
        loading="lazy"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      />
    );
  }

  // Calculate scale factor based on container width vs sprite thumbnail width
  const currentSprite = sprites[currentSpriteIndex];
  const scale = currentSprite && containerWidth > 0 ? containerWidth / currentSprite.width : 1;

  const shouldShowAnimation = isTouchDevice ? isInView : isHovering;

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      onMouseEnter={() => !isTouchDevice && setIsHovering(true)}
      onMouseLeave={() => !isTouchDevice && setIsHovering(false)}
    >
      {/* Show screenshot when not animating */}
      {!shouldShowAnimation && scene?.paths?.screenshot && (
        <img
          src={scene.paths.screenshot}
          alt={scene?.title || 'Scene'}
          className="w-full h-full object-cover pointer-events-none"
          loading="lazy"
        />
      )}

      {/* Show animated sprite preview when hovering (desktop) or in view (mobile) */}
      {shouldShowAnimation && currentSprite && (
        <div className="w-full h-full relative overflow-hidden pointer-events-none">
          <img
            src={scene.paths.sprite}
            alt={scene?.title || 'Scene preview'}
            className="pointer-events-none"
            style={{
              position: 'absolute',
              left: `-${currentSprite.x * scale}px`,
              top: `-${currentSprite.y * scale}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              maxWidth: 'none',
            }}
          />
        </div>
      )}
    </div>
  );
};

export default SceneCardPreview;
