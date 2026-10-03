/**
 * A list's request, built from its state: the page, sort and search in
 * `filter`, the panel's filters with the page's permanent filters in the
 * entity's `<entity>_filter`. Also the sort rules a list reads its state by.
 */
import { DEFAULT_SORT, PANEL_FIELDS } from "@peek/shared-types";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  CLIP_SORT_OPTIONS,
  type FilterOption,
  GALLERY_SORT_OPTIONS,
  GROUP_SORT_OPTIONS,
  IMAGE_SORT_OPTIONS,
  PERFORMER_SORT_OPTIONS,
  SCENE_SORT_OPTIONS,
  STUDIO_SORT_OPTIONS,
  TAG_SORT_OPTIONS,
  buildClipFilter,
  buildGalleryFilter,
  buildGroupFilter,
  buildImageFilter,
  buildPerformerFilter,
  buildSceneFilter,
  buildStudioFilter,
  buildTagFilter,
} from "./filterConfig";
import { urlKeysOf } from "./filterFields";
import type { ListEntity } from "./urlParams";

type Filters = Readonly<Record<string, unknown>>;

/**
 * Whether a collection filter names at least one collection and includes it:
 * a list of ids, or `{ value, modifier }` with any modifier but EXCLUDES.
 */
export function hasIncludingCollection(filter: unknown): boolean {
  if (Array.isArray(filter)) return filter.length > 0;
  if (typeof filter !== "object" || filter === null) return false;
  const { value, modifier } = filter as { value?: unknown; modifier?: unknown };
  return Array.isArray(value) && value.length > 0 && modifier !== "EXCLUDES";
}

/**
 * The values a filter state names with an including modifier: the page's
 * permanent criterion in the request's shape (`{ value, modifier }` under the
 * contract field), or the panel's key with its modifier companion. An
 * EXCLUDES, "has none" or "has any" criterion names none.
 */
function includedValues(
  filters: Filters,
  field: string,
  panelKey?: string,
  modifierKey?: string
): unknown[] {
  const named: unknown[] = [];
  const take = (value: unknown, modifier: unknown) => {
    if (!Array.isArray(value) || value.length === 0) return;
    if (
      modifier === undefined ||
      modifier === "INCLUDES" ||
      modifier === "INCLUDES_ALL"
    ) {
      named.push(...(value as unknown[]));
    }
  };
  const permanent = filters[field];
  if (Array.isArray(permanent)) take(permanent, undefined);
  else if (typeof permanent === "object" && permanent !== null) {
    const { value, modifier } = permanent as {
      value?: unknown;
      modifier?: unknown;
    };
    take(value, modifier);
  }
  if (panelKey) {
    take(filters[panelKey], modifierKey ? filters[modifierKey] : undefined);
  }
  return named;
}

/**
 * The scene panel's row for the Playlists field: its key and modifier
 * companion, which the panel's table names
 */
const playlistRow = () =>
  (
    PANEL_FIELDS.scene as readonly {
      field: string;
      key: string;
      modifierKey?: string;
    }[]
  ).find((row) => row.field === "playlists");

/** Whether a filter state, the page's permanent criteria merged in, offers the Scene Number sort */
export function offersSceneIndex(filters: Filters): boolean {
  return (
    hasIncludingCollection(filters.groups) ||
    hasIncludingCollection({
      value: filters.groupIds,
      modifier: filters.groupIdsModifier,
    })
  );
}

/**
 * Whether the filters include exactly one playlist: the server's Playlist
 * order needs one to read the position from (a 400 otherwise)
 */
export function offersPlaylistOrder(filters: Filters): boolean {
  const row = playlistRow();
  return (
    includedValues(filters, "playlists", row?.key, row?.modifierKey).length ===
    1
  );
}

/**
 * Whether the filters include a parent collection: the server's Collection
 * order is the index within it (a 400 otherwise)
 */
export function offersCollectionOrder(filters: Filters): boolean {
  return (
    includedValues(filters, "containing_groups", "groupIds", "groupIdsModifier")
      .length > 0
  );
}

