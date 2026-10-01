/**
 * useVideoPlayer's writes and sources name the scene's instance.
 *
 * Two Stash servers reuse small ids, so A:123 and B:123 are different
 * scenes: moving from one to the other is a scene change, and every write
 * and stream URL carries the instance of the scene playing.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import videojs from "video.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "@/api";
import { buildPlayerSources } from "@/components/video-player/playerSources";
import { useVideoPlayer } from "@/components/video-player/useVideoPlayer";

vi.mock("@/api", () => ({
  apiPost: vi.fn(() => Promise.resolve({ success: true })),
  redirectToLogin: vi.fn(),
}));
vi.mock("@/components/video-player/sessionCheck", () => ({
  SESSION_EXPIRED_PLAYBACK_MESSAGE: "expired",
  isSessionExpired: vi.fn(() => Promise.resolve(false)),
}));
vi.mock("@/components/video-player/playerSources", () => ({
  buildPlayerSources: vi.fn(() => []),
}));
vi.mock("@/components/video-player/videoPlayerUtils", () => ({
  setupSubtitles: vi.fn(),
  togglePlaybackRateControl: vi.fn(),
}));
vi.mock("videojs-seek-buttons", () => ({}));
vi.mock("@/components/video-player/vtt-thumbnails", () => ({}));
vi.mock("@/components/video-player/plugins/big-buttons", () => ({}));
vi.mock("@/components/video-player/plugins/markers", () => ({}));
vi.mock("@/components/video-player/plugins/pause-on-scrub", () => ({}));
vi.mock("@/components/video-player/plugins/persist-volume", () => ({}));
vi.mock("@/components/video-player/plugins/skip-buttons", () => ({}));
vi.mock("@/components/video-player/plugins/source-selector", () => ({}));
vi.mock("@/components/video-player/plugins/track-activity", () => ({}));
vi.mock("@/components/video-player/plugins/vrmode", () => ({}));
vi.mock("@/components/video-player/plugins/media-session", () => ({}));

interface TrackActivity {
  setEnabled: (enabled: boolean) => void;
  reset: () => void;
  minimumPlayPercent: number;
  saveActivity?: (resumeTime: number, playDuration: number) => Promise<void>;
  incrementPlayCount?: () => Promise<void>;
}

/** A Video.js player with only what the hook calls. */
function fakePlayer() {
  const handlers = new Map<string, () => void | Promise<void>>();
  const trackActivity: TrackActivity = {
    setEnabled: vi.fn(),
    reset: vi.fn(),
    minimumPlayPercent: 0,
  };
  const setSources = vi.fn();
  const player = {
    handlers,
    trackActivity: () => trackActivity,
    sourceSelector: () => ({ setSources }),
    setSources,
    skipButtons: () => ({
      setForwardHandler: vi.fn(),
      setBackwardHandler: vi.fn(),
    }),
    on: vi.fn((event: string, handler: () => void | Promise<void>) => {
      handlers.set(event, handler);
    }),
    off: vi.fn(),
    one: vi.fn(),
    poster: vi.fn(),
    load: vi.fn(),
    focus: vi.fn(),
    playbackRates: vi.fn(),
    ready: vi.fn(),
    aspectRatio: vi.fn(),
    isDisposed: () => false,
    error: vi.fn(() => ({ code: 4 })),
    currentSrc: vi.fn(() => "/api/scene/123/stream"),
    currentTime: vi.fn(() => 0),
    src: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    paused: vi.fn(() => true),
  };
  return player;
}

type FakePlayer = ReturnType<typeof fakePlayer>;

vi.mock("video.js", () => {
  const videojs = Object.assign(vi.fn(), {
    browser: { IS_SAFARI: false },
  });
  return { default: videojs };
});

interface Scene {
  id: string;
  instanceId: string;
}

function renderPlayer(
  player: FakePlayer,
  scene: Scene,
  container: HTMLDivElement | null = null
) {
  const noop = () => {};
  // Stable across renders, as the reducer's dispatch and the refs are
  const dispatch = vi.fn();
  const videoRef = { current: container };
  const playerRef = { current: player };
  const hasResumedRef = { current: false };
  const initialResumeTimeRef = { current: null };
  const location = { state: null };
  return renderHook(
    ({ current }: { current: Scene }) =>
      useVideoPlayer({
        // No container: the lifecycle effect creates no player, the test's
        // stands in for it
        videoRef,
        playerRef,
        scene: current,
        quality: "direct",
        isAutoFallback: false,
        ready: false,
        shouldAutoplay: false,
        playlist: null,
        currentIndex: 0,
        dispatch,
        nextScene: noop,
        prevScene: noop,
        updateQuality: noop,
        location,
        hasResumedRef,
        initialResumeTimeRef,
        watchHistory: null,
        loadingWatchHistory: false,
      }),
    { initialProps: { current: scene } }
  );
}

const onA = { id: "123", instanceId: "inst-a" };
const onB = { id: "123", instanceId: "inst-b" };

describe("useVideoPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("save-activity and increment-play-count carry the scene's instance", async () => {
    const player = fakePlayer();
    const { rerender } = renderPlayer(player, onA);
    rerender({ current: onB });
    const plugin = player.trackActivity();

    await must(plugin.saveActivity, "saveActivity")(5, 3);
    await must(plugin.incrementPlayCount, "incrementPlayCount")();

    expect(vi.mocked(apiPost).mock.calls).toEqual([
      [
        "/watch-history/save-activity",
        {
          sceneId: "123",
          instanceId: "inst-b",
          resumeTime: 5,
          playDuration: 3,
        },
      ],
      [
        "/watch-history/increment-play-count",
        { sceneId: "123", instanceId: "inst-b" },
      ],
    ]);
  });

  it("moving from A:123 to B:123 loads the new source", () => {
    const player = fakePlayer();
    const { rerender } = renderPlayer(player, onA);
    rerender({ current: onB });

    expect(vi.mocked(buildPlayerSources).mock.calls).toEqual([[onA], [onB]]);
    expect(player.load).toHaveBeenCalledTimes(2);
  });

  it("the stream URL always names the scene's instance", async () => {
    const player = fakePlayer();
    const { rerender } = renderPlayer(player, onA);
    rerender({ current: onB });

    await must(player.handlers.get("error"), "error handler")();

    await waitFor(() => {
      expect(player.src).toHaveBeenCalledWith({
        src: "/api/scene/123/proxy-stream/stream.m3u8?instanceId=inst-b&resolution=FULL_HD",
        type: "application/x-mpegURL",
      });
    });
  });

  it("the player is created with the html5 tech only and no cast plugin", () => {
    const player = { ...fakePlayer(), dispose: vi.fn() };
    vi.mocked(videojs).mockReturnValueOnce(player as never);
    const { unmount } = renderPlayer(
      player,
      onA,
      document.createElement("div")
    );

    expect(vi.mocked(videojs)).toHaveBeenCalledTimes(1);
    const options = must(
      vi.mocked(videojs).mock.calls[0]?.[1],
      "videojs options"
    ) as { techOrder: string[]; plugins: Record<string, unknown> };
    expect(options.techOrder).toEqual(["html5"]);
    expect(options.plugins).not.toHaveProperty("airPlay");
    expect(options.plugins).not.toHaveProperty("chromecast");
    unmount();
  });
});
