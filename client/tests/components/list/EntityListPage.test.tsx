/**
 * The one list page: its state in the URL, its page through the entity's
 * list hook and the query cache. Each case runs the page as the app does
 * (`renderListPage`), with the library API mocked and the cards stubbed.
 */
import type { ComponentType } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { must, renderListPage } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EntityListPage from "@/components/list/EntityListPage";
import { PERFORMER_LIST } from "@/components/list/listPageConfigs";
import Groups from "@/components/pages/Groups";
import Performers from "@/components/pages/Performers";
import Studios from "@/components/pages/Studios";
import Tags from "@/components/pages/Tags";

type Find = (params: Record<string, unknown>) => Promise<unknown>;

const { api, cardProps } = vi.hoisted(() => ({
  api: {
    findPerformers: vi.fn<Find>(),
    findStudios: vi.fn<Find>(),
    findGroups: vi.fn<Find>(),
    findTags: vi.fn<Find>(),
    findTagTree: vi.fn<() => Promise<unknown>>(),
  },
  cardProps: vi.fn<(props: Record<string, unknown>) => void>(),
}));

// The list hooks read the library module; the pickers and presets the barrel
vi.mock("@/api/library", () => ({ libraryApi: api }));
vi.mock("@/api", () => ({
  apiGet: vi.fn().mockResolvedValue({}),
  apiPost: vi.fn().mockResolvedValue({}),
  apiPut: vi.fn().mockResolvedValue({}),
  apiDelete: vi.fn().mockResolvedValue({}),
  libraryApi: {
    ...api,
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
    findStudiosMinimal: vi.fn().mockResolvedValue([]),
    findTagsMinimal: vi.fn().mockResolvedValue([]),
    findGroupsMinimal: vi.fn().mockResolvedValue([]),
    findGalleriesMinimal: vi.fn().mockResolvedValue([]),
  },
}));

/** A card stub: its entity's name, and a Hide button that reports the hide */
const { stubCard } = vi.hoisted(() => ({
  stubCard:
    (type: string, prop: string) => (props: Record<string, unknown>) => {
      cardProps(props);
      const item = props[prop] as {
        id: string;
        instanceId: string;
        name: string;
      };
      const onHide = props.onHideSuccess as (
        id: string,
        type: string,
        instanceId: string
      ) => void;
      return (
        <div data-testid="card">
          {item.name}
          <button onClick={() => onHide(item.id, type, item.instanceId)}>
            Hide {item.name}
          </button>
        </div>
      );
    },
}));

vi.mock("@/components/cards/index", () => ({
  PerformerCard: stubCard("performer", "performer"),
  StudioCard: stubCard("studio", "studio"),
  GroupCard: stubCard("group", "group"),
  TagCard: stubCard("tag", "tag"),
}));
vi.mock("@/components/tags/index", () => ({
  TagHierarchyView: ({
    tags,
    isLoading,
  }: {
    tags: readonly unknown[];
    isLoading: boolean;
  }) => (
    <div
      data-testid="hierarchy-view"
      data-count={tags.length}
      data-loading={String(isLoading)}
    />
  ),
}));

type Row = { id: string; instanceId: string; name: string };

/** Each list page: its route, request, response shape and card shape */
const PAGES: {
  entity: string;
  Page: ComponentType;
  path: string;
  find: "findPerformers" | "findStudios" | "findGroups" | "findTags";
  items: string;
  empty: string;
  aspect: string;
}[] = [
  {
    entity: "performers",
    Page: Performers,
    path: "/performers",
    find: "findPerformers",
    items: "performers",
    empty: "No performers found",
    aspect: "portrait",
  },
  {
    entity: "studios",
    Page: Studios,
    path: "/studios",
    find: "findStudios",
    items: "studios",
    empty: "No studios found",
    aspect: "landscape",
  },
  {
    entity: "groups",
    Page: Groups,
    path: "/collections",
    find: "findGroups",
    items: "groups",
    empty: "No collections found",
    aspect: "portrait",
  },
  {
    entity: "tags",
    Page: Tags,
    path: "/tags",
    find: "findTags",
    items: "tags",
    empty: "No tags found",
    aspect: "landscape",
  },
];

/** A list response for a page's request: these rows and the list's total */
const response = (
  find: string,
  items: string,
  rows: readonly Row[],
  count: number
) => ({ [find]: { count, [items]: rows } });

