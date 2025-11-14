import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";
import axios from "axios";
import { initialState, scenePlayerReducer } from "./scenePlayerReducer.js";

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
  playlist = null,
  shouldResume = false,
  compatibility = null,
  initialQuality = "direct",
  initialShouldAutoplay = false,
}) {
  const [state, dispatch] = useReducer(scenePlayerReducer, initialState);

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

  const loadScene = useCallback(async (sceneIdToLoad) => {
    dispatch({ type: "LOAD_SCENE_START" });
    try {
      const response = await api.post("/library/scenes", {
        ids: [sceneIdToLoad],
      });
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

  const loadVideo = useCallback(
    async (forceQuality = null) => {
      const qualityToUse = forceQuality || state.quality;
      const isDirectPlay = qualityToUse === "direct";

      dispatch({ type: "LOAD_VIDEO_START" });

      try {
        if (isDirectPlay) {
          dispatch({
            type: "LOAD_VIDEO_SUCCESS",
            payload: {
              video: { directPlay: true },
              sessionId: null,
            },
          });
        } else {
          const response = await api.get(
            `/video/play?sceneId=${state.scene.id}&quality=${qualityToUse}`
          );
          dispatch({
            type: "LOAD_VIDEO_SUCCESS",
            payload: {
              video: response.data.scene,
              sessionId: response.data.sessionId,
            },
          });
        }
      } catch (error) {
        console.error("Error loading video:", error);
        dispatch({
          type: "LOAD_VIDEO_ERROR",
          payload: error,
        });
      }
    },
    [state.quality, state.scene]
  );

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

  const enableAutoFallback = useCallback(async () => {
    if (!state.scene?.id) return;

    dispatch({ type: "SET_AUTO_FALLBACK", payload: true });
    dispatch({ type: "SET_QUALITY", payload: "480p" });

    try {
      const response = await api.get(
        `/video/play?sceneId=${state.scene.id}&quality=480p`
      );

      dispatch({
        type: "LOAD_VIDEO_SUCCESS",
        payload: {
          video: response.data.scene,
          sessionId: response.data.sessionId,
        },
      });

      dispatch({ type: "SET_AUTO_FALLBACK", payload: false });
      return { success: true, sessionId: response.data.sessionId };
    } catch (error) {
      console.error("Error enabling auto-fallback:", error);
      dispatch({ type: "SET_AUTO_FALLBACK", payload: false });
      return { success: false, error };
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
    const effectiveSceneId = state.playlist
      ? state.playlist.scenes[state.currentIndex]?.sceneId
      : sceneId;

    if (effectiveSceneId) {
      loadScene(effectiveSceneId);
    }
  }, [sceneId, state.currentIndex, state.playlist, loadScene]);

  // Auto-load video data after scene loads (like Stash does)
  // This ensures Video.js has a source and controls work properly
  useEffect(() => {
    if (state.scene && !state.video && !state.videoLoading) {
      // In playlist mode, only auto-load if the current scene matches the expected scene for the current index
      if (state.playlist) {
        const expectedSceneId =
          state.playlist.scenes[state.currentIndex]?.sceneId;

        if (state.scene.id !== expectedSceneId) {
          return; // Waiting for new scene to load
        }
      }

      loadVideo();
    }
  }, [
    state.scene,
    state.video,
    state.videoLoading,
    state.playlist,
    state.currentIndex,
    loadVideo,
  ]);

  // Update URL when navigating playlist (without React Router navigation)
  useEffect(() => {
    if (state.playlist && state.scene) {
      const newUrl = `/scene/${state.scene.id}`;
      if (window.location.pathname !== newUrl) {
        window.history.replaceState(null, "", newUrl);
      }
    }
  }, [state.scene, state.playlist]);

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
    loadVideo,
    incrementOCounter,
    enableAutoFallback,

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
