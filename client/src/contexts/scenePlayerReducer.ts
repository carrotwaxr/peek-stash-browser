import type { NormalizedScene, WithStashUrl } from "@peek/shared-types";
import type { PlaybackQueueControls } from "../utils/playbackQueue";

// ============================================================================
// TYPES
// ============================================================================

interface PlaylistData {
  scenes?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** The scene a load asks for: its id, and its server when known */
export interface SceneRequest {
  sceneId: string;
  instanceId: string | null;
}

/** Which way the last queue step went: an unavailable entry is skipped that way */
export type StepDirection = "next" | "prev";

export interface ScenePlayerReducerState {
  /** The scene as the scenes list answers it, with its View in Stash link */
  scene: WithStashUrl<NormalizedScene> | null;
  sceneLoading: boolean;
  sceneError: unknown;
  ready: boolean;
  shouldAutoplay: boolean;
  /** The queue as it started; never rewritten after INITIALIZE */
  playlist: PlaylistData | null;
  currentIndex: number;
  /** The playback controls: the reducer's own, read nowhere else */
  autoplayNext: boolean;
  shuffle: boolean;
  repeat: string;
  shuffleHistory: number[];
  /**
   * Bumped by a step that lands on the scene already loaded (a duplicate
   * entry, or a one-scene queue on repeat all): nothing loads again, so the
   * player restarts that scene from the start when it changes
   */
  restartCount: number;
  /**
   * The scene the latest load asked for: an answer (or failure) for any
   * other is stale and changes nothing
   */
  requested: SceneRequest | null;
  /** Queue indexes whose scene the user can no longer see; steps skip them */
  unavailable: number[];
  /** The way the last step went (GOTO and a new queue count as next) */
  direction: StepDirection;
  oCounter: number;
}

interface ScenePlayerAction {
  type: string;
  payload?: unknown;
}

/** What NEXT_SCENE and PREV_SCENE read to pick the next index */
type StepState = Pick<
  ScenePlayerReducerState,
  "playlist" | "currentIndex" | "shuffle" | "repeat" | "shuffleHistory"
> & { unavailable?: number[] };

/** Where a step lands, and the shuffle history after it */
export interface QueueStep {
  index: number;
  history: number[];
}

/** One of `items`, picked with `random` (0 <= random() < 1) */
function pick(items: number[], random: () => number): number | undefined {
  return items[Math.floor(random() * items.length)];
}

/** Every index of the queue but the current one and the unavailable ones */
function otherIndexes(s: StepState, total: number): number[] {
  return Array.from({ length: total }, (_, i) => i).filter(
    (i) => i !== s.currentIndex && !isUnavailable(s, i)
  );
}

function isUnavailable(s: StepState, index: number): boolean {
  return s.unavailable?.includes(index) ?? false;
}

/** The first available index in `indexes`, in their order */
function firstAvailable(s: StepState, indexes: number[]): number | undefined {
  return indexes.find((i) => !isUnavailable(s, i));
}

/** The indexes from `from` to `to`, both included, counting up or down */
function range(from: number, to: number): number[] {
  const step = from <= to ? 1 : -1;
  return Array.from(
    { length: Math.abs(to - from) + 1 },
    (_, i) => from + i * step
  );
}

/**
 * The index after the current one, or null at the end. Shuffle picks an
 * index not yet played and adds the current one to the history; once every
 * index is played, repeat all restarts the history with the current index.
 * Sequential steps on, and repeat all wraps to the first. Repeat one only
 * replays at the end of a video; a step moves as with repeat off. Unavailable
 * entries are passed over; with none available, there is no step (so a queue
 * of unavailable entries never loops on repeat all).
 */
export function nextIndex(
  s: StepState,
  random: () => number = Math.random
): QueueStep | null {
  const total = s.playlist?.scenes?.length ?? 0;
  if (total === 0) return null;

  if (s.shuffle) {
    const unplayed = otherIndexes(s, total).filter(
      (i) => !s.shuffleHistory.includes(i)
    );
    const index = pick(unplayed, random);
    if (index !== undefined) {
      return { index, history: [...s.shuffleHistory, s.currentIndex] };
    }
    if (s.repeat !== "all") return null;
    // Every scene played: start the history again from the current one
    const restart = pick(otherIndexes(s, total), random);
    return restart === undefined
      ? null
      : { index: restart, history: [s.currentIndex] };
  }

  const ahead =
    s.currentIndex < total - 1
      ? firstAvailable(s, range(s.currentIndex + 1, total - 1))
      : undefined;
  // Repeat all wraps to the first, up to the current one again
  const index =
    ahead ??
    (s.repeat === "all"
      ? firstAvailable(s, range(0, s.currentIndex))
      : undefined);
  return index === undefined ? null : { index, history: s.shuffleHistory };
}

/**
 * The index before the current one, or null at the start. Shuffle goes back
 * through the history, and with none picks another index at random.
 * Sequential steps back, and repeat all wraps to the last. Unavailable
 * entries are passed over, as in `nextIndex`.
 */
export function prevIndex(
  s: StepState,
  random: () => number = Math.random
): QueueStep | null {
  const total = s.playlist?.scenes?.length ?? 0;
  if (total === 0) return null;

  if (s.shuffle) {
    // Back through the history, past entries found unavailable since
    const history = [...s.shuffleHistory];
    while (history.length > 0) {
      const last = history.pop();
      if (last !== undefined && !isUnavailable(s, last)) {
        return { index: last, history };
      }
    }
    const index = pick(otherIndexes(s, total), random);
    return index === undefined ? null : { index, history: s.shuffleHistory };
  }

  const behind =
    s.currentIndex > 0
      ? firstAvailable(s, range(s.currentIndex - 1, 0))
      : undefined;
  // Repeat all wraps to the last, down to the current one again
  const index =
    behind ??
    (s.repeat === "all"
      ? firstAvailable(s, range(total - 1, s.currentIndex))
      : undefined);
  return index === undefined ? null : { index, history: s.shuffleHistory };
}

/** The (scene, server) a queue entry names, or null when it names no scene */
function entryScene(
  playlist: PlaylistData | null,
  index: number
): string | null {
  const entry = playlist?.scenes?.[index] as
    | { sceneId?: unknown; instanceId?: unknown; scene?: unknown }
    | undefined;
  if (typeof entry?.sceneId !== "string") return null;
  const scene = entry.scene as { instanceId?: unknown } | null | undefined;
  const instanceId =
    typeof entry.instanceId === "string" ? entry.instanceId : scene?.instanceId;
  return `${entry.sceneId}@${typeof instanceId === "string" ? instanceId : ""}`;
}

/**
 * The state after a step to another queue entry: the player waits for the
 * new scene, and the O count waits for the scene's own. `autoplay` sets whether the new scene starts playing; left
 * out, the current choice stays. An entry of the scene already loaded loads
 * nothing: the player restarts it (`restartCount`) and keeps the rest.
 */
function stepTo(
  state: ScenePlayerReducerState,
  step: QueueStep,
  autoplay: boolean | undefined,
  direction: StepDirection
): ScenePlayerReducerState {
  const target = entryScene(state.playlist, step.index);
  if (
    target !== null &&
    target === entryScene(state.playlist, state.currentIndex)
  ) {
    return {
      ...state,
      currentIndex: step.index,
      shuffleHistory: step.history,
      restartCount: state.restartCount + 1,
      shouldAutoplay: autoplay ?? state.shouldAutoplay,
      direction,
    };
  }
  return {
    ...state,
    currentIndex: step.index,
    shuffleHistory: step.history,
    ready: false,
    oCounter: 0,
    shouldAutoplay: autoplay ?? state.shouldAutoplay,
    direction,
  };
}

/** Do two loads ask for the same scene? (A missing one is no request.) */
function sameRequest(
  a: SceneRequest | null | undefined,
  b: SceneRequest | null
): boolean {
  if (!a || !b) return (a ?? null) === b;
  return a.sceneId === b.sceneId && a.instanceId === b.instanceId;
}

/** Is the scene shown the one this load asked for? */
function isShown(
  scene: ScenePlayerReducerState["scene"],
  request: SceneRequest | null
): boolean {
  if (!scene || !request || scene.id !== request.sceneId) return false;
  return request.instanceId === null || scene.instanceId === request.instanceId;
}

/**
 * A failed load: the error shows, and the scene shown goes unless it is the
 * one that failed (a retry), so the page never shows the previous scene
 * under another scene's URL
 */
function loadFailed(
  state: ScenePlayerReducerState,
  error: unknown
): ScenePlayerReducerState {
  return {
    ...state,
    scene: isShown(state.scene, state.requested) ? state.scene : null,
    sceneLoading: false,
    sceneError: error,
  };
}

/**
 * The queue's unavailable indexes after `index` is found unavailable: it, and
 * every other entry of the same scene
 */
export function markUnavailable(
  state: Pick<ScenePlayerReducerState, "playlist" | "unavailable">,
  index: number
): number[] {
  const scene = entryScene(state.playlist, index);
  const total = state.playlist?.scenes?.length ?? 0;
  const same = Array.from({ length: total }, (_, i) => i).filter(
    (i) =>
      i === index || (scene !== null && entryScene(state.playlist, i) === scene)
  );
  return [...new Set([...state.unavailable, ...same])].sort((a, b) => a - b);
}

/** Where a queue goes on from an unavailable entry: the last step's way */
export function stepPastUnavailable(
  state: StepState & { direction: StepDirection },
  random: () => number = Math.random
): QueueStep | null {
  return state.direction === "prev"
    ? prevIndex(state, random)
    : nextIndex(state, random);
}

/** NEXT_SCENE's and PREV_SCENE's optional payload */
function stepAutoplay(payload: unknown): boolean | undefined {
  return (payload as { autoplay?: boolean } | undefined)?.autoplay;
}

/** The controls in a queue's `controls`, or null when it holds none valid */
function readControls(value: unknown): PlaybackQueueControls | null {
  if (typeof value !== "object" || value === null) return null;
  const { autoplayNext, shuffle, repeat, shuffleHistory } = value as Record<
    string,
    unknown
  >;
  if (
    typeof autoplayNext !== "boolean" ||
    typeof shuffle !== "boolean" ||
    (repeat !== "none" && repeat !== "one" && repeat !== "all") ||
    !Array.isArray(shuffleHistory) ||
    !shuffleHistory.every((i) => Number.isInteger(i))
  ) {
    return null;
  }
  return {
    autoplayNext,
    shuffle,
    repeat,
    shuffleHistory: shuffleHistory as number[],
  };
}

/** The reducer's controls, as the player writes them into the entry */
export function controlsOf(
  state: ScenePlayerReducerState
): PlaybackQueueControls {
  const repeat = state.repeat;
  return {
    autoplayNext: state.autoplayNext,
    shuffle: state.shuffle,
    repeat: repeat === "one" || repeat === "all" ? repeat : "none",
    shuffleHistory: state.shuffleHistory,
  };
}

// ============================================================================
// INITIAL STATE
// ============================================================================

export const initialState: ScenePlayerReducerState = {
  // Scene data (from Stash API)
  scene: null,
  sceneLoading: false,
  sceneError: null,

  // Player internal state
  ready: false, // Player ready to play (metadata loaded)
  shouldAutoplay: false, // Should trigger autoplay when ready

  // Playlist
  playlist: null,
  currentIndex: 0,

  // Playlist controls
  autoplayNext: true, // Auto-advance to next scene when current ends
  shuffle: false, // Play scenes in random order
  repeat: "none", // "none" | "all" | "one"
  shuffleHistory: [], // Track played scenes to avoid immediate repeats
  restartCount: 0,

  // Scene loads and unavailable queue entries
  requested: null,
  unavailable: [],
  direction: "next",

  // O Counter
  oCounter: 0,
};

// ============================================================================
// REDUCER
// ============================================================================

export function scenePlayerReducer(
  state: ScenePlayerReducerState,
  action: ScenePlayerAction
): ScenePlayerReducerState {
  switch (action.type) {
    // Scene loading
    case "LOAD_SCENE_START":
      return {
        ...state,
        sceneLoading: true,
        sceneError: null,
        requested: (action.payload as SceneRequest | undefined) ?? null,
      };

    case "LOAD_SCENE_SUCCESS": {
      const payload = action.payload as {
        request?: SceneRequest;
        scene: WithStashUrl<NormalizedScene>;
        oCounter?: number;
      };
      // An answer for a scene asked for before the latest: stale
      if (!sameRequest(payload.request, state.requested)) return state;
      return {
        ...state,
        scene: payload.scene,
        oCounter: payload.oCounter || 0,
        sceneLoading: false,
        sceneError: null,
      };
    }

    case "LOAD_SCENE_ERROR": {
      const payload = action.payload as {
        request?: SceneRequest;
        error: unknown;
      };
      if (!sameRequest(payload.request, state.requested)) return state;
      return loadFailed(state, payload.error);
    }

    // The current queue entry's scene is not found (deleted, hidden,
    // restricted, or on a server the user turned off): mark it and step on
    // the way the last step went. With nothing left, the error shows.
    case "ENTRY_UNAVAILABLE": {
      const payload = action.payload as {
        index: number;
        request?: SceneRequest;
        error: unknown;
      };
      if (!sameRequest(payload.request, state.requested)) return state;
      const marked = {
        ...state,
        unavailable: markUnavailable(state, payload.index),
      };
      const step = stepPastUnavailable(marked);
      if (!step) return loadFailed(marked, payload.error);
      return {
        ...stepTo(marked, step, undefined, state.direction),
        sceneError: null,
      };
    }

    // Queue navigation: the one advance path (the controls, the end of a
    // video and the media keys all step through here)
    case "NEXT_SCENE": {
      const step = nextIndex(state);
      return step
        ? stepTo(state, step, stepAutoplay(action.payload), "next")
        : state;
    }

    case "PREV_SCENE": {
      const step = prevIndex(state);
      return step
        ? stepTo(state, step, stepAutoplay(action.payload), "prev")
        : state;
    }

    case "GOTO_SCENE_INDEX": {
      const gotoPayload = action.payload as
        | { index?: number; shouldAutoplay?: boolean }
        | number;
      const index =
        typeof gotoPayload === "object" && gotoPayload !== null
          ? (gotoPayload.index ?? 0)
          : gotoPayload;
      const shouldAutoplay =
        typeof gotoPayload === "object" && gotoPayload !== null
          ? (gotoPayload.shouldAutoplay ?? false)
          : false;

      if (
        !state.playlist ||
        !state.playlist.scenes ||
        index < 0 ||
        index >= state.playlist.scenes.length
      ) {
        return state;
      }

      return stepTo(
        state,
        { index, history: state.shuffleHistory },
        shouldAutoplay,
        "next"
      );
    }

    // Player state
    case "SET_READY":
      return {
        ...state,
        ready: action.payload as boolean,
      };

    case "SET_SHOULD_AUTOPLAY":
      return {
        ...state,
        shouldAutoplay: action.payload as boolean,
      };

    // O Counter
    case "SET_O_COUNTER":
      return {
        ...state,
        oCounter: action.payload as number,
      };

    // Playlist controls: only the control fields change, never the queue,
    // so a toggle never loads the scene again
    case "TOGGLE_AUTOPLAY_NEXT":
      return {
        ...state,
        autoplayNext: !state.autoplayNext,
      };

    case "TOGGLE_SHUFFLE": {
      const newShuffle = !state.shuffle;
      return {
        ...state,
        shuffle: newShuffle,
        // Reset shuffle history when turning shuffle on
        shuffleHistory: newShuffle ? [] : state.shuffleHistory,
      };
    }

    case "TOGGLE_REPEAT": {
      // Cycle through: none → all → one → none
      const repeatModes = ["none", "all", "one"];
      const currentIdx = repeatModes.indexOf(state.repeat);
      const nextRepeat = repeatModes[(currentIdx + 1) % repeatModes.length];
      if (nextRepeat === undefined) return state;
      return {
        ...state,
        repeat: nextRepeat,
      };
    }

    // A navigation to a scene outside the queue: the queue and its
    // controls go, and the route's scene loads
    case "LEAVE_QUEUE": {
      const leavePayload = action.payload as
        | { shouldAutoplay?: boolean }
        | undefined;
      return {
        ...state,
        playlist: null,
        currentIndex: 0,
        autoplayNext: true,
        shuffle: false,
        repeat: "none",
        shuffleHistory: [],
        unavailable: [],
        direction: "next",
        shouldAutoplay: leavePayload?.shouldAutoplay ?? false,
      };
    }

    // Start a queue (or none): from the navigation that handed it over, or
    // from a history entry's state on a reload or Back
    case "INITIALIZE": {
      const initPayload = action.payload as {
        playlist?: PlaylistData | null;
        currentIndex?: number;
        initialShouldAutoplay?: boolean;
      };
      const playlist = initPayload.playlist;
      // The controls the player wrote into the entry at its last step or
      // toggle; a queue handed over by a page has none
      const controls = readControls(playlist?.controls);

      // Get shouldAutoplay from props (passed via location.state)
      // Preserve existing value if already set (for re-initialization)
      const shouldAutoplay =
        initPayload.initialShouldAutoplay || state.shouldAutoplay || false;

      return {
        ...state,
        playlist: playlist ?? null,
        currentIndex: initPayload.currentIndex || 0,
        // A queue carries shuffle and repeat as starting values only;
        // autoplay starts on wherever a queue starts
        autoplayNext: controls?.autoplayNext ?? true,
        shuffle:
          controls?.shuffle ??
          (playlist?.shuffle as boolean | undefined) ??
          false,
        repeat:
          controls?.repeat ??
          (playlist?.repeat as string | undefined) ??
          "none",
        shuffleHistory: controls?.shuffleHistory ?? [],
        unavailable: [],
        direction: "next",
        // Use the determined shouldAutoplay value
        shouldAutoplay: shouldAutoplay,
      };
    }

    default:
      return state;
  }
}
