/**
 * useVideoPlayer's writes and sources name the scene's instance.
 *
 * Two Stash servers reuse small ids, so A:123 and B:123 are different
 * scenes: moving from one to the other is a scene change, and every write
 * and stream URL carries the instance of the scene playing.
 */
import type { NormalizedScene } from "@peek/shared-types";
import { renderHook, waitFor } from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import videojs from "video.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "@/api";
import { buildPlayerSources } from "@/components/video-player/playerSources";
import { useVideoPlayer } from "@/components/video-player/useVideoPlayer";
import { type PlaybackQueue, buildPlaybackQueue } from "@/utils/playbackQueue";

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

/** The player's queue and controls, as the context hands them over */
interface Controls {
  playlist?: PlaybackQueue | null;
  autoplayNext?: boolean;
  repeat?: "none" | "all" | "one";
}

function renderPlayer(
  player: FakePlayer,
  scene: Scene,
  container: HTMLDivElement | null = null,
  controls: Controls = {}
) {
  const noop = () => {};
  // Stable across renders, as the reducer's dispatch and the refs are
  const dispatch = vi.fn<(action: unknown) => void>();
  const videoRef = { current: container };
  const playerRef = { current: player };
  const hasResumedRef = { current: false };
  const initialResumeTimeRef = { current: null };
  const location = { state: null };
  type Props = { current: Scene; restartCount?: number };
  const rendered = renderHook<ReturnType<typeof useVideoPlayer>, Props>(
    ({ current, restartCount = 0 }) =>
      useVideoPlayer({
        // No container: the lifecycle effect creates no player, the test's
        // stands in for it
        videoRef,
        playerRef,
        scene: current,
        quality: "direct",
        ready: false,
        shouldAutoplay: false,
        playlist: controls.playlist ?? null,
        currentIndex: 0,
        autoplayNext: controls.autoplayNext ?? true,
        repeat: controls.repeat ?? "none",
        restartCount,
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
  return Object.assign(rendered, { dispatch });
}

/** A queue as a grid, a carousel or a playlist row builds it: no autoplayNext */
function rowQueue(shuffle = false) {
  return buildPlaybackQueue({
    id: "virtual-grid",
    name: "Scene Grid",
    scenes: untrusted<NormalizedScene[]>([
      { id: "123", instanceId: "inst-a" },
      { id: "124", instanceId: "inst-a" },
      { id: "125", instanceId: "inst-a" },
    ]),
    currentIndex: 0,
    shuffle,
  });
}

/** Renders the player for scene A with `controls` and returns the end handler */
function endOfVideo(controls: Controls) {
  const player = fakePlayer();
  const { dispatch } = renderPlayer(player, onA, null, controls);
  // A dispatch from the render's own effects is not the end of the video
  dispatch.mockClear();
  return {
    player,
    dispatch,
    ended: must(player.handlers.get("ended"), "ended handler"),
  };
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

  it("a queue step to an entry of the same scene seeks it to the start without loading it again", () => {
    const player = fakePlayer();
    const { rerender } = renderPlayer(player, onA);
    expect(player.currentTime).not.toHaveBeenCalledWith(0);

    rerender({ current: onA, restartCount: 1 });

    expect(player.currentTime).toHaveBeenCalledWith(0);
    expect(player.load).toHaveBeenCalledTimes(1);
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

  it("at the end of a video started from a row link (queue without autoplayNext) the next entry loads with autoplay", () => {
    const { dispatch, ended } = endOfVideo({
      playlist: rowQueue(),
      autoplayNext: true,
    });

    void ended();

    expect(dispatch.mock.calls).toEqual([
      [{ type: "NEXT_SCENE", payload: { autoplay: true } }],
    ]);
  });

  it("with shuffle on and no history, the end of the video advances and throws nothing", () => {
    // A queue that names autoplay but carries no shuffle history
    const { dispatch, ended } = endOfVideo({
      playlist: untrusted<PlaybackQueue>({
        ...rowQueue(true),
        autoplayNext: true,
      }),
      autoplayNext: true,
    });

    expect(() => void ended()).not.toThrow();
    expect(dispatch.mock.calls).toEqual([
      [{ type: "NEXT_SCENE", payload: { autoplay: true } }],
    ]);
  });

  it("repeat one replays without dispatching", () => {
    // The queue started with repeat off; the player's control says one
    const { player, dispatch, ended } = endOfVideo({
      playlist: rowQueue(),
      autoplayNext: true,
      repeat: "one",
    });

    void ended();

    expect(player.currentTime).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("autoplay off stops at the end", () => {
    // The queue says on; the player's control, turned off, wins
    const { player, dispatch, ended } = endOfVideo({
      playlist: untrusted<PlaybackQueue>({ ...rowQueue(), autoplayNext: true }),
      autoplayNext: false,
    });

    void ended();

    expect(player.play).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
