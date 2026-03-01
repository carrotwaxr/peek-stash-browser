import { describe, it, expect } from "vitest";
import {
  scenePlayerReducer,
  initialState,
} from "@/contexts/scenePlayerReducer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal playlist with N scenes for navigation tests. */
function makePlaylist(count, overrides = {}) {
  return {
    scenes: Array.from({ length: count }, (_, i) => ({ id: `scene-${i}` })),
    autoplayNext: true,
    shuffle: false,
    repeat: "none",
    shuffleHistory: [],
    ...overrides,
  };
}

/** Deep-clone a plain object so we can later assert the original was not mutated. */
function snapshot(obj) {
  return JSON.parse(JSON.stringify(obj));
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

        video: null,
        videoLoading: false,
        videoError: null,
        sessionId: null,
        quality: "direct",

        isInitializing: false,
        isAutoFallback: false,
        isSwitchingMode: false,
        ready: false,
        shouldAutoplay: false,

        playlist: null,
        currentIndex: 0,

        autoplayNext: true,
        shuffle: false,
        repeat: "none",
        shuffleHistory: [],

        compatibility: null,

        oCounter: 0,
        oCounterLoading: false,
      });
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
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
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
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
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
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
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
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
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
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
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
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
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
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
      );

      expect(result.quality).toBe("360p");
    });

    it("defaults to 1080p source height when files array is missing", () => {
      const scene = { id: "1", isStreamable: false };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
      );

      expect(result.quality).toBe("1080p");
    });

    it("defaults to 1080p source height when files array is empty", () => {
      const scene = { id: "1", isStreamable: false, files: [] };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
      );

      expect(result.quality).toBe("1080p");
    });

    it("does NOT auto-select when isStreamable is undefined", () => {
      const scene = { id: "1", files: [{ height: 720 }] };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
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
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
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
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
      );

      // 1440 is less than 2160 but >= 1080, so 1080p is the best <= sourceHeight
      expect(result.quality).toBe("1080p");
    });
  });

  // -------------------------------------------------------------------------
  // Video loading lifecycle
  // -------------------------------------------------------------------------
  describe("Video loading lifecycle", () => {
    it("LOAD_VIDEO_START sets videoLoading true and clears error", () => {
      const state = { ...initialState, videoError: "old error" };
      const result = scenePlayerReducer(state, { type: "LOAD_VIDEO_START" });

      expect(result.videoLoading).toBe(true);
      expect(result.videoError).toBeNull();
    });

    it("LOAD_VIDEO_SUCCESS sets video, sessionId, clears loading/error/isInitializing", () => {
      const state = {
        ...initialState,
        videoLoading: true,
        videoError: "stale",
        isInitializing: true,
      };
      const result = scenePlayerReducer(state, {
        type: "LOAD_VIDEO_SUCCESS",
        payload: { video: { url: "test.m3u8" }, sessionId: "sess-123" },
      });

      expect(result.video).toEqual({ url: "test.m3u8" });
      expect(result.sessionId).toBe("sess-123");
      expect(result.videoLoading).toBe(false);
      expect(result.videoError).toBeNull();
      expect(result.isInitializing).toBe(false);
    });

    it("LOAD_VIDEO_ERROR sets error, clears loading and isInitializing", () => {
      const state = {
        ...initialState,
        videoLoading: true,
        isInitializing: true,
      };
      const result = scenePlayerReducer(state, {
        type: "LOAD_VIDEO_ERROR",
        payload: "Failed to load",
      });

      expect(result.videoLoading).toBe(false);
      expect(result.videoError).toBe("Failed to load");
      expect(result.isInitializing).toBe(false);
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

    it("SET_VIDEO updates video", () => {
      const video = { url: "test.m3u8" };
      const result = scenePlayerReducer(initialState, {
        type: "SET_VIDEO",
        payload: video,
      });
      expect(result.video).toBe(video);
    });

    it("SET_SESSION_ID updates sessionId", () => {
      const result = scenePlayerReducer(initialState, {
        type: "SET_SESSION_ID",
        payload: "sess-abc",
      });
      expect(result.sessionId).toBe("sess-abc");
    });

    it("CLEAR_VIDEO nulls video and sessionId, clears loading/error", () => {
      const state = {
        ...initialState,
        video: { url: "test" },
        sessionId: "sess-1",
        videoLoading: true,
        videoError: "err",
      };
      const result = scenePlayerReducer(state, { type: "CLEAR_VIDEO" });

      expect(result.video).toBeNull();
      expect(result.sessionId).toBeNull();
      expect(result.videoLoading).toBe(false);
      expect(result.videoError).toBeNull();
    });

    it("SET_CURRENT_INDEX updates currentIndex", () => {
      const result = scenePlayerReducer(initialState, {
        type: "SET_CURRENT_INDEX",
        payload: 5,
      });
      expect(result.currentIndex).toBe(5);
    });

    it("SET_INITIALIZING updates isInitializing", () => {
      const result = scenePlayerReducer(initialState, {
        type: "SET_INITIALIZING",
        payload: true,
      });
      expect(result.isInitializing).toBe(true);
    });

    it("SET_AUTO_FALLBACK updates isAutoFallback", () => {
      const result = scenePlayerReducer(initialState, {
        type: "SET_AUTO_FALLBACK",
        payload: true,
      });
      expect(result.isAutoFallback).toBe(true);
    });

    it("SET_SWITCHING_MODE updates isSwitchingMode", () => {
      const result = scenePlayerReducer(initialState, {
        type: "SET_SWITCHING_MODE",
        payload: true,
      });
      expect(result.isSwitchingMode).toBe(true);
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
  // O Counter lifecycle
  // -------------------------------------------------------------------------
  describe("O Counter lifecycle", () => {
    it("INCREMENT_O_COUNTER_START sets oCounterLoading true", () => {
      const result = scenePlayerReducer(initialState, {
        type: "INCREMENT_O_COUNTER_START",
      });
      expect(result.oCounterLoading).toBe(true);
    });

    it("INCREMENT_O_COUNTER_SUCCESS increments oCounter by 1 and clears loading", () => {
      const state = { ...initialState, oCounter: 3, oCounterLoading: true };
      const result = scenePlayerReducer(state, {
        type: "INCREMENT_O_COUNTER_SUCCESS",
      });

      expect(result.oCounter).toBe(4);
      expect(result.oCounterLoading).toBe(false);
    });

    it("INCREMENT_O_COUNTER_ERROR clears loading without changing counter", () => {
      const state = { ...initialState, oCounter: 3, oCounterLoading: true };
      const result = scenePlayerReducer(state, {
        type: "INCREMENT_O_COUNTER_ERROR",
      });

      expect(result.oCounter).toBe(3);
      expect(result.oCounterLoading).toBe(false);
    });

    it("full cycle: START -> SUCCESS increments correctly", () => {
      let state = { ...initialState, oCounter: 0 };

      state = scenePlayerReducer(state, { type: "INCREMENT_O_COUNTER_START" });
      expect(state.oCounterLoading).toBe(true);

      state = scenePlayerReducer(state, {
        type: "INCREMENT_O_COUNTER_SUCCESS",
      });
      expect(state.oCounter).toBe(1);
      expect(state.oCounterLoading).toBe(false);

      state = scenePlayerReducer(state, { type: "INCREMENT_O_COUNTER_START" });
      state = scenePlayerReducer(state, {
        type: "INCREMENT_O_COUNTER_SUCCESS",
      });
      expect(state.oCounter).toBe(2);
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
        expect(result.playlist.autoplayNext).toBe(false);
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
        expect(result.playlist.autoplayNext).toBe(true);
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
        expect(result.playlist.shuffle).toBe(true);
        expect(result.playlist.shuffleHistory).toEqual([]);
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
        expect(result.playlist.shuffle).toBe(false);
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
        expect(result.playlist.repeat).toBe("all");
      });

      it("cycles all -> one", () => {
        const state = {
          ...initialState,
          repeat: "all",
          playlist: makePlaylist(3),
        };
        const result = scenePlayerReducer(state, { type: "TOGGLE_REPEAT" });

        expect(result.repeat).toBe("one");
        expect(result.playlist.repeat).toBe("one");
      });

      it("cycles one -> none", () => {
        const state = {
          ...initialState,
          repeat: "one",
          playlist: makePlaylist(3),
        };
        const result = scenePlayerReducer(state, { type: "TOGGLE_REPEAT" });

        expect(result.repeat).toBe("none");
        expect(result.playlist.repeat).toBe("none");
      });

      it("full cycle: none -> all -> one -> none", () => {
        let state = {
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

    describe("SET_SHUFFLE_HISTORY", () => {
      it("sets shuffleHistory and updates playlist", () => {
        const state = {
          ...initialState,
          shuffleHistory: [],
          playlist: makePlaylist(5),
        };
        const result = scenePlayerReducer(state, {
          type: "SET_SHUFFLE_HISTORY",
          payload: [0, 2, 4],
        });

        expect(result.shuffleHistory).toEqual([0, 2, 4]);
        expect(result.playlist.shuffleHistory).toEqual([0, 2, 4]);
      });

      it("handles null playlist", () => {
        const state = { ...initialState, playlist: null };
        const result = scenePlayerReducer(state, {
          type: "SET_SHUFFLE_HISTORY",
          payload: [1, 3],
        });

        expect(result.shuffleHistory).toEqual([1, 3]);
        expect(result.playlist).toBeNull();
      });
    });
  });

  // -------------------------------------------------------------------------
  // NEXT_SCENE
  // -------------------------------------------------------------------------
  describe("NEXT_SCENE", () => {
    describe("without playlist", () => {
      it("returns state unchanged when playlist is null", () => {
        const state = { ...initialState, playlist: null };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });
        expect(result).toBe(state);
      });

      it("returns state unchanged when playlist.scenes is missing", () => {
        const state = { ...initialState, playlist: {} };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });
        expect(result).toBe(state);
      });
    });

    describe("sequential mode", () => {
      it("advances to next scene", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(5),
          currentIndex: 1,
          video: { url: "old" },
          sessionId: "old-sess",
          quality: "720p",
          oCounter: 5,
          ready: true,
        };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

        expect(result.currentIndex).toBe(2);
        expect(result.video).toBeNull();
        expect(result.sessionId).toBeNull();
        expect(result.quality).toBe("direct");
        expect(result.oCounter).toBe(0);
        expect(result.ready).toBe(false);
        expect(result.isInitializing).toBe(false);
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

      it("updates playlist.shuffleHistory as well", () => {
        const state = {
          ...initialState,
          playlist: makePlaylist(5),
          currentIndex: 0,
          shuffle: true,
          shuffleHistory: [],
        };
        const result = scenePlayerReducer(state, { type: "NEXT_SCENE" });

        expect(result.playlist.shuffleHistory).toEqual(result.shuffleHistory);
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
        expect(result.playlist.shuffleHistory).toEqual([0]);
        // New index should not be current
        expect(result.currentIndex).not.toBe(0);
        // State resets
        expect(result.video).toBeNull();
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
          video: { url: "old" },
          sessionId: "old-sess",
          quality: "720p",
          oCounter: 5,
          ready: true,
        };
        const result = scenePlayerReducer(state, { type: "PREV_SCENE" });

        expect(result.currentIndex).toBe(2);
        expect(result.video).toBeNull();
        expect(result.sessionId).toBeNull();
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
        expect(result.playlist.shuffleHistory).toEqual([0, 2]);
        // State resets
        expect(result.video).toBeNull();
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
        video: { url: "old" },
        sessionId: "old",
        quality: "720p",
        oCounter: 3,
        ready: true,
      };
      const result = scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: { index: 3 },
      });

      expect(result.currentIndex).toBe(3);
      expect(result.video).toBeNull();
      expect(result.sessionId).toBeNull();
      expect(result.quality).toBe("direct");
      expect(result.oCounter).toBe(0);
      expect(result.ready).toBe(false);
      expect(result.isInitializing).toBe(false);
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
    it("sets playlist, currentIndex, compatibility, quality, shouldAutoplay", () => {
      const playlist = makePlaylist(3, {
        autoplayNext: false,
        shuffle: true,
        repeat: "one",
        shuffleHistory: [0, 1],
      });
      const compatibility = { hevc: false, av1: true };

      const result = scenePlayerReducer(initialState, {
        type: "INITIALIZE",
        payload: {
          playlist,
          currentIndex: 1,
          compatibility,
          initialQuality: "720p",
          initialShouldAutoplay: true,
        },
      });

      expect(result.playlist).toBe(playlist);
      expect(result.currentIndex).toBe(1);
      expect(result.compatibility).toBe(compatibility);
      expect(result.quality).toBe("720p");
      expect(result.shouldAutoplay).toBe(true);
    });

    it("inherits playlist controls from playlist object", () => {
      const playlist = makePlaylist(3, {
        autoplayNext: false,
        shuffle: true,
        repeat: "all",
        shuffleHistory: [2],
      });

      const result = scenePlayerReducer(initialState, {
        type: "INITIALIZE",
        payload: { playlist },
      });

      expect(result.autoplayNext).toBe(false);
      expect(result.shuffle).toBe(true);
      expect(result.repeat).toBe("all");
      expect(result.shuffleHistory).toEqual([2]);
    });

    it("uses defaults when playlist is null", () => {
      const result = scenePlayerReducer(initialState, {
        type: "INITIALIZE",
        payload: { playlist: null },
      });

      expect(result.playlist).toBeNull();
      expect(result.currentIndex).toBe(0);
      expect(result.compatibility).toBeNull();
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
        scene: { id: "existing" },
        video: { url: "existing" },
        sessionId: "existing-sess",
        oCounter: 5,
      };
      const result = scenePlayerReducer(state, {
        type: "INITIALIZE",
        payload: { playlist: makePlaylist(3) },
      });

      expect(result.scene).toEqual({ id: "existing" });
      expect(result.video).toEqual({ url: "existing" });
      expect(result.sessionId).toBe("existing-sess");
      expect(result.oCounter).toBe(5);
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
      const result = scenePlayerReducer(state, {});
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

    it("does not mutate state on INCREMENT_O_COUNTER_SUCCESS", () => {
      const state = { ...initialState, oCounter: 5, oCounterLoading: true };
      const frozen = snapshot(state);
      scenePlayerReducer(state, { type: "INCREMENT_O_COUNTER_SUCCESS" });
      expect(snapshot(state)).toEqual(frozen);
    });

    it("does not mutate state on SET_SHUFFLE_HISTORY", () => {
      const state = {
        ...initialState,
        shuffleHistory: [0, 1],
        playlist: makePlaylist(5),
      };
      const frozen = snapshot(state);
      scenePlayerReducer(state, {
        type: "SET_SHUFFLE_HISTORY",
        payload: [0, 1, 2, 3],
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
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
      );
      expect(result.quality).toBe("2160p");
    });

    it("LOAD_SCENE_SUCCESS with isStreamable=false and height 0 falls back to default 1080", () => {
      const scene = { id: "1", isStreamable: false, files: [{ height: 0 }] };
      const result = scenePlayerReducer(
        { ...initialState, quality: "direct" },
        { type: "LOAD_SCENE_SUCCESS", payload: { scene } },
      );
      // height 0 is falsy, so `|| 1080` kicks in -> sourceHeight=1080 -> "1080p"
      expect(result.quality).toBe("1080p");
    });

    it("multiple rapid scene loads maintain correct state", () => {
      let state = { ...initialState };

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
      expect(state.scene.id).toBe("1");
      expect(state.oCounter).toBe(2);
      expect(state.sceneLoading).toBe(false);

      // Start loading scene 2
      state = scenePlayerReducer(state, { type: "LOAD_SCENE_START" });
      expect(state.sceneLoading).toBe(true);
      // Old scene is still there during loading
      expect(state.scene.id).toBe("1");

      // Scene 2 succeeds
      state = scenePlayerReducer(state, {
        type: "LOAD_SCENE_SUCCESS",
        payload: {
          scene: { id: "2", isStreamable: false, files: [{ height: 480 }] },
          oCounter: 0,
        },
      });
      expect(state.scene.id).toBe("2");
      expect(state.oCounter).toBe(0);
      // Quality was reset to "direct" by default, so auto-selection kicks in
      expect(state.quality).toBe("480p");
    });

    it("GOTO_SCENE_INDEX with payload.index of 0 when currentIndex is also 0", () => {
      const state = {
        ...initialState,
        playlist: makePlaylist(3),
        currentIndex: 0,
        video: { url: "something" },
        ready: true,
      };
      const result = scenePlayerReducer(state, {
        type: "GOTO_SCENE_INDEX",
        payload: { index: 0 },
      });

      // Should still reset video state even though index didn't change
      expect(result.currentIndex).toBe(0);
      expect(result.video).toBeNull();
      expect(result.ready).toBe(false);
    });
  });
});
