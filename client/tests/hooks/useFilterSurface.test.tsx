/**
 * useFilterSurface: where a list's filters are edited. Below 768 px or in
 * TV mode they open in a full-height sheet ("Show N results"); otherwise a
 * chip's editor opens in a popover under it and applies live.
 */
import { renderHook } from "@testing-library/react";
import { matchMediaQueries } from "@tests/helpers/matchMedia";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHEET_QUERY, useFilterSurface } from "@/hooks/useFilterSurface";

let tv = false;
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: tv }),
}));

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
  tv = false;
});

describe("useFilterSurface", () => {
  it("`sheet` below 768 px or in TV mode, `popover` otherwise", () => {
    expect(SHEET_QUERY).toBe("(max-width: 767px)");

    const desktop = renderHook(() => useFilterSurface());
    expect(desktop.result.current).toBe("popover");
    desktop.unmount();

    tv = true;
    const television = renderHook(() => useFilterSurface());
    expect(television.result.current).toBe("sheet");
    television.unmount();

    tv = false;
    restore = matchMediaQueries([SHEET_QUERY]);
    const phone = renderHook(() => useFilterSurface());
    expect(phone.result.current).toBe("sheet");
    phone.unmount();
  });
});
