import { useCallback, useMemo, useState } from "react";
import deepEqual from "fast-deep-equal";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import SearchResults from "./SearchResults.jsx";
import SearchControls from "./SearchControls.jsx";

/**
 * SearchableGrid - SearchResults with integrated search controls and data fetching
 *
 * @param {Object} props
 * @param {'scene'|'performer'|'gallery'|'group'|'studio'|'tag'|'image'} props.entityType
 * @param {Object} [props.lockedFilters] - Filters that cannot be changed by user
 * @param {boolean} [props.hideLockedFilters] - Hide locked filters from UI
 * @param {Function} props.renderItem - Function to render each item
 * @param {Object} [props.defaultSort] - Default sort configuration
 * @param {Object} [props.defaultFilters] - Default filters
 * @param {Function} [props.onResultsChange] - Callback when results change
 * @param {string} [props.emptyMessage] - Empty state message
 * @param {string} [props.emptyDescription] - Empty state description
 * @param {number} [props.skeletonCount] - Number of skeleton items during loading
 * @param {boolean} [props.syncToUrl] - Whether to sync state to URL (default: true)
 * @param {string} [props.density] - Grid density level ('small', 'medium', 'large')
 */
export const SearchableGrid = ({
  entityType,
  lockedFilters = {},
  hideLockedFilters = false,
  renderItem,
  defaultSort = "name",
  // eslint-disable-next-line no-unused-vars
  defaultFilters: _defaultFilters = {},
  onResultsChange,
  emptyMessage,
  emptyDescription,
  skeletonCount = 24,
  syncToUrl = true,
  density = "medium",
}) => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
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
    async (newQuery) => {
      if (isAuthLoading || !isAuthenticated) {
        return;
      }

      // Merge locked filters into query
      const mergedQuery = {
        ...newQuery,
        ...lockedFilters,
      };

      // Avoid duplicate queries
      if (lastQuery && deepEqual(mergedQuery, lastQuery)) {
        return;
      }

      try {
        setIsLoading(true);
        setLastQuery(mergedQuery);
        setError(null);

        const result = await libraryApi[apiMethod](mergedQuery);
        const items = result[responseKey]?.[dataKey] || [];
        const count = result[responseKey]?.count || 0;

        setData(items);
        setTotalCount(count);
        onResultsChange?.({ items, count });
      } catch (err) {
        setError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [apiMethod, responseKey, dataKey, lockedFilters, lastQuery, isAuthLoading, isAuthenticated, onResultsChange]
  );

  // Handle successful hide - remove item from local state
  const handleHideSuccess = useCallback((entityId) => {
    setData((prevData) => prevData.filter((item) => item.id !== entityId));
    setTotalCount((prevCount) => Math.max(0, prevCount - 1));
  }, []);

  // Calculate pagination
  const currentPerPage = lastQuery?.filter?.per_page || 24;
  const totalPages = Math.ceil(totalCount / currentPerPage);

  // Build filter key for locked filters if we need to hide them
  const permanentFiltersMetadata = hideLockedFilters ? {} : lockedFilters;

  return (
    <SearchControls
      artifactType={entityType}
      initialSort={defaultSort}
      onQueryChange={handleQueryChange}
      permanentFilters={lockedFilters}
      permanentFiltersMetadata={permanentFiltersMetadata}
      totalPages={totalPages}
      totalCount={totalCount}
      syncToUrl={syncToUrl}
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
        currentPage={lastQuery?.filter?.page || 1}
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
