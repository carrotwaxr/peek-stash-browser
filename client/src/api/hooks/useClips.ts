import type { FindClipsRequest } from "@peek/shared-types";
import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { findClips } from "..";
import { clipListTotal, fetchListPage } from "../../utils/listQuery";
import { queryKeys } from "../queryKeys";

/**
 * A page of the clip list, keyed under `queryKeys.clips.list` (so a hide's
 * `invalidateExclusionDependents` refetches it); null sends nothing. The
 * current page stays on screen while the next one loads, and a page change
 * reuses the list's count (`fetchListPage`).
 */
export function useClipList(params: FindClipsRequest | null) {
  return useQuery({
    queryKey: queryKeys.clips.list((params ?? {}) as Record<string, unknown>),
    queryFn:
      params === null
        ? skipToken
        : (context) =>
            fetchListPage(
              context,
              params as Record<string, unknown>,
              clipListTotal,
              (request) => findClips(request as FindClipsRequest)
            ),
    placeholderData: keepPreviousData,
  });
}
