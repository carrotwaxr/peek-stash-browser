import { type RefObject, useEffect, useRef } from "react";
import { markInternalPop } from "../../utils/historyGuard";

/** The part of a video.js player the hook uses */
export interface OrientationPlayer {
  on(event: string, handler: () => void): unknown;
  off(event: string, handler: () => void): unknown;
  isDisposed(): boolean;
  paused(): boolean;
  isFullscreen(): boolean;
  videoWidth(): number;
  videoHeight(): number;
  requestFullscreen(): Promise<void> | undefined;
  exitFullscreen(): unknown;
}

/**
 * The orientation lock API. lib.dom may not declare `lock`/`unlock` on
 * ScreenOrientation, and browsers without it (Safari/iOS, desktop) omit them.
 */
interface LockableScreenOrientation {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
}

/** The screen's orientation API, or undefined where the browser has none */
function screenOrientation(): LockableScreenOrientation | undefined {
  return (window.screen as { orientation?: LockableScreenOrientation })
    .orientation;
}

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
 * and intercept popstate to prevent this. The guard's own Back (on leaving
 * fullscreen) is marked, so the player's provider does not follow it to the
 * entry below, which a queue step taken in fullscreen left behind.
 *
 * Landscape lock: Chromium on Android does not rotate when the fullscreen
 * button is tapped (Firefox does). When the user, not a rotation, takes a
 * landscape video fullscreen on a touch device, the screen is locked to
 * landscape until fullscreen ends. Fullscreen the rotation started is never
 * locked, so rotating back to portrait still exits it.
 *
 * The listeners live as long as the player: a scene change (a queue step)
 * keeps the guard, and only resets the "declined" flag.
 */
export const useOrientationFullscreen = (
  playerRef: RefObject<OrientationPlayer | null> | null | undefined,
  sceneId: unknown,
  enabled = true
) => {
  const userDeclinedRef = useRef(false);
  // Track whether current fullscreen was auto-triggered by orientation change
  const autoFullscreenRef = useRef(false);
  // Track whether we have a guard history entry pushed
  const historyGuardActiveRef = useRef(false);
  // Track whether we took a screen orientation lock that is still held
  const orientationLockedRef = useRef(false);

  // A new video is a fresh preference: reset the declined flag, nothing else
  useEffect(() => {
    userDeclinedRef.current = false;
  }, [sceneId]);

  useEffect(() => {
    if (!enabled || !playerRef?.current) {
      return;
    }

    const player = playerRef.current;

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
        // but since we cleared the flag first, the handler will skip it;
        // the mark tells the player's provider to stay where it is.
        markInternalPop();
        window.history.back();
      }
    };

    /**
     * Lock the screen to landscape for a landscape video taken fullscreen by
     * hand on a touch device. A browser without the API, or one that refuses
     * the lock, leaves things as they were.
     */
    const lockLandscape = () => {
      const orientation = screenOrientation();
      if (typeof orientation?.lock !== "function") return;
      if (!window.matchMedia("(pointer: coarse)").matches) return;
      const width = player.videoWidth();
      const height = player.videoHeight();
      if (!(width > 0 && height > 0 && width > height)) return;

      try {
        orientationLockedRef.current = true;
        orientation.lock("landscape").catch(() => {
          orientationLockedRef.current = false;
        });
      } catch {
        orientationLockedRef.current = false;
      }
    };

    const unlockOrientation = () => {
      if (!orientationLockedRef.current) return;
      orientationLockedRef.current = false;
      try {
        screenOrientation()?.unlock?.();
      } catch {
        // Nothing to release, or the browser refuses: either way we are done
      }
    };

    const handleOrientationChange = () => {
      if (player.isDisposed()) {
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
          if (
            fullscreenPromise &&
            typeof fullscreenPromise.then === "function"
          ) {
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
        if (!player.isDisposed() && player.isFullscreen()) {
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
        unlockOrientation();
      } else {
        // User entered fullscreen - clear declined flag (they want it now)
        userDeclinedRef.current = false;
        // A rotation-started fullscreen stays unlocked so rotating back exits
        if (!autoFullscreenRef.current) {
          lockLandscape();
        }
      }
    };

    player.on("fullscreenchange", handleFullscreenChange);
    window.addEventListener("orientationchange", handleOrientationChange);
    window.addEventListener("popstate", handlePopstate);

    return () => {
      if (!player.isDisposed()) {
        player.off("fullscreenchange", handleFullscreenChange);
      }
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.removeEventListener("popstate", handlePopstate);

      unlockOrientation();

      // Clean up history guard on unmount
      if (historyGuardActiveRef.current) {
        historyGuardActiveRef.current = false;
        window.history.back();
      }
    };
  }, [playerRef, enabled]);
};
