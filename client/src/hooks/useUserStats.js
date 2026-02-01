// client/src/hooks/useUserStats.js

import { useCallback, useEffect, useState } from "react";
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

  const fetchStats = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
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
    fetchStats();
  }, [fetchStats]);

  return { data, loading, error, refresh: fetchStats };
}
