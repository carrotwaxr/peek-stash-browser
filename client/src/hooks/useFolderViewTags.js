// client/src/hooks/useFolderViewTags.js
import { useState, useEffect, useRef } from "react";
import { libraryApi } from "../services/api.js";

/**
 * Hook to fetch all tags with hierarchy for folder view.
 * Only fetches when folder view is active.
 */
export function useFolderViewTags(isActive) {
  const [tags, setTags] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!isActive || fetchedRef.current) return;

    const fetchTags = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await libraryApi.findTags({
          filter: {
            per_page: -1,
            sort: "name",
            direction: "ASC",
          },
        });

        const fetchedTags = result?.findTags?.tags || [];
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
  }, [isActive]);

  return { tags, isLoading, error };
}
