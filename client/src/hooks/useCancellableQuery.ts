/**
 * Bridge hook: useCancellableQuery backed by TanStack Query.
 *
 * Preserves the imperative `execute(queryFn)` API used by grid pages
 * while delegating to TanStack Query for caching, deduplication, and
 * 503 retry. Grid pages will migrate to direct useQuery in PR 4.
 *
 * @deprecated Use TanStack Query hooks directly (e.g., useQuery) in new code.
 */
import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { ApiError } from "../api/client";

interface UseCancellableQueryOptions {
  initialLoading?: boolean;
  onDataChange?: (data: unknown) => void;
}

// Incrementing counter to create unique query keys for each execute() call
let queryCounter = 0;

export function useCancellableQuery({
  initialLoading = true,
  onDataChange,
}: UseCancellableQueryOptions = {}) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();

  // Store the query function and a version counter to trigger re-fetches
  const [queryState, setQueryState] = useState<{
    fn: ((signal: AbortSignal) => Promise<unknown>) | null;
    key: number;
  }>({ fn: null, key: 0 });

  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  const enabled =
    !isAuthLoading && isAuthenticated && queryState.fn !== null;

  const queryKey = ["cancellableQuery", queryState.key] as const;

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      if (!queryState.fn) throw new Error("No query function");
      return queryState.fn(signal);
    },
    enabled,
    staleTime: 0, // Always refetch when execute() is called with new params
    gcTime: 0, // Don't cache imperative queries
  });

  // Fire onDataChange when data arrives
  const prevDataRef = useRef<unknown>(undefined);
  if (data !== undefined && data !== prevDataRef.current) {
    prevDataRef.current = data;
    onDataChangeRef.current?.(data);
  }

  // Compute initMessage from error
  const initMessage =
    error instanceof ApiError && error.isInitializing
      ? "Server is syncing library, please wait..."
      : null;

  const execute = useCallback(
    (queryFn: (signal: AbortSignal) => Promise<unknown>) => {
      queryCounter++;
      setQueryState({ fn: queryFn, key: queryCounter });
    },
    [],
  );

  const [manualData, setManualData] = useState<unknown>(null);

  const setData = useCallback(
    (newData: unknown) => {
      setManualData(newData);
      // Also update the query cache (inline key to satisfy exhaustive-deps)
      queryClient.setQueryData(["cancellableQuery", queryState.key], newData);
    },
    [queryClient, queryState.key],
  );

  const reset = useCallback(() => {
    setQueryState({ fn: null, key: 0 });
    setManualData(null);
  }, []);

  // Use manual data override if set, otherwise query data
  const effectiveData = manualData !== null ? manualData : (data ?? null);

  // Show loading on initial state (no query yet) if initialLoading is true
  const effectiveLoading =
    queryState.fn === null
      ? initialLoading && !isAuthLoading
      : isLoading || isFetching;

  return {
    data: effectiveData,
    isLoading: effectiveLoading,
    error: initMessage ? null : (error as Error | null),
    initMessage,
    execute,
    setData,
    reset,
  };
}
