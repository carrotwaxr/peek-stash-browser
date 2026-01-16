import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook to manage browser fullscreen state with optional auto-fullscreen on landscape rotation
 * @param {Object} options
 * @param {boolean} options.autoOnLandscape - Auto-enter fullscreen when rotating to landscape (default: false)
 * @param {boolean} options.enabled - Whether the hook is active (default: true)
 * @returns {{ isFullscreen: boolean, toggleFullscreen: () => void, supportsFullscreen: boolean }}
 */
export function useFullscreen({ autoOnLandscape = false, enabled = true } = {}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const userDeclinedRef = useRef(false);

  const supportsFullscreen = Boolean(
    document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      document.mozFullScreenEnabled ||
      document.msFullscreenEnabled
  );

  const enterFullscreen = useCallback(async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        await elem.webkitRequestFullscreen();
      } else if (elem.mozRequestFullScreen) {
        await elem.mozRequestFullScreen();
      } else if (elem.msRequestFullscreen) {
        await elem.msRequestFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen enter failed:", err);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        await document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen exit failed:", err);
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      // User manually entering fullscreen - clear declined flag
      userDeclinedRef.current = false;
      await enterFullscreen();
    } else {
      await exitFullscreen();
    }
  }, [enterFullscreen, exitFullscreen]);

  // Track fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(isNowFullscreen);

      // If user exited fullscreen, mark as declined for auto-fullscreen
      if (!isNowFullscreen && autoOnLandscape) {
        userDeclinedRef.current = true;
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, [autoOnLandscape]);

  // Auto-fullscreen on landscape rotation
  useEffect(() => {
    if (!autoOnLandscape || !enabled || !supportsFullscreen) {
      return;
    }

    const handleOrientationChange = () => {
      // Delay to let window dimensions update after orientation change
      setTimeout(() => {
        const screenOrientationType = window.screen?.orientation?.type;
        const isLandscape =
          screenOrientationType?.includes("landscape") ||
          window.innerWidth > window.innerHeight;
        const isCurrentlyFullscreen = Boolean(document.fullscreenElement);

        // Auto-fullscreen on landscape if: not already fullscreen and user hasn't declined
        if (isLandscape && !isCurrentlyFullscreen && !userDeclinedRef.current) {
          enterFullscreen();
        }
      }, 150); // 150ms delay for dimensions to settle
    };

    window.addEventListener("orientationchange", handleOrientationChange);

    return () => {
      window.removeEventListener("orientationchange", handleOrientationChange);
    };
  }, [autoOnLandscape, enabled, supportsFullscreen, enterFullscreen]);

  // Reset declined flag when hook is disabled (e.g., lightbox closed)
  useEffect(() => {
    if (!enabled) {
      userDeclinedRef.current = false;
    }
  }, [enabled]);

  return { isFullscreen, toggleFullscreen, supportsFullscreen };
}