/** Whether a list offers a sort that reads a filter, given these filters */
function isOffered(
  artifactType: string,
  field: string,
  filters: Filters
): boolean {
  if (artifactType === "scene") {
    if (field === "scene_index") return offersSceneIndex(filters);
    if (field === "playlist_position") return offersPlaylistOrder(filters);
  }
  if (artifactType === "group" && field === "sub_group_order") {
    return offersCollectionOrder(filters);
  }
  return true;
}

/**
 * The sort a query carries for these filters: a sort that reads a filter
 * (Scene Number, Playlist order, Collection order) without it is a 400
 * (item 38), so the list's default takes its place.
 */
export function sortOffered(
  artifactType: string,
  field: string,
  filters: Filters
): string {
  if (isOffered(artifactType, field, filters)) return field;
  return DEFAULT_SORT[artifactType as keyof typeof DEFAULT_SORT].field;
}

/** An entity's `<entity>_filter` from the panel's filters (permanent filters merged in) */
export const buildFilter = (artifactType: string, filters: Filters) => {
  switch (artifactType) {
    case "performer":
      return { performer_filter: buildPerformerFilter(filters) };
    case "studio":
      return { studio_filter: buildStudioFilter(filters) };
    case "tag":
      return { tag_filter: buildTagFilter(filters) };
    case "group":
      return { group_filter: buildGroupFilter(filters) };
    case "gallery":
      return { gallery_filter: buildGalleryFilter(filters) };
    case "image":
      return { image_filter: buildImageFilter(filters) };
    case "clip":
      return { clip_filter: buildClipFilter(filters) };
    case "scene":
    default:
      return { scene_filter: buildSceneFilter(filters) };
  }
};

/** Every sort an entity's list declares (the scene list's includes Scene Number) */
export const getSortOptions = (artifactType: string) => {
  switch (artifactType) {
    case "performer":
      return PERFORMER_SORT_OPTIONS;
    case "studio":
      return STUDIO_SORT_OPTIONS;
    case "tag":
      return TAG_SORT_OPTIONS;
    case "group":
      return GROUP_SORT_OPTIONS;
    case "gallery":
      return GALLERY_SORT_OPTIONS;
    case "image":
      return IMAGE_SORT_OPTIONS;
    case "clip":
      return CLIP_SORT_OPTIONS;
    case "scene":
    default:
      return SCENE_SORT_OPTIONS;
  }
};

/**
 * The sorts a list offers for these filters, the page's permanent filters
 * merged in: Scene Number only beside a collection filter that includes,
 * Playlist order only beside exactly one playlist, Collection order only
 * beside a parent collection.
 */
export const sortOptionsFor = (
  artifactType: string,
  filters: Filters
): readonly { value: string; label: string }[] =>
  getSortOptions(artifactType).filter((option) =>
    isOffered(artifactType, option.value, filters)
  );

/** A random order's seed: the same seed gives the same order from page to page */
export const freshSeed = () => 10_000_000 + Math.floor(Math.random() * 9e7);

/** The URL's or a preset's sort value: `random_<seed>` is Random with its seed */
export const parseSortValue = (
  value: string
): { field: string; seed: number | null } => {
  const match = /^random_(\d+)$/.exec(value);
  return match
    ? { field: "random", seed: Number(match[1]) }
    : { field: value, seed: null };
};

/** The sort value a request and the URL carry: Random with its seed as `random_<seed>` */
export const sortValue = (field: string, seed: number | null) =>
  field === "random" && seed !== null ? `random_${seed}` : field;

/** What a list's request is built from (`ListUrlState` holds it) */
export interface ListQueryState {
  /** Presets resolved; no request before */
  ready: boolean;
  /** The panel's filters, permanent filters not included */
  filters: Record<string, unknown>;
  sort: { field: string; direction: "ASC" | "DESC"; seed: number | null };
  page: number;
  perPage: number;
  q: string;
}

export interface ListQueryPage {
  page: number;
  per_page: number;
  q: string;
  sort: string;
  direction: "ASC" | "DESC";
}

/** A list's request body: paging, sort and search, and the entity's filter */
export type ListQuery = { filter: ListQueryPage } & ReturnType<
  typeof buildFilter
