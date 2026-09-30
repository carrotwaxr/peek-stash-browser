/**
 * The scene list (Scenes, and a detail page's Scenes tab) on the list page
 * shell: its state in the URL, the page's own filter kept in every view,
 * the hide and play handlers, and its loading and error states. The library
 * API is mocked; the controls, pagination, timeline and folder views are the
 * real ones, the scene card a stub.
 */
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { must, renderListPage } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import SceneSearch from "@/components/scene-search/SceneSearch";

type Find = (params: Record<string, unknown>) => Promise<unknown>;

const { api, apiGet } = vi.hoisted(() => ({
  api: {
    findScenes: vi.fn<Find>(),
    findTagTree: vi.fn<(scope?: unknown) => Promise<unknown>>(),
  },
  apiGet: vi.fn<(url: string) => Promise<unknown>>(),
}));

vi.mock("@/api/library", () => ({ libraryApi: api }));
vi.mock("@/api", () => ({
  apiGet,
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
vi.mock("@/hooks/useTableColumns", () => ({
  useTableColumns: vi.fn(() => ({
    allColumns: [],
    visibleColumns: [],
    visibleColumnIds: [],
    columnOrder: [],
    toggleColumn: vi.fn(),
    hideColumn: vi.fn(),
    moveColumn: vi.fn(),
    getColumnConfig: vi.fn(() => ({})),
  })),
}));
// Shows itself while the library is initializing (its own test covers when)
vi.mock("@/components/ui/LibraryInitializingBanner", () => ({
  default: () => <div data-testid="sync-banner" />,
}));

/** A scene card stub: its title, a click that plays it, and a Hide button */
vi.mock("@/components/ui/SceneCard", () => ({
  default: (props: {
    scene: { id: string; instanceId: string; title: string };
    onClick?: (scene: unknown) => void;
    onHideSuccess?: (id: string, type: string, instanceId: string) => void;
  }) => (
    <div data-testid="scene-card">
      <button onClick={() => props.onClick?.(props.scene)}>
        {props.scene.title}
      </button>
      <button
        onClick={() =>
          props.onHideSuccess?.(props.scene.id, "scene", props.scene.instanceId)
        }
      >
        Hide {props.scene.title}
      </button>
    </div>
  ),
}));

type Row = { id: string; instanceId: string; title: string } & Record<
  string,
  unknown
>;

const scenes = (rows: readonly Row[], count = rows.length) => ({
  findScenes: { count, scenes: rows },
});

/** Rows titled `<prefix>-<n>` on server a */
const rowsOf = (prefix: string, n = 2): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    instanceId: "a",
    title: `${prefix}-${i}`,
  }));

type SceneFilter = Record<string, unknown>;
type Sent = { filter: Record<string, unknown>; scene_filter?: SceneFilter };

/** The requests the API was sent, oldest first */
const sent = () => api.findScenes.mock.calls.map((call) => call[0] as Sent);
const lastSent = () => must(sent().at(-1), "a scene request");

const PERFORMER = { value: ["1:a"], modifier: "INCLUDES" };

/** A performer page's Scenes tab */
const PerformerScenes = () => (
  <SceneSearch
    context="scene_performer"
    permanentFilters={{ performers: PERFORMER }}
    permanentFiltersMetadata={{ performers: [{ id: "1:a", name: "Ada" }] }}
    fromPageTitle="Ada"
  />
);

beforeEach(() => {
  vi.clearAllMocks();
  api.findScenes.mockResolvedValue(scenes([]));
  api.findTagTree.mockResolvedValue({ tags: [] });
  apiGet.mockResolvedValue({ distribution: [] });
});

