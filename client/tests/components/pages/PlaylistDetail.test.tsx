/**
 * The playlist page reads server pages in the order the URL names, with the
 * play queue from `GET /playlists/:id/queue` (B11). These tests stub the
 * network: what is under test is which requests the page sends and what the
 * rows and links carry.
 */
import type { ReactNode } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type {
  GetPlaylistQueueResponse,
  GetPlaylistResponse,
  NormalizedScene,
  PlaylistItemWithScene,
  PlaylistQueueEntry,
} from "@peek/shared-types";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouterWithQuery } from "@tests/helpers/MemoryRouterWithQuery";
import {
  type ApiStub,
  jsonResponse,
  requestsTo,
  stubApi,
} from "@tests/helpers/stubApi";
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaylistDetail from "@/components/pages/PlaylistDetail";
import type * as uiModule from "@/components/ui/index";

const { rowLinkStates, sceneStates } = vi.hoisted(() => ({
  /** The last link state each row rendered with, by "id:instanceId" */
  rowLinkStates: new Map<string, unknown>(),
  /** The history state each visit to a scene page carried */
  sceneStates: [] as unknown[],
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("@/hooks/useNavigationState", () => ({
  useNavigationState: () => ({ goBack: vi.fn(), backButtonText: "Back" }),
}));
vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
// ThemedIcon reads the theme; no ThemeProvider here (as in SetupWizard.test).
vi.mock("@/themes/useTheme", () => ({
  useTheme: () => ({ theme: undefined }),
}));
vi.mock("@/components/ui/index", async (importOriginal) => ({
  ...(await importOriginal<typeof uiModule>()),
  // The row's title, its reorder handle and its buttons; its link state is
  // recorded for the queue cases
  SceneListItem: ({
    scene,
    dragHandle,
    actionButtons,
    linkState,
  }: {
    scene: NormalizedScene | null;
    dragHandle?: ReactNode;
    actionButtons?: ReactNode;
    linkState?: unknown;
  }) => {
    if (scene) rowLinkStates.set(`${scene.id}:${scene.instanceId}`, linkState);
    return (
      <div data-testid="playlist-row">
        <span>{scene?.title}</span>
        {dragHandle}
        {actionButtons}
      </div>
    );
  },
}));

const scene = (id: string, instanceId: string, title: string) =>
  untrusted<NormalizedScene>({ id, instanceId, title });

const item = (
  itemId: number,
  sceneId: string,
  instanceId = "i",
  title = `Scene ${sceneId}`
): PlaylistItemWithScene => ({
  id: itemId,
  playlistId: 5,
  instanceId,
  sceneId,
  position: itemId,
  addedAt: new Date(0),
  scene: scene(sceneId, instanceId, title),
});

const entry = (
  sceneId: string,
  instanceId: string,
  position: number
): PlaylistQueueEntry => ({
  sceneId,
  instanceId,
  position,
  scene: {
    title: `Scene ${sceneId}`,
    paths: { screenshot: null },
    files: [],
    studio: null,
  },
});

/** Items `from`..`to` - 1, scene ids as their numbers */
const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, k) => item(from + k, String(from + k)));

function playlistPage(
  items: PlaylistItemWithScene[],
  overrides: Partial<Omit<GetPlaylistResponse, "playlist">> = {}
): GetPlaylistResponse {
  return {
    playlist: {
      id: 5,
      userId: 1,
      name: "Mine",
      description: null,
      shuffle: false,
      repeat: "none",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      items,
    },
    totalItems: items.length,
    unavailableItems: 0,
    page: 1,
    perPage: 50,
    sort: "position",
    direction: "ASC",
    isOwner: true,
    accessLevel: "owner",
    owner: { id: 1, username: "owner" },
    ...overrides,
  };
}

const queueOf = (items: PlaylistItemWithScene[]): GetPlaylistQueueResponse => ({
  entries: items.map((i, index) => entry(i.sceneId, i.instanceId, index)),
});

interface Server {
  /** The page answered for a request's query */
  page: (query: URLSearchParams) => GetPlaylistResponse | Promise<Response>;
  queue: GetPlaylistQueueResponse;
  permissions: Record<string, unknown>;
}

let fetchMock: ApiStub;

function serve(server: Server): ApiStub {
  fetchMock = stubApi({
    "/playlists/5": async (url, init) => {
      if (init?.method === "PUT") return jsonResponse(200, { playlist: {} });
      const answer = server.page(new URL(url, "http://x").searchParams);
      return answer instanceof Promise ? answer : jsonResponse(200, answer);
    },
    "/playlists/5/queue": () => jsonResponse(200, server.queue),
    "/user/permissions": () =>
      jsonResponse(200, { permissions: server.permissions }),
    "/playlists/5/items/remove": () => jsonResponse(200, { removed: 1 }),
    "/playlists/5/reorder": () => jsonResponse(200, { success: true }),
    "/downloads/playlist/5": () =>
      jsonResponse(200, { download: { id: 1, status: "PENDING" } }),
  });
  return fetchMock;
}

/** A request's JSON body */
const bodyOf = (init?: RequestInit): unknown =>
  typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

const queryOf = (url: string) => new URL(url, "http://x").searchParams;
const pageRequests = () => requestsTo(fetchMock, "/playlists/5").map(queryOf);
const queueRequests = () =>
  requestsTo(fetchMock, "/playlists/5/queue").map(queryOf);

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="search">{location.search}</output>
      <button type="button" onClick={() => void navigate(-1)}>
        History back
      </button>
    </>
  );
}

