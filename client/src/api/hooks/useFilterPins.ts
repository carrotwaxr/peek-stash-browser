import { useMemo } from "react";
import {
  type FilterPins,
  type GetFilterPinsResponse,
  LIST_KINDS,
  type ListKind,
  type ListPins,
  defaultPinsOf,
} from "@peek/shared-types";
import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiDelete, apiGet, apiPut } from "..";
import { queryKeys } from "../queryKeys";

/**
 * Every list's pins, one request per session shared by every reader. It sits
 * under `user`, so a sign-out clears it with the rest of the cache.
 */
const pinsQueryOptions = queryOptions({
  queryKey: queryKeys.user.filterPins(),
  queryFn: () => apiGet<GetFilterPinsResponse>("/user/filter-pins"),
  staleTime: Infinity,
});

/**
 * A list's pinned fields and filters. The list's defaults show while the
 * request loads and if it fails, so the chip bar never waits for them.
 */
export function useFilterPins(kind: ListKind): ListPins {
  const { data } = useQuery(pinsQueryOptions);
  const stored = data?.pins[kind];
  return useMemo(() => stored ?? defaultPinsOf(kind), [stored, kind]);
}

/** The cached answer with one list's entry replaced */
function withListPins(
  cached: GetFilterPinsResponse,
  kind: ListKind,
  pins: ListPins
): GetFilterPinsResponse {
  return { ...cached, pins: { ...cached.pins, [kind]: pins } };
}

/** Writes one list's entry into the cache; nothing when it holds no answer yet */
function writeListPins(
  queryClient: QueryClient,
  kind: ListKind,
  pins: ListPins
) {
  queryClient.setQueryData<GetFilterPinsResponse>(
    queryKeys.user.filterPins(),
    (cached) => cached && withListPins(cached, kind, pins)
  );
}

export interface SetPinsVariables {
  kind: ListKind;
  pins: ListPins;
}

interface SetPinsContext {
  /** The list's entry before the write; undefined when the cache held no answer */
  previous: ListPins | undefined;
  hadAnswer: boolean;
}

/**
 * Saves a list's pins (`PUT /user/filter-pins/:list`). The new pins show
 * before the server answers; a failed save puts that list's previous pins
 * back (other lists' entries are left as they are, so overlapping saves of
 * different lists do not undo each other).
 */
export function useSetPins() {
  const queryClient = useQueryClient();
  const key = queryKeys.user.filterPins();
  return useMutation<unknown, Error, SetPinsVariables, SetPinsContext>({
    mutationFn: ({ kind, pins }) => apiPut(`/user/filter-pins/${kind}`, pins),
    onMutate: async ({ kind, pins }) => {
      // A read still on its way would land over the new pins
      await queryClient.cancelQueries({ queryKey: key });
      const cached = queryClient.getQueryData<GetFilterPinsResponse>(key);
      if (cached) {
        writeListPins(queryClient, kind, pins);
      } else {
        // The first answer has not come: show the change over the defaults;
        // `onSettled` reads the truth for the other lists
        queryClient.setQueryData<GetFilterPinsResponse>(key, {
          pins: withDefaults(kind, pins),
        });
      }
      return { previous: cached?.pins[kind], hadAnswer: cached !== undefined };
    },
    onError: (_error, { kind }, context) => {
      if (context?.hadAnswer) {
        writeListPins(
          queryClient,
          kind,
          context.previous ?? defaultPinsOf(kind)
        );
      } else {
        void queryClient.resetQueries({ queryKey: key });
      }
    },
    onSettled: (_data, _error, _variables, context) =>
      context?.hadAnswer === false
        ? queryClient.invalidateQueries({ queryKey: key })
        : undefined,
  });
}

/** Every list's defaults, with one list's pins in place */
function withDefaults(kind: ListKind, pins: ListPins): FilterPins {
  const all = Object.fromEntries(
    LIST_KINDS.map((k) => [k, k === kind ? pins : defaultPinsOf(k)])
  );
  return all as unknown as FilterPins;
}

/** Puts a list's pins back to the defaults (`DELETE /user/filter-pins/:list`) */
export function useResetPins() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kind: ListKind) => apiDelete(`/user/filter-pins/${kind}`),
    onSuccess: (_response, kind) =>
      writeListPins(queryClient, kind, defaultPinsOf(kind)),
  });
}
