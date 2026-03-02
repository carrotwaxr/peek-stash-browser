import { useEffect, useRef } from "react";

/**
 * Automatically enter fullscreen when device rotates to landscape while video is playing
 * Matches YouTube/Netflix behavior:
 * - Auto-fullscreen on landscape rotation while playing
 * - Auto-exit fullscreen when rotating back to portrait (if auto-triggered)
 * - If user exits fullscreen manually, respect that for this video
 * - Reset declined flag only when user manually enters fullscreen or new video loads
 *
 * History guard: On mobile browsers, the Fullscreen API can interact with the
 * browser's history stack, causing unwanted back-navigation that redirects away
 * from the scene page. We push a guard history entry when entering auto-fullscreen
 * and intercept popstate to prevent this.
 */
export const useOrientationFullscreen = (
  playerRef,
  sceneId,
  enabled = true
) => {
  const userDeclinedRef = useRef(false);
  const previousSceneIdRef = useRef(sceneId);
  // Track whether current fullscreen was auto-triggered by orientation change
  const autoFullscreenRef = useRef(false);
  // Track whether we have a guard history entry pushed
  const historyGuardActiveRef = useRef(false);

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

    /**
     * Push a history guard entry to intercept browser back-navigation during fullscreen.
     * Some mobile browsers push synthetic history entries when entering fullscreen,
     * and popping them can cause the SPA router to navigate away unexpectedly.
     */
    const pushHistoryGuard = () => {
      if (!historyGuardActiveRef.current) {
        window.history.pushState({ __peekFullscreen: true }, "");
        historyGuardActiveRef.current = true;
      }
    };

    /**
     * Remove the history guard by going back one entry.
     * Only call when fullscreen exits normally (not via popstate).
     */
    const removeHistoryGuard = () => {
      if (historyGuardActiveRef.current) {
        historyGuardActiveRef.current = false;
        // Go back to remove our guard entry. This triggers popstate,
        // but since we cleared the flag first, the handler will skip it.
        window.history.back();
      }
    };

    const handleOrientationChange = () => {
      if (!player || player.isDisposed()) {
        return;
      }

      // Delay to let window dimensions update after orientation change
      setTimeout(() => {
        if (player.isDisposed()) return;

        const screenOrientationType = window.screen?.orientation?.type;
        const isLandscape =
          screenOrientationType?.includes("landscape") ||
          window.innerWidth > window.innerHeight;
        const isPlaying = !player.paused();
        const isCurrentlyFullscreen = player.isFullscreen();
        const userDeclined = userDeclinedRef.current;

        if (
          isLandscape &&
          isPlaying &&
          !isCurrentlyFullscreen &&
          !userDeclined
        ) {
          // Auto-fullscreen on landscape if: playing, not fullscreen, and user hasn't declined
          autoFullscreenRef.current = true;
          const fullscreenPromise = player.requestFullscreen();
          if (fullscreenPromise && typeof fullscreenPromise.then === "function") {
            fullscreenPromise
              .then(() => {
                pushHistoryGuard();
              })
              .catch(() => {
                autoFullscreenRef.current = false;
              });
          }
        } else if (
          !isLandscape &&
          isCurrentlyFullscreen &&
          autoFullscreenRef.current
        ) {
          // Auto-exit fullscreen when rotating back to portrait
          // (only if fullscreen was auto-triggered, not user-initiated)
          player.exitFullscreen();
        }
      }, 150); // 150ms delay for dimensions to settle
    };

    /**
     * Handle browser back button / popstate during fullscreen.
     * If our guard is active and the player is in fullscreen, exit fullscreen
     * instead of letting the navigation proceed.
     */
    const handlePopstate = () => {
      if (historyGuardActiveRef.current) {
        historyGuardActiveRef.current = false;
        if (player && !player.isDisposed() && player.isFullscreen()) {
          player.exitFullscreen();
        }
      }
    };

    // Track fullscreen changes
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = player.isFullscreen();

      if (!isCurrentlyFullscreen) {
        // Fullscreen exited
        const wasAutoFullscreen = autoFullscreenRef.current;
        autoFullscreenRef.current = false;

        // Only mark as "declined" if user manually exited (not auto-exit on portrait)
        // Check orientation: if we're back in portrait, it was auto-exit
        const screenOrientationType = window.screen?.orientation?.type;
        const isLandscape =
          screenOrientationType?.includes("landscape") ||
          window.innerWidth > window.innerHeight;

        if (isLandscape || !wasAutoFullscreen) {
          // User manually exited fullscreen while in landscape, or it wasn't auto-triggered
          userDeclinedRef.current = true;
        }
        // If in portrait and was auto-fullscreen, don't mark as declined
        // so it can auto-fullscreen again next time they rotate to landscape

        // Clean up history guard (if fullscreen exited normally, not via popstate)
        removeHistoryGuard();
      } else {
        // User entered fullscreen - clear declined flag (they want it now)
        userDeclinedRef.current = false;
      }
    };

    player.on("fullscreenchange", handleFullscreenChange);
    window.addEventListener("orientationchange", handleOrientationChange);
    window.addEventListener("popstate", handlePopstate);

    return () => {
      if (player && !player.isDisposed()) {
        player.off("fullscreenchange", handleFullscreenChange);
      }
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.removeEventListener("popstate", handlePopstate);

      // Clean up history guard on unmount
      if (historyGuardActiveRef.current) {
        historyGuardActiveRef.current = false;
        window.history.back();
      }
    };
  }, [playerRef, sceneId, enabled]);
};
