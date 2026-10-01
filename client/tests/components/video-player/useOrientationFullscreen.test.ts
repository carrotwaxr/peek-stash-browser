import { act, renderHook } from "@testing-library/react";
import {
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
function fakePlayer() {
  const handlers = new Map<string, () => void>();
  let fullscreen = false;
  const player = {
    on: (event: string, handler: () => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
    isDisposed: () => false,
    paused: () => false,
    isFullscreen: () => fullscreen,
    requestFullscreen: () => {
      fullscreen = true;
      return Promise.resolve();
    },
    exitFullscreen: () => {
      fullscreen = false;
    },
  };
  /** Leaves fullscreen as the browser would, firing the player's event */
  const leaveFullscreen = () => {
    fullscreen = false;
    handlers.get("fullscreenchange")?.();
  };
  return { player, leaveFullscreen };
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
});
