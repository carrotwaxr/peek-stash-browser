/**
 * Continue Watching pairs each scene with its own history: with two Stash
 * servers that share a scene id, the history is asked for and matched by the
 * (id, instance) pair, never by the bare id.
 */
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { libraryApi } from "@/api";
import ContinueWatchingCarousel from "@/components/ui/ContinueWatchingCarousel";
import { useAllWatchHistory } from "@/hooks/useWatchHistory";

vi.mock("@/api", () => ({
  libraryApi: { findScenes: vi.fn() },
}));

const libraryState = vi.hoisted(() => ({ ready: true, initializing: false }));
const configState = vi.hoisted(() => ({ hasMultipleInstances: true }));

vi.mock("@/api/hooks/useLibraryReady", () => ({
  useLibraryReady: () => ({ ready: libraryState.ready }),
  isLibraryInitializing: () => libraryState.initializing,
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: configState.hasMultipleInstances }),
}));

vi.mock("@/hooks/useWatchHistory", () => ({
  useAllWatchHistory: vi.fn(),
}));

vi.mock("@/components/ui/SceneCarousel", () => ({
  default: ({
    scenes,
    loading,
    onSceneClick,
  }: {
    loading: boolean;
    onSceneClick: (scene: { id: string; instanceId: string }) => void;
    scenes: Array<{
      id: string;
      instanceId: string;
      resumeTime: number;
      playCount: number;
    }>;
  }) => (
    <ul data-loading={String(loading)} data-testid="carousel">
      {scenes.map((s) => (
        <li
          key={`${s.id}:${s.instanceId}`}
          data-testid="scene"
          onClick={() => onSceneClick(s)}
        >
          {`${s.id}:${s.instanceId}:${s.resumeTime}:${s.playCount}`}
        </li>
      ))}
    </ul>
  ),
}));

const files = [{ duration: 1000 }];

