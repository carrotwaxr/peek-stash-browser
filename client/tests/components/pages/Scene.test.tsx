import type { ReactNode } from "react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { act, render, screen } from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import {
  type MockInstance,
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Scene from "@/components/pages/Scene";
import { useScenePlayer } from "@/contexts/ScenePlayerContext";

// The provider shows what it was handed, so a test reads the queue the page
// passes down; the player itself is not under test here.
vi.mock("@/contexts/ScenePlayerContext", () => ({
  ScenePlayerProvider: (props: {
    sceneId: string;
    instanceId?: string;
    playlist?: unknown;
    shouldResume?: boolean;
    children?: ReactNode;
  }) => (
    <div
      data-testid="provider"
      data-scene-id={props.sceneId}
      data-playlist={JSON.stringify(props.playlist ?? null)}
      data-should-resume={String(props.shouldResume ?? false)}
    >
      {props.children}
    </div>
  ),
  useScenePlayer: vi.fn(),
}));

// The page imports the player, which pulls in video.js and its VR polyfill
vi.mock("@/components/video-player/VideoPlayer", () => ({
  default: () => null,
}));
vi.mock("@/components/video-player/PlaybackControls", () => ({
  default: () => null,
}));
// The rest of the page reads data the test does not serve
vi.mock("@/components/pages/SceneDetails", () => ({ default: () => null }));
vi.mock("@/components/playlist/PlaylistSidebar", () => ({
  default: () => null,
}));
vi.mock("@/components/playlist/PlaylistStatusCard", () => ({
  default: () => null,
}));
vi.mock("@/components/ui/ViewInStashButton", () => ({ default: () => null }));
vi.mock("@/components/grids/index", () => ({
  GalleryGrid: () => null,
  GroupGrid: () => null,
}));
vi.mock("@/components/ui/index", () => ({
  Button: (props: { children?: ReactNode }) => (
    <button type="button">{props.children}</button>
  ),
  EntityNotFound: () => null,
  ExternalPlayerButton: () => null,
  LibraryInitializingBanner: () => null,
  RecommendedSidebar: () => null,
  ScenesLikeThis: () => null,
}));

/** What the page's content reads from the player, before a scene loads */
function playerValue(
  scene: { id: string; instanceId: string } | null
): ReturnType<typeof useScenePlayer> {
  return untrusted<ReturnType<typeof useScenePlayer>>({
    scene,
    sceneLoading: scene === null,
    sceneError: null,
    playlist: null,
    retryScene: () => {},
  });
}

const queue = {
  key: "q1",
  id: "virtual-grid",
  name: "Grid",
  shuffle: false,
  repeat: "none",
  currentIndex: 0,
  scenes: [
    {
      sceneId: "1",
      instanceId: "a",
      position: 0,
      scene: { title: "One" },
    },
    {
      sceneId: "2",
      instanceId: "b",
      position: 1,
      scene: { title: "Two" },
    },
  ],
};

function page(entry: { pathname: string; search?: string; state?: unknown }) {
  const router = createMemoryRouter(
    [{ path: "/scene/:sceneId", element: <Scene /> }],
    { initialEntries: [entry] }
  );
  return { router, element: <RouterProvider router={router} /> };
}

function playlistOf(testId = "provider") {
  const raw = screen.getByTestId(testId).getAttribute("data-playlist");
  return JSON.parse(raw ?? "null") as typeof queue | null;
}

describe("Scene page queue", () => {
  let getItem: MockInstance<Storage["getItem"]>;
  let setItem: MockInstance<Storage["setItem"]>;

  beforeAll(() => {
    getItem = vi.spyOn(Storage.prototype, "getItem");
    setItem = vi.spyOn(Storage.prototype, "setItem");
  });

  beforeEach(() => {
    sessionStorage.clear();
    // Back to the real methods, with no calls recorded
    getItem.mockReset();
    setItem.mockReset();
    vi.mocked(useScenePlayer).mockReturnValue(playerValue(null));
  });

  afterAll(() => {
    getItem.mockRestore();
    setItem.mockRestore();
    sessionStorage.clear();
  });

  it("the page neither reads nor writes sessionStorage", () => {
    render(page({ pathname: "/scene/1", state: { playlist: queue } }).element);

    expect(playlistOf()?.scenes).toHaveLength(2);
    // The data router reads its own view-transition key; the page reads none
    const pageReads = getItem.mock.calls.filter(
      ([key]) => key !== "remix-router-transitions"
    );
    expect(pageReads).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("a reload (an initial entry whose state holds the queue) restores the queue at its index", () => {
    render(
      page({
        pathname: "/scene/2",
        search: "?instance=b",
        state: { playlist: { ...queue, currentIndex: 1 }, shouldResume: true },
      }).element
    );

    const restored = playlistOf();
    expect(restored?.scenes).toHaveLength(2);
    expect(restored?.currentIndex).toBe(1);
    expect(
      screen.getByTestId("provider").getAttribute("data-should-resume")
    ).toBe("true");
  });

  it("an entry opened without state has no queue even if an old currentPlaylist key exists", () => {
    sessionStorage.setItem("currentPlaylist", JSON.stringify(queue));
    setItem.mockClear();

    render(page({ pathname: "/scene/2", search: "?instance=b" }).element);

    expect(playlistOf()).toBeNull();
  });

  it("?t=120 seeks once: a later tab click does not seek again", async () => {
    vi.useFakeTimers();
    const seeks = vi.fn();
    window.addEventListener("seekToTime", seeks);
    vi.mocked(useScenePlayer).mockReturnValue(
      playerValue({ id: "1", instanceId: "a" })
    );
    const { router, element } = page({
      pathname: "/scene/1",
      search: "?t=120",
    });
    render(element);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(seeks).toHaveBeenCalledTimes(1);

    await act(() => router.navigate("/scene/1?t=120&tab=collections"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(seeks).toHaveBeenCalledTimes(1);
    window.removeEventListener("seekToTime", seeks);
    vi.useRealTimers();
  });
});
