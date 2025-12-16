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
function getBestTranscodeQuality(sourceHeight) {
  for (const preset of QUALITY_PRESETS) {
    if (preset.height <= sourceHeight) {
      return preset.quality;
    }
  }
  return "360p";
}

// ============================================================================
// INITIAL STATE
// ============================================================================

export const initialState = {
  // Scene data (from Stash API)
  scene: null,
  sceneLoading: false,
  sceneError: null,

  // Video playback data (from Peek API)
  video: null,
  videoLoading: false,
  videoError: null,
  sessionId: null,
  quality: "direct",

  // Player internal state
  isInitializing: false,
  isAutoFallback: false,
  isSwitchingMode: false,
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

  // Compatibility (codec support)
  compatibility: null,

  // O Counter
  oCounter: 0,
  oCounterLoading: false,
};

// ============================================================================
// REDUCER
// ============================================================================

export function scenePlayerReducer(state, action) {
  switch (action.type) {
    // Scene loading
    case "LOAD_SCENE_START":
      return {
        ...state,
        sceneLoading: true,
        sceneError: null,
      };

    case "LOAD_SCENE_SUCCESS": {
      const scene = action.payload.scene;

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
        oCounter: action.payload.oCounter || 0,
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

    // Video loading
    case "LOAD_VIDEO_START":
      return {
        ...state,
        videoLoading: true,
        videoError: null,
      };

    case "LOAD_VIDEO_SUCCESS":
      return {
        ...state,
        video: action.payload.video,
        sessionId: action.payload.sessionId,
        videoLoading: false,
        videoError: null,
        isInitializing: false,
      };

    case "LOAD_VIDEO_ERROR":
      return {
        ...state,
        videoLoading: false,
        videoError: action.payload,
        isInitializing: false,
      };

    // Quality management
    case "SET_QUALITY":
      return {
        ...state,
        quality: action.payload,
      };

    case "SET_VIDEO":
      return {
        ...state,
        video: action.payload,
      };

    case "SET_SESSION_ID":
      return {
        ...state,
        sessionId: action.payload,
      };

    case "CLEAR_VIDEO":
      return {
        ...state,
        video: null,
        sessionId: null,
        videoLoading: false,
        videoError: null,
      };

    // Playlist navigation
    case "NEXT_SCENE": {
      if (!state.playlist || !state.playlist.scenes) {
        return state;
      }

      let nextIndex = null;
      const totalScenes = state.playlist.scenes.length;

      if (state.shuffle) {
        // Shuffle mode: pick random unplayed scene
        const unplayedScenes = [];

        for (let i = 0; i < totalScenes; i++) {
          if (
            i !== state.currentIndex &&
            !state.shuffleHistory.includes(i)
          ) {
            unplayedScenes.push(i);
          }
        }

        if (unplayedScenes.length > 0) {
          // Pick random from unplayed
          nextIndex =
            unplayedScenes[Math.floor(Math.random() * unplayedScenes.length)];
        } else if (state.repeat === "all") {
          // All scenes played, reset shuffle history and start over
          const candidates = Array.from({ length: totalScenes }, (_, i) =>
            i
          ).filter((i) => i !== state.currentIndex);
          nextIndex = candidates[Math.floor(Math.random() * candidates.length)];

          // Also return updated shuffle history
          return {
            ...state,
            currentIndex: nextIndex,
            shuffleHistory: [state.currentIndex], // Start new history
            playlist: {
              ...state.playlist,
              shuffleHistory: [state.currentIndex],
            },
            video: null,
            sessionId: null,
            isInitializing: false,
            ready: false,
          };
        }
        // else: no more scenes and repeat is not "all", stay on current
      } else {
        // Sequential mode
        if (state.currentIndex < totalScenes - 1) {
          nextIndex = state.currentIndex + 1;
        } else if (state.repeat === "all") {
          nextIndex = 0; // Loop back to start
        }
        // else: last scene and repeat is not "all", stay on current
      }

      if (nextIndex === null) {
        return state; // Can't advance
      }

      // Update shuffle history if in shuffle mode
      const newHistory = state.shuffle
        ? [...state.shuffleHistory, state.currentIndex]
        : state.shuffleHistory;

      return {
        ...state,
        currentIndex: nextIndex,
        shuffleHistory: newHistory,
        playlist: state.playlist
          ? { ...state.playlist, shuffleHistory: newHistory }
          : null,
        video: null,
        sessionId: null,
        isInitializing: false,
        ready: false,
        // Reset quality to "direct" for new scene - will be auto-selected based on codec
        quality: "direct",
        // Reset O counter immediately - will be set correctly when new scene loads
        oCounter: 0,
      };
    }

    case "PREV_SCENE": {
      if (!state.playlist || !state.playlist.scenes) {
        return state;
      }

      let prevIndex = null;
      const totalScenes = state.playlist.scenes.length;

      if (state.shuffle) {
        // In shuffle mode, go back to last played scene (from history)
        if (state.shuffleHistory.length > 0) {
          prevIndex = state.shuffleHistory[state.shuffleHistory.length - 1];

          // Remove last item from history
          const newHistory = state.shuffleHistory.slice(0, -1);

          return {
            ...state,
            currentIndex: prevIndex,
            shuffleHistory: newHistory,
            playlist: state.playlist
              ? { ...state.playlist, shuffleHistory: newHistory }
              : null,
            video: null,
            sessionId: null,
            isInitializing: false,
            ready: false,
            // Reset quality to "direct" for new scene - will be auto-selected based on codec
            quality: "direct",
            // Reset O counter immediately - will be set correctly when new scene loads
            oCounter: 0,
          };
        } else {
          // No history - pick a random scene (excluding current)
          if (state.repeat === "all" || totalScenes > 1) {
            const candidates = Array.from({ length: totalScenes }, (_, i) => i)
              .filter((i) => i !== state.currentIndex);
            prevIndex = candidates[Math.floor(Math.random() * candidates.length)];
          }
          // else: only 1 scene in playlist, can't go anywhere
        }
      } else {
        // Sequential mode
        if (state.currentIndex > 0) {
          prevIndex = state.currentIndex - 1;
        } else if (state.repeat === "all") {
          prevIndex = totalScenes - 1; // Loop to end
        }
        // else: first scene and repeat is not "all", stay on current
      }

      if (prevIndex === null) {
        return state; // Can't go back
      }

      return {
        ...state,
        currentIndex: prevIndex,
        video: null,
        sessionId: null,
        isInitializing: false,
        ready: false,
        // Reset quality to "direct" for new scene - will be auto-selected based on codec
        quality: "direct",
        // Reset O counter immediately - will be set correctly when new scene loads
        oCounter: 0,
      };
    }

    case "GOTO_SCENE_INDEX": {
      const index = action.payload?.index ?? action.payload;
      const shouldAutoplay = action.payload?.shouldAutoplay ?? false;

      if (
        !state.playlist ||
        index < 0 ||
        index >= state.playlist.scenes.length
      ) {
        return state;
      }

      return {
        ...state,
        currentIndex: index,
        // Clear video data - will be fetched for new scene
        video: null,
        sessionId: null,
        isInitializing: false,
        ready: false, // Reset ready state for new scene
        // Set shouldAutoplay based on payload
        shouldAutoplay: shouldAutoplay,
        // Reset quality to "direct" for new scene - will be auto-selected based on codec
        quality: "direct",
        // Reset O counter immediately - will be set correctly when new scene loads
        oCounter: 0,
      };
    }

    case "SET_CURRENT_INDEX": {
      return {
        ...state,
        currentIndex: action.payload,
      };
    }

    // Player state
    case "SET_INITIALIZING":
      return {
        ...state,
        isInitializing: action.payload,
      };

    case "SET_AUTO_FALLBACK":
      return {
        ...state,
        isAutoFallback: action.payload,
      };

    case "SET_SWITCHING_MODE":
      return {
        ...state,
        isSwitchingMode: action.payload,
      };

    case "SET_READY":
      return {
        ...state,
        ready: action.payload,
      };

    case "SET_SHOULD_AUTOPLAY":
      return {
        ...state,
        shouldAutoplay: action.payload,
      };

    // O Counter
    case "INCREMENT_O_COUNTER_START":
      return {
        ...state,
        oCounterLoading: true,
      };

    case "INCREMENT_O_COUNTER_SUCCESS":
      return {
        ...state,
        oCounter: state.oCounter + 1,
        oCounterLoading: false,
      };

    case "INCREMENT_O_COUNTER_ERROR":
      return {
        ...state,
        oCounterLoading: false,
      };

    case "SET_O_COUNTER":
      return {
        ...state,
        oCounter: action.payload,
      };

    // Playlist controls
    case "TOGGLE_AUTOPLAY_NEXT":
      return {
        ...state,
        autoplayNext: !state.autoplayNext,
        // Update playlist object as well
        playlist: state.playlist
          ? { ...state.playlist, autoplayNext: !state.autoplayNext }
          : null,
      };

    case "TOGGLE_SHUFFLE": {
      const newShuffle = !state.shuffle;
      return {
        ...state,
        shuffle: newShuffle,
        // Reset shuffle history when toggling
        shuffleHistory: newShuffle ? [] : state.shuffleHistory,
        // Update playlist object as well
        playlist: state.playlist
          ? {
              ...state.playlist,
              shuffle: newShuffle,
              shuffleHistory: newShuffle ? [] : state.shuffleHistory,
            }
          : null,
      };
    }

    case "TOGGLE_REPEAT": {
      // Cycle through: none → all → one → none
      const repeatModes = ["none", "all", "one"];
      const currentIdx = repeatModes.indexOf(state.repeat);
      const nextRepeat = repeatModes[(currentIdx + 1) % repeatModes.length];
      return {
        ...state,
        repeat: nextRepeat,
        // Update playlist object as well
        playlist: state.playlist
          ? { ...state.playlist, repeat: nextRepeat }
          : null,
      };
    }

    case "SET_SHUFFLE_HISTORY":
      return {
        ...state,
        shuffleHistory: action.payload,
        // Update playlist object as well
        playlist: state.playlist
          ? { ...state.playlist, shuffleHistory: action.payload }
          : null,
      };

    // Initialize from props
    case "INITIALIZE": {
      const playlist = action.payload.playlist;

      // Get shouldAutoplay from props (passed via location.state)
      // Preserve existing value if already set (for re-initialization)
      const shouldAutoplay = action.payload.initialShouldAutoplay || state.shouldAutoplay || false;

      return {
        ...state,
        playlist: playlist || null,
        currentIndex: action.payload.currentIndex || 0,
        compatibility: action.payload.compatibility || null,
        quality: action.payload.initialQuality || "direct",
        // Initialize playlist controls from playlist object
        autoplayNext: playlist?.autoplayNext ?? true,
        shuffle: playlist?.shuffle ?? false,
        repeat: playlist?.repeat ?? "none",
        shuffleHistory: playlist?.shuffleHistory ?? [],
        // Use the determined shouldAutoplay value
        shouldAutoplay: shouldAutoplay,
      };
    }

    default:
      return state;
  }
}
