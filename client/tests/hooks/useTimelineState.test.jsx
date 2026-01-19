// client/tests/hooks/useTimelineState.test.jsx
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTimelineState } from "../../src/components/timeline/useTimelineState.js";

vi.mock("../../src/services/api.js", () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from "../../src/services/api.js";

describe("useTimelineState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("initializes with default zoom level of months", () => {
      apiGet.mockResolvedValue({ distribution: [] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      expect(result.current.zoomLevel).toBe("months");
    });

    it("initializes with no selected period", () => {
      apiGet.mockResolvedValue({ distribution: [] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      expect(result.current.selectedPeriod).toBeNull();
    });

    it("fetches distribution on mount", async () => {
      const mockDistribution = [
        { period: "2024-01", count: 47 },
        { period: "2024-02", count: 12 },
      ];
      apiGet.mockResolvedValue({ distribution: mockDistribution });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      await waitFor(() => {
        expect(result.current.distribution).toEqual(mockDistribution);
      });

      expect(apiGet).toHaveBeenCalledWith("/timeline/scene/distribution?granularity=months");
    });
  });

  describe("zoom level changes", () => {
    it("updates zoom level and refetches distribution", async () => {
      apiGet.mockResolvedValue({ distribution: [] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setZoomLevel("years");
      });

      expect(result.current.zoomLevel).toBe("years");

      await waitFor(() => {
        expect(apiGet).toHaveBeenCalledWith("/timeline/scene/distribution?granularity=years");
      });
    });
  });

  describe("period selection", () => {
    it("selects a period and calculates date range", async () => {
      apiGet.mockResolvedValue({ distribution: [{ period: "2024-03", count: 47 }] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.selectPeriod("2024-03");
      });

      expect(result.current.selectedPeriod).toEqual({
        period: "2024-03",
        start: "2024-03-01",
        end: "2024-03-31",
        label: "March 2024",
      });
    });

    it("clears selection when selecting same period", async () => {
      apiGet.mockResolvedValue({ distribution: [{ period: "2024-03", count: 47 }] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.selectPeriod("2024-03");
      });

      act(() => {
        result.current.selectPeriod("2024-03");
      });

      expect(result.current.selectedPeriod).toBeNull();
    });
  });

  describe("auto-select most recent", () => {
    it("auto-selects most recent period when autoSelectRecent is true", async () => {
      const mockDistribution = [
        { period: "2024-01", count: 10 },
        { period: "2024-03", count: 47 },
      ];
      apiGet.mockResolvedValue({ distribution: mockDistribution });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene", autoSelectRecent: true })
      );

      await waitFor(() => {
        expect(result.current.selectedPeriod).not.toBeNull();
      });

      expect(result.current.selectedPeriod?.period).toBe("2024-03");
    });
  });

  describe("error handling", () => {
    it("sets error state when API call fails", async () => {
      apiGet.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      await waitFor(() => {
        expect(result.current.error).toBe("Network error");
      });

      expect(result.current.distribution).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });
  });
});
