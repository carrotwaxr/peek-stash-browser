import { act, renderHook } from "@testing-library/react";
import {
  type Mock,
  type MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { useOrientationFullscreen } from "@/components/video-player/useOrientationFullscreen";
import { takeInternalPop } from "@/utils/historyGuard";

/** The part of a video.js player the hook uses */
function fakePlayer(video = { width: 1920, height: 1080 }) {
  const handlers = new Map<string, () => void>();
  let fullscreen = false;
  const player = {
    on: (event: string, handler: () => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
    isDisposed: () => false,
    paused: () => false,
    isFullscreen: () => fullscreen,
    videoWidth: () => video.width,
    videoHeight: () => video.height,
    requestFullscreen: () => {
      fullscreen = true;
      handlers.get("fullscreenchange")?.();
      return Promise.resolve();
    },
    exitFullscreen: () => {
      fullscreen = false;
    },
  };
  /** Enters fullscreen as the user's tap on the control would */
  const enterFullscreen = () => {
    fullscreen = true;
    handlers.get("fullscreenchange")?.();
  };
  /** Leaves fullscreen as the browser would, firing the player's event */
  const leaveFullscreen = () => {
    fullscreen = false;
    handlers.get("fullscreenchange")?.();
  };
  return { player, enterFullscreen, leaveFullscreen };
}

/** Rotates to landscape while playing: the hook enters fullscreen and guards */
async function rotateToLandscape() {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 500,
  });
  window.dispatchEvent(new Event("orientationchange"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
}

describe("useOrientationFullscreen", () => {
  let back: MockInstance<History["back"]>;
  let pushState: MockInstance<History["pushState"]>;

  beforeEach(() => {
    vi.useFakeTimers();
    back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    pushState = vi
      .spyOn(window.history, "pushState")
      .mockImplementation(() => {});
    takeInternalPop();
  });

  afterEach(() => {
    vi.useRealTimers();
    back.mockRestore();
    pushState.mockRestore();
    takeInternalPop();
  });

  it("a scene change while fullscreen keeps the guard (no history.back)", async () => {
    const { player } = fakePlayer();
    const playerRef = { current: player };
    const { rerender } = renderHook(
      ({ sceneId }: { sceneId: string }) =>
        useOrientationFullscreen(playerRef, sceneId, true),
      { initialProps: { sceneId: "1" } }
    );
    await rotateToLandscape();
    expect(pushState).toHaveBeenCalledTimes(1);

    rerender({ sceneId: "2" });

    expect(back).not.toHaveBeenCalled();
  });

  it("removing the guard marks the pop internal", async () => {
    const { player, leaveFullscreen } = fakePlayer();
    const playerRef = { current: player };
    renderHook(() => useOrientationFullscreen(playerRef, "1", true));
    await rotateToLandscape();

    act(() => leaveFullscreen());

    expect(back).toHaveBeenCalledTimes(1);
    expect(takeInternalPop()).toBe(true);
    // Once only
    expect(takeInternalPop()).toBe(false);
  });

  describe("landscape lock on manual fullscreen", () => {
    let lock: Mock<(orientation: string) => Promise<void>>;
    let unlock: Mock<() => void>;
    let originalMatchMedia: typeof window.matchMedia;
    let originalOrientation: PropertyDescriptor | undefined;

    const setCoarsePointer = (coarse: boolean) => {
      window.matchMedia = vi.fn((query: string) => ({
        matches: coarse && query === "(pointer: coarse)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
    };

    beforeEach(() => {
      lock = vi.fn(() => Promise.resolve());
      unlock = vi.fn();
      originalMatchMedia = window.matchMedia;
      originalOrientation = Object.getOwnPropertyDescriptor(
        window.screen,
        "orientation"
      );
      Object.defineProperty(window.screen, "orientation", {
        configurable: true,
        value: { type: "portrait-primary", lock, unlock },
      });
      setCoarsePointer(true);
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
      if (originalOrientation) {
        Object.defineProperty(
          window.screen,
          "orientation",
          originalOrientation
        );
      } else {
        Reflect.deleteProperty(window.screen, "orientation");
      }
    });

    it("locks to landscape when a landscape video goes fullscreen by hand on a touch device", () => {
      const { player, enterFullscreen } = fakePlayer();
      renderHook(() =>
        useOrientationFullscreen({ current: player }, "1", true)
      );

      act(() => enterFullscreen());

      expect(lock).toHaveBeenCalledTimes(1);
      expect(lock).toHaveBeenCalledWith("landscape");
    });

    it("does not lock a portrait video", () => {
      const { player, enterFullscreen } = fakePlayer({
        width: 1080,
        height: 1920,
      });
      renderHook(() =>
        useOrientationFullscreen({ current: player }, "1", true)
      );

      act(() => enterFullscreen());

      expect(lock).not.toHaveBeenCalled();
    });

    it("does not lock a video whose size is not known yet", () => {
      const { player, enterFullscreen } = fakePlayer({ width: 0, height: 0 });
      renderHook(() =>
        useOrientationFullscreen({ current: player }, "1", true)
      );

      act(() => enterFullscreen());

      expect(lock).not.toHaveBeenCalled();
    });

    it("does not lock fullscreen the rotation started", async () => {
      const { player } = fakePlayer();
      renderHook(() =>
        useOrientationFullscreen({ current: player }, "1", true)
      );

      await rotateToLandscape();

      expect(player.isFullscreen()).toBe(true);
      expect(lock).not.toHaveBeenCalled();
    });

    it("does not lock on a fine pointer", () => {
      setCoarsePointer(false);
      const { player, enterFullscreen } = fakePlayer();
      renderHook(() =>
        useOrientationFullscreen({ current: player }, "1", true)
      );

      act(() => enterFullscreen());

      expect(lock).not.toHaveBeenCalled();
    });

    it("swallows a refused lock and has nothing to unlock", async () => {
      lock.mockRejectedValue(new DOMException("no", "NotSupportedError"));
      const { player, enterFullscreen, leaveFullscreen } = fakePlayer();
      renderHook(() =>
        useOrientationFullscreen({ current: player }, "1", true)
      );

      act(() => enterFullscreen());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => leaveFullscreen());

      expect(lock).toHaveBeenCalledTimes(1);
      expect(unlock).not.toHaveBeenCalled();
    });

    it("works where the browser has no orientation lock", () => {
      Object.defineProperty(window.screen, "orientation", {
        configurable: true,
        value: { type: "portrait-primary" },
      });
      const { player, enterFullscreen, leaveFullscreen } = fakePlayer();
      renderHook(() =>
        useOrientationFullscreen({ current: player }, "1", true)
      );

      expect(() => {
        act(() => enterFullscreen());
        act(() => leaveFullscreen());
      }).not.toThrow();
    });

    it("unlocks when fullscreen exits, once", () => {
      const { player, enterFullscreen, leaveFullscreen } = fakePlayer();
      const { unmount } = renderHook(() =>
        useOrientationFullscreen({ current: player }, "1", true)
      );
      act(() => enterFullscreen());

      act(() => leaveFullscreen());
      unmount();

      expect(unlock).toHaveBeenCalledTimes(1);
    });

    it("does not unlock on exit or unmount when nothing was locked", () => {
      const { player, enterFullscreen, leaveFullscreen } = fakePlayer({
        width: 1080,
        height: 1920,
      });
      const { unmount } = renderHook(() =>
        useOrientationFullscreen({ current: player }, "1", true)
      );
      act(() => enterFullscreen());
      act(() => leaveFullscreen());
      unmount();

      expect(unlock).not.toHaveBeenCalled();
    });

    it("unlocks on unmount while still fullscreen", () => {
      const { player, enterFullscreen } = fakePlayer();
      const { unmount } = renderHook(() =>
        useOrientationFullscreen({ current: player }, "1", true)
      );
      act(() => enterFullscreen());

      unmount();

      expect(unlock).toHaveBeenCalledTimes(1);
    });

    it("swallows an unlock that throws", () => {
      unlock.mockImplementation(() => {
        throw new DOMException("no", "InvalidStateError");
      });
      const { player, enterFullscreen, leaveFullscreen } = fakePlayer();
      renderHook(() =>
        useOrientationFullscreen({ current: player }, "1", true)
      );
      act(() => enterFullscreen());

      expect(() => act(() => leaveFullscreen())).not.toThrow();
    });
  });
});
