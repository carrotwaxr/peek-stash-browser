/**
 * useListUrlState: list state derived from the URL and the cached presets.
 * Ports the expectations of the useFilterState tests (initial state, preset
 * precedence, view mode), seeded by URL and asserting the URL after each
 * action.
 */
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { type FilterPreset, Q_MAX_LENGTH } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { actAsync, must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type SavedPreset,
  defaultPresetsQueryOptions,
  presetsQueryOptions,
} from "@/api/hooks/usePresets";
import {
  type ListUrlState,
  type ListView,
  type UseListUrlStateOptions,
  useListUrlState,
} from "@/hooks/useListUrlState";
import {
  GALLERY_FILTER_OPTIONS,
  PERFORMER_FILTER_OPTIONS,
  SCENE_FILTER_OPTIONS,
  TAG_FILTER_OPTIONS,
} from "@/utils/filterConfig";
import { sortOptionsFor } from "@/utils/listQuery";

// Presets come from the query cache; a request only happens in the
// "presets still loading" case, which never answers
vi.mock("@/api", () => ({
  apiGet: vi.fn(() => new Promise(() => {})),
}));

const SORTS = [
  { value: "o_counter" },
  { value: "rating" },
  { value: "date" },
  { value: "title" },
  { value: "random" },
];

const SCENE_OPTIONS: UseListUrlStateOptions = {
  entityType: "scene",
  filterOptions: SCENE_FILTER_OPTIONS,
  sortOptions: SORTS,
  viewModes: ["grid", "wall", "table", "timeline", "folder"],
  defaults: {
    sort: "o_counter",
    direction: "DESC",
    perPage: 24,
    viewMode: "grid",
    zoomLevel: "medium",
    gridDensity: "medium",
  },
};

const PERFORMER_OPTIONS: UseListUrlStateOptions = {
  ...SCENE_OPTIONS,
  entityType: "performer",
  filterOptions: PERFORMER_FILTER_OPTIONS,
  viewModes: ["grid", "table"],
};

const TAG_OPTIONS: UseListUrlStateOptions = {
  ...SCENE_OPTIONS,
  entityType: "tag",
  filterOptions: TAG_FILTER_OPTIONS,
  sortOptions: [{ value: "name" }, { value: "scene_count" }],
  viewModes: ["grid", "table", "hierarchy"],
  defaults: { ...SCENE_OPTIONS.defaults, sort: "name" },
};

const GALLERY_OPTIONS: UseListUrlStateOptions = {
  ...SCENE_OPTIONS,
  entityType: "gallery",
  filterOptions: GALLERY_FILTER_OPTIONS,
  sortOptions: [{ value: "title" }, { value: "rating" }],
  viewModes: ["grid", "table", "timeline", "folder"],
  defaults: { ...SCENE_OPTIONS.defaults, sort: "title" },
};

const preset = (
  fields: Omit<Partial<SavedPreset>, "tableColumns"> = {}
): SavedPreset & FilterPreset => ({
  id: "p1",
  name: "Default",
  filters: {},
  sort: "rating",
  direction: "ASC",
  ...fields,
});

/** A default preset for a context, or "pending" for presets still loading */
type Presets = { context: string; preset: FilterPreset } | "pending" | null;

