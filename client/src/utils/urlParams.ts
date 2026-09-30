/**
 * Utility functions for persisting filter/sort state to URL query parameters
 */
import {
  type ListKind,
  PER_PAGE_MAX,
  Q_MAX_LENGTH,
  UI_KEYS,
  type UiKey,
} from "@peek/shared-types";
import { makeCompositeKey, parseCompositeKey } from "./compositeKey";
import type { FilterOption } from "./filterConfig";

const DEFAULT_PER_PAGE = 24;

/**
 * Reads `per_page` from the URL: above the maximum it becomes the maximum;
 * missing, zero, negative or not a number it becomes the default.
 */
const parsePerPage = (value: string | null): number => {
  const num = parseInt(value ?? "", 10);
  if (isNaN(num) || num < 1) return DEFAULT_PER_PAGE;
  return Math.min(num, PER_PAGE_MAX);
};

interface SearchState {
  searchText: string;
  sortField: string;
  sortDirection: string;
  currentPage: number;
  perPage: number;
  filters: Record<string, unknown>;
  filterOptions: FilterOption[];
  viewMode: string;
  zoomLevel: string;
  gridDensity: string;
  timelinePeriod: string | null;
}

/**
 * Sets a filter value that has a URL form (a string, number or boolean). Any
 * other value would be written as "[object Object]" or "null", so it is left
 * out.
 */
const setParam = (params: URLSearchParams, key: string, value: unknown) => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    params.set(key, String(value));
  }
};

const filtersToUrlParams = (
  filters: Record<string, unknown>,
  filterOptions: readonly FilterOption[]
) => {
  const params = new URLSearchParams();

  filterOptions.forEach(({ key, type, multi, modifierKey, hierarchyKey }) => {
    const value = filters[key];

    if (value === undefined || value === "" || value === false) {
      return; // Skip empty values
    }

    switch (type) {
      case "checkbox":
        if (value === true) {
          params.set(key, "true");
        }
        break;

      case "select":
      case "text":
        if (value) {
          setParam(params, key, value);
        }
        break;

      case "searchable-select":
        if (multi) {
          // Multi-select: serialize array as comma-separated string
          if (Array.isArray(value) && value.length > 0) {
            params.set(key, value.join(","));
          }
        } else {
          // Single select: just set the value
          if (value) {
            setParam(params, key, value);
          }
        }
        // Serialize modifier if present
        if (modifierKey && filters[modifierKey]) {
          setParam(params, modifierKey, filters[modifierKey]);
        }
        // Serialize hierarchy depth if present
        if (hierarchyKey && filters[hierarchyKey] !== undefined) {
          setParam(params, hierarchyKey, filters[hierarchyKey]);
        }
        break;

      case "range": {
        const rangeVal = value as Record<string, string> | null;
        if (rangeVal?.min) params.set(`${key}_min`, rangeVal.min);
        if (rangeVal?.max) params.set(`${key}_max`, rangeVal.max);
        break;
      }

      case "date-range": {
        const dateVal = value as Record<string, string> | null;
        if (dateVal?.start) params.set(`${key}_start`, dateVal.start);
        if (dateVal?.end) params.set(`${key}_end`, dateVal.end);
        break;
      }
    }
  });

  return params;
};

/**
 * The URL param that sets an entity filter to one entity: the option's key in
 * the singular (`tagIds` reads `tagId`; `studioId` and `sceneId` read
 * themselves). With the page's `instance` param it becomes "id:instance".
 * Card counts link to a list with it (`getFilteredListPath`).
 */
export const entityParamFor = (key: string) =>
  key.endsWith("Ids") ? key.slice(0, -1) : key;

/**
 * One entity from a singular param: joined with the page's `instance` param
 * into "id:instance", unless the value names its instance already (a
 * single-select filter's own value on a detail page, whose `instance` is the
 * page's entity).
 */
const entityRefFromParam = (value: string, instance: string | null) =>
  parseCompositeKey(value).instanceId === undefined
    ? makeCompositeKey(value, instance)
    : value;

/**
 * Deserialize URL query parameters to filter state. Only the page's own
 * options are read: a param for a filter the page does not have is ignored.
 *
 * @param {URLSearchParams} searchParams - URL search params
 * @param {Array} filterOptions - Filter configuration from filterConfig.js
 * @returns {Object} Filter state object
 */
