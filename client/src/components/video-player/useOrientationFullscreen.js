import { useEffect, useRef } from 'react';

/**
 * Automatically enter fullscreen when device rotates to landscape while video is playing
 * Standard mobile video player behavior
 */
export const useOrientationFullscreen = (playerRef, enabled = true) => {
  const cooldownRef = useRef(0);

  useEffect(() => {
    if (!enabled || !playerRef?.current) return;

    const player = playerRef.current;

    const handleOrientationChange = () => {
      if (!player || player.isDisposed()) return;

      const isLandscape = window.screen?.orientation?.type?.includes('landscape') ||
                          window.innerWidth > window.innerHeight;
      const isPlaying = !player.paused();
      const inCooldown = Date.now() - cooldownRef.current < 3000;

      // Auto-fullscreen on landscape if: playing, not fullscreen, not in cooldown
      if (isLandscape && isPlaying && !player.isFullscreen() && !inCooldown) {
        player.requestFullscreen().catch(() => {});
      }
    };

    // Track manual exits to prevent immediate re-entry
    const handleFullscreenChange = () => {
      if (!player.isFullscreen()) {
        cooldownRef.current = Date.now();
      }
    };

    player.on('fullscreenchange', handleFullscreenChange);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      if (player && !player.isDisposed()) {
        player.off('fullscreenchange', handleFullscreenChange);
      }
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [playerRef, enabled]);
};
