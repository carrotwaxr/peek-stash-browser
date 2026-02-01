// client/src/hooks/useUserStats.js

import { useCallback, useEffect, useState, useRef } from "react";
import { useAuth } from "./useAuth.js";
import { apiGet } from "../services/api.js";

/**
 * Valid sort options for top lists
 * @typedef {"engagement" | "oCount" | "playCount"} TopListSortBy
 */

/**
 * Hook for fetching user stats
 * @param {Object} options - Hook options
 * @param {TopListSortBy} [options.sortBy="engagement"] - Sort order for top lists
 * @returns {Object} { data, loading, error, refresh }
 */
export function useUserStats({ sortBy = "engagement" } = {}) {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isInitialLoad = useRef(true);

  const fetchStats = useCallback(async (showLoading = true) => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      // Only show loading spinner on initial load, not on sort changes
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      const params = new URLSearchParams();
      if (sortBy && sortBy !== "engagement") {
        params.set("sortBy", sortBy);
      }
      const queryString = params.toString();
      const endpoint = queryString ? `/user-stats?${queryString}` : "/user-stats";
      const response = await apiGet(endpoint);
      setData(response);
    } catch (err) {
      console.error("Error fetching user stats:", err);
      setError(err.message || "Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, sortBy]);

  useEffect(() => {
    // Show loading only on initial load
    fetchStats(isInitialLoad.current);
    isInitialLoad.current = false;
  }, [fetchStats]);

  return { data, loading, error, refresh: fetchStats };
}