const urlParamsToFilters = (
  searchParams: URLSearchParams,
  filterOptions: readonly FilterOption[]
) => {
  const filters: Record<string, unknown> = {};
  const instanceParam = searchParams.get("instance");

  filterOptions.forEach(({ key, type, multi, modifierKey, hierarchyKey }) => {
    switch (type) {
      case "checkbox":
        if (searchParams.has(key)) {
          filters[key] = searchParams.get(key) === "true";
        }
        break;

      case "select":
      case "text":
        if (searchParams.has(key)) {
          filters[key] = searchParams.get(key);
        }
        break;

      case "searchable-select": {
        // A card's count links with one entity and its instance
        // (/scenes?performerId=82&instance=abc-123 → performerIds:
        // ["82:abc-123"]); it wins over the option's own list
        const one = searchParams.get(entityParamFor(key));
        const value = searchParams.get(key);
        if (one) {
          const ref = entityRefFromParam(one, instanceParam);
          filters[key] = multi ? [ref] : ref;
        } else if (value !== null) {
          // A multi-select's value is a comma-separated list of refs, each
          // naming its own instance; a single-select's is one value
          filters[key] = multi ? value.split(",").filter(Boolean) : value;
        }
        const modifier = modifierKey ? searchParams.get(modifierKey) : null;
        if (modifierKey && modifier !== null) {
          filters[modifierKey] = modifier;
        }
        const depth = hierarchyKey ? searchParams.get(hierarchyKey) : null;
        if (hierarchyKey && depth !== null) {
          filters[hierarchyKey] = parseInt(depth, 10);
        }
        break;
      }

      case "range": {
        const min = searchParams.get(`${key}_min`);
        const max = searchParams.get(`${key}_max`);
        if (min || max) {
          const rangeObj: Record<string, string> = {};
          if (min) rangeObj.min = min;
          if (max) rangeObj.max = max;
          filters[key] = rangeObj;
        }
        break;
      }

      case "date-range": {
        const start = searchParams.get(`${key}_start`);
        const end = searchParams.get(`${key}_end`);
        if (start || end) {
          const dateObj: Record<string, string> = {};
          if (start) dateObj.start = start;
          if (end) dateObj.end = end;
          filters[key] = dateObj;
        }
        break;
      }
    }
  });

  return filters;
};

/**
 * Build complete URL search params from all state
 *
 * @param {Object} state - Complete search state
 * @param {string} state.searchText - Search query
 * @param {string} state.sortField - Sort field
 * @param {string} state.sortDirection - Sort direction (ASC/DESC)
 * @param {number} state.currentPage - Current page number
 * @param {number} state.perPage - Items per page
 * @param {Object} state.filters - Filter state object
 * @param {Array} state.filterOptions - Filter configuration
 * @param {string} state.viewMode - View mode (grid/wall)
 * @param {string} state.zoomLevel - Zoom level for wall view
 * @returns {URLSearchParams}
 */
export const buildSearchParams = ({
  searchText,
  sortField,
  sortDirection,
  currentPage,
  perPage,
  filters,
  filterOptions,
  viewMode,
  zoomLevel,
  gridDensity,
  timelinePeriod,
}: SearchState) => {
  const params = filtersToUrlParams(filters, filterOptions);

  if (searchText) params.set("q", searchText);
  if (sortField) params.set("sort", sortField);
  if (sortDirection) params.set("dir", sortDirection);
  if (currentPage > 1) params.set("page", currentPage.toString());
  if (perPage !== DEFAULT_PER_PAGE) params.set("per_page", perPage.toString());
  if (viewMode && viewMode !== "grid") params.set("view", viewMode);
  if (zoomLevel && zoomLevel !== "medium") params.set("zoom", zoomLevel);
  if (gridDensity && gridDensity !== "medium")
    params.set("grid_density", gridDensity);
  if (timelinePeriod) params.set("timeline_period", timelinePeriod);

  return params;
};

/**
 * Parse URL search params to complete search state
 *
 * @param {URLSearchParams} searchParams - URL search params
 * @param {Array} filterOptions - Filter configuration from filterConfig.js
 * @param {Object} defaults - Default values for search state
 * @returns {Object} Complete search state
 */
export const parseSearchParams = (
  searchParams: URLSearchParams,
  filterOptions: FilterOption[],
  defaults: Partial<SearchState> = {}
) => {
  return {
    searchText: searchParams.get("q") || defaults.searchText || "",
    sortField: searchParams.get("sort") || defaults.sortField || "o_counter",
    sortDirection: searchParams.get("dir") || defaults.sortDirection || "DESC",
    currentPage: parseInt(searchParams.get("page") || "1", 10),
    perPage: parsePerPage(searchParams.get("per_page")),
    viewMode: searchParams.get("view") || defaults.viewMode || "grid",
    zoomLevel: searchParams.get("zoom") || defaults.zoomLevel || "medium",
    gridDensity:
      searchParams.get("grid_density") || defaults.gridDensity || "medium",
    timelinePeriod:
      searchParams.get("timeline_period") || defaults.timelinePeriod || null,
    filters: {
      ...defaults.filters,
      ...urlParamsToFilters(searchParams, filterOptions),
    },
  };
};

