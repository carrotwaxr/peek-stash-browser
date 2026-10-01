/**
 * The source selector is the player's one fallback path (MV-22).
 *
 * A codec error moves to the next listed source once; a network error
 * retries the same source at the same time after 1 s and 3 s before it moves
 * on; before either, the hook's session check may stop it (a lost session
 * goes to login instead). The rate menu follows the source that loads.
 */
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerSource } from "@/components/video-player/playerSources";
import {
  SourceFallback,
  type SourceFallbackPlayer,
} from "@/components/video-player/plugins/source-selector";

const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;

/** A player with only what the fallback calls; events fire by hand */
function fakePlayer() {
  const handlers = new Map<string, Array<() => void>>();
  const once = new Map<string, Array<() => void>>();
  const rateButton = { show: vi.fn(), hide: vi.fn() };
  let error: { code: number } | null = null;
  let src = "";
  let time = 0;
  const player = {
    on: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    }),
    one: vi.fn((event: string, handler: () => void) => {
      once.set(event, [...(once.get(event) ?? []), handler]);
    }),
    error: vi.fn((next?: { code: number } | null) => {
      if (next !== undefined) error = next;
      return error;
    }),
    currentSrc: vi.fn(() => src),
    currentTime: vi.fn((seconds?: number) => {
      if (seconds !== undefined) time = seconds;
      return time;
    }),
    src: vi.fn((source: PlayerSource) => {
      src = source.src;
      error = null;
      time = 0;
    }),
    load: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    paused: vi.fn(() => false),
    videoWidth: vi.fn(() => 640),
    videoHeight: vi.fn(() => 360),
    isDisposed: vi.fn(() => false),
    controlBar: {
      getChild: vi.fn((name: string) =>
        name === "PlaybackRateMenuButton" ? rateButton : undefined
      ),
    },
  } satisfies SourceFallbackPlayer & Record<string, unknown>;

  /** Fires `event` as video.js would: every listener, then the one-shots */
  async function fire(event: string) {
    for (const handler of handlers.get(event) ?? []) handler();
    const pending = once.get(event) ?? [];
    once.delete(event);
    for (const handler of pending) handler();
    // Let the async error handler run past its session check
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  /** The source fails with `code`, and the player reports it */
  async function fail(code: number) {
    error = { code };
    await fire("error");
  }

  return {
    player,
    rateButton,
    fire,
    fail,
    setTime: (seconds: number) => {
      time = seconds;
    },
  };
}

function fakeMenu() {
  return { setSelectedSource: vi.fn(), markSourceErrored: vi.fn() };
}

const direct: PlayerSource = {
  src: "/api/scene/5/proxy-stream/stream?instanceId=i",
  label: "Direct stream",
  offset: false,
};
const mkv: PlayerSource = {
  src: "/api/scene/5/proxy-stream/stream.mkv?instanceId=i",
  label: "MKV",
  offset: true,
};
const mp4: PlayerSource = {
  src: "/api/scene/5/proxy-stream/stream.mp4?resolution=LOW&instanceId=i",
  label: "MP4 Low (240p)",
  offset: true,
};
const hls: PlayerSource = {
  src: "/api/scene/5/proxy-stream/stream.m3u8?resolution=LOW&instanceId=i",
  label: "HLS Low (240p)",
  offset: false,
};

/** The sources the player was asked to load, after the first */
function loadedAfterStart(player: { src: { mock: { calls: unknown[][] } } }) {
  return player.src.mock.calls.slice(1).map(([source]) => source);
}

