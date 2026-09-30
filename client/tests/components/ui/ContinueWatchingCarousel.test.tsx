/**
 * Continue Watching pairs each scene with its own history: with two Stash
 * servers that share a scene id, the history is asked for and matched by the
 * (id, instance) pair, never by the bare id.
 */
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { libraryApi } from "@/api";
import ContinueWatchingCarousel from "@/components/ui/ContinueWatchingCarousel";
import { useAllWatchHistory } from "@/hooks/useWatchHistory";

vi.mock("@/api", () => ({
  libraryApi: { findScenes: vi.fn() },
}));

vi.mock("@/api/hooks/useLibraryReady", () => ({
  useLibraryReady: () => ({ ready: true }),
  isLibraryInitializing: () => false,
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: true }),
}));

vi.mock("@/hooks/useWatchHistory", () => ({
  useAllWatchHistory: vi.fn(),
}));

vi.mock("@/components/ui/SceneCarousel", () => ({
  default: ({
    scenes,
  }: {
    scenes: Array<{
      id: string;
      instanceId: string;
      resumeTime: number;
      playCount: number;
    }>;
  }) => (
    <ul>
      {scenes.map((s) => (
        <li key={`${s.id}:${s.instanceId}`} data-testid="scene">
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
});
