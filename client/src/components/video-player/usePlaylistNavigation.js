import { useCallback } from "react";

/**
 * Custom hook for playlist navigation
 */
export const usePlaylistNavigation = (
  playlist,
  currentPlaylistIndex,
  navigate
) => {
  const playPreviousInPlaylist = useCallback(() => {
    if (!playlist || !playlist.scenes) return;

    const prevIndex = currentPlaylistIndex - 1;
    if (prevIndex >= 0) {
      const prevScene = playlist.scenes[prevIndex];
      console.log(`[PLAYLIST NAV] Going to previous scene:`, {
        fromIndex: currentPlaylistIndex,
        toIndex: prevIndex,
        sceneId: prevScene.sceneId,
        title: prevScene.scene?.title || "No title",
      });

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
    }
  }, [playlist, currentPlaylistIndex, navigate]);

  const playNextInPlaylist = useCallback(() => {
    if (!playlist || !playlist.scenes) return;

    const nextIndex = currentPlaylistIndex + 1;
    if (nextIndex < playlist.scenes.length) {
      const nextScene = playlist.scenes[nextIndex];
      console.log(`[PLAYLIST NAV] Going to next scene:`, {
        fromIndex: currentPlaylistIndex,
        toIndex: nextIndex,
        sceneId: nextScene.sceneId,
        title: nextScene.scene?.title || "No title",
      });

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
    } else {
      console.log("Reached end of playlist");
    }
  }, [playlist, currentPlaylistIndex, navigate]);

  return {
    playPreviousInPlaylist,
    playNextInPlaylist,
  };
};
