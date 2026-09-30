/**
 * A list's state, derived on every render from the URL and the cached
 * presets: no copy in state, no init effect. Back and Forward step through
 * it because the URL is the state.
 *
 * Each field is the URL's value if present and valid, else the default
 * preset's, else the entity default. The preset's filters apply only while
 * the URL names no filter (a key of the entity's `UI_KEYS`, a companion,
 * singular, range or date form, `q`, or `filters=none`, which a filter
 * change that leaves no filter writes); `instance`, `tab`, `sort`, `view`
 * and every other key leave them on.
 *
 * Setters rewrite only the list's own keys (`listOwnedKeys`). History: push
 * for filters, sort, page, folder and presets; replace for search text, per
 * page, view, zoom, density, timeline period and `setPage(n, { history:
 * "replace" })`.
 */
import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_SORT, Q_MAX_LENGTH } from "@peek/shared-types";
import {
  type SavedPreset,
  presetsForContext,
  useDefaultPresets,
  useFilterPresets,
} from "../api/hooks/usePresets";
import { useUnitPreference } from "../contexts/UnitPreferenceContext";
import type { FilterOption } from "../utils/filterConfig";
import {
  buildListQuery,
  freshSeed,
  listKeyOf,
  listKeyWithoutPageOf,
  parseSortValue,
  sortValue,
} from "../utils/listQuery";
import {
  type ListEntity,
  type ListParamsPatch,
  type WriteListContext,
  readListParams,
  writeListParams,
} from "../utils/urlParams";

type Direction = "ASC" | "DESC";

export interface ListDefaults {
  sort: string;
  direction: Direction;
  perPage: number;
  viewMode: string;
  zoomLevel: string;
  gridDensity: string;
}

type SortOptions = readonly { value: string }[];

/** What loading a preset applies: a saved preset, or the Load Preset menu's copy of one */
export type PresetToLoad = Omit<SavedPreset, "id" | "name">;

export interface UseListUrlStateOptions {
  entityType: ListEntity;
  /** The preset context ("scene_performer", ...); the entity type by default */
  context?: string;
  /** The panel's options (unit-transformed) */
  filterOptions: readonly FilterOption[];
  /**
   * The sorts the list offers, or a function of the derived filters with the
   * permanent filters merged in (the scene list offers Scene Number only
   * beside a collection: `sortOptionsFor`)
   */
  sortOptions:
    | SortOptions
    | ((filters: Record<string, unknown>) => SortOptions);
  /** The views the page renders */
  viewModes: readonly string[];
  /** Entity defaults, card display settings folded in */
  defaults: ListDefaults;
  /** The page's fixed filters: never in the URL, merged last into the request */
  permanentFilters?: Record<string, unknown>;
}

export interface ListUrlState {
  /** The panel's filters; permanent filters not included */
  filters: Record<string, unknown>;
  sort: { field: string; direction: Direction; seed: number | null };
  page: number;
  perPage: number;
  q: string;
  viewMode: string;
  zoomLevel: string;
  gridDensity: string;
  timelinePeriod: string | null;
  folderPath: string[];
  /** The default preset for this context, whichever of its fields applied */
  activePreset: SavedPreset | null;
  /** Presets resolved (cached after the first visit) and a random order seeded */
  ready: boolean;
  /** The serialised list query, page included; "" until ready */
  listKey: string;
  /** The serialised list query without its page; "" until ready */
  listKeyWithoutPage: string;
  applyFilters: (filters: Record<string, unknown>) => void;
  removeFilter: (key: string) => void;
  clearFilters: () => void;
  setSort: (field: string, direction?: Direction) => void;
  setPage: (page: number, opts?: { history?: "push" | "replace" }) => void;
  setPerPage: (perPage: number) => void;
  setQuery: (q: string) => void;
  setViewMode: (mode: string) => void;
  setZoomLevel: (zoom: string) => void;
  setGridDensity: (density: string) => void;
  setTimelinePeriod: (period: string | null) => void;
  setFolderPath: (path: string[]) => void;
  loadPreset: (preset: PresetToLoad) => void;
}

const NO_FILTERS: Record<string, unknown> = {};

const isDirection = (value: unknown): value is Direction =>
  value === "ASC" || value === "DESC";