function SceneProbe() {
  const location = useLocation();
  sceneStates.push(location.state);
  return <p>Scene page {location.pathname}</p>;
}

function renderPage(entry = "/playlist/5") {
  return render(
    <MemoryRouterWithQuery initialEntries={[entry]}>
      <Routes>
        <Route
          path="/playlist/:playlistId"
          element={
            <>
              <PlaylistDetail />
              <LocationProbe />
            </>
          }
        />
        <Route path="/scene/:sceneId" element={<SceneProbe />} />
      </Routes>
    </MemoryRouterWithQuery>
  );
}

const search = () =>
  new URLSearchParams(screen.getByTestId("search").textContent ?? "");

beforeEach(() => {
  rowLinkStates.clear();
  sceneStates.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlaylistDetail pages and sort", () => {
  const items = range(0, 3);
  const pageServer = (total = 120): Server => ({
    page: (query) => {
      const page = Number(query.get("page"));
      const perPage = Number(query.get("per_page"));
      const from = (page - 1) * perPage;
      return playlistPage(range(from, Math.min(from + perPage, total)), {
        totalItems: total,
        page,
        perPage,
      });
    },
    queue: queueOf(items),
    permissions: {},
  });

  it("opens page 1 of 50 sorted by playlist order", async () => {
    serve(pageServer());
    renderPage();

    await screen.findByText("Scene 0");

    const [first] = pageRequests();
    expect(must(first, "page request").toString()).toBe("page=1&per_page=50");
    expect(must(queueRequests()[0], "queue request").toString()).toBe("");
  });

  it("choosing Title in the sort control pushes ?sort=title&direction=ASC and asks that page", async () => {
    serve(pageServer());
    renderPage("/playlist/5?page=2");
    await screen.findByText("Scene 50");

    fireEvent.change(screen.getByLabelText("Sort playlist by"), {
      target: { value: "title" },
    });

    await waitFor(() => expect(search().get("sort")).toBe("title"));
    expect(search().get("direction")).toBe("ASC");
    // A new sort starts at page 1
    expect(search().get("page")).toBeNull();
    await waitFor(() => {
      const last = must(pageRequests().at(-1), "page request");
      expect(last.get("sort")).toBe("title");
    });
    const last = must(pageRequests().at(-1), "page request");
    expect(last.get("direction")).toBe("ASC");
    expect(last.get("page")).toBe("1");
    await waitFor(() =>
      expect(queueRequests().at(-1)?.toString()).toBe(
        "sort=title&direction=ASC"
      )
    );
  });

  it("Random writes sort=random_<seed> and keeps it across pages", async () => {
    serve(pageServer());
    renderPage();
    await screen.findByText("Scene 0");

    fireEvent.change(screen.getByLabelText("Sort playlist by"), {
      target: { value: "random" },
    });
    await waitFor(() => expect(search().get("sort")).toMatch(/^random_\d+$/));
    const seeded = search().get("sort");

    fireEvent.click(screen.getByTitle("Next Page"));

    await waitFor(() => expect(search().get("page")).toBe("2"));
    expect(search().get("sort")).toBe(seeded);
    await waitFor(() => {
      const last = must(pageRequests().at(-1), "page request");
      expect(last.get("page")).toBe("2");
    });
    expect(must(pageRequests().at(-1), "page request").get("sort")).toBe(
      seeded
    );
    expect(queueRequests().map((q) => q.get("sort"))).toContain(seeded);
  });

  it("a random sort without a seed gets one in the URL", async () => {
    serve(pageServer());
    renderPage("/playlist/5?sort=random");

    await waitFor(() => expect(search().get("sort")).toMatch(/^random_\d+$/));
    for (const request of pageRequests()) {
      expect(request.get("sort")).not.toBe("random");
    }
  });

  it("Back returns to the previous sort (push)", async () => {
    serve(pageServer());
    renderPage();
    await screen.findByText("Scene 0");

    fireEvent.change(screen.getByLabelText("Sort playlist by"), {
      target: { value: "title" },
    });
    await waitFor(() => expect(search().get("sort")).toBe("title"));
    fireEvent.click(screen.getByRole("button", { name: /ascending/i }));
    await waitFor(() => expect(search().get("direction")).toBe("DESC"));

    fireEvent.click(screen.getByText("History back"));

    await waitFor(() => expect(search().get("direction")).toBe("ASC"));
    expect(search().get("sort")).toBe("title");
  });

  it("per page replaces", async () => {
    serve(pageServer());
    renderPage();
    await screen.findByText("Scene 0");

    fireEvent.change(screen.getByLabelText("Sort playlist by"), {
      target: { value: "title" },
    });
    await waitFor(() => expect(search().get("sort")).toBe("title"));
    fireEvent.change(screen.getByLabelText("Per page"), {
      target: { value: "100" },
    });
    await waitFor(() => expect(search().get("per_page")).toBe("100"));
    await waitFor(() =>
      expect(must(pageRequests().at(-1), "page request").get("per_page")).toBe(
        "100"
      )
    );

    // The per-page change took the sort's history entry: Back leaves both
    fireEvent.click(screen.getByText("History back"));

    await waitFor(() => expect(search().toString()).toBe(""));
  });

  it("page 2 asks page=2 and keeps page 1's rows on screen until it answers", async () => {
    let answerPage2: (response: Response) => void = () => undefined;
    const server = pageServer();
    serve({
      ...server,
      page: (query) =>
        query.get("page") === "2"
          ? new Promise<Response>((resolve) => {
              answerPage2 = resolve;
            })
          : server.page(query),
    });
    renderPage();
    await screen.findByText("Scene 0");

    fireEvent.click(screen.getByTitle("Next Page"));

    await waitFor(() =>
      expect(pageRequests().map((q) => q.get("page"))).toContain("2")
    );
    expect(screen.getByText("Scene 0")).toBeInTheDocument();
    expect(screen.getAllByTestId("playlist-row")).toHaveLength(50);

    answerPage2(
      jsonResponse(
        200,
        playlistPage(range(50, 100), { totalItems: 120, page: 2 })
      )
    );

    expect(await screen.findByText("Scene 50")).toBeInTheDocument();
    expect(screen.queryByText("Scene 0")).not.toBeInTheDocument();
  });

  it("the header says 258 videos from totalItems, not the rows on the page", async () => {
    serve(pageServer(258));
    renderPage();

    expect(await screen.findByText("258 videos")).toBeInTheDocument();
    expect(screen.getAllByTestId("playlist-row")).toHaveLength(50);
  });

  it("rendering 2,000 queue entries builds the queue once", async () => {
    const all = range(0, 2000);
    serve({
      page: (query) => {
        const page = Number(query.get("page"));
        const perPage = Number(query.get("per_page"));
        const from = (page - 1) * perPage;
        return playlistPage(all.slice(from, from + perPage), {
          totalItems: all.length,
          page,
          perPage,
        });
      },
      queue: queueOf(all),
      permissions: {},
    });
    renderPage("/playlist/5?page=2&per_page=100");

    await screen.findByText("Scene 100");
    type RowState = {
      scene: unknown;
      playlist?: { scenes: unknown[]; currentIndex: number };
    };
    const stateOf = (sceneId: string) =>
      rowLinkStates.get(`${sceneId}:i`) as RowState | undefined;
    await waitFor(() => expect(stateOf("199")?.playlist).toBeDefined());

    const shared = must(stateOf("100")?.playlist, "first row's queue").scenes;
    expect(shared).toHaveLength(2000);
    for (let n = 100; n < 200; n++) {
      const queue = must(stateOf(String(n))?.playlist, `row ${n}'s queue`);
      expect(queue.scenes).toBe(shared);
      expect(queue.currentIndex).toBe(n);
    }
  });
});

