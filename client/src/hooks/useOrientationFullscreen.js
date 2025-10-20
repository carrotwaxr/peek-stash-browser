import { useEffect } from 'react';

/**
 * Automatically enter fullscreen when device rotates to landscape on mobile
 * @param {Object} playerRef - Video.js player ref
 * @param {boolean} enabled - Whether the feature is enabled
 */
export const useOrientationFullscreen = (playerRef, enabled = true) => {
  useEffect(() => {
    if (!enabled || !playerRef?.current) return;

    const handleOrientationChange = () => {
      const player = playerRef.current;
      if (!player || player.isDisposed()) return;

      // Check if we're in landscape orientation
      const isLandscape = window.screen?.orientation?.type?.includes('landscape') ||
                          window.innerWidth > window.innerHeight;

      // Only proceed if landscape and not already in fullscreen
      if (isLandscape && !player.isFullscreen()) {
        // Request fullscreen
        player.requestFullscreen().catch((err) => {
          console.log('[OrientationFullscreen] Fullscreen request failed:', err.message);
        });
      }
    };

    // Listen for orientation changes
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', handleOrientationChange);
    }

    // Fallback: listen for window resize (works on older browsers)
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', handleOrientationChange);
      }
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, [playerRef, enabled]);
};
