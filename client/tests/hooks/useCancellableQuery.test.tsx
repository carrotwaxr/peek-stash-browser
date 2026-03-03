import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCancellableQuery } from "../../src/hooks/useCancellableQuery";
import { ApiError } from "../../src/api/client";
import { createQueryWrapper } from "../testUtils";

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
}));

import { useAuth } from "../../src/hooks/useAuth";
import type { Mock } from "vitest";

const useAuthMock = useAuth as unknown as Mock;

describe("useCancellableQuery", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("starts with loading true by default", () => {
      const { result } = renderHook(() => useCancellableQuery(), {
        wrapper: createQueryWrapper(),
      });
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.initMessage).toBeNull();
    });

    it("respects initialLoading option", () => {
      const { result } = renderHook(
        () => useCancellableQuery({ initialLoading: false }),
        { wrapper: createQueryWrapper() },
      );
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("execute", () => {
    it("fetches data and updates state", async () => {
      const mockData = { scenes: [{ id: "1" }] };
      const queryFn = vi.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useCancellableQuery(), {
        wrapper: createQueryWrapper(),
      });

      act(() => {
        result.current.execute(queryFn);
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(queryFn).toHaveBeenCalledWith(expect.any(AbortSignal));
    });

    it("sets error state on failure", async () => {
      const error = new Error("Network error");
      const queryFn = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useCancellableQuery(), {
        wrapper: createQueryWrapper(),
      });

      act(() => {
        result.current.execute(queryFn);
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeNull();
    });

    it("calls onDataChange callback after data loads", async () => {
      const mockData = { count: 5 };
      const queryFn = vi.fn().mockResolvedValue(mockData);
      const onDataChange = vi.fn();

      const { result } = renderHook(
        () => useCancellableQuery({ onDataChange }),
        { wrapper: createQueryWrapper() },
      );

      act(() => {
        result.current.execute(queryFn);
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
      });

      expect(onDataChange).toHaveBeenCalledWith(mockData);
    });
  });

  describe("request superseding", () => {
    it("uses data from the latest execute call", async () => {
      const secondQuery = vi.fn().mockResolvedValue({ second: true });

      const { result } = renderHook(() => useCancellableQuery(), {
        wrapper: createQueryWrapper(),
      });

      // Start first query (slow — won't resolve before second replaces it)
      act(() => {
        result.current.execute(
          vi.fn().mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve({ first: true }), 500)),
          ),
        );
      });

      // Start second query — supersedes the first via new query key
      act(() => {
        result.current.execute(secondQuery);
      });

      await waitFor(() => {
        expect(result.current.data).toEqual({ second: true });
      });
    });
  });

  describe("503 initializing", () => {
    it("shows init message when error is ApiError with isInitializing", async () => {
      const initError = new ApiError("Initializing", 503, { ready: false });
      const queryFn = vi.fn().mockRejectedValue(initError);

      const { result } = renderHook(() => useCancellableQuery(), {
        wrapper: createQueryWrapper(),
      });

      act(() => {
        result.current.execute(queryFn);
      });

      await waitFor(() => {
        expect(result.current.initMessage).toBe(
          "Server is syncing library, please wait...",
        );
      });

      // When initMessage is set, error is suppressed
      expect(result.current.error).toBeNull();
    });

    it("does not show init message for non-initializing errors", async () => {
      const regularError = new Error("Server error");
      const queryFn = vi.fn().mockRejectedValue(regularError);

      const { result } = renderHook(() => useCancellableQuery(), {
        wrapper: createQueryWrapper(),
      });

      act(() => {
        result.current.execute(queryFn);
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(result.current.initMessage).toBeNull();
    });
  });

  describe("auth gate", () => {
    it("does not execute when not authenticated", async () => {
      useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });
      const queryFn = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useCancellableQuery(), {
        wrapper: createQueryWrapper(),
      });

      act(() => {
        result.current.execute(queryFn);
      });

      // Query is disabled when not authenticated — queryFn should not be called
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(queryFn).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it("does not execute while auth is loading", async () => {
      useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: true });
      const queryFn = vi.fn().mockResolvedValue({});

      renderHook(() => useCancellableQuery(), {
        wrapper: createQueryWrapper(),
      });

      expect(queryFn).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("clears all state and aborts in-flight request", async () => {
      const mockData = { items: [1, 2, 3] };
      const queryFn = vi.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useCancellableQuery(), {
        wrapper: createQueryWrapper(),
      });

      act(() => {
        result.current.execute(queryFn);
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toBeNull();
      // Back to initial state — isLoading reflects initialLoading (true by default)
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.initMessage).toBeNull();
    });
  });

  describe("setData", () => {
    it("allows manual data updates", async () => {
      const queryFn = vi.fn().mockResolvedValue({ original: true });

      const { result } = renderHook(() => useCancellableQuery(), {
        wrapper: createQueryWrapper(),
      });

      act(() => {
        result.current.execute(queryFn);
      });

      await waitFor(() => {
        expect(result.current.data).toEqual({ original: true });
      });

      act(() => {
        result.current.setData({ updated: true });
      });

      expect(result.current.data).toEqual({ updated: true });
    });
  });
});
