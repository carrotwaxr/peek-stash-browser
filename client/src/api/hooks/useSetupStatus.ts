/**
 * The one GET /setup/status query, read by the app's route gate and by
 * `ConfigProvider`.
 *
 * The route is public and answers 200, or 500 on a database error. Any
 * failure means the server is not ready yet (restarting, or running its
 * upgrade's migrations behind a proxy that answers 502), so the query
 * retries for as long as it takes, with back-off, and never reports a
 * failure as "setup is not complete". Loaded once, it stays until an
 * instance change invalidates it (`invalidateInstanceQueries`).
 */
import type { GetSetupStatusResponse } from "@peek/shared-types";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { retryDelay } from "../queryClient";
import { queryKeys } from "../queryKeys";
import { setupApi } from "../setup";

export function useSetupStatus(): UseQueryResult<
  GetSetupStatusResponse,
  unknown
> {
  return useQuery({
    queryKey: queryKeys.setup.status(),
    queryFn: ({ signal }) => setupApi.getSetupStatus(signal),
    retry: true,
    retryDelay,
    staleTime: Infinity,
  });
}
