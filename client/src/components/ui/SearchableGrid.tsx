import { type ReactNode, useCallback, useMemo, useState } from "react";
import deepEqual from "fast-deep-equal";
import { libraryApi } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import { makeCompositeKey } from "../../utils/compositeKey";
import SearchControls from "./SearchControls";
import SearchResults from "./SearchResults";

type EntityType =
  | "scene"
  | "performer"
  | "gallery"
  | "group"
  | "studio"
  | "tag"
  | "image";

export interface SearchableGridProps {
  entityType: EntityType;
  lockedFilters?: Record<string, unknown>;
  hideLockedFilters?: boolean;
  renderItem: (
    item: unknown,
    index: number,
    helpers: {
      /** Drops the hidden item: the id on that instance, not its namesakes */
      onHideSuccess: (entityId: string, instanceId?: string) => void;
    }
  ) => ReactNode;
  defaultSort?: string;
  defaultFilters?: Record<string, unknown>;
  onResultsChange?: (results: { items: unknown[]; count: number }) => void;
  emptyMessage?: string;
  emptyDescription?: string;
  skeletonCount?: number;
  density?: "small" | "medium" | "large";
}

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

export const SearchableGrid = ({
  entityType,
  lockedFilters = {},
  hideLockedFilters = false,
  renderItem,
  defaultSort = "name",

  defaultFilters: _defaultFilters = {},
  onResultsChange,
  emptyMessage,
  emptyDescription,
  skeletonCount = 24,
  density = "medium",
}: SearchableGridProps) => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [lastQuery, setLastQuery] = useState<Record<string, unknown> | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<Array<Record<string, unknown>>>([]);
  const [totalCount, setTotalCount] = useState(0);

  // API method and key mappings (memoized to avoid recreating on each render)
  const { apiMethod, responseKey, dataKey } = useMemo(() => {
    const apiMethods = {
      scene: "findScenes",
      performer: "findPerformers",
      gallery: "findGalleries",
      group: "findGroups",
      studio: "findStudios",
      tag: "findTags",
      image: "findImages",
    };

    const responseKeys = {
      scene: "findScenes",
      performer: "findPerformers",
      gallery: "findGalleries",
      group: "findGroups",
      studio: "findStudios",
      tag: "findTags",
      image: "findImages",
    };

    const dataKeys = {
      scene: "scenes",
      performer: "performers",
      gallery: "galleries",
      group: "groups",
      studio: "studios",
      tag: "tags",
      image: "images",
    };

    return {
      apiMethod: apiMethods[entityType],
      responseKey: responseKeys[entityType],
      dataKey: dataKeys[entityType],
    };
  }, [entityType]);

  const handleQueryChange = useCallback(
    async (newQuery: Record<string, unknown>) => {
      if (isAuthLoading || !isAuthenticated) {
        return;
      }

      const mergedQuery = withLockedFilters(newQuery, lockedFilters);

      // Avoid duplicate queries
      if (lastQuery && deepEqual(mergedQuery, lastQuery)) {
        return;
      }

      try {
        setIsLoading(true);
        setLastQuery(mergedQuery);
        setError(null);

        const fetchPage = (
          libraryApi as unknown as Record<
            string,
            (
              params: unknown
            ) => Promise<Record<string, Record<string, unknown>>>
          >
        )[apiMethod];
        if (!fetchPage) {
          throw new Error(`Unknown library method: ${apiMethod}`);
        }
        const result = await fetchPage(mergedQuery);
        const items = (result[responseKey]?.[dataKey] || []) as Array<
          Record<string, unknown>
        >;
        const count = (result[responseKey]?.count || 0) as number;

        setData(items);
        setTotalCount(count);
        onResultsChange?.({ items, count });
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    },
    [
      apiMethod,
      responseKey,
      dataKey,
      lockedFilters,
      lastQuery,
      isAuthLoading,
      isAuthenticated,
      onResultsChange,
    ]
  );

  // Handle successful hide - remove item from local state
  const handleHideSuccess = useCallback(
    (entityId: string, instanceId?: string) => {
      const hidden = makeCompositeKey(entityId, instanceId);
      setData((prevData) =>
        prevData.filter(
          (item) =>
            makeCompositeKey(
              item.id as string,
              item.instanceId as string | undefined
            ) !== hidden
        )
      );
      setTotalCount((prevCount) => Math.max(0, prevCount - 1));
    },
    []
  );

  // Calculate pagination
  const currentPerPage =
    ((lastQuery?.filter as Record<string, unknown> | undefined)
      ?.per_page as number) || 24;
  const totalPages = Math.ceil(totalCount / currentPerPage);

  // Build filter key for locked filters if we need to hide them
  const permanentFiltersMetadata = hideLockedFilters ? {} : lockedFilters;

  return (
    <SearchControls
      artifactType={entityType}
      initialSort={defaultSort}
      onQueryChange={(newQuery) => void handleQueryChange(newQuery)}
      permanentFilters={lockedFilters}
      permanentFiltersMetadata={permanentFiltersMetadata}
      totalPages={totalPages}
      totalCount={totalCount}
    >
      <SearchResults
        entityType={entityType}
        density={density}
        items={data}
        renderItem={(item, index) =>
          renderItem(item, index, { onHideSuccess: handleHideSuccess })
        }
        loading={isLoading}
        error={error}
        emptyMessage={emptyMessage || `No ${entityType}s found`}
        emptyDescription={emptyDescription}
        skeletonCount={skeletonCount}
        currentPage={
          ((lastQuery?.filter as Record<string, unknown> | undefined)
            ?.page as number) || 1
        }
        totalPages={totalPages}
        onPageChange={() => {
          // SearchControls manages pagination state, but we pass it through for SearchResults to render
          // The actual page change is handled by SearchControls
        }}
      />
    </SearchControls>
  );
};

export default SearchableGrid;
