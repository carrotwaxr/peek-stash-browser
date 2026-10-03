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
 * and every other key leave them on. A View's filters lose the fields the
 * page fixes; the URL's keep them (they go in `where`, FILTERS-12), but not
 * those the view fixes (the timeline's date, the open folder's tags).
 *
 * Setters rewrite only the list's own keys (`listOwnedKeys`). History: push
 * for filters, sort, page, folder and presets; replace for search text, per
 * page, view, zoom, density, timeline period, `setPage(n, { history:
 * "replace" })` and `applyFilters(next, { history: "replace" })` (a chip's
 * popover, whose later edits replace its first).
 *
 * The active View is the URL's `savedView` when the user has a View of that
 * id, else the default View while the URL names no filter. A filter or sort
 * change keeps `savedView`, so the View stays named and shows as modified;
 * on the default View it writes the default's id, which would otherwise stop
 * applying with the first filter. Clear all drops it, and any write drops an
 * id the user does not have.
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
import type { FilterOption } from "../utils/filterConfig";
import { normalizePanelState, viewModified } from "../utils/filterFields";
import {
  buildListQuery,
  freshSeed,
  listKeyOf,
  listKeyWithoutPageOf,
  lockedFieldsOf,
  parseSortValue,
  sortValue,
  withoutLockedFilters,
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
  /**
   * The contract fields the page fixes (`performers`, `tags`, `date`): a
   * View's and the default View's filters on them are dropped when they
   * load, companions and every row of the field included (a "Fave
   * performers" View would list nothing on a performer page). The URL's
   * rows on them stay: they go in `where`, AND-ed with the page's own
   * criterion (FILTERS-12).
   */
  lockedFields?: readonly string[];
  /**
   * Permanent filters a view adds from its own state (the timeline's period
   * as `date`, the open folder as `tags`), given the page's own
   * (`permanentFilters`): merged over them, and their fields locked
   * (`viewLockedFields`): the URL's filters on them are dropped too
   */
  viewFilters?: (
    view: ListView,
    pageFilters: Record<string, unknown>
  ) => Record<string, unknown>;
}

/** The view and where in it the list is: what a view's own filters follow */
export interface ListView {
  viewMode: string;
  timelinePeriod: string | null;
  folderPath: string[];
}

export interface ListUrlState {
  /** The panel's filters; permanent filters not included */
  filters: Record<string, unknown>;
  /**
   * The panel's filters with only the page's locks applied: a view's own
   * field (the timeline period's `date`) keeps the user's value here, so the
   * timeline's bars count the user's Date filter while a period is chosen
   */
  filtersBeforeView: Record<string, unknown>;
  sort: { field: string; direction: Direction; seed: number | null };
  page: number;
  perPage: number;
  q: string;
  viewMode: string;
  zoomLevel: string;
  gridDensity: string;
  timelinePeriod: string | null;
  folderPath: string[];
  /** The page's permanent filters with its view's (`viewFilters`) merged in */
  permanentFilters: Record<string, unknown>;
  /**
   * The fields the view fixes (the timeline period's `date`, the open
   * folder's `tags`), not the page's: the panel offers every other field
   */
  viewLockedFields: readonly string[];
  /** The default preset for this context, whichever of its fields applied */
  activePreset: SavedPreset | null;
  /**
   * The View the list shows: the URL's `savedView` if the user has it, else
   * the default View while the URL names no filter, else null
   */
  activeView: SavedPreset | null;
  /**
   * The list's filters or sort differ from the active View's (`viewModified`),
   * the View read as loading it would apply it here: without the fields the
   * page fixes, its sort as this page falls back from it
   */
  activeViewModified: boolean;
  /** Presets resolved (cached after the first visit) and a random order seeded */
  ready: boolean;
  /** The serialised list query, page included; "" until ready */
  listKey: string;
  /** The serialised list query without its page; "" until ready */
  listKeyWithoutPage: string;
  applyFilters: (
    filters: Record<string, unknown>,
    opts?: { history?: "push" | "replace" }
  ) => void;
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
  /** Applies a preset's state, naming no View */
  loadPreset: (preset: PresetToLoad) => void;
  /** Applies a View's state and names it (`savedView`), one history entry */
  loadView: (view: SavedPreset) => void;
  /** Names the View the list shows, or none, changing nothing else (replace) */
  setActiveView: (id: string | null) => void;
}

const NO_FILTERS: Record<string, unknown> = {};
const NO_LOCKS: readonly string[] = [];

const isDirection = (value: unknown): value is Direction =>
  value === "ASC" || value === "DESC";

const positive = (value: unknown): number | null =>
  typeof value === "number" && value > 0 ? value : null;

