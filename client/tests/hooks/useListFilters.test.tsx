/**
 * useListFilters: Contract 11's hook over `useListUrlState`'s filters and
 * `applyFilters`, seeded through the URL, asserting the URL and the history
 * actions after each change.
 */
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { actAsync, must } from "@tests/testUtils";
import { describe, expect, it, vi } from "vitest";
import {
  defaultPresetsQueryOptions,
  presetsQueryOptions,
} from "@/api/hooks/usePresets";
import { type ListFilters, useListFilters } from "@/hooks/useListFilters";
import {
  type UseListUrlStateOptions,
  useListUrlState,
} from "@/hooks/useListUrlState";
import { SCENE_FILTER_OPTIONS } from "@/utils/filterConfig";

vi.mock("@/api", () => ({
  apiGet: vi.fn(() => new Promise(() => {})),
}));

const SCENE_OPTIONS: UseListUrlStateOptions = {
  entityType: "scene",
  filterOptions: SCENE_FILTER_OPTIONS,
  sortOptions: [{ value: "o_counter" }, { value: "date" }],
  viewModes: ["grid", "timeline"],
  defaults: {
    sort: "o_counter",
    direction: "DESC",
    perPage: 24,
    viewMode: "grid",
    zoomLevel: "medium",
    gridDensity: "medium",
  },
};

function renderFilters(url: string, options = SCENE_OPTIONS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(presetsQueryOptions.queryKey, { presets: {} });
  queryClient.setQueryData(defaultPresetsQueryOptions.queryKey, {
    defaults: {},
  });
  const current: { filters: ListFilters | null } = { filters: null };
  const Probe = () => {
    const listState = useListUrlState(options);
    current.filters = useListFilters("scene", listState, options.filterOptions);
    return null;
  };
  const router = createMemoryRouter([{ path: "*", element: <Probe /> }], {
    initialEntries: [url],
  });
  const actions: string[] = [];
  let last = router.state.location;
  router.subscribe((next) => {
    if (next.location === last) return;
    last = next.location;
    actions.push(next.historyAction);
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return {
    get filters() {
      return must(current.filters, "list filters");
    },
    actions,
    params: () => new URLSearchParams(router.state.location.search),
  };
}

describe("useListFilters", () => {
  it("commit(next, { history: 'replace' }) replaces the URL entry and resets the page", async () => {
    const list = renderFilters("/scenes?page=3");
    await actAsync(() =>
      list.filters.commit({ favorite: true }, { history: "replace" })
    );
    expect(list.actions).toEqual(["REPLACE"]);
    expect(list.params().get("favorite")).toBe("true");
    expect(list.params().has("page")).toBe(false);
  });

  it("commit without history pushes", async () => {
    const list = renderFilters("/scenes");
    await actAsync(() => list.filters.commit({ favorite: true }));
    expect(list.actions).toEqual(["PUSH"]);
  });

  it("setRow with no history pushes, and changes only that row", async () => {
    const list = renderFilters("/scenes?tagIds=1:a&2.tagIds=2:a&favorite=true");
    await actAsync(() =>
      list.filters.setRow(
        { group: 0, occurrence: 2, key: "tagIds" },
        { tagIds: ["9:a"] }
      )
    );
    expect(list.actions).toEqual(["PUSH"]);
    expect(list.params().get("tagIds")).toBe("1:a");
    expect(list.params().get("2.tagIds")).toBe("9:a");
    expect(list.params().get("favorite")).toBe("true");
  });

  it("setRow with history replace replaces the entry", async () => {
    const list = renderFilters("/scenes?tagIds=1:a");
    await actAsync(() =>
      list.filters.setRow(
        { group: 0, occurrence: 1, key: "tagIds" },
        { tagIds: ["3:a"] },
        { history: "replace" }
      )
    );
    expect(list.actions).toEqual(["REPLACE"]);
    expect(list.params().get("tagIds")).toBe("3:a");
  });

  it("removeRow renumbers, removeGroup drops the group and clear keeps no row", async () => {
    const list = renderFilters(
      "/scenes?tagIds=1:a&2.tagIds=2:a&g1=any&g1.favorite=true"
    );
    await actAsync(() =>
      list.filters.removeRow({ group: 0, occurrence: 1, key: "tagIds" })
    );
    expect(list.params().get("tagIds")).toBe("2:a");
    expect(list.params().has("2.tagIds")).toBe(false);

    await actAsync(() => list.filters.removeGroup(1));
    expect(list.params().has("g1")).toBe(false);
    expect(list.params().has("g1.favorite")).toBe(false);
    expect(list.params().get("tagIds")).toBe("2:a");

    await actAsync(() => list.filters.clear());
    expect(list.params().has("tagIds")).toBe(false);
    expect(list.params().get("filters")).toBe("none");
  });

  it("`tree` is `treeOf(filters)`: a URL with `2.tagIds` gives two root Tags rows, and `g1=any&g1.tagFavorite=true` one any group", () => {
    const rows = renderFilters("/scenes?tagIds=1:a&2.tagIds=2:a");
    expect(rows.filters.tree.rows.map((row) => row.field.key)).toEqual([
      "tagIds",
      "tagIds",
    ]);

    const group = renderFilters("/scenes?g1=any&g1.tagFavorite=true");
    expect(group.filters.tree.rows).toEqual([]);
    expect(group.filters.tree.groups).toHaveLength(1);
    const first = must(group.filters.tree.groups[0], "group 1");
    expect(first.match).toBe("any");
    expect(first.rows.map((row) => row.field.key)).toEqual(["tagFavorite"]);
  });

  it("options leave out view-locked fields only", () => {
    const options: UseListUrlStateOptions = {
      ...SCENE_OPTIONS,
      permanentFilters: {
        performers: { value: ["1:abc"], modifier: "INCLUDES" },
      },
      lockedFields: ["performers"],
      viewFilters: ({ viewMode }) =>
        viewMode === "timeline"
          ? { date: { start: "2024-03-01", end: "2024-03-31" } }
          : {},
    };
    const keys = (url: string) =>
      renderFilters(url, options).filters.options.map((option) => option.key);

    const grid = keys("/scenes");
    expect(grid).toContain("date");
    // the page's own lock is offered (AND-ed with the page's criterion)
    expect(grid).toContain("performerIds");

    const timeline = keys("/scenes?view=timeline");
    expect(timeline).not.toContain("date");
    expect(timeline).toContain("performerIds");
  });
});