const positive = (value: unknown): number | null =>
  typeof value === "number" && value > 0 ? value : null;

const nonEmpty = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/** A preset's sort as the list reads it: a preset never carries a seed */
const presetSort = (preset: SavedPreset | null) =>
  preset?.sort
    ? { field: parseSortValue(preset.sort).field, seed: null }
    : null;

export function useListUrlState(options: UseListUrlStateOptions): ListUrlState {
  const {
    entityType,
    context,
    filterOptions,
    sortOptions,
    viewModes,
    defaults,
    permanentFilters = NO_FILTERS,
  } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const presetsQuery = useFilterPresets();
  const defaultPresetsQuery = useDefaultPresets();
  const { unitPreference } = useUnitPreference();

  const presetContext = context ?? entityType;
  const presetsResolved =
    !presetsQuery.isPending && !defaultPresetsQuery.isPending;

  const activePreset = useMemo(() => {
    const id = defaultPresetsQuery.data?.defaults[presetContext];
    if (!id) return null;
    return (
      presetsForContext(presetsQuery.data, presetContext).find(
        (preset) => preset.id === id
      ) ?? null
    );
  }, [defaultPresetsQuery.data, presetsQuery.data, presetContext]);

  const url = useMemo(
    () => readListParams(searchParams, entityType, filterOptions),
    [searchParams, entityType, filterOptions]
  );

  // What the page shows for a presentation field the URL does not name
  const shown = useMemo<WriteListContext["shown"]>(() => {
    const presetView = nonEmpty(activePreset?.viewMode);
    return {
      perPage: positive(activePreset?.perPage) ?? defaults.perPage,
      viewMode:
        presetView && viewModes.includes(presetView)
          ? presetView
          : defaults.viewMode,
      zoomLevel: nonEmpty(activePreset?.zoomLevel) ?? defaults.zoomLevel,
      gridDensity: nonEmpty(activePreset?.gridDensity) ?? defaults.gridDensity,
    };
  }, [activePreset, defaults, viewModes]);

  const derived = useMemo(() => {
    const filters = url.hasFilters
      ? url.filters
      : (activePreset?.filters ?? NO_FILTERS);

    const offered =
      typeof sortOptions === "function"
        ? sortOptions({ ...filters, ...permanentFilters })
        : sortOptions;
    const isOffered = (field: string) =>
      offered.some((option) => option.value === field);
    const sort = [
      url.sort === null ? null : parseSortValue(url.sort),
      presetSort(activePreset),
      { field: defaults.sort, seed: null },
    ].find((candidate) => candidate && isOffered(candidate.field)) ?? {
      field: DEFAULT_SORT[entityType].field,
      seed: null,
    };
    const direction = [url.dir, activePreset?.direction].find(isDirection);

    return {
      filters,
      sort: {
        field: sort.field,
        direction: direction ?? defaults.direction,
        seed: sort.field === "random" ? sort.seed : null,
      },
      page: url.page,
      perPage: url.perPage ?? shown.perPage,
      q: url.q ?? "",
      viewMode:
        url.view !== null && viewModes.includes(url.view)
          ? url.view
          : shown.viewMode,
      zoomLevel: url.zoom ?? shown.zoomLevel,
      gridDensity: url.gridDensity ?? shown.gridDensity,
      timelinePeriod: url.timelinePeriod,
      folderPath: url.folderPath,
    };
  }, [
    url,
    activePreset,
    sortOptions,
    permanentFilters,
    defaults,
    entityType,
    viewModes,
    shown,
  ]);

  // A random order read without a seed (a bare `sort=random` link, a preset)
  // gets one in the URL, so paging and Back keep the order
  const needsSeed =
    presetsResolved &&
    derived.sort.field === "random" &&
    derived.sort.seed === null;
  const ready = presetsResolved && !needsSeed;

  const writeContext = useMemo<WriteListContext>(
    () => ({ entity: entityType, filterOptions, shown }),
    [entityType, filterOptions, shown]
  );

  const write = useCallback(
    (patch: ListParamsPatch, history: "push" | "replace") => {
      setSearchParams((prev) => writeListParams(prev, patch, writeContext), {
        replace: history === "replace",
      });
    },
    [setSearchParams, writeContext]
  );

  useEffect(() => {
    if (needsSeed) write({ sort: sortValue("random", freshSeed()) }, "replace");
  }, [needsSeed, write]);

  const { filters, sort } = derived;

  const applyFilters = useCallback(
    (next: Record<string, unknown>) =>
      write({ filters: next, page: 1 }, "push"),
    [write]
  );

  const removeFilter = useCallback(
    (key: string) => {
      const { [key]: _removed, ...rest } = filters;
      write({ filters: rest, page: 1 }, "push");
    },
    [filters, write]
  );

  const clearFilters = useCallback(
    () => write({ filters: {}, page: 1 }, "push"),
    [write]
  );

  const setSort = useCallback(
    (field: string, direction?: Direction) => {
      const nextDirection =
        direction ??
        (sort.field === field && sort.direction === "DESC" ? "ASC" : "DESC");
      // Choosing Random shuffles anew; toggling its direction keeps the order
      const seed =
        field !== "random"
          ? null
          : sort.field === "random" && sort.seed !== null
            ? sort.seed
            : freshSeed();
      write(
        { sort: sortValue(field, seed), direction: nextDirection, page: 1 },
        "push"
      );
    },
    [sort, write]
  );

  const setPage = useCallback(
    (page: number, opts?: { history?: "push" | "replace" }) =>
      write({ page }, opts?.history ?? "push"),
    [write]
  );

  const setPerPage = useCallback(
    (perPage: number) => write({ perPage, page: 1 }, "replace"),
    [write]
  );

  // The same search again (the search box showing a URL's q after Back)
  // writes nothing, so it cannot eat the Back with a replace
  const currentQ = derived.q;
  const setQuery = useCallback(
    (q: string) => {
      if (q.slice(0, Q_MAX_LENGTH) === currentQ) return;
      write({ q, page: 1 }, "replace");
    },
    [write, currentQ]
  );

  const setViewMode = useCallback(
    (viewMode: string) =>
      write(
        viewMode === "timeline"
          ? { viewMode }
          : { viewMode, timelinePeriod: null },
        "replace"
      ),
    [write]
  );

  const setZoomLevel = useCallback(
    (zoomLevel: string) => write({ zoomLevel }, "replace"),
    [write]
  );

  const setGridDensity = useCallback(
    (gridDensity: string) => write({ gridDensity }, "replace"),
    [write]
  );

  const setTimelinePeriod = useCallback(
    (timelinePeriod: string | null) =>
      write({ timelinePeriod, page: 1 }, "replace"),
    [write]
  );

  const setFolderPath = useCallback(
    (folderPath: string[]) => write({ folderPath, page: 1 }, "push"),
    [write]
  );

  const loadPreset = useCallback(
    (preset: PresetToLoad) => {
      const field = parseSortValue(preset.sort || defaults.sort).field;
      write(
        {
          filters: preset.filters,
          sort: sortValue(field, field === "random" ? freshSeed() : null),
          direction: isDirection(preset.direction)
            ? preset.direction
            : defaults.direction,
          page: 1,
          // A preset without a per page keeps the list's
          perPage: positive(preset.perPage) ?? derived.perPage,
          viewMode: nonEmpty(preset.viewMode) ?? defaults.viewMode,
          zoomLevel: nonEmpty(preset.zoomLevel) ?? defaults.zoomLevel,
          gridDensity: nonEmpty(preset.gridDensity) ?? defaults.gridDensity,
          timelinePeriod: null,
        },
        "push"
      );
    },
    [write, defaults, derived.perPage]
  );

  const query = useMemo(
    () =>
      buildListQuery(
        entityType,
        { ...derived, ready },
        permanentFilters,
        unitPreference
      ),
    [entityType, derived, ready, permanentFilters, unitPreference]
  );

  return {
    ...derived,
    activePreset,
    ready,
    listKey: listKeyOf(query),
    listKeyWithoutPage: listKeyWithoutPageOf(query),
    applyFilters,
    removeFilter,
    clearFilters,
    setSort,
    setPage,
    setPerPage,
    setQuery,
    setViewMode,
    setZoomLevel,
    setGridDensity,
    setTimelinePeriod,
    setFolderPath,
    loadPreset,
  };
}
