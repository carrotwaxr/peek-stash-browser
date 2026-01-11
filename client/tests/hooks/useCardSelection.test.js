// client/src/hooks/__tests__/useCardSelection.test.js
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCardSelection } from "../../src/hooks/useCardSelection.js";

describe("useCardSelection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onToggleSelect after 500ms long-press", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1", name: "Test" };

    const { result } = renderHook(() =>
      useCardSelection({
        entity,
        selectionMode: false,
        onToggleSelect,
      })
    );

    // Simulate mousedown
    act(() => {
      result.current.selectionHandlers.onMouseDown({ target: document.body });
    });

    // Advance 500ms
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onToggleSelect).toHaveBeenCalledWith(entity);
  });

  it("cancels long-press on mouseup before 500ms", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1" };

    const { result } = renderHook(() =>
      useCardSelection({ entity, selectionMode: false, onToggleSelect })
    );

    act(() => {
      result.current.selectionHandlers.onMouseDown({ target: document.body });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    act(() => {
      result.current.selectionHandlers.onMouseUp();
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it("cancels long-press on touch move > 10px", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1" };

    const { result } = renderHook(() =>
      useCardSelection({ entity, selectionMode: false, onToggleSelect })
    );

    act(() => {
      result.current.selectionHandlers.onTouchStart({
        target: document.body,
        touches: [{ clientX: 100, clientY: 100 }],
      });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    act(() => {
      result.current.selectionHandlers.onTouchMove({
        touches: [{ clientX: 115, clientY: 100 }],
      });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it("returns handleNavigationClick when in selectionMode", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1" };

    const { result } = renderHook(() =>
      useCardSelection({ entity, selectionMode: true, onToggleSelect })
    );

    expect(result.current.handleNavigationClick).toBeDefined();
  });

  it("always returns handleNavigationClick even when not in selectionMode", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1" };

    const { result } = renderHook(() =>
      useCardSelection({ entity, selectionMode: false, onToggleSelect })
    );

    // Should always be defined so it can intercept clicks from interactive elements
    expect(result.current.handleNavigationClick).toBeDefined();
  });

  it("handleNavigationClick prevents default when click originated from interactive element (checkbox)", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1" };
    const preventDefault = vi.fn();

    const { result } = renderHook(() =>
      useCardSelection({ entity, selectionMode: false, onToggleSelect })
    );

    // Create a mock button element that simulates the checkbox
    const button = document.createElement("button");
    const link = document.createElement("a");
    link.appendChild(button);
    document.body.appendChild(link);

    act(() => {
      result.current.handleNavigationClick({
        preventDefault,
        target: button,
        currentTarget: link,
      });
    });

    // Should prevent navigation when click came from button inside link
    expect(preventDefault).toHaveBeenCalled();
    // Should NOT call onToggleSelect - checkbox handles its own selection
    expect(onToggleSelect).not.toHaveBeenCalled();

    document.body.removeChild(link);
  });

  it("handleNavigationClick allows navigation when click is directly on link (not from interactive element)", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1" };
    const preventDefault = vi.fn();

    const { result } = renderHook(() =>
      useCardSelection({ entity, selectionMode: false, onToggleSelect })
    );

    // Click directly on the link, not on an interactive child
    const link = document.createElement("a");
    document.body.appendChild(link);

    act(() => {
      result.current.handleNavigationClick({
        preventDefault,
        target: link,
        currentTarget: link,
      });
    });

    // Should NOT prevent navigation - this is a normal link click
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onToggleSelect).not.toHaveBeenCalled();

    document.body.removeChild(link);
  });

  it("handleNavigationClick prevents default and toggles in selection mode", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1" };
    const preventDefault = vi.fn();

    const { result } = renderHook(() =>
      useCardSelection({ entity, selectionMode: true, onToggleSelect })
    );

    act(() => {
      result.current.handleNavigationClick({ preventDefault });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(onToggleSelect).toHaveBeenCalledWith(entity);
  });

  it("long-press selection does not trigger navigation - click after long-press is blocked", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1" };
    const preventDefault = vi.fn();

    const { result } = renderHook(() =>
      useCardSelection({ entity, selectionMode: false, onToggleSelect })
    );

    // Simulate long-press: mousedown, wait 500ms for selection to fire
    act(() => {
      result.current.selectionHandlers.onMouseDown({ target: document.body });
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Long-press fired, isLongPressing should be true
    expect(result.current.isLongPressing).toBe(true);
    expect(onToggleSelect).toHaveBeenCalledWith(entity);

    // Now the click event fires (browser behavior after mouseup)
    // This should be blocked to prevent navigation
    act(() => {
      result.current.handleNavigationClick({ preventDefault });
    });

    expect(preventDefault).toHaveBeenCalled();
    // onToggleSelect should only have been called once (from long-press, not from click)
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    // isLongPressing should be reset
    expect(result.current.isLongPressing).toBe(false);
  });
});
