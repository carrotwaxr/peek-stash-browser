/**
 * Bridge hook: useAsyncData backed by TanStack Query.
 *
 * Preserves the original API for existing consumers (Home.jsx).
 * New code should use useQuery directly.
 *
 * @deprecated Use useQuery directly in new code.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

export function useAsyncData(
  fetchFunction: () => Promise<unknown>,
  dependencies: unknown[] = [],
) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Build a stable query key from the dependencies
  const queryKey = ["asyncData", ...dependencies];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchFunction(),
    enabled: !authLoading && isAuthenticated,
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey });
  };

  return {
    data: data ?? null,
    loading: isLoading,
    error: error as Error | null,
    refetch,
  };
}
