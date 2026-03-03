/**
 * TanStack Query client configuration.
 *
 * Configures global defaults including 503 retry logic for server
 * initialization and network errors.
 */
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

/**
 * Retry predicate: retry on 503 (server initializing) and network errors,
 * but not on other HTTP errors (4xx, 5xx).
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;

  if (error instanceof ApiError) {
    // Retry if the server is still initializing (503 with ready: false)
    if (error.isInitializing) return true;
    // Don't retry other HTTP errors
    return false;
  }

  // Retry on network errors (fetch failed)
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (was cacheTime in v4)
      retry: shouldRetry,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
