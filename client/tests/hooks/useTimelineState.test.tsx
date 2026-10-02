// client/tests/hooks/useTimelineState.test.jsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { apiPost } from "../../src/api";
import { useTimelineState } from "../../src/components/timeline/useTimelineState";

vi.mock("../../src/api", () => ({
  apiPost: vi.fn(),
}));

const apiPostMock = apiPost as unknown as Mock;

describe("useTimelineState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("initializes with default zoom level of months", () => {
      apiPostMock.mockResolvedValue({ distribution: [] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      expect(result.current.zoomLevel).toBe("months");
    });

    it("initializes with no selected period", () => {
      apiPostMock.mockResolvedValue({ distribution: [] });

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
      apiPostMock.mockResolvedValue({ distribution: mockDistribution });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene" })
      );

      await waitFor(() => {
        expect(result.current.distribution).toEqual(mockDistribution);
      });

      expect(apiPost).toHaveBeenCalledWith("/timeline/scene/distribution", {
        granularity: "months",
      });
    });
  });

  describe("zoom level changes", () => {
    it("updates zoom level and refetches distribution", async () => {
      apiPostMock.mockResolvedValue({ distribution: [] });

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
        expect(apiPost).toHaveBeenCalledWith("/timeline/scene/distribution", {
          granularity: "years",
        });
      });
    });
  });

  describe("the list's request", () => {
    const request = {
      filter: { q: "beach" },
      scene_filter: { rating100: { value: 60, modifier: "GREATER_THAN" } },
    };

    it("posts the list's filter and search with the granularity", async () => {
      apiPostMock.mockResolvedValue({ distribution: [] });

      renderHook(() => useTimelineState({ entityType: "scene", request }));

      await waitFor(() =>
        expect(apiPost).toHaveBeenCalledWith("/timeline/scene/distribution", {
          ...request,
          granularity: "months",
        })
      );
    });

    it("refetches when the request changes, not when it is rebuilt equal", async () => {
      apiPostMock.mockResolvedValue({ distribution: [] });
      const { rerender, result } = renderHook(
        ({ req }: { req: Record<string, unknown> }) =>
          useTimelineState({ entityType: "scene", request: req }),
        { initialProps: { req: request } }
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(apiPost).toHaveBeenCalledTimes(1);

      rerender({ req: { ...request } });
      expect(apiPost).toHaveBeenCalledTimes(1);

      rerender({ req: { ...request, filter: { q: "sea" } } });
      await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2));
      expect(apiPost).toHaveBeenLastCalledWith("/timeline/scene/distribution", {
        ...request,
        filter: { q: "sea" },
        granularity: "months",
      });
    });

    it("asks for nothing while the list has no request yet", () => {
      apiPostMock.mockResolvedValue({ distribution: [] });

      const { result } = renderHook(() =>
        useTimelineState({ entityType: "scene", request: null })
      );

      expect(result.current.isLoading).toBe(true);
      expect(apiPost).not.toHaveBeenCalled();
    });
  });

  describe("period selection", () => {
    it("selects a period and calculates date range", async () => {
      apiPostMock.mockResolvedValue({
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
      apiPostMock.mockResolvedValue({
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
      apiPostMock.mockResolvedValue({ distribution: mockDistribution });

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
      apiPostMock.mockRejectedValue(new Error("Network error"));

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
      apiPostMock.mockResolvedValue({ distribution: [] });
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
      apiPostMock.mockResolvedValue({ distribution: [] });
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
      apiPostMock.mockResolvedValue({
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
      apiPostMock.mockResolvedValue({ distribution: [] });
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