function renderList(
  url: string,
  options: UseListUrlStateOptions = SCENE_OPTIONS,
  presets: Presets = null
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (presets !== "pending") {
    queryClient.setQueryData(presetsQueryOptions.queryKey, {
      presets: presets ? { [presets.context]: [presets.preset] } : {},
    });
    queryClient.setQueryData(defaultPresetsQueryOptions.queryKey, {
      defaults: presets ? { [presets.context]: presets.preset.id } : {},
    });
  }
  const current: { state: ListUrlState | null } = { state: null };
  const Probe = () => {
    current.state = useListUrlState(options);
    return null;
  };
  const router = createMemoryRouter([{ path: "*", element: <Probe /> }], {
    initialEntries: [url],
  });
  // One entry per navigation: PUSH, REPLACE or POP
  const actions: string[] = [];
  let last = router.state.location;
  router.subscribe((next) => {
    if (next.location === last) return;
    last = next.location;
    actions.push(next.historyAction);
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return {
    get state() {
      return must(current.state, "list state");
    },
    router,
    actions,
    params: () => new URLSearchParams(router.state.location.search),
    url: () => router.state.location.pathname + router.state.location.search,
    unmount: view.unmount,
  };
}

describe("useListUrlState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("reading the URL", () => {
    it("reads the defaults from an empty URL", () => {
      const list = renderList("/scenes");
      expect(list.state.ready).toBe(true);
      expect(list.state.sort).toEqual({
        field: "o_counter",
        direction: "DESC",
        seed: null,
      });
      expect(list.state.page).toBe(1);
      expect(list.state.perPage).toBe(24);
      expect(list.state.filters).toEqual({});
      expect(list.state.q).toBe("");
      expect(list.state.viewMode).toBe("grid");
      expect(list.state.activePreset).toBeNull();
      expect(list.actions).toEqual([]);
    });

    it("reads filters, sort and page from the URL", () => {
      const list = renderList("/scenes?favorite=true&sort=rating&page=2");
      expect(list.state.filters).toEqual({ favorite: true });
      expect(list.state.sort.field).toBe("rating");
      expect(list.state.page).toBe(2);
    });

    it("Back after page 2 reads page 1", async () => {
      const list = renderList("/scenes");
      await actAsync(() => list.state.setPage(2));
      expect(list.state.page).toBe(2);
      expect(list.params().get("page")).toBe("2");

      await act(() => list.router.navigate(-1));
      expect(list.state.page).toBe(1);
    });

    it("a sidebar link to the same list clears its filters", async () => {
      const list = renderList("/scenes?favorite=true");
      expect(list.state.filters).toEqual({ favorite: true });

      await act(() => list.router.navigate("/scenes"));
      expect(list.state.filters).toEqual({});
    });

    it("a sort the list does not offer reads as the default sort", () => {
      expect(renderList("/scenes?sort=bogus").state.sort.field).toBe(
        "o_counter"
      );
    });

    it("Scene Number reads as the default sort without an including collection", () => {
      const options: UseListUrlStateOptions = {
        ...SCENE_OPTIONS,
        sortOptions: (filters) => sortOptionsFor("scene", filters),
      };
      expect(
        renderList("/scenes?sort=scene_index", options).state.sort.field
      ).toBe("o_counter");
      expect(
        renderList("/scenes?sort=scene_index&groupIds=3:abc", options).state
          .sort.field
      ).toBe("scene_index");
      expect(
        renderList("/scenes?sort=scene_index", {
          ...options,
          permanentFilters: {
            groups: { value: ["3:abc"], modifier: "INCLUDES" },
          },
        }).state.sort.field
      ).toBe("scene_index");
    });

    it("a view the page lacks reads as the default view", () => {
      expect(
        renderList("/performers?view=wall", PERFORMER_OPTIONS).state.viewMode
      ).toBe("grid");
    });

    it("a q longer than Q_MAX_LENGTH is read truncated", () => {
      const long = "a".repeat(Q_MAX_LENGTH + 50);
      expect(renderList(`/scenes?q=${long}`).state.q).toBe(
        "a".repeat(Q_MAX_LENGTH)
      );
    });

    it("per page is clamped and a page below 1 reads as 1", () => {
      const list = renderList("/scenes?per_page=9999&page=-3");
      expect(list.state.perPage).toBe(250);
      expect(list.state.page).toBe(1);
    });

    it("ready is false while the presets load, and the URL reads at once", () => {
      const list = renderList(
        "/galleries?view=folder",
        GALLERY_OPTIONS,
        "pending"
      );
      expect(list.state.ready).toBe(false);
      expect(list.state.viewMode).toBe("folder");
      expect(list.state.listKey).toBe("");
    });
  });

  describe("the default preset", () => {
    const favoritePreset = {
      context: "scene",
      preset: preset({ filters: { favorite: true }, perPage: 48 }),
    };

    it("applies whole when the URL names no filter", () => {
      const list = renderList("/scenes", SCENE_OPTIONS, favoritePreset);
      expect(list.state.filters).toEqual({ favorite: true });
      expect(list.state.sort).toEqual({
        field: "rating",
        direction: "ASC",
        seed: null,
      });
      expect(list.state.perPage).toBe(48);
      expect(list.state.activePreset?.id).toBe("p1");
    });

    it("instance and tab in the URL keep the default preset's filters", () => {
      const list = renderList(
        "/scenes?instance=abc&tab=scenes&sort=title&view=wall&page=2",
        SCENE_OPTIONS,
        favoritePreset
      );
      expect(list.state.filters).toEqual({ favorite: true });
      expect(list.state.sort.field).toBe("title");
      expect(list.state.viewMode).toBe("wall");
      expect(list.state.page).toBe(2);
    });

    it("gives only its sort when the URL has filters", () => {
      const list = renderList("/performers?tagId=123", PERFORMER_OPTIONS, {
        context: "performer",
        preset: preset({ filters: { favorite: true } }),
      });
      expect(list.state.filters).toEqual({ tagIds: ["123"] });
      expect(list.state.sort).toEqual({
        field: "rating",
        direction: "ASC",
        seed: null,
      });
    });

    it("rating_min alone disables the preset's filters", () => {
      const list = renderList(
        "/scenes?rating_min=60",
        SCENE_OPTIONS,
        favoritePreset
      );
      expect(list.state.filters).toEqual({ rating: { min: "60" } });
    });

    it("clearFilters with a filtering default preset shows the unfiltered list and Back restores the filters", async () => {
      const list = renderList("/scenes", SCENE_OPTIONS, favoritePreset);
      expect(list.state.filters).toEqual({ favorite: true });

      await actAsync(() => list.state.clearFilters());
      expect(list.state.filters).toEqual({});
      expect(list.params().get("filters")).toBe("none");
      expect(list.state.listKey).not.toContain("none");

      await act(() => list.router.navigate(-1));
      expect(list.state.filters).toEqual({ favorite: true });
    });

    it("removing the last chip leaves the list unfiltered", async () => {
      const list = renderList(
        "/scenes?rating_min=60",
        SCENE_OPTIONS,
        favoritePreset
      );

      await actAsync(() => list.state.removeFilter("rating"));
      expect(list.params().has("rating_min")).toBe(false);
      expect(list.state.filters).toEqual({});

      // A later filter write drops the marker
      await actAsync(() => list.state.applyFilters({ rating: { min: "80" } }));
      expect(list.params().has("filters")).toBe(false);
      expect(list.state.filters).toEqual({ rating: { min: "80" } });
    });

    it("loading a preset with no filters leaves the list unfiltered", async () => {
      const list = renderList("/scenes", SCENE_OPTIONS, favoritePreset);

      await actAsync(() => list.state.loadPreset(preset({ filters: {} })));
      expect(list.state.filters).toEqual({});
    });

    it("a bare list URL still applies the default preset", async () => {
      const list = renderList(
        "/scenes?filters=none",
        SCENE_OPTIONS,
        favoritePreset
      );
      expect(list.state.filters).toEqual({});

      await act(() => list.router.navigate("/scenes"));
      expect(list.state.filters).toEqual({ favorite: true });
    });

    it("sort and per page fall back to the preset one field at a time", () => {
      const bySort = renderList(
        "/scenes?sort=date",
        SCENE_OPTIONS,
        favoritePreset
      );
      expect(bySort.state.sort).toEqual({
        field: "date",
        direction: "ASC",
        seed: null,
      });
      expect(bySort.state.perPage).toBe(48);
      bySort.unmount();

      const byPerPage = renderList(
        "/scenes?per_page=12",
        SCENE_OPTIONS,
        favoritePreset
      );
      expect(byPerPage.state.sort.field).toBe("rating");
      expect(byPerPage.state.perPage).toBe(12);
    });

    it("the URL's sort and direction win over the preset's", () => {
      const list = renderList(
        "/scenes?sort=date&dir=DESC",
        SCENE_OPTIONS,
        favoritePreset
      );
      expect(list.state.sort).toEqual({
        field: "date",
        direction: "DESC",
        seed: null,
      });
    });

    it("gives per page with URL filters that name none", () => {
      const list = renderList(
        "/scenes?favorite=true",
        SCENE_OPTIONS,
        favoritePreset
      );
      expect(list.state.perPage).toBe(48);
    });

    it("choosing 24 per page over a preset's 48 survives a remount", async () => {
      const first = renderList("/scenes", SCENE_OPTIONS, favoritePreset);
      expect(first.state.perPage).toBe(48);
      await actAsync(() => first.state.setPerPage(24));
      expect(first.params().get("per_page")).toBe("24");
      const url = first.url();
      first.unmount();

      const second = renderList(url, SCENE_OPTIONS, favoritePreset);
      expect(second.state.perPage).toBe(24);
      await actAsync(() => second.state.setPerPage(48));
      expect(second.params().has("per_page")).toBe(false);
      expect(second.state.perPage).toBe(48);
    });

    it("gives its view mode, and the default view applies without one", () => {
      const hierarchy = renderList("/tags", TAG_OPTIONS, {
        context: "tag",
        preset: preset({ sort: "name", viewMode: "hierarchy" }),
      });
      expect(hierarchy.state.viewMode).toBe("hierarchy");
      hierarchy.unmount();

      const table = renderList("/tags", TAG_OPTIONS, {
        context: "tag",
        preset: preset({ sort: "scene_count", viewMode: "table" }),
      });
      expect(table.state.viewMode).toBe("table");
      table.unmount();

      expect(renderList("/tags", TAG_OPTIONS).state.viewMode).toBe("grid");
    });

    it("a preset's random sort gets a seed written with one replace", async () => {
      const list = renderList("/scenes", SCENE_OPTIONS, {
        context: "scene",
        preset: preset({ sort: "random", filters: { favorite: true } }),
      });
      await waitFor(() => expect(list.state.ready).toBe(true));
      expect(list.params().get("sort")).toMatch(/^random_\d{8}$/);
      expect(list.actions).toEqual(["REPLACE"]);
      expect(list.state.filters).toEqual({ favorite: true });
    });
  });

  describe("fields the page fixes", () => {
    it("a preset's tagIds is ignored where tags are locked", () => {
      const list = renderList(
        "/performer/1?tab=galleries",
        { ...GALLERY_OPTIONS, lockedFields: ["tags"] },
        {
          context: "gallery",
          preset: preset({
            filters: {
              tagIds: ["9:abc"],
              tagIdsModifier: "EXCLUDES",
              tagIdsDepth: -1,
              favorite: true,
            },
          }),
        }
      );
      expect(list.state.filters).toEqual({ favorite: true });
    });

    it("the URL's filter on a locked field is ignored, companions included", () => {
      const list = renderList(
        "/performer/1?performerIds=9:abc&performerIdsModifier=EXCLUDES&favorite=true",
        { ...SCENE_OPTIONS, lockedFields: ["performers"] }
      );
      expect(list.state.filters).toEqual({ favorite: true });
    });

    it("locks nothing that is not named", () => {
      const list = renderList("/scenes?performerIds=9:abc&tagIds=4:abc", {
        ...SCENE_OPTIONS,
        lockedFields: ["tags"],
      });
      expect(Object.keys(list.state.filters)).toEqual(["performerIds"]);
    });

    it("a write drops the locked field's stale keys from the URL", async () => {
      const list = renderList(
        "/scenes?performerIds=9:abc&performerIdsModifier=EXCLUDES&favorite=true",
        { ...SCENE_OPTIONS, lockedFields: ["performers"] }
      );
      await actAsync(() => list.state.removeFilter("favorite"));
      expect(list.params().has("performerIds")).toBe(false);
      expect(list.params().has("performerIdsModifier")).toBe(false);
      expect(list.params().has("favorite")).toBe(false);
    });
  });

  describe("a view's own filters", () => {
    /** The open folder as `tags`, only in folder view */
    const folderTags = ({ viewMode, folderPath }: ListView) =>
      viewMode === "folder" && folderPath.length > 0
        ? { tags: { value: folderPath.slice(-1), modifier: "INCLUDES" } }
        : {};

    it("join the permanent filters and lock their field, only in their view", () => {
      const inFolder = renderList(
        "/galleries?view=folder&folderPath=5:a&tagIds=9:a&favorite=true",
        { ...GALLERY_OPTIONS, viewFilters: folderTags }
      );
      expect(inFolder.state.permanentFilters).toEqual({
        tags: { value: ["5:a"], modifier: "INCLUDES" },
      });
      expect(inFolder.state.filters).toEqual({ favorite: true });
      inFolder.unmount();

      const inGrid = renderList("/galleries?folderPath=5:a&tagIds=9:a", {
        ...GALLERY_OPTIONS,
        viewFilters: folderTags,
      });
      expect(inGrid.state.permanentFilters).toEqual({});
      expect(inGrid.state.filters).toEqual({ tagIds: ["9:a"] });
    });
  });

  describe("view mode in the URL", () => {
    it("reads it and leaves it in the URL", () => {
      const list = renderList("/galleries?view=folder", GALLERY_OPTIONS);
      expect(list.state.viewMode).toBe("folder");
      expect(list.params().get("view")).toBe("folder");
      expect(list.actions).toEqual([]);
    });

    it("restores it after a remount", () => {
      renderList("/galleries?view=folder", GALLERY_OPTIONS).unmount();
      expect(
        renderList("/galleries?view=folder", GALLERY_OPTIONS).state.viewMode
      ).toBe("folder");
    });

    it("leaving the timeline drops its period", async () => {
      const list = renderList("/scenes?view=timeline&timeline_period=2024-03");
      expect(list.state.timelinePeriod).toBe("2024-03");
      await actAsync(() => list.state.setViewMode("grid"));
      expect(list.params().has("timeline_period")).toBe(false);
      expect(list.params().has("view")).toBe(false);
    });
  });

  describe("writing the URL", () => {
    it("writing a filter keeps tab, instance, includeSubTags and image", async () => {
      const list = renderList(
        "/performer/1?tab=scenes&instance=abc&includeSubTags=true&image=5:abc&page=4"
      );
      await actAsync(() => list.state.applyFilters({ favorite: true }));
      const params = list.params();
      expect(params.get("tab")).toBe("scenes");
      expect(params.get("instance")).toBe("abc");
      expect(params.get("includeSubTags")).toBe("true");
      expect(params.get("image")).toBe("5:abc");
      expect(params.get("favorite")).toBe("true");
      expect(params.has("page")).toBe(false);
    });

    it("per page, view, zoom and density replace the entry; filters, sort, page and folder push", async () => {
      const list = renderList("/scenes");
      await actAsync(() => list.state.setPerPage(48));
      await actAsync(() => list.state.setViewMode("wall"));
      await actAsync(() => list.state.setZoomLevel("large"));
      await actAsync(() => list.state.setGridDensity("small"));
      await actAsync(() => list.state.setQuery("beach"));
      await actAsync(() => list.state.setTimelinePeriod("2024-03"));
      await actAsync(() => list.state.setPage(3, { history: "replace" }));
      expect(list.actions).toEqual(Array<string>(7).fill("REPLACE"));

      list.actions.length = 0;
      await actAsync(() => list.state.applyFilters({ favorite: true }));
      await actAsync(() => list.state.clearFilters());
      await actAsync(() => list.state.applyFilters({ favorite: true }));
      await actAsync(() => list.state.removeFilter("favorite"));
      await actAsync(() => list.state.setSort("rating"));
      await actAsync(() => list.state.setPage(2));
      await actAsync(() => list.state.setFolderPath(["5:abc"]));
      await actAsync(() => list.state.loadPreset(preset()));
      expect(list.actions).toEqual(Array<string>(8).fill("PUSH"));
    });

    it("setPage writes the page, omitted at 1", async () => {
      const list = renderList("/scenes");
      await actAsync(() => list.state.setPage(3));
      expect(list.state.page).toBe(3);
      expect(list.params().get("page")).toBe("3");
      await actAsync(() => list.state.setPage(1));
      expect(list.params().has("page")).toBe(false);
    });

    it("setSort writes sort and direction, and toggles the direction of the same field", async () => {
      const list = renderList("/scenes?page=2");
      await actAsync(() => list.state.setSort("rating", "ASC"));
      expect(list.params().get("sort")).toBe("rating");
      expect(list.params().get("dir")).toBe("ASC");
      expect(list.params().has("page")).toBe(false);
      await actAsync(() => list.state.setSort("date"));
      expect(list.state.sort.direction).toBe("DESC");
      await actAsync(() => list.state.setSort("date"));
      expect(list.state.sort.direction).toBe("ASC");
    });

    it("applyFilters and removeFilter reset the page", async () => {
      const list = renderList("/scenes?page=3");
      await actAsync(() => list.state.applyFilters({ favorite: true }));
      expect(list.state.filters).toEqual({ favorite: true });
      expect(list.state.page).toBe(1);

      await actAsync(() => list.state.setPage(3));
      await actAsync(() => list.state.removeFilter("favorite"));
      expect(list.state.filters).toEqual({});
      expect(list.params().has("favorite")).toBe(false);
      expect(list.params().has("page")).toBe(false);
    });

    it("clearFilters removes the panel's filters and never writes the permanent ones", async () => {
      const list = renderList("/scenes?favorite=true&tagIds=1:abc", {
        ...SCENE_OPTIONS,
        permanentFilters: { studios: { value: ["456:abc"] } },
      });
      await actAsync(() => list.state.clearFilters());
      expect(list.state.filters).toEqual({});
      expect(list.url()).toBe("/scenes?filters=none");
    });

    it("setQuery writes q and resets the page", async () => {
      const list = renderList("/scenes?page=2");
      await actAsync(() => list.state.setQuery("test query"));
      expect(list.state.q).toBe("test query");
      expect(list.params().get("q")).toBe("test query");
      expect(list.state.page).toBe(1);
    });

    it("setQuery with the search the URL already holds writes nothing", async () => {
      const list = renderList("/scenes?q=beach&page=2");
      await actAsync(() => list.state.setQuery("beach"));
      expect(list.actions).toEqual([]);
      expect(list.state.page).toBe(2);
    });

    it("a change that leaves the address as it is adds no history entry", async () => {
      const list = renderList(
        "/galleries?view=folder&favorite=true&folderPath=1:abc",
        GALLERY_OPTIONS
      );
      // Apply with no edits, the open folder, the filters already shown
      await actAsync(() => list.state.applyFilters(list.state.filters));
      await actAsync(() => list.state.setFolderPath(["1:abc"]));
      expect(list.actions).toEqual([]);

      const same = preset({ filters: { favorite: true }, viewMode: "grid" });
      await actAsync(() => list.state.loadPreset(same));
      expect(list.actions).toEqual(["PUSH"]);
      await actAsync(() => list.state.loadPreset(same));
      expect(list.actions).toEqual(["PUSH"]);
    });

    it("setFolderPath writes the path and resets the page", async () => {
      const list = renderList("/galleries?view=folder&page=2", GALLERY_OPTIONS);
      await actAsync(() => list.state.setFolderPath(["1:abc", "2:abc"]));
      expect(list.state.folderPath).toEqual(["1:abc", "2:abc"]);
      expect(list.params().get("folderPath")).toBe("1:abc,2:abc");
      expect(list.params().has("page")).toBe(false);
    });

    it("loadPreset writes the preset's filters, sort and per page and drops the timeline period", async () => {
      const list = renderList("/scenes?timeline_period=2024-03&page=2");
      await actAsync(() =>
        list.state.loadPreset(
          preset({ filters: { favorite: true }, perPage: 48, viewMode: "wall" })
        )
      );
      expect(list.state.filters).toEqual({ favorite: true });
      expect(list.state.sort).toEqual({
        field: "rating",
        direction: "ASC",
        seed: null,
      });
      expect(list.state.perPage).toBe(48);
      expect(list.state.viewMode).toBe("wall");
      expect(list.state.timelinePeriod).toBeNull();
      expect(list.state.page).toBe(1);
    });

    it("a random sort keeps its seed across a remount", async () => {
      const first = renderList("/scenes");
      await actAsync(() => first.state.setSort("random"));
      expect(first.params().get("sort")).toMatch(/^random_\d{8}$/);
      const seed = must(first.state.sort.seed, "seed");

      // Toggling the direction keeps the order's seed
      await actAsync(() => first.state.setSort("random"));
      expect(first.state.sort.seed).toBe(seed);
      const url = first.url();
      first.unmount();

      const second = renderList(url);
      expect(second.state.sort).toEqual({
        field: "random",
        direction: "ASC",
        seed,
      });
    });

    it("a bare sort=random gets a seed with one replace", async () => {
      const list = renderList("/scenes?sort=random");
      await waitFor(() => expect(list.state.ready).toBe(true));
      expect(list.params().get("sort")).toMatch(/^random_\d{8}$/);
      expect(list.actions).toEqual(["REPLACE"]);
    });

    it("listKey follows the page; listKeyWithoutPage does not", async () => {
      const list = renderList("/scenes");
      const { listKey, listKeyWithoutPage } = list.state;
      expect(listKey).not.toBe("");
      await actAsync(() => list.state.setPage(2));
      expect(list.state.listKey).not.toBe(listKey);
      expect(list.state.listKeyWithoutPage).toBe(listKeyWithoutPage);
    });
  });
});
