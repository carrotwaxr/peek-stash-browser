/**
 * TanStack Query client configuration.
 *
 * Retries, and the library-initializing state: a query answered 503
 * `ready: false` is not retried but marks the library not ready, and
 * useLibraryReady re-checks it and refetches once it is ready.
 */
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import {
  isLibraryInitializing,
  markLibraryNotReady,
} from "./hooks/useLibraryReady";

/** The longest Retry-After a query waits out; a longer wait shows the error. */
const MAX_RETRY_AFTER_SECONDS = 10;

/**
 * A 503 that names a short wait: the database was busy (the server's
 * central handler answers it with Retry-After: 1). Not the library
 * initializing, which useLibraryReady handles.
 */
function isBriefOutage(
  error: unknown
): error is ApiError & { retryAfterSeconds: number } {
  return (
    error instanceof ApiError &&
    error.status === 503 &&
    !error.isInitializing &&
    error.retryAfterSeconds !== undefined &&
    error.retryAfterSeconds <= MAX_RETRY_AFTER_SECONDS
  );
}

/**
 * Retry predicate. A busy 503 gets one more try, after its Retry-After; a
 * network failure three, with back-off. The library initializing and every
 * other HTTP error are not retried. Queries only: a mutation is never
 * resent, since a write that answered busy may have been partly applied.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isBriefOutage(error)) return failureCount < 1;
  if (error instanceof ApiError) return false;
  // A network failure (fetch rejected)
  return failureCount < 3;
}

/** Wait before a retry: a busy 503's Retry-After, else 1, 2, 4... s up to 10 s. */
export function retryDelay(attemptIndex: number, error: unknown): number {
  if (isBriefOutage(error)) return error.retryAfterSeconds * 1000;
  return Math.min(1000 * 2 ** attemptIndex, 10_000);
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isLibraryInitializing(error)) markLibraryNotReady(client);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes (was cacheTime in v4)
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return client;
}

export const queryClient = createQueryClient();
