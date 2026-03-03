import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { usePlaylistMediaKeys } from "@/hooks/useMediaKeys";
import { useVideoPlayerShortcuts } from "@/hooks/useKeyboardShortcuts";
import { isInRatingMode } from "@/hooks/useRatingHotkeys";

vi.mock("@/hooks/useKeyboardShortcuts", () => ({
  useVideoPlayerShortcuts: vi.fn(),
}));

vi.mock("@/hooks/useRatingHotkeys", () => ({
  isInRatingMode: vi.fn(() => false),
}));

const mockUseVideoPlayerShortcuts = useVideoPlayerShortcuts as Mock;
const mockIsInRatingMode = isInRatingMode as Mock;

/**
 * Creates a mock Video.js player with sensible defaults.
 */
function createMockPlayer(overrides: Record<string, any> = {}) {
  return {
    paused: vi.fn(() => true),
    play: vi.fn(),
    pause: vi.fn(),
    currentTime: vi.fn((t?: number) => (t !== undefined ? t : 30)),
    duration: vi.fn(() => 100),
    volume: vi.fn((v?: number) => (v !== undefined ? v : 0.5)),
    muted: vi.fn((m?: boolean) => (m !== undefined ? m : false)),
    playbackRate: vi.fn((r?: number) => (r !== undefined ? r : 1)),
    isFullscreen: vi.fn(() => false),
    exitFullscreen: vi.fn(),
    requestFullscreen: vi.fn(),
    ...overrides,
  };
}

/**
 * Captures the shortcuts object passed to useVideoPlayerShortcuts.
 */
function captureShortcuts(
  playerOverrides: Record<string, any> = {},
  hookOptions: Record<string, any> = {}
) {
  const player = createMockPlayer(playerOverrides);
  const playerRef = { current: player };

  renderHook(() =>
    usePlaylistMediaKeys({
      playerRef: playerRef as any,
      playlist: hookOptions.playlist ?? null,
      playNext: hookOptions.playNext ?? null,
      playPrevious: hookOptions.playPrevious ?? null,
      enabled: hookOptions.enabled ?? true,
    })
  );

  // useVideoPlayerShortcuts is called with (playerRef, shortcuts, options)
  const lastCall =
    mockUseVideoPlayerShortcuts.mock.calls[
      mockUseVideoPlayerShortcuts.mock.calls.length - 1
    ];
  const shortcuts = lastCall[1] as Record<string, (event?: any) => any>;

  return { player, playerRef, shortcuts };
}

