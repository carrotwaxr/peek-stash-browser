import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isChunkLoadError,
  reloadOnceForNewVersion,
} from "../../src/utils/reloadOnce";

const KEY = "peek-reloaded-for-update";

describe("reloadOnceForNewVersion", () => {
  const reload = vi.fn();
  const realLocation = window.location;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    sessionStorage.clear();
    reload.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
  });

  it("reloads the first time and not again within 10 s", () => {
    expect(reloadOnceForNewVersion()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(KEY)).toBe(String(Date.now()));

    vi.advanceTimersByTime(9_000);
    expect(reloadOnceForNewVersion()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_000);
    expect(reloadOnceForNewVersion()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload when sessionStorage cannot be written", () => {
    const setItem = vi
      .spyOn(window.sessionStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(reloadOnceForNewVersion()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe("isChunkLoadError", () => {
  it("matches Chromium, Firefox and Safari messages and nothing else", () => {
    expect(
      isChunkLoadError(
        new TypeError(
          "Failed to fetch dynamically imported module: /assets/Performers-abc.js"
        )
      )
    ).toBe(true);
    expect(
      isChunkLoadError(
        new TypeError("error loading dynamically imported module: /a.js")
      )
    ).toBe(true);
    expect(
      isChunkLoadError(new TypeError("Importing a module script failed."))
    ).toBe(true);
    const named = new Error("Loading chunk 4 failed");
    named.name = "ChunkLoadError";
    expect(isChunkLoadError(named)).toBe(true);

    expect(isChunkLoadError(new TypeError("x is not a function"))).toBe(false);
    expect(isChunkLoadError(new Error("Failed to fetch"))).toBe(false);
    expect(isChunkLoadError("dynamically imported module")).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});