// ── List state in the URL (useListUrlState) ───────────────────────────────

/** A list the URL holds the state of: the seven entity lists and clips */
export type ListEntity = ListKind;

/**
 * `filters=none`: the user cleared the filters, so the default preset's
 * filters stay off. Written by a filter change that leaves no filter, dropped
 * by the next one that sets any; never sent to the server.
 */
const NO_FILTERS_KEY = "filters";
const NO_FILTERS_VALUE = "none";

/** The keys every list owns beside its filters */
const LIST_STATE_KEYS = [
  NO_FILTERS_KEY,
  "q",
  "sort",
  "dir",
  "page",
  "per_page",
  "view",
  "zoom",
  "grid_density",
  "timeline_period",
  "folderPath",
] as const;

/** The forms a range or date option takes in the URL (`rating_min`, `date_start`) */
const RANGE_SUFFIXES = ["_min", "_max", "_start", "_end"] as const;

const filterKeysCache = new Map<ListEntity, readonly string[]>();

/**
 * The URL keys a list's filters take: each panel key of the entity's
 * `UI_KEYS`, its modifier and depth companions, the singular form a card count
 * links with (`tagId`) and the range and date forms (`rating_min`).
 */
const listFilterKeys = (entity: ListEntity): readonly string[] => {
  const cached = filterKeysCache.get(entity);
  if (cached) return cached;
  const keys = new Set<string>();
  const uiKeys: readonly UiKey[] = UI_KEYS[entity];
  for (const uiKey of uiKeys) {
    keys.add(uiKey.key);
    keys.add(entityParamFor(uiKey.key));
    if (uiKey.modifierKey) keys.add(uiKey.modifierKey);
    if (uiKey.hierarchyKey) keys.add(uiKey.hierarchyKey);
    for (const suffix of RANGE_SUFFIXES) keys.add(uiKey.key + suffix);
  }
  const list = [...keys];
  filterKeysCache.set(entity, list);
  return list;
};

/**
 * Every URL key a list writes: its filter keys, `q`, sort, paging and
 * presentation, the timeline period and the folder path. A list rewrites
 * only these and keeps every other key (`tab`, `instance`,
 * `includeSubTags`, `includeSubStudios`, `image`).
 */
export const listOwnedKeys = (entity: ListEntity): readonly string[] => [
  ...listFilterKeys(entity),
  ...LIST_STATE_KEYS,
];

/** The keys any list owns: what a detail page's tab switch clears */
export const LIST_OWNED_KEYS: readonly string[] = [
  ...new Set(
    (Object.keys(UI_KEYS) as ListEntity[]).flatMap((entity) =>
      listOwnedKeys(entity)
    )
  ),
];

/**
 * The URL a detail page's tab switch goes to: every key a list owns
 * (filters, search, sort, paging, presentation, folder path) and the open
 * image go, since each tab is its own list; `tab` is set, or removed for
 * the default tab; every other key (`instance`, `includeSubTags`,
 * `includeSubStudios`) stays. Returns a new object.
 */
export const switchTabParams = (
  params: URLSearchParams,
  tabId: string,
  defaultTab: string
): URLSearchParams => {
  const next = new URLSearchParams(params);
  for (const key of LIST_OWNED_KEYS) next.delete(key);
  next.delete("image");
  if (tabId === defaultTab) {
    next.delete("tab");
  } else {
    next.set("tab", tabId);
  }
  return next;
};

/** A list's state as the URL holds it; a field the URL lacks is null */
export interface ListUrlParams {
  /** The page's filters the URL names (panel shape) */
  filters: Record<string, unknown>;
  /**
   * The URL names a filter, a search or `filters=none`, so the default
   * preset's filters stay off
   */
  hasFilters: boolean;
  /** At most Q_MAX_LENGTH characters */
  q: string | null;
  sort: string | null;
  dir: string | null;
  /** 1 when missing or below 1 */
  page: number;
  /** Clamped to 1 to PER_PAGE_MAX */
  perPage: number | null;
  view: string | null;
  zoom: string | null;
  gridDensity: string | null;
  timelinePeriod: string | null;
  folderPath: string[];
}

/**
 * Reads a list's state from the URL, each field with its presence. The
 * filters go through the one parser (`urlParamsToFilters`); "the URL has
 * filters" means it holds one of the entity's filter keys, `q` or
 * `filters=none`.
 */
