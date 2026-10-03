import { useMemo } from "react";
import type { MinimalEntity } from "@peek/shared-types";
import { useQueries } from "@tanstack/react-query";
import { useLibraryReady } from "../../api/hooks/useLibraryReady";
import { queryKeys } from "../../api/queryKeys";
import { useDebouncedValue } from "../../hooks/useDebounce";
import { makeCompositeKey } from "../../utils/compositeKey";
import type { FilterOption } from "../../utils/filterFields";
import { minimalFinder } from "../ui/minimalFinder";

/** Characters a search needs before it asks the server */
export const VALUE_SEARCH_MIN_CHARS = 2;
/** Quiet time after the last key before the search is sent */
export const VALUE_SEARCH_DEBOUNCE_MS = 250;
/** Results listed per entity type */
export const VALUE_SEARCH_PER_TYPE = 5;

/**
 * The entity types a name is searched in, each with its query key. A
 * scene's title is no value to filter by (and its search is not cheap),
 * playlists have no `/minimal` endpoint, images no name.
 */
const SEARCH_KEYS = {
  tags: queryKeys.tags.search,
  performers: queryKeys.performers.search,
  studios: queryKeys.studios.search,
  groups: queryKeys.groups.search,
  galleries: queryKeys.galleries.search,
} as const;

type SearchedType = keyof typeof SEARCH_KEYS;

const isSearched = (
  entityType: string | undefined
): entityType is SearchedType =>
  entityType !== undefined &&
  Object.prototype.hasOwnProperty.call(SEARCH_KEYS, entityType);

/** An entity a search found, as a filter value: its `"id:instanceId"` and name */
export interface ValueResult {
  readonly ref: string;
  readonly name: string;
}

/** What one entity type found, under the field that names it ("Tags") */
export interface ValueGroup {
  readonly field: FilterOption;
  readonly results: readonly ValueResult[];
}

/**
 * The first free ref row of each searchable entity type, in panel order: it
 * names the type's results ("Tags", not "Performer Tags") and takes the pick.
 */
function sourcesOf(options: readonly FilterOption[]): FilterOption[] {
  const seen = new Set<string>();
  const sources: FilterOption[] = [];
  for (const option of options) {
    if (option.type !== "searchable-select") continue;
    if (!isSearched(option.entityType) || seen.has(option.entityType)) continue;
    seen.add(option.entityType);
    sources.push(option);
  }
  return sources;
}

/**
 * The entities whose name matches what is typed in "+ Filter": two
 * characters or more, 250 ms after the last key, each searched entity type
 * asked once (not once per row) for its first five by name. The answers are
 * the entity's `/minimal` (the user's exclusions and instances applied by
 * the server, every result with its instance), kept under the entity's
 * query root so a hide, a restore or an instance change asks again and
 * logout clears them.
 *
 * Results show only for the text as typed: while a newer key waits out the
 * debounce, or the text is too short, nothing shows, so an answer for an
 * earlier text is never listed.
 *
 * @param options the list's free fields (a view-locked field is not one)
 * @param q what is typed; pass "" while nothing is searched
 */
export function useValueSearch(
  options: readonly FilterOption[],
  q: string
): ValueGroup[] {
  const typed = q.trim();
  const settled = useDebouncedValue(typed, VALUE_SEARCH_DEBOUNCE_MS);
  const { ready } = useLibraryReady();
  const sources = useMemo(() => sourcesOf(options), [options]);
  const asking = settled.length >= VALUE_SEARCH_MIN_CHARS && ready;

  const found = useQueries({
    queries: sources.map((source) => {
      const entityType = source.entityType as SearchedType;
      return {
        queryKey: SEARCH_KEYS[entityType](settled),
        enabled: asking,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          minimalFinder(entityType)?.(
            { filter: { q: settled, per_page: VALUE_SEARCH_PER_TYPE } },
            signal
          ) ?? Promise.resolve<MinimalEntity[]>([]),
      };
    }),
    combine: (results) => results.map((result) => result.data),
  });

  return useMemo(() => {
    if (typed.length < VALUE_SEARCH_MIN_CHARS || typed !== settled) return [];
    return sources.flatMap((source, at) => {
      const entities = found[at] ?? [];
      return entities.length === 0
        ? []
        : [
            {
              field: source,
              results: entities
                .slice(0, VALUE_SEARCH_PER_TYPE)
                .map((entity) => ({
                  ref: makeCompositeKey(entity.id, entity.instanceId),
                  name: entity.name,
                })),
            },
          ];
    });
  }, [typed, settled, sources, found]);
}
