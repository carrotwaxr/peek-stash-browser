import { type ReactNode, createElement } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";
import { usePlaylistMediaKeys } from "@/hooks/useMediaKeys";
import { useRatingHotkeys } from "@/hooks/useRatingHotkeys";

type MediaKeysOptions = Parameters<typeof usePlaylistMediaKeys>[0];

/** A mock Video.js player with sensible defaults. */
const createMockPlayer = (
  overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}
) => ({
  paused: vi.fn(() => true),
  play: vi.fn(),
  pause: vi.fn(),
  currentTime: vi.fn((t?: number) => t ?? 30),
  duration: vi.fn(() => 100),
  volume: vi.fn((v?: number) => v ?? 0.5),
  muted: vi.fn((m?: boolean) => m ?? false),
  playbackRate: vi.fn((r?: number) => r ?? 1),
  isFullscreen: vi.fn(() => false),
  exitFullscreen: vi.fn(),
  requestFullscreen: vi.fn(),
  ...overrides,
});

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(ShortcutScopeProvider, null, children);

const mounted: HTMLElement[] = [];

/** A DOM element in the document, removed after the test. */
function addElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  parent: HTMLElement = document.body
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  parent.appendChild(el);
  mounted.push(el);
  return el;
}

/**
 * Mounts the player's keys. The player's element holds a button and a menu;
 * a tab and a button sit outside it.
 */
function setup(
  playerOverrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {},
  hookOptions: Partial<MediaKeysOptions> = {}
) {
  const player = createMockPlayer(playerOverrides);
  const playerRef = { current: player };
  const playerEl = addElement("div", { tabindex: "-1" });
  const playerButton = addElement("button", {}, playerEl);
  const menu = addElement("div", { role: "menu" }, playerEl);
  const menuItem = addElement("button", { role: "menuitem" }, menu);
  const pageButton = addElement("button");
  const pageTab = addElement("button", { role: "tab" });

  const rendered = renderHook(
    () =>
      usePlaylistMediaKeys({
        playerRef,
        playlist: hookOptions.playlist ?? null,
        playNext: hookOptions.playNext ?? null,
        playPrevious: hookOptions.playPrevious ?? null,
        enabled: hookOptions.enabled ?? true,
        root: () => playerEl,
      }),
    { wrapper }
  );

  return {
    player,
    playerEl,
    playerButton,
    menuItem,
    pageButton,
    pageTab,
    ...rendered,
  };
}

/** Dispatches a keydown on the target (the body by default). */
function press(
  key: string,
  target: EventTarget = document.body,
  init: Partial<KeyboardEventInit> = {}
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
});

