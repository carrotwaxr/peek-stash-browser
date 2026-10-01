/**
 * VideoPlayer reads its play threshold from the shared user-settings query
 * (one request per session) and no longer fetches /user/settings itself.
 */
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { userSettingsResponse } from "@tests/helpers/userSettings";
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
vi.mock("@/contexts/ScenePlayerContext", () => ({
  useScenePlayer: () => ({
    scene: { id: "1", instanceId: "inst-a", files: [] },
    quality: "direct",
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
    updateQuality: vi.fn(),
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
});
