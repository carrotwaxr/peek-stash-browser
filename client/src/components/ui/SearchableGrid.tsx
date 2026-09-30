import { type ReactNode, useCallback, useMemo } from "react";
import { type UseQueryResult, useQueryClient } from "@tanstack/react-query";
import type { LibrarySearchParams } from "../../api";
import {
  useGalleryList,
  useGroupList,
  usePerformerList,
  useStudioList,
} from "../../api/hooks";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import { queryKeys } from "../../api/queryKeys";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext";
import {
  useFilterOptions,
  useListDefaults,
  useLockedFields,
} from "../../hooks/useListOptions";
import { useListUrlState } from "../../hooks/useListUrlState";
import { makeCompositeKey } from "../../utils/compositeKey";
import { buildListQuery, sortOptionsFor } from "../../utils/listQuery";
import SearchControls from "./SearchControls";
import SearchResults from "./SearchResults";

/** The entities a detail tab lists through this grid */
type EntityType = "performer" | "gallery" | "group" | "studio";

/** A card's hide callback: the hidden entity, its type and its instance */
type CardHideHandler = (
  entityId: string,
  entityType: string,
  instanceId?: string
) => void;

export interface SearchableGridProps {
  entityType: EntityType;
  lockedFilters?: Record<string, unknown>;
  hideLockedFilters?: boolean;
  renderItem: (
    item: unknown,
    index: number,
    helpers: {
      /**
       * The card's `onHideSuccess`, one function for the whole grid: drops
       * the hidden item, the id on that instance, not its namesakes
       */
      onHideSuccess: CardHideHandler;
    }
  ) => ReactNode;
  defaultSort?: string;
  emptyMessage?: string;
  emptyDescription?: string;
  skeletonCount?: number;
  density?: "small" | "medium" | "large";
}

type ListResult = UseQueryResult;
type ListRequest = Record<string, unknown> | null;

/**
 * Each entity's list hook, its query key and where its response holds the
 * page. The hooks share one shape, so the one an instance calls never changes
 * the hook order.
 */
const LISTS: Record<
  EntityType,
  {
    useList: (request: ListRequest) => ListResult;
    listKey: (params: Record<string, unknown>) => readonly unknown[];
    result: string;
    items: string;
  }
> = {
  performer: {
    useList: (request) =>
      usePerformerList(request as LibrarySearchParams<"performer"> | null),
    listKey: (params) => queryKeys.performers.list(undefined, params),
    result: "findPerformers",
    items: "performers",
  },
  gallery: {
    useList: (request) =>
      useGalleryList(request as LibrarySearchParams<"gallery"> | null),
    listKey: (params) => queryKeys.galleries.list(undefined, params),
    result: "findGalleries",
    items: "galleries",
  },
  group: {
    useList: (request) =>
      useGroupList(request as LibrarySearchParams<"group"> | null),
    listKey: (params) => queryKeys.groups.list(undefined, params),
    result: "findGroups",
    items: "groups",
  },
  studio: {
    useList: (request) =>
      useStudioList(request as LibrarySearchParams<"studio"> | null),
    listKey: (params) => queryKeys.studios.list(undefined, params),
    result: "findStudios",
    items: "studios",
  },
};

type Row = Record<string, unknown>;
type ListPage = Record<string, { count?: number } & Record<string, unknown>>;

const NO_ROWS: Row[] = [];
const NO_LOCKS: Record<string, unknown> = {};
const GRID_ONLY = ["grid"] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The panel's query with a detail tab's locked criteria (a tag page's
 * `performer_filter.tags`) merged into the filter the panel built, so a
 * filter set in the tab's panel still applies; on the same field the locked
 * criterion wins.
 */
function withLockedFilters(
  query: Record<string, unknown>,
  lockedFilters: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...query };
  for (const [key, locked] of Object.entries(lockedFilters)) {
    const fromPanel = merged[key];
    merged[key] =
      isPlainObject(fromPanel) && isPlainObject(locked)
        ? { ...fromPanel, ...locked }
        : locked;
  }
  return merged;
}

