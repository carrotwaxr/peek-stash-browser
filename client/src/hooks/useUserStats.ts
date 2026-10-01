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

  const queryKey = [...queryKeys.user.stats(), sortBy];

  const fetchStats = (signal: AbortSignal, forceRefresh = false) => {
    const params = new URLSearchParams();
    if (sortBy && sortBy !== "engagement") {
      params.set("sortBy", sortBy);
    }
    if (forceRefresh) {
      params.set("refresh", "1");
    }
    const queryString = params.toString();
    return apiGet<UserStatsResponse>(
      queryString ? `/user-stats?${queryString}` : "/user-stats",
      signal
    );
  };

  const { data, isLoading, error } = useQuery<UserStatsResponse>({
    queryKey,
    queryFn: ({ signal }) => fetchStats(signal),
    enabled: isAuthenticated,
  });

  /**
   * Asks the server to recompute the rankings, and resolves once the
   * refreshed answer is in the query (it rejects when the request fails).
   * The other sorts' cached answers come from the old rankings: they are
   * marked stale, not fetched, and refetch when next shown.
   */
  const refresh = async (): Promise<void> => {
    await queryClient.fetchQuery({
      queryKey,
      queryFn: ({ signal }) => fetchStats(signal, true),
      staleTime: 0,
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.user.stats(),
      predicate: (query) => query.queryKey.at(-1) !== sortBy,
      refetchType: "none",
    });
  };

  return {
    data: data ?? null,
    loading: isLoading,
    // A failed refresh leaves the page's last answer showing
    error:
      error && !data ? getErrorMessage(error, "Failed to fetch stats") : null,
    refresh,
  };
}
