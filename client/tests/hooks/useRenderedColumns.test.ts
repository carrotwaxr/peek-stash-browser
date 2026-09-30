import { createRef } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRenderedColumns } from "../../src/hooks/useRenderedColumns";

let resize: () => void = () => {};
let disconnect = vi.fn();

class FakeResizeObserver {
  constructor(callback: () => void) {
    resize = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {
    disconnect();
  }
}

/** A grid element whose computed `grid-template-columns` is `tracks` */
const gridWith = (tracks: () => string) => {
  const el = document.createElement("div");
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () => ({ gridTemplateColumns: tracks() }) as CSSStyleDeclaration
  );
  return el;
};

describe("useRenderedColumns", () => {
  beforeEach(() => {
    disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reads 6 from 'repeat-like' gridTemplateColumns of six tracks", () => {
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = gridWith(
      () => "200px 200px 200px 200px 200px 200px"
    );

    const { result } = renderHook(() => useRenderedColumns(ref));

    expect(result.current).toBe(6);
  });

  it("reads 1 from a single track", () => {
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = gridWith(() => "640px");

    const { result } = renderHook(() => useRenderedColumns(ref));

    expect(result.current).toBe(1);
  });

  it("follows the grid when it is resized, and stops observing on unmount", () => {
    let tracks = "300px 300px 300px";
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = gridWith(() => tracks);

    const { result, unmount } = renderHook(() => useRenderedColumns(ref));
    expect(result.current).toBe(3);

    tracks = "500px";
    act(() => resize());
    expect(result.current).toBe(1);

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("counts none while the grid is not mounted or has no tracks", () => {
    const ref = createRef<HTMLElement>();
    const { result } = renderHook(() => useRenderedColumns(ref));
    expect(result.current).toBe(0);

    (ref as { current: HTMLElement | null }).current = gridWith(() => "none");
    const second = renderHook(() => useRenderedColumns(ref));
    expect(second.result.current).toBe(0);
  });
});
