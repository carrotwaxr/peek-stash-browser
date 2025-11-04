import { useState, useEffect } from "react";

/**
 * Hook to handle cache loading state with automatic retry logic
 * Returns state for showing cache loading banner and managing retries
 *
 * @param {Object} error - Error object from API call
 * @param {Function} refetch - Function to retry the API call
 * @param {number} maxRetries - Maximum number of retries (default: 60 = 5 minutes)
 * @returns {{ isInitializing: boolean, retryCount: number }}
 */
export const useCacheLoading = (error, refetch, maxRetries = 60) => {
  const [retryCount, setRetryCount] = useState(0);
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    if (error?.isInitializing) {
      setIsInitializing(true);

      if (retryCount < maxRetries) {
        const timer = setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          refetch();
        }, 5000); // Retry every 5 seconds

        return () => clearTimeout(timer);
      } else {
        // Max retries reached
        setIsInitializing(false);
        console.error(
          `Cache loading failed after ${retryCount} retries:`,
          error
        );
      }
    } else if (!error) {
      // Success - reset state
      setIsInitializing(false);
      setRetryCount(0);
    }
  }, [error, refetch, retryCount, maxRetries]);

  return { isInitializing, retryCount };
};