describe("usePlaylistMediaKeys", () => {
  // ─── Focus decides who owns the key ─────────────────────────────────────

  it("Space on a focused button outside the player activates the button and does not toggle playback", () => {
    const { player, pageButton } = setup();
    pageButton.focus();

    const event = press(" ", pageButton);

    expect(player.play).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("Space with focus on the page body toggles playback", () => {
    const { player } = setup({ paused: vi.fn(() => true) });

    const event = press(" ", document.body);

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Space with focus inside the player's element toggles playback", () => {
    const { player, playerEl } = setup({ paused: vi.fn(() => false) });
    playerEl.focus();

    press(" ", playerEl);

    expect(player.pause).toHaveBeenCalledTimes(1);
  });

  it("Space on a button inside the player activates the button and does not toggle playback", () => {
    const { player, playerButton } = setup();
    playerButton.focus();

    press(" ", playerButton);

    expect(player.play).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
  });

  it("arrows inside a video.js menu (role=menu) move in the menu and do not seek", () => {
    const { player, menuItem } = setup();
    menuItem.focus();

    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      press(key, menuItem);
    }

    expect(player.currentTime).not.toHaveBeenCalled();
    expect(player.volume).not.toHaveBeenCalled();
  });

  it("End with focus on a tab outside the player does nothing to the video", () => {
    const { player, pageTab } = setup();
    pageTab.focus();

    press("End", pageTab);
    press("Home", pageTab);
    press("ArrowRight", pageTab);
    press("k", pageTab);

    expect(player.currentTime).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("does not act in a text field", () => {
    const { player } = setup();
    const input = addElement("input", { type: "text" });
    input.focus();

    press("k", input);
    press("End", input);

    expect(player.play).not.toHaveBeenCalled();
    expect(player.currentTime).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    const { player } = setup({}, { enabled: false });

    press("k");

    expect(player.play).not.toHaveBeenCalled();
  });

  it("does nothing while the player is not created yet", () => {
    const playerRef = { current: null };
    renderHook(
      () =>
        usePlaylistMediaKeys({
          playerRef,
          playlist: null,
          playNext: null,
          playPrevious: null,
          root: () => null,
        }),
      { wrapper }
    );

    expect(() => press("k")).not.toThrow();
  });

  // ─── Play/pause ─────────────────────────────────────────────────────────

  it("toggles play/pause with space key (plays when paused)", () => {
    const { player } = setup({ paused: vi.fn(() => true) });

    press(" ");

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.pause).not.toHaveBeenCalled();
  });

  it("toggles play/pause with space key (pauses when playing)", () => {
    const { player } = setup({ paused: vi.fn(() => false) });

    press(" ");

    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
  });

  it("toggles play/pause with k key", () => {
    const { player } = setup({ paused: vi.fn(() => true) });

    press("k");

    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("toggles play/pause with the media play/pause key", () => {
    const { player } = setup({ paused: vi.fn(() => true) });

    press("MediaPlayPause");

    expect(player.play).toHaveBeenCalledTimes(1);
  });

  // ─── Seeking ────────────────────────────────────────────────────────────

  it("seeks backward 10s with j key (clamped to 0)", () => {
    const { player } = setup({
      currentTime: vi.fn((t?: number) => t ?? 5),
    });

    press("j");

    expect(player.currentTime).toHaveBeenCalledWith(0);
  });

  it("seeks forward 10s with l key", () => {
    const { player } = setup();

    press("l");

    expect(player.currentTime).toHaveBeenCalledWith(40);
  });

  it("seeks backward 5s with left arrow", () => {
    const { player } = setup();

    press("ArrowLeft");

    expect(player.currentTime).toHaveBeenCalledWith(25);
  });

  it("seeks forward 5s with right arrow", () => {
    const { player } = setup();

    press("ArrowRight");

    expect(player.currentTime).toHaveBeenCalledWith(35);
  });

  it("seeks to start with Home key", () => {
    const { player } = setup();

    press("Home");

    expect(player.currentTime).toHaveBeenCalledWith(0);
  });

  it("seeks to end with End key", () => {
    const { player } = setup({ duration: vi.fn(() => 200) });

    press("End");

    expect(player.currentTime).toHaveBeenCalledWith(200);
  });

  it("jumps to a percentage with number keys", () => {
    const { player } = setup();

    press("0");
    expect(player.currentTime).toHaveBeenLastCalledWith(0);
    press("5");
    expect(player.currentTime).toHaveBeenLastCalledWith(50);
    press("9");
    expect(player.currentTime).toHaveBeenLastCalledWith(90);
  });

  // ─── Rating keys share the number row and f ─────────────────────────────

  describe("with the page's rating keys", () => {
    // Both hooks in one render share one dispatcher
    function setupShared() {
      const player = createMockPlayer();
      const playerRef = { current: player };
      const setRating = vi.fn();
      const toggleFavorite = vi.fn();
      renderHook(
        () => {
          usePlaylistMediaKeys({
            playerRef,
            playlist: null,
            playNext: null,
            playPrevious: null,
            root: () => null,
          });
          useRatingHotkeys({ setRating, toggleFavorite });
        },
        { wrapper }
      );
      return { player, setRating, toggleFavorite };
    }

    it("r then 5 sets the rating and does not jump to 50%", () => {
      const { player, setRating } = setupShared();

      press("r");
      press("5");

      expect(setRating).toHaveBeenCalledWith(100);
      expect(player.currentTime).not.toHaveBeenCalled();
    });

    it("r then 0 clears the rating and does not jump to the start", () => {
      const { player, setRating } = setupShared();

      press("r");
      press("0");

      expect(setRating).toHaveBeenCalledWith(null);
      expect(player.currentTime).not.toHaveBeenCalled();
    });

    it("r then f toggles the favorite and does not toggle fullscreen", () => {
      const { player, toggleFavorite } = setupShared();

      press("r");
      press("f");

      expect(toggleFavorite).toHaveBeenCalledTimes(1);
      expect(player.requestFullscreen).not.toHaveBeenCalled();
    });

    it("5 and f alone still act on the video", () => {
      const { player, setRating, toggleFavorite } = setupShared();

      press("5");
      press("f");

      expect(player.currentTime).toHaveBeenCalledWith(50);
      expect(player.requestFullscreen).toHaveBeenCalledTimes(1);
      expect(setRating).not.toHaveBeenCalled();
      expect(toggleFavorite).not.toHaveBeenCalled();
    });
  });

  it("jumps with 6-9", () => {
    const { player } = setup();

    for (const [key, time] of [
      ["6", 60],
      ["7", 70],
      ["8", 80],
    ] as const) {
      press(key);
      expect(player.currentTime).toHaveBeenLastCalledWith(time);
    }
  });

  // ─── Volume, mute, speed, fullscreen ────────────────────────────────────

  it("increases volume with up arrow (+0.05, clamped to 1)", () => {
    const { player } = setup({ volume: vi.fn((v?: number) => v ?? 0.95) });

    press("ArrowUp");

    expect(player.volume).toHaveBeenCalledWith(1);
  });

  it("decreases volume with down arrow (-0.05, clamped to 0)", () => {
    const { player } = setup({ volume: vi.fn((v?: number) => v ?? 0.03) });

    press("ArrowDown");

    expect(player.volume).toHaveBeenCalledWith(0);
  });

  it("toggles mute with m key", () => {
    const { player } = setup();

    press("m");

    expect(player.muted).toHaveBeenCalledWith(true);
  });

  it("increases playback speed with shift+> (max 2)", () => {
    const { player } = setup({
      playbackRate: vi.fn((r?: number) => r ?? 1.75),
    });

    press(">", document.body, { shiftKey: true });

    expect(player.playbackRate).toHaveBeenCalledWith(2);
  });

  it("decreases playback speed with shift+< (min 0.25)", () => {
    const { player } = setup({
      playbackRate: vi.fn((r?: number) => r ?? 0.5),
    });

    press("<", document.body, { shiftKey: true });

    expect(player.playbackRate).toHaveBeenCalledWith(0.25);
  });

  it("toggles fullscreen with f key", () => {
    const { player } = setup({ isFullscreen: vi.fn(() => false) });

    press("f");

    expect(player.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("exits fullscreen when already fullscreen", () => {
    const { player } = setup({ isFullscreen: vi.fn(() => true) });

    press("f");

    expect(player.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  // ─── Playlist navigation ────────────────────────────────────────────────

  describe("Shift+N and Shift+P", () => {
    it("Shift+N plays next only in a playlist of two or more", () => {
      const playNext = vi.fn();
      const playPrevious = vi.fn();
      setup({}, { playlist: { scenes: [{}, {}] }, playNext, playPrevious });

      const event = press("N", document.body, { shiftKey: true });

      expect(playNext).toHaveBeenCalledTimes(1);
      expect(playPrevious).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it("Shift+P plays previous in a playlist of two or more", () => {
      const playNext = vi.fn();
      const playPrevious = vi.fn();
      setup({}, { playlist: { scenes: [{}, {}] }, playNext, playPrevious });

      press("P", document.body, { shiftKey: true });

      expect(playPrevious).toHaveBeenCalledTimes(1);
      expect(playNext).not.toHaveBeenCalled();
    });

    it("plain n and p do nothing", () => {
      const playNext = vi.fn();
      const playPrevious = vi.fn();
      setup({}, { playlist: { scenes: [{}, {}] }, playNext, playPrevious });

      const n = press("n");
      press("p");

      expect(playNext).not.toHaveBeenCalled();
      expect(playPrevious).not.toHaveBeenCalled();
      expect(n.defaultPrevented).toBe(false);
    });

    it("do nothing with a single scene or no playlist", () => {
      const playNext = vi.fn();
      const playPrevious = vi.fn();
      setup({}, { playlist: { scenes: [{}] }, playNext, playPrevious });

      press("N", document.body, { shiftKey: true });
      press("P", document.body, { shiftKey: true });

      expect(playNext).not.toHaveBeenCalled();
      expect(playPrevious).not.toHaveBeenCalled();
    });

    it("do nothing while focus is on a control outside the player", () => {
      const playNext = vi.fn();
      const { pageTab } = setup(
        {},
        { playlist: { scenes: [{}, {}] }, playNext, playPrevious: vi.fn() }
      );
      pageTab.focus();

      press("N", pageTab, { shiftKey: true });

      expect(playNext).not.toHaveBeenCalled();
    });

    it("hardware media track keys move through the playlist", () => {
      const playNext = vi.fn();
      const playPrevious = vi.fn();
      setup({}, { playlist: { scenes: [{}, {}] }, playNext, playPrevious });

      press("MediaTrackNext");
      press("MediaTrackPrevious");

      expect(playNext).toHaveBeenCalledTimes(1);
      expect(playPrevious).toHaveBeenCalledTimes(1);
    });

    it("media track keys do nothing without a playlist", () => {
      const playNext = vi.fn();
      setup({}, { playlist: null, playNext, playPrevious: vi.fn() });

      press("MediaTrackNext");

      expect(playNext).not.toHaveBeenCalled();
    });
  });
});
