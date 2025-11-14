import { useEffect, useRef } from "react";

/**
 * Automatically enter fullscreen when device rotates to landscape while video is playing
 * Matches YouTube/Netflix behavior:
 * - Auto-fullscreen on landscape rotation while playing
 * - If user exits fullscreen, respect that for this video
 * - Reset declined flag only when user manually enters fullscreen or new video loads
 */
export const useOrientationFullscreen = (
  playerRef,
  sceneId,
  enabled = true
) => {
  const userDeclinedRef = useRef(false);
  const previousSceneIdRef = useRef(sceneId);

  useEffect(() => {
    if (!enabled || !playerRef?.current) {
      return;
    }

    const player = playerRef.current;

    // Reset declined flag when scene changes (new video = fresh preference)
    if (sceneId !== previousSceneIdRef.current) {
      userDeclinedRef.current = false;
      previousSceneIdRef.current = sceneId;
    }

    const handleOrientationChange = () => {
      if (!player || player.isDisposed()) {
        return;
      }

      // Delay to let window dimensions update after orientation change
      setTimeout(() => {
        const screenOrientationType = window.screen?.orientation?.type;
        const isLandscape =
          screenOrientationType?.includes("landscape") ||
          window.innerWidth > window.innerHeight;
        const isPlaying = !player.paused();
        const isCurrentlyFullscreen = player.isFullscreen();
        const userDeclined = userDeclinedRef.current;

        // Auto-fullscreen on landscape if: playing, not fullscreen, and user hasn't declined
        if (
          isLandscape &&
          isPlaying &&
          !isCurrentlyFullscreen &&
          !userDeclined
        ) {
          player.requestFullscreen().catch(() => {
            // Fullscreen request failed (expected in some browsers/contexts)
          });
        }
      }, 150); // 150ms delay for dimensions to settle
    };

    // Track manual fullscreen changes
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = player.isFullscreen();

      if (!isCurrentlyFullscreen) {
        // User exited fullscreen - mark as declined for this video
        userDeclinedRef.current = true;
      } else {
        // User entered fullscreen - clear declined flag (they want it now)
        userDeclinedRef.current = false;
      }
    };

    player.on("fullscreenchange", handleFullscreenChange);
    window.addEventListener("orientationchange", handleOrientationChange);

    return () => {
      if (player && !player.isDisposed()) {
        player.off("fullscreenchange", handleFullscreenChange);
      }
      window.removeEventListener("orientationchange", handleOrientationChange);
    };
  }, [playerRef, sceneId, enabled]);
};
