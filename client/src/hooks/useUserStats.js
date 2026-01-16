// client/src/hooks/useUserStats.js

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth.js";
import { apiGet } from "../services/api.js";

/**
 * Hook for fetching user stats
 * @returns {Object} { data, loading, error, refresh }
 */
export function useUserStats() {
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
      const response = await apiGet("/user-stats");
      setData(response);
    } catch (err) {
      console.error("Error fetching user stats:", err);
      setError(err.message || "Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { data, loading, error, refresh: fetchStats };
}
