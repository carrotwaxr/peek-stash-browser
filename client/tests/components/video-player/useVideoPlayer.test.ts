/**
 * useVideoPlayer's writes and sources name the scene's instance.
 *
 * Two Stash servers reuse small ids, so A:123 and B:123 are different
 * scenes: moving from one to the other is a scene change, and every write
 * and stream URL carries the instance of the scene playing.
 */
import { useState } from "react";
import type { NormalizedScene } from "@peek/shared-types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SignedIn } from "@tests/helpers/SignedIn";
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import videojs from "video.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, apiGet, apiPost, redirectToLogin } from "@/api";
import { buildPlayerSources } from "@/components/video-player/playerSources";
import { isSessionExpired } from "@/components/video-player/sessionCheck";
import { useVideoPlayer } from "@/components/video-player/useVideoPlayer";
import { useWatchHistory } from "@/hooks/useWatchHistory";
import { canDecode } from "@/utils/browserPlayback";
import { type PlaybackQueue, buildPlaybackQueue } from "@/utils/playbackQueue";

vi.mock("@/api", () => ({
  apiFetch: vi.fn(() => Promise.resolve({ success: true })),
  apiGet: vi.fn(() => Promise.resolve(null)),
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

interface SendOptions {
  keepalive?: boolean;
}

interface TrackActivity {
  setEnabled: (enabled: boolean) => void;
  reset: () => void;
  minimumPlayPercent: number;
  saveActivity?: (
    resumeTime: number,
    playDuration: number,
    options?: SendOptions
  ) => Promise<void>;
  incrementPlayCount?: (options?: SendOptions) => Promise<void>;
}

/** A Video.js player with only what the hook calls. */
function fakePlayer() {
  const handlers = new Map<string, () => void | Promise<void>>();
  const trackActivity: TrackActivity = {
    // The real plugin sends the interval it was playing when it is disabled
    setEnabled: vi.fn((enabled: boolean) => {
      if (!enabled) {
        void trackActivity.saveActivity?.(player.currentTime(), 9);
      }
    }),
    reset: vi.fn(),
    minimumPlayPercent: 0,
  };
  const setSources = vi.fn();
  const vttSrc = vi.fn();
  const vttDetach = vi.fn();
  const el = document.createElement("div");
  const player = {
    handlers,
    vttSrc,
    vttDetach,
    vttThumbnails: () => ({ src: vttSrc, detach: vttDetach }),
    el: () => el,
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
    currentTime: vi.fn((_seekTo?: number) => 0),
    src: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    paused: vi.fn(() => true),
    muted: vi.fn((_muted?: boolean) => false),
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
  paths?: { vtt?: string; sprite?: string };
}

/** The player's queue and controls, as the context hands them over */
interface Controls {
  playlist?: PlaybackQueue | null;
  autoplayNext?: boolean;
  repeat?: "none" | "all" | "one";
  /** The player is ready and the scene should start by itself */
  autoplay?: boolean;
}

function renderPlayer(
  player: FakePlayer,
  scene: Scene | null,
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
  type Props = {
    /** The loaded scene; null while the page's first scene loads */
    current: Scene | null;
    restartCount?: number;
    /** The route: a new one starts a scene change before its scene lands */
    pathname?: string;
  };
  const rendered = renderHook<ReturnType<typeof useVideoPlayer>, Props>(
    ({ current, restartCount = 0, pathname = "/scene/123" }) =>
      useVideoPlayer({
        // No container: the lifecycle effect creates no player, the test's
        // stands in for it
        videoRef,
        playerRef,
        scene: current,
        ready: controls.autoplay ?? false,
        shouldAutoplay: controls.autoplay ?? false,
        playlist: controls.playlist ?? null,
        currentIndex: 0,
        autoplayNext: controls.autoplayNext ?? true,
        repeat: controls.repeat ?? "none",
        restartCount,
        dispatch,
        nextScene: noop,
        prevScene: noop,
        registerPlayer: noop,
        location: { state: null, pathname, search: "" },
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
    userId: 1,
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

/** The JSON a request was sent with */
function requestBody(options: RequestInit | undefined): unknown {
  const body = options?.body;
  return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

const onA = { id: "123", instanceId: "inst-a" };
const onB = { id: "123", instanceId: "inst-b" };
const onA2 = { id: "124", instanceId: "inst-a" };

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

    // The move off A:123 flushed A's own interval; these are B's
    const calls = vi
      .mocked(apiPost)
      .mock.calls.filter(
        ([, body]) => (body as { instanceId: string }).instanceId === "inst-b"
      );
    expect(calls).toEqual([
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
        {
          sceneId: "123",
          instanceId: "inst-b",
          playToken: expect.stringMatching(/^[0-9a-f]{32}$/) as unknown,
        },
      ],
    ]);
  });

  it("a keepalive save posts once with keepalive: true and no retry", async () => {
    const player = fakePlayer();
    renderPlayer(player, onA);
    const plugin = player.trackActivity();
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await must(plugin.saveActivity, "saveActivity")(5, 3, {
        keepalive: true,
      });

      expect(vi.mocked(apiFetch).mock.calls).toHaveLength(1);
      const [endpoint, options] = must(
        vi.mocked(apiFetch).mock.calls[0],
        "the request"
      );
      expect(endpoint).toBe("/watch-history/save-activity");
      expect(options?.method).toBe("POST");
      expect(options?.keepalive).toBe(true);
      expect(requestBody(options)).toEqual({
        sceneId: "123",
        instanceId: "inst-a",
        resumeTime: 5,
        playDuration: 3,
      });
      expect(apiPost).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it("a keepalive play count posts once with its token and keepalive: true", async () => {
    const player = fakePlayer();
    renderPlayer(player, onA);
    const plugin = player.trackActivity();

    await must(
      plugin.incrementPlayCount,
      "incrementPlayCount"
    )({
      keepalive: true,
    });

    expect(vi.mocked(apiFetch).mock.calls).toHaveLength(1);
    const [endpoint, options] = must(
      vi.mocked(apiFetch).mock.calls[0],
      "the request"
    );
    expect(endpoint).toBe("/watch-history/increment-play-count");
    expect(options?.keepalive).toBe(true);
    expect(requestBody(options)).toEqual({
      sceneId: "123",
      instanceId: "inst-a",
      playToken: expect.stringMatching(/^[0-9a-f]{32}$/) as unknown,
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("the play-count request carries the same playToken on every retry and a new one per scene", async () => {
    const player = fakePlayer();
    const { rerender } = renderPlayer(player, onA);
    const plugin = player.trackActivity();
    vi.mocked(apiPost)
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"));
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.useFakeTimers();
    try {
      const pending = must(plugin.incrementPlayCount, "incrementPlayCount")();
      await vi.advanceTimersByTimeAsync(3500);
      await pending;
    } finally {
      vi.useRealTimers();
      warned.mockRestore();
    }
    rerender({ current: onB });
    await must(plugin.incrementPlayCount, "incrementPlayCount")();

    const bodies = vi
      .mocked(apiPost)
      .mock.calls.filter(([endpoint]) => endpoint.endsWith("play-count"))
      .map(([, body]) => body as { instanceId: string; playToken: string });
    expect(bodies.map((body) => body.instanceId)).toEqual([
      "inst-a",
      "inst-a",
      "inst-a",
      "inst-b",
    ]);
    expect(new Set(bodies.slice(0, 3).map((body) => body.playToken)).size).toBe(
      1
    );
    expect(bodies[3]?.playToken).toMatch(/^[0-9a-f]{32}$/);
    expect(bodies[3]?.playToken).not.toBe(bodies[0]?.playToken);
  });

  it("on a scene change the flush saves the previous scene's id and time, before the new source is set", () => {
    const player = fakePlayer();
    player.currentTime.mockReturnValue(42);
    const { rerender } = renderPlayer(player, onA);
    vi.mocked(apiPost).mockClear();
    player.load.mockClear();

    rerender({ current: onB });

    const saves = vi
      .mocked(apiPost)
      .mock.calls.filter(([endpoint]) => endpoint.endsWith("save-activity"));
    expect(saves).toEqual([
      [
        "/watch-history/save-activity",
        {
          sceneId: "123",
          instanceId: "inst-a",
          resumeTime: 42,
          playDuration: 9,
        },
      ],
    ]);
    const saved = must(vi.mocked(apiPost).mock.invocationCallOrder[0]);
    const loaded = must(player.load.mock.invocationCallOrder[0]);
    expect(saved).toBeLessThan(loaded);
  });

  it("moving from A:123 to B:123 loads the new source", () => {
    const player = fakePlayer();
    const { rerender } = renderPlayer(player, onA);
    rerender({ current: onB });

    expect(vi.mocked(buildPlayerSources).mock.calls).toEqual([
      [onA, canDecode],
      [onB, canDecode],
    ]);
    expect(player.load).toHaveBeenCalledTimes(2);
  });

  describe("seek thumbnails", () => {
    const withSprite = {
      ...onA,
      paths: { vtt: "/vtt/123", sprite: "/sprite/123" },
    };
    const withoutSprite = { ...onA2, paths: {} };

    it("a scene without a sprite clears the last scene's thumbnails", () => {
      const player = fakePlayer();
      const { rerender } = renderPlayer(player, withSprite);
      expect(player.vttDetach).not.toHaveBeenCalled();

      rerender({ current: withoutSprite });

      expect(player.vttDetach).toHaveBeenCalledTimes(1);
      expect(player.vttSrc).toHaveBeenCalledTimes(1);
    });

    it("a scene with a sprite still calls src(vtt, sprite)", () => {
      const player = fakePlayer();
      renderPlayer(player, withSprite);

      expect(player.vttSrc).toHaveBeenCalledWith("/vtt/123", "/sprite/123");
      expect(player.vttDetach).not.toHaveBeenCalled();
    });
  });

  describe("focus on a new scene", () => {
    it("the player takes focus while focus is on nothing", () => {
      const player = fakePlayer();
      document.body.appendChild(player.el());
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();

      renderPlayer(player, onA);

      expect(player.focus).toHaveBeenCalledTimes(1);
      player.el().remove();
    });

    it("a scene that loads after the user focused a control outside the player leaves focus there", () => {
      const player = fakePlayer();
      document.body.appendChild(player.el());
      const outside = document.createElement("button");
      document.body.appendChild(outside);
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();

      // The page opens on nothing; the user focuses a control while the
      // scene loads
      const { rerender } = renderPlayer(player, null);
      outside.focus();
      rerender({ current: onA });

      expect(player.focus).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(outside);
      outside.remove();
      player.el().remove();
    });

    it("a scene change started from a similar-scene card moves focus into the new player", () => {
      const player = fakePlayer();
      document.body.appendChild(player.el());
      const card = document.createElement("button");
      document.body.appendChild(card);
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      const { rerender } = renderPlayer(player, onA);
      expect(player.focus).toHaveBeenCalledTimes(1);

      // The card is focused when the change starts and keeps focus until
      // the new scene lands
      card.focus();
      rerender({ current: onA, pathname: "/scene/124" });
      rerender({ current: onA2, pathname: "/scene/124" });

      expect(player.focus).toHaveBeenCalledTimes(2);
      card.remove();
      player.el().remove();
    });

    it("a scene change whose scene lands after the user left the card for another control leaves focus there", () => {
      const player = fakePlayer();
      document.body.appendChild(player.el());
      const card = document.createElement("button");
      const outside = document.createElement("button");
      document.body.append(card, outside);
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      const { rerender } = renderPlayer(player, onA);

      card.focus();
      rerender({ current: onA, pathname: "/scene/124" });
      outside.focus();
      rerender({ current: onA2, pathname: "/scene/124" });

      expect(player.focus).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(outside);
      card.remove();
      outside.remove();
      player.el().remove();
    });
  });

  it("a queue step to an entry of the same scene seeks it to the start without loading it again", () => {
    const player = fakePlayer();
    const { rerender } = renderPlayer(player, onA);
    expect(player.currentTime).not.toHaveBeenCalledWith(0);

    rerender({ current: onA, restartCount: 1 });

    expect(player.currentTime).toHaveBeenCalledWith(0);
    expect(player.load).toHaveBeenCalledTimes(1);
  });

  it("no handler other than the source selector calls player.src on an error", async () => {
    const player = fakePlayer();
    const { rerender } = renderPlayer(player, onA);
    rerender({ current: onB });
    player.src.mockClear();

    const onError = player.on.mock.calls
      .filter(([event]) => event === "error")
      .map(([, handler]) => handler);
    for (const handler of onError) await handler();

    expect(player.src).not.toHaveBeenCalled();
    expect(player.load).toHaveBeenCalledTimes(2);
  });

  it("the source selector checks the session before a fallback and sends a lost one to login", async () => {
    const player = { ...fakePlayer(), dispose: vi.fn() };
    vi.mocked(videojs).mockReturnValueOnce(player as never);
    const { unmount } = renderPlayer(
      player,
      onA,
      document.createElement("div")
    );
    const options = must(
      vi.mocked(videojs).mock.calls[0]?.[1],
      "videojs options"
    ) as {
      plugins: { sourceSelector: { beforeFallback: () => Promise<boolean> } };
    };
    const { beforeFallback } = options.plugins.sourceSelector;

    vi.mocked(isSessionExpired).mockResolvedValueOnce(false);
    await expect(beforeFallback()).resolves.toBe(false);
    expect(redirectToLogin).not.toHaveBeenCalled();

    vi.mocked(isSessionExpired).mockResolvedValueOnce(true);
    await expect(beforeFallback()).resolves.toBe(true);
    expect(redirectToLogin).toHaveBeenCalledWith("expired");
    unmount();
  });

  it("a blocked autoplay retries muted", async () => {
    const player = fakePlayer();
    player.play.mockRejectedValueOnce(
      new DOMException("play() needs a user gesture", "NotAllowedError")
    );

    renderPlayer(player, onA, null, { autoplay: true });

    await waitFor(() => {
      expect(player.play).toHaveBeenCalledTimes(2);
    });
    expect(player.muted).toHaveBeenCalledWith(true);
    const muted = must(player.muted.mock.invocationCallOrder[0]);
    const retried = must(player.play.mock.invocationCallOrder[1]);
    expect(muted).toBeLessThan(retried);
  });

  it("an autoplay that fails for another reason is not retried", async () => {
    const player = fakePlayer();
    player.play.mockRejectedValueOnce(
      new DOMException("the load was aborted", "AbortError")
    );

    renderPlayer(player, onA, null, { autoplay: true });

    await waitFor(() => {
      expect(player.play).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.muted).not.toHaveBeenCalled();
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

  describe("resume", () => {
    // Only Continue Watching and Watch History open a scene with
    // `shouldResume` in the link state; the queue they start keeps it in the
    // router state, so every later entry sees it too.
    type History = { resumeTime: number };

    /** The watch-history requests the player has made, answered by the test */
    function pendingHistory() {
      const answers = new Map<string, (history: History) => void>();
      vi.mocked(apiGet<History>).mockImplementation(
        (endpoint) =>
          new Promise<History>((resolve) => {
            const sceneId = must(endpoint.split("/").pop()).split("?")[0];
            answers.set(sceneId ?? "", resolve);
          })
      );
      return {
        answer: (sceneId: string, resumeTime: number) =>
          act(async () => {
            must(
              answers.get(sceneId),
              `a request for scene ${sceneId}`
            )({
              resumeTime,
            });
            await Promise.resolve();
          }),
      };
    }

    /**
     * The player with the real watch-history hook, on a link state: the
     * autoplay flag follows the dispatch the way the reducer's does
     */
    function renderResuming(
      first: Scene,
      state: { shouldResume: true } | null
    ) {
      const player = fakePlayer();
      const dispatch =
        vi.fn<(action: { type: string; payload?: boolean }) => void>();
      const noop = () => {};
      const playerRef = { current: player };
      const videoRef = { current: null };
      const hasResumedRef = { current: false };
      const initialResumeTimeRef = { current: null as number | null };
      const location = { state };
      const rendered = renderHook(
        ({ current }: { current: Scene }) => {
          const [shouldAutoplay, setShouldAutoplay] = useState(false);
          const history = useWatchHistory(current.id, current.instanceId);
          useVideoPlayer({
            videoRef,
            playerRef,
            scene: current,
            ready: true,
            shouldAutoplay,
            playlist: null,
            currentIndex: 0,
            autoplayNext: true,
            repeat: "none",
            restartCount: 0,
            dispatch: (action: { type: string; payload?: boolean }) => {
              dispatch(action);
              if (action.type === "SET_SHOULD_AUTOPLAY") {
                setShouldAutoplay(action.payload === true);
              }
            },
            nextScene: noop,
            prevScene: noop,
            registerPlayer: noop,
            location,
            hasResumedRef,
            initialResumeTimeRef,
            watchHistory: history.watchHistory,
            loadingWatchHistory: history.loading,
          });
        },
        { initialProps: { current: first }, wrapper: SignedIn }
      );
      return { player, initialResumeTimeRef, ...rendered };
    }

    const sceneA = { id: "1", instanceId: "inst-a" };
    const sceneB = { id: "2", instanceId: "inst-a" };
    const sceneC = { id: "3", instanceId: "inst-a" };

    it("a scene opened with shouldResume and resumeTime 300 seeks to 300 once", async () => {
      const history = pendingHistory();
      const { player } = renderResuming(sceneA, { shouldResume: true });

      await history.answer("1", 300);

      await waitFor(() => {
        expect(player.play).toHaveBeenCalledTimes(1);
      });
      expect(player.currentTime.mock.calls.filter(([t]) => t === 300)).toEqual([
        [300],
      ]);
    });

    it("a scene opened without shouldResume starts at 0 whatever its resumeTime", async () => {
      const history = pendingHistory();
      const { player, initialResumeTimeRef } = renderResuming(sceneA, null);

      await history.answer("1", 300);

      expect(initialResumeTimeRef.current).toBeNull();
      expect(player.currentTime).not.toHaveBeenCalledWith(300);
      expect(player.play).not.toHaveBeenCalled();
    });

    it("after a queue step from a resumed entry, the next scene resumes from its own resumeTime", async () => {
      const history = pendingHistory();
      const { player, rerender } = renderResuming(sceneA, {
        shouldResume: true,
      });
      await history.answer("1", 300);
      await waitFor(() => {
        expect(player.currentTime).toHaveBeenCalledWith(300);
      });

      // The step keeps shouldResume in the router state
      rerender({ current: sceneB });
      await history.answer("2", 45);

      await waitFor(() => {
        expect(player.currentTime).toHaveBeenCalledWith(45);
      });
      expect(player.currentTime.mock.calls.filter(([t]) => t === 300)).toEqual([
        [300],
      ]);
    });

    it("after a queue step to a scene with no progress, it starts at 0", async () => {
      const history = pendingHistory();
      const { player, rerender } = renderResuming(sceneA, {
        shouldResume: true,
      });
      await history.answer("1", 300);
      await waitFor(() => {
        expect(player.currentTime).toHaveBeenCalledWith(300);
      });
      player.currentTime.mockClear();
      player.play.mockClear();

      rerender({ current: sceneB });
      await history.answer("2", 0);

      // A bare currentTime() is a read; a seek names the time
      expect(
        player.currentTime.mock.calls.filter((args) => args.length > 0)
      ).toEqual([]);
      expect(player.play).not.toHaveBeenCalled();
    });

    it("the resume of the previous scene never applies to the next", async () => {
      const history = pendingHistory();
      const { player, initialResumeTimeRef, rerender } = renderResuming(
        sceneB,
        { shouldResume: true }
      );
      // B is slow: the step to C is made before B's answer arrives
      rerender({ current: sceneC });

      // B's late answer belongs to a scene that is gone, and C has no
      // answer yet
      await history.answer("2", 300);
      expect(initialResumeTimeRef.current).toBeNull();
      expect(player.currentTime).not.toHaveBeenCalledWith(300);

      await history.answer("3", 120);
      await waitFor(() => {
        expect(player.currentTime).toHaveBeenCalledWith(120);
      });
      expect(initialResumeTimeRef.current).toBe(120);
      expect(player.currentTime).not.toHaveBeenCalledWith(300);
    });
  });
});
