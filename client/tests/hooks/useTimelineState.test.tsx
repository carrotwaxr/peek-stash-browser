// client/tests/hooks/useTimelineState.test.jsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { apiGet } from "../../src/api";
import { useTimelineState } from "../../src/components/timeline/useTimelineState";

vi.mock("../../src/api", () => ({
  apiGet: vi.fn(),
}));

const apiGetMock = apiGet as unknown as Mock;

describe("useTimelineState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("initializes with default zoom level of months", () => {
      apiGetMock.mockResolvedValue({ distribution: [] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      expect(result.current.zoomLevel).toBe("months");
    });

    it("initializes with no selected period", () => {
      apiGetMock.mockResolvedValue({ distribution: [] });

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
      apiGetMock.mockResolvedValue({ distribution: mockDistribution });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      await waitFor(() => {
        expect(result.current.distribution).toEqual(mockDistribution);
      });

      expect(apiGet).toHaveBeenCalledWith(
        "/timeline/scene/distribution?granularity=months"
      );
    });
  });

  describe("zoom level changes", () => {
    it("updates zoom level and refetches distribution", async () => {
      apiGetMock.mockResolvedValue({ distribution: [] });

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
        expect(apiGet).toHaveBeenCalledWith(
          "/timeline/scene/distribution?granularity=years"
        );
      });
    });
  });

  describe("period selection", () => {
    it("selects a period and calculates date range", async () => {
      apiGetMock.mockResolvedValue({
        distribution: [{ period: "2024-03", count: 47 }],
      });

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
      apiGetMock.mockResolvedValue({
        distribution: [{ period: "2024-03", count: 47 }],
      });

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
      apiGetMock.mockResolvedValue({ distribution: mockDistribution });

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
      apiGetMock.mockRejectedValue(new Error("Network error"));

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

  describe("a controlled period", () => {
    it("is the selection, at the zoom its form names", async () => {
      apiGetMock.mockResolvedValue({ distribution: [] });
      const onPeriodChange = vi.fn();

      const { result, rerender } = renderHook(
        ({ period }: { period: string | null }) =>
          useTimelineState({ entityType: "image", period, onPeriodChange }),
        { initialProps: { period: "2024" } }
      );

      expect(result.current.zoomLevel).toBe("years");
      expect(result.current.selectedPeriod).toEqual({
        period: "2024",
        start: "2024-01-01",
        end: "2024-12-31",
        label: "2024",
      });

      // Back to another period: the selection follows the owner
      rerender({ period: "2023-02" });
      expect(result.current.zoomLevel).toBe("months");
      expect(result.current.selectedPeriod?.label).toBe("February 2023");
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(onPeriodChange).not.toHaveBeenCalled();
    });

    it("reports a choice and a deselection through onPeriodChange, leaving the selection to the owner", async () => {
      apiGetMock.mockResolvedValue({ distribution: [] });
      const onPeriodChange = vi.fn();
      const { result } = renderHook(() =>
        useTimelineState({
          entityType: "image",
          period: "2024-03",
          onPeriodChange,
        })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => result.current.selectPeriod("2024-04"));
      expect(onPeriodChange).toHaveBeenLastCalledWith("2024-04");
      expect(result.current.selectedPeriod?.period).toBe("2024-03");

      act(() => result.current.selectPeriod("2024-03"));
      expect(onPeriodChange).toHaveBeenLastCalledWith(null);
    });

    it("reports the auto-selected latest period instead of keeping it", async () => {
      apiGetMock.mockResolvedValue({
        distribution: [
          { period: "2024-01", count: 10 },
          { period: "2024-03", count: 47 },
        ],
      });
      const onPeriodChange = vi.fn();
      const { result } = renderHook(() =>
        useTimelineState({
          entityType: "image",
          autoSelectRecent: true,
          period: null,
          onPeriodChange,
        })
      );

      await waitFor(() =>
        expect(onPeriodChange).toHaveBeenCalledWith("2024-03")
      );
      expect(onPeriodChange).toHaveBeenCalledTimes(1);
      expect(result.current.selectedPeriod).toBeNull();
    });

    it("a zoom change clears the period through onPeriodChange", async () => {
      apiGetMock.mockResolvedValue({ distribution: [] });
      const onPeriodChange = vi.fn();
      const { result } = renderHook(() =>
        useTimelineState({
          entityType: "image",
          period: "2024-03",
          onPeriodChange,
        })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => result.current.setZoomLevel("years"));
      expect(onPeriodChange).toHaveBeenLastCalledWith(null);
    });
  });
});