export const readListParams = (
  searchParams: URLSearchParams,
  entity: ListEntity,
  filterOptions: readonly FilterOption[]
): ListUrlParams => {
  // A key present but empty reads as missing
  const param = (key: string) => {
    const value = searchParams.get(key);
    return value === null || value === "" ? null : value;
  };
  const q = param("q")?.slice(0, Q_MAX_LENGTH) ?? null;
  const page = parseInt(searchParams.get("page") ?? "", 10);
  const folderPath = param("folderPath");
  return {
    filters: urlParamsToFilters(searchParams, filterOptions),
    hasFilters:
      q !== null ||
      searchParams.get(NO_FILTERS_KEY) === NO_FILTERS_VALUE ||
      listFilterKeys(entity).some((key) => searchParams.has(key)),
    q,
    sort: param("sort"),
    dir: param("dir"),
    page: isNaN(page) || page < 1 ? 1 : page,
    perPage: searchParams.has("per_page")
      ? parsePerPage(searchParams.get("per_page"))
      : null,
    view: param("view"),
    zoom: param("zoom"),
    gridDensity: param("grid_density"),
    timelinePeriod: param("timeline_period"),
    folderPath: folderPath ? folderPath.split(",").filter(Boolean) : [],
  };
};

/** The fields a list setter changes; a field left out keeps its URL keys */
export interface ListParamsPatch {
  /** The panel's filters (permanent filters never go in the URL) */
  filters?: Record<string, unknown>;
  q?: string;
  /** The URL's `sort` value: a field, or `random_<seed>` */
  sort?: string;
  direction?: string;
  page?: number;
  perPage?: number;
  viewMode?: string;
  zoomLevel?: string;
  gridDensity?: string;
  timelinePeriod?: string | null;
  folderPath?: readonly string[];
}

export interface WriteListContext {
  entity: ListEntity;
  filterOptions: readonly FilterOption[];
  /**
   * What the page shows without a presentation key: the default preset's
   * value, else the entity default. A key equal to it is left out.
   */
  shown: {
    perPage: number;
    viewMode: string;
    zoomLevel: string;
    gridDensity: string;
  };
}

/** Sets a key, or deletes it when the value is empty or what the page shows anyway */
const setOrDelete = (
  params: URLSearchParams,
  key: string,
  value: string | null,
  shown: string | null = null
) => {
  if (value === null || value === "" || value === shown) params.delete(key);
  else params.set(key, value);
};

/**
 * The next URL for a list change: rewrites only the keys of the fields the
 * patch names, all of them the entity's list-owned keys, and keeps every
 * other key. Presentation keys are written only when they differ from what
 * the page shows without them; `page` is left out at 1. Filters that leave
 * no filter key write `filters=none`, so the default preset stays off.
 */
export const writeListParams = (
  prev: URLSearchParams,
  patch: ListParamsPatch,
  { entity, filterOptions, shown }: WriteListContext
): URLSearchParams => {
  const next = new URLSearchParams(prev);
  if (patch.filters !== undefined) {
    for (const key of listFilterKeys(entity)) next.delete(key);
    next.delete(NO_FILTERS_KEY);
    const written = filtersToUrlParams(patch.filters, filterOptions);
    written.forEach((value, key) => {
      next.set(key, value);
    });
    if (written.toString() === "") next.set(NO_FILTERS_KEY, NO_FILTERS_VALUE);
  }
  if (patch.q !== undefined) {
    setOrDelete(next, "q", patch.q.slice(0, Q_MAX_LENGTH));
  }
  if (patch.sort !== undefined) setOrDelete(next, "sort", patch.sort);
  if (patch.direction !== undefined) setOrDelete(next, "dir", patch.direction);
  if (patch.page !== undefined) {
    setOrDelete(next, "page", patch.page > 1 ? String(patch.page) : null);
  }
  if (patch.perPage !== undefined) {
    setOrDelete(next, "per_page", String(patch.perPage), String(shown.perPage));
  }
  if (patch.viewMode !== undefined) {
    setOrDelete(next, "view", patch.viewMode, shown.viewMode);
  }
  if (patch.zoomLevel !== undefined) {
    setOrDelete(next, "zoom", patch.zoomLevel, shown.zoomLevel);
  }
  if (patch.gridDensity !== undefined) {
    setOrDelete(next, "grid_density", patch.gridDensity, shown.gridDensity);
  }
  if (patch.timelinePeriod !== undefined) {
    setOrDelete(next, "timeline_period", patch.timelinePeriod);
  }
  if (patch.folderPath !== undefined) {
    setOrDelete(next, "folderPath", patch.folderPath.join(","));
  }
  return next;
};