describe("PlaylistDetail download", () => {
  const shared = (overrides: Partial<Omit<GetPlaylistResponse, "playlist">>) =>
    playlistPage([item(1, "1")], {
      isOwner: false,
      accessLevel: "shared",
      ...overrides,
    });

  it("shows Download to a shared viewer with the playlist-download permission", async () => {
    serve({
      page: () => shared({}),
      queue: { entries: [] },
      permissions: { canDownloadPlaylists: true },
    });
    renderPage();

    expect(await screen.findByTitle("Download Playlist")).toBeInTheDocument();
  });

  it("hides Download from a shared viewer without it", async () => {
    serve({
      page: () => shared({}),
      queue: { entries: [] },
      permissions: { canDownloadPlaylists: false },
    });
    renderPage();

    await screen.findByTitle("Duplicate to My Playlists");
    await waitFor(() =>
      expect(requestsTo(fetchMock, "/user/permissions")).toHaveLength(1)
    );
    expect(screen.queryByTitle("Download Playlist")).not.toBeInTheDocument();
  });

  it("posts the playlist download", async () => {
    serve({
      page: () => shared({}),
      queue: { entries: [] },
      permissions: { canDownloadPlaylists: true },
    });
    renderPage();
    fireEvent.click(await screen.findByTitle("Download Playlist"));

    await waitFor(() =>
      expect(requestsTo(fetchMock, "/downloads/playlist/5")).toHaveLength(1)
    );
  });

  it("the Download button shows for a playlist whose current page is empty but whose total is not", async () => {
    // Page 4 of a 120-item playlist answers no rows
    serve({
      page: () =>
        playlistPage([], {
          totalItems: 120,
          page: 4,
          isOwner: false,
          accessLevel: "shared",
        }),
      queue: { entries: [] },
      permissions: { canDownloadPlaylists: true },
    });
    renderPage("/playlist/5?page=4");

    expect(await screen.findByTitle("Download Playlist")).toBeInTheDocument();
    expect(screen.queryAllByTestId("playlist-row")).toHaveLength(0);
  });
});

