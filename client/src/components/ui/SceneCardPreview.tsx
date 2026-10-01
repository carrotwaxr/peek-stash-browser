import { useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedScene } from "@peek/shared-types";
import { useUserSettings } from "../../api/hooks/useUserSettings";
import { useHoverCapable } from "../../hooks/useHoverCapable";
import { useInView } from "../../hooks/useInView";
import {
  getPreviewProbe,
  setPreviewProbe,
} from "../../utils/previewProbeCache";
import { releaseVideoOnUnmount } from "../../utils/releaseVideo";
import {
  fetchAndParseVTT,
  getEvenlySpacedSprites,
} from "../../utils/spriteSheet";

/** Every media URL names the scene's instance: the server serves no other. */
const withInstance = (url: string, instanceId: string): string =>
  `${url}?instanceId=${encodeURIComponent(instanceId)}`;

interface Props {
  scene: NormalizedScene;
  autoplayOnScroll?: boolean;
  cycleInterval?: number;
  spriteCount?: number;
  duration?: string | null;
  resolution?: string | null;
  objectFit?: "contain" | "cover";
  /**
   * External active state to trigger preview playback (e.g., TV-mode keyboard focus/highlight).
   * When provided, it overrides hover-based activation.
   */
  active?: boolean;
  /**
   * Disable hover handlers entirely (e.g., in TV mode where previews should not start on hover).
   */
  disableHover?: boolean;
}

