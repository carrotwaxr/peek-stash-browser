import { useState, useCallback, useMemo } from "react";

/**
 * Custom hook for managing sorting and filtering state
 */
export const useSortAndFilter = (
  initialSort = "",
  entityType = "scene",
  permanentSceneFilters = {}
) => {
  const [sort, setSort] = useState(initialSort);
  const [sortDirection, setSortDirection] = useState("DESC");
  const [filters, setFilters] = useState({ ...permanentSceneFilters });
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Handle sort change
  const handleSortChange = useCallback(
    (newSort) => {
      if (newSort === sort) {
        // If same field, toggle direction
        setSortDirection((prev) => (prev === "ASC" ? "DESC" : "ASC"));
      } else {
        // New field, default to ASC
        setSort(newSort);
        setSortDirection("ASC");
      }
    },
    [sort]
  );

  // Handle filter change
  const handleFilterChange = useCallback((filterKey, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterKey]: value === "" ? undefined : value,
    }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({});
    setIsFilterPanelOpen(false);
  }, []);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some(
      (value) =>
        value !== undefined &&
        value !== "" &&
        (typeof value !== "object" ||
          Object.values(value).some((v) => v !== "" && v !== undefined))
    );
  }, [filters]);

  // Toggle filter panel
  const toggleFilterPanel = useCallback(() => {
    setIsFilterPanelOpen((prev) => !prev);
  }, []);

  // Build the query object for API calls
  const buildQuery = useCallback(
    (page = 1, perPage = 24) => {
      const query = {
        filter: {
          page,
          per_page: perPage,
        },
      };

      // Add sorting
      if (sort) {
        query.filter.sort = sort;
        query.filter.direction = sortDirection;
      }

      // Add entity-specific filter
      const filterKey = `${entityType}_filter`;
      query[filterKey] = {};

      // This will be populated by the specific entity filter builders
      return query;
    },
    [sort, sortDirection, entityType]
  );

  return {
    // Sort state
    sort,
    sortDirection,
    handleSortChange,

    // Filter state
    filters,
    handleFilterChange,
    clearFilters,
    hasActiveFilters,

    // Panel state
    isFilterPanelOpen,
    toggleFilterPanel,

    // Query builder
    buildQuery,
  };
};
