import type { NormalizedScene, WithStashUrl } from "@peek/shared-types";
import type { PlaybackQueueControls } from "../utils/playbackQueue";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Quality presets in descending order of resolution
 * Must match the presets defined in TranscodingManager.ts and useVideoPlayer.js
 */
const QUALITY_PRESETS = [
  { height: 2160, quality: "2160p" },
  { height: 1080, quality: "1080p" },
  { height: 720, quality: "720p" },
  { height: 480, quality: "480p" },
  { height: 360, quality: "360p" },
];

/**
 * Get the best transcode quality for a given source resolution
 * Returns the highest quality preset that is <= source height
 */
function getBestTranscodeQuality(sourceHeight: number) {
  for (const preset of QUALITY_PRESETS) {
    if (preset.height <= sourceHeight) {
      return preset.quality;
    }
  }
  return "360p";
}

// ============================================================================
// TYPES
// ============================================================================

interface PlaylistData {
  scenes?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ScenePlayerReducerState {
  /** The scene as the scenes list answers it, with its View in Stash link */
  scene: WithStashUrl<NormalizedScene> | null;
  sceneLoading: boolean;
  sceneError: unknown;
  quality: string;
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
>;

/** Where a step lands, and the shuffle history after it */
export interface QueueStep {
  index: number;
  history: number[];
}

/** One of `items`, picked with `random` (0 <= random() < 1) */
function pick(items: number[], random: () => number): number | undefined {
  return items[Math.floor(random() * items.length)];
}

/** Every index of the queue but the current one */
function otherIndexes(s: StepState, total: number): number[] {
  return Array.from({ length: total }, (_, i) => i).filter(
    (i) => i !== s.currentIndex
  );
}

/**
 * The index after the current one, or null at the end. Shuffle picks an
 * index not yet played and adds the current one to the history; once every
 * index is played, repeat all restarts the history with the current index.
 * Sequential steps on, and repeat all wraps to the first. Repeat one only
 * replays at the end of a video; a step moves as with repeat off.
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

  if (s.currentIndex < total - 1) {
    return { index: s.currentIndex + 1, history: s.shuffleHistory };
  }
  return s.repeat === "all" ? { index: 0, history: s.shuffleHistory } : null;
}

/**
 * The index before the current one, or null at the start. Shuffle goes back
 * through the history, and with none picks another index at random.
 * Sequential steps back, and repeat all wraps to the last.
 */
export function prevIndex(
  s: StepState,
  random: () => number = Math.random
): QueueStep | null {
  const total = s.playlist?.scenes?.length ?? 0;
  if (total === 0) return null;

  if (s.shuffle) {
    const last = s.shuffleHistory[s.shuffleHistory.length - 1];
    if (last !== undefined) {
      return { index: last, history: s.shuffleHistory.slice(0, -1) };
    }
    const index = pick(otherIndexes(s, total), random);
    return index === undefined ? null : { index, history: s.shuffleHistory };
  }

  if (s.currentIndex > 0) {
    return { index: s.currentIndex - 1, history: s.shuffleHistory };
  }
  return s.repeat === "all"
    ? { index: total - 1, history: s.shuffleHistory }
    : null;
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
 * new scene, quality starts at direct again, and the O count waits for the
 * scene's own. `autoplay` sets whether the new scene starts playing; left
 * out, the current choice stays. An entry of the scene already loaded loads
 * nothing: the player restarts it (`restartCount`) and keeps the rest.
 */
function stepTo(
  state: ScenePlayerReducerState,
  step: QueueStep,
  autoplay: boolean | undefined
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
    };
  }
  return {
    ...state,
    currentIndex: step.index,
    shuffleHistory: step.history,
    ready: false,
    quality: "direct",
    oCounter: 0,
    shouldAutoplay: autoplay ?? state.shouldAutoplay,
  };
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
  quality: "direct",

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
      };

    case "LOAD_SCENE_SUCCESS": {
      const payload = action.payload as {
        scene: WithStashUrl<NormalizedScene>;
        oCounter?: number;
      };
      const scene = payload.scene;

      // Smart default quality selection based on codec detection (Phase 3)
      // If scene has streamability info and quality is still at default "direct",
      // automatically choose the best quality
      let autoSelectedQuality = state.quality;

      if (state.quality === "direct" && scene.isStreamable !== undefined) {
        if (scene.isStreamable) {
          // Scene is browser-compatible - keep direct play
          autoSelectedQuality = "direct";
        } else {
          // Scene needs transcoding - choose highest quality <= source resolution
          const sourceHeight = scene.files?.[0]?.height || 1080;
          autoSelectedQuality = getBestTranscodeQuality(sourceHeight);
        }
      }

      return {
        ...state,
        scene: scene,
        oCounter: payload.oCounter || 0,
        quality: autoSelectedQuality,
        sceneLoading: false,
        sceneError: null,
      };
    }

    case "LOAD_SCENE_ERROR":
      return {
        ...state,
        sceneLoading: false,
        sceneError: action.payload,
      };

    // Quality management
    case "SET_QUALITY":
      return {
        ...state,
        quality: action.payload as string,
      };

    // Queue navigation: the one advance path (the controls, the end of a
    // video and the media keys all step through here)
    case "NEXT_SCENE": {
      const step = nextIndex(state);
      return step ? stepTo(state, step, stepAutoplay(action.payload)) : state;
    }

    case "PREV_SCENE": {
      const step = prevIndex(state);
      return step ? stepTo(state, step, stepAutoplay(action.payload)) : state;
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
        shouldAutoplay
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
        shouldAutoplay: leavePayload?.shouldAutoplay ?? false,
      };
    }

    // Start a queue (or none): from the navigation that handed it over, or
    // from a history entry's state on a reload or Back
    case "INITIALIZE": {
      const initPayload = action.payload as {
        playlist?: PlaylistData | null;
        currentIndex?: number;
        initialQuality?: string;
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
        quality: initPayload.initialQuality || "direct",
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
        // Use the determined shouldAutoplay value
        shouldAutoplay: shouldAutoplay,
      };
    }

    default:
      return state;
  }
}
