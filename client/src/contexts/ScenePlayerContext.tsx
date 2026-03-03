import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
} from "react";
import type { NormalizedScene } from "@peek/shared-types";
import { apiPost } from "../api";
import { initialState, scenePlayerReducer, type ScenePlayerReducerState } from "./scenePlayerReducer";
import { useConfig } from "./ConfigContext";
import { getEntityPath } from "../utils/entityLinks";

// Use the reducer's state type directly
type ScenePlayerState = ScenePlayerReducerState;

interface ScenePlayerContextValue extends ScenePlayerState {
  shouldResume: boolean;
  dispatch: Dispatch<{ type: string; payload?: unknown }>;
  loadScene: (sceneId: string, instanceId?: string | null) => Promise<void>;
  nextScene: () => void;
  prevScene: () => void;
  gotoSceneIndex: (index: number, shouldAutoplay?: boolean) => void;
  toggleAutoplayNext: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

const ScenePlayerContext = createContext<ScenePlayerContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface ScenePlayerProviderProps {
  children: React.ReactNode;
  sceneId: string;
  instanceId?: string | null;
  playlist?: Record<string, unknown> | null;
  shouldResume?: boolean;
  compatibility?: Record<string, unknown> | null;
  initialQuality?: string;
  initialShouldAutoplay?: boolean;
}

export function ScenePlayerProvider({
  children,
  sceneId,
  instanceId = null,
  playlist = null,
  shouldResume = false,
  compatibility = null,
  initialQuality = "direct",
  initialShouldAutoplay = false,
}: ScenePlayerProviderProps) {
  const [state, dispatch] = useReducer(scenePlayerReducer, initialState);
  const { hasMultipleInstances } = useConfig();

  // Initialize context from props
  useEffect(() => {
    dispatch({
      type: "INITIALIZE",
      payload: {
        playlist,
        currentIndex: (playlist as Record<string, unknown> | null)?.currentIndex || 0,
        compatibility,
        initialQuality,
        initialShouldAutoplay,
      },
    });
  }, [playlist, compatibility, initialQuality, initialShouldAutoplay]);

  // ============================================================================
  // ACTION CREATORS (with side effects)
  // ============================================================================

  const loadScene = useCallback(async (sceneIdToLoad: string, sceneInstanceId?: string | null) => {
    dispatch({ type: "LOAD_SCENE_START" });
    try {
      const requestBody: Record<string, unknown> = {
        ids: [sceneIdToLoad],
      };
      // Include instance_id for disambiguation when multiple instances exist
      if (sceneInstanceId) {
        requestBody.scene_filter = { instance_id: sceneInstanceId };
      }
      const data = await apiPost<{ findScenes: { scenes: NormalizedScene[] } }>("/library/scenes", requestBody);
      const scene = data?.findScenes?.scenes?.[0];

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

  // Playlist navigation helpers (kept for convenience)
  const nextScene = useCallback(() => {
    dispatch({ type: "NEXT_SCENE" });
  }, []);

  const prevScene = useCallback(() => {
    dispatch({ type: "PREV_SCENE" });
  }, []);

  const gotoSceneIndex = useCallback((index: number, shouldAutoplay = false) => {
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
    const effectiveSceneId = (playlistScene?.sceneId as string | undefined) || sceneId;
    // For playlists, get instanceId from playlist entry; otherwise use prop
    const effectiveInstanceId = (playlistScene?.instanceId as string | undefined) || instanceId;

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
