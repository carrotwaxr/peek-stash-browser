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

    case "LOAD_SCENE_SUCCESS":
      return {
        ...state,
        scene: action.payload.scene,
        oCounter: action.payload.oCounter || 0,
        sceneLoading: false,
        sceneError: null,
      };

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
    case "NEXT_SCENE":
      if (
        !state.playlist ||
        state.currentIndex >= state.playlist.scenes.length - 1
      ) {
        return state;
      }

      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        // Clear video data - will be fetched for new scene
        video: null,
        sessionId: null,
        isInitializing: false,
        ready: false, // Reset ready state for new scene
      };

    case "PREV_SCENE":
      if (!state.playlist || state.currentIndex <= 0) {
        return state;
      }

      return {
        ...state,
        currentIndex: state.currentIndex - 1,
        // Clear video data - will be fetched for new scene
        video: null,
        sessionId: null,
        isInitializing: false,
        ready: false, // Reset ready state for new scene
      };

    case "GOTO_SCENE_INDEX":
      if (
        !state.playlist ||
        action.payload < 0 ||
        action.payload >= state.playlist.scenes.length
      ) {
        return state;
      }
      return {
        ...state,
        currentIndex: action.payload,
        // Clear video data - will be fetched for new scene
        video: null,
        sessionId: null,
        isInitializing: false,
        ready: false, // Reset ready state for new scene
      };

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

    // Initialize from props
    case "INITIALIZE":
      return {
        ...state,
        playlist: action.payload.playlist || null,
        currentIndex: action.payload.currentIndex || 0,
        compatibility: action.payload.compatibility || null,
        quality: action.payload.initialQuality || "direct",
      };

    default:
      return state;
  }
}
