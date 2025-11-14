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

/**
 * Hook for paginated data fetching
 */
export function usePaginatedData(fetchFunction, initialPage = 1, perPage = 24) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(true);

  const fetchData = useCallback(
    async (pageNum = page) => {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchFunction(pageNum, perPage);

        // Handle different response structures
        let items, count;
        if (result.findScenes) {
          items = result.findScenes.scenes;
          count = result.findScenes.count;
        } else if (result.findPerformers) {
          items = result.findPerformers.performers;
          count = result.findPerformers.count;
        } else if (result.findStudios) {
          items = result.findStudios.studios;
          count = result.findStudios.count;
        } else if (result.findTags) {
          items = result.findTags.tags;
          count = result.findTags.count;
        } else {
          items = result;
          count = result.length;
        }

        if (pageNum === 1) {
          setData(items);
        } else {
          setData((prev) => [...(prev || []), ...items]);
        }

        setHasMore(
          items.length === perPage && (data?.length || 0) + items.length < count
        );
      } catch (err) {
        // Preserve full error object to maintain isInitializing flag
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [fetchFunction, page, perPage, data?.length]
  );

  useEffect(() => {
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchData(nextPage);
    }
  }, [loading, hasMore, page, fetchData]);

  const refresh = useCallback(() => {
    setPage(1);
    setData(null);
    fetchData(1);
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    page,
  };
}

/**
 * Hook for searching with debouncing
 */
export function useSearch(searchFunction, debounceMs = 300) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        const searchResults = await searchFunction(query);
        setResults(searchResults);
      } catch (err) {
        // Preserve full error object to maintain isInitializing flag
        setError(err);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [query, searchFunction, debounceMs]);

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults(null);
    setError(null);
  }, []);

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    clearSearch,
  };
}
