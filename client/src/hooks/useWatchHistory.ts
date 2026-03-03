import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "../api";
import { useAuth } from "./useAuth";

/**
 * Hook for watch history state
 *
 * Note: Playback tracking (play duration, play count) is now handled by the
 * track-activity Video.js plugin in useVideoPlayer.js. This hook only provides:
 * - Watch history state (for resume time display)
 * - Quality tracking
 *
 * @param {string} sceneId - Stash scene ID
 * @param {Object} playerRef - React ref to Video.js player instance (unused, kept for API compat)
 * @returns {Object} Watch history state and methods
 */
interface WatchHistoryData {
  oCount?: number;
  [key: string]: unknown;
}

export function useWatchHistory(sceneId: string, _playerRef = { current: null }) {
  const { isAuthenticated } = useAuth();
  const [watchHistory, setWatchHistory] = useState<WatchHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const data = await apiGet<WatchHistoryData>(`/watch-history/${sceneId}`);
      setWatchHistory(data);
    } catch (err) {
      console.error("Error fetching watch history:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch watch history");
    } finally {
      setLoading(false);
    }
  }, [sceneId, isAuthenticated]);

  /**
   * Update current quality setting
   */
  const updateQuality = useCallback((quality: string) => {
    currentQualityRef.current = quality;
  }, []);

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
  const [data, setData] = useState<WatchHistoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const response = await apiGet<{ watchHistory?: WatchHistoryData[] }>(`/watch-history?${queryParams}`);
      setData(response.watchHistory || []);
    } catch (err) {
      console.error("Error fetching all watch history:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch watch history");
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
