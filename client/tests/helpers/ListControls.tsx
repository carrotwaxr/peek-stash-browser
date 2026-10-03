import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import deepEqual from "fast-deep-equal";
import SearchControls from "@/components/ui/SearchControls";
import {
  useFilterOptions,
  useListDefaults,
  useLockedFields,
} from "@/hooks/useListOptions";
import {
  type UseListUrlStateOptions,
  useListUrlState,
} from "@/hooks/useListUrlState";
import {
  type ListQuery,
  buildListQuery,
  sortOptionsFor,
} from "@/utils/listQuery";
import type { ListEntity } from "@/utils/urlParams";

const NO_FILTERS: Record<string, unknown> = {};

export type ListControlsProps = Omit<
  ComponentProps<typeof SearchControls>,
  "listState"
> & {
  /** The entity's default sort */
  initialSort?: string;
  /** Each new request the list's state builds, as a page would send it */
  onQueryChange?: (query: ListQuery) => void;
  /** The view's own filters (the timeline's date, the open folder's tags) */
  viewFilters?: UseListUrlStateOptions["viewFilters"];
};

/**
 * `SearchControls` as a list page holds it: the list's state from the URL
 * (`useListUrlState`) with the page's permanent filters locked and the
 * view's own (`viewFilters`) merged in, and the request built from it
 * (`buildListQuery`), reported once per change
 */
export function ListControls({
  initialSort = "o_counter",
  onQueryChange,
  viewFilters,
  ...props
}: ListControlsProps) {
  const {
    artifactType = "scene",
    context,
    permanentFilters: pageFilters = NO_FILTERS,
    viewModes,
  } = props;
  const entity = artifactType as ListEntity;
  const filterOptions = useFilterOptions(artifactType);
  const lockedFields = useLockedFields(artifactType, pageFilters);
  const defaults = useListDefaults(artifactType, initialSort);
  const viewModeIds = useMemo(
    () => (viewModes ? viewModes.map((mode) => mode.id) : ["grid"]),
    [viewModes]
  );
  const sortOptions = useCallback(
    (filters: Record<string, unknown>) => sortOptionsFor(artifactType, filters),
    [artifactType]
  );

  const listState = useListUrlState({
    entityType: entity,
    ...(context ? { context } : {}),
    filterOptions,
    sortOptions,
    viewModes: viewModeIds,
    defaults,
    permanentFilters: pageFilters,
    lockedFields,
    ...(viewFilters ? { viewFilters } : {}),
  });

  const { ready, filters, sort, page, perPage, q, permanentFilters } =
    listState;
  const query = useMemo(
    () =>
      buildListQuery(
        entity,
        { ready, filters, sort, page, perPage, q },
        permanentFilters
      ),
    [entity, ready, filters, sort, page, perPage, q, permanentFilters]
  );

  const lastSentRef = useRef<ListQuery | null>(null);
  useEffect(() => {
    if (!query || !onQueryChange) return;
    if (lastSentRef.current && deepEqual(lastSentRef.current, query)) return;
    lastSentRef.current = query;
    onQueryChange(query);
  }, [query, onQueryChange]);

  return (
    <SearchControls
      {...props}
      permanentFilters={permanentFilters}
      listState={listState}
    />
  );
}