describe("ContinueWatchingCarousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    libraryState.ready = true;
    libraryState.initializing = false;
    configState.hasMultipleInstances = true;
  });

  it("asks findScenes for id:instance refs and pairs each scene with its own history when two servers share a scene id", async () => {
    vi.mocked(useAllWatchHistory).mockReturnValue({
      data: [
        {
          sceneId: "7",
          instanceId: "b",
          resumeTime: 200,
          playCount: 2,
          playDuration: 500,
          lastPlayedAt: "2024-01-02T00:00:00.000Z",
        },
        {
          sceneId: "7",
          instanceId: "a",
          resumeTime: 100,
          playCount: 1,
          playDuration: 500,
          lastPlayedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    vi.mocked(libraryApi.findScenes).mockResolvedValue({
      findScenes: {
        scenes: [
          { id: "7", instanceId: "a", files },
          { id: "7", instanceId: "b", files },
        ],
      },
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ContinueWatchingCarousel />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("scene")).toHaveLength(2);
    });

    expect(libraryApi.findScenes).toHaveBeenCalledWith(
      { ids: ["7:b", "7:a"] },
      expect.anything()
    );
    // Most recently played first, each with its own server's numbers
    expect(screen.getAllByTestId("scene").map((li) => li.textContent)).toEqual([
      "7:b:200:2",
      "7:a:100:1",
    ]);
  });

  function history(overrides: Record<string, unknown> = {}) {
    return {
      sceneId: "1",
      instanceId: "a",
      resumeTime: 10,
      playCount: 1,
      playDuration: 500,
      lastPlayedAt: "2024-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  function mockHistory(
    data: Array<Record<string, unknown>>,
    extra: { loading?: boolean; error?: Error } = {}
  ) {
    vi.mocked(useAllWatchHistory).mockReturnValue({
      data,
      loading: extra.loading ?? false,
      error: extra.error instanceof Error ? extra.error.message : null,
      refresh: vi.fn(),
    });
  }

  function LocationProbe() {
    const location = useLocation();
    return (
      <div data-testid="location">{`${location.pathname}${location.search}`}</div>
    );
  }

  function renderCarousel() {
    return render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<ContinueWatchingCarousel />} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it("leaves out scenes watched under 2% of their length or with no recorded play time, and orders undated ones last", async () => {
    mockHistory([
      history({ sceneId: "1", playDuration: 500 }),
      history({ sceneId: "2", playDuration: 10 }),
      history({ sceneId: "3", playDuration: 0 }),
      history({ sceneId: "4", lastPlayedAt: null, playDuration: 500 }),
      history({ sceneId: "6", instanceId: "a" }),
    ]);
    vi.mocked(libraryApi.findScenes).mockResolvedValue({
      findScenes: {
        scenes: [
          { id: "1", instanceId: "a", files },
          { id: "2", instanceId: "a", files },
          { id: "3", instanceId: "a", files },
          { id: "4", instanceId: "a", files },
          { id: "5", instanceId: "a", files },
          { id: "6", instanceId: "a", files: [] },
        ],
      },
    });

    renderCarousel();

    await waitFor(() => {
      expect(screen.getAllByTestId("scene")).toHaveLength(2);
    });
    expect(screen.getAllByTestId("scene").map((li) => li.textContent)).toEqual([
      "1:a:10:1",
      "4:a:10:1",
    ]);
  });

  it("shows nothing when nothing was watched, and asks Stash for nothing", () => {
    mockHistory([]);

    renderCarousel();

    expect(screen.queryByTestId("carousel")).toBeNull();
    expect(libraryApi.findScenes).not.toHaveBeenCalled();
  });

  it("shows nothing when the watch history failed to load", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockHistory([], { error: new Error("boom") });

    renderCarousel();

    expect(screen.queryByTestId("carousel")).toBeNull();
  });

  it("shows nothing when the scenes fail to load for a reason other than the library starting", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockHistory([history()]);
    vi.mocked(libraryApi.findScenes).mockRejectedValue(new Error("boom"));

    renderCarousel();

    await waitFor(() => {
      expect(screen.queryByTestId("carousel")).toBeNull();
    });
  });

  it("shows the loading state and asks nothing while the library is not ready", () => {
    libraryState.ready = false;
    mockHistory([history()]);

    renderCarousel();

    expect(screen.getByTestId("carousel").dataset["loading"]).toBe("true");
    expect(libraryApi.findScenes).not.toHaveBeenCalled();
  });

  it("shows the loading state while the watch history loads", () => {
    mockHistory([], { loading: true });

    renderCarousel();

    expect(screen.getByTestId("carousel").dataset["loading"]).toBe("true");
  });

  it("treats a scenes answer without a findScenes body as no scenes", async () => {
    mockHistory([history()]);
    vi.mocked(libraryApi.findScenes).mockResolvedValue({});

    renderCarousel();

    await waitFor(() => {
      expect(screen.queryByTestId("carousel")).toBeNull();
    });
    expect(libraryApi.findScenes).toHaveBeenCalled();
  });

  it("opens the clicked scene on its own server", async () => {
    mockHistory([
      history({ sceneId: "1", instanceId: "a" }),
      history({
        sceneId: "2",
        instanceId: "b",
        lastPlayedAt: "2023-01-01T00:00:00.000Z",
      }),
    ]);
    vi.mocked(libraryApi.findScenes).mockResolvedValue({
      findScenes: {
        scenes: [
          { id: "1", instanceId: "a", files },
          { id: "2", instanceId: "b", files },
        ],
      },
    });

    renderCarousel();
    await waitFor(() => {
      expect(screen.getAllByTestId("scene")).toHaveLength(2);
    });
    fireEvent.click(must(screen.getAllByTestId("scene")[1]));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/scene/2?instance=b"
      );
    });
  });

  it("opens a scene without the instance in its link when there is a single server", async () => {
    configState.hasMultipleInstances = false;
    mockHistory([history()]);
    vi.mocked(libraryApi.findScenes).mockResolvedValue({
      findScenes: { scenes: [{ id: "1", instanceId: "a", files }] },
    });

    renderCarousel();
    await waitFor(() => {
      expect(screen.getAllByTestId("scene")).toHaveLength(1);
    });
    fireEvent.click(must(screen.getAllByTestId("scene")[0]));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/scene/1");
    });
  });
});
