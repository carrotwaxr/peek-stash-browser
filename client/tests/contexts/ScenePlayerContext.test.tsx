import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (must be defined before imports that use them)
// ---------------------------------------------------------------------------

vi.mock("axios", () => {
  const mockPost = vi.fn();
  return {
    default: { create: vi.fn(() => ({ post: mockPost })) },
    __mockPost: mockPost,
  };
});

vi.mock("@/contexts/ConfigContext.jsx", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));

vi.mock("@/utils/entityLinks.js", () => ({
  getEntityPath: vi.fn(() => "/scene/123"),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import { __mockPost } from "axios";
import { useConfig } from "@/contexts/ConfigContext.jsx";
import { getEntityPath } from "@/utils/entityLinks.js";
import {
  ScenePlayerProvider,
  useScenePlayer,
} from "@/contexts/ScenePlayerContext.jsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockScene = {
  id: "scene-42",
  title: "Test Scene",
  o_counter: 5,
  instanceId: "inst-1",
};

const mockApiResponse = (scene = mockScene) => ({
  data: { findScenes: { scenes: [scene] } },
});

/**
 * Wrapper factory that provides ScenePlayerProvider with configurable props.
 */
function createWrapper(props = {}) {
  const defaults = {
    sceneId: "scene-42",
    instanceId: "inst-1",
    playlist: null,
    shouldResume: false,
    compatibility: null,
    initialQuality: "direct",
    initialShouldAutoplay: false,
  };
  const merged = { ...defaults, ...props };

  return function Wrapper({ children }) {
    return <ScenePlayerProvider {...merged}>{children}</ScenePlayerProvider>;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScenePlayerContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: API returns a scene
    __mockPost.mockResolvedValue(mockApiResponse());
    // Suppress console.error from intentional error tests
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Spy on window.history.replaceState
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
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
      expect(typeof result.current.incrementOCounter).toBe("function");
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
      expect(result.current.compatibility).toBeNull();
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

    it("initializes with compatibility and quality props", async () => {
      const compatibility = { hevc: false, av1: false };

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({
          compatibility,
          initialQuality: "720p",
        }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(result.current.compatibility).toEqual(compatibility);
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
      expect(__mockPost).toHaveBeenCalledWith("/library/scenes", {
        ids: ["scene-42"],
        scene_filter: { instance_id: "inst-1" },
      });
    });

    it("dispatches LOAD_SCENE_ERROR when scene is not found", async () => {
      __mockPost.mockResolvedValue({
        data: { findScenes: { scenes: [] } },
      });

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      expect(result.current.scene).toBeNull();
      expect(result.current.sceneError).toBeTruthy();
      expect(result.current.sceneError.message).toBe("Scene not found");
    });

    it("dispatches LOAD_SCENE_ERROR on API network failure", async () => {
      const networkError = new Error("Network error");
      __mockPost.mockRejectedValue(networkError);

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

      expect(__mockPost).toHaveBeenCalledWith("/library/scenes", {
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

      expect(__mockPost).toHaveBeenCalledWith("/library/scenes", {
        ids: ["scene-42"],
      });
    });

    it("sets oCounter to 0 when scene has no o_counter", async () => {
      const sceneNoCounter = { id: "s-1", title: "No Counter" };
      __mockPost.mockResolvedValue(mockApiResponse(sceneNoCounter));

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

      expect(__mockPost).toHaveBeenCalledWith(
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
      expect(__mockPost).toHaveBeenCalledWith("/library/scenes", {
        ids: ["playlist-scene-1"],
        scene_filter: { instance_id: "pl-inst-1" },
      });
    });
  });

  // =========================================================================
  // incrementOCounter
  // =========================================================================

  describe("incrementOCounter", () => {
    it("sends increment request and updates counter on success", async () => {
      __mockPost.mockImplementation((url) => {
        if (url === "/library/scenes") {
          return Promise.resolve(mockApiResponse());
        }
        if (url === "/watch-history/increment-o") {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      // Wait for scene to load
      await waitFor(() => {
        expect(result.current.scene).not.toBeNull();
      });

      const prevCounter = result.current.oCounter;

      await act(async () => {
        await result.current.incrementOCounter();
      });

      expect(__mockPost).toHaveBeenCalledWith("/watch-history/increment-o", {
        sceneId: "scene-42",
      });
      expect(result.current.oCounter).toBe(prevCounter + 1);
      expect(result.current.oCounterLoading).toBe(false);
    });

    it("handles increment error gracefully", async () => {
      __mockPost.mockImplementation((url) => {
        if (url === "/library/scenes") {
          return Promise.resolve(mockApiResponse());
        }
        if (url === "/watch-history/increment-o") {
          return Promise.reject(new Error("Server error"));
        }
        return Promise.resolve({});
      });

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper(),
      });

      // Wait for scene to load
      await waitFor(() => {
        expect(result.current.scene).not.toBeNull();
      });

      const prevCounter = result.current.oCounter;

      await act(async () => {
        await result.current.incrementOCounter();
      });

      // Counter should not change on error
      expect(result.current.oCounter).toBe(prevCounter);
      expect(result.current.oCounterLoading).toBe(false);
    });

    it("does not call API when scene is null", async () => {
      __mockPost.mockResolvedValue({
        data: { findScenes: { scenes: [] } },
      });

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ sceneId: null }),
      });

      // Wait for any effects to settle
      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      __mockPost.mockClear();

      await act(async () => {
        await result.current.incrementOCounter();
      });

      // Should not have called any API since scene is null
      expect(__mockPost).not.toHaveBeenCalledWith(
        "/watch-history/increment-o",
        expect.anything()
      );
    });
  });

  // =========================================================================
  // Navigation helpers
  // =========================================================================

  describe("navigation helpers", () => {
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
  });

  // =========================================================================
  // URL update effect
  // =========================================================================

  describe("URL update effect", () => {
    it("updates URL via replaceState when playlist scene changes", async () => {
      const playlist = {
        scenes: [
          { sceneId: "s-1", instanceId: "i-1" },
          { sceneId: "s-2", instanceId: "i-2" },
        ],
        currentIndex: 0,
      };

      getEntityPath.mockReturnValue("/scene/scene-42");

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ playlist }),
      });

      await waitFor(() => {
        expect(result.current.scene).not.toBeNull();
      });

      // The URL update effect fires when state.playlist and state.scene are set
      await waitFor(() => {
        expect(getEntityPath).toHaveBeenCalledWith(
          "scene",
          expect.objectContaining({ id: "scene-42" }),
          false
        );
      });

      expect(window.history.replaceState).toHaveBeenCalledWith(
        null,
        "",
        "/scene/scene-42"
      );
    });

    it("does not update URL when there is no playlist", async () => {
      window.history.replaceState.mockClear();

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ playlist: null }),
      });

      await waitFor(() => {
        expect(result.current.sceneLoading).toBe(false);
      });

      // replaceState should not have been called because playlist is null
      expect(window.history.replaceState).not.toHaveBeenCalled();
    });

    it("passes hasMultipleInstances to getEntityPath", async () => {
      useConfig.mockReturnValue({ hasMultipleInstances: true });

      const playlist = {
        scenes: [{ sceneId: "s-1", instanceId: "i-1" }],
        currentIndex: 0,
      };

      getEntityPath.mockReturnValue("/scene/scene-42?instance=inst-1");

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ playlist }),
      });

      await waitFor(() => {
        expect(result.current.scene).not.toBeNull();
      });

      await waitFor(() => {
        expect(getEntityPath).toHaveBeenCalledWith(
          "scene",
          expect.any(Object),
          true // hasMultipleInstances
        );
      });
    });

    it("does not call replaceState when URL already matches", async () => {
      const playlist = {
        scenes: [{ sceneId: "s-1", instanceId: "i-1" }],
        currentIndex: 0,
      };

      // Make getEntityPath return the current location
      const currentPath = window.location.pathname + window.location.search;
      getEntityPath.mockReturnValue(currentPath);

      const { result } = renderHook(() => useScenePlayer(), {
        wrapper: createWrapper({ playlist }),
      });

      await waitFor(() => {
        expect(result.current.scene).not.toBeNull();
      });

      // replaceState should not be called when URL already matches
      expect(window.history.replaceState).not.toHaveBeenCalled();
    });
  });
});
