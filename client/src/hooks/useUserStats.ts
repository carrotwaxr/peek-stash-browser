/**
 * Hook for fetching user stats via TanStack Query.
 */
import type { UserStatsResponse } from "@peek/shared-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, getErrorMessage } from "../api";
import { queryKeys } from "../api/queryKeys";
import { useAuth } from "./useAuth";

export type TopListSortBy = "engagement" | "oCount" | "playCount";

interface UseUserStatsOptions {
  sortBy?: TopListSortBy;
}

export function useUserStats({
  sortBy = "engagement",
}: UseUserStatsOptions = {}) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<UserStatsResponse>({
    queryKey: [...queryKeys.user.stats(), sortBy],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (sortBy && sortBy !== "engagement") {
        params.set("sortBy", sortBy);
      }
      const queryString = params.toString();
      const endpoint = queryString
        ? `/user-stats?${queryString}`
        : "/user-stats";
      return apiGet<UserStatsResponse>(endpoint, signal);
    },
    enabled: isAuthenticated,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.user.stats() });
  };

  return {
    data: data ?? null,
    loading: isLoading,
    error: error ? getErrorMessage(error, "Failed to fetch stats") : null,
    refresh,
  };
}
