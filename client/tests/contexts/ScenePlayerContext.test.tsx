import type { ComponentProps, ReactNode } from "react";
import {
  type Location,
  MemoryRouter,
  type NavigateFunction,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { actAsync } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import { ApiError } from "@/api/client";
import { LIBRARY_READY_POLL_MS } from "@/api/hooks/useLibraryReady";
import { createQueryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";
import { useConfig } from "@/contexts/ConfigContext";
import {
  ScenePlayerProvider,
  useScenePlayer,
} from "@/contexts/ScenePlayerContext";
import { markInternalPop } from "@/utils/historyGuard";
import {
  type PlaybackQueue,
  readSceneLocationState,
} from "@/utils/playbackQueue";
import { jsonResponse, stubApi } from "../helpers/stubApi";

// ---------------------------------------------------------------------------
// Mocks (must be defined before imports that use them)
// ---------------------------------------------------------------------------

const mockPost = vi.fn<(...args: unknown[]) => unknown>();
vi.mock("@/api", () => ({
  apiPost: (...args: unknown[]) => mockPost(...args),
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));

const useConfigMock = useConfig as unknown as Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockScene = {
  id: "scene-42",
  title: "Test Scene",
  o_counter: 5,
  instanceId: "inst-1",
};

const mockApiResponse = (scene: Record<string, unknown> = mockScene) => ({
  findScenes: { scenes: [scene] },
});

/** Answers each scene load with the scene it asked for, on inst-1 */
function answerAskedScene() {
  mockPost.mockImplementation((_path: unknown, body: unknown) => {
    const { ids } = body as { ids: string[] };
    return Promise.resolve(
      mockApiResponse({
        id: ids[0],
        title: `Scene ${String(ids[0])}`,
        instanceId: "inst-1",
      })
    );
  });
}

/** The router as the provider sees it, read after each render */
const probe: {
  location: Location | null;
  navigate: NavigateFunction | null;
} = { location: null, navigate: null };

/** A queue of scenes on inst-1, as `buildPlaybackQueue` makes it */
function queueOf(
  key: string,
  sceneIds: string[],
  currentIndex = 0
): PlaybackQueue {
  return {
    key,
    id: "virtual-grid",
    name: "Grid",
    shuffle: false,
    repeat: "none",
    currentIndex,
    scenes: sceneIds.map((sceneId, position) => ({
      sceneId,
      instanceId: "inst-1",
      position,
      scene: {
        title: `Scene ${sceneId}`,
        paths: { screenshot: null },
        files: [],
        studio: null,
      },
    })),
  };
}

/** The queue the current history entry holds */
function entryQueue() {
  return readSceneLocationState(probe.location?.state).playlist ?? null;
}

type ProviderProps = Omit<
  ComponentProps<typeof ScenePlayerProvider>,
  "children" | "playlist" | "shouldResume" | "initialShouldAutoplay"
>;

/**
 * The Scene route as the page renders it: the provider takes the scene from
 * the URL and the queue from the history entry's state. The queue object is
 * new on every render, as a restore from storage made it.
 */
function SceneRoute({
  children,
  props,
}: {
  children: ReactNode;
  props: Partial<ProviderProps>;
}) {
  const { sceneId } = useParams<{ sceneId: string }>();
  const location = useLocation();
  probe.location = location;
  probe.navigate = useNavigate();
  const state = readSceneLocationState(location.state);
  const instanceId = new URLSearchParams(location.search).get("instance");
  return (
    <ScenePlayerProvider
      sceneId={sceneId ?? ""}
      instanceId={instanceId}
      playlist={state.playlist ? { ...state.playlist } : null}
      shouldResume={state.shouldResume ?? false}
      initialShouldAutoplay={state.shouldAutoplay ?? false}
      {...props}
    >
      {children}
    </ScenePlayerProvider>
  );
}

/** Another page of the app (Back from a queue lands here) */
function OtherPage() {
  probe.location = useLocation();
  probe.navigate = useNavigate();
  return null;
}

type Entry = { pathname: string; search?: string; state?: unknown };

/** A router holding `entries` (the last one current) around the provider */
function routerWrapper(
  entries: Entry[],
  props: Partial<ProviderProps> = {},
  client = createQueryClient()
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={entries}
          initialIndex={entries.length - 1}
        >
          <Routes>
            <Route
              path="/scene/:sceneId"
              element={<SceneRoute props={props}>{children}</SceneRoute>}
            />
            <Route path="*" element={<OtherPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

/** The provider on one scene, with what a navigation hands it */
function createWrapper(
  props: Partial<
    ProviderProps & {
      playlist: unknown;
      shouldResume: boolean;
      initialShouldAutoplay: boolean;
    }
  > = {},
  client = createQueryClient()
) {
  const {
    sceneId = "scene-42",
    instanceId = "inst-1",
    playlist = null,
    shouldResume = false,
    initialShouldAutoplay = false,
    ...rest
  } = props;
  return routerWrapper(
    [
      {
        pathname: `/scene/${sceneId}`,
        search: instanceId ? `?instance=${instanceId}` : "",
        state: {
          playlist,
          shouldResume,
          shouldAutoplay: initialShouldAutoplay,
        },
      },
    ],
    rest,
    client
  );
}

/** A queue started from /scenes on its entry at `currentIndex` */
function queueEntries(
  queue: PlaybackQueue,
  extra: Record<string, unknown> = {}
) {
  const entry = queue.scenes[queue.currentIndex];
  return [
    { pathname: "/scenes" },
    {
      pathname: `/scene/${entry?.sceneId ?? ""}`,
      state: { playlist: queue, ...extra },
    },
  ];
}

/** Navigates as a click in the app would, inside act */
async function go(
  to: string | number,
  options?: { state?: unknown; replace?: boolean }
) {
  const navigate = probe.navigate;
  if (!navigate) throw new Error("no router rendered");
  await act(async () => {
    await (typeof to === "number" ? navigate(to) : navigate(to, options));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScenePlayerContext", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: API returns a scene
    mockPost.mockResolvedValue(mockApiResponse());
    // Suppress console.error from intentional error tests
    vi.spyOn(console, "error").mockImplementation(() => {});
    useConfigMock.mockReturnValue({ hasMultipleInstances: false });
    probe.location = null;
    probe.navigate = null;
  });

  // =========================================================================
  // useScenePlayer hook
  // =========================================================================

  describe("useScenePlayer hook", () => {
    it("throws when used outside ScenePlayerProvider", () => {
      expect(() => {
        renderHook(() => useScenePlayer());
      }).toThrow("useScenePlayer must be used within ScenePlayerProvider");
    });

    it("returns context value when used inside ScenePlayerProvider", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      // Wait for the initial scene load triggered by the effect
      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      // State properties from initialState
      expect(result.current).toHaveProperty("scene");
      expect(result.current).toHaveProperty("sceneLoading");
      expect(result.current).toHaveProperty("sceneError");
      expect(result.current).toHaveProperty("quality");
      expect(result.current).toHaveProperty("playlist");
      expect(result.current).toHaveProperty("currentIndex");
      expect(result.current).toHaveProperty("autoplayNext");
      expect(result.current).toHaveProperty("shuffle");
      expect(result.current).toHaveProperty("repeat");
      expect(result.current).toHaveProperty("oCounter");

      // Action creators
      expect(typeof result.current.loadScene).toBe("function");
      expect(typeof result.current.nextScene).toBe("function");
      expect(typeof result.current.prevScene).toBe("function");
      expect(typeof result.current.gotoSceneIndex).toBe("function");
      expect(typeof result.current.toggleAutoplayNext).toBe("function");
      expect(typeof result.current.toggleShuffle).toBe("function");
      expect(typeof result.current.toggleRepeat).toBe("function");

      // dispatch is exposed
      expect(typeof result.current.dispatch).toBe("function");
    });
  });

  // =========================================================================
  // ScenePlayerProvider initialization
  // =========================================================================

  describe("ScenePlayerProvider", () => {
    it("initializes with default props", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(result.current.quality).toBe("direct");
      expect(result.current.currentIndex).toBe(0);
      expect(result.current).not.toHaveProperty("compatibility");
      expect(result.current.playlist).toBeNull();
    });

    it("initializes with playlist props", async () => {
      const playlist = {
        id: "pl-1",
        scenes: [
          { sceneId: "s-1", instanceId: "i-1" },
          { sceneId: "s-2", instanceId: "i-2" },
        ],
        currentIndex: 1,
      };

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ playlist }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(result.current.playlist).not.toBeNull();
      expect(result.current.currentIndex).toBe(1);
    });

    it("initializes with the quality prop", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ initialQuality: "720p" }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(result.current.quality).toBe("720p");
    });

    it("passes shouldResume prop through to context value", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ shouldResume: true }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(result.current.shouldResume).toBe(true);
    });

    it("passes shouldResume=false by default", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(result.current.shouldResume).toBe(false);
    });
  });

  // =========================================================================
  // loadScene
  // =========================================================================

  describe("loadScene", () => {
    it("loads a scene from the API and updates state", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(result.current.scene).toEqual(mockScene);
      expect(result.current.oCounter).toBe(5);
      expect(mockPost).toHaveBeenCalledWith("/library/scenes", {
        ids: ["scene-42"],
        scene_filter: { instance_id: "inst-1" },
      });
    });

    it("dispatches LOAD_SCENE_ERROR when scene is not found", async () => {
      mockPost.mockResolvedValue({
        findScenes: { scenes: [] },
      });

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(result.current.scene).toBeNull();
      // A 404, so the Scene page shows "Scene not found" and not an error
      expect(result.current.sceneError).toBeInstanceOf(ApiError);
      expect((result.current.sceneError as ApiError).status).toBe(404);
      expect((result.current.sceneError as ApiError).message).toBe(
        "Scene not found"
      );
    });

    it("the library-initializing 503 keeps loading and loads the scene once the library is ready", async () => {
      vi.useFakeTimers();
      stubApi({
        "/library/ready": () => jsonResponse(200, { ready: true }),
      });
      mockPost.mockRejectedValueOnce(
        new ApiError("Server is initializing", 503, { ready: false })
      );
      const client = createQueryClient();

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({}, client),
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      expect(result.current.sceneError).toBeNull();
      expect(result.current.sceneLoading).toBe(true);
      expect(client.getQueryData(queryKeys.library.ready())).toEqual({
        ready: false,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(LIBRARY_READY_POLL_MS + 50);
      });
      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(result.current.scene).toEqual(mockScene);
    });

    it("retryScene loads the scene again after a failure", async () => {
      mockPost.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.sceneError).toBeTruthy();
      });
      expect(result.current.scene).toBeNull();

      await actAsync(() => result.current.retryScene());

      await waitFor(() => {
        expect(result.current.scene).toEqual(mockScene);
      });
      expect(result.current.sceneError).toBeNull();
      expect(mockPost).toHaveBeenCalledTimes(2);
    });

    it("dispatches LOAD_SCENE_ERROR on API network failure", async () => {
      const networkError = new Error("Network error");
      mockPost.mockRejectedValue(networkError);

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(result.current.scene).toBeNull();
      expect(result.current.sceneError).toBe(networkError);
    });

    it("includes scene_filter with instance_id when instanceId is provided", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ instanceId: "inst-abc" }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(mockPost).toHaveBeenCalledWith("/library/scenes", {
        ids: ["scene-42"],
        scene_filter: { instance_id: "inst-abc" },
      });
    });

    it("omits scene_filter when instanceId is null", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ instanceId: null }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(mockPost).toHaveBeenCalledWith("/library/scenes", {
        ids: ["scene-42"],
      });
    });

    it("sets oCounter to 0 when scene has no o_counter", async () => {
      const sceneNoCounter = { id: "s-1", title: "No Counter" };
      mockPost.mockResolvedValue(mockApiResponse(sceneNoCounter));

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(result.current.oCounter).toBe(0);
    });
  });

  // =========================================================================
  // Scene loading effect
  // =========================================================================

  describe("scene loading effect", () => {
    it("loads scene on mount using sceneId prop", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ sceneId: "scene-99" }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(mockPost).toHaveBeenCalledWith(
        "/library/scenes",
        expect.objectContaining({ ids: ["scene-99"] })
      );
    });

    it("uses playlist scene ID over prop sceneId", async () => {
      const playlist = {
        scenes: [
          { sceneId: "playlist-scene-1", instanceId: "pl-inst-1" },
          { sceneId: "playlist-scene-2", instanceId: "pl-inst-2" },
        ],
        currentIndex: 0,
      };

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({
          sceneId: "prop-scene-id",
          instanceId: "prop-inst-id",
          playlist,
        }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      // Should use playlist scene ID, not prop sceneId
      expect(mockPost).toHaveBeenCalledWith("/library/scenes", {
        ids: ["playlist-scene-1"],
        scene_filter: { instance_id: "pl-inst-1" },
      });
    });
  });

  // =========================================================================
  // Navigation helpers
  // =========================================================================

  describe("navigation helpers", () => {
    it("advancing to an entry on another server loads it from that server", async () => {
      // Scene 7 on A, then scene 7 on B. The entries name their instance
      // only through their scene, as a playlist saved before entries
      // carried one does; the player started on A's scene.
      const playlist = {
        scenes: [
          { sceneId: "7", scene: { id: "7", instanceId: "inst-a" } },
          { sceneId: "7", scene: { id: "7", instanceId: "inst-b" } },
        ],
        currentIndex: 0,
      };

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({
          sceneId: "7",
          instanceId: "inst-a",
          playlist,
        }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });
      expect(mockPost).toHaveBeenLastCalledWith("/library/scenes", {
        ids: ["7"],
        scene_filter: { instance_id: "inst-a" },
      });

      act(() => {
        result.current.nextScene();
      });

      await waitFor(() => {
        expect(mockPost).toHaveBeenLastCalledWith("/library/scenes", {
          ids: ["7"],
          scene_filter: { instance_id: "inst-b" },
        });
      });
    });

    it("nextScene dispatches NEXT_SCENE", async () => {
      const playlist = {
        scenes: [
          { sceneId: "s-1", instanceId: "i-1" },
          { sceneId: "s-2", instanceId: "i-2" },
        ],
        currentIndex: 0,
      };

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ playlist }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      act(() => {
        result.current.nextScene();
      });

      // After NEXT_SCENE, currentIndex should advance
      expect(result.current.currentIndex).toBe(1);
    });

    it("prevScene dispatches PREV_SCENE", async () => {
      const playlist = {
        scenes: [
          { sceneId: "s-1", instanceId: "i-1" },
          { sceneId: "s-2", instanceId: "i-2" },
        ],
        currentIndex: 1,
      };

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ playlist }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      act(() => {
        result.current.prevScene();
      });

      // After PREV_SCENE, currentIndex should go back
      expect(result.current.currentIndex).toBe(0);
    });

    it("gotoSceneIndex dispatches with index and shouldAutoplay", async () => {
      const playlist = {
        scenes: [
          { sceneId: "s-1", instanceId: "i-1" },
          { sceneId: "s-2", instanceId: "i-2" },
          { sceneId: "s-3", instanceId: "i-3" },
        ],
        currentIndex: 0,
      };

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ playlist }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      act(() => {
        result.current.gotoSceneIndex(2, true);
      });

      expect(result.current.currentIndex).toBe(2);
      expect(result.current.shouldAutoplay).toBe(true);
    });
  });

  // =========================================================================
  // Toggle controls
  // =========================================================================

  describe("toggle controls", () => {
    it("toggleAutoplayNext dispatches TOGGLE_AUTOPLAY_NEXT", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      // Default autoplayNext is true
      expect(result.current.autoplayNext).toBe(true);

      act(() => {
        result.current.toggleAutoplayNext();
      });

      expect(result.current.autoplayNext).toBe(false);

      act(() => {
        result.current.toggleAutoplayNext();
      });

      expect(result.current.autoplayNext).toBe(true);
    });

    it("toggleShuffle dispatches TOGGLE_SHUFFLE", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      // Default shuffle is false
      expect(result.current.shuffle).toBe(false);

      act(() => {
        result.current.toggleShuffle();
      });

      expect(result.current.shuffle).toBe(true);

      act(() => {
        result.current.toggleShuffle();
      });

      expect(result.current.shuffle).toBe(false);
    });

    it("toggleRepeat cycles through none -> all -> one -> none", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      // Default repeat is "none"
      expect(result.current.repeat).toBe("none");

      act(() => {
        result.current.toggleRepeat();
      });
      expect(result.current.repeat).toBe("all");

      act(() => {
        result.current.toggleRepeat();
      });
      expect(result.current.repeat).toBe("one");

      act(() => {
        result.current.toggleRepeat();
      });
      expect(result.current.repeat).toBe("none");
    });

    it("toggling shuffle, repeat or autoplay posts no second /library/scenes", async () => {
      const playlist = {
        id: "virtual-grid",
        name: "Scene Grid",
        shuffle: false,
        repeat: "none",
        scenes: [
          { sceneId: "s-1", instanceId: "i-1" },
          { sceneId: "s-2", instanceId: "i-1" },
        ],
        currentIndex: 0,
      };
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ sceneId: "s-1", instanceId: "i-1", playlist }),
      });
      await waitFor(() => {
        expect(result.current.scene).not.toBeNull();
      });
      const loads = mockPost.mock.calls.length;

      act(() => {
        result.current.toggleShuffle();
      });
      act(() => {
        result.current.toggleRepeat();
      });
      act(() => {
        result.current.toggleAutoplayNext();
      });
      await actAsync(() => {});

      expect(result.current.shuffle).toBe(true);
      expect(result.current.repeat).toBe("all");
      expect(result.current.autoplayNext).toBe(false);
      expect(mockPost.mock.calls.length).toBe(loads);
    });
  });

  // =========================================================================
  // The queue and the router
  // =========================================================================

  describe("the queue and the router", () => {
    beforeEach(() => {
      answerAskedScene();
    });

    /** The provider on a queue started from /scenes, its scene loaded */
    async function startQueue(
      queue: PlaybackQueue,
      extra: Record<string, unknown> = {}
    ) {
      const rendered = renderHook(() => useScenePlayer(), {
        wrapper: routerWrapper(queueEntries(queue, extra)),
      });
      await waitFor(() => {
        expect(rendered.result.current.scene?.id).toBe(
          queue.scenes[queue.currentIndex]?.sceneId
        );
      });
      return rendered;
    }

    it("a re-render with a new queue object of the same key does not re-initialize: after Next the index stays", async () => {
      const { result, rerender } = await startQueue(
        queueOf("q1", ["1", "2", "3"])
      );

      act(() => {
        result.current.nextScene();
      });
      rerender();
      rerender();

      await waitFor(() => {
        expect(result.current.scene?.id).toBe("2");
      });
      expect(result.current.currentIndex).toBe(1);
    });

    it("advancing replaces the router location: the path is the entry's scene, state.playlist.currentIndex is the new index, and history length is unchanged", async () => {
      const replaceState = vi.spyOn(window.history, "replaceState");
      const { result } = await startQueue(queueOf("q1", ["1", "2", "3"]), {
        fromPageTitle: "Scenes",
      });

      act(() => {
        result.current.nextScene();
      });

      await waitFor(() => {
        expect(probe.location?.pathname).toBe("/scene/2");
      });
      expect(entryQueue()?.currentIndex).toBe(1);
      expect(entryQueue()?.key).toBe("q1");
      const state = probe.location?.state as Record<string, unknown>;
      expect(state.fromPageTitle).toBe("Scenes");
      // A queue step leaves the reader's scroll position alone
      expect(state.keepScroll).toBe(true);
      // Only the router's history moved, never the window's behind its back
      expect(replaceState).not.toHaveBeenCalled();
      replaceState.mockRestore();

      // Replaced, not pushed: one Back leaves the queue for the page it
      // started from
      await go(-1);
      expect(probe.location?.pathname).toBe("/scenes");
    });

    it("a search-only navigation on the current scene (a tab click, no state) keeps the queue and index", async () => {
      const { result } = await startQueue(queueOf("q1", ["1", "2", "3"]));
      act(() => {
        result.current.nextScene();
      });
      await waitFor(() => {
        expect(probe.location?.pathname).toBe("/scene/2");
      });

      await go("/scene/2?tab=collections");

      await waitFor(() => {
        expect(entryQueue()?.currentIndex).toBe(1);
      });
      expect(probe.location?.search).toBe("?tab=collections");
      expect(result.current.playlist?.key).toBe("q1");
      expect(result.current.currentIndex).toBe(1);
      expect(result.current.scene?.id).toBe("2");
    });

    it("a navigation to a scene not in the queue, with no queue in its state, leaves queue mode and loads that scene", async () => {
      const { result } = await startQueue(queueOf("q1", ["1", "2", "3"]));

      await go("/scene/9");

      await waitFor(() => {
        expect(result.current.scene?.id).toBe("9");
      });
      expect(result.current.playlist).toBeNull();
      expect(mockPost).toHaveBeenLastCalledWith("/library/scenes", {
        ids: ["9"],
      });
      expect(probe.location?.pathname).toBe("/scene/9");
    });

    it("a navigation with a different queue key starts that queue at its currentIndex", async () => {
      const { result } = await startQueue(queueOf("q1", ["1", "2", "3"]));

      await go("/scene/5", {
        state: { playlist: queueOf("q2", ["4", "5"], 1) },
      });

      await waitFor(() => {
        expect(result.current.scene?.id).toBe("5");
      });
      expect(result.current.playlist?.key).toBe("q2");
      expect(result.current.currentIndex).toBe(1);
    });

    it("the fullscreen guard's own Back is not followed: the location is replaced with the current entry", async () => {
      const queue = queueOf("q1", ["1", "2", "3"]);
      // The guard's entry sits on top of the scene's own
      const [list, scene] = queueEntries(queue);
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: routerWrapper([list as Entry, scene as Entry, scene as Entry]),
      });
      await waitFor(() => {
        expect(result.current.scene?.id).toBe("1");
      });
      act(() => {
        result.current.nextScene();
      });
      await waitFor(() => {
        expect(probe.location?.pathname).toBe("/scene/2");
      });

      markInternalPop();
      await go(-1);

      await waitFor(() => {
        expect(probe.location?.pathname).toBe("/scene/2");
      });
      expect(entryQueue()?.currentIndex).toBe(1);
      expect(result.current.currentIndex).toBe(1);
      expect(result.current.scene?.id).toBe("2");
    });

    it("after a tab click, a reload restores the queue at its index and `shouldResume` survives the next step", async () => {
      const first = await startQueue(queueOf("q1", ["1", "2", "3"]), {
        shouldResume: true,
        fromPageTitle: "Home",
      });
      act(() => {
        first.result.current.nextScene();
      });
      await waitFor(() => {
        expect(probe.location?.pathname).toBe("/scene/2");
      });
      await go("/scene/2?tab=collections");
      await waitFor(() => {
        expect(entryQueue()?.currentIndex).toBe(1);
      });
      const reloaded = probe.location;
      if (!reloaded) throw new Error("no location");
      first.unmount();

      // A reload: the browser keeps the entry's state
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: routerWrapper([
          { pathname: "/scenes" },
          {
            pathname: reloaded.pathname,
            search: reloaded.search,
            state: reloaded.state,
          },
        ]),
      });
      await waitFor(() => {
        expect(result.current.scene?.id).toBe("2");
      });
      expect(result.current.playlist?.key).toBe("q1");
      expect(result.current.currentIndex).toBe(1);
      expect(result.current.shouldResume).toBe(true);

      act(() => {
        result.current.nextScene();
      });
      await waitFor(() => {
        expect(probe.location?.pathname).toBe("/scene/3");
      });
      const state = probe.location?.state as Record<string, unknown>;
      expect(state.shouldResume).toBe(true);
      expect(state.fromPageTitle).toBe("Home");
    });

    it("a reload after turning Shuffle on keeps Shuffle on and its history", async () => {
      const random = vi.spyOn(Math, "random").mockReturnValue(0);
      const first = await startQueue(queueOf("q1", ["1", "2", "3"]));
      act(() => {
        first.result.current.toggleShuffle();
      });
      act(() => {
        first.result.current.toggleAutoplayNext();
      });
      // Shuffle picks the first scene not yet played: index 1
      act(() => {
        first.result.current.nextScene();
      });
      await waitFor(() => {
        expect(probe.location?.pathname).toBe("/scene/2");
      });
      random.mockRestore();
      const reloaded = probe.location;
      if (!reloaded) throw new Error("no location");
      first.unmount();

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: routerWrapper([
          {
            pathname: reloaded.pathname,
            search: reloaded.search,
            state: reloaded.state,
          },
        ]),
      });
      await waitFor(() => {
        expect(result.current.scene?.id).toBe("2");
      });

      expect(result.current.shuffle).toBe(true);
      expect(result.current.shuffleHistory).toEqual([0]);
      expect(result.current.autoplayNext).toBe(false);
      expect(result.current.currentIndex).toBe(1);
    });

    it("a control toggle writes the controls into the entry, on the same URL", async () => {
      const { result } = await startQueue(queueOf("q1", ["1", "2"]));
      await go("/scene/1?tab=galleries");

      act(() => {
        result.current.toggleRepeat();
      });

      await waitFor(() => {
        expect(entryQueue()?.controls?.repeat).toBe("all");
      });
      expect(probe.location?.pathname).toBe("/scene/1");
      expect(probe.location?.search).toBe("?tab=galleries");
    });

    it("a step to an entry of the same scene restarts it without loading it again", async () => {
      const { result } = await startQueue(queueOf("q1", ["1", "1"]));
      const loads = mockPost.mock.calls.length;

      act(() => {
        result.current.nextScene();
      });

      await waitFor(() => {
        expect(entryQueue()?.currentIndex).toBe(1);
      });
      expect(result.current.restartCount).toBe(1);
      expect(mockPost.mock.calls.length).toBe(loads);
    });
  });
});