describe("SourceFallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("one codec error loads exactly one next source", async () => {
    const fake = fakePlayer();
    const menu = fakeMenu();
    const fallback = new SourceFallback(fake.player, menu);
    fallback.setSources([direct, mp4, hls]);

    // The same failure reported twice (a decode error, then the element's)
    fake.player.error({ code: MEDIA_ERR_DECODE });
    await Promise.all([fake.fire("error"), fake.fire("error")]);
    await vi.runAllTimersAsync();

    expect(loadedAfterStart(fake.player)).toEqual([mp4]);
    expect(menu.markSourceErrored).toHaveBeenCalledTimes(1);
    expect(menu.markSourceErrored).toHaveBeenCalledWith(direct);
    expect(menu.setSelectedSource).toHaveBeenLastCalledWith(mp4);
  });

  it("a network error retries the same source at the same time twice, then moves on", async () => {
    const fake = fakePlayer();
    const fallback = new SourceFallback(fake.player, fakeMenu());
    fallback.setSources([direct, mp4]);
    fake.setTime(95);

    await fake.fail(MEDIA_ERR_NETWORK);
    // Not at once: after 1 s
    expect(loadedAfterStart(fake.player)).toEqual([]);
    await vi.advanceTimersByTimeAsync(999);
    expect(loadedAfterStart(fake.player)).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(loadedAfterStart(fake.player)).toEqual([direct]);
    await fake.fire("canplay");
    expect(fake.player.currentTime()).toBe(95);

    // It drops again before playing: after 3 s more
    await fake.fail(MEDIA_ERR_NETWORK);
    await vi.advanceTimersByTimeAsync(2999);
    expect(loadedAfterStart(fake.player)).toEqual([direct]);
    await vi.advanceTimersByTimeAsync(1);
    expect(loadedAfterStart(fake.player)).toEqual([direct, direct]);
    // Failed again before it could seek: the time is still the one it had
    await fake.fail(MEDIA_ERR_NETWORK);

    expect(loadedAfterStart(fake.player)).toEqual([direct, direct, mp4]);
    await fake.fire("canplay");
    expect(fake.player.currentTime()).toBe(95);
  });

  it("a source that plays again after a retry gets its retries back", async () => {
    const fake = fakePlayer();
    const fallback = new SourceFallback(fake.player, fakeMenu());
    fallback.setSources([direct, mp4]);

    for (let drop = 0; drop < 3; drop++) {
      await fake.fail(MEDIA_ERR_NETWORK);
      await vi.advanceTimersByTimeAsync(1000);
      await fake.fire("canplay");
      await fake.fire("playing");
    }

    expect(loadedAfterStart(fake.player)).toEqual([direct, direct, direct]);
  });

  it("beforeFallback resolving true stops the fallback", async () => {
    const fake = fakePlayer();
    const menu = fakeMenu();
    const beforeFallback = vi.fn(() => Promise.resolve(true));
    const fallback = new SourceFallback(fake.player, menu, { beforeFallback });
    fallback.setSources([direct, mp4]);

    await fake.fail(MEDIA_ERR_DECODE);
    await fake.fail(MEDIA_ERR_NETWORK);
    await vi.runAllTimersAsync();

    expect(beforeFallback).toHaveBeenCalledTimes(2);
    expect(loadedAfterStart(fake.player)).toEqual([]);
    expect(menu.markSourceErrored).not.toHaveBeenCalled();
  });

  it("beforeFallback resolving false lets the fallback go on", async () => {
    const fake = fakePlayer();
    const beforeFallback = vi.fn(() => Promise.resolve(false));
    const fallback = new SourceFallback(fake.player, fakeMenu(), {
      beforeFallback,
    });
    fallback.setSources([direct, mp4]);

    await fake.fail(MEDIA_ERR_DECODE);

    expect(beforeFallback).toHaveBeenCalledTimes(1);
    expect(loadedAfterStart(fake.player)).toEqual([mp4]);
  });

  it("an error for a source already replaced changes nothing", async () => {
    const fake = fakePlayer();
    let answer: (expired: boolean) => void = () => {};
    const fallback = new SourceFallback(fake.player, fakeMenu(), {
      beforeFallback: () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    });
    fallback.setSources([direct, mp4]);

    await fake.fail(MEDIA_ERR_DECODE);
    // The next scene's sources arrive while the session check is out
    fallback.setSources([hls]);
    answer(false);
    await vi.runAllTimersAsync();

    expect(loadedAfterStart(fake.player)).toEqual([hls]);
  });

  it("after a source the user chose fails, no other source loads", async () => {
    const fake = fakePlayer();
    const menu = fakeMenu();
    const fallback = new SourceFallback(fake.player, menu);
    fallback.setSources([direct, mp4]);

    fallback.select(mp4);
    await fake.fail(MEDIA_ERR_DECODE);

    expect(loadedAfterStart(fake.player)).toEqual([mp4]);
    expect(menu.markSourceErrored).toHaveBeenCalledWith(mp4);
  });

  it("the last source failing loads nothing more", async () => {
    const fake = fakePlayer();
    const fallback = new SourceFallback(fake.player, fakeMenu());
    fallback.setSources([direct]);
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await fake.fail(MEDIA_ERR_DECODE);
    } finally {
      logged.mockRestore();
    }

    expect(loadedAfterStart(fake.player)).toEqual([]);
  });

  it("the rate menu shows on Direct and MKV and hides on transcodes", async () => {
    const fake = fakePlayer();
    const fallback = new SourceFallback(fake.player, fakeMenu());
    const shown = () => {
      const show = fake.rateButton.show.mock.invocationCallOrder.at(-1) ?? 0;
      const hide = fake.rateButton.hide.mock.invocationCallOrder.at(-1) ?? 0;
      return show > hide;
    };

    fallback.setSources([direct, mkv, mp4, hls]);
    await fake.fire("loadstart");
    expect(shown()).toBe(true);

    for (const [source, expected] of [
      [mkv, true],
      [mp4, false],
      [direct, true],
      [hls, false],
    ] as const) {
      fallback.select(source);
      await fake.fire("loadstart");
      expect(shown(), must(source.label)).toBe(expected);
    }
  });
});
