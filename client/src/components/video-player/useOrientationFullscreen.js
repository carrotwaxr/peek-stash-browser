import { useEffect, useRef } from 'react';

/**
 * Automatically enter fullscreen when device rotates to landscape while video is playing
 * Standard mobile video player behavior
 */
export const useOrientationFullscreen = (playerRef, enabled = true) => {
  const userDeclinedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !playerRef?.current) return;

    const player = playerRef.current;

    const handleOrientationChange = () => {
      if (!player || player.isDisposed()) return;

      const isLandscape = window.screen?.orientation?.type?.includes('landscape') ||
                          window.innerWidth > window.innerHeight;
      const isPlaying = !player.paused();

      // Auto-fullscreen on landscape if: playing, not fullscreen, and user hasn't declined
      if (isLandscape && isPlaying && !player.isFullscreen() && !userDeclinedRef.current) {
        player.requestFullscreen().catch(() => {});
      }
    };

    // Track manual fullscreen changes
    const handleFullscreenChange = () => {
      if (!player.isFullscreen()) {
        // User exited fullscreen - mark as declined for this session
        userDeclinedRef.current = true;
      } else {
        // User entered fullscreen - clear declined flag (they want it now)
        userDeclinedRef.current = false;
      }
    };

    // Reset declined flag when user pauses (might want fullscreen when they resume)
    const handlePause = () => {
      userDeclinedRef.current = false;
    };

    player.on('fullscreenchange', handleFullscreenChange);
    player.on('pause', handlePause);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      if (player && !player.isDisposed()) {
        player.off('fullscreenchange', handleFullscreenChange);
        player.off('pause', handlePause);
      }
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [playerRef, enabled]);
};
