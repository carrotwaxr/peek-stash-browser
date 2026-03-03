import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { useGridPageTVNavigation } from "@/hooks/useGridPageTVNavigation";
import { useTVMode } from "@/hooks/useTVMode";
import { useTVNavigation } from "@/hooks/useTVNavigation";
import { useSpatialNavigation } from "@/hooks/useSpatialNavigation";
import { createRouterWrapper } from "@tests/testUtils";

// ─── Mock dependencies ───────────────────────────────────────────────────

const mockIsZoneActive = vi.fn((zone: string) => zone === "grid");
const mockGoToNextZone = vi.fn();
const mockGoToPreviousZone = vi.fn();
const mockGoToZone = vi.fn();

vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: vi.fn(() => ({ isTVMode: false })),
}));

vi.mock("@/hooks/useTVNavigation", () => ({
  useTVNavigation: vi.fn(() => ({
    currentZone: "grid",
    isZoneActive: mockIsZoneActive,
    goToNextZone: mockGoToNextZone,
    goToPreviousZone: mockGoToPreviousZone,
    goToZone: mockGoToZone,
  })),
}));

const mockSetItemRef = vi.fn();
const mockIsFocused = vi.fn(() => false);

vi.mock("@/hooks/useSpatialNavigation", () => ({
  useSpatialNavigation: vi.fn(() => ({
    setItemRef: mockSetItemRef,
    isFocused: mockIsFocused,
  })),
}));

const mockUseTVMode = useTVMode as Mock;
const mockUseTVNavigation = useTVNavigation as Mock;
const mockUseSpatialNavigation = useSpatialNavigation as Mock;

describe("useGridPageTVNavigation", () => {
  const wrapper = createRouterWrapper(["/"]);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTVMode.mockReturnValue({ isTVMode: false });
    mockUseTVNavigation.mockReturnValue({
      currentZone: "grid",
      isZoneActive: mockIsZoneActive,
      goToNextZone: mockGoToNextZone,
      goToPreviousZone: mockGoToPreviousZone,
      goToZone: mockGoToZone,
    });
    mockUseSpatialNavigation.mockReturnValue({
      setItemRef: mockSetItemRef,
      isFocused: mockIsFocused,
    });
    mockIsZoneActive.mockImplementation((zone: string) => zone === "grid");
    mockIsFocused.mockReturnValue(false);
  });

  // ─── Default return shape ──────────────────────────────────────────────

  it("returns isTVMode, tvNavigation, gridNavigation, searchControlsProps, gridItemProps", () => {
    const { result } = renderHook(
      () =>
        useGridPageTVNavigation({
          items: [],
          columns: 6,
          totalPages: 1,
        }),
      { wrapper }
    );

    expect(result.current).toHaveProperty("isTVMode");
    expect(result.current).toHaveProperty("tvNavigation");
    expect(result.current).toHaveProperty("gridNavigation");
    expect(result.current).toHaveProperty("paginationHandlerRef");
    expect(result.current).toHaveProperty("searchControlsProps");
    expect(result.current).toHaveProperty("gridItemProps");
    expect(typeof result.current.gridItemProps).toBe("function");
  });

  // ─── Non-TV mode ───────────────────────────────────────────────────────

  it("returns isTVMode=false when useTVMode returns false", () => {
    const { result } = renderHook(
      () => useGridPageTVNavigation({ items: [] }),
      { wrapper }
    );

    expect(result.current.isTVMode).toBe(false);
  });

  // ─── gridItemProps returns correct shape ───────────────────────────────

  it("gridItemProps returns object with ref, className, tabIndex", () => {
    const { result } = renderHook(
      () => useGridPageTVNavigation({ items: [1, 2, 3], columns: 3 }),
      { wrapper }
    );

    const props = result.current.gridItemProps(0);
    expect(props).toHaveProperty("ref");
    expect(props).toHaveProperty("className");
    expect(props).toHaveProperty("tabIndex");
    expect(typeof props.ref).toBe("function");
  });

  // ─── gridItemProps focused ─────────────────────────────────────────────

  it('gridItemProps includes "keyboard-focus" class when item is focused', () => {
    mockIsFocused.mockImplementation((index: number) => index === 2);

    const { result } = renderHook(
      () => useGridPageTVNavigation({ items: [1, 2, 3], columns: 3 }),
      { wrapper }
    );

    expect(result.current.gridItemProps(2).className).toBe("keyboard-focus");
    expect(result.current.gridItemProps(0).className).toBe("");
  });

  // ─── gridItemProps unfocused ───────────────────────────────────────────

  it("gridItemProps returns tabIndex=-1 when item is not focused", () => {
    mockIsFocused.mockReturnValue(false);

    const { result } = renderHook(
      () => useGridPageTVNavigation({ items: [1, 2, 3], columns: 3 }),
      { wrapper }
    );

    expect(result.current.gridItemProps(0).tabIndex).toBe(-1);
  });

  it("gridItemProps returns tabIndex=0 when item is focused", () => {
    mockIsFocused.mockImplementation((index: number) => index === 1);

    const { result } = renderHook(
      () => useGridPageTVNavigation({ items: [1, 2, 3], columns: 3 }),
      { wrapper }
    );

    expect(result.current.gridItemProps(1).tabIndex).toBe(0);
  });

  // ─── searchControlsProps shape ─────────────────────────────────────────

  it("searchControlsProps contains tvSearchZoneActive and pagination zone props", () => {
    const { result } = renderHook(
      () => useGridPageTVNavigation({ items: [] }),
      { wrapper }
    );

    const props = result.current.searchControlsProps;
    expect(props).toHaveProperty("tvSearchZoneActive");
    expect(props).toHaveProperty("tvTopPaginationZoneActive");
    expect(props).toHaveProperty("tvBottomPaginationZoneActive");
    expect(props).toHaveProperty("paginationHandlerRef");
  });

  // ─── TV mode false props ───────────────────────────────────────────────

  it("all zone active props are false when not in TV mode", () => {
    mockUseTVMode.mockReturnValue({ isTVMode: false });

    const { result } = renderHook(
      () => useGridPageTVNavigation({ items: [] }),
      { wrapper }
    );

    const props = result.current.searchControlsProps;
    expect(props.tvSearchZoneActive).toBe(false);
    expect(props.tvTopPaginationZoneActive).toBe(false);
    expect(props.tvBottomPaginationZoneActive).toBe(false);
  });

  // ─── Passes items and columns to spatial navigation ────────────────────

  it("passes items and columns to useSpatialNavigation", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

    renderHook(
      () => useGridPageTVNavigation({ items, columns: 4 }),
      { wrapper }
    );

    expect(mockUseSpatialNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        items,
        columns: 4,
      })
    );
  });

  // ─── Passes onItemSelect to spatial navigation ─────────────────────────

  it("passes onItemSelect as onSelect to useSpatialNavigation", () => {
    const onItemSelect = vi.fn();

    renderHook(
      () =>
        useGridPageTVNavigation({
          items: [1, 2],
          columns: 2,
          onItemSelect,
        }),
      { wrapper }
    );

    expect(mockUseSpatialNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        onSelect: onItemSelect,
      })
    );
  });

  // ─── Zones configuration ───────────────────────────────────────────────

  it("passes correct zones array to useTVNavigation", () => {
    renderHook(
      () => useGridPageTVNavigation({ items: [] }),
      { wrapper }
    );

    expect(mockUseTVNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        zones: ["search", "topPagination", "grid", "bottomPagination", "mainNav"],
        initialZone: "grid",
      })
    );
  });
});
