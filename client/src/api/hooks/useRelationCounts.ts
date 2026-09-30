import type { RelationCountsType } from "@peek/shared-types";
import { skipToken, useQuery } from "@tanstack/react-query";
import { type RelationCountsOptions, libraryApi } from "../library";
import { queryKeys } from "../queryKeys";
import { useLibraryReady } from "./useLibraryReady";

/** Each counted type's query-key root */
const KEYS = {
  performer: queryKeys.performers.counts,
  studio: queryKeys.studios.counts,
  tag: queryKeys.tags.counts,
  group: queryKeys.groups.counts,
  gallery: queryKeys.galleries.counts,
} as const satisfies Record<RelationCountsType, unknown>;

/**
 * A detail page's tab counts, as the viewer sees them (the same numbers as
 * the entity's card): asked once the page knows its entity's own instance,
 * and again when the page's Include sub-tags or sub-studios toggle changes.
 * While the next answer loads, the previous one for the same entity stays.
 */
export function useRelationCounts<T extends RelationCountsType>(
  type: T,
  id: string | undefined,
  instanceId: string | undefined,
  options: RelationCountsOptions = {}
) {
  const { ready } = useLibraryReady();
  const flags = {
    includeSubTags: options.includeSubTags === true,
    includeSubStudios: options.includeSubStudios === true,
  };
  return useQuery({
    queryKey: KEYS[type](instanceId, id, flags),
    queryFn:
      id !== undefined && instanceId !== undefined && ready
        ? ({ signal }) =>
            libraryApi.getRelationCounts(type, id, instanceId, flags, signal)
        : skipToken,
    // Keep the entity's counts on screen while a toggle's load; never
    // another entity's
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === instanceId &&
      previousQuery?.queryKey[3] === id
        ? previous
        : undefined,
  });
}
