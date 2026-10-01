import { useCallback } from "react";
import type {
  GetUserDownloadsResponse,
  SerializedDownload,
} from "@peek/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "..";
import { queryKeys } from "../queryKeys";

/** How often the list is asked again while a job is queued or running */
const POLL_MS = 3000;

/** A job the server has not finished: its progress and status still change */
const isActive = (download: SerializedDownload): boolean =>
  download.status === "PENDING" || download.status === "PROCESSING";

/**
 * The user's downloads (`GET /downloads`). The query asks again every 3 s
 * while a job is pending or processing and stops once none is. TanStack Query
 * does not poll a hidden tab, so a page in the background stays quiet.
 */
export function useDownloads() {
  return useQuery({
    queryKey: queryKeys.downloads.all(),
    queryFn: ({ signal }) =>
      apiGet<GetUserDownloadsResponse>("/downloads", signal),
    refetchInterval: (query) =>
      query.state.data?.downloads.some(isActive) ? POLL_MS : false,
  });
}

/**
 * Marks the downloads query stale after a download is started elsewhere (the
 * player, a playlist zip, the lightbox), so the Downloads page lists the job
 * at once on the next visit, and an open page refreshes.
 */
export function useInvalidateDownloads() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.downloads.all() }),
    [queryClient]
  );
}

/** Removes a download; the list is read again afterwards. */
export function useDeleteDownload() {
  const invalidate = useInvalidateDownloads();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/downloads/${id}`),
    onSuccess: invalidate,
  });
}

/** Queues a failed download again; the list is read again afterwards. */
export function useRetryDownload() {
  const invalidate = useInvalidateDownloads();
  return useMutation({
    mutationFn: (id: number) => apiPost(`/downloads/${id}/retry`),
    onSuccess: invalidate,
  });
}
