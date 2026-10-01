import type { NormalizedScene } from "@peek/shared-types";
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import {
  initialState,
  nextIndex,
  prevIndex,
  scenePlayerReducer,
} from "@/contexts/scenePlayerReducer";
import type { ScenePlayerReducerState } from "@/contexts/scenePlayerReducer";
import { buildPlaybackQueue } from "@/utils/playbackQueue";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal playlist with N scenes for navigation tests. */
function makePlaylist(count: number, overrides: Record<string, unknown> = {}) {
  return {
    scenes: Array.from({ length: count }, (_, i) => ({ id: `scene-${i}` })),
    shuffle: false,
    repeat: "none",
    ...overrides,
  };
}

/** Deep-clone a plain object so we can later assert the original was not mutated. */
function snapshot<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/** The state without the four playback controls the toggles own */
function withoutControls(state: ScenePlayerReducerState) {
  const controls = new Set([
    "autoplayNext",
    "shuffle",
    "repeat",
    "shuffleHistory",
  ]);
  return Object.fromEntries(
    Object.entries(state).filter(([key]) => !controls.has(key))
  );
}

/** A queue as the grids, carousels and history build it (no autoplayNext) */
function rowQueue(options: { shuffle?: boolean; repeat?: "none" | "all" }) {
  return buildPlaybackQueue({
    userId: 1,
    id: "virtual-grid",
    name: "Scene Grid",
    scenes: untrusted<NormalizedScene[]>([
      { id: "1", instanceId: "inst-a" },
      { id: "2", instanceId: "inst-a" },
      { id: "3", instanceId: "inst-a" },
    ]),
    currentIndex: 0,
    ...options,
  });
}

type Mode = "sequential" | "shuffle";
type Repeat = "none" | "all" | "one";
type Where = "first" | "middle" | "last";
type Step = { index: number; history: number[] } | null;

/** 5 scenes: first 0, middle 2, last 4; an empty shuffle history; random 0 */
const POSITIONS: Record<Where, number> = { first: 0, middle: 2, last: 4 };

const NEXT_TABLE: Array<[Mode, Repeat, Where, Step]> = [
  ["sequential", "none", "first", { index: 1, history: [] }],
  ["sequential", "none", "middle", { index: 3, history: [] }],
  ["sequential", "none", "last", null],
  ["sequential", "all", "first", { index: 1, history: [] }],
  ["sequential", "all", "middle", { index: 3, history: [] }],
  ["sequential", "all", "last", { index: 0, history: [] }],
  ["sequential", "one", "first", { index: 1, history: [] }],
  ["sequential", "one", "middle", { index: 3, history: [] }],
  ["sequential", "one", "last", null],
  // Shuffle picks the first unplayed index other than the current one
  ["shuffle", "none", "first", { index: 1, history: [0] }],
  ["shuffle", "none", "middle", { index: 0, history: [2] }],
  ["shuffle", "none", "last", { index: 0, history: [4] }],
  ["shuffle", "all", "first", { index: 1, history: [0] }],
  ["shuffle", "all", "middle", { index: 0, history: [2] }],
  ["shuffle", "all", "last", { index: 0, history: [4] }],
  ["shuffle", "one", "first", { index: 1, history: [0] }],
  ["shuffle", "one", "middle", { index: 0, history: [2] }],
  ["shuffle", "one", "last", { index: 0, history: [4] }],
];

const PREV_TABLE: Array<[Mode, Repeat, Where, Step]> = [
  ["sequential", "none", "first", null],
  ["sequential", "none", "middle", { index: 1, history: [] }],
  ["sequential", "none", "last", { index: 3, history: [] }],
  ["sequential", "all", "first", { index: 4, history: [] }],
  ["sequential", "all", "middle", { index: 1, history: [] }],
  ["sequential", "all", "last", { index: 3, history: [] }],
  ["sequential", "one", "first", null],
  ["sequential", "one", "middle", { index: 1, history: [] }],
  ["sequential", "one", "last", { index: 3, history: [] }],
  // No history: a random other index, the history unchanged
  ["shuffle", "none", "first", { index: 1, history: [] }],
  ["shuffle", "none", "middle", { index: 0, history: [] }],
  ["shuffle", "none", "last", { index: 0, history: [] }],
  ["shuffle", "all", "first", { index: 1, history: [] }],
  ["shuffle", "all", "middle", { index: 0, history: [] }],
  ["shuffle", "all", "last", { index: 0, history: [] }],
  ["shuffle", "one", "first", { index: 1, history: [] }],
  ["shuffle", "one", "middle", { index: 0, history: [] }],
  ["shuffle", "one", "last", { index: 0, history: [] }],
];

