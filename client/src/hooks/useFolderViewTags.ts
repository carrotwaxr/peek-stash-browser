// client/src/hooks/useFolderViewTags.js
import { useState, useEffect, useRef, useMemo } from "react";
import { libraryApi } from "../api";
import { apiPost } from "../api";

/**
 * Hook to fetch all tags with hierarchy for folder view.
 * Only fetches when folder view is active.
 */
interface FolderViewFilters {
  performerId?: string;
  tagId?: string;
  studioId?: string;
  groupId?: string;
}

export function useFolderViewTags(isActive: boolean, filters: FolderViewFilters | null = null) {
  const [tags, setTags] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const fetchedRef = useRef(false);

  // Memoize filter key to prevent unnecessary refetches
  const filterKey = useMemo(() => {
    if (!filters) return null;
    return JSON.stringify(filters);
  }, [filters]);

  // Track last filter key
  const lastFilterKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Reset fetched flag if filters change
    if (filterKey !== lastFilterKeyRef.current) {
      fetchedRef.current = false;
      lastFilterKeyRef.current = filterKey;
    }

    if (!isActive || fetchedRef.current) return;

    const fetchTags = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let fetchedTags;

        // Use filtered endpoint if filters are provided
        if (filters && (filters.performerId || filters.tagId || filters.studioId || filters.groupId)) {
          const result = await apiPost("/library/tags/for-scenes", {
            performerId: filters.performerId,
            tagId: filters.tagId,
            studioId: filters.studioId,
            groupId: filters.groupId,
          }) as any;
          fetchedTags = result?.tags || [];
        } else {
          // Fetch all tags (existing behavior)
          const result = await libraryApi.findTags({
            filter: {
              per_page: -1,
              sort: "name",
              direction: "ASC",
            },
          }) as any;
          fetchedTags = result?.findTags?.tags || [];
        }

        setTags(fetchedTags);
        fetchedRef.current = true;
      } catch (err) {
        console.error("Failed to fetch tags for folder view:", err);
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterKey = JSON.stringify(filters) captures all filter changes
  }, [isActive, filterKey]);

  return { tags, isLoading, error };
}
