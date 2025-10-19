import { useState, useEffect, useCallback, useRef } from 'react';
import { apiPost, apiGet } from '../services/api.js';
import { useAuth } from './useAuth.js';

/**
 * Hook for tracking watch history with periodic pings
 * Handles playback tracking, O counter, and resume time
 *
 * @param {string} sceneId - Stash scene ID
 * @param {Object} playerRef - React ref to Video.js player instance
 * @returns {Object} Watch history state and methods
 */
export function useWatchHistory(sceneId, playerRef = { current: null }) {
  const { isAuthenticated } = useAuth();
  const [watchHistory, setWatchHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Refs for tracking session state
  const sessionStartRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const seekEventsRef = useRef([]);
  const currentQualityRef = useRef('auto');
  const hasIncrementedPlayCountRef = useRef(false);

  /**
   * Fetch watch history for this scene
   */
  const fetchWatchHistory = useCallback(async () => {
    if (!sceneId || !isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await apiGet(`/watch-history/${sceneId}`);
      setWatchHistory(data);
    } catch (err) {
      console.error('Error fetching watch history:', err);
      setError(err.message || 'Failed to fetch watch history');
    } finally {
      setLoading(false);
    }
  }, [sceneId, isAuthenticated]);

  /**
   * Send ping to server with current playback state
   */
  const sendPing = useCallback(async () => {
    if (!playerRef.current || !sceneId || !isAuthenticated) {
      return;
    }

    try {
      const currentTime = playerRef.current.currentTime();

      const pingData = {
        sceneId,
        currentTime,
        quality: currentQualityRef.current,
        sessionStart: sessionStartRef.current,
        seekEvents: seekEventsRef.current,
      };

      const response = await apiPost('/watch-history/ping', pingData);

      // Update local state with server response
      if (response.success) {
        setWatchHistory(response.watchHistory);

        // Mark that play count has been incremented (to prevent multiple increments in same session)
        if (response.watchHistory.playCount > (watchHistory?.playCount || 0)) {
          hasIncrementedPlayCountRef.current = true;
        }
      }
    } catch (err) {
      console.error('Error sending watch history ping:', err);
      // Don't set error state for ping failures - they're not critical
    }
  }, [playerRef, sceneId, isAuthenticated, watchHistory?.playCount]);

  /**
   * Start tracking watch session
   */
  const startTracking = useCallback(() => {
    if (!playerRef.current || !sceneId || !isAuthenticated) {
      return;
    }

    // Initialize session start time if not already set
    if (!sessionStartRef.current) {
      sessionStartRef.current = new Date().toISOString();
      hasIncrementedPlayCountRef.current = false;
    }

    // Clear existing interval if any
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    // Send immediate ping
    sendPing();

    // Set up 30-second ping interval
    pingIntervalRef.current = setInterval(() => {
      sendPing();
    }, 30000); // 30 seconds

    console.log('Watch history tracking started for scene:', sceneId);
  }, [playerRef, sceneId, isAuthenticated, sendPing]);

  /**
   * Stop tracking watch session (send final ping and cleanup)
   */
  const stopTracking = useCallback(() => {
    // Send final ping before stopping
    sendPing();

    // Clear interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    console.log('Watch history tracking stopped for scene:', sceneId);
  }, [sendPing, sceneId]);

  /**
   * Track seek event
   */
  const trackSeek = useCallback((from, to) => {
    seekEventsRef.current.push({
      time: new Date().toISOString(),
      from,
      to,
    });
  }, []);

  /**
   * Update current quality setting
   */
  const updateQuality = useCallback((quality) => {
    currentQualityRef.current = quality;
  }, []);

  /**
   * Increment O counter
   */
  const incrementOCounter = useCallback(async () => {
    if (!sceneId || !isAuthenticated) {
      return null;
    }

    try {
      const response = await apiPost('/watch-history/increment-o', { sceneId });

      if (response.success) {
        // Update local state
        setWatchHistory((prev) => ({
          ...prev,
          oCount: response.oCount,
        }));

        return response;
      }
    } catch (err) {
      console.error('Error incrementing O counter:', err);
      throw err;
    }
  }, [sceneId, isAuthenticated]);

  /**
   * Reset session (for when starting new playback session)
   */
  const resetSession = useCallback(() => {
    sessionStartRef.current = new Date().toISOString();
    seekEventsRef.current = [];
    hasIncrementedPlayCountRef.current = false;
  }, []);

  // Fetch watch history on mount
  useEffect(() => {
    fetchWatchHistory();
  }, [fetchWatchHistory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Send final ping and cleanup when component unmounts
      if (pingIntervalRef.current) {
        stopTracking();
      }
    };
  }, [stopTracking]);

  // Listen for page visibility changes (tab switching)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User switched away from tab - send final ping
        stopTracking();
      } else if (playerRef.current && !playerRef.current.paused()) {
        // User returned to tab and video is playing - restart tracking
        startTracking();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [playerRef, startTracking, stopTracking]);

  // Listen for beforeunload (closing tab/navigating away)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Send final ping before page unloads
      if (pingIntervalRef.current && navigator.sendBeacon) {
        // Use sendBeacon for reliable delivery during page unload
        const currentTime = playerRef.current?.currentTime() || 0;
        const pingData = {
          sceneId,
          currentTime,
          quality: currentQualityRef.current,
          sessionStart: sessionStartRef.current,
          seekEvents: seekEventsRef.current,
        };

        navigator.sendBeacon('/api/watch-history/ping', JSON.stringify(pingData));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [playerRef, sceneId]);

  return {
    // State
    watchHistory,
    loading,
    error,

    // Methods
    startTracking,
    stopTracking,
    trackSeek,
    updateQuality,
    incrementOCounter,
    resetSession,
    refresh: fetchWatchHistory,
  };
}

/**
 * Hook for fetching all watch history (for Continue Watching carousel)
 *
 * @param {Object} options - Fetch options
 * @param {boolean} options.inProgress - Only fetch scenes in progress
 * @param {number} options.limit - Number of items to fetch
 * @returns {Object} Watch history list and loading state
 */
export function useAllWatchHistory({ inProgress = false, limit = 20 } = {}) {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        inProgress: inProgress.toString(),
      });

      const response = await apiGet(`/watch-history?${queryParams}`);
      setData(response.watchHistory || []);
    } catch (err) {
      console.error('Error fetching all watch history:', err);
      setError(err.message || 'Failed to fetch watch history');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, inProgress, limit]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    data,
    loading,
    error,
    refresh: fetchAll,
  };
}