function tableState(
  mode: Mode,
  repeat: Repeat,
  where: Where
): ScenePlayerReducerState {
  return {
    ...initialState,
    playlist: makePlaylist(5),
    currentIndex: POSITIONS[where],
    shuffle: mode === "shuffle",
    repeat,
    shuffleHistory: [],
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe("scenePlayerReducer", () => {
  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------
  describe("initialState", () => {
    it("has the expected shape and defaults", () => {
      expect(initialState).toEqual({
        scene: null,
        sceneLoading: false,
        sceneError: null,

        quality: "direct",

        ready: false,
        shouldAutoplay: false,

        playlist: null,
        currentIndex: 0,

        autoplayNext: true,
        shuffle: false,
        repeat: "none",
        shuffleHistory: [],
        restartCount: 0,

        oCounter: 0,
      });
      expect(initialState).not.toHaveProperty("compatibility");
    });

    it("deleted actions are gone", () => {
      expect(initialState).not.toHaveProperty("video");
      expect(initialState).not.toHaveProperty("sessionId");
      expect(initialState).not.toHaveProperty("isAutoFallback");
      for (const type of [
        "LOAD_VIDEO_START",
        "SET_VIDEO",
        "SET_SESSION_ID",
        "CLEAR_VIDEO",
        "SET_CURRENT_INDEX",
        "SET_AUTO_FALLBACK",
        "SET_SWITCHING_MODE",
        "SET_INITIALIZING",
        "SET_SHUFFLE_HISTORY",
      ]) {
        const state = { ...initialState, playlist: makePlaylist(3) };
        expect(scenePlayerReducer(state, { type, payload: 1 })).toBe(state);
      }
    });
  });

  // -------------------------------------------------------------------------
  // One advance path: NEXT_SCENE and PREV_SCENE step through nextIndex and
  // prevIndex, and the controls live in the reducer's own fields
  // -------------------------------------------------------------------------
  describe("One advance path", () => {
    let random: MockInstance<() => number>;

    beforeEach(() => {
      random = vi.spyOn(Math, "random").mockReturnValue(0);
    });

    afterEach(() => {
      random.mockRestore();
    });

    it.each(NEXT_TABLE)(
      "the reducer exports nextIndex and prevIndex, which NEXT_SCENE and PREV_SCENE use: next, %s, repeat %s, %s",
      (mode, repeat, where, expected) => {
        const state = tableState(mode, repeat, where);

        expect(nextIndex(state, () => 0)).toEqual(expected);

        const after = scenePlayerReducer(state, { type: "NEXT_SCENE" });
        expect(after === state).toBe(expected === null);
        expect(after.currentIndex).toBe(expected?.index ?? state.currentIndex);
        expect(after.shuffleHistory).toEqual(
          expected?.history ?? state.shuffleHistory
        );
      }
    );

    it.each(PREV_TABLE)(
      "the reducer exports nextIndex and prevIndex, which NEXT_SCENE and PREV_SCENE use: prev, %s, repeat %s, %s",
      (mode, repeat, where, expected) => {
        const state = tableState(mode, repeat, where);

        expect(prevIndex(state, () => 0)).toEqual(expected);

        const after = scenePlayerReducer(state, { type: "PREV_SCENE" });
        expect(after === state).toBe(expected === null);
        expect(after.currentIndex).toBe(expected?.index ?? state.currentIndex);
        expect(after.shuffleHistory).toEqual(
          expected?.history ?? state.shuffleHistory
        );
      }
    );

    it("nextIndex in shuffle with every scene played: null without repeat all, a restart with it", () => {
      const played = {
        ...tableState("shuffle", "none", "first"),
        shuffleHistory: [1, 2, 3, 4],
      };

      expect(nextIndex(played, () => 0)).toBeNull();
      expect(nextIndex({ ...played, repeat: "one" }, () => 0)).toBeNull();
      expect(nextIndex({ ...played, repeat: "all" }, () => 0)).toEqual({
        index: 1,
        history: [0],
      });
    });

    it("prevIndex in shuffle goes back through the history", () => {
      const state = {
        ...tableState("shuffle", "none", "middle"),
        shuffleHistory: [4, 1],
      };

      expect(prevIndex(state, () => 0.99)).toEqual({ index: 1, history: [4] });
    });

    it("repeat-all shuffle after every scene played restarts the history with the current index and resets quality and oCounter like every other branch", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(3),
        currentIndex: 0,
        shuffle: true,
        repeat: "all",
        shuffleHistory: [1, 2],
        quality: "720p",
        oCounter: 4,
        ready: true,
      };

      const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

      expect(result.currentIndex).toBe(1);
      expect(result.shuffleHistory).toEqual([0]);
      expect(result.quality).toBe("direct");
      expect(result.oCounter).toBe(0);
      expect(result.ready).toBe(false);
      expect(result.playlist).toBe(state.playlist);
    });

    it("NEXT_SCENE with autoplay sets shouldAutoplay", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(3),
        shouldAutoplay: false,
      };

      const result = scenePlayerReducer(state, {
        type: "NEXT_SCENE",
        payload: { autoplay: true },
      });

      expect(result.currentIndex).toBe(1);
      expect(result.shouldAutoplay).toBe(true);
      // Without the payload, the flag is left as it is
      expect(
        scenePlayerReducer(state, { type: "NEXT_SCENE" }).shouldAutoplay
      ).toBe(false);
      expect(
        scenePlayerReducer(
          { ...state, currentIndex: 1 },
          { type: "PREV_SCENE", payload: { autoplay: true } }
        ).shouldAutoplay
      ).toBe(true);
    });

    it("toggles change only the control fields; state.playlist keeps its identity", () => {
      const prev: ScenePlayerReducerState = {
        ...initialState,
        playlist: makePlaylist(3),
        currentIndex: 1,
        shuffleHistory: [0],
      };

      for (const type of [
        "TOGGLE_AUTOPLAY_NEXT",
        "TOGGLE_SHUFFLE",
        "TOGGLE_REPEAT",
      ]) {
        const next = scenePlayerReducer(prev, { type });
        expect(next.playlist).toBe(prev.playlist);
        expect(withoutControls(next)).toEqual(withoutControls(prev));
      }
    });
  });

  // -------------------------------------------------------------------------
  // Scene loading lifecycle
  // -------------------------------------------------------------------------
  describe("Scene loading lifecycle", () => {
    it("LOAD_SCENE_START sets sceneLoading true and clears error", () => {
      const state = { ...initialState, sceneError: "old error" };
      const result = scenePlayerReducer(state, { type: "LOAD_SCENE_START" });

      expect(result.sceneLoading).toBe(true);
      expect(result.sceneError).toBeNull();
    });

    it("LOAD_SCENE_SUCCESS sets scene, oCounter, clears loading", () => {
      const scene = { id: "1", isStreamable: true, files: [] };
      const state = { ...initialState, sceneLoading: true };
      const result = scenePlayerReducer(state, {
        type: "LOAD_SCENE_SUCCESS",
        payload: { scene, oCounter: 5 },
      });

      expect(result.scene).toBe(scene);
      expect(result.oCounter).toBe(5);
      expect(result.sceneLoading).toBe(false);
      expect(result.sceneError).toBeNull();
    });

    it("LOAD_SCENE_SUCCESS defaults oCounter to 0 if not provided", () => {
      const scene = { id: "1", isStreamable: true, files: [] };
      const result = scenePlayerReducer(initialState, {
        type: "LOAD_SCENE_SUCCESS",
        payload: { scene },
      });

      expect(result.oCounter).toBe(0);
    });

    it("LOAD_SCENE_ERROR sets error and clears loading", () => {
      const state = { ...initialState, sceneLoading: true };
      const result = scenePlayerReducer(state, {
        type: "LOAD_SCENE_ERROR",
        payload: "Something went wrong",
      });

      expect(result.sceneLoading).toBe(false);
      expect(result.sceneError).toBe("Something went wrong");
    });
  });

  // -------------------------------------------------------------------------
  // LOAD_SCENE_SUCCESS quality auto-selection
  // -------------------------------------------------------------------------
  describe("LOAD_SCENE_SUCCESS quality auto-selection", () => {
    it("keeps 'direct' when scene.isStreamable is true", () => {
      const scene = { id: "1", isStreamable: true, files: [{ height: 1080 }] };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );

      expect(result.quality).toBe("direct");
    });

    it("selects '1080p' when isStreamable=false and height=1080", () => {
      const scene = {
        id: "1",
        isStreamable: false,
        files: [{ height: 1080 }],
      };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );

      expect(result.quality).toBe("1080p");
    });

    it("selects '2160p' when isStreamable=false and height=2160", () => {
      const scene = {
        id: "1",
        isStreamable: false,
        files: [{ height: 2160 }],
      };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );

      expect(result.quality).toBe("2160p");
    });

    it("selects '720p' when isStreamable=false and height=720", () => {
      const scene = {
        id: "1",
        isStreamable: false,
        files: [{ height: 720 }],
      };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );

      expect(result.quality).toBe("720p");
    });

    it("selects '360p' when isStreamable=false and height=400 (between 480 and 360)", () => {
      const scene = {
        id: "1",
        isStreamable: false,
        files: [{ height: 400 }],
      };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );

      expect(result.quality).toBe("360p");
    });

    it("selects '480p' when isStreamable=false and height=480", () => {
      const scene = {
        id: "1",
        isStreamable: false,
        files: [{ height: 480 }],
      };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );

      expect(result.quality).toBe("480p");
    });

    it("selects '360p' as fallback when height is very small", () => {
      const scene = {
        id: "1",
        isStreamable: false,
        files: [{ height: 240 }],
      };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );

      expect(result.quality).toBe("360p");
    });

    it("defaults to 1080p source height when files array is missing", () => {
      const scene = { id: "1", isStreamable: false };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );

      expect(result.quality).toBe("1080p");
    });

    it("defaults to 1080p source height when files array is empty", () => {
      const scene = { id: "1", isStreamable: false, files: [] };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );

      expect(result.quality).toBe("1080p");
    });

    it("does NOT auto-select when isStreamable is undefined", () => {
      const scene = { id: "1", files: [{ height: 720 }] };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );

      // isStreamable is undefined so the condition `scene.isStreamable !== undefined`
      // is false, quality stays at the current state value
      expect(result.quality).toBe("direct");
    });

    it("does NOT auto-select when quality has already been changed from 'direct'", () => {
      const scene = {
        id: "1",
        isStreamable: false,
        files: [{ height: 1080 }],
      };
      const result = scenePlayerReducer(
        { ...initialState, quality: "720p" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );

      // Quality is already "720p" (not "direct"), so no auto-selection
      expect(result.quality).toBe("720p");
    });

    it("selects best quality for heights between presets (1440p -> 1080p)", () => {
      const scene = {
        id: "1",
        isStreamable: false,
        files: [{ height: 1440 }],
      };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );

      // 1440 is less than 2160 but >= 1080, so 1080p is the best <= sourceHeight
      expect(result.quality).toBe("1080p");
    });
  });

  // -------------------------------------------------------------------------
  // Simple setters
  // -------------------------------------------------------------------------
  describe("Simple setters", () => {
    it("SET_QUALITY updates quality", () => {
      const result = scenePlayerReducer(initialState, {
        type: "SET_QUALITY",
        payload: "720p",
      });
      expect(result.quality).toBe("720p");
    });

    it("SET_READY updates ready", () => {
      const result = scenePlayerReducer(initialState, {
        type: "SET_READY",
        payload: true,
      });
      expect(result.ready).toBe(true);
    });

    it("SET_SHOULD_AUTOPLAY updates shouldAutoplay", () => {
      const result = scenePlayerReducer(initialState, {
        type: "SET_SHOULD_AUTOPLAY",
        payload: true,
      });
      expect(result.shouldAutoplay).toBe(true);
    });

    it("SET_O_COUNTER updates oCounter", () => {
      const result = scenePlayerReducer(initialState, {
        type: "SET_O_COUNTER",
        payload: 42,
      });
      expect(result.oCounter).toBe(42);
    });
  });

  // -------------------------------------------------------------------------
  // O Counter
  // -------------------------------------------------------------------------
  describe("O Counter", () => {
    it("SET_O_COUNTER sets the counter value", () => {
      const result = scenePlayerReducer(initialState, {
        type: "SET_O_COUNTER",
        payload: 42,
      });
      expect(result.oCounter).toBe(42);
    });
  });

  // -------------------------------------------------------------------------
  // Playlist controls
  // -------------------------------------------------------------------------
  describe("Playlist controls", () => {
    describe("TOGGLE_AUTOPLAY_NEXT", () => {
      it("toggles autoplayNext from true to false", () => {
        const state = {
          ...initialState,
          autoplayNext: true,
          playlist: makePlaylist(3),
        };
        const result = scenePlayerReducer(state, {
          type: "TOGGLE_AUTOPLAY_NEXT",
        });

        expect(result.autoplayNext).toBe(false);
        expect(result.playlist).toBe(state.playlist);
      });

      it("toggles autoplayNext from false to true", () => {
        const state = {
          ...initialState,
          autoplayNext: false,
          playlist: makePlaylist(3),
        };
        const result = scenePlayerReducer(state, {
          type: "TOGGLE_AUTOPLAY_NEXT",
        });

        expect(result.autoplayNext).toBe(true);
        expect(result.playlist).toBe(state.playlist);
      });

      it("sets playlist to null when playlist is null", () => {
        const state = { ...initialState, autoplayNext: true, playlist: null };
        const result = scenePlayerReducer(state, {
          type: "TOGGLE_AUTOPLAY_NEXT",
        });

        expect(result.autoplayNext).toBe(false);
        expect(result.playlist).toBeNull();
      });
    });

    describe("TOGGLE_SHUFFLE", () => {
      it("enables shuffle and resets shuffleHistory", () => {
        const state = {
          ...initialState,
          shuffle: false,
          shuffleHistory: [1, 2, 3],
          playlist: makePlaylist(5),
        };
        const result = scenePlayerReducer(state, { type: "TOGGLE_SHUFFLE" });

        expect(result.shuffle).toBe(true);
        expect(result.shuffleHistory).toEqual([]);
        expect(result.playlist).toBe(state.playlist);
      });

      it("disables shuffle and preserves shuffleHistory", () => {
        const state = {
          ...initialState,
          shuffle: true,
          shuffleHistory: [1, 2],
          playlist: makePlaylist(5),
        };
        const result = scenePlayerReducer(state, { type: "TOGGLE_SHUFFLE" });

        expect(result.shuffle).toBe(false);
        // When disabling, shuffleHistory is kept from state (not reset)
        expect(result.shuffleHistory).toEqual([1, 2]);
        expect(result.playlist).toBe(state.playlist);
      });

      it("handles null playlist gracefully", () => {
        const state = { ...initialState, shuffle: false, playlist: null };
        const result = scenePlayerReducer(state, { type: "TOGGLE_SHUFFLE" });

        expect(result.shuffle).toBe(true);
        expect(result.playlist).toBeNull();
      });
    });

    describe("TOGGLE_REPEAT", () => {
      it("cycles none -> all", () => {
        const state = {
          ...initialState,
          repeat: "none",
          playlist: makePlaylist(3),
        };
        const result = scenePlayerReducer(state, { type: "TOGGLE_REPEAT" });

        expect(result.repeat).toBe("all");
        expect(result.playlist).toBe(state.playlist);
      });

      it("cycles all -> one", () => {
        const state = {
          ...initialState,
          repeat: "all",
          playlist: makePlaylist(3),
        };
        const result = scenePlayerReducer(state, { type: "TOGGLE_REPEAT" });

        expect(result.repeat).toBe("one");
        expect(result.playlist).toBe(state.playlist);
      });

      it("cycles one -> none", () => {
        const state = {
          ...initialState,
          repeat: "one",
          playlist: makePlaylist(3),
        };
        const result = scenePlayerReducer(state, { type: "TOGGLE_REPEAT" });

        expect(result.repeat).toBe("none");
        expect(result.playlist).toBe(state.playlist);
      });

      it("full cycle: none -> all -> one -> none", () => {
        let state: ScenePlayerReducerState = {
          ...initialState,
          repeat: "none",
          playlist: makePlaylist(3),
        };

        state = scenePlayerReducer(state, { type: "TOGGLE_REPEAT" });
        expect(state.repeat).toBe("all");

        state = scenePlayerReducer(state, { type: "TOGGLE_REPEAT" });
        expect(state.repeat).toBe("one");

        state = scenePlayerReducer(state, { type: "TOGGLE_REPEAT" });
        expect(state.repeat).toBe("none");
      });

      it("handles null playlist gracefully", () => {
        const state = { ...initialState, repeat: "none", playlist: null };
        const result = scenePlayerReducer(state, { type: "TOGGLE_REPEAT" });

        expect(result.repeat).toBe("all");
        expect(result.playlist).toBeNull();
      });
    });

    describe("sequential mode", () => {
      it("advances to next scene", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(5),
          currentIndex: 1,
          quality: "720p",
          oCounter: 5,
          ready: true,
        };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

        expect(result.currentIndex).toBe(2);
        expect(result.quality).toBe("direct");
        expect(result.oCounter).toBe(0);
        expect(result.ready).toBe(false);
      });

      it("stays on last scene when repeat is 'none'", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(3),
          currentIndex: 2,
          repeat: "none",
        };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });
        expect(result).toBe(state);
      });

      it("wraps to index 0 when repeat is 'all' and at last scene", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(3),
          currentIndex: 2,
          repeat: "all",
        };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

        expect(result.currentIndex).toBe(0);
        expect(result.quality).toBe("direct");
        expect(result.oCounter).toBe(0);
      });

      it("does not modify shuffleHistory in sequential mode", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(3),
          currentIndex: 0,
          shuffle: false,
          shuffleHistory: [4, 5],
        };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

        expect(result.shuffleHistory).toEqual([4, 5]);
      });
    });

    describe("shuffle mode", () => {
      it("picks from unplayed scenes", () => {
        // 3 scenes, currently at 0, history has 1 -> only scene 2 is unplayed
        const state = {
          ...initialState,
          playlist: makePlaylist(3),
          currentIndex: 0,
          shuffle: true,
          shuffleHistory: [1],
        };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

        expect(result.currentIndex).toBe(2);
        expect(result.shuffleHistory).toEqual([1, 0]); // current added to history
      });

      it("adds current index to shuffleHistory", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(5),
          currentIndex: 2,
          shuffle: true,
          shuffleHistory: [0],
        };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

        // shuffleHistory should end with the previous currentIndex (2)
        expect(result.shuffleHistory[result.shuffleHistory.length - 1]).toBe(2);
      });

      it("leaves the queue itself unchanged", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(5),
          currentIndex: 0,
          shuffle: true,
          shuffleHistory: [],
        };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

        expect(result.playlist).toBe(state.playlist);
        expect(result.shuffleHistory).toEqual([0]);
      });

      it("stays when no unplayed scenes remain and repeat is not 'all'", () => {
        // 3 scenes, at index 0, history=[1,2] -> no unplayed (excluding current)
        const state = {
          ...initialState,
          playlist: makePlaylist(3),
          currentIndex: 0,
          shuffle: true,
          repeat: "none",
          shuffleHistory: [1, 2],
        };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });
        expect(result).toBe(state);
      });

      it("resets history and picks new scene when all played and repeat is 'all'", () => {
        // 3 scenes, at index 0, history=[1,2] -> all played
        const state = {
          ...initialState,
          playlist: makePlaylist(3),
          currentIndex: 0,
          shuffle: true,
          repeat: "all",
          shuffleHistory: [1, 2],
        };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

        // Should reset history to [currentIndex] (the previous scene)
        expect(result.shuffleHistory).toEqual([0]);
        // New index should not be current
        expect(result.currentIndex).not.toBe(0);
        // State resets
        expect(result.ready).toBe(false);
      });

      it("excludes current index from unplayed candidates", () => {
        // Run this multiple times to ensure current index is never picked as "unplayed"
        const state = {
          ...initialState,
          playlist: makePlaylist(2),
          currentIndex: 0,
          shuffle: true,
          shuffleHistory: [],
        };
        // Only scene 1 is available (scene 0 is current)
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });
        expect(result.currentIndex).toBe(1);
      });

      it("selects from all non-current scenes when all unplayed (large playlist)", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(10),
          currentIndex: 5,
          shuffle: true,
          shuffleHistory: [],
        };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

        // Should pick something other than 5
        expect(result.currentIndex).not.toBe(5);
        expect(result.currentIndex).toBeGreaterThanOrEqual(0);
        expect(result.currentIndex).toBeLessThan(10);
      });
    });
  });

  // -------------------------------------------------------------------------
  // PREV_SCENE
  // -------------------------------------------------------------------------
  describe("PREV_SCENE", () => {
    describe("without playlist", () => {
      it("returns state unchanged when playlist is null", () => {
        const state = { ...initialState, playlist: null };
        const result = scenePlayerReducer(state, { type: "PREV_SCENE" });
        expect(result).toBe(state);
      });

      it("returns state unchanged when playlist.scenes is missing", () => {
        const state = { ...initialState, playlist: {} };
        const result = scenePlayerReducer(state, { type: "PREV_SCENE" });
        expect(result).toBe(state);
      });
    });

    describe("sequential mode", () => {
      it("goes to previous scene", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(5),
          currentIndex: 3,
          quality: "720p",
          oCounter: 5,
          ready: true,
        };
        const result = scenePlayerReducer(state, { type: "PREV_SCENE" });

        expect(result.currentIndex).toBe(2);
        expect(result.quality).toBe("direct");
        expect(result.oCounter).toBe(0);
        expect(result.ready).toBe(false);
      });

      it("stays on first scene when repeat is 'none'", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(3),
          currentIndex: 0,
          repeat: "none",
        };
        const result = scenePlayerReducer(state, { type: "PREV_SCENE" });
        expect(result).toBe(state);
      });

      it("wraps to last scene when repeat is 'all' and at first scene", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(5),
          currentIndex: 0,
          repeat: "all",
        };
        const result = scenePlayerReducer(state, { type: "PREV_SCENE" });

        expect(result.currentIndex).toBe(4);
        expect(result.quality).toBe("direct");
        expect(result.oCounter).toBe(0);
      });
    });

    describe("shuffle mode", () => {
      it("pops last entry from shuffleHistory", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(5),
          currentIndex: 3,
          shuffle: true,
          shuffleHistory: [0, 2, 1],
        };
        const result = scenePlayerReducer(state, { type: "PREV_SCENE" });

        // Should go to last history entry (1)
        expect(result.currentIndex).toBe(1);
        // History should have last item removed
        expect(result.shuffleHistory).toEqual([0, 2]);
        expect(result.playlist).toBe(state.playlist);
        // State resets
        expect(result.quality).toBe("direct");
        expect(result.oCounter).toBe(0);
        expect(result.ready).toBe(false);
      });

      it("picks random scene when history is empty and multiple scenes exist", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(5),
          currentIndex: 2,
          shuffle: true,
          shuffleHistory: [],
        };
        const result = scenePlayerReducer(state, { type: "PREV_SCENE" });

        // Should pick a random scene that is not the current one
        expect(result.currentIndex).not.toBe(2);
        expect(result.currentIndex).toBeGreaterThanOrEqual(0);
        expect(result.currentIndex).toBeLessThan(5);
      });

      it("picks random scene when history is empty and repeat is 'all'", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(3),
          currentIndex: 1,
          shuffle: true,
          repeat: "all",
          shuffleHistory: [],
        };
        const result = scenePlayerReducer(state, { type: "PREV_SCENE" });

        expect(result.currentIndex).not.toBe(1);
      });

      it("stays when history is empty, single scene, and repeat is not 'all'", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(1),
          currentIndex: 0,
          shuffle: true,
          repeat: "none",
          shuffleHistory: [],
        };
        const result = scenePlayerReducer(state, { type: "PREV_SCENE" });
        // Only 1 scene and totalScenes > 1 is false, repeat is not "all"
        expect(result).toBe(state);
      });

      it("correctly pops single-entry history", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(3),
          currentIndex: 2,
          shuffle: true,
          shuffleHistory: [0],
        };
        const result = scenePlayerReducer(state, { type: "PREV_SCENE" });

        expect(result.currentIndex).toBe(0);
        expect(result.shuffleHistory).toEqual([]);
      });
    });
  });

  // -------------------------------------------------------------------------
  // GOTO_SCENE_INDEX
  // -------------------------------------------------------------------------
  describe("GOTO_SCENE_INDEX", () => {
    it("sets currentIndex to the given index", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(5),
        currentIndex: 0,
        quality: "720p",
        oCounter: 3,
        ready: true,
      };
      const result = scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: { index: 3 },
      });

      expect(result.currentIndex).toBe(3);
      expect(result.quality).toBe("direct");
      expect(result.oCounter).toBe(0);
      expect(result.ready).toBe(false);
      expect(result.shouldAutoplay).toBe(false);
    });

    it("supports payload as a plain number (legacy format)", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(5),
        currentIndex: 0,
      };
      const result = scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: 2,
      });

      expect(result.currentIndex).toBe(2);
    });

    it("sets shouldAutoplay when payload.shouldAutoplay is true", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(5),
        currentIndex: 0,
      };
      const result = scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: { index: 1, shouldAutoplay: true },
      });

      expect(result.currentIndex).toBe(1);
      expect(result.shouldAutoplay).toBe(true);
    });

    it("returns state unchanged for negative index", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(5),
        currentIndex: 2,
      };
      const result = scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: { index: -1 },
      });
      expect(result).toBe(state);
    });

    it("returns state unchanged for index >= scenes.length", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(5),
        currentIndex: 2,
      };
      const result = scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: { index: 5 },
      });
      expect(result).toBe(state);
    });

    it("returns state unchanged for index equal to scenes.length", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(3),
        currentIndex: 0,
      };
      const result = scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: { index: 3 },
      });
      expect(result).toBe(state);
    });

    it("returns state unchanged when playlist is null", () => {
      const state = { ...initialState, playlist: null };
      const result = scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: { index: 0 },
      });
      expect(result).toBe(state);
    });

    it("accepts index 0 as a valid target", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(3),
        currentIndex: 2,
      };
      const result = scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: { index: 0 },
      });
      expect(result.currentIndex).toBe(0);
    });

    it("accepts last valid index", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(5),
        currentIndex: 0,
      };
      const result = scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: { index: 4 },
      });
      expect(result.currentIndex).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // INITIALIZE
  // -------------------------------------------------------------------------
  describe("INITIALIZE", () => {
    it("sets playlist, currentIndex, quality, shouldAutoplay", () => {
      const playlist = makePlaylist(3, { shuffle: true, repeat: "one" });

      const result = scenePlayerReducer(initialState, {
        type: "INITIALIZE",
        payload: {
          playlist,
          currentIndex: 1,
          initialQuality: "720p",
          initialShouldAutoplay: true,
        },
      });

      expect(result.playlist).toBe(playlist);
      expect(result.currentIndex).toBe(1);
      expect(result.quality).toBe("720p");
      expect(result.shouldAutoplay).toBe(true);
    });

    it("INITIALIZE takes the controls a reload hands back over the queue's own", () => {
      const playlist = {
        ...rowQueue({ shuffle: false, repeat: "none" }),
        controls: {
          autoplayNext: false,
          shuffle: true,
          repeat: "all" as const,
          shuffleHistory: [0, 2],
        },
      };

      const result = scenePlayerReducer(initialState, {
        type: "INITIALIZE",
        payload: { playlist, currentIndex: 1 },
      });

      expect(result.autoplayNext).toBe(false);
      expect(result.shuffle).toBe(true);
      expect(result.repeat).toBe("all");
      expect(result.shuffleHistory).toEqual([0, 2]);
    });

    it("INITIALIZE takes autoplayNext true when the queue names none", () => {
      const state = { ...initialState, autoplayNext: false };

      const result = scenePlayerReducer(state, {
        type: "INITIALIZE",
        payload: { playlist: rowQueue({}) },
      });

      expect(result.autoplayNext).toBe(true);
    });

    it("INITIALIZE takes the queue's shuffle and repeat", () => {
      const result = scenePlayerReducer(initialState, {
        type: "INITIALIZE",
        payload: { playlist: rowQueue({ shuffle: true, repeat: "all" }) },
      });

      expect(result.shuffle).toBe(true);
      expect(result.repeat).toBe("all");
      expect(result.shuffleHistory).toEqual([]);
    });

    it("uses defaults when playlist is null", () => {
      const result = scenePlayerReducer(initialState, {
        type: "INITIALIZE",
        payload: { playlist: null },
      });

      expect(result.playlist).toBeNull();
      expect(result.currentIndex).toBe(0);
      expect(result.quality).toBe("direct");
      expect(result.autoplayNext).toBe(true);
      expect(result.shuffle).toBe(false);
      expect(result.repeat).toBe("none");
      expect(result.shuffleHistory).toEqual([]);
    });

    it("uses defaults when playlist has no control properties", () => {
      const playlist = { scenes: [{ id: "1" }] };
      const result = scenePlayerReducer(initialState, {
        type: "INITIALIZE",
        payload: { playlist },
      });

      expect(result.autoplayNext).toBe(true);
      expect(result.shuffle).toBe(false);
      expect(result.repeat).toBe("none");
      expect(result.shuffleHistory).toEqual([]);
    });

    it("defaults currentIndex to 0 when not provided", () => {
      const result = scenePlayerReducer(initialState, {
        type: "INITIALIZE",
        payload: { playlist: makePlaylist(3) },
      });

      expect(result.currentIndex).toBe(0);
    });

    it("defaults quality to 'direct' when initialQuality is not provided", () => {
      const result = scenePlayerReducer(initialState, {
        type: "INITIALIZE",
        payload: { playlist: makePlaylist(3) },
      });

      expect(result.quality).toBe("direct");
    });

    it("preserves existing shouldAutoplay if already set and no initialShouldAutoplay", () => {
      const state = { ...initialState, shouldAutoplay: true };
      const result = scenePlayerReducer(state, {
        type: "INITIALIZE",
        payload: { playlist: makePlaylist(3) },
      });

      // state.shouldAutoplay is true, no initialShouldAutoplay -> preserves true
      expect(result.shouldAutoplay).toBe(true);
    });

    it("defaults shouldAutoplay to false when nothing is set", () => {
      const result = scenePlayerReducer(initialState, {
        type: "INITIALIZE",
        payload: { playlist: makePlaylist(3) },
      });

      expect(result.shouldAutoplay).toBe(false);
    });

    it("preserves other state fields not set by INITIALIZE", () => {
      const state = {
        ...initialState,
        scene: {
          id: "existing",
        } as unknown as ScenePlayerReducerState["scene"],
        oCounter: 5,
        ready: true,
      };
      const result = scenePlayerReducer(state, {
        type: "INITIALIZE",
        payload: { playlist: makePlaylist(3) },
      });

      expect(result.scene).toEqual({ id: "existing" });
      expect(result.oCounter).toBe(5);
      expect(result.ready).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Default case
  // -------------------------------------------------------------------------
  describe("Default case", () => {
    it("returns state unchanged for an unknown action type", () => {
      const state = { ...initialState, quality: "720p" };
      const result = scenePlayerReducer(state, { type: "UNKNOWN_ACTION" });
      expect(result).toBe(state);
    });

    it("returns state unchanged for an action with no type", () => {
      const state = { ...initialState };
      const result = scenePlayerReducer(state, untrusted({}));
      expect(result).toBe(state);
    });
  });

  // -------------------------------------------------------------------------
  // Reducer purity (input state is not mutated)
  // -------------------------------------------------------------------------
  describe("Reducer purity", () => {
    it("does not mutate state on LOAD_SCENE_START", () => {
      const state = { ...initialState };
      const frozen = snapshot(state);
      scenePlayerReducer(state, { type: "LOAD_SCENE_START" });
      expect(snapshot(state)).toEqual(frozen);
    });

    it("does not mutate state on LOAD_SCENE_SUCCESS", () => {
      const state = { ...initialState, quality: "direct" };
      const frozen = snapshot(state);
      scenePlayerReducer(state, {
        type: "LOAD_SCENE_SUCCESS",
        payload: {
          scene: { id: "1", isStreamable: false, files: [{ height: 720 }] },
          oCounter: 3,
        },
      });
      expect(snapshot(state)).toEqual(frozen);
    });

    it("does not mutate state on TOGGLE_AUTOPLAY_NEXT", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(3),
      };
      const frozen = snapshot(state);
      scenePlayerReducer(state, { type: "TOGGLE_AUTOPLAY_NEXT" });
      expect(snapshot(state)).toEqual(frozen);
    });

    it("does not mutate state on TOGGLE_SHUFFLE", () => {
      const state = {
        ...initialState,
        shuffle: false,
        shuffleHistory: [1, 2],
        playlist: makePlaylist(3),
      };
      const frozen = snapshot(state);
      scenePlayerReducer(state, { type: "TOGGLE_SHUFFLE" });
      expect(snapshot(state)).toEqual(frozen);
    });

    it("does not mutate state on TOGGLE_REPEAT", () => {
      const state = {
        ...initialState,
        repeat: "none",
        playlist: makePlaylist(3),
      };
      const frozen = snapshot(state);
      scenePlayerReducer(state, { type: "TOGGLE_REPEAT" });
      expect(snapshot(state)).toEqual(frozen);
    });

    it("does not mutate state on NEXT_SCENE (sequential)", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(5),
        currentIndex: 1,
        shuffle: false,
      };
      const frozen = snapshot(state);
      scenePlayerReducer(state, { type: "NEXT_SCENE" });
      expect(snapshot(state)).toEqual(frozen);
    });

    it("does not mutate state on NEXT_SCENE (shuffle)", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(5),
        currentIndex: 1,
        shuffle: true,
        shuffleHistory: [0],
      };
      const frozen = snapshot(state);
      scenePlayerReducer(state, { type: "NEXT_SCENE" });
      expect(snapshot(state)).toEqual(frozen);
    });

    it("does not mutate state on PREV_SCENE (shuffle with history)", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(5),
        currentIndex: 3,
        shuffle: true,
        shuffleHistory: [0, 1, 2],
      };
      const frozen = snapshot(state);
      scenePlayerReducer(state, { type: "PREV_SCENE" });
      expect(snapshot(state)).toEqual(frozen);
    });

    it("does not mutate state on GOTO_SCENE_INDEX", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(5),
        currentIndex: 0,
      };
      const frozen = snapshot(state);
      scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: { index: 3 },
      });
      expect(snapshot(state)).toEqual(frozen);
    });

    it("does not mutate state on INITIALIZE", () => {
      const state = { ...initialState };
      const frozen = snapshot(state);
      scenePlayerReducer(state, {
        type: "INITIALIZE",
        payload: {
          playlist: makePlaylist(3),
          currentIndex: 1,
          compatibility: { hevc: false },
          initialQuality: "1080p",
        },
      });
      expect(snapshot(state)).toEqual(frozen);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe("Edge cases", () => {
    it("NEXT_SCENE with single-scene playlist in sequential mode stays", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(1),
        currentIndex: 0,
        repeat: "none",
      };
      const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });
      expect(result).toBe(state);
    });

    it("NEXT_SCENE with single-scene playlist and repeat='all' wraps to 0", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(1),
        currentIndex: 0,
        repeat: "all",
      };
      const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });
      expect(result.currentIndex).toBe(0);
    });

    it("PREV_SCENE with single-scene playlist in sequential mode stays", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(1),
        currentIndex: 0,
        repeat: "none",
      };
      const result = scenePlayerReducer(state, { type: "PREV_SCENE" });
      expect(result).toBe(state);
    });

    it("PREV_SCENE with single-scene playlist and repeat='all' wraps to 0", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(1),
        currentIndex: 0,
        repeat: "all",
      };
      const result = scenePlayerReducer(state, { type: "PREV_SCENE" });
      expect(result.currentIndex).toBe(0);
    });

    it("NEXT_SCENE shuffle with 2 scenes always picks the other one", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(2),
        currentIndex: 0,
        shuffle: true,
        shuffleHistory: [],
      };

      // Run 10 times to increase confidence
      for (let i = 0; i < 10; i++) {
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });
        expect(result.currentIndex).toBe(1);
      }
    });

    it("NEXT_SCENE shuffle with repeat='all' on 2-scene playlist resets and picks other", () => {
      // All played: history has [1], current is 0 -> no unplayed
      const state = {
        ...initialState,
        playlist: makePlaylist(2),
        currentIndex: 0,
        shuffle: true,
        repeat: "all",
        shuffleHistory: [1],
      };
      const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

      // Should reset history and pick non-current scene
      expect(result.currentIndex).toBe(1);
      expect(result.shuffleHistory).toEqual([0]);
    });

    it("LOAD_SCENE_SUCCESS with isStreamable=false and height exactly at preset boundary", () => {
      // Height exactly at 2160 should match 2160p
      const scene = {
        id: "1",
        isStreamable: false,
        files: [{ height: 2160 }],
      };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );
      expect(result.quality).toBe("2160p");
    });

    it("LOAD_SCENE_SUCCESS with isStreamable=false and height 0 falls back to default 1080", () => {
      const scene = { id: "1", isStreamable: false, files: [{ height: 0 }] };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } }
      );
      // height 0 is falsy, so `|| 1080` kicks in -> sourceHeight=1080 -> "1080p"
      expect(result.quality).toBe("1080p");
    });

    it("multiple rapid scene loads maintain correct state", () => {
      let state: ScenePlayerReducerState = { ...initialState };

      // Start loading scene 1
      state = scenePlayerReducer(state, { type: "LOAD_SCENE_START" });
      expect(state.sceneLoading).toBe(true);

      // Scene 1 succeeds
      state = scenePlayerReducer(state, {
        type: "LOAD_SCENE_SUCCESS",
        payload: {
          scene: { id: "1", isStreamable: true },
          oCounter: 2,
        },
      });
      expect(must(state.scene).id).toBe("1");
      expect(state.oCounter).toBe(2);
      expect(state.sceneLoading).toBe(false);

      // Start loading scene 2
      state = scenePlayerReducer(state, { type: "LOAD_SCENE_START" });
      expect(state.sceneLoading).toBe(true);
      // Old scene is still there during loading
      expect(must(state.scene).id).toBe("1");

      // Scene 2 succeeds
      state = scenePlayerReducer(state, {
        type: "LOAD_SCENE_SUCCESS",
        payload: {
          scene: { id: "2", isStreamable: false, files: [{ height: 480 }] },
          oCounter: 0,
        },
      });
      expect(must(state.scene).id).toBe("2");
      expect(state.oCounter).toBe(0);
      // Quality was reset to "direct" by default, so auto-selection kicks in
      expect(state.quality).toBe("480p");
    });

    it("GOTO_SCENE_INDEX with payload.index of 0 when currentIndex is also 0", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(3),
        currentIndex: 0,
        oCounter: 2,
        ready: true,
      };
      const result = scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: { index: 0 },
      });

      // Should still reset the step's state even though index didn't change
      expect(result.currentIndex).toBe(0);
      expect(result.oCounter).toBe(0);
      expect(result.ready).toBe(false);
    });
  });
  // -------------------------------------------------------------------------
  // LEAVE_QUEUE and a step to the same scene
  // -------------------------------------------------------------------------
  describe("LEAVE_QUEUE", () => {
    it("drops the queue and its controls, and takes the navigation's autoplay", () => {
      const state: ScenePlayerReducerState = {
        ...initialState,
        playlist: makePlaylist(3),
        currentIndex: 2,
        autoplayNext: false,
        shuffle: true,
        repeat: "all",
        shuffleHistory: [0, 1],
      };

      const result = scenePlayerReducer(state, {
        type: "LEAVE_QUEUE",
        payload: { shouldAutoplay: true },
      });

      expect(result.playlist).toBeNull();
      expect(result.currentIndex).toBe(0);
      expect(result.autoplayNext).toBe(true);
      expect(result.shuffle).toBe(false);
      expect(result.repeat).toBe("none");
      expect(result.shuffleHistory).toEqual([]);
      expect(result.shouldAutoplay).toBe(true);
    });
  });

  describe("a step to an entry of the same scene", () => {
    const sameScene = {
      scenes: [
        { sceneId: "7", instanceId: "a" },
        { sceneId: "7", instanceId: "a" },
        { sceneId: "7", instanceId: "b" },
      ],
    };

    it("keeps the loaded scene ready and asks the player to restart it", () => {
      const state: ScenePlayerReducerState = {
        ...initialState,
        playlist: sameScene,
        ready: true,
        quality: "720p",
        oCounter: 3,
      };

      const result = scenePlayerReducer(state, {
        type: "NEXT_SCENE",
        payload: { autoplay: true },
      });

      expect(result.currentIndex).toBe(1);
      expect(result.ready).toBe(true);
      expect(result.quality).toBe("720p");
      expect(result.oCounter).toBe(3);
      expect(result.shouldAutoplay).toBe(true);
      expect(result.restartCount).toBe(1);
    });

    it("a one-scene queue on repeat all restarts at its end", () => {
      const state: ScenePlayerReducerState = {
        ...initialState,
        playlist: { scenes: [{ sceneId: "7", instanceId: "a" }] },
        repeat: "all",
        ready: true,
      };

      const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

      expect(result.currentIndex).toBe(0);
      expect(result.ready).toBe(true);
      expect(result.restartCount).toBe(1);
    });

    it("the same id on another server is another scene: it waits for its load", () => {
      const state: ScenePlayerReducerState = {
        ...initialState,
        playlist: sameScene,
        currentIndex: 1,
        ready: true,
      };

      const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

      expect(result.currentIndex).toBe(2);
      expect(result.ready).toBe(false);
      expect(result.restartCount).toBe(0);
    });
  });
});
