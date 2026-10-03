/**
 * The viewer's favourite on the Scene page's scene, and the one way to change
 * it: the heart and its `r f` hotkey (PlaybackControls) and the headset HUD
 * (useVrMode) all call this. The value is the player state's
 * `scene.favorite`; a change shows at once through SET_SCENE_FAVORITE, saves
 * through useUpdateFavorite (which patches the cached lists too), and goes
 * back if the save fails. So a toggle in one place shows in the others, and
 * the next toggle from any of them writes the opposite value.
 */
import { useRef } from "react";
import { useUpdateFavorite } from "../../api/hooks/useFavoriteMutation";
import type { SceneFavoritePayload } from "../../contexts/scenePlayerReducer";

/** The part of the scene this reads. */
export interface FavoriteScene {
  id: string;
  instanceId: string;
  favorite?: boolean | null | undefined;
}

export interface SetSceneFavoriteAction {
  type: "SET_SCENE_FAVORITE";
  payload: SceneFavoritePayload;
}

export function useSceneFavorite(
  scene: FavoriteScene | null | undefined,
  dispatch: (action: SetSceneFavoriteAction) => void
) {
  const { mutateAsync: saveFavorite } = useUpdateFavorite();
  // Counts writes, so a failure puts the old value back only when no later
  // write has changed it since
  const writes = useRef(0);
  const favorite = scene?.favorite ?? false;

  const setFavorite = async (next: boolean) => {
    if (!scene) return;
    const { id: sceneId, instanceId } = scene;
    const show = (value: boolean) =>
      dispatch({
        type: "SET_SCENE_FAVORITE",
        payload: { sceneId, instanceId, favorite: value },
      });
    const previous = favorite;
    const write = ++writes.current;
    show(next);
    try {
      await saveFavorite({
        entityType: "scene",
        entityId: sceneId,
        favorite: next,
        instanceId,
      });
    } catch (error) {
      console.error("Failed to update scene favorite:", error);
      if (write === writes.current) show(previous);
    }
  };

  return {
    favorite,
    setFavorite,
    toggleFavorite: () => setFavorite(!favorite),
  };
}