>;

/**
 * A list's request from its state, or null while the presets load. The
 * page's permanent filters go last on every path, so a permanent field wins
 * over the panel's or a preset's value of the same key.
 */
export const buildListQuery = (
  entity: ListEntity,
  state: ListQueryState,
  permanentFilters: Filters
): ListQuery | null => {
  if (!state.ready) return null;
  const filters = { ...state.filters, ...permanentFilters };
  return {
    filter: {
      page: state.page,
      per_page: state.perPage,
      q: state.q,
      sort: sortValue(
        sortOffered(entity, state.sort.field, filters),
        state.sort.seed
      ),
      direction: state.sort.direction,
    },
    ...buildFilter(entity, filters),
  };
};

/** A list query's identity, page included (selection scope); "" before it exists */
export const listKeyOf = (query: ListQuery | null): string =>
  query ? JSON.stringify(query) : "";

/** A list query's identity without its page (the count a page change reuses) */
export const listKeyWithoutPageOf = (query: ListQuery | null): string => {
  if (!query) return "";
  const { page: _page, ...filter } = query.filter;
  return JSON.stringify({ ...query, filter });
};

/** A list request without its page: every page of one list shares one total */
export function requestWithoutPage(
  request: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  const { page: _page, ...rest } = request;
  const { filter } = rest;
  if (typeof filter !== "object" || filter === null || Array.isArray(filter))
    return rest;
  const { page: _filterPage, ...filterRest } = filter as Record<
    string,
    unknown
  >;
  return { ...rest, filter: filterRest };
}

/**
 * Where a list's total is cached for its pages: beside the list's own keys
 * (`[root, instance?, "list", request]`), under the same root, so every
 * invalidation of the library's queries (a hide, a restore, Restore All, an
 * instance change) marks it too
 */
export const listCountKey = (listKey: QueryKey): QueryKey => [
  ...listKey.slice(0, -2),
  "listCount",
  requestWithoutPage(listKey.at(-1) as Record<string, unknown>),
];

type ListData = Record<string, unknown>;

/** Where a list response holds its total, and how its request asks for none */
export interface ListTotalShape<R> {
  /** The request for the page alone: the server answers a null total */
  uncounted: (request: R) => R;
  /** The response's total; null when it was not counted */
  total: (data: unknown) => number | null;
  /** The response with this total */
  withTotal: (data: unknown, total: number) => unknown;
}

/** A library list (`POST /api/library/<entities>`): the total in `<result>.count`, asked off by `filter.count: false` */
export const libraryListTotal = (
  result: string
): ListTotalShape<Record<string, unknown>> => ({
  uncounted: (request) => ({
    ...request,
    filter: {
      ...(request.filter as Record<string, unknown> | undefined),
      count: false,
    },
  }),
  total: (data) => {
    const count = (
      (data as ListData | undefined)?.[result] as ListData | undefined
    )?.count;
    return typeof count === "number" ? count : null;
  },
  withTotal: (data, total) => {
    const response = data as ListData;
    return {
      ...response,
      [result]: { ...(response[result] as ListData), count: total },
    };
  },
});

/** The clip list (`POST /api/library/clips`): `total` and `totalPages`, asked off by `filter.count: false` */
export const clipListTotal: ListTotalShape<Record<string, unknown>> = {
  uncounted: (request) => ({
    ...request,
    filter: {
      ...(request.filter as Record<string, unknown> | undefined),
      count: false,
    },
  }),
  total: (data) => {
    const total = (data as ListData | undefined)?.total;
    return typeof total === "number" ? total : null;
  },
  withTotal: (data, total) => {
    const response = data as ListData;
    const perPage = response.perPage;
    return {
      ...response,
      total,
      totalPages:
        typeof perPage === "number" && perPage > 0
          ? Math.ceil(total / perPage)
          : 0,
    };
  },
};

/** The cache's stale time as a number of milliseconds; 0 when it is not one */
const staleTimeOf = (client: QueryClient): number => {
  const staleTime = client.getDefaultOptions().queries?.staleTime;
  return typeof staleTime === "number" ? staleTime : 0;
};

