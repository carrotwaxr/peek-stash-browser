/**
 * VideoPlayer reads its play threshold from the shared user-settings query
 * (one request per session) and no longer fetches /user/settings itself.
 */
import { MemoryRouter } from "react-router-dom";
import { render, waitFor } from "@testing-library/react";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { actAsync } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, getClipsForScene } from "@/api";
import { useUserSettings } from "@/api/hooks/useUserSettings";
import VideoPlayer from "@/components/video-player/VideoPlayer";
import { useVideoPlayer } from "@/components/video-player/useVideoPlayer";

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
  getClipsForScene: vi.fn(() => Promise.resolve({ clips: [] })),
}));
vi.mock("@/api/hooks/useUserSettings", () => ({
  useUserSettings: vi.fn(),
}));
const playerState = vi.hoisted(() => ({
  scene: { id: "1", instanceId: "inst-a", files: [] } as {
    id: string;
    instanceId: string;
    files: never[];
  },
}));
vi.mock("@/contexts/ScenePlayerContext", () => ({
  useScenePlayer: () => ({
    scene: playerState.scene,
    ready: true,
    shouldAutoplay: false,
    playlist: null,
    currentIndex: 0,
    autoplayNext: true,
    shuffle: false,
    repeat: "none",
    dispatch: vi.fn(),
    registerPlayer: vi.fn(),
  }),
}));
vi.mock("@/hooks/useQueueNavigation", () => ({
  useQueueNavigation: () => ({ next: vi.fn(), prev: vi.fn() }),
}));
vi.mock("@/hooks/useMediaKeys", () => ({ usePlaylistMediaKeys: vi.fn() }));
vi.mock("@/hooks/useWatchHistory", () => ({
  useWatchHistory: () => ({
    watchHistory: null,
    loading: false,
  }),
}));
vi.mock("@/components/video-player/useOrientationFullscreen", () => ({
  useOrientationFullscreen: vi.fn(),
}));
vi.mock("@/components/video-player/useVideoPlayer", () => ({
  useVideoPlayer: vi.fn(),
}));

describe("VideoPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerState.scene = { id: "1", instanceId: "inst-a", files: [] };
  });

  it("the minimum play percent comes from the user-settings query", () => {
    vi.mocked(useUserSettings).mockReturnValue({
      data: userSettingsResponse({ minimumPlayPercent: 40 }),
    } as unknown as ReturnType<typeof useUserSettings>);

    render(
      <MemoryRouter>
        <VideoPlayer />
      </MemoryRouter>
    );

    expect(vi.mocked(useVideoPlayer)).toHaveBeenCalledWith(
      expect.objectContaining({ minimumPlayPercent: 40 })
    );
    expect(vi.mocked(apiGet)).not.toHaveBeenCalledWith("/user/settings");
    expect(vi.mocked(getClipsForScene)).toHaveBeenCalled();
  });

  it("the clips of the previous scene never reach the timeline of the next", async () => {
    vi.mocked(useUserSettings).mockReturnValue({
      data: userSettingsResponse({}),
    } as unknown as ReturnType<typeof useUserSettings>);
    const addClipMarkers = vi.fn();
    const plugin = { clearMarkers: vi.fn(), addClipMarkers };
    vi.mocked(useVideoPlayer).mockImplementation(({ playerRef }) => {
      playerRef.current = { markers: () => plugin };
    });
    let resolveSlow: (value: unknown) => void = () => {};
    vi.mocked(getClipsForScene).mockImplementation((sceneId) =>
      sceneId === "1"
        ? new Promise((resolve) => {
            resolveSlow = resolve;
          })
        : Promise.resolve({
            clips: [{ seconds: 5, title: "Second", isGenerated: true }],
          })
    );

    const { rerender } = render(
      <MemoryRouter>
        <VideoPlayer />
      </MemoryRouter>
    );
    playerState.scene = { id: "2", instanceId: "inst-a", files: [] };
    rerender(
      <MemoryRouter>
        <VideoPlayer />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(addClipMarkers).toHaveBeenCalledWith([
        { seconds: 5, title: "Second", isGenerated: true },
      ]);
    });

    await actAsync(() => {
      resolveSlow({
        clips: [{ seconds: 9, title: "First", isGenerated: true }],
      });
    });

    expect(addClipMarkers).toHaveBeenCalledTimes(1);
  });

  it("the timeline gets ungenerated clips too", async () => {
    vi.mocked(useUserSettings).mockReturnValue({
      data: userSettingsResponse({}),
    } as unknown as ReturnType<typeof useUserSettings>);
    const addClipMarkers = vi.fn();
    const plugin = { clearMarkers: vi.fn(), addClipMarkers };
    vi.mocked(useVideoPlayer).mockImplementation(({ playerRef }) => {
      playerRef.current = { markers: () => plugin };
    });
    const clips = [
      { seconds: 5, title: "Ready", isGenerated: true },
      { seconds: 9, title: "Pending", isGenerated: false },
    ];
    vi.mocked(getClipsForScene).mockResolvedValue({ clips });

    render(
      <MemoryRouter>
        <VideoPlayer />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(addClipMarkers).toHaveBeenCalledWith(clips);
    });
  });
});
