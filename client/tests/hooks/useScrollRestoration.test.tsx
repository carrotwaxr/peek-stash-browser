import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useScrollRestoration, {
  RESTORE_TIMEOUT_MS,
} from "@/hooks/useScrollRestoration";

// The tests/setup.ts ResizeObserver stub never calls back, so record every
// observer and let the tests fire the live ones.
interface RecordedObserver {
  callback: ResizeObserverCallback;
  active: boolean;
}
let observers: RecordedObserver[] = [];

class RecordingResizeObserver {
  record: RecordedObserver;
  constructor(callback: ResizeObserverCallback) {
    this.record = { callback, active: true };
    observers.push(this.record);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.record.active = false;
  }
}

const fireResize = () => {
  for (const o of observers.filter((o) => o.active)) {
    o.callback([], o as unknown as ResizeObserver);
  }
};

const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollTo = window.scrollTo;

const setScrollY = (y: number) => {
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    writable: true,
    value: y,
  });
  window.dispatchEvent(new Event("scroll"));
};

const setScrollHeight = (height: number) => {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: height,
  });
};

function Harness() {
  useScrollRestoration();
  return null;
}

let scrollTo: ReturnType<typeof vi.fn>;

const renderHarness = () => {
  const router = createMemoryRouter([{ path: "*", element: <Harness /> }], {
    initialEntries: ["/scenes"],
  });
  const utils = render(<RouterProvider router={router} />);
  // The first render counts as a pathname change and scrolls to the top.
  scrollTo.mockClear();
  return { router, ...utils };
};

describe("useScrollRestoration", () => {
  beforeEach(() => {
    sessionStorage.clear();
    observers = [];
    globalThis.ResizeObserver =
      RecordingResizeObserver as unknown as typeof ResizeObserver;
    scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 600,
    });
    setScrollY(0);
    setScrollHeight(4000);
    window.history.scrollRestoration = "auto";
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.ResizeObserver = originalResizeObserver;
    window.scrollTo = originalScrollTo;
  });

  it("sets history.scrollRestoration to manual", () => {
    renderHarness();
    expect(window.history.scrollRestoration).toBe("manual");
  });

  it("keeps the position when only the query string changes by PUSH", async () => {
    const { router } = renderHarness();
    setScrollY(1200);

    await act(() => router.navigate("/scenes?per_page=48"));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("keeps the position when only the query string changes by REPLACE", async () => {
    const { router } = renderHarness();
    setScrollY(1200);

    await act(() => router.navigate("/scenes?per_page=48", { replace: true }));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls to the top when the pathname changes", async () => {
    const { router } = renderHarness();
    setScrollY(1200);

    await act(() => router.navigate("/scene/1"));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("restores on Back only once the page is tall enough", async () => {
    const { router } = renderHarness();
    setScrollY(1500);
    await act(() => router.navigate("/scene/1"));
    scrollTo.mockClear();

    setScrollHeight(800);
    await act(() => router.navigate(-1));

    expect(router.state.location.pathname).toBe("/scenes");
    expect(scrollTo).not.toHaveBeenCalledWith(0, 1500);

    setScrollHeight(4000);
    act(() => fireResize());

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 1500);

    // Later growth does not scroll again.
    act(() => fireResize());
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("gives up after RESTORE_TIMEOUT_MS and scrolls as far as it can", async () => {
    const { router } = renderHarness();
    setScrollY(1500);
    await act(() => router.navigate("/scene/1"));
    scrollTo.mockClear();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    setScrollHeight(800);
    await act(() => router.navigate(-1));

    expect(scrollTo).not.toHaveBeenCalledWith(0, 1500);

    act(() => {
      vi.advanceTimersByTime(RESTORE_TIMEOUT_MS);
    });

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 1500);
  });

  it("stops restoring when the user scrolls first", async () => {
    const { router } = renderHarness();
    setScrollY(1500);
    await act(() => router.navigate("/scene/1"));
    scrollTo.mockClear();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    setScrollHeight(800);
    await act(() => router.navigate(-1));

    act(() => {
      window.dispatchEvent(new Event("wheel"));
    });
    setScrollHeight(4000);
    act(() => fireResize());
    act(() => {
      vi.advanceTimersByTime(RESTORE_TIMEOUT_MS);
    });

    expect(scrollTo).not.toHaveBeenCalledWith(0, 1500);
  });

  it("keeps separate positions for two history entries with the same URL", async () => {
    const { router } = renderHarness();

    // First /scenes entry, left at 500.
    setScrollY(500);
    await act(() => router.navigate("/scene/1"));
    // Second /scenes entry, left at 2000.
    await act(() => router.navigate("/scenes"));
    setScrollY(2000);
    await act(() => router.navigate("/scene/2"));

    scrollTo.mockClear();
    await act(() => router.navigate(-1));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 2000);

    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/scene/1");

    scrollTo.mockClear();
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/scenes");
    expect(scrollTo).toHaveBeenCalledWith(0, 500);
    expect(scrollTo).not.toHaveBeenCalledWith(0, 2000);
  });

  it("keeps only the newest 100 saved positions", async () => {
    const old = Array.from({ length: 100 }, (_, i) => `old${i}`);
    for (const key of old) sessionStorage.setItem(`peek:scroll:${key}`, "10");
    sessionStorage.setItem("peek:scroll:index", JSON.stringify(old));
    const { router } = renderHarness();
    const firstKey = router.state.location.key;
    setScrollY(700);

    await act(() => router.navigate("/scene/1"));

    const index = JSON.parse(
      sessionStorage.getItem("peek:scroll:index") as string
    ) as string[];
    expect(index).toHaveLength(100);
    expect(index[index.length - 1]).toBe(firstKey);
    expect(index).not.toContain("old0");
    expect(sessionStorage.getItem("peek:scroll:old0")).toBeNull();
    expect(sessionStorage.getItem("peek:scroll:old1")).toBe("10");
    expect(sessionStorage.getItem(`peek:scroll:${firstKey}`)).toBe("700");
  });

  it("starts a fresh index when the stored one is not a list", async () => {
    sessionStorage.setItem("peek:scroll:index", JSON.stringify({ a: 1 }));
    const { router } = renderHarness();
    const firstKey = router.state.location.key;
    setScrollY(300);

    await act(() => router.navigate("/scene/1"));

    expect(
      JSON.parse(sessionStorage.getItem("peek:scroll:index") as string)
    ).toEqual([firstKey]);
  });

  it("an unreadable saved position scrolls to the top on Back", async () => {
    const { router } = renderHarness();
    const firstKey = router.state.location.key;
    setScrollY(900);
    await act(() => router.navigate("/scene/1"));
    sessionStorage.setItem(`peek:scroll:${firstKey}`, "not-a-number");
    scrollTo.mockClear();

    await act(() => router.navigate(-1));

    expect(router.state.location.pathname).toBe("/scenes");
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("navigation still works when sessionStorage throws", async () => {
    const { router } = renderHarness();
    setScrollY(900);
    const setItem = vi
      .spyOn(sessionStorage, "setItem")
      .mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });
    const getItem = vi
      .spyOn(sessionStorage, "getItem")
      .mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });

    try {
      await act(() => router.navigate("/scene/1"));
      expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
      scrollTo.mockClear();

      // Nothing could be saved or read, so Back lands at the top
      await act(() => router.navigate(-1));
      expect(router.state.location.pathname).toBe("/scenes");
      expect(scrollTo).toHaveBeenCalledWith(0, 0);
      expect(scrollTo).not.toHaveBeenCalledWith(0, 900);
    } finally {
      setItem.mockRestore();
      getItem.mockRestore();
    }
  });
});