/**
 * One page of a list, the total from the list's other pages when it can be
 * trusted (owner decision 12: a page change reuses the count). A total the
 * server counted for this list (the same request but its page) is kept
 * under `listCountKey`; while that entry is not invalidated (every hide,
 * restore, Restore All and instance change invalidates the library's
 * queries) and younger than the cache's stale time (a sync changes the
 * library without telling the client, and a cached page is shown that long
 * too), the page is asked for alone and answered with it. Otherwise the
 * page is counted and its total kept for the next page: a first load, a
 * reload, a filter, search, sort or per-page change, a refetch of the list
 * after an invalidation.
 */
export async function fetchListPage<R extends Record<string, unknown>>(
  { client, queryKey }: { client: QueryClient; queryKey: QueryKey },
  request: R,
  shape: ListTotalShape<Record<string, unknown>>,
  fetchPage: (request: R) => Promise<unknown>
): Promise<unknown> {
  const countKey = listCountKey(queryKey);
  const cached = client
    .getQueryCache()
    .find<number>({ queryKey: countKey, exact: true });
  const reusable =
    cached !== undefined &&
    typeof cached.state.data === "number" &&
    !cached.isStaleByTime(staleTimeOf(client))
      ? cached.state.data
      : null;

  const data = await fetchPage(
    reusable === null ? request : (shape.uncounted(request) as R)
  );
  const total = shape.total(data);
  if (total === null) {
    return reusable === null ? data : shape.withTotal(data, reusable);
  }
  // Counted: this total is the one the list's next page reuses
  client.setQueryData<number>(countKey, total);
  return data;
}

/**
 * The contract fields a page fixes, named by its permanent filters: the top
 * level keys (`performers`, `tags`, `date`), and the keys inside the entity's
 * own `<entity>_filter` a detail tab's locked filters carry. Sorted, so equal
 * sets are equal arrays.
 */
export const lockedFieldsOf = (
  entity: ListEntity,
  permanentFilters: Filters
): string[] => {
  const inner = permanentFilters[`${entity}_filter`];
  const fields = new Set([
    ...Object.keys(permanentFilters),
    ...(typeof inner === "object" && inner !== null && !Array.isArray(inner)
      ? Object.keys(inner)
      : []),
  ]);
  return [...fields].sort();
};

/**
 * The panel keys of a locked contract field: each row's key and companions
 * (what its codec holds: the modifier, the depth, a picker's excluded ids),
 * the singular form a card count links with and the range and date forms
 */
const lockedPanelKeys = (
  entity: ListEntity,
  lockedFields: readonly string[]
): Set<string> => {
  const keys = new Set<string>();
  if (lockedFields.length === 0) return keys;
  for (const row of PANEL_FIELDS[entity]) {
    if (!lockedFields.includes(row.field)) continue;
    for (const key of urlKeysOf(row)) keys.add(key);
  }
  return keys;
};

/**
 * The filters without those on a field the page fixes (a performer's Scenes
 * tab has its performer, so the URL's or a preset's `performerIds`, its
 * modifier and its `performerIdsExclude` go). Returns the same object when
 * nothing goes.
 */
export const withoutLockedFilters = (
  entity: ListEntity,
  filters: Filters,
  lockedFields: readonly string[]
): Record<string, unknown> => {
  const locked = lockedPanelKeys(entity, lockedFields);
  const kept = Object.entries(filters).filter(([key]) => !locked.has(key));
  return kept.length === Object.keys(filters).length
    ? (filters as Record<string, unknown>)
    : Object.fromEntries(kept);
};

/**
 * The panel's options without those on a field the page fixes, and without a
 * section left with none
 */
export const withoutLockedOptions = (
  entity: ListEntity,
  options: FilterOption[],
  lockedFields: readonly string[]
): FilterOption[] => {
  const locked = lockedPanelKeys(entity, lockedFields);
  if (locked.size === 0) return options;
  const offered = options.filter((option) => !locked.has(option.key));
  return offered.filter(
    (option, index) =>
      option.type !== "section-header" ||
      (offered[index + 1] !== undefined &&
        offered[index + 1]?.type !== "section-header")
  );
};
