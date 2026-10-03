/**
 * A list's request, built from its state: the page, sort and search in
 * `filter`, the page's permanent filters in the entity's `<entity>_filter`
 * and the user's rows in `where` (FILTERS-12: a tag page's tag and the
 * user's Tags row both apply). Also the sort rules a list reads its state by.
 */
import {
  DEFAULT_SORT,
  type ListKind,
  PANEL_FIELDS,
  type WhereGroup,
  groupKeyOf,
  isWhereGroup,
  parseRowKey,
} from "@peek/shared-types";
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
} from "./filterConfig";
import { filterObjectOf, urlKeysOf, whereOf } from "./filterFields";
import type { ListEntity } from "./urlParams";

type Filters = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The values a criterion names for a sort to read: those of an INCLUDES or
 * INCLUDES_ALL criterion (a page's list of ids too); none for EXCLUDES, "has
 * none" or "has any"
 */
function namedValues(criterion: unknown): readonly unknown[] {
  if (Array.isArray(criterion)) return criterion as unknown[];
  if (!isObject(criterion)) return [];
  const { value, modifier } = criterion;
  if (!Array.isArray(value)) return [];
  return modifier === undefined ||
    modifier === "INCLUDES" ||
    modifier === "INCLUDES_ALL"
    ? (value as unknown[])
    : [];
}

/**
 * The values a sort reads of a field, as the server's `topLevelCriteria`
 * reads them: the page's criterion of the field (the filter object's) when
 * it has one, as the page gives it, else the first root row of the field
 * that names something, under an "all" root only. A row inside a group, or
 * under "match any", never decides a sort.
 */
function sortReads(kind: ListKind, filters: Filters, field: string) {
  if (filters[field] !== undefined) return namedValues(filters[field]);
  const where = whereOf(kind, filters);
  if (where?.match !== "all") return [];
  for (const node of where.rules) {
    if (isWhereGroup(node) || node.field !== field) continue;
    const values = namedValues(node.criterion);
    if (values.length > 0) return values;
  }
  return [];
}

/** Whether a filter state, the page's permanent criteria merged in, offers the Scene Number sort */
export function offersSceneIndex(filters: Filters): boolean {
  return sortReads("scene", filters, "groups").length > 0;
}

/**
 * Whether the filters include exactly one playlist: the server's Playlist
 * order needs one to read the position from (a 400 otherwise)
 */
export function offersPlaylistOrder(filters: Filters): boolean {
  return sortReads("scene", filters, "playlists").length === 1;
}

/**
 * Whether the filters include a parent collection: the server's Collection
 * order is the index within it (a 400 otherwise)
 */
export function offersCollectionOrder(filters: Filters): boolean {
  return sortReads("group", filters, "containing_groups").length > 0;
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

/**
 * An entity's `<entity>_filter` beside the request's `where`: the page's
 * permanent filters over the state's own contract-field keys, and a list's
 * default criterion no row decides (`filterObjectOf`); never the user's rows
 */
export const buildFilter = (
  artifactType: string,
  filters: Filters,
  permanentFilters: Filters = {}
) => {
  switch (artifactType) {
    case "performer":
      return {
        performer_filter: filterObjectOf(
          "performer",
          filters,
          permanentFilters
        ),
      };
    case "studio":
      return {
        studio_filter: filterObjectOf("studio", filters, permanentFilters),
      };
    case "tag":
      return { tag_filter: filterObjectOf("tag", filters, permanentFilters) };
    case "group":
      return {
        group_filter: filterObjectOf("group", filters, permanentFilters),
      };
    case "gallery":
      return {
        gallery_filter: filterObjectOf("gallery", filters, permanentFilters),
      };
    case "image":
      return {
        image_filter: filterObjectOf("image", filters, permanentFilters),
      };
    case "clip":
      return { clip_filter: filterObjectOf("clip", filters, permanentFilters) };
    case "scene":
    default:
      return {
        scene_filter: filterObjectOf("scene", filters, permanentFilters),
      };
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

/**
 * A list's request body: paging, sort and search, the entity's filter (what
 * the page fixes) and, when the user has rows, `where`
 */
export type ListQuery = {
  filter: ListQueryPage;
  where?: WhereGroup<ListKind>;
} & ReturnType<typeof buildFilter>;

/**
 * A list's request from its state, or null while the presets load. The
 * page's permanent filters go in the entity's filter, winning over a
 * contract-field key the state saved; the state's rows go in `where`, so a
 * row on the field the page fixes narrows the page's own criterion.
 */
export const buildListQuery = (
  entity: ListEntity,
  state: ListQueryState,
  permanentFilters: Filters
): ListQuery | null => {
  if (!state.ready) return null;
  const where = whereOf(entity, state.filters);
  return {
    filter: {
      page: state.page,
      per_page: state.perPage,
      q: state.q,
      sort: sortValue(
        sortOffered(
          entity,
          state.sort.field,
          // A sort reads the filter object and the root rows together
          { ...state.filters, ...permanentFilters }
        ),
        state.sort.seed
      ),
      direction: state.sort.direction,
    },
    ...buildFilter(entity, state.filters, permanentFilters),
    ...(where === undefined ? {} : { where }),
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

/** Recommended (`POST /api/library/scenes/recommended`): the total in a top-level `count`, asked off by `filter.count: false` */
export const recommendedListTotal: ListTotalShape<Record<string, unknown>> = {
  uncounted: (request) => ({
    ...request,
    filter: {
      ...(request.filter as Record<string, unknown> | undefined),
      count: false,
    },
  }),
  total: (data) => {
    const count = (data as ListData | undefined)?.count;
    return typeof count === "number" ? count : null;
  },
  withTotal: (data, total) => ({ ...(data as ListData), count: total }),
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
 * The filters without those on a field a lock names (a View loaded on a
 * performer's Scenes tab, which has its performer, loses `performerIds`,
 * its modifier and its `performerIdsExclude`, in every row: `2.performerIds`
 * and `g1.performerIds` too), and without a group's declaration (`g1`) left
 * with no row. Returns the same object when nothing goes.
 */
export const withoutLockedFilters = (
  entity: ListEntity,
  filters: Filters,
  lockedFields: readonly string[]
): Record<string, unknown> => {
  const locked = lockedPanelKeys(entity, lockedFields);
  const kept = Object.entries(filters).filter(
    ([key]) => !locked.has(parseRowKey(key)?.key ?? key)
  );
  if (kept.length === Object.keys(filters).length) {
    return filters as Record<string, unknown>;
  }
  const groupsWithRows = new Set(
    kept.flatMap(([key]) => {
      const group = parseRowKey(key)?.group ?? 0;
      return group === 0 ? [] : [groupKeyOf(group)];
    })
  );
  const isGroupKey = (key: string) => /^g\d+$/.test(key);
  return Object.fromEntries(
    kept.filter(([key]) => !isGroupKey(key) || groupsWithRows.has(key))
  );
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