const SceneCardPreview = ({
  scene,
  autoplayOnScroll = false,
  cycleInterval = 800,
  spriteCount = 5,
  duration = null,
  resolution = null,
  objectFit = "contain",
  active,
  disableHover = false,
}: Props) => {
  const { data: userSettings } = useUserSettings();
  const previewQuality = userSettings?.settings.preferredPreviewQuality;
  type SpriteData = ReturnType<typeof getEvenlySpacedSprites>[number];

  const [sprites, setSprites] = useState<SpriteData[]>([]);
  const [currentSpriteIndex, setCurrentSpriteIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const hasHoverCapability = useHoverCapable();
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewDataLoaded, setPreviewDataLoaded] = useState(false);
  const [activePreviewType, setActivePreviewType] = useState<string | null>(
    null
  ); // Track which type is actually being used (after fallback)
  // The screenshot loads once the card comes within 200px of the viewport,
  // so the browser never queues a whole grid's images at once
  const shouldLoadScreenshot = useInView(containerRef, {
    rootMargin: "200px",
    once: true,
  });
  // Scroll autoplay: the thumbnail is 90% visible, clear of the viewport's
  // top and bottom 5% (whatever the device reports about hover)
  const isInView = useInView(containerRef, {
    rootMargin: "-5% 0px",
    threshold: [0, 0.5, 0.9, 1.0],
    minRatio: 0.9,
    skip: !autoplayOnScroll,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // If hover is disabled (TV mode), ensure any previous hover state is cleared
  useEffect(() => {
    if (disableHover) {
      setIsHovering(false);
    }
  }, [disableHover]);

  // Determine preview type based on user preference
  // Note: We don't check if paths exist yet - that happens in the lazy-load effect
  const preferredPreviewType = useMemo(() => {
    const userPref = previewQuality || "sprite";

    // For sprite preference, check if VTT/sprite are available
    if (userPref === "sprite") {
      return scene?.paths?.vtt && scene?.paths?.sprite ? "sprite" : null;
    }

    // For high quality preferences, we'll try the preference and fallback to sprite if needed
    return userPref; // 'webp' or 'mp4'
  }, [previewQuality, scene?.paths?.vtt, scene?.paths?.sprite]);

  // A preview quality changed in Settings applies at once: drop the preview
  // loaded for the previous one, so the next activation loads the new kind
  const [loadedFor, setLoadedFor] = useState(preferredPreviewType);
  if (loadedFor !== preferredPreviewType) {
    setLoadedFor(preferredPreviewType);
    setPreviewDataLoaded(false);
    setActivePreviewType(null);
    setSprites([]);
    setCurrentSpriteIndex(0);
  }

  // Whether a preview shows now: in view under scroll autoplay, else the
  // external active state (TV focus) or a hover on a device that can hover
  const shouldShowAnimation = autoplayOnScroll
    ? isInView
    : (active ?? (hasHoverCapability ? isHovering : false));

  // Lazy-load preview data only when hovering or in view
  // Implements user preference with smart 404 fallback for high quality options
  useEffect(() => {
    // Don't load if not showing yet, already loaded, no preview type, or already loading
    if (
      !shouldShowAnimation ||
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
          // "sprite" is preferred only when the scene has a VTT
          const vtt = scene.paths.vtt;
          const parsedCues = vtt ? await fetchAndParseVTT(vtt) : [];
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
        const previewUrl = withInstance(
          preferredPreviewType === "mp4"
            ? `/api/proxy/scene/${scene.id}/preview`
            : `/api/proxy/scene/${scene.id}/webp`,
          scene.instanceId
        );

        // Test if high quality preview exists by doing a HEAD request, once
        // per scene: a card that remounts reads the earlier answer
        const probedType =
          preferredPreviewType === "mp4" || preferredPreviewType === "webp"
            ? preferredPreviewType
            : null;
        let probe = probedType
          ? getPreviewProbe(probedType, scene.id, scene.instanceId)
          : undefined;
        if (probe === undefined) {
          const response = await fetch(previewUrl, { method: "HEAD" });
          probe = response.ok ? "ok" : "missing";
          if (probedType) {
            setPreviewProbe(probedType, scene.id, scene.instanceId, probe);
          }
        }

        if (probe === "ok") {
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

    void loadPreview();
  }, [
    shouldShowAnimation,
    preferredPreviewType,
    previewDataLoaded,
    isLoading,
    scene?.paths?.vtt,
    scene?.paths?.sprite,
    scene?.id,
    scene?.instanceId,
    spriteCount,
  ]);

  // The sprite is scaled to the card's width, which matters only while a
  // preview shows: measure it (and follow resizes) only then
  useEffect(() => {
    const container = containerRef.current;
    if (!shouldShowAnimation || !container) return;
    const updateWidth = () => setContainerWidth(container.offsetWidth);
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [shouldShowAnimation]);

  // Cycle through sprites (only for sprite preview type)
  useEffect(() => {
    // Only cycle if we're using sprite preview type
    if (activePreviewType !== "sprite") {
      return;
    }

    if (!shouldShowAnimation || sprites.length === 0) {
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
  }, [activePreviewType, shouldShowAnimation, sprites.length, cycleInterval]);

  // For sprite preview, calculate scale factor
  const currentSprite = sprites[currentSpriteIndex];
  const scale =
    currentSprite && containerWidth > 0
      ? containerWidth / currentSprite.width
      : 1;

  // Build preview URL for video/webp (proxied through backend to hide API keys)
  const getPreviewUrl = () => {
    if (activePreviewType === "mp4" && scene?.id) {
      return withInstance(
        `/api/proxy/scene/${scene.id}/preview`,
        scene.instanceId
      );
    }
    if (activePreviewType === "webp" && scene?.id) {
      return withInstance(
        `/api/proxy/scene/${scene.id}/webp`,
        scene.instanceId
      );
    }
    return null;
  };

  // Use explicit class names for Tailwind JIT detection (dynamic interpolation doesn't work)
  const objectFitClass =
    objectFit === "cover" ? "object-cover" : "object-contain";

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      onMouseEnter={() => {
        if (!disableHover && hasHoverCapability) setIsHovering(true);
      }}
      onMouseLeave={() => {
        if (!disableHover && hasHoverCapability) setIsHovering(false);
      }}
    >
      {/* Screenshot base layer, the card's only screenshot img: its src is set
          once the card nears the viewport */}
      <img
        src={
          shouldLoadScreenshot
            ? (scene?.paths?.screenshot ?? undefined)
            : undefined
        }
        alt={scene?.title || "Scene"}
        className={`w-full h-full pointer-events-none ${objectFitClass}`}
        style={{ backgroundColor: "var(--bg-secondary)" }}
      />

      {/* Overlay: Video preview (MP4, high quality) */}
      {activePreviewType === "mp4" &&
        shouldShowAnimation &&
        previewDataLoaded && (
          <video
            ref={releaseVideoOnUnmount}
            src={getPreviewUrl() ?? undefined}
            className={`absolute inset-0 w-full h-full pointer-events-none ${objectFitClass}`}
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
            src={getPreviewUrl() ?? undefined}
            alt={scene?.title || "Scene preview"}
            className={`absolute inset-0 w-full h-full pointer-events-none ${objectFitClass}`}
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
              src={scene.paths.sprite ?? undefined}
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
