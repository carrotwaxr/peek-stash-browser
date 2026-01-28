import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";
import axios from "axios";
import { initialState, scenePlayerReducer } from "./scenePlayerReducer.js";
import { useConfig } from "./ConfigContext.jsx";
import { getEntityPath } from "../utils/entityLinks.js";

const api = axios.create({
  baseURL: "/api",
});

const ScenePlayerContext = createContext(null);

// ============================================================================
// PROVIDER
// ============================================================================

export function ScenePlayerProvider({
  children,
  sceneId,
  instanceId = null,
  playlist = null,
  shouldResume = false,
  compatibility = null,
  initialQuality = "direct",
  initialShouldAutoplay = false,
}) {
  const [state, dispatch] = useReducer(scenePlayerReducer, initialState);
  const { hasMultipleInstances } = useConfig();

  // Initialize context from props
  useEffect(() => {
    dispatch({
      type: "INITIALIZE",
      payload: {
        playlist,
        currentIndex: playlist?.currentIndex || 0,
        compatibility,
        initialQuality,
        initialShouldAutoplay,
      },
    });
  }, [playlist, compatibility, initialQuality, initialShouldAutoplay]);

  // ============================================================================
  // ACTION CREATORS (with side effects)
  // ============================================================================

  const loadScene = useCallback(async (sceneIdToLoad, sceneInstanceId) => {
    dispatch({ type: "LOAD_SCENE_START" });
    try {
      const requestBody = {
        ids: [sceneIdToLoad],
      };
      // Include instance_id for disambiguation when multiple instances exist
      if (sceneInstanceId) {
        requestBody.scene_filter = { instance_id: sceneInstanceId };
      }
      const response = await api.post("/library/scenes", requestBody);
      const scene = response.data?.findScenes?.scenes?.[0];

      if (!scene) {
        throw new Error("Scene not found");
      }

      dispatch({
        type: "LOAD_SCENE_SUCCESS",
        payload: {
          scene: scene,
          oCounter: scene.o_counter || 0,
        },
      });
    } catch (error) {
      console.error("Error loading scene:", error);
      dispatch({
        type: "LOAD_SCENE_ERROR",
        payload: error,
      });
    }
  }, []);

  // Complex action creators (with side effects or logic)
  const incrementOCounter = useCallback(async () => {
    if (!state.scene?.id) return;

    dispatch({ type: "INCREMENT_O_COUNTER_START" });
    try {
      await api.post("/watch-history/increment-o", { sceneId: state.scene.id });
      dispatch({ type: "INCREMENT_O_COUNTER_SUCCESS" });
    } catch (error) {
      console.error("Error incrementing O counter:", error);
      dispatch({ type: "INCREMENT_O_COUNTER_ERROR" });
    }
  }, [state.scene?.id]);

  // Playlist navigation helpers (kept for convenience)
  const nextScene = useCallback(() => {
    dispatch({ type: "NEXT_SCENE" });
  }, []);

  const prevScene = useCallback(() => {
    dispatch({ type: "PREV_SCENE" });
  }, []);

  const gotoSceneIndex = useCallback((index, shouldAutoplay = false) => {
    dispatch({
      type: "GOTO_SCENE_INDEX",
      payload: { index, shouldAutoplay },
    });
  }, []);

  // Playlist control toggles
  const toggleAutoplayNext = useCallback(() => {
    dispatch({ type: "TOGGLE_AUTOPLAY_NEXT" });
  }, []);

  const toggleShuffle = useCallback(() => {
    dispatch({ type: "TOGGLE_SHUFFLE" });
  }, []);

  const toggleRepeat = useCallback(() => {
    dispatch({ type: "TOGGLE_REPEAT" });
  }, []);

  // ============================================================================
  // EFFECTS (after action creators are defined)
  // ============================================================================

  // Load scene when sceneId or currentIndex changes
  useEffect(() => {
    const playlistScene = state.playlist?.scenes?.[state.currentIndex];
    const effectiveSceneId = playlistScene?.sceneId || sceneId;
    // For playlists, get instanceId from playlist entry; otherwise use prop
    const effectiveInstanceId = playlistScene?.instanceId || instanceId;

    if (effectiveSceneId) {
      loadScene(effectiveSceneId, effectiveInstanceId);
    }
  }, [sceneId, instanceId, state.currentIndex, state.playlist, loadScene]);

  // Update URL when navigating playlist (without React Router navigation)
  useEffect(() => {
    if (state.playlist && state.scene) {
      const newUrl = getEntityPath('scene', state.scene, hasMultipleInstances);
      // Compare pathname + search to handle instance query param
      const currentFullPath = window.location.pathname + window.location.search;
      if (currentFullPath !== newUrl) {
        window.history.replaceState(null, "", newUrl);
      }
    }
  }, [state.scene, state.playlist, hasMultipleInstances]);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value = {
    // State
    ...state,
    shouldResume, // Pass through from props

    // Direct dispatch access (for simple state updates)
    dispatch,

    // Complex actions (with side effects)
    loadScene,
    incrementOCounter,

    // Playlist navigation helpers (kept for convenience)
    nextScene,
    prevScene,
    gotoSceneIndex,

    // Playlist control toggles
    toggleAutoplayNext,
    toggleShuffle,
    toggleRepeat,
  };

  return (
    <ScenePlayerContext.Provider value={value}>
      {children}
    </ScenePlayerContext.Provider>
  );
}

// ============================================================================
// CUSTOM HOOK
// ============================================================================

// eslint-disable-next-line react-refresh/only-export-components
export function useScenePlayer() {
  const context = useContext(ScenePlayerContext);
  if (!context) {
    throw new Error("useScenePlayer must be used within ScenePlayerProvider");
  }
  return context;
}
