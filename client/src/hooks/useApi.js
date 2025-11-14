import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth.js";

/**
 * Base hook for data fetching with loading states and error handling
 */
export function useAsyncData(fetchFunction, dependencies = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const refetch = useCallback(async () => {
    // Don't make API calls if not authenticated or still checking auth
    if (authLoading || !isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await fetchFunction();
      setData(result);
    } catch (err) {
      // Preserve full error object to maintain isInitializing flag
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [fetchFunction, authLoading, isAuthenticated]);

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, ...dependencies]);

  return { data, loading, error, refetch };
}
