import { type ReactNode, useCallback, useMemo } from "react";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import {
  useFilterOptions,
  useFiltersByContent,
  useListDefaults,
  useLockedFields,
} from "../../hooks/useListOptions";
import { useListUrlState } from "../../hooks/useListUrlState";
import { buildListQuery, sortOptionsFor } from "../../utils/listQuery";
import {
  type CardHideHandler,
  LIST_SOURCES,
  pickPage,
  useHideFromList,
} from "../list/listSources";
import SearchControls from "./SearchControls";
import SearchResults from "./SearchResults";

/** The entities a detail tab lists through this grid */
type EntityType = "performer" | "gallery" | "group" | "studio";

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
  lockedFilters: pageLockedFilters,
  hideLockedFilters = false,
  renderItem,
  defaultSort = "name",
  emptyMessage,
  emptyDescription,
  skeletonCount = 24,
  density = "medium",
}: SearchableGridProps) => {
  const list = LIST_SOURCES[entityType];
  // A detail page passes its lock inline: an equal lock on a re-render is
  // the same object, so the list state and the request keep theirs
  const lockedFilters = useFiltersByContent(pageLockedFilters);
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
      lockedFilters
    );
    return query ? withLockedFilters(query, lockedFilters) : null;
  }, [entityType, ready, filters, sort, page, perPage, q, lockedFilters]);

  const { data, error, isPending, isPlaceholderData, refetch } =
    list.useList(request);
  const { items, count: totalCount } = pickPage(list, data);
  const totalPages = Math.ceil(totalCount / perPage);
  // The library is on its first sync: loading, not an error
  const initializing = isLibraryInitializing(error);
  // An empty placeholder (the previous query's) is no answer to this one
  const loading =
    isPending || initializing || (isPlaceholderData && items.length === 0);

  const handleHideSuccess = useHideFromList(list, request);
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
        loading={loading}
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
