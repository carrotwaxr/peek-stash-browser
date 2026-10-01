import {
  type Dispatch,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../api";
import { ApiError } from "../api/client";
import {
  isLibraryInitializing,
  markLibraryNotReady,
  useLibraryReady,
} from "../api/hooks/useLibraryReady";
import { getEntityPath } from "../utils/entityLinks";
import { clearInternalPop, takeInternalPop } from "../utils/historyGuard";
import {
  type PlaybackQueue,
  readSceneLocationState,
} from "../utils/playbackQueue";
import { useConfig } from "./ConfigContext";
import {
  type ScenePlayerReducerState,
  controlsOf,
  initialState,
  scenePlayerReducer,
} from "./scenePlayerReducer";

// Use the reducer's state type directly
type ScenePlayerState = ScenePlayerReducerState;

interface ScenePlayerContextValue extends ScenePlayerState {
  shouldResume: boolean;
  dispatch: Dispatch<{ type: string; payload?: unknown }>;
  loadScene: (sceneId: string, instanceId?: string | null) => Promise<void>;
  /** Loads the current scene again (after a failed load) */
  retryScene: () => void;
  nextScene: () => void;
  prevScene: () => void;
  gotoSceneIndex: (index: number, shouldAutoplay?: boolean) => void;
  toggleAutoplayNext: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

const ScenePlayerContext = createContext<ScenePlayerContextValue | null>(null);

/** The server a playlist queue entry's scene is on, or null if it names none */
function entryInstanceId(entry: Record<string, unknown>): string | null {
  if (typeof entry.instanceId === "string" && entry.instanceId) {
    return entry.instanceId;
  }
  const scene = entry.scene as { instanceId?: unknown } | null | undefined;
  return typeof scene?.instanceId === "string" && scene.instanceId
    ? scene.instanceId
    : null;
}

/**
 * Is this queue entry the scene the URL names? Two servers can hold the same
 * scene id, so with an instance in the URL the entry's instance must match.
 */
function isUrlEntry(
  entry: Record<string, unknown>,
  sceneId: string,
  instanceId: string | null
): boolean {
  if (entry.sceneId !== sceneId) return false;
  const entryServer = entryInstanceId(entry);
  return !instanceId || entryServer === null || entryServer === instanceId;
}

/** Has the loaded scene the id and server this queue entry names? */
function isLoadedEntry(
  scene: { id: string; instanceId?: string } | null,
  entry: Record<string, unknown>
): boolean {
  if (!scene || scene.id !== entry.sceneId) return false;
  const entryServer = entryInstanceId(entry);
  return entryServer === null || scene.instanceId === entryServer;
}

/** Does this history entry's state hold the queue with this key? */
function holdsQueue(state: unknown, key: unknown): boolean {
  const held = readSceneLocationState(state).playlist;
  return held !== undefined && held.key === key;
}

/** The same controls, field by field (the history entry's against the player's) */
function sameControls(
  a: PlaybackQueue["controls"],
  b: NonNullable<PlaybackQueue["controls"]>
): boolean {
  return (
    a !== undefined &&
    a.autoplayNext === b.autoplayNext &&
    a.shuffle === b.shuffle &&
    a.repeat === b.repeat &&
    a.shuffleHistory.length === b.shuffleHistory.length &&
    a.shuffleHistory.every((index, i) => index === b.shuffleHistory[i])
  );
}

// ============================================================================
// PROVIDER
// ============================================================================

interface ScenePlayerProviderProps {
  children: React.ReactNode;
  /** The scene the URL names, and its server when the URL names one */
  sceneId: string;
  instanceId?: string | null;
  /** The queue the route's history entry holds (`location.state.playlist`) */
  playlist?: PlaybackQueue | null;
  shouldResume?: boolean;
  initialQuality?: string;
  initialShouldAutoplay?: boolean;
}

/**
 * The player's state, and its queue. The reducer owns the queue's position;
 * the router follows it: after each step (and each control toggle) the
 * history entry is replaced with the entry's scene and the queue in its
 * state, so a reload or Back finds the queue there. A location change is
 * followed only when it names another scene or another queue; a tab click
 * on the current scene keeps the queue.
 */
export function ScenePlayerProvider({
  children,
  sceneId,
  instanceId = null,
  playlist = null,
  shouldResume = false,
  initialQuality = "direct",
  initialShouldAutoplay = false,
}: ScenePlayerProviderProps) {
  // The first render starts from the route's entry: the queue a navigation
  // handed over, or the one a reload or Back finds in the entry's state
  const [state, dispatch] = useReducer(scenePlayerReducer, undefined, () =>
    scenePlayerReducer(initialState, {
      type: "INITIALIZE",
      payload: {
        playlist,
        currentIndex: playlist?.currentIndex ?? 0,
        initialQuality,
        initialShouldAutoplay,
      },
    })
  );
  const { hasMultipleInstances } = useConfig();
  const queryClient = useQueryClient();
  const { ready } = useLibraryReady();
  const location = useLocation();
  const navigate = useNavigate();

  // ============================================================================
  // ACTION CREATORS (with side effects)
  // ============================================================================

  const loadScene = useCallback(
    async (sceneIdToLoad: string, sceneInstanceId?: string | null) => {
      dispatch({ type: "LOAD_SCENE_START" });
      try {
        const requestBody: Record<string, unknown> = {
          ids: [sceneIdToLoad],
        };
        // Include instance_id for disambiguation when multiple instances exist
        if (sceneInstanceId) {
          requestBody.scene_filter = { instance_id: sceneInstanceId };
        }
        const data = await apiPost<{
          findScenes: { scenes: NormalizedScene[] };
        }>("/library/scenes", requestBody);
        const scene = data?.findScenes?.scenes?.[0];

        // None the user can see: missing, hidden or restricted alike
        if (!scene) {
          throw new ApiError("Scene not found", 404);
        }

        dispatch({
          type: "LOAD_SCENE_SUCCESS",
          payload: {
            scene: scene,
            oCounter: scene.o_counter || 0,
          },
        });
      } catch (error) {
        // The library's first sync is running: stay loading; the re-check
        // runs the load again once it is ready
        if (isLibraryInitializing(error)) {
          markLibraryNotReady(queryClient);
          return;
        }
        console.error("Error loading scene:", error);
        dispatch({
          type: "LOAD_SCENE_ERROR",
          payload: error,
        });
      }
    },
    [queryClient]
  );

  // Playlist navigation helpers (kept for convenience)
  const nextScene = useCallback(() => {
    dispatch({ type: "NEXT_SCENE" });
  }, []);

  const prevScene = useCallback(() => {
    dispatch({ type: "PREV_SCENE" });
  }, []);

  const gotoSceneIndex = useCallback(
    (index: number, shouldAutoplay = false) => {
      dispatch({
        type: "GOTO_SCENE_INDEX",
        payload: { index, shouldAutoplay },
      });
    },
    []
  );

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

  // Bumped by retryScene to run the load effect again
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retryScene = useCallback(() => {
    setLoadAttempt((n) => n + 1);
  }, []);

  // The scene to show: the current queue entry's, else the route's
  const playlistScene = state.playlist?.scenes?.[state.currentIndex];
  const effectiveSceneId =
    (playlistScene?.sceneId as string | undefined) || sceneId;
  // A playlist entry loads on its own server: the entry's instance, else
  // its scene's (a queue saved before entries carried one). The prop is
  // the starting scene's instance, never another entry's.
  const effectiveInstanceId = playlistScene
    ? entryInstanceId(playlistScene)
    : instanceId;

  // Load the scene when the entry's (id, instance) changes, or on retry.
  // Keyed on those strings, not the queue, so a control toggle never loads
  // the scene again.
  useEffect(() => {
    if (effectiveSceneId && ready) {
      void loadScene(effectiveSceneId, effectiveInstanceId);
    }
  }, [effectiveSceneId, effectiveInstanceId, loadScene, loadAttempt, ready]);

  // ============================================================================
  // THE QUEUE AND THE ROUTER
  // ============================================================================

  // The latest render's values, for the effects below that run on one
  // dependency only and must read the rest as they are now
  const stateRef = useRef(state);
  stateRef.current = state;
  const locationRef = useRef(location);
  locationRef.current = location;
  const routeRef = useRef({ sceneId, instanceId, playlist });
  routeRef.current = { sceneId, instanceId, playlist };
  // The router's navigate changes with each location; the effects below
  // must not run again for that
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // What the last write put in the entry, and on which entry: a render
  // before the router shows the write does not write it again
  const lastWriteRef = useRef<{ write: string; onKey: string } | null>(null);
  // The last history state that held the active queue: what a tab click's
  // entry (no state) gets back, so its fromPageTitle and shouldResume stay
  const queueStateRef = useRef<unknown>(playlist ? location.state : null);

  /**
   * Replaces the history entry with `url` and the queue as it is now: the
   * current index and the controls, beside what the entry's state held
   * (fromPageTitle, shouldResume). keepScroll: a step never scrolls the page.
   */
  const writeEntry = useCallback((url: string) => {
    const current = stateRef.current;
    const queue = current.playlist;
    if (!queue) return;
    const held: unknown = locationRef.current.state;
    const base = (
      holdsQueue(held, queue.key) ? held : queueStateRef.current
    ) as Record<string, unknown> | null | undefined;
    const controls = controlsOf(current);
    const write = JSON.stringify([
      url,
      queue.key,
      current.currentIndex,
      controls,
    ]);
    const onKey = locationRef.current.key;
    const last = lastWriteRef.current;
    if (last && last.write === write && last.onKey === onKey) return;
    lastWriteRef.current = { write, onKey };
    const entryState = {
      ...base,
      playlist: { ...queue, currentIndex: current.currentIndex, controls },
      keepScroll: true,
    };
    queueStateRef.current = entryState;
    void navigateRef.current(url, { replace: true, state: entryState });
  }, []);

  /** The path of a queue entry's scene, on its own server */
  const entryPath = useCallback(
    (entry: Record<string, unknown>) =>
      getEntityPath(
        "scene",
        {
          id: entry.sceneId as string,
          instanceId: entryInstanceId(entry) ?? undefined,
        },
        hasMultipleInstances
      ),
    [hasMultipleInstances]
  );

  // Follow the router: once per history entry, never on a step's own state
  // change (the reducer state is read through its ref)
  const seenLocationKeyRef = useRef(location.key);
  const seenRouteSceneRef = useRef(`${sceneId}@${instanceId ?? ""}`);
  const seenLocationRef = useRef(location);
  useEffect(() => {
    if (seenLocationKeyRef.current === location.key) return;
    seenLocationKeyRef.current = location.key;
    const previous = seenLocationRef.current;
    seenLocationRef.current = location;
    const route = routeRef.current;
    const routeScene = `${route.sceneId}@${route.instanceId ?? ""}`;
    const sceneChanged = routeScene !== seenRouteSceneRef.current;
    seenRouteSceneRef.current = routeScene;

    const current = stateRef.current;
    const queue = current.playlist;
    const entry = queue?.scenes?.[current.currentIndex];
    const urlIsEntry = entry
      ? isUrlEntry(entry, route.sceneId, route.instanceId)
      : false;
    const stateQueue = route.playlist;
    const { shouldAutoplay } = readSceneLocationState(location.state);

    // The fullscreen guard's own Back: stay on the entry being shown
    if (takeInternalPop()) {
      if (queue && entry) {
        writeEntry(entryPath(entry));
      } else {
        void navigateRef.current(previous.pathname + previous.search, {
          replace: true,
          state: {
            ...(previous.state as Record<string, unknown> | null),
            keepScroll: true,
          },
        });
      }
      return;
    }

    // Another queue: start it where the navigation says
    if (stateQueue && (!queue || stateQueue.key !== queue.key)) {
      queueStateRef.current = location.state;
      dispatch({
        type: "INITIALIZE",
        payload: {
          playlist: stateQueue,
          currentIndex: stateQueue.currentIndex,
          initialQuality,
          initialShouldAutoplay: shouldAutoplay ?? false,
        },
      });
      return;
    }

    // This queue (Back or Forward to an entry of it): go to its index
    if (stateQueue && queue) {
      queueStateRef.current = location.state;
      if (!urlIsEntry) {
        dispatch({
          type: "GOTO_SCENE_INDEX",
          payload: { index: stateQueue.currentIndex, shouldAutoplay: false },
        });
      }
      return;
    }

    // No queue in the entry. On the current scene (a tab click, a ?t= link)
    // the entry gets the queue, so a reload and later steps keep it.
    if (queue && urlIsEntry) {
      writeEntry(location.pathname + location.search);
      return;
    }
    // Another scene: it plays alone
    if (queue || sceneChanged) {
      dispatch({
        type: "LEAVE_QUEUE",
        payload: { shouldAutoplay: shouldAutoplay ?? false },
      });
    }
  }, [location, initialQuality, writeEntry, entryPath]);

  // Keep the history entry on the queue: after a step, once the entry's
  // scene has loaded, its URL and index; after a control toggle, the
  // controls on the same URL
  useEffect(() => {
    const queue = state.playlist;
    const entry = queue?.scenes?.[state.currentIndex];
    if (!queue || !entry) return;
    const shown = locationRef.current;
    const route = routeRef.current;
    if (isUrlEntry(entry, route.sceneId, route.instanceId)) {
      const held = readSceneLocationState(shown.state).playlist;
      const unchanged =
        held !== undefined &&
        held.key === queue.key &&
        held.currentIndex === state.currentIndex &&
        sameControls(held.controls, controlsOf(state));
      if (!unchanged) writeEntry(shown.pathname + shown.search);
      return;
    }
    if (state.scene && isLoadedEntry(state.scene, entry)) {
      writeEntry(getEntityPath("scene", state.scene, hasMultipleInstances));
    }
  }, [state, hasMultipleInstances, writeEntry]);

  // A mark the guard left for a location change that never came
  useEffect(() => clearInternalPop, []);

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
    retryScene,

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