/** The owner's playlist: scene 7 on server A, then scene 7 on server B */
const twoServers = [
  item(1, "7", "inst-a", "Seven on A"),
  item(2, "7", "inst-b", "Seven on B"),
];

describe("PlaylistDetail items on two servers", () => {
  beforeEach(() => {
    serve({
      page: () => playlistPage(twoServers),
      queue: queueOf(twoServers),
      permissions: {},
    });
  });

  it("Remove sends the row's item id", async () => {
    renderPage();

    const rows = await screen.findAllByTestId("playlist-row");
    expect(rows).toHaveLength(2);
    fireEvent.click(
      within(must(rows[1], "second row")).getByRole("button", {
        name: "Remove",
      })
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove",
      })
    );

    await waitFor(() =>
      expect(requestsTo(fetchMock, "/playlists/5/items/remove")).toHaveLength(1)
    );
    const [, init] = must(
      fetchMock.mock.calls.find(([url]) => url.includes("/items/remove")),
      "remove request"
    );
    expect(bodyOf(init)).toEqual({ itemIds: [2] });
    // The page is read again
    await waitFor(() => expect(pageRequests().length).toBeGreaterThan(1));
  });

  it("reorder moves two items sharing a scene id by their instances", async () => {
    renderPage();

    await screen.findAllByTestId("playlist-row");
    fireEvent.click(screen.getByTitle("Reorder Scenes"));
    const rows = screen.getAllByTestId("playlist-row");
    fireEvent.click(
      within(must(rows[1], "second row")).getByTitle("Move to top")
    );
    fireEvent.click(screen.getByTitle("Save Order"));

    await waitFor(() =>
      expect(requestsTo(fetchMock, "/playlists/5/reorder")).toHaveLength(1)
    );
    const [, init] = must(
      fetchMock.mock.calls.find(([url]) => url.includes("/reorder")),
      "reorder request"
    );
    expect(bodyOf(init)).toEqual({
      items: [
        { sceneId: "7", instanceId: "inst-b", position: 0 },
        { sceneId: "7", instanceId: "inst-a", position: 1 },
      ],
    });
  });

  it("Play and a row link pass the same queue entries", async () => {
    renderPage();
    await screen.findAllByTestId("playlist-row");
    await waitFor(() =>
      expect(
        (rowLinkStates.get("7:inst-b") as { playlist?: unknown } | undefined)
          ?.playlist
      ).toBeDefined()
    );

    fireEvent.click(screen.getByTitle("Play Playlist"));

    await screen.findByText("Scene page /scene/7");
    const state = must(sceneStates.at(-1), "scene page state") as {
      playlist: { scenes: unknown[]; currentIndex: number };
    };
    const expected = queueOf(twoServers).entries;
    expect(state.playlist.scenes).toEqual(expected);
    expect(state.playlist.currentIndex).toBe(0);

    // The second row's link carries the same entries, at its own index
    const rowState = must(rowLinkStates.get("7:inst-b"), "row state") as {
      playlist: { scenes: unknown[]; currentIndex: number };
    };
    expect(rowState.playlist.scenes).toEqual(expected);
    expect(rowState.playlist.currentIndex).toBe(1);
  });
});

describe("PlaylistDetail reorder across pages", () => {
  it("offers Reorder only when the whole playlist is on the page in playlist order", async () => {
    serve({
      page: (query) =>
        playlistPage(twoServers, {
          sort: query.get("sort") ?? "position",
        }),
      queue: queueOf(twoServers),
      permissions: {},
    });
    const { unmount } = renderPage("/playlist/5?sort=title&direction=ASC");
    await screen.findAllByTestId("playlist-row");
    expect(screen.queryByTitle("Reorder Scenes")).not.toBeInTheDocument();
    unmount();

    serve({
      page: () => playlistPage(range(0, 50), { totalItems: 120 }),
      queue: queueOf(range(0, 120)),
      permissions: {},
    });
    renderPage();
    await screen.findByText("Scene 0");
    expect(screen.queryByTitle("Reorder Scenes")).not.toBeInTheDocument();
  });
});
