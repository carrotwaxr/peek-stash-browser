import { useEffect, useCallback } from "react";
import { setupPlaylistControls } from "./videoPlayerUtils.js";

/**
 * usePlaylistPlayer
 *
 * Manages playlist navigation with Video.js custom controls.
 * Preserves autoplay state when navigating between scenes (Stash's pattern).
 * Auto-plays next video when current video ends.
 */
export function usePlaylistPlayer({
  playerRef,
  playlist,
  currentIndex,
  video,
  nextScene,
  prevScene,
  setShouldAutoplay,
}) {
  // Navigate to previous scene, preserving autoplay state if playing
  const playPreviousInPlaylist = useCallback(() => {
    const player = playerRef.current;
    if (player && !player.paused()) {
      setShouldAutoplay(true);
    }
    prevScene();
  }, [playerRef, prevScene, setShouldAutoplay]);

  // Navigate to next scene, preserving autoplay state if playing
  const playNextInPlaylist = useCallback(() => {
    const player = playerRef.current;
    if (player && !player.paused()) {
      setShouldAutoplay(true);
    }
    nextScene();
  }, [playerRef, nextScene, setShouldAutoplay]);

  // Auto-play next video when current video ends
  useEffect(() => {
    const player = playerRef.current;

    if (!player || player.isDisposed?.() || !playlist || !playlist.scenes || playlist.scenes.length <= 1) {
      return;
    }

    player.on("ended", playNextInPlaylist);

    return () => {
      if (player && !player.isDisposed()) {
        player.off("ended", playNextInPlaylist);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update Video.js playlist controls when index changes
  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed?.() || !playlist || !playlist.scenes || playlist.scenes.length <= 1) {
      return;
    }

    setupPlaylistControls(player, playlist, currentIndex, playPreviousInPlaylist, playNextInPlaylist);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, video]);

  return {
    playNextInPlaylist,
    playPreviousInPlaylist,
  };
}