describe("usePlaylistMediaKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsInRatingMode.mockReturnValue(false);
  });

  // ─── Play/pause ─────────────────────────────────────────────────────────

  it("toggles play/pause with space key (plays when paused)", () => {
    const { player, shortcuts } = captureShortcuts({ paused: vi.fn(() => true) });

    shortcuts.space();

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.pause).not.toHaveBeenCalled();
  });

  it("toggles play/pause with space key (pauses when playing)", () => {
    const { player, shortcuts } = captureShortcuts({ paused: vi.fn(() => false) });

    shortcuts.space();

    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
  });

  it("toggles play/pause with k key", () => {
    const { player, shortcuts } = captureShortcuts({ paused: vi.fn(() => true) });

    shortcuts.k();

    expect(player.play).toHaveBeenCalledTimes(1);
  });

  // ─── Seeking ────────────────────────────────────────────────────────────

  it("seeks backward 10s with j key (clamped to 0)", () => {
    const { player, shortcuts } = captureShortcuts({
      currentTime: vi.fn((t?: number) => (t !== undefined ? t : 5)),
    });

    shortcuts.j();

    // 5 - 10 = -5, clamped to 0
    expect(player.currentTime).toHaveBeenCalledWith(0);
  });

  it("seeks forward 10s with l key", () => {
    const { player, shortcuts } = captureShortcuts({
      currentTime: vi.fn((t?: number) => (t !== undefined ? t : 30)),
    });

    shortcuts.l();

    expect(player.currentTime).toHaveBeenCalledWith(40);
  });

  it("seeks backward 5s with left arrow", () => {
    const { player, shortcuts } = captureShortcuts({
      currentTime: vi.fn((t?: number) => (t !== undefined ? t : 30)),
    });

    shortcuts.left();

    expect(player.currentTime).toHaveBeenCalledWith(25);
  });

  it("seeks forward 5s with right arrow", () => {
    const { player, shortcuts } = captureShortcuts({
      currentTime: vi.fn((t?: number) => (t !== undefined ? t : 30)),
    });

    shortcuts.right();

    expect(player.currentTime).toHaveBeenCalledWith(35);
  });

  // ─── Home / End ─────────────────────────────────────────────────────────

  it("seeks to start with Home key", () => {
    const { player, shortcuts } = captureShortcuts();

    shortcuts.home();

    expect(player.currentTime).toHaveBeenCalledWith(0);
  });

  it("seeks to end with End key", () => {
    const { player, shortcuts } = captureShortcuts({
      duration: vi.fn(() => 200),
    });

    shortcuts.end();

    expect(player.currentTime).toHaveBeenCalledWith(200);
  });

  // ─── Number keys percentage ─────────────────────────────────────────────

  it("jumps to percentage with number keys", () => {
    const { player, shortcuts } = captureShortcuts({
      duration: vi.fn(() => 100),
    });

    shortcuts["0"]();
    expect(player.currentTime).toHaveBeenCalledWith(0);

    player.currentTime.mockClear();
    shortcuts["5"]();
    expect(player.currentTime).toHaveBeenCalledWith(50);

    player.currentTime.mockClear();
    shortcuts["9"]();
    expect(player.currentTime).toHaveBeenCalledWith(90);
  });

  // ─── Rating mode blocks numbers 0-5 ────────────────────────────────────

  it("returns false for keys 0-5 when in rating mode", () => {
    mockIsInRatingMode.mockReturnValue(true);
    const { shortcuts } = captureShortcuts();

    for (const key of ["0", "1", "2", "3", "4", "5"]) {
      expect(shortcuts[key]()).toBe(false);
    }
  });

  // ─── Numbers 6-9 always work ───────────────────────────────────────────

  it("does not block keys 6-9 even in rating mode", () => {
    mockIsInRatingMode.mockReturnValue(true);
    const { player, shortcuts } = captureShortcuts({
      duration: vi.fn(() => 100),
    });

    for (const key of ["6", "7", "8", "9"]) {
      const result = shortcuts[key]();
      expect(result).not.toBe(false);
    }
    // Verify actual seeking happened
    expect(player.currentTime).toHaveBeenCalled();
  });

  // ─── Volume ─────────────────────────────────────────────────────────────

  it("increases volume with up arrow (+0.05, clamped to 1)", () => {
    const { player, shortcuts } = captureShortcuts({
      volume: vi.fn((v?: number) => (v !== undefined ? v : 0.95)),
    });

    shortcuts.up();

    expect(player.volume).toHaveBeenCalledWith(1);
  });

  it("decreases volume with down arrow (-0.05, clamped to 0)", () => {
    const { player, shortcuts } = captureShortcuts({
      volume: vi.fn((v?: number) => (v !== undefined ? v : 0.03)),
    });

    shortcuts.down();

    expect(player.volume).toHaveBeenCalledWith(0);
  });

  // ─── Mute toggle ───────────────────────────────────────────────────────

  it("toggles mute with m key", () => {
    const { player, shortcuts } = captureShortcuts({
      muted: vi.fn((m?: boolean) => (m !== undefined ? m : false)),
    });

    shortcuts.m();

    expect(player.muted).toHaveBeenCalledWith(true);
  });

  // ─── Speed control ─────────────────────────────────────────────────────

  it("increases playback speed with shift+> (max 2)", () => {
    const { player, shortcuts } = captureShortcuts({
      playbackRate: vi.fn((r?: number) => (r !== undefined ? r : 1.75)),
    });

    shortcuts["shift+>"]();

    expect(player.playbackRate).toHaveBeenCalledWith(2);
  });

  it("decreases playback speed with shift+< (min 0.25)", () => {
    const { player, shortcuts } = captureShortcuts({
      playbackRate: vi.fn((r?: number) => (r !== undefined ? r : 0.5)),
    });

    shortcuts["shift+<"]();

    expect(player.playbackRate).toHaveBeenCalledWith(0.25);
  });

  // ─── Fullscreen ─────────────────────────────────────────────────────────

  it("toggles fullscreen with f key", () => {
    const { player, shortcuts } = captureShortcuts({
      isFullscreen: vi.fn(() => false),
    });

    shortcuts.f();

    expect(player.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("exits fullscreen when already fullscreen", () => {
    const { player, shortcuts } = captureShortcuts({
      isFullscreen: vi.fn(() => true),
    });

    shortcuts.f();

    expect(player.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("returns false for f key when in rating mode", () => {
    mockIsInRatingMode.mockReturnValue(true);
    const { shortcuts } = captureShortcuts();

    expect(shortcuts.f()).toBe(false);
  });

  // ─── Playlist navigation (Shift+N/P) ───────────────────────────────────

  it("calls playNext on Shift+N when playlist exists", () => {
    const playNext = vi.fn();
    const playPrevious = vi.fn();

    renderHook(() =>
      usePlaylistMediaKeys({
        playerRef: { current: createMockPlayer() } as any,
        playlist: { scenes: [{}, {}] },
        playNext,
        playPrevious,
        enabled: true,
      })
    );

    // Shift+N is handled by a separate keydown listener (not via shortcuts object)
    const event = new KeyboardEvent("keydown", {
      key: "N",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    vi.spyOn(event, "preventDefault");
    document.dispatchEvent(event);

    expect(playNext).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("calls playPrevious on Shift+P when playlist exists", () => {
    const playNext = vi.fn();
    const playPrevious = vi.fn();

    renderHook(() =>
      usePlaylistMediaKeys({
        playerRef: { current: createMockPlayer() } as any,
        playlist: { scenes: [{}, {}] },
        playNext,
        playPrevious,
        enabled: true,
      })
    );

    const event = new KeyboardEvent("keydown", {
      key: "P",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    vi.spyOn(event, "preventDefault");
    document.dispatchEvent(event);

    expect(playPrevious).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  // ─── Playlist media keys ───────────────────────────────────────────────

  it("includes mediatracknext/mediatrackprevious when playlist has multiple scenes", () => {
    const playNext = vi.fn();
    const playPrevious = vi.fn();
    const { shortcuts } = captureShortcuts({}, {
      playlist: { scenes: [{}, {}] },
      playNext,
      playPrevious,
    });

    expect(shortcuts.mediatracknext).toBeDefined();
    expect(shortcuts.mediatrackprevious).toBeDefined();

    shortcuts.mediatracknext();
    expect(playNext).toHaveBeenCalledTimes(1);

    shortcuts.mediatrackprevious();
    expect(playPrevious).toHaveBeenCalledTimes(1);
  });

  it("does not include media track keys when no playlist", () => {
    const { shortcuts } = captureShortcuts({}, { playlist: null });

    expect(shortcuts.mediatracknext).toBeUndefined();
    expect(shortcuts.mediatrackprevious).toBeUndefined();
  });
});
