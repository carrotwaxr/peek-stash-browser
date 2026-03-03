import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  useKeyboardShortcuts,
  useVideoPlayerShortcuts,
} from "@/hooks/useKeyboardShortcuts";

/**
 * Helper to dispatch a KeyboardEvent on document.
 * Uses the same property shape the hook inspects.
 */
function pressKey(
  key: string,
  options: Partial<KeyboardEventInit> = {},
  _useCapture = false
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  // Spy on preventDefault / stopPropagation so tests can assert
  vi.spyOn(event, "preventDefault");
  vi.spyOn(event, "stopPropagation");
  document.dispatchEvent(event);
  return event;
}

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Initialization ────────────────────────────────────────────────────

  it("adds keydown listener when enabled", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const handler = vi.fn();

    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ k: handler }, { enabled: true })
    );

    expect(addSpy).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
      false
    );

    unmount();
  });

  // ─── Cleanup ───────────────────────────────────────────────────────────

  it("removes keydown listener on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const handler = vi.fn();

    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ k: handler }, { enabled: true })
    );

    unmount();

    expect(removeSpy).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
      false
    );
  });

  // ─── Disabled ──────────────────────────────────────────────────────────

  it("does not add listener when enabled=false", () => {
    const handler = vi.fn();

    renderHook(() =>
      useKeyboardShortcuts({ k: handler }, { enabled: false })
    );

    pressKey("k");
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── Simple key ────────────────────────────────────────────────────────

  it("fires handler for 'k' key press", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ k: handler }));

    pressKey("k");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ─── Special key normalization ─────────────────────────────────────────

  it.each([
    [" ", "space"],
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
    ["Escape", "esc"],
    ["Enter", "enter"],
  ])("normalizes %s to '%s' shortcut key", (rawKey, normalizedKey) => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ [normalizedKey]: handler }));

    pressKey(rawKey);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ─── Ctrl modifier ────────────────────────────────────────────────────

  it("fires 'ctrl+s' handler with Ctrl key", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ "ctrl+s": handler }));

    pressKey("s", { ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ─── Meta as ctrl ─────────────────────────────────────────────────────

  it("fires 'ctrl+s' handler with Meta key (macOS)", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ "ctrl+s": handler }));

    pressKey("s", { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ─── Alt modifier ─────────────────────────────────────────────────────

  it("fires 'alt+a' handler with Alt key", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ "alt+a": handler }));

    pressKey("a", { altKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ─── Shift with symbol ────────────────────────────────────────────────

  it("fires 'shift+>' handler for Shift+>", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ "shift+>": handler }));

    // When shift+. is pressed on US keyboard, event.key is ">"
    pressKey(">", { shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ─── Shift ignored for letters ────────────────────────────────────────

  it("fires 'k' handler when Shift+K is pressed (shift ignored for letters)", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ k: handler }));

    pressKey("K", { shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ─── Input field blocking ─────────────────────────────────────────────

  it("does not fire when target is INPUT", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ k: handler }));

    const input = document.createElement("input");
    document.body.appendChild(input);
    const event = new KeyboardEvent("keydown", {
      key: "k",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  // ─── Textarea blocking ────────────────────────────────────────────────

  it("does not fire when target is TEXTAREA", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ k: handler }));

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    const event = new KeyboardEvent("keydown", {
      key: "k",
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  // ─── ContentEditable blocking ──────────────────────────────────────────

  it("does not fire when target is contentEditable", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ k: handler }));

    const div = document.createElement("div");
    div.contentEditable = "true";
    document.body.appendChild(div);
    const event = new KeyboardEvent("keydown", {
      key: "k",
      bubbles: true,
      cancelable: true,
    });
    div.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  // ─── Button allowed ───────────────────────────────────────────────────

  it("does fire when target is BUTTON", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ k: handler }));

    const button = document.createElement("button");
    document.body.appendChild(button);
    const event = new KeyboardEvent("keydown", {
      key: "k",
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    document.body.removeChild(button);
  });

  // ─── Handler returning false ───────────────────────────────────────────

  it("does not call preventDefault/stopPropagation when handler returns false", () => {
    const handler = vi.fn(() => false);
    renderHook(() => useKeyboardShortcuts({ k: handler }));

    const event = pressKey("k");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  // ─── Handler error ────────────────────────────────────────────────────

  it("logs error when handler throws and does not propagate", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn(() => {
      throw new Error("test error");
    });
    renderHook(() =>
      useKeyboardShortcuts({ k: handler }, { context: "test-ctx" })
    );

    // Should not throw
    pressKey("k");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[useKeyboardShortcuts:test-ctx]"),
      expect.any(Error)
    );
  });

  // ─── preventDefault/stopPropagation called on success ──────────────────

  it("calls preventDefault and stopPropagation when handler succeeds", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ k: handler }));

    const event = pressKey("k");

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  // ─── shouldHandle returning false ──────────────────────────────────────

  it("skips handler when shouldHandle returns false", () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(
        { k: handler },
        { shouldHandle: () => false }
      )
    );

    pressKey("k");
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── Video player context uses capture ─────────────────────────────────

  it("uses capture phase for video-player context", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const handler = vi.fn();

    const { unmount } = renderHook(() =>
      useKeyboardShortcuts(
        { k: handler },
        { context: "video-player" }
      )
    );

    expect(addSpy).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
      true
    );

    unmount();
  });
});

describe("useVideoPlayerShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips handler when playerRef.current is null", () => {
    const handler = vi.fn();
    const playerRef = { current: null };

    renderHook(() =>
      useVideoPlayerShortcuts(playerRef, { k: handler })
    );

    pressKey("k");
    expect(handler).not.toHaveBeenCalled();
  });

  it("fires handler when playerRef.current exists", () => {
    const handler = vi.fn();
    const playerRef = { current: {} };

    renderHook(() =>
      useVideoPlayerShortcuts(playerRef, { k: handler })
    );

    pressKey("k");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
