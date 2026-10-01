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
import { actAsync, createAuthValue, must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import { ApiError } from "@/api/client";
import { LIBRARY_READY_POLL_MS } from "@/api/hooks/useLibraryReady";
import { createQueryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";
import { AuthContext } from "@/contexts/AuthContextProvider";
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

const mockWarning = vi.fn<(message: string) => void>();
vi.mock("@/utils/toast", () => ({
  showWarning: (message: string) => mockWarning(message),
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

/** The user the tab is signed in as */
const SIGNED_IN_USER = 1;
const signedIn = createAuthValue({
  isAuthenticated: true,
  user: {
    id: SIGNED_IN_USER,
    username: "viewer",
    role: "USER",
    setupCompleted: true,
  },
});

/** A queue of scenes on inst-1, as `buildPlaybackQueue` makes it */
function queueOf(
  key: string,
  sceneIds: string[],
  currentIndex = 0
): PlaybackQueue {
  return {
    key,
    userId: SIGNED_IN_USER,
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
  return (
    readSceneLocationState(probe.location?.state, SIGNED_IN_USER).playlist ??
    null
  );
}

type ProviderProps = Omit<
  ComponentProps<typeof ScenePlayerProvider>,
  "children" | "playlist" | "shouldResume" | "initialShouldAutoplay"
>;

/** What a test hands the provider beyond what the route's entry gives it */
type RouteProps = Partial<ProviderProps> & { playlist?: PlaybackQueue | null };

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
  props: RouteProps;
}) {
  const { sceneId } = useParams<{ sceneId: string }>();
  const location = useLocation();
  probe.location = location;
  probe.navigate = useNavigate();
  const state = readSceneLocationState(location.state, SIGNED_IN_USER);
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
  props: RouteProps = {},
  client = createQueryClient()
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={signedIn}>
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
        </AuthContext.Provider>
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
      expect(result.current).toHaveProperty("playlist");
      expect(result.current).toHaveProperty("currentIndex");
      expect(result.current).toHaveProperty("autoplayNext");
      expect(result.current).toHaveProperty("shuffle");
      expect(result.current).toHaveProperty("repeat");
      expect(result.current).toHaveProperty("oCounter");

      // Action creators
      expect(typeof result.current.loadScene).toBe("function");
      expect(typeof result.current.registerPlayer).toBe("function");
      expect(typeof result.current.isPlaying).toBe("function");
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

      expect(result.current).not.toHaveProperty("quality");
      expect(result.current.currentIndex).toBe(0);
      expect(result.current).not.toHaveProperty("compatibility");
      expect(result.current.playlist).toBeNull();
    });

    it("initializes with playlist props", async () => {
      const playlist = {
        userId: SIGNED_IN_USER,
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
      expect(mockPost).toHaveBeenCalledWith(
        "/library/scenes",
        {
          ids: ["scene-42"],
          scene_filter: { instance_id: "inst-1" },
        },
        expect.any(AbortSignal)
      );
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

      expect(mockPost).toHaveBeenCalledWith(
        "/library/scenes",
        {
          ids: ["scene-42"],
          scene_filter: { instance_id: "inst-abc" },
        },
        expect.any(AbortSignal)
      );
    });

    it("omits scene_filter when instanceId is null", async () => {
      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ instanceId: null }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(mockPost).toHaveBeenCalledWith(
        "/library/scenes",
        {
          ids: ["scene-42"],
        },
        expect.any(AbortSignal)
      );
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
        expect.objectContaining({ ids: ["scene-99"] }),
        expect.any(AbortSignal)
      );
    });

    it("uses playlist scene ID over prop sceneId", async () => {
      const playlist = {
        userId: SIGNED_IN_USER,
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
      expect(mockPost).toHaveBeenCalledWith(
        "/library/scenes",
        {
          ids: ["playlist-scene-1"],
          scene_filter: { instance_id: "pl-inst-1" },
        },
        expect.any(AbortSignal)
      );
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
        userId: SIGNED_IN_USER,
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
      expect(mockPost).toHaveBeenLastCalledWith(
        "/library/scenes",
        {
          ids: ["7"],
          scene_filter: { instance_id: "inst-a" },
        },
        expect.any(AbortSignal)
      );

      act(() => {
        result.current.dispatch({ type: "NEXT_SCENE" });
      });

      await waitFor(() => {
        expect(mockPost).toHaveBeenLastCalledWith(
          "/library/scenes",
          {
            ids: ["7"],
            scene_filter: { instance_id: "inst-b" },
          },
          expect.any(AbortSignal)
        );
      });
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
        userId: SIGNED_IN_USER,
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
        result.current.dispatch({ type: "NEXT_SCENE" });
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
        result.current.dispatch({ type: "NEXT_SCENE" });
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
        result.current.dispatch({ type: "NEXT_SCENE" });
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
      expect(mockPost).toHaveBeenLastCalledWith(
        "/library/scenes",
        {
          ids: ["9"],
        },
        expect.any(AbortSignal)
      );
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
        result.current.dispatch({ type: "NEXT_SCENE" });
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
        first.result.current.dispatch({ type: "NEXT_SCENE" });
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
        result.current.dispatch({ type: "NEXT_SCENE" });
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
        first.result.current.dispatch({ type: "NEXT_SCENE" });
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

    it("the queue the player writes into the entry is stamped with the signed-in user", async () => {
      const { userId: _stamp, ...unstamped } = queueOf("q1", ["1", "2"]);
      const rendered = renderHook(() => useScenePlayer(), {
        wrapper: routerWrapper(
          [{ pathname: "/scene/1", search: "?instance=inst-1" }],
          { playlist: unstamped }
        ),
      });
      await waitFor(() => {
        expect(rendered.result.current.scene?.id).toBe("1");
      });

      // The mount write: the entry now holds the queue, and it is user 1's
      await waitFor(() => {
        expect(entryQueue()?.key).toBe("q1");
      });
      const written = (
        probe.location?.state as { playlist: { userId?: number } }
      ).playlist;
      expect(written.userId).toBe(SIGNED_IN_USER);
    });

    it("a step to an entry of the same scene restarts it without loading it again", async () => {
      const { result } = await startQueue(queueOf("q1", ["1", "1"]));
      const loads = mockPost.mock.calls.length;

      act(() => {
        result.current.dispatch({ type: "NEXT_SCENE" });
      });

      await waitFor(() => {
        expect(entryQueue()?.currentIndex).toBe(1);
      });
      expect(result.current.restartCount).toBe(1);
      expect(mockPost.mock.calls.length).toBe(loads);
    });

    describe("stale loads, unknown scenes and unavailable entries", () => {
      /**
       * Answers each scene load by its id: the scene, none (unknown, hidden
       * or restricted alike: the server leaves it out) or a failure
       */
      function answerScenes(answers: Record<string, "missing" | Error>) {
        mockPost.mockImplementation((_path: unknown, body: unknown) => {
          const id = must((body as { ids: string[] }).ids[0], "the scene id");
          const answer = answers[id];
          if (answer instanceof Error) return Promise.reject(answer);
          return Promise.resolve(
            answer === "missing"
              ? { findScenes: { scenes: [] } }
              : mockApiResponse({
                  id,
                  title: `Scene ${id}`,
                  instanceId: "inst-1",
                })
          );
        });
      }

      /** The scene id each /library/scenes request asked for, in order */
      function requestedIds() {
        return mockPost.mock.calls.map(
          (call) => (call[1] as { ids: string[] }).ids[0]
        );
      }

      /** Lets any further loads and steps run */
      async function settle() {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
        });
      }

      it("a slower answer for an earlier scene never replaces a later one", async () => {
        const { result } = await startQueue(queueOf("q1", ["1", "2", "3"]));
        const pending = new Map<
          string,
          { answer: () => void; signal: AbortSignal | undefined }
        >();
        mockPost.mockImplementation(
          (_path: unknown, body: unknown, signal: unknown) => {
            const id = must((body as { ids: string[] }).ids[0], "the scene id");
            return new Promise((resolve) => {
              pending.set(id, {
                answer: () =>
                  resolve(
                    mockApiResponse({
                      id,
                      title: `Scene ${id}`,
                      instanceId: "inst-1",
                    })
                  ),
                signal: signal as AbortSignal | undefined,
              });
            });
          }
        );

        act(() => {
          result.current.dispatch({ type: "NEXT_SCENE" });
        });
        act(() => {
          result.current.dispatch({ type: "NEXT_SCENE" });
        });
        await waitFor(() => {
          expect(pending.has("3")).toBe(true);
        });
        await actAsync(() => must(pending.get("3"), "scene 3's load").answer());
        await actAsync(() => must(pending.get("2"), "scene 2's load").answer());
        await settle();

        expect(result.current.scene?.id).toBe("3");
        expect(result.current.currentIndex).toBe(2);
        expect(pending.get("2")?.signal?.aborted).toBe(true);
      });

      it("moving from a loaded scene to an unknown id shows not found", async () => {
        const { result } = renderHook(() => useScenePlayer(), {
          wrapper: routerWrapper([{ pathname: "/scene/1" }]),
        });
        await waitFor(() => {
          expect(result.current.scene?.id).toBe("1");
        });
        answerScenes({ "404": "missing" });

        await go("/scene/404");

        await waitFor(() => {
          expect(result.current.sceneError).toBeInstanceOf(ApiError);
        });
        expect(result.current.scene).toBeNull();
        expect((result.current.sceneError as ApiError).status).toBe(404);
        expect(mockWarning).not.toHaveBeenCalled();
      });

      it("a queue entry that is no longer visible is skipped with a toast and the next entry loads", async () => {
        const { result } = await startQueue(queueOf("q1", ["1", "2", "3"]));
        answerScenes({ "2": "missing" });

        act(() => {
          result.current.dispatch({
            type: "NEXT_SCENE",
            payload: { autoplay: true },
          });
        });

        await waitFor(() => {
          expect(result.current.scene?.id).toBe("3");
        });
        expect(result.current.currentIndex).toBe(2);
        expect(result.current.unavailable).toEqual([1]);
        expect(result.current.sceneError).toBeNull();
        // The skip keeps the step's autoplay
        expect(result.current.shouldAutoplay).toBe(true);
        expect(mockWarning).toHaveBeenCalledExactlyOnceWith(
          'Skipped "Scene 2": it is no longer available'
        );
        await waitFor(() => {
          expect(probe.location?.pathname).toBe("/scene/3");
        });
        expect(entryQueue()?.currentIndex).toBe(2);
      });

      it("after Prev it skips backwards", async () => {
        const { result } = await startQueue(queueOf("q1", ["1", "2", "3"], 2));
        answerScenes({ "2": "missing" });

        act(() => {
          result.current.dispatch({ type: "PREV_SCENE" });
        });

        await waitFor(() => {
          expect(result.current.scene?.id).toBe("1");
        });
        expect(result.current.currentIndex).toBe(0);
        expect(mockWarning).toHaveBeenCalledExactlyOnceWith(
          'Skipped "Scene 2": it is no longer available'
        );
      });

      it("when every remaining entry is unavailable, playback stops on the not-found view with no request loop", async () => {
        // Repeat all would wrap back to the start: the loop guard stops it
        const queue: PlaybackQueue = {
          ...queueOf("q1", ["1", "2", "3"]),
          repeat: "all",
        };
        answerScenes({ "1": "missing", "2": "missing", "3": "missing" });

        const { result } = renderHook(() => useScenePlayer(), {
          wrapper: routerWrapper(queueEntries(queue)),
        });

        await waitFor(() => {
          expect(requestedIds()).toEqual(["1", "2", "3"]);
        });
        await settle();

        expect(mockPost.mock.calls.length).toBeLessThanOrEqual(
          queue.scenes.length
        );
        expect(result.current.scene).toBeNull();
        expect(result.current.sceneLoading).toBe(false);
        expect((result.current.sceneError as ApiError).status).toBe(404);
        expect(result.current.unavailable).toEqual([0, 1, 2]);
        // A notice for each skip; the last one stops on the not-found view
        expect(mockWarning).toHaveBeenCalledTimes(2);
      });

      it("a network error on a queue entry shows Retry and does not skip", async () => {
        const { result } = await startQueue(queueOf("q1", ["1", "2", "3"]));
        const failure = new Error("Network error");
        answerScenes({ "2": failure });

        act(() => {
          result.current.dispatch({ type: "NEXT_SCENE" });
        });

        await waitFor(() => {
          expect(result.current.sceneError).toBe(failure);
        });
        await settle();
        // The page's error view (with Retry), not the previous scene
        expect(result.current.scene).toBeNull();
        expect(result.current.currentIndex).toBe(1);
        expect(result.current.unavailable).toEqual([]);
        expect(mockWarning).not.toHaveBeenCalled();
        expect(requestedIds()).not.toContain("3");

        answerScenes({});
        await actAsync(() => result.current.retryScene());

        await waitFor(() => {
          expect(result.current.scene?.id).toBe("2");
        });
        expect(result.current.sceneError).toBeNull();
      });
    });
  });
});