const nonEmpty = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/** A query string with its keys sorted (a key's values keep their order) */
const sortedQuery = (params: URLSearchParams): string => {
  const sorted = new URLSearchParams(params);
  sorted.sort();
  return sorted.toString();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The sorts the list offers beside these filters */
const offeredSorts = (
  sortOptions: UseListUrlStateOptions["sortOptions"],
  filters: Record<string, unknown>
): SortOptions =>
  typeof sortOptions === "function" ? sortOptions(filters) : sortOptions;

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
    permanentFilters: pagePermanentFilters = NO_FILTERS,
    lockedFields: pageLockedFields = NO_LOCKS,
    viewFilters,
  } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const presetsQuery = useFilterPresets();
  const defaultPresetsQuery = useDefaultPresets();

  const presetContext = context ?? entityType;
  const presetsResolved =
    !presetsQuery.isPending && !defaultPresetsQuery.isPending;

  const contextViews = useMemo(
    () => presetsForContext(presetsQuery.data, presetContext),
    [presetsQuery.data, presetContext]
  );

  const activePreset = useMemo(() => {
    const id = defaultPresetsQuery.data?.defaults[presetContext];
    if (!id) return null;
    return contextViews.find((preset) => preset.id === id) ?? null;
  }, [defaultPresetsQuery.data, contextViews, presetContext]);

  const url = useMemo(
    () => readListParams(searchParams, entityType, filterOptions),
    [searchParams, entityType, filterOptions]
  );

  // Only the user's own Views name one: another user's id names nothing
  const urlView = useMemo(
    () =>
      url.savedView === null
        ? null
        : (contextViews.find((view) => view.id === url.savedView) ?? null),
    [url.savedView, contextViews]
  );
  // The default View is on while the URL names no filter
  const defaultViewShown = activePreset !== null && !url.hasFilters;
  const activeView = urlView ?? (defaultViewShown ? activePreset : null);

  // What the page shows for a presentation field the URL does not name
  const shown = useMemo<WriteListContext["shown"]>(() => {
    const presetView = nonEmpty(activePreset?.viewMode);
    // A saved default view the page lacks (Wall on Performers) opens its first
    const defaultView = viewModes.includes(defaults.viewMode)
      ? defaults.viewMode
      : (viewModes[0] ?? defaults.viewMode);
    return {
      perPage: positive(activePreset?.perPage) ?? defaults.perPage,
      viewMode:
        presetView && viewModes.includes(presetView) ? presetView : defaultView,
      zoomLevel: nonEmpty(activePreset?.zoomLevel) ?? defaults.zoomLevel,
      gridDensity: nonEmpty(activePreset?.gridDensity) ?? defaults.gridDensity,
    };
  }, [activePreset, defaults, viewModes]);

  const view = useMemo<ListView>(
    () => ({
      viewMode:
        url.view !== null && viewModes.includes(url.view)
          ? url.view
          : shown.viewMode,
      timelinePeriod: url.timelinePeriod,
      folderPath: url.folderPath,
    }),
    [url, viewModes, shown]
  );

  // The view's own filters join the page's, and lock their fields too
  const viewOwn = useMemo(
    () => (viewFilters ? viewFilters(view, pagePermanentFilters) : NO_FILTERS),
    [viewFilters, view, pagePermanentFilters]
  );
  const permanentFilters = useMemo(
    () =>
      Object.keys(viewOwn).length === 0
        ? pagePermanentFilters
        : { ...pagePermanentFilters, ...viewOwn },
    [pagePermanentFilters, viewOwn]
  );

  // Equal sets are one dependency, whichever array carries them
  const viewLockedKey = lockedFieldsOf(entityType, viewOwn).join(",");
  const viewLockedFields = useMemo(
    () => (viewLockedKey === "" ? NO_LOCKS : viewLockedKey.split(",")),
    [viewLockedKey]
  );

  const derived = useMemo(() => {
    // The URL's rows on a field the page fixes stay (FILTERS-12); a default
    // View's go, as a loaded View's do (`loadPreset`)
    const filtersBeforeView = url.hasFilters
      ? url.filters
      : withoutLockedFilters(
          entityType,
          // A default preset becomes state without the URL's reader
          normalizePanelState(entityType, activePreset?.filters ?? NO_FILTERS),
          pageLockedFields
        );
    const filters = withoutLockedFilters(
      entityType,
      filtersBeforeView,
      viewLockedFields
    );

    const offered = offeredSorts(sortOptions, {
      ...filters,
      ...permanentFilters,
    });
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
      filtersBeforeView,
      sort: {
        field: sort.field,
        direction: direction ?? defaults.direction,
        seed: sort.field === "random" ? sort.seed : null,
      },
      page: url.page,
      perPage: url.perPage ?? shown.perPage,
      q: url.q ?? "",
      ...view,
      zoomLevel: url.zoom ?? shown.zoomLevel,
      gridDensity: url.gridDensity ?? shown.gridDensity,
    };
  }, [
    url,
    activePreset,
    sortOptions,
    permanentFilters,
    defaults,
    entityType,
    pageLockedFields,
    viewLockedFields,
    view,
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

  // What a write does to `savedView` when it does not name it: a filter or
  // sort edit on the default View names the default (its filters stop
  // applying once the URL names one); an id the user does not have goes
  const savedViewOf = useCallback(
    (patch: ListParamsPatch, edit: boolean): string | null | undefined => {
      if (patch.savedView !== undefined) return patch.savedView;
      if (urlView !== null) return undefined;
      if (
        edit &&
        defaultViewShown &&
        (patch.filters !== undefined || patch.sort !== undefined)
      ) {
        return activePreset.id;
      }
      return url.savedView !== null && presetsResolved ? null : undefined;
    },
    [urlView, defaultViewShown, activePreset, url.savedView, presetsResolved]
  );

  // A write that leaves the address as it is (its keys in any order)
  // navigates nowhere: the router would still add a history entry, a Back
  // step that changes nothing. `edit`: the user changed a filter or the sort
  const write = useCallback(
    (patch: ListParamsPatch, history: "push" | "replace", edit = false) => {
      const savedView = savedViewOf(patch, edit);
      const next = writeListParams(
        searchParams,
        savedView === undefined ? patch : { ...patch, savedView },
        writeContext
      );
      if (sortedQuery(next) === sortedQuery(searchParams)) return;
      setSearchParams(next, { replace: history === "replace" });
    },
    [searchParams, setSearchParams, writeContext, savedViewOf]
  );

  useEffect(() => {
    if (needsSeed) write({ sort: sortValue("random", freshSeed()) }, "replace");
  }, [needsSeed, write]);

  const { sort } = derived;

  const applyFilters = useCallback(
    (next: Record<string, unknown>, opts?: { history?: "push" | "replace" }) =>
      write({ filters: next, page: 1 }, opts?.history ?? "push", true),
    [write]
  );

  // Clear all leaves no View: the list is unfiltered, whatever was named
  const clearFilters = useCallback(
    () => write({ filters: {}, page: 1, savedView: null }, "push"),
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
        "push",
        true
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

  const loadState = useCallback(
    (preset: PresetToLoad, savedView: string | null) => {
      const field = parseSortValue(preset.sort || defaults.sort).field;
      write(
        {
          // A View's rows on a field the page fixes would narrow it to
          // nothing it was saved for: they go as the default View's do
          filters: withoutLockedFilters(
            entityType,
            preset.filters,
            pageLockedFields
          ),
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
          savedView,
        },
        "push"
      );
    },
    [write, defaults, derived.perPage, entityType, pageLockedFields]
  );

  const loadPreset = useCallback(
    (preset: PresetToLoad) => loadState(preset, null),
    [loadState]
  );

  const loadView = useCallback(
    (view: SavedPreset) => loadState(view, view.id),
    [loadState]
  );

  const setActiveView = useCallback(
    (id: string | null) => write({ savedView: id }, "replace"),
    [write]
  );

  // The View as loading it here would apply it: its rows on a field the page
  // fixes dropped, its sort the one this page falls back to when it does
  // not offer the View's (a View sorted by Recommended, opened on Scenes)
  const activeViewModified = useMemo(() => {
    if (activeView === null) return false;
    const isOffered = (field: string) =>
      offeredSorts(sortOptions, {
        ...derived.filters,
        ...permanentFilters,
      }).some((option) => option.value === field);
    const viewField =
      typeof activeView.sort === "string" && activeView.sort !== ""
        ? parseSortValue(activeView.sort).field
        : "";
    const sortOnPage =
      viewField === ""
        ? ""
        : ([viewField, presetSort(activePreset)?.field, defaults.sort].find(
            (field) => field !== undefined && isOffered(field)
          ) ?? DEFAULT_SORT[entityType].field);
    return viewModified(
      entityType,
      {
        filters: withoutLockedFilters(
          entityType,
          normalizePanelState(
            entityType,
            isRecord(activeView.filters) ? activeView.filters : NO_FILTERS
          ),
          pageLockedFields
        ),
        sort: sortOnPage,
        direction: activeView.direction,
      },
      {
        filters: derived.filtersBeforeView,
        sort: derived.sort.field,
        direction: derived.sort.direction,
      }
    );
  }, [
    activeView,
    activePreset,
    sortOptions,
    derived,
    permanentFilters,
    defaults.sort,
    entityType,
    pageLockedFields,
  ]);

  const query = useMemo(
    () => buildListQuery(entityType, { ...derived, ready }, permanentFilters),
    [entityType, derived, ready, permanentFilters]
  );

  return {
    ...derived,
    permanentFilters,
    viewLockedFields,
    activePreset,
    activeView,
    activeViewModified,
    ready,
    listKey: listKeyOf(query),
    listKeyWithoutPage: listKeyWithoutPageOf(query),
    applyFilters,
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
    loadView,
    setActiveView,
  };
}
