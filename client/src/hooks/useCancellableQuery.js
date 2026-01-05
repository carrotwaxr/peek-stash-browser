import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./useAuth.js";

/**
 * Hook for making cancellable API queries with automatic state management.
 * Aborts previous in-flight requests when a new query is executed.
 *
 * @param {Object} options
 * @param {boolean} options.initialLoading - Initial loading state (default: true)
 * @param {Function} options.onDataChange - Callback called synchronously after data loads
 * @returns {Object} { data, isLoading, error, execute, setData, initMessage }
 */
export function useCancellableQuery({ initialLoading = true, onDataChange } = {}) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [error, setError] = useState(null);
  const [initMessage, setInitMessage] = useState(null);
  const abortControllerRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  /**
   * Execute a query function with automatic cancellation of previous requests.
   * @param {Function} queryFn - Async function that receives AbortSignal and returns data
   * @param {Object} options
   * @param {number} options.retryCount - Current retry count for initializing state (internal use)
   */
  const execute = useCallback(
    async (queryFn, { retryCount = 0 } = {}) => {
      // Don't make API calls if not authenticated or still checking auth
      if (isAuthLoading || !isAuthenticated) {
        setIsLoading(false);
        return;
      }

      // Clear any pending retry
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // Abort previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new controller
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        setIsLoading(true);
        setError(null);
        setInitMessage(null);

        const result = await queryFn(controller.signal);

        // Only update state if not aborted
        if (!controller.signal.aborted) {
          setData(result);
          onDataChange?.(result);
          setIsLoading(false);
        }
      } catch (err) {
        // Swallow AbortError - request was intentionally cancelled
        if (err.name === "AbortError") {
          return;
        }

        // Only update state if not aborted
        if (!controller.signal.aborted) {
          // Handle server initializing state with retry
          if (err.isInitializing && retryCount < 60) {
            setInitMessage("Server is syncing library, please wait...");
            retryTimeoutRef.current = setTimeout(() => {
              execute(queryFn, { retryCount: retryCount + 1 });
            }, 5000);
            return;
          }

          setError(err);
          setIsLoading(false);
        }
      }
    },
    [isAuthLoading, isAuthenticated, onDataChange]
  );

  /**
   * Reset the query state
   */
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    setData(null);
    setIsLoading(false);
    setError(null);
    setInitMessage(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return {
    data,
    isLoading,
    error,
    initMessage,
    execute,
    setData,
    reset,
  };
}
