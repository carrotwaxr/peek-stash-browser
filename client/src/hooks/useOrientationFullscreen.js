import { useEffect, useRef } from 'react';

/**
 * Automatically enter fullscreen when device rotates to landscape on mobile
 * @param {Object} playerRef - Video.js player ref
 * @param {boolean} enabled - Whether the feature is enabled
 */
export const useOrientationFullscreen = (playerRef, enabled = true) => {
  const lastExitTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled || !playerRef?.current) return;

    const player = playerRef.current;

    const handleOrientationChange = () => {
      if (!player || player.isDisposed()) return;

      // Check if we're in landscape orientation
      const isLandscape = window.screen?.orientation?.type?.includes('landscape') ||
                          window.innerWidth > window.innerHeight;

      // Cooldown period: Don't auto-enter fullscreen within 3 seconds of manual exit
      const timeSinceExit = Date.now() - lastExitTimeRef.current;
      const inCooldown = timeSinceExit < 3000;

      // Only proceed if landscape, not already in fullscreen, and not in cooldown
      if (isLandscape && !player.isFullscreen() && !inCooldown) {
        // Request fullscreen
        player.requestFullscreen().catch((err) => {
          console.log('[OrientationFullscreen] Fullscreen request failed:', err?.message || 'Fullscreen request denied');
        });
      }
    };

    // Track when user manually exits fullscreen
    const handleFullscreenChange = () => {
      if (player && !player.isFullscreen()) {
        lastExitTimeRef.current = Date.now();
      }
    };

    // Listen for manual fullscreen exits
    player.on('fullscreenchange', handleFullscreenChange);

    // Listen for orientation changes
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', handleOrientationChange);
    }

    // Fallback: listen for window resize (works on older browsers)
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      if (player && !player.isDisposed()) {
        player.off('fullscreenchange', handleFullscreenChange);
      }
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', handleOrientationChange);
      }
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, [playerRef, enabled]);
};