/** Rows named `<prefix>-<n>` on inst-a */
const rowsOf = (prefix: string, n = 2): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    instanceId: "inst-a",
    name: `${prefix}-${i}`,
  }));

const pageOf = (params: Record<string, unknown>) =>
  (params.filter as { page: number }).page;

beforeEach(() => {
  vi.clearAllMocks();
  for (const { find, items } of PAGES) {
    api[find].mockResolvedValue(response(find, items, [], 0));
  }
  api.findTagTree.mockResolvedValue({ tags: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(PAGES)(
  "EntityListPage: $entity",
  ({ Page, path, find, items, empty, aspect }) => {
    it(`shows '${empty}' when nothing matches`, async () => {
      renderListPage(<Page />, { initialEntries: [`${path}?q=zzz`] });

      expect(await screen.findByText(empty)).toBeInTheDocument();
      expect(
        screen.getByText("Try adjusting your search filters")
      ).toBeInTheDocument();
    });

    it("shows min(per_page, 24) skeletons of the entity's shape while loading", async () => {
      api[find].mockReturnValue(new Promise(() => {}));

      const small = renderListPage(<Page />, {
        initialEntries: [`${path}?per_page=12`],
      });
      const twelve = await screen.findAllByTestId("list-skeleton");
      expect(twelve).toHaveLength(12);
      for (const skeleton of twelve) {
        expect(skeleton).toHaveAttribute("data-aspect", aspect);
      }
      small.unmount();

      renderListPage(<Page />, { initialEntries: [`${path}?per_page=48`] });
      expect(await screen.findAllByTestId("list-skeleton")).toHaveLength(24);
    });

    it("an empty result stays out of view while the next query loads", async () => {
      const { router } = renderListPage(<Page />, {
        initialEntries: [`${path}?q=zzz`],
      });
      expect(await screen.findByText(empty)).toBeInTheDocument();

      // The next list (no search) is in flight, the empty one its placeholder
      api[find].mockReturnValue(new Promise(() => {}));
      await act(() => router.navigate(path));

      await waitFor(() =>
        expect(screen.queryByText(empty)).not.toBeInTheDocument()
      );
      expect(
        (await screen.findAllByTestId("list-skeleton")).length
      ).toBeGreaterThan(0);
    });

    it("Back to page 1 shows page 1's items", async () => {
      api[find].mockImplementation((params) =>
        Promise.resolve(response(find, items, rowsOf(`p${pageOf(params)}`), 48))
      );

      const { router } = renderListPage(<Page />, { initialEntries: [path] });
      expect(await screen.findByText("p1-0")).toBeInTheDocument();

      fireEvent.click(
        must(screen.getAllByRole("button", { name: "Next Page" })[0])
      );
      expect(await screen.findByText("p2-0")).toBeInTheDocument();

      await act(() => router.navigate(-1));
      expect(await screen.findByText("p1-0")).toBeInTheDocument();
      expect(screen.queryByText("p2-0")).not.toBeInTheDocument();
    });
  }
);

describe("EntityListPage", () => {
  it("a saved default Wall view on Performers opens the grid", async () => {
    api.findPerformers.mockResolvedValue(
      response("findPerformers", "performers", rowsOf("perf"), 2)
    );

    renderListPage(<Performers />, {
      initialEntries: ["/performers"],
      cardSettings: { performer: { defaultViewMode: "wall" } },
    });

    expect(await screen.findByText("perf-0")).toBeInTheDocument();
    // The grid's density control (S, M, L) shows only in the grid
    expect(
      screen.getAllByRole("button", { name: / size$/ }).length
    ).toBeGreaterThan(0);
  });

  it("page 2 of the same list sends count false and shows page 1's total", async () => {
    api.findPerformers.mockImplementation((params) => {
      const filter = params.filter as { count?: boolean } | undefined;
      const rows = rowsOf(`p${pageOf(params)}`);
      return Promise.resolve(
        filter?.count === false
          ? { findPerformers: { count: null, performers: rows } }
          : response("findPerformers", "performers", rows, 48)
      );
    });

    renderListPage(<Performers />, {
      initialEntries: ["/performers"],
      staleTime: 5 * 60 * 1000,
    });
    expect(await screen.findByText("p1-0")).toBeInTheDocument();

    fireEvent.click(
      must(screen.getAllByRole("button", { name: "Next Page" })[0])
    );
    expect(await screen.findByText("p2-0")).toBeInTheDocument();

    const page2 = must(api.findPerformers.mock.calls.at(-1))[0];
    expect(page2.filter).toMatchObject({ page: 2, count: false });
    expect(
      screen.getAllByText("Showing 25-48 of 48 records").length
    ).toBeGreaterThan(0);
  });

  it("hiding a performer removes its card and lowers the count", async () => {
    api.findPerformers.mockResolvedValue(
      response("findPerformers", "performers", rowsOf("perf", 3), 3)
    );

    renderListPage(<Performers />, { initialEntries: ["/performers"] });
    expect(await screen.findByText("perf-1")).toBeInTheDocument();
    expect(
      screen.getAllByText("Showing 1-3 of 3 records").length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Hide perf-1" }));

    await waitFor(() =>
      expect(screen.queryByText("perf-1")).not.toBeInTheDocument()
    );
    expect(screen.getByText("perf-0")).toBeInTheDocument();
    expect(
      screen.getAllByText("Showing 1-2 of 2 records").length
    ).toBeGreaterThan(0);
  });

  it("the same id on two instances renders both cards, and hiding one keeps the other", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    api.findPerformers.mockResolvedValue(
      response(
        "findPerformers",
        "performers",
        [
          { id: "1", instanceId: "inst-a", name: "Alpha on A" },
          { id: "1", instanceId: "inst-b", name: "Alpha on B" },
        ],
        2
      )
    );

    renderListPage(<EntityListPage config={PERFORMER_LIST} />, {
      initialEntries: ["/performers"],
    });

    expect(await screen.findByText("Alpha on A")).toBeInTheDocument();
    expect(screen.getByText("Alpha on B")).toBeInTheDocument();
    const duplicateKeys = errors.mock.calls.filter((call) =>
      String(call[0]).includes("same key")
    );
    expect(duplicateKeys).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Hide Alpha on A" }));
    await waitFor(() =>
      expect(screen.queryByText("Alpha on A")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Alpha on B")).toBeInTheDocument();
  });

  it("every card gets the page's one hide handler, not a closure per card", async () => {
    api.findPerformers.mockResolvedValue(
      response("findPerformers", "performers", rowsOf("perf", 3), 3)
    );

    renderListPage(<Performers />, { initialEntries: ["/performers"] });
    expect(await screen.findByText("perf-2")).toBeInTheDocument();

    const handlers = new Set(
      cardProps.mock.calls.map((call) => call[0].onHideSuccess)
    );
    expect(handlers.size).toBe(1);
  });

  it("table view renders one column picker (the toolbar's)", async () => {
    api.findPerformers.mockResolvedValue(
      response("findPerformers", "performers", rowsOf("perf", 2), 2)
    );

    renderListPage(<Performers />, {
      initialEntries: ["/performers?view=table"],
    });

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Columns" })).toHaveLength(1);
    // No spare header cell is left where the second picker was
    const headers = screen.getAllByRole("columnheader");
    expect(headers.every((th) => (th.textContent ?? "") !== "")).toBe(true);
  });

  it("the Tags hierarchy view opens from a view=hierarchy URL and from a default preset with viewMode hierarchy", async () => {
    api.findTagTree.mockResolvedValue({
      tags: [
        { id: "1", instanceId: "inst-a", name: "Root", parents: [] },
        { id: "2", instanceId: "inst-a", name: "Child", parents: [] },
      ],
    });

    const fromUrl = renderListPage(<Tags />, {
      initialEntries: ["/tags?view=hierarchy"],
    });
    await waitFor(() =>
      expect(screen.getByTestId("hierarchy-view")).toHaveAttribute(
        "data-count",
        "2"
      )
    );
    fromUrl.unmount();

    renderListPage(<Tags />, {
      initialEntries: ["/tags"],
      presets: {
        tag: [
          {
            id: "owner",
            name: "Tree",
            filters: {},
            sort: "name",
            direction: "ASC",
            viewMode: "hierarchy",
          },
        ],
      },
      defaultPresets: { tag: "owner" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("hierarchy-view")).toHaveAttribute(
        "data-count",
        "2"
      )
    );
    // The tree is the whole list: no page of tags is asked for
    expect(api.findTags).not.toHaveBeenCalled();
  });
});
