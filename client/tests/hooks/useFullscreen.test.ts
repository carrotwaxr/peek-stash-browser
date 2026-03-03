import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useFullscreen } from "@/hooks/useFullscreen";

describe("useFullscreen", () => {
  let originalFullscreenEnabled: boolean | undefined;
  let originalFullscreenElement: Element | null;
  let requestFullscreenMock: ReturnType<typeof vi.fn>;
  let exitFullscreenMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Save originals
    originalFullscreenEnabled = document.fullscreenEnabled;
    originalFullscreenElement = document.fullscreenElement;

    // Setup mocks
    requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
    exitFullscreenMock = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(document, "fullscreenEnabled", {
      value: true,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: requestFullscreenMock,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(document, "exitFullscreen", {
      value: exitFullscreenMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();

    // Restore originals
    Object.defineProperty(document, "fullscreenEnabled", {
      value: originalFullscreenEnabled,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(document, "fullscreenElement", {
      value: originalFullscreenElement,
      writable: true,
      configurable: true,
    });
  });

  // ─── Default state ─────────────────────────────────────────────────────

  it("returns isFullscreen=false by default", () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.isFullscreen).toBe(false);
  });

  // ─── supportsFullscreen ────────────────────────────────────────────────

  it("returns supportsFullscreen=true when document.fullscreenEnabled is true", () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supportsFullscreen).toBe(true);
  });

  it("returns supportsFullscreen=false when fullscreen APIs are unavailable", () => {
    Object.defineProperty(document, "fullscreenEnabled", {
      value: false,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supportsFullscreen).toBe(false);
  });

  // ─── toggleFullscreen enters ───────────────────────────────────────────

  it("calls requestFullscreen when not in fullscreen", async () => {
    const { result } = renderHook(() => useFullscreen());

    await act(async () => {
      await result.current.toggleFullscreen();
    });

    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
  });

  // ─── toggleFullscreen exits ────────────────────────────────────────────

  it("calls exitFullscreen when in fullscreen", async () => {
    // Simulate currently being in fullscreen
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useFullscreen());

    await act(async () => {
      await result.current.toggleFullscreen();
    });

    expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
  });

  // ─── Fullscreen change event ───────────────────────────────────────────

  it("updates isFullscreen state on fullscreenchange event", () => {
    const { result } = renderHook(() => useFullscreen());

    expect(result.current.isFullscreen).toBe(false);

    // Simulate entering fullscreen
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      writable: true,
      configurable: true,
    });

    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.isFullscreen).toBe(true);

    // Simulate exiting fullscreen
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      writable: true,
      configurable: true,
    });

    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.isFullscreen).toBe(false);
  });

  // ─── Cleanup ───────────────────────────────────────────────────────────

  it("removes event listeners on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = renderHook(() => useFullscreen());

    unmount();

    const removedEvents = removeSpy.mock.calls.map((call) => call[0]);
    expect(removedEvents).toContain("fullscreenchange");
    expect(removedEvents).toContain("webkitfullscreenchange");
    expect(removedEvents).toContain("mozfullscreenchange");
    expect(removedEvents).toContain("MSFullscreenChange");
  });

  // ─── Disabled state ────────────────────────────────────────────────────

  it("does not add orientation listener when enabled=false", () => {
    const addSpy = vi.spyOn(window, "addEventListener");

    renderHook(() =>
      useFullscreen({ autoOnLandscape: true, enabled: false })
    );

    const addedEvents = addSpy.mock.calls.map((call) => call[0]);
    expect(addedEvents).not.toContain("orientationchange");
  });

  // ─── autoOnLandscape disabled ──────────────────────────────────────────

  it("does not add orientation listener when autoOnLandscape=false", () => {
    const addSpy = vi.spyOn(window, "addEventListener");

    renderHook(() =>
      useFullscreen({ autoOnLandscape: false, enabled: true })
    );

    const addedEvents = addSpy.mock.calls.map((call) => call[0]);
    expect(addedEvents).not.toContain("orientationchange");
  });

  // ─── Error handling ────────────────────────────────────────────────────

  it("warns on fullscreen failure and does not throw", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    requestFullscreenMock.mockRejectedValue(new Error("Fullscreen denied"));

    const { result } = renderHook(() => useFullscreen());

    await act(async () => {
      await result.current.toggleFullscreen();
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "Fullscreen enter failed:",
      expect.any(Error)
    );
  });

  // ─── Reset declined on disable ─────────────────────────────────────────

  it("resets userDeclined when enabled changes to false", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");

    // Start with autoOnLandscape=true, enabled=true
    const { rerender } = renderHook(
      ({ enabled }) => useFullscreen({ autoOnLandscape: true, enabled }),
      { initialProps: { enabled: true } }
    );

    // Simulate fullscreen exit (sets userDeclined=true via fullscreenchange)
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      writable: true,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    // Now disable the hook - this should reset userDeclined
    rerender({ enabled: false });

    // Re-enable - should re-add the orientation listener
    rerender({ enabled: true });

    // Verify orientationchange listener was added (which means declined was reset
    // because otherwise the effect early-returns before adding the listener)
    const addedEvents = addSpy.mock.calls.map((call) => call[0]);
    expect(addedEvents).toContain("orientationchange");
  });
});
