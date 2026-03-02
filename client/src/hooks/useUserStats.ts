/**
 * Hook for fetching user stats via TanStack Query.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { apiGet } from "../api";
import { queryKeys } from "../api/queryKeys";

type TopListSortBy = "engagement" | "oCount" | "playCount";

interface UseUserStatsOptions {
  sortBy?: TopListSortBy;
}

export function useUserStats({ sortBy = "engagement" }: UseUserStatsOptions = {}) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.user.stats(), sortBy],
    queryFn: () => {
      const params = new URLSearchParams();
      if (sortBy && sortBy !== "engagement") {
        params.set("sortBy", sortBy);
      }
      const queryString = params.toString();
      const endpoint = queryString ? `/user-stats?${queryString}` : "/user-stats";
      return apiGet(endpoint);
    },
    enabled: isAuthenticated,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.user.stats() });
  };

  return {
    data: (data as Record<string, unknown>) ?? null,
    loading: isLoading,
    error: error ? (error as Error).message || "Failed to fetch stats" : null,
    refresh,
  };
}
