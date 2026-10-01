/**
 * The playlist page reads server pages in the order the URL names, with the
 * play queue from `GET /playlists/:id/queue` (B11), and its actions write
 * through the item routes: a move, a bulk remove, Save as playlist order and
 * Remove unavailable (B12). These tests stub the network: what is under test
 * is which requests the page sends and what the rows and links carry.
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
import { showError, showSuccess, showWarning } from "@/utils/toast";

const { rowLinkStates, sceneStates, addButtonExclusions } = vi.hoisted(() => ({
  /** The last link state each row rendered with, by "id:instanceId" */
  rowLinkStates: new Map<string, unknown>(),
  /** The history state each visit to a scene page carried */
  sceneStates: [] as unknown[],
  /** The playlists each add-to-playlist menu left out */
  addButtonExclusions: [] as unknown[],
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("@/hooks/useNavigationState", () => ({
  useNavigationState: () => ({ goBack: vi.fn(), backButtonText: "Back" }),
}));
vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
  showInfo: vi.fn(),
}));
// ThemedIcon reads the theme; no ThemeProvider here (as in SetupWizard.test).
vi.mock("@/themes/useTheme", () => ({
  useTheme: () => ({ theme: undefined }),
}));
vi.mock("@/components/ui/index", async (importOriginal) => ({
  ...(await importOriginal<typeof uiModule>()),
  // The row's title, its select box, its reorder handle and its buttons;
  // its link state is recorded for the queue cases
  SceneListItem: ({
    scene,
    dragHandle,
    actionButtons,
    linkState,
    onToggleSelect,
  }: {
    scene: NormalizedScene | null;
    dragHandle?: ReactNode;
    actionButtons?: ReactNode;
    linkState?: unknown;
    onToggleSelect?: (scene: NormalizedScene) => void;
  }) => {
    if (scene) rowLinkStates.set(`${scene.id}:${scene.instanceId}`, linkState);
    return (
      <div data-testid="playlist-row">
        <span>{scene?.title}</span>
        {scene && onToggleSelect && (
          <button
            type="button"
            title="Select"
            onClick={() => onToggleSelect(scene)}
          />
        )}
        {dragHandle}
        {actionButtons}
      </div>
    );
  },
  // The menu reads the user's playlists; here only what it leaves out counts
  AddToPlaylistButton: ({
    excludePlaylistIds,
  }: {
    excludePlaylistIds?: ReadonlyArray<number | string>;
  }) => {
    addButtonExclusions.push(excludePlaylistIds);
    return null;
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
  /** The queue, or the queue answered for a request's query */
  queue:
    | GetPlaylistQueueResponse
    | ((query: URLSearchParams) => GetPlaylistQueueResponse);
  permissions: Record<string, unknown>;
}

let fetchMock: ApiStub;

/** The move route of items 0..299 */
const moveRoutes = Object.fromEntries(
  Array.from({ length: 300 }, (_, itemId) => [
    `/playlists/5/items/${itemId}/position`,
    () => jsonResponse(200, { success: true }),
  ])
);

function serve(server: Server): ApiStub {
  fetchMock = stubApi({
    ...moveRoutes,
    "/playlists/5": async (url, init) => {
      if (init?.method === "PUT") return jsonResponse(200, { playlist: {} });
      const answer = server.page(new URL(url, "http://x").searchParams);
      return answer instanceof Promise ? answer : jsonResponse(200, answer);
    },
    "/playlists/5/queue": (url) =>
      jsonResponse(
        200,
        typeof server.queue === "function"
          ? server.queue(new URL(url, "http://x").searchParams)
          : server.queue
      ),
    "/user/permissions": () =>
      jsonResponse(200, { permissions: server.permissions }),
    "/playlists/5/items/remove": (_url, init) => {
      const { itemIds } = bodyOf(init) as { itemIds: number[] };
      return jsonResponse(200, { removed: itemIds.length });
    },
    "/playlists/5/items/remove-unavailable": () =>
      jsonResponse(200, { removed: 2 }),
    "/playlists/5/sort": () =>
      jsonResponse(200, { success: true, itemCount: 3 }),
    "/downloads/playlist/5": () =>
      jsonResponse(200, { download: { id: 1, status: "PENDING" } }),
  });
  return fetchMock;
}

/** The requests sent to `path` with their method and JSON body */
const sentTo = (path: string) =>
  fetchMock.mock.calls
    .filter(([url]) => url.replace(/^\/api/, "").split("?")[0] === path)
    .map(([, init]) => ({ method: init?.method ?? "GET", body: bodyOf(init) }));

/** Every write the page sent (anything but a GET) */
const writes = () =>
  fetchMock.mock.calls
    .filter(([, init]) => (init?.method ?? "GET") !== "GET")
    .map(([url, init]) => ({ url, method: init?.method, body: bodyOf(init) }));

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
  addButtonExclusions.length = 0;
  vi.clearAllMocks();
});

/** The history state the last visit to a scene page carried */
const lastSceneState = () =>
  must(sceneStates.at(-1), "scene page state") as {
    shouldAutoplay?: boolean;
    scene?: unknown;
    playlist: {
      scenes: PlaylistQueueEntry[];
      currentIndex: number;
      autoplayNext?: boolean;
      shuffleHistory?: unknown[];
    };
  };

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

describe("PlaylistDetail Play", () => {
  const items = range(1, 4);

  it("Play starts the queue the page shows: entry 0, or a random entry with shuffle", async () => {
    serve({
      page: () => playlistPage(items),
      queue: queueOf(items),
      permissions: {},
    });
    const { unmount } = renderPage();
    await screen.findByText("Scene 1");

    fireEvent.click(screen.getByTitle("Play Playlist"));

    await screen.findByText("Scene page /scene/1");
    const state = lastSceneState();
    expect(state.shouldAutoplay).toBe(true);
    expect(state.scene).toBeUndefined();
    expect(state.playlist.scenes).toEqual(queueOf(items).entries);
    expect(state.playlist.currentIndex).toBe(0);
    expect(state.playlist.autoplayNext).toBe(true);
    expect(state.playlist.shuffleHistory).toEqual([]);
    unmount();

    // With shuffle on, the start is a random entry
    serve({
      page: () =>
        playlistPage(items, {
          playlist: { ...playlistPage(items).playlist, shuffle: true },
        } as Partial<GetPlaylistResponse>),
      queue: queueOf(items),
      permissions: {},
    });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      renderPage();
      await screen.findByText("Scene 1");
      fireEvent.click(screen.getByTitle("Play Playlist"));

      await screen.findByText("Scene page /scene/3");
      expect(lastSceneState().playlist.currentIndex).toBe(2);
    } finally {
      random.mockRestore();
    }
  });

  it("Play under sort=title starts with the first title", async () => {
    // The page and the queue in title order: Apple (3), Banana (1), Cherry (2)
    const byTitle = [
      item(3, "3", "i", "Apple"),
      item(1, "1", "i", "Banana"),
      item(2, "2", "i", "Cherry"),
    ];
    serve({
      page: (query) =>
        query.get("sort") === "title"
          ? playlistPage(byTitle)
          : playlistPage(items),
      queue: (query) =>
        query.get("sort") === "title" ? queueOf(byTitle) : queueOf(items),
      permissions: {},
    });
    renderPage("/playlist/5?sort=title&direction=ASC");
    await screen.findByText("Apple");

    fireEvent.click(screen.getByTitle("Play Playlist"));

    await screen.findByText("Scene page /scene/3");
    expect(lastSceneState().playlist.scenes.map((e) => e.sceneId)).toEqual([
      "3",
      "1",
      "2",
    ]);
    expect(lastSceneState().playlist.currentIndex).toBe(0);
  });

  it("Play under a random sort starts the queue of the page's seed", async () => {
    const shuffled = [items[2], items[0], items[1]].map((i) => must(i, "item"));
    serve({
      page: () => playlistPage(shuffled),
      queue: (query) =>
        query.get("sort") === "random_123" ? queueOf(shuffled) : queueOf(items),
      permissions: {},
    });
    renderPage("/playlist/5?sort=random_123&direction=DESC");
    await screen.findByText("Scene 3");

    fireEvent.click(screen.getByTitle("Play Playlist"));

    await screen.findByText("Scene page /scene/3");
    expect(queueRequests().map((q) => q.get("sort"))).toContain("random_123");
    for (const request of queueRequests()) {
      expect(request.get("sort")).toBe("random_123");
    }
    expect(lastSceneState().playlist.scenes).toEqual(queueOf(shuffled).entries);
  });

  it("Play before the queue has loaded reads it, then starts entry 0", async () => {
    let answerQueue: (response: Response) => void = () => undefined;
    serve({
      page: () => playlistPage(items),
      queue: queueOf(items),
      permissions: {},
    });
    const queued = new Promise<Response>((resolve) => {
      answerQueue = resolve;
    });
    const base = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.split("?")[0]?.endsWith("/playlists/5/queue")
        ? queued
        : must(base, "stub")(url, init)
    );
    renderPage();
    await screen.findByText("Scene 1");

    fireEvent.click(screen.getByTitle("Play Playlist"));
    answerQueue(jsonResponse(200, queueOf(items)));

    await screen.findByText("Scene page /scene/1");
    expect(lastSceneState().playlist.currentIndex).toBe(0);
  });

  it("an empty queue shows 'Nothing in this playlist is available to you' and does not navigate", async () => {
    // The page was read while its scenes were visible; by the time the
    // queue is read, none is
    serve({
      page: () => playlistPage(items),
      queue: { entries: [] },
      permissions: {},
    });
    renderPage();
    const play = await screen.findByTitle("Play Playlist");
    await waitFor(() => expect(queueRequests()).toHaveLength(1));

    fireEvent.click(play);

    await waitFor(() =>
      expect(vi.mocked(showWarning)).toHaveBeenCalledWith(
        "Nothing in this playlist is available to you"
      )
    );
    expect(sceneStates).toHaveLength(0);
  });
});

