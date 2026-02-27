import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCancellableQuery } from "../../src/hooks/useCancellableQuery.js";

vi.mock("../../src/hooks/useAuth.js", () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
}));

import { useAuth } from "../../src/hooks/useAuth.js";

describe("useCancellableQuery", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("starts with loading true by default", () => {
      const { result } = renderHook(() => useCancellableQuery());
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.initMessage).toBeNull();
    });

    it("respects initialLoading option", () => {
      const { result } = renderHook(() =>
        useCancellableQuery({ initialLoading: false })
      );
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("execute", () => {
    it("fetches data and updates state", async () => {
      const mockData = { scenes: [{ id: "1" }] };
      const queryFn = vi.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useCancellableQuery());

      await act(async () => {
        await result.current.execute(queryFn);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(queryFn).toHaveBeenCalledWith(expect.any(AbortSignal));
    });

    it("sets error state on failure", async () => {
      const error = new Error("Network error");
      const queryFn = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useCancellableQuery());

      await act(async () => {
        await result.current.execute(queryFn);
      });

      expect(result.current.error).toBe(error);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeNull();
    });

    it("calls onDataChange callback after data loads", async () => {
      const mockData = { count: 5 };
      const queryFn = vi.fn().mockResolvedValue(mockData);
      const onDataChange = vi.fn();

      const { result } = renderHook(() =>
        useCancellableQuery({ onDataChange })
      );

      await act(async () => {
        await result.current.execute(queryFn);
      });

      expect(onDataChange).toHaveBeenCalledWith(mockData);
    });
  });

  describe("request cancellation", () => {
    it("aborts previous request when new one starts", async () => {
      let resolveFirst;
      const firstQuery = vi.fn().mockImplementation(
        () => new Promise((resolve) => { resolveFirst = resolve; })
      );
      const secondQuery = vi.fn().mockResolvedValue({ second: true });

      const { result } = renderHook(() => useCancellableQuery());

      // Start first query (don't await — it won't resolve)
      let firstPromise;
      act(() => {
        firstPromise = result.current.execute(firstQuery);
      });

      // Start second query — should abort first
      await act(async () => {
        await result.current.execute(secondQuery);
      });

      expect(result.current.data).toEqual({ second: true });

      // Resolve the first to clean up — state should not update (aborted)
      resolveFirst({ first: true });
      await act(async () => { await firstPromise; });

      // Data should still be from second query
      expect(result.current.data).toEqual({ second: true });
    });

    it("swallows AbortError silently", async () => {
      const abortError = Object.assign(new Error("Aborted"), {
        name: "AbortError",
      });
      const queryFn = vi.fn().mockRejectedValue(abortError);

      const { result } = renderHook(() =>
        useCancellableQuery({ initialLoading: false })
      );

      await act(async () => {
        await result.current.execute(queryFn);
      });

      // AbortError should not set error state
      expect(result.current.error).toBeNull();
    });
  });

  describe("503 initializing retry", () => {
    it("retries on isInitializing error with init message", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      const initError = Object.assign(new Error("Initializing"), {
        isInitializing: true,
      });
      const queryFn = vi.fn()
        .mockRejectedValueOnce(initError)
        .mockResolvedValueOnce({ scenes: [] });

      const { result } = renderHook(() => useCancellableQuery());

      await act(async () => {
        await result.current.execute(queryFn);
      });

      // After first failure, should show init message
      expect(result.current.initMessage).toBe(
        "Server is syncing library, please wait..."
      );
      expect(queryFn).toHaveBeenCalledTimes(1);

      // Advance timer to trigger retry
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(result.current.data).toEqual({ scenes: [] });
      expect(result.current.initMessage).toBeNull();

      vi.useRealTimers();
    });

    it("stops retrying after 60 attempts", async () => {
      const initError = Object.assign(new Error("Initializing"), {
        isInitializing: true,
      });
      const queryFn = vi.fn().mockRejectedValue(initError);

      const { result } = renderHook(() => useCancellableQuery());

      // Execute with retryCount at the limit
      await act(async () => {
        await result.current.execute(queryFn, { retryCount: 60 });
      });

      // Should set error instead of retrying
      expect(result.current.error).toBe(initError);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("auth gate", () => {
    it("does not execute when not authenticated", async () => {
      useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
      const queryFn = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useCancellableQuery());

      await act(async () => {
        await result.current.execute(queryFn);
      });

      expect(queryFn).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it("does not execute while auth is loading", async () => {
      useAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
      const queryFn = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useCancellableQuery());

      await act(async () => {
        await result.current.execute(queryFn);
      });

      expect(queryFn).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("clears all state and aborts in-flight request", async () => {
      const mockData = { items: [1, 2, 3] };
      const queryFn = vi.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useCancellableQuery());

      await act(async () => {
        await result.current.execute(queryFn);
      });

      expect(result.current.data).toEqual(mockData);

      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.initMessage).toBeNull();
    });
  });

  describe("setData", () => {
    it("allows manual data updates", async () => {
      const queryFn = vi.fn().mockResolvedValue({ original: true });

      const { result } = renderHook(() => useCancellableQuery());

      await act(async () => {
        await result.current.execute(queryFn);
      });

      expect(result.current.data).toEqual({ original: true });

      act(() => {
        result.current.setData({ updated: true });
      });

      expect(result.current.data).toEqual({ updated: true });
    });
  });
});
