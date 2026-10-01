/**
 * VideoPlayer reads its play threshold from the shared user-settings query
 * (one request per session) and no longer fetches /user/settings itself, and
 * its timeline's clips from the scene's clips query (`useSceneClips`).
 */
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type {
  ClipWithRelations,
  GetClipsForSceneResponse,
} from "@peek/shared-types";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { actAsync } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, getClipsForScene } from "@/api";
import { useUserSettings } from "@/api/hooks/useUserSettings";
import { createQueryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";
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

/** A clip row as `GET /scenes/:id/clips` answers it */
function clipRow(
  fields: Pick<ClipWithRelations, "seconds" | "title" | "isGenerated">
): ClipWithRelations {
  const id = `${fields.title ?? "clip"}-${fields.seconds}`;
  return {
    id,
    instanceId: "inst-a",
    sceneId: "1",
    endSeconds: null,
    primaryTagId: null,
    screenshotUrl: null,
    stashCreatedAt: null,
    stashUpdatedAt: null,
    primaryTag: null,
    tags: [],
    scene: {
      id: "1",
      instanceId: "inst-a",
      title: null,
      pathScreenshot: null,
      studioId: null,
    },
    ...fields,
  };
}

/** The app's query client, so a cached answer is as fresh as in the app */
function renderPlayer(client: QueryClient = createQueryClient()) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<VideoPlayer />, { wrapper: Wrapper });
}

describe("VideoPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerState.scene = { id: "1", instanceId: "inst-a", files: [] };
  });

  it("the minimum play percent comes from the user-settings query", async () => {
    vi.mocked(useUserSettings).mockReturnValue({
      data: userSettingsResponse({ minimumPlayPercent: 40 }),
    } as unknown as ReturnType<typeof useUserSettings>);

    renderPlayer();

    expect(vi.mocked(useVideoPlayer)).toHaveBeenCalledWith(
      expect.objectContaining({ minimumPlayPercent: 40 })
    );
    expect(vi.mocked(apiGet)).not.toHaveBeenCalledWith("/user/settings");
    await waitFor(() => {
      expect(vi.mocked(getClipsForScene)).toHaveBeenCalled();
    });
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
    let resolveSlow: (value: GetClipsForSceneResponse) => void = () => {};
    const second = [
      clipRow({ seconds: 5, title: "Second", isGenerated: true }),
    ];
    vi.mocked(getClipsForScene).mockImplementation((sceneId) =>
      sceneId === "1"
        ? new Promise((resolve) => {
            resolveSlow = resolve;
          })
        : Promise.resolve({ clips: second })
    );

    const { rerender } = renderPlayer();
    playerState.scene = { id: "2", instanceId: "inst-a", files: [] };
    rerender(<VideoPlayer />);
    await waitFor(() => {
      expect(addClipMarkers).toHaveBeenCalledWith(second);
    });

    await actAsync(() => {
      resolveSlow({
        clips: [clipRow({ seconds: 9, title: "First", isGenerated: true })],
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
      clipRow({ seconds: 5, title: "Ready", isGenerated: true }),
      clipRow({ seconds: 9, title: "Pending", isGenerated: false }),
    ];
    vi.mocked(getClipsForScene).mockResolvedValue({ clips });

    renderPlayer();

    await waitFor(() => {
      expect(addClipMarkers).toHaveBeenCalledWith(clips);
    });
  });

  it("a clips list cached for the scene adds its markers without a request", async () => {
    vi.mocked(useUserSettings).mockReturnValue({
      data: userSettingsResponse({}),
    } as unknown as ReturnType<typeof useUserSettings>);
    const addClipMarkers = vi.fn();
    const plugin = { clearMarkers: vi.fn(), addClipMarkers };
    vi.mocked(useVideoPlayer).mockImplementation(({ playerRef }) => {
      playerRef.current = { markers: () => plugin };
    });
    const clips = [clipRow({ seconds: 5, title: "Cached", isGenerated: true })];
    const client = createQueryClient();
    // As the details panel left it for this scene
    client.setQueryData<GetClipsForSceneResponse>(
      queryKeys.clips.forScene("1", "inst-a"),
      { clips }
    );

    renderPlayer(client);

    await waitFor(() => {
      expect(addClipMarkers).toHaveBeenCalledWith(clips);
    });
    expect(vi.mocked(getClipsForScene)).not.toHaveBeenCalled();
  });
});
