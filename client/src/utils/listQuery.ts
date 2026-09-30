/**
 * A list's request, built from its state: the page, sort and search in
 * `filter`, the panel's filters with the page's permanent filters in the
 * entity's `<entity>_filter`. Also the sort rules a list reads its state by.
 */
import { DEFAULT_SORT } from "@peek/shared-types";
import {
  CLIP_SORT_OPTIONS,
  GALLERY_SORT_OPTIONS,
  GROUP_SORT_OPTIONS,
  IMAGE_SORT_OPTIONS,
  PERFORMER_SORT_OPTIONS,
  SCENE_SORT_OPTIONS,
  SCENE_SORT_OPTIONS_BASE,
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
 * The sort a query carries for these filters: Scene Number without an
 * including collection filter is a 400 (item 38), so the scene default takes
 * its place.
 */
export function sortOffered(
  artifactType: string,
  field: string,
  filters: Filters
): string {
  return artifactType === "scene" &&
    field === "scene_index" &&
    !offersSceneIndex(filters)
    ? DEFAULT_SORT.scene.field
    : field;
}

/** An entity's `<entity>_filter` from the panel's filters (permanent filters merged in) */
export const buildFilter = (
  artifactType: string,
  filters: Filters,
  unitPreference: string
) => {
  switch (artifactType) {
    case "performer":
      return {
        performer_filter: buildPerformerFilter(filters, unitPreference),
      };
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
 * merged in: the scene list offers Scene Number only beside a collection
 * filter that includes.
 */
export const sortOptionsFor = (
  artifactType: string,
  filters: Filters
): readonly { value: string; label: string }[] =>
  artifactType === "scene" && !offersSceneIndex(filters)
    ? SCENE_SORT_OPTIONS_BASE
    : getSortOptions(artifactType);

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
  permanentFilters: Filters,
  unitPreference: string
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
    ...buildFilter(entity, filters, unitPreference),
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
