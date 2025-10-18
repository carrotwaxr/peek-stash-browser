import { useCallback, useMemo } from "react";

/**
 * Custom hook for playlist navigation with shuffle and repeat support
 */
export const usePlaylistNavigation = (
  playlist,
  currentPlaylistIndex,
  navigate
) => {
  // Generate shuffled order if shuffle is enabled
  const shuffledOrder = useMemo(() => {
    if (!playlist?.shuffle || !playlist?.scenes) return null;

    // Create array of indices
    const indices = Array.from({ length: playlist.scenes.length }, (_, i) => i);

    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    return indices;
  }, [playlist?.shuffle, playlist?.scenes?.length]);

  const playPreviousInPlaylist = useCallback(() => {
    if (!playlist || !playlist.scenes) return;

    let prevIndex;
    if (playlist.shuffle && shuffledOrder) {
      // Find current position in shuffle order
      const shufflePos = shuffledOrder.indexOf(currentPlaylistIndex);
      if (shufflePos > 0) {
        prevIndex = shuffledOrder[shufflePos - 1];
      } else if (playlist.repeat === "all") {
        // Wrap to end in repeat all mode
        prevIndex = shuffledOrder[shuffledOrder.length - 1];
      } else {
        return; // Can't go back further
      }
    } else {
      prevIndex = currentPlaylistIndex - 1;
      if (prevIndex < 0) {
        if (playlist.repeat === "all") {
          prevIndex = playlist.scenes.length - 1; // Wrap to end
        } else {
          return; // Can't go back further
        }
      }
    }

    const prevScene = playlist.scenes[prevIndex];
    navigate(`/scene/${prevScene.sceneId}`, {
      replace: false,
      state: {
        scene: prevScene.scene,
        playlist: {
          ...playlist,
          currentIndex: prevIndex,
        },
      },
    });
  }, [playlist, currentPlaylistIndex, navigate, shuffledOrder]);

  const playNextInPlaylist = useCallback(() => {
    if (!playlist || !playlist.scenes) return;

    // Handle repeat one - replay same scene
    if (playlist.repeat === "one") {
      const currentScene = playlist.scenes[currentPlaylistIndex];
      navigate(`/scene/${currentScene.sceneId}`, {
        replace: false,
        state: {
          scene: currentScene.scene,
          playlist: {
            ...playlist,
            currentIndex: currentPlaylistIndex,
          },
        },
      });
      return;
    }

    let nextIndex;
    if (playlist.shuffle && shuffledOrder) {
      // Find current position in shuffle order
      const shufflePos = shuffledOrder.indexOf(currentPlaylistIndex);
      if (shufflePos < shuffledOrder.length - 1) {
        nextIndex = shuffledOrder[shufflePos + 1];
      } else if (playlist.repeat === "all") {
        // Wrap to beginning in repeat all mode
        nextIndex = shuffledOrder[0];
      } else {
        return; // End of playlist
      }
    } else {
      nextIndex = currentPlaylistIndex + 1;
      if (nextIndex >= playlist.scenes.length) {
        if (playlist.repeat === "all") {
          nextIndex = 0; // Wrap to beginning
        } else {
          return; // End of playlist
        }
      }
    }

    const nextScene = playlist.scenes[nextIndex];
    navigate(`/scene/${nextScene.sceneId}`, {
      replace: false,
      state: {
        scene: nextScene.scene,
        playlist: {
          ...playlist,
          currentIndex: nextIndex,
        },
      },
    });
  }, [playlist, currentPlaylistIndex, navigate, shuffledOrder]);

  return {
    playPreviousInPlaylist,
    playNextInPlaylist,
  };
};
