import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAsyncData } from "../../src/hooks/useApi.js";

vi.mock("../../src/hooks/useAuth.js", () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
}));

import { useAuth } from "../../src/hooks/useAuth.js";

describe("useAsyncData", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
  });

  describe("initial fetch", () => {
    it("fetches data on mount when authenticated", async () => {
      const mockData = { users: [{ id: "1" }] };
      const fetchFn = vi.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useAsyncData(fetchFn));

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("sets error on fetch failure", async () => {
      const error = new Error("Server error");
      const fetchFn = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useAsyncData(fetchFn));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(error);
      expect(result.current.data).toBeNull();
    });

    it("preserves full error object including isInitializing flag", async () => {
      const error = Object.assign(new Error("Initializing"), {
        isInitializing: true,
        status: 503,
      });
      const fetchFn = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useAsyncData(fetchFn));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error.isInitializing).toBe(true);
      expect(result.current.error.status).toBe(503);
    });
  });

  describe("auth gate", () => {
    it("does not fetch when not authenticated", async () => {
      useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
      const fetchFn = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useAsyncData(fetchFn));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("does not fetch while auth is loading", async () => {
      useAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
      const fetchFn = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useAsyncData(fetchFn));

      // Should not call fetchFn while auth is loading
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("fetches when auth resolves to authenticated", async () => {
      useAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
      const fetchFn = vi.fn().mockResolvedValue({ data: "test" });

      const { result, rerender } = renderHook(() => useAsyncData(fetchFn));

      expect(fetchFn).not.toHaveBeenCalled();

      // Auth resolves
      useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
      rerender();

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchFn).toHaveBeenCalled();
      expect(result.current.data).toEqual({ data: "test" });
    });
  });

  describe("dependencies", () => {
    it("re-fetches when dependencies change", async () => {
      const fetchFn = vi.fn().mockResolvedValue({ page: 1 });

      const { result, rerender } = renderHook(
        ({ dep }) => useAsyncData(fetchFn, [dep]),
        { initialProps: { dep: "a" } }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);

      fetchFn.mockResolvedValue({ page: 2 });
      rerender({ dep: "b" });

      await waitFor(() => {
        expect(fetchFn).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("refetch", () => {
    it("manually re-fetches data", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce({ version: 1 })
        .mockResolvedValueOnce({ version: 2 });

      const { result } = renderHook(() => useAsyncData(fetchFn));

      await waitFor(() => {
        expect(result.current.data).toEqual({ version: 1 });
      });

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.data).toEqual({ version: 2 });
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("clears previous error on successful refetch", async () => {
      const fetchFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("Failed"))
        .mockResolvedValueOnce({ recovered: true });

      const { result } = renderHook(() => useAsyncData(fetchFn));

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.data).toEqual({ recovered: true });
    });
  });
});