describe("SceneSearch", () => {
  it("renders the controls and a card per scene", async () => {
    api.findScenes.mockResolvedValue(scenes(rowsOf("scene")));
    renderListPage(<SceneSearch title="Scenes" />, {
      initialEntries: ["/scenes"],
    });

    expect(await screen.findByText("scene-1")).toBeInTheDocument();
    expect(screen.getAllByTestId("scene-card")).toHaveLength(2);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  describe("Hiding a scene", () => {
    it("hiding A:12 removes only A:12's card when B:12 is on the page", async () => {
      api.findScenes.mockResolvedValue(
        scenes([
          { id: "12", instanceId: "A", title: "Twelve on A" },
          { id: "12", instanceId: "B", title: "Twelve on B" },
        ])
      );
      renderListPage(<SceneSearch title="Scenes" />, {
        initialEntries: ["/scenes"],
      });
      expect(await screen.findByText("Twelve on A")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Hide Twelve on A" }));

      await waitFor(() =>
        expect(screen.queryByText("Twelve on A")).not.toBeInTheDocument()
      );
      expect(screen.getByText("Twelve on B")).toBeInTheDocument();
      expect(
        screen.getAllByText("Showing 1-1 of 1 records").length
      ).toBeGreaterThan(0);
    });
  });

  describe("Playing a scene", () => {
    it("clicking a card navigates with a queue whose entries hold no performers, tags or streams", async () => {
      const row = (id: string, instanceId: string): Row => ({
        id,
        instanceId,
        title: `Scene ${id} on ${instanceId}`,
        files: [{ path: `/m/${id}.mp4`, basename: `${id}.mp4`, duration: 60 }],
        paths: { screenshot: `/s/${id}`, preview: `/p/${id}`, sprite: "/x" },
        studio: { id: "9", name: "Studio", instanceId },
        performers: [{ id: "1", name: "Someone" }],
        tags: [{ id: "2", name: "A tag" }],
        sceneStreams: [{ url: "/stream" }],
      });
      api.findScenes.mockResolvedValue(
        scenes([row("12", "A"), row("12", "B")])
      );
      const { router } = renderListPage(<SceneSearch title="Scenes" />, {
        initialEntries: ["/scenes"],
      });

      // The second card: scene 12 on server B, not the first scene 12
      fireEvent.click(
        await screen.findByRole("button", { name: "Scene 12 on B" })
      );

      await waitFor(() =>
        expect(router.state.location.pathname).toBe("/scene/12")
      );
      const state = router.state.location.state as {
        scene: unknown;
        playlist: Record<string, unknown>;
      };
      const playlist = state.playlist;
      expect(playlist.currentIndex).toBe(1);
      expect(playlist.scenes).toEqual([
        {
          sceneId: "12",
          instanceId: "A",
          position: 0,
          scene: {
            title: "Scene 12 on A",
            paths: { screenshot: "/s/12" },
            files: [{ duration: 60, basename: "12.mp4" }],
            studio: { name: "Studio" },
          },
        },
        {
          sceneId: "12",
          instanceId: "B",
          position: 1,
          scene: {
            title: "Scene 12 on B",
            paths: { screenshot: "/s/12" },
            files: [{ duration: 60, basename: "12.mp4" }],
            studio: { name: "Studio" },
          },
        },
      ]);
      // The clicked scene itself still travels whole, for the player's codec check
      expect(state.scene).toMatchObject({ id: "12", instanceId: "B" });
    });
  });

  describe("Stale results", () => {
    it("page 2 keeps page 1's scenes on screen, dimmed, until it loads", async () => {
      let answerPage2: (value: unknown) => void = () => {};
      api.findScenes.mockImplementation((params) =>
        (params.filter as { page: number }).page === 2
          ? new Promise((resolve) => {
              answerPage2 = resolve;
            })
          : Promise.resolve(scenes(rowsOf("p1"), 48))
      );
      renderListPage(<SceneSearch title="Scenes" />, {
        initialEntries: ["/scenes"],
      });
      expect(await screen.findByText("p1-0")).toBeInTheDocument();

      fireEvent.click(
        must(screen.getAllByRole("button", { name: "Next Page" })[0])
      );

      await waitFor(() =>
        expect(screen.getByTestId("search-results")).toHaveAttribute(
          "aria-busy",
          "true"
        )
      );
      expect(screen.getByText("p1-0")).toBeInTheDocument();

      await act(async () => {
        answerPage2(scenes(rowsOf("p2"), 48));
        await Promise.resolve();
      });
      expect(await screen.findByText("p2-0")).toBeInTheDocument();
    });
  });

  describe("On a performer page", () => {
    it("Back after a performer page's Scenes tab went to page 3 shows page 1", async () => {
      api.findScenes.mockImplementation((params) =>
        Promise.resolve(
          scenes(rowsOf(`p${(params.filter as { page: number }).page}`), 96)
        )
      );
      const { router } = renderListPage(<PerformerScenes />, {
        initialEntries: [
          "/performer/1?tab=scenes",
          "/performer/1?tab=scenes&page=3",
        ],
      });
      expect(await screen.findByText("p3-0")).toBeInTheDocument();

      await act(() => router.navigate(-1));

      expect(await screen.findByText("p1-0")).toBeInTheDocument();
      expect(screen.queryByText("p3-0")).not.toBeInTheDocument();
      expect(lastSent().filter.page).toBe(1);
      expect(lastSent().scene_filter?.performers).toEqual(PERFORMER);
      expect(router.state.location.search).toBe("?tab=scenes");
    });

    it("a timeline period survives a sort change on a performer page", async () => {
      apiGet.mockResolvedValue({
        distribution: [{ period: "2024-05", count: 3 }],
      });
      const { router } = renderListPage(<PerformerScenes />, {
        initialEntries: [
          "/performer/1?tab=scenes&view=timeline&timeline_period=2024-05",
        ],
      });

      const may = {
        modifier: "BETWEEN",
        value: "2024-05-01",
        value2: "2024-05-31",
      };
      await waitFor(() => expect(lastSent().scene_filter?.date).toEqual(may));
      expect(lastSent().scene_filter?.performers).toEqual(PERFORMER);
      // The timeline counts the performer's scenes only
      expect(
        apiGet.mock.calls.some(([url]) =>
          url.startsWith("/timeline/scene/distribution?")
            ? new URLSearchParams(url.split("?")[1]).get("performerId") ===
              "1:a"
            : false
        )
      ).toBe(true);

      // The sort's direction button
      fireEvent.click(
        must(
          document.querySelector<HTMLButtonElement>(
            '[data-tv-search-item="sort-direction"] button'
          )
        )
      );

      await waitFor(() =>
        expect(router.state.location.search).toContain("dir=ASC")
      );
      const search = new URLSearchParams(router.state.location.search);
      expect(search.get("timeline_period")).toBe("2024-05");
      expect(search.get("tab")).toBe("scenes");
      await waitFor(() =>
        expect(lastSent().filter).toMatchObject({ direction: "ASC" })
      );
      expect(lastSent().scene_filter?.date).toEqual(may);
      expect(lastSent().scene_filter?.performers).toEqual(PERFORMER);
    });

    it("the folder view on a performer page keeps the performer in the request", async () => {
      api.findTagTree.mockResolvedValue({
        tags: [{ id: "5", instanceId: "a", name: "Five", parents: [] }],
      });
      renderListPage(<PerformerScenes />, {
        initialEntries: ["/performer/1?tab=scenes&view=folder&folderPath=5:a"],
      });

      await waitFor(() =>
        expect(lastSent().scene_filter?.tags).toMatchObject({ value: ["5:a"] })
      );
      expect(lastSent().scene_filter?.performers).toEqual(PERFORMER);
      // The folders are the performer's scenes' tags
      expect(api.findTagTree).toHaveBeenCalledWith(
        { performer: "1:a" },
        expect.anything()
      );
    });

    /** A tag page's Scenes tab, with Include sub-tags on or off */
    const TagScenes = ({ includeSubTags }: { includeSubTags: boolean }) => (
      <SceneSearch
        context="scene_tag"
        permanentFilters={{
          tags: {
            value: ["9:a"],
            modifier: "INCLUDES",
            ...(includeSubTags && { depth: -1 }),
          },
        }}
        folderView={!includeSubTags}
      />
    );

    it("on a tag page a folder lists the scenes with the folder's tag and the page's", async () => {
      api.findTagTree.mockResolvedValue({
        tags: [
          {
            id: "5",
            instanceId: "a",
            name: "Five",
            parents: [],
            scene_count: 2,
          },
        ],
      });
      renderListPage(<TagScenes includeSubTags={false} />, {
        initialEntries: ["/tag/9?tab=scenes&view=folder&folderPath=5:a"],
      });

      await waitFor(() =>
        expect(lastSent().scene_filter?.tags).toEqual({
          value: ["9:a", "5:a"],
          modifier: "INCLUDES_ALL",
          depth: 0,
        })
      );
      expect(api.findTagTree).toHaveBeenCalledWith(
        { tag: "9:a" },
        expect.anything()
      );
    });

    it("on a tag page with Include sub-tags on, no folder view is offered", async () => {
      renderListPage(<TagScenes includeSubTags />, {
        initialEntries: ["/tag/9?tab=scenes&view=folder&folderPath=5:a"],
      });

      await waitFor(() => expect(api.findScenes).toHaveBeenCalled());
      // The address's folder view opens the grid, and the menu has none
      fireEvent.click(
        screen.getByRole("button", { name: "View mode: Grid view" })
      );
      expect(
        within(screen.getByRole("listbox", { name: "View modes" }))
          .getAllByRole("option")
          .map((option) => option.getAttribute("aria-label"))
      ).not.toContain("Folder view");
      expect(api.findTagTree).not.toHaveBeenCalled();
      // The page's own tag with its sub-tags, no folder
      expect(lastSent().scene_filter?.tags).toEqual({
        value: ["9:a"],
        modifier: "INCLUDES",
        depth: -1,
      });
    });
  });

  describe("Folder view", () => {
    it("a failed tag-tree load shows the error with Retry, not untagged items", async () => {
      api.findTagTree.mockRejectedValue(new ApiError("Tree failed", 500));
      renderListPage(<SceneSearch title="Scenes" />, {
        initialEntries: ["/scenes?view=folder"],
      });

      expect(await screen.findByRole("alert")).toHaveTextContent("Tree failed");
      expect(
        screen.queryByRole("navigation", { name: /folder navigation/i })
      ).not.toBeInTheDocument();

      const calls = api.findTagTree.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
      await waitFor(() =>
        expect(api.findTagTree.mock.calls.length).toBeGreaterThan(calls)
      );
    });

    it("an initializing 503 on the tree keeps the folder view loading", async () => {
      api.findTagTree.mockRejectedValue(
        new ApiError("init", 503, { ready: false })
      );
      renderListPage(<SceneSearch title="Scenes" />, {
        initialEntries: ["/scenes?view=folder"],
      });

      await waitFor(() => expect(api.findTagTree).toHaveBeenCalled());
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByRole("navigation", { name: /folder navigation/i })
      ).toBeInTheDocument();
    });
  });

  describe("Library initializing", () => {
    it("a 503 ready:false on Scenes shows the sync banner, not an error page", async () => {
      api.findScenes.mockRejectedValue(
        new ApiError("Server is initializing", 503, { ready: false })
      );
      renderListPage(<SceneSearch title="Scenes" />, {
        initialEntries: ["/scenes"],
      });

      await waitFor(() => expect(api.findScenes).toHaveBeenCalled());
      expect(screen.getByTestId("sync-banner")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      // The controls stay, and the grid waits for the library
      expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
      expect(screen.queryByText("No scenes found")).not.toBeInTheDocument();
    });

    it("any other error shows the error page", async () => {
      api.findScenes.mockRejectedValue(
        new ApiError("Something went wrong", 500)
      );
      renderListPage(<SceneSearch title="Scenes" />, {
        initialEntries: ["/scenes"],
      });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Something went wrong"
      );
      expect(
        screen.queryByPlaceholderText("Search...")
      ).not.toBeInTheDocument();
    });
  });
});
