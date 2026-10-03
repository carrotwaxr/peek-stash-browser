/**
 * The one list page: its state in the URL, its page through the entity's
 * list hook and the query cache. Each case runs the page as the app does
 * (`renderListPage`), with the library API mocked and the cards stubbed.
 */
import type { ComponentType } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { must, renderListPage } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/api";
import EntityListPage from "@/components/list/EntityListPage";
import {
  type ListPageConfig,
  PERFORMER_LIST,
} from "@/components/list/listPageConfigs";
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

    it("on a first visit with presets pending, the results area shows the list skeleton, then the cards", async () => {
      // The saved presets and the default ids, each answered by the test
      const answers: ((value: unknown) => void)[] = [];
      const held = () =>
        new Promise<unknown>((resolve) => {
          answers.push(resolve);
        });
      vi.mocked(apiGet)
        .mockImplementationOnce(held)
        .mockImplementationOnce(held);
      api[find].mockResolvedValue(
        response(find, items, [{ id: "1", instanceId: "a", name: "Ada" }], 1)
      );

      renderListPage(<Page />, {
        initialEntries: [path],
        presetsPending: true,
      });

      expect(await screen.findAllByTestId("list-skeleton")).not.toHaveLength(0);
      expect(api[find]).not.toHaveBeenCalled();

      act(() => {
        for (const answer of answers) answer({ presets: {}, defaults: {} });
      });
      expect(await screen.findByText("Ada")).toBeInTheDocument();
      expect(screen.queryAllByTestId("list-skeleton")).toHaveLength(0);
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

  it("the Tags hierarchy view shows no + Filter and no chips, and says when filters are set", async () => {
    api.findTagTree.mockResolvedValue({ tags: [] });
    api.findTags.mockResolvedValue({ findTags: { count: 0, tags: [] } });

    renderListPage(<Tags />, {
      initialEntries: ["/tags?view=hierarchy&favorite=true"],
    });

    await screen.findByTestId("hierarchy-view");
    expect(
      screen.queryByRole("button", { name: "Add filter" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Edit filter/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Filters don't apply to the hierarchy view. Switch to Grid or Table to use them."
      )
    ).toBeInTheDocument();

    // Filters stay in the URL: back in the grid they show again
    fireEvent.click(screen.getByRole("button", { name: /^View mode/ }));
    fireEvent.click(screen.getByRole("option", { name: /Grid/ }));
    expect(
      await screen.findByRole("button", { name: "Add filter" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Edit filter/ })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Filters don't apply/)).not.toBeInTheDocument();
  });

  it("the Tags hierarchy view with no filters set shows no note", async () => {
    api.findTagTree.mockResolvedValue({ tags: [] });

    renderListPage(<Tags />, { initialEntries: ["/tags?view=hierarchy"] });

    await screen.findByTestId("hierarchy-view");
    expect(screen.queryByText(/Filters don't apply/)).not.toBeInTheDocument();
  });
});

describe("EntityListPage: a page's own parts", () => {
  it("a config's `sortOptions` replace the entity's in the toolbar and the URL state", async () => {
    const config: ListPageConfig = {
      ...PERFORMER_LIST,
      defaultSort: "name",
      sortOptions: () => [
        { value: "name", label: "Name" },
        { value: "random", label: "Random" },
      ],
    };

    // Birthdate is a performer sort, but not one this page offers
    renderListPage(<EntityListPage config={config} />, {
      initialEntries: ["/performers?sort=birthdate"],
    });

    const sortBy = await screen.findByRole("combobox", { name: "Sort by" });
    expect(
      Array.from((sortBy as HTMLSelectElement).options).map((o) => o.value)
    ).toEqual(["name", "random"]);
    await waitFor(() => expect(api.findPerformers).toHaveBeenCalled());
    const sentRequest = must(api.findPerformers.mock.calls.at(-1))[0];
    expect(sentRequest.filter).toMatchObject({ sort: "name" });
  });

  it("a page's `notice` renders between the header and the toolbar", async () => {
    const config: ListPageConfig = {
      ...PERFORMER_LIST,
      headerAside: <button>About this page</button>,
      usePage: () => ({ notice: <p role="status">Within your top 10</p> }),
    };

    renderListPage(<EntityListPage config={config} />, {
      initialEntries: ["/performers"],
    });

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Within your top 10");
    const heading = screen.getByRole("heading", { name: "Performers" });
    const sortBy = screen.getByRole("combobox", { name: "Sort by" });
    const follows = (a: Node, b: Node) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(heading, notice)).toBe(true);
    expect(follows(notice, sortBy)).toBe(true);
    // The header's aside sits beside the heading, before the notice
    const aside = screen.getByRole("button", { name: "About this page" });
    expect(follows(heading, aside)).toBe(true);
    expect(follows(aside, notice)).toBe(true);
  });

  it("a page's `empty` message and description replace the config's", async () => {
    const config: ListPageConfig = {
      ...PERFORMER_LIST,
      usePage: () => ({
        empty: { message: "Nothing to suggest", description: "Rate more" },
      }),
    };

    renderListPage(<EntityListPage config={config} />, {
      initialEntries: ["/performers"],
    });

    expect(await screen.findByText("Nothing to suggest")).toBeInTheDocument();
    expect(screen.getByText("Rate more")).toBeInTheDocument();
    expect(screen.queryByText("No performers found")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Try adjusting your search filters")
    ).not.toBeInTheDocument();
  });

  it("a config's `context` reaches the Views menu, and the document title is the config's title", async () => {
    const config: ListPageConfig = {
      ...PERFORMER_LIST,
      title: "Top performers",
      context: "image_performer",
    };

    renderListPage(<EntityListPage config={config} />, {
      initialEntries: ["/performers"],
    });

    fireEvent.click(await screen.findByRole("button", { name: /^Views/ }));
    expect(
      screen.getByText("Set as default for Performer pages (Images tab)")
    ).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Top performers - Peek"));
  });
});