/**
 * A detail tab's list (a studio's Performers, a tag's Galleries): its state
 * in the URL, its page through the entity's list hook and the query cache,
 * so a slower earlier response never replaces a later one.
 */
export const SearchableGrid = ({
  entityType,
  lockedFilters = NO_LOCKS,
  hideLockedFilters = false,
  renderItem,
  defaultSort = "name",
  emptyMessage,
  emptyDescription,
  skeletonCount = 24,
  density = "medium",
}: SearchableGridProps) => {
  const list = LISTS[entityType];
  const queryClient = useQueryClient();
  const { unitPreference } = useUnitPreference();
  const filterOptions = useFilterOptions(entityType);
  const lockedFields = useLockedFields(entityType, lockedFilters);
  const defaults = useListDefaults(entityType, defaultSort);
  const sortOptions = useCallback(
    (filters: Record<string, unknown>) => sortOptionsFor(entityType, filters),
    [entityType]
  );

  const listState = useListUrlState({
    entityType,
    filterOptions,
    sortOptions,
    viewModes: GRID_ONLY,
    defaults,
    permanentFilters: lockedFilters,
    lockedFields,
  });

  const { ready, filters, sort, page, perPage, q } = listState;
  const request = useMemo(() => {
    const query = buildListQuery(
      entityType,
      { ready, filters, sort, page, perPage, q },
      lockedFilters,
      unitPreference
    );
    return query ? withLockedFilters(query, lockedFilters) : null;
  }, [
    entityType,
    ready,
    filters,
    sort,
    page,
    perPage,
    q,
    lockedFilters,
    unitPreference,
  ]);

  const { data, error, isPending, isPlaceholderData, refetch } =
    list.useList(request);
  const response = (data as ListPage | undefined)?.[list.result];
  const items = (response?.[list.items] as Row[] | undefined) ?? NO_ROWS;
  const totalCount = response?.count ?? 0;
  const totalPages = Math.ceil(totalCount / perPage);
  // The library is on its first sync: loading, not an error
  const initializing = isLibraryInitializing(error);

  // Drops the hidden item from this page's cached result; the hide's own
  // invalidation refetches the lists afterwards
  const handleHideSuccess = useCallback<CardHideHandler>(
    (entityId, _entityType, instanceId) => {
      if (!request) return;
      const hidden = makeCompositeKey(entityId, instanceId);
      queryClient.setQueryData<ListPage>(list.listKey(request), (old) => {
        const current = old?.[list.result];
        const rows = current?.[list.items] as Row[] | undefined;
        if (!old || !current || !rows) return old;
        const kept = rows.filter(
          (row) =>
            makeCompositeKey(
              row.id as string,
              row.instanceId as string | undefined
            ) !== hidden
        );
        if (kept.length === rows.length) return old;
        return {
          ...old,
          [list.result]: {
            ...current,
            [list.items]: kept,
            count: Math.max(0, (current.count ?? 0) - 1),
          },
        };
      });
    },
    [queryClient, list, request]
  );
  const helpers = useMemo(
    () => ({ onHideSuccess: handleHideSuccess }),
    [handleHideSuccess]
  );

  return (
    <SearchControls
      artifactType={entityType}
      listState={listState}
      permanentFilters={lockedFilters}
      permanentFiltersMetadata={hideLockedFilters ? NO_LOCKS : lockedFilters}
      totalPages={totalPages}
      totalCount={totalCount}
      isRefreshing={isPlaceholderData}
    >
      <SearchResults
        entityType={entityType}
        density={density}
        items={items}
        renderItem={(item, index) => renderItem(item, index, helpers)}
        loading={isPending || initializing}
        error={initializing ? null : error}
        onRetry={() => void refetch()}
        emptyMessage={emptyMessage || `No ${entityType}s found`}
        emptyDescription={emptyDescription}
        skeletonCount={skeletonCount}
      />
    </SearchControls>
  );
};

export default SearchableGrid;
