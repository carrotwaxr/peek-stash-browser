import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../services/api.js";
import { useAuth } from "./useAuth.js";

/**
 * Hook for watch history state and O counter
 *
 * Note: Playback tracking (play duration, play count) is now handled by the
 * track-activity Video.js plugin in useVideoPlayer.js. This hook only provides:
 * - Watch history state (for resume time display)
 * - O counter increment
 * - Quality tracking
 *
 * @param {string} sceneId - Stash scene ID
 * @param {Object} playerRef - React ref to Video.js player instance (unused, kept for API compat)
 * @returns {Object} Watch history state and methods
 */
export function useWatchHistory(sceneId, _playerRef = { current: null }) { // eslint-disable-line no-unused-vars
  const { isAuthenticated } = useAuth();
  const [watchHistory, setWatchHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Track current quality for logging/debugging
  const currentQualityRef = useRef("auto");

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
      console.error("Error fetching watch history:", err);
      setError(err.message || "Failed to fetch watch history");
    } finally {
      setLoading(false);
    }
  }, [sceneId, isAuthenticated]);

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
      const response = await apiPost("/watch-history/increment-o", { sceneId });

      if (response.success) {
        // Update local state
        setWatchHistory((prev) => ({
          ...prev,
          oCount: response.oCount,
        }));

        return response;
      }
    } catch (err) {
      console.error("Error incrementing O counter:", err);
      throw err;
    }
  }, [sceneId, isAuthenticated]);

  // Fetch watch history on mount
  useEffect(() => {
    fetchWatchHistory();
  }, [fetchWatchHistory]);

  return {
    // State
    watchHistory,
    loading,
    error,

    // Methods
    updateQuality,
    incrementOCounter,
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
      console.error("Error fetching all watch history:", err);
      setError(err.message || "Failed to fetch watch history");
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