describe("PlaylistDetail reorder", () => {
  /** Page 2 of 120 items in playlist order, 50 a page */
  const pagedServer = (overrides = {}): Server => ({
    page: (query) => {
      const page = Number(query.get("page"));
      const perPage = Number(query.get("per_page"));
      const from = (page - 1) * perPage;
      return playlistPage(range(from, Math.min(from + perPage, 120)), {
        totalItems: 120,
        page,
        perPage,
        ...overrides,
      });
    },
    queue: queueOf(range(0, 120)),
    permissions: {},
  });

  it("Move up on the first row of page 2 sends PUT /items/<itemId>/position with index 49 and refetches", async () => {
    serve(pagedServer());
    renderPage("/playlist/5?page=2");
    await screen.findByText("Scene 50");

    fireEvent.click(screen.getByTitle("Reorder Scenes"));
    const firstRow = must(screen.getAllByTestId("playlist-row")[0], "row");
    fireEvent.click(within(firstRow).getByTitle("Move up"));

    await waitFor(() =>
      expect(sentTo("/playlists/5/items/50/position")).toEqual([
        { method: "PUT", body: { index: 49 } },
      ])
    );
    // The page is read again
    await waitFor(() => expect(pageRequests().length).toBeGreaterThan(1));
    expect(sentTo("/playlists/5/reorder")).toEqual([]);
  });

  it("Move to top and Move to bottom name the first and last index of the playlist", async () => {
    serve(pagedServer());
    renderPage("/playlist/5?page=2");
    await screen.findByText("Scene 50");
    fireEvent.click(screen.getByTitle("Reorder Scenes"));

    const row = must(screen.getAllByTestId("playlist-row")[3], "row");
    fireEvent.click(within(row).getByTitle("Move to top"));
    await waitFor(() =>
      expect(sentTo("/playlists/5/items/53/position")).toHaveLength(1)
    );
    // The arrows wait while a move is saved
    await waitFor(() =>
      expect(
        within(
          must(screen.getAllByTestId("playlist-row")[3], "row")
        ).getByTitle("Move to bottom")
      ).toBeEnabled()
    );
    fireEvent.click(
      within(must(screen.getAllByTestId("playlist-row")[3], "row")).getByTitle(
        "Move to bottom"
      )
    );

    await waitFor(() =>
      expect(sentTo("/playlists/5/items/53/position")).toEqual([
        { method: "PUT", body: { index: 0 } },
        { method: "PUT", body: { index: 119 } },
      ])
    );
  });

  it("the position box moves on Enter or blur, not on each keystroke", async () => {
    serve(pagedServer());
    renderPage("/playlist/5?page=2");
    await screen.findByText("Scene 50");
    fireEvent.click(screen.getByTitle("Reorder Scenes"));

    const box = within(
      must(screen.getAllByTestId("playlist-row")[0], "row")
    ).getByLabelText("Position");
    // The box shows the item's place in the whole playlist
    expect(box).toHaveValue(51);

    fireEvent.change(box, { target: { value: "1" } });
    fireEvent.change(box, { target: { value: "12" } });
    expect(sentTo("/playlists/5/items/50/position")).toEqual([]);

    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() =>
      expect(sentTo("/playlists/5/items/50/position")).toEqual([
        { method: "PUT", body: { index: 11 } },
      ])
    );
    // The blur that follows does not send it again
    fireEvent.blur(box);

    const second = within(
      must(screen.getAllByTestId("playlist-row")[1], "row")
    ).getByLabelText("Position");
    await waitFor(() => expect(second).toBeEnabled());
    fireEvent.change(second, { target: { value: "500" } });
    expect(sentTo("/playlists/5/items/51/position")).toEqual([]);
    fireEvent.blur(second);

    // Past the end is the last place
    await waitFor(() =>
      expect(sentTo("/playlists/5/items/51/position")).toEqual([
        { method: "PUT", body: { index: 119 } },
      ])
    );
    expect(sentTo("/playlists/5/items/50/position")).toHaveLength(1);
  });

  it("the mode has a Done button and no Save/Cancel, and pages stay", async () => {
    serve(pagedServer());
    renderPage("/playlist/5?page=2");
    await screen.findByText("Scene 50");

    fireEvent.click(screen.getByTitle("Reorder Scenes"));

    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.queryByTitle("Save Order")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
    expect(screen.getByTitle("Next Page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByTitle("Reorder Scenes")).toBeInTheDocument();
    expect(screen.queryAllByLabelText("Position")).toHaveLength(0);
  });

  it("the Reorder button is hidden under another sort and from a recipient", async () => {
    serve(pagedServer());
    const { unmount } = renderPage("/playlist/5?sort=title&direction=ASC");
    await screen.findByText("Scene 0");
    expect(screen.queryByTitle("Reorder Scenes")).not.toBeInTheDocument();
    unmount();

    serve(pagedServer({ isOwner: false, accessLevel: "shared" }));
    renderPage();
    await screen.findByText("Scene 0");
    expect(screen.queryByTitle("Reorder Scenes")).not.toBeInTheDocument();
  });
});

describe("PlaylistDetail bulk remove", () => {
  it("bulk remove sends one POST /items/remove with the selected item ids and reports the count", async () => {
    serve({
      page: () => playlistPage(twoServers.concat(item(3, "8", "inst-a"))),
      queue: queueOf(twoServers),
      permissions: {},
    });
    renderPage();
    const rows = await screen.findAllByTestId("playlist-row");
    expect(rows).toHaveLength(3);

    fireEvent.click(must(screen.getAllByTitle("Select")[0], "first select"));
    fireEvent.click(must(screen.getAllByTitle("Select")[1], "second select"));
    fireEvent.click(await screen.findByRole("button", { name: "Remove 2" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove",
      })
    );

    await waitFor(() =>
      expect(sentTo("/playlists/5/items/remove")).toEqual([
        { method: "POST", body: { itemIds: [1, 2] } },
      ])
    );
    await waitFor(() =>
      expect(vi.mocked(showSuccess)).toHaveBeenCalledWith(
        "Removed 2 scenes from playlist"
      )
    );
    expect(writes().filter((w) => w.method === "DELETE")).toEqual([]);
  });
});

describe("PlaylistDetail Save as playlist order", () => {
  const items = range(1, 4);

  it("Save as playlist order (owner, sort not position) confirms, naming the unavailable count, and posts {sort, direction}", async () => {
    serve({
      page: () => playlistPage(items, { unavailableItems: 4 }),
      queue: queueOf(items),
      permissions: {},
    });
    renderPage("/playlist/5?sort=title&direction=DESC");
    await screen.findByText("Scene 1");

    fireEvent.click(
      screen.getByRole("button", { name: "Save as playlist order" })
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "4 items you can't see keep their order after the ones you see"
    );
    expect(sentTo("/playlists/5/sort")).toEqual([]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Save order" }));

    await waitFor(() =>
      expect(sentTo("/playlists/5/sort")).toEqual([
        { method: "POST", body: { sort: "title", direction: "DESC" } },
      ])
    );
    // The page now shows the playlist's own order
    await waitFor(() => expect(search().toString()).toBe(""));
  });

  it("is not offered in the playlist's own order", async () => {
    serve({
      page: () => playlistPage(items),
      queue: queueOf(items),
      permissions: {},
    });
    renderPage();
    await screen.findByText("Scene 1");

    expect(
      screen.queryByRole("button", { name: "Save as playlist order" })
    ).not.toBeInTheDocument();
  });

  it("a recipient sees no Save as playlist order", async () => {
    serve({
      page: () =>
        playlistPage(items, { isOwner: false, accessLevel: "shared" }),
      queue: queueOf(items),
      permissions: {},
    });
    renderPage("/playlist/5?sort=title&direction=DESC");
    await screen.findByText("Scene 1");

    expect(
      screen.queryByRole("button", { name: "Save as playlist order" })
    ).not.toBeInTheDocument();
  });
});

describe("PlaylistDetail unavailable items", () => {
  const items = range(1, 3);

  it("an owner with unavailable items sees '3 unavailable' and Remove unavailable, which posts to the remove-unavailable route", async () => {
    serve({
      page: () => playlistPage(items, { unavailableItems: 3 }),
      queue: queueOf(items),
      permissions: {},
    });
    renderPage();

    expect(await screen.findByText("3 unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove unavailable" }));
    const dialog = screen.getByRole("dialog");
    // It removes only what is deleted from Stash, and says so
    expect(dialog).toHaveTextContent("deleted from Stash");
    expect(dialog).toHaveTextContent(
      "Hidden or restricted scenes, and scenes on servers you don't use, stay"
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(sentTo("/playlists/5/items/remove-unavailable")).toEqual([
        { method: "POST", body: undefined },
      ])
    );
    await waitFor(() =>
      expect(vi.mocked(showSuccess)).toHaveBeenCalledWith(
        "Removed 2 deleted scenes"
      )
    );
  });

  it("a recipient sees nothing about unavailable items", async () => {
    serve({
      page: () =>
        playlistPage(items, {
          unavailableItems: 3,
          isOwner: false,
          accessLevel: "shared",
        }),
      queue: queueOf(items),
      permissions: {},
    });
    renderPage();
    await screen.findByText("Scene 1");

    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove unavailable" })
    ).not.toBeInTheDocument();
  });
});

