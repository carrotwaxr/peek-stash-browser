import { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import axios from 'axios';
import { scenePlayerReducer, initialState } from './scenePlayerReducer.js';

const api = axios.create({
  baseURL: '/api',
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
  initialQuality = 'direct'
}) {
  const [state, dispatch] = useReducer(scenePlayerReducer, initialState);

  // Initialize context from props
  useEffect(() => {
    dispatch({
      type: 'INITIALIZE',
      payload: {
        playlist,
        currentIndex: playlist?.currentIndex || 0,
        compatibility,
        initialQuality,
      },
    });
  }, [playlist, compatibility, initialQuality]);

  // ============================================================================
  // ACTION CREATORS (with side effects)
  // ============================================================================

  const loadScene = useCallback(async (sceneIdToLoad) => {
    dispatch({ type: 'LOAD_SCENE_START' });
    try {
      const response = await api.post('/library/scenes', { ids: [sceneIdToLoad] });
      const scene = response.data?.findScenes?.scenes?.[0];

      if (!scene) {
        throw new Error('Scene not found');
      }

      dispatch({
        type: 'LOAD_SCENE_SUCCESS',
        payload: {
          scene: scene,
          oCounter: scene.o_counter || 0,
        },
      });
    } catch (error) {
      console.error('Error loading scene:', error);
      dispatch({
        type: 'LOAD_SCENE_ERROR',
        payload: error,
      });
    }
  }, []);

  const loadVideo = useCallback(async (forceQuality = null) => {
    const qualityToUse = forceQuality || state.quality;
    const isDirectPlay = qualityToUse === 'direct';

    dispatch({ type: 'LOAD_VIDEO_START' });

    try {
      if (isDirectPlay) {
        dispatch({
          type: 'LOAD_VIDEO_SUCCESS',
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
          type: 'LOAD_VIDEO_SUCCESS',
          payload: {
            video: response.data.scene,
            sessionId: response.data.sessionId,
          },
        });
      }
    } catch (error) {
      console.error('Error loading video:', error);
      dispatch({
        type: 'LOAD_VIDEO_ERROR',
        payload: error,
      });
    }
  }, [state.quality, state.scene]);

  const setQuality = useCallback((newQuality) => {
    dispatch({ type: 'SET_QUALITY', payload: newQuality });
  }, []);

  const setVideo = useCallback((videoData) => {
    dispatch({ type: 'SET_VIDEO', payload: videoData });
  }, []);

  const setSessionId = useCallback((sessionId) => {
    dispatch({ type: 'SET_SESSION_ID', payload: sessionId });
  }, []);

  const clearVideo = useCallback(() => {
    dispatch({ type: 'CLEAR_VIDEO' });
  }, []);

  const nextScene = useCallback(() => {
    dispatch({ type: 'NEXT_SCENE' });
  }, []);

  const prevScene = useCallback(() => {
    dispatch({ type: 'PREV_SCENE' });
  }, []);

  const gotoSceneIndex = useCallback((index) => {
    dispatch({ type: 'GOTO_SCENE_INDEX', payload: index });
  }, []);

  const setIsInitializing = useCallback((value) => {
    dispatch({ type: 'SET_INITIALIZING', payload: value });
  }, []);

  const setIsAutoFallback = useCallback((value) => {
    dispatch({ type: 'SET_AUTO_FALLBACK', payload: value });
  }, []);

  const setSwitchingMode = useCallback((value) => {
    dispatch({ type: 'SET_SWITCHING_MODE', payload: value });
  }, []);

  const setReady = useCallback((value) => {
    dispatch({ type: 'SET_READY', payload: value });
  }, []);

  const setShouldAutoplay = useCallback((value) => {
    dispatch({ type: 'SET_SHOULD_AUTOPLAY', payload: value });
  }, []);

  const incrementOCounter = useCallback(async () => {
    if (!state.scene?.id) return;

    dispatch({ type: 'INCREMENT_O_COUNTER_START' });
    try {
      await api.post('/watch-history/increment-o', { sceneId: state.scene.id });
      dispatch({ type: 'INCREMENT_O_COUNTER_SUCCESS' });
    } catch (error) {
      console.error('Error incrementing O counter:', error);
      dispatch({ type: 'INCREMENT_O_COUNTER_ERROR' });
    }
  }, [state.scene?.id]);

  const setOCounter = useCallback((newCount) => {
    dispatch({ type: 'SET_O_COUNTER', payload: newCount });
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
        const expectedSceneId = state.playlist.scenes[state.currentIndex]?.sceneId;

        if (state.scene.id !== expectedSceneId) {
          return; // Waiting for new scene to load
        }
      }

      loadVideo();
    }
  }, [state.scene, state.video, state.videoLoading, state.playlist, state.currentIndex, loadVideo]);

  // Update URL when navigating playlist (without React Router navigation)
  useEffect(() => {
    if (state.playlist && state.scene) {
      const newUrl = `/scene/${state.scene.id}`;
      if (window.location.pathname !== newUrl) {
        window.history.replaceState(null, '', newUrl);
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

    // Actions
    loadScene,
    loadVideo,
    setQuality,
    setVideo,
    setSessionId,
    clearVideo,
    nextScene,
    prevScene,
    gotoSceneIndex,
    setIsInitializing,
    setIsAutoFallback,
    setSwitchingMode,
    setReady,
    setShouldAutoplay,
    incrementOCounter,
    setOCounter,
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
    throw new Error('useScenePlayer must be used within ScenePlayerProvider');
  }
  return context;
}
