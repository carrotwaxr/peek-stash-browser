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
import type { FindScenesResponse } from "@peek/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../api";
import { ApiError } from "../api/client";
import {
  isLibraryInitializing,
  markLibraryNotReady,
  useLibraryReady,
} from "../api/hooks/useLibraryReady";
import { useAuth } from "../hooks/useAuth";
import { describeLookupFailure } from "../hooks/useEntityLookup";
import { getEntityPath } from "../utils/entityLinks";
import { clearInternalPop, takeInternalPop } from "../utils/historyGuard";
import {
  type PlaybackQueue,
  readSceneLocationState,
} from "../utils/playbackQueue";
import { showWarning } from "../utils/toast";
import { useConfig } from "./ConfigContext";
import {
  type ScenePlayerReducerState,
  type SceneRequest,
  controlsOf,
  initialState,
  markUnavailable,
  scenePlayerReducer,
  stepPastUnavailable,
} from "./scenePlayerReducer";

// Use the reducer's state type directly
type ScenePlayerState = ScenePlayerReducerState;

interface ScenePlayerContextValue extends ScenePlayerState {
  shouldResume: boolean;
  dispatch: Dispatch<{ type: string; payload?: unknown }>;
  loadScene: (
    sceneId: string,
    instanceId?: string | null,
    signal?: AbortSignal
  ) => Promise<void>;
  /** Loads the current scene again (after a failed load) */
  retryScene: () => void;
  /** The video.js player, once it exists (and null when it is gone) */
  registerPlayer: (player: RegisteredPlayer | null) => void;
  /** Is the registered player playing right now? */
  isPlaying: () => boolean;
  toggleAutoplayNext: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

/** What the context asks of the player: whether it is paused */
export interface RegisteredPlayer {
  paused(): boolean;
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

/** Is this queue entry the scene a load asked for? */
function isRequestedEntry(
  entry: Record<string, unknown>,
  request: SceneRequest
): boolean {
  return (
    entry.sceneId === request.sceneId &&
    entryInstanceId(entry) === request.instanceId
  );
}

/** A queue entry's title, as the queue's own lists show it */
function entryTitle(entry: Record<string, unknown>): string {
  const scene = entry.scene as
    | { title?: unknown; files?: Array<{ basename?: unknown }> }
    | null
    | undefined;
  if (typeof scene?.title === "string" && scene.title) return scene.title;
  const basename = scene?.files?.[0]?.basename;
  return typeof basename === "string" && basename ? basename : "Untitled";
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
function holdsQueue(
  state: unknown,
  key: unknown,
  userId: number | undefined
): boolean {
  const held = readSceneLocationState(state, userId).playlist;
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
        initialShouldAutoplay,
      },
    })
  );
  const { hasMultipleInstances } = useConfig();
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const { ready } = useLibraryReady();
  const location = useLocation();
  const navigate = useNavigate();

  // The latest render's state, for callbacks and effects that must read it
  // as it is now
  const stateRef = useRef(state);
  stateRef.current = state;

  // ============================================================================
  // ACTION CREATORS (with side effects)
  // ============================================================================

  /**
   * Loads a scene. An answer counts only for the latest load (the reducer
   * drops any other), and an aborted load dispatches nothing. In a queue, a
   * scene not found (deleted, hidden, restricted, or on a server turned off)
   * is skipped with a notice; any other failure shows with Retry.
   */
  const loadScene = useCallback(
    async (
      sceneIdToLoad: string,
      sceneInstanceId?: string | null,
      signal?: AbortSignal
    ) => {
      const request: SceneRequest = {
        sceneId: sceneIdToLoad,
        instanceId: sceneInstanceId ?? null,
      };
      dispatch({ type: "LOAD_SCENE_START", payload: request });
      try {
        const requestBody: Record<string, unknown> = {
          ids: [sceneIdToLoad],
        };
        // Include instance_id for disambiguation when multiple instances exist
        if (sceneInstanceId) {
          requestBody.scene_filter = { instance_id: sceneInstanceId };
        }
        const data = await apiPost<FindScenesResponse>(
          "/library/scenes",
          requestBody,
          signal
        );
        if (signal?.aborted) return;
        const scene = data?.findScenes?.scenes?.[0];

        // None the user can see: missing, hidden or restricted alike
        if (!scene) {
          throw new ApiError("Scene not found", 404);
        }

        dispatch({
          type: "LOAD_SCENE_SUCCESS",
          payload: {
            request,
            scene: scene,
            oCounter: scene.o_counter || 0,
          },
        });
      } catch (error) {
        // A later load, or leaving the page, replaced this one
        if (signal?.aborted) return;
        // The library's first sync is running: stay loading; the re-check
        // runs the load again once it is ready
        if (isLibraryInitializing(error)) {
          markLibraryNotReady(queryClient);
          return;
        }
        const current = stateRef.current;
        const index = current.currentIndex;
        const entry = current.playlist?.scenes?.[index];
        if (
          entry &&
          isRequestedEntry(entry, request) &&
          describeLookupFailure(error).status === "notFound"
        ) {
          // Only a skip gets the notice; with nothing left to play, the
          // page's not-found view says it
          const marked = {
            ...current,
            unavailable: markUnavailable(current, index),
          };
          if (stepPastUnavailable(marked, () => 0)) {
            showWarning(
              `Skipped "${entryTitle(entry)}": it is no longer available`
            );
          }
          dispatch({
            type: "ENTRY_UNAVAILABLE",
            payload: { index, request, error },
          });
          return;
        }
        console.error("Error loading scene:", error);
        dispatch({
          type: "LOAD_SCENE_ERROR",
          payload: { request, error },
        });
      }
    },
    [queryClient]
  );

  // The player, for the queue steps that keep playing what is playing
  const playerRef = useRef<RegisteredPlayer | null>(null);
  const registerPlayer = useCallback((player: RegisteredPlayer | null) => {
    playerRef.current = player;
  }, []);
  const isPlaying = useCallback(() => {
    const player = playerRef.current;
    return player !== null && !player.paused();
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
  // The next load (or leaving the page) aborts the last one.
  useEffect(() => {
    if (!effectiveSceneId || !ready) return;
    const controller = new AbortController();
    void loadScene(effectiveSceneId, effectiveInstanceId, controller.signal);
    return () => controller.abort();
  }, [effectiveSceneId, effectiveInstanceId, loadScene, loadAttempt, ready]);

  // ============================================================================
  // THE QUEUE AND THE ROUTER
  // ============================================================================

  // The latest render's values, for the effects below that run on one
  // dependency only and must read the rest as they are now (and stateRef)
  const locationRef = useRef(location);
  locationRef.current = location;
  // The signed-in user: the queue in an entry is theirs, or none
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
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
      holdsQueue(held, queue.key, userIdRef.current)
        ? held
        : queueStateRef.current
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
      playlist: {
        ...queue,
        // The entry outlives a sign-out: it says whose queue this is
        userId: userIdRef.current,
        currentIndex: current.currentIndex,
        controls,
      },
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
    const { shouldAutoplay } = readSceneLocationState(
      location.state,
      userIdRef.current
    );

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
  }, [location, writeEntry, entryPath]);

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
      const held = readSceneLocationState(
        shown.state,
        userIdRef.current
      ).playlist;
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

    // The player, for queue steps (see useQueueNavigation)
    registerPlayer,
    isPlaying,

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