describe("PlaylistDetail shuffle, repeat, description and owner", () => {
  const items = range(1, 3);
  const sharedServer = (): Server => ({
    page: () => playlistPage(items, { isOwner: false, accessLevel: "shared" }),
    queue: queueOf(items),
    permissions: {},
  });

  it("a recipient's Shuffle and Repeat change the view only and send no PUT", async () => {
    serve(sharedServer());
    renderPage();
    await screen.findByText("Scene 1");

    fireEvent.click(screen.getByTitle("Shuffle disabled"));
    expect(await screen.findByTitle("Shuffle enabled")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Repeat off"));
    expect(await screen.findByTitle("Repeat all")).toBeInTheDocument();

    expect(writes()).toEqual([]);
    expect(vi.mocked(showError)).not.toHaveBeenCalled();

    // Play carries the recipient's choice
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      fireEvent.click(screen.getByTitle("Play Playlist"));
      await screen.findByText("Scene page /scene/2");
      expect(lastSceneState().playlist).toEqual(
        expect.objectContaining({ shuffle: true, repeat: "all" })
      );
    } finally {
      random.mockRestore();
    }
  });

  it("the owner's Shuffle and Repeat still save", async () => {
    serve({
      page: () => playlistPage(items),
      queue: queueOf(items),
      permissions: {},
    });
    renderPage();
    await screen.findByText("Scene 1");

    fireEvent.click(screen.getByTitle("Shuffle disabled"));
    await waitFor(() =>
      expect(sentTo("/playlists/5")).toContainEqual({
        method: "PUT",
        body: { shuffle: true },
      })
    );
    fireEvent.click(screen.getByTitle("Repeat off"));
    await waitFor(() =>
      expect(sentTo("/playlists/5")).toContainEqual({
        method: "PUT",
        body: { repeat: "all" },
      })
    );
  });

  it("clearing the description sends description: null", async () => {
    serve({
      page: () =>
        playlistPage(items, {
          playlist: {
            ...playlistPage(items).playlist,
            description: "Old words",
          },
        } as Partial<GetPlaylistResponse>),
      queue: queueOf(items),
      permissions: {},
    });
    renderPage();
    await screen.findByText("Scene 1");

    fireEvent.click(screen.getByTitle("Edit Playlist"));
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(sentTo("/playlists/5")).toContainEqual({
        method: "PUT",
        body: { name: "Mine", description: null },
      })
    );
  });

  it("a recipient sees 'Shared by <owner.username>'", async () => {
    serve({
      page: () =>
        playlistPage(items, {
          isOwner: false,
          accessLevel: "shared",
          owner: { id: 9, username: "alice" },
        }),
      queue: queueOf(items),
      permissions: {},
    });
    renderPage();

    expect(await screen.findByText("Shared by alice")).toBeInTheDocument();
  });

  it("the add-to-playlist menus leave this playlist out by its number id", async () => {
    serve({
      page: () => playlistPage(items),
      queue: queueOf(items),
      permissions: {},
    });
    renderPage();
    await screen.findByText("Scene 1");

    expect(addButtonExclusions.length).toBeGreaterThan(0);
    for (const excluded of addButtonExclusions) {
      expect(excluded).toEqual([5]);
    }
  });
});
