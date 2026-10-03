/**
 * useFlushableDebounce: a trailing debounce that can run its waiting call
 * at once (a chip's editor closing) or drop it.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFlushableDebounce } from "@/hooks/useDebounce";

describe("useFlushableDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the last call once, `delay` after it", () => {
    const callback = vi.fn<(value: string) => void>();
    const { result } = renderHook(() => useFlushableDebounce(callback, 300));

    act(() => {
      result.current.run("6");
      vi.advanceTimersByTime(100);
      result.current.run("60");
      vi.advanceTimersByTime(299);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("60");
  });

  it("flush runs the waiting call at once; cancel drops it", () => {
    const callback = vi.fn<(value: string) => void>();
    const { result } = renderHook(() => useFlushableDebounce(callback, 300));

    act(() => {
      result.current.run("a");
      result.current.flush();
    });
    expect(callback).toHaveBeenCalledWith("a");
    // Nothing waits after a flush: a second one and the timer do nothing
    act(() => {
      result.current.flush();
      vi.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.run("b");
      result.current.cancel();
      result.current.flush();
      vi.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("calls the latest callback, and keeps its functions across renders", () => {
    const first = vi.fn<(value: string) => void>();
    const second = vi.fn<(value: string) => void>();
    const { result, rerender } = renderHook(
      ({ callback }) => useFlushableDebounce(callback, 300),
      { initialProps: { callback: first } }
    );
    const before = result.current;

    act(() => result.current.run("x"));
    rerender({ callback: second });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("x");
    expect(result.current).toBe(before);
  });

  it("an unmount drops the waiting call", () => {
    const callback = vi.fn<(value: string) => void>();
    const { result, unmount } = renderHook(() =>
      useFlushableDebounce(callback, 300)
    );

    act(() => result.current.run("a"));
    unmount();
    vi.advanceTimersByTime(1000);

    expect(callback).not.toHaveBeenCalled();
  });
});
