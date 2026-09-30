import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { type GetClipsOptions, getClips } from "..";
import { queryKeys } from "../queryKeys";

/**
 * A page of the clip list, keyed under `queryKeys.clips.list` (so a hide's
 * `invalidateExclusionDependents` refetches it); null sends nothing. The
 * current page stays on screen while the next one loads.
 */
export function useClipList(params: GetClipsOptions | null) {
  return useQuery({
    queryKey: queryKeys.clips.list((params ?? {}) as Record<string, unknown>),
    queryFn: params === null ? skipToken : () => getClips(params),
    placeholderData: keepPreviousData,
  });
}
