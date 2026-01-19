// client/tests/hooks/useMediaQuery.test.js
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useMediaQuery } from "../../src/hooks/useMediaQuery.js";

describe("useMediaQuery", () => {
  let matchMediaMock;
  let listeners;

  beforeEach(() => {
    listeners = [];

    matchMediaMock = vi.fn((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn((event, handler) => {
        if (event === "change") {
          listeners.push(handler);
        }
      }),
      removeEventListener: vi.fn((event, handler) => {
        if (event === "change") {
          const index = listeners.indexOf(handler);
          if (index > -1) {
            listeners.splice(index, 1);
          }
        }
      }),
    }));

    window.matchMedia = matchMediaMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    listeners = [];
  });

  it("returns initial match state from matchMedia", () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));

    expect(result.current).toBe(true);
  });

  it("calls matchMedia with the provided query", () => {
    renderHook(() => useMediaQuery("(min-width: 1024px)"));

    expect(matchMediaMock).toHaveBeenCalledWith("(min-width: 1024px)");
  });

  it("updates when media query changes", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));

    expect(result.current).toBe(false);

    // Simulate media query change
    act(() => {
      listeners.forEach((listener) => listener({ matches: true }));
    });

    expect(result.current).toBe(true);
  });

  it("removes event listener on unmount", () => {
    const removeEventListener = vi.fn();

    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn((event, handler) => {
        if (event === "change") {
          listeners.push(handler);
        }
      }),
      removeEventListener,
    });

    const { unmount } = renderHook(() => useMediaQuery("(max-width: 768px)"));

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("updates listener when query changes", () => {
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: "(max-width: 768px)" },
    });

    expect(matchMediaMock).toHaveBeenCalledWith("(max-width: 768px)");

    rerender({ query: "(max-width: 1024px)" });

    expect(matchMediaMock).toHaveBeenCalledWith("(max-width: 1024px)");
  });

  it("handles matchMedia returning different initial states", () => {
    // First render with matches: true
    matchMediaMock.mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const { result: result1 } = renderHook(() =>
      useMediaQuery("(max-width: 768px)")
    );
    expect(result1.current).toBe(true);

    // Second render with matches: false
    matchMediaMock.mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const { result: result2 } = renderHook(() =>
      useMediaQuery("(min-width: 1024px)")
    );
    expect(result2.current).toBe(false);
  });
});
