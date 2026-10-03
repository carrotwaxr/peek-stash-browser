/**
 * Where a custom carousel's "See More" opens: the Scenes list holding the
 * carousel's rules as its panel filters
 */
import {
  SCENE_FILTER_OPTIONS,
  carouselRulesToFilterState,
} from "./filterConfig";
import { buildSearchParams } from "./urlParams";

/**
 * Build a "See More" URL for a custom carousel from its rules: the where
 * tree the server serves, or the flat rules the builder sends
 */
export const buildCustomCarouselUrl = (
  rules: object | null | undefined,
  sort: string | undefined,
  direction: string | undefined
): string => {
  if (!rules || typeof rules !== "object") {
    return "/scenes";
  }

  // The rules the scene panel can show; a rule it cannot is left out
  const { state } = carouselRulesToFilterState(rules);

  // Build URL params using existing utility
  const params = buildSearchParams({
    searchText: "",
    sortField: sort === undefined || sort === "" ? "random" : sort,
    sortDirection:
      direction === undefined || direction === "" ? "DESC" : direction,
    currentPage: 1,
    perPage: 24,
    filters: state,
    filterOptions: SCENE_FILTER_OPTIONS,
    viewMode: "grid",
    zoomLevel: "medium",
    gridDensity: "medium",
    timelinePeriod: null,
  });

  const queryString = params.toString();
  return queryString ? `/scenes?${queryString}` : "/scenes";
};
