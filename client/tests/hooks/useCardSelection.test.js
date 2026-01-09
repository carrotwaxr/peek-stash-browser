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

  it("returns undefined handleNavigationClick when not in selectionMode", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1" };

    const { result } = renderHook(() =>
      useCardSelection({ entity, selectionMode: false, onToggleSelect })
    );

    expect(result.current.handleNavigationClick).toBeUndefined();
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
});
