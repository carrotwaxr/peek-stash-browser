import { useCallback, useEffect, useRef, useState } from "react";
import type { GetWatchedScenesResponse } from "@peek/shared-types";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api";
import { useLibraryReady } from "../api/hooks/useLibraryReady";
import { type WatchedScenesKeyParams, queryKeys } from "../api/queryKeys";
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
 * @param {string} instanceId - The scene's Stash instance (the server needs it: ids repeat across servers)
 * @param {Object} playerRef - React ref to Video.js player instance (unused, kept for API compat)
 * @returns {Object} Watch history state and methods
 */
interface WatchHistoryData {
  oCount?: number;
  [key: string]: unknown;
}

export function useWatchHistory(
  sceneId: string,
  instanceId: string,
  _playerRef = { current: null }
) {
  const { isAuthenticated } = useAuth();
  const [watchHistory, setWatchHistory] = useState<WatchHistoryData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track current quality for logging/debugging
  const currentQualityRef = useRef("auto");

  /**
   * Fetch watch history for this scene
   */
  const fetchWatchHistory = useCallback(async () => {
    if (!sceneId || !instanceId || !isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<WatchHistoryData>(
        `/watch-history/${sceneId}?instanceId=${encodeURIComponent(instanceId)}`
      );
      setWatchHistory(data);
    } catch (err) {
      console.error("Error fetching watch history:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch watch history"
      );
    } finally {
      setLoading(false);
    }
  }, [sceneId, instanceId, isAuthenticated]);

  /**
   * Update current quality setting
   */
  const updateQuality = useCallback((quality: string) => {
    currentQualityRef.current = quality;
  }, []);

  // Fetch watch history on mount
  useEffect(() => {
    void fetchWatchHistory();
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
 * One page of the viewer's watched scenes (`GET /watch-history/scenes`), in
 * the view and order asked for: Continue Watching and the Watch History page.
 * The scenes carry the viewer's own `resume_time`, `play_count`,
 * `play_duration`, `last_played_at`, `o_counter` and `last_o_at`.
 *
 * The query sits under the `watchHistory` root, which the library predicate
 * matches: a hide, a restore or an instance change refetches it, and it
 * waits while the library is initializing.
 */
export function useWatchedScenes(params: WatchedScenesKeyParams) {
  const { ready } = useLibraryReady();
  return useQuery({
    queryKey: queryKeys.watchHistory.scenes(params),
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({
        view: params.view,
        sort: params.sort,
        page: String(params.page),
        per_page: String(params.perPage),
      });
      if (params.count === false) query.set("count", "false");
      return apiGet<GetWatchedScenesResponse>(
        `/watch-history/scenes?${query}`,
        signal
      );
    },
    enabled: ready,
  });
}
