/**
 * Where a custom carousel's "See More" opens: the Scenes list holding the
 * carousel's rules as its filters, groups and repeated rows included
 */
import { PANEL_FIELDS } from "@peek/shared-types";
import { carouselRulesToFilterState } from "./filterConfig";
import { writeTreeUrl } from "./filterFields";
import { buildSearchParams } from "./urlParams";

/**
 * Build a "See More" URL for a custom carousel from its rules: the where
 * tree the server serves, or a flat rule set stored before 9b. The rules
 * are written as the Scenes list's URL writes its filters (`writeTreeUrl`),
 * then the carousel's sort and the list's presentation params; a carousel
 * with only root rows gives the URL it gave before groups. A leaf no scene
 * row can read is left out.
 */
export const buildCustomCarouselUrl = (
  rules: object | null | undefined,
  sort: string | undefined,
  direction: string | undefined
): string => {
  if (!rules || typeof rules !== "object") {
    return "/scenes";
  }

  const { state } = carouselRulesToFilterState(rules);
  const params = new URLSearchParams();
  writeTreeUrl("scene", PANEL_FIELDS.scene, state, params);

  // The presentation params, as a Scenes list without filters writes them
  const presentation = buildSearchParams({
    searchText: "",
    sortField: sort === undefined || sort === "" ? "random" : sort,
    sortDirection:
      direction === undefined || direction === "" ? "DESC" : direction,
    currentPage: 1,
    perPage: 24,
    filters: {},
    filterOptions: [],
    viewMode: "grid",
    zoomLevel: "medium",
    gridDensity: "medium",
    timelinePeriod: null,
  });
  for (const [key, value] of presentation) params.append(key, value);

  const queryString = params.toString();
  return queryString ? `/scenes?${queryString}` : "/scenes";
};
