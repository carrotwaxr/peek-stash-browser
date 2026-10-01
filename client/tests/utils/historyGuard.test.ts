import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearInternalPop,
  markInternalPop,
  takeInternalPop,
} from "@/utils/historyGuard";

describe("historyGuard", () => {
  afterEach(() => {
    vi.useRealTimers();
    clearInternalPop();
  });

  it("a mark is taken once, only within 1 s, and a clear drops it", () => {
    vi.useFakeTimers();

    markInternalPop();
    vi.advanceTimersByTime(900);
    expect(takeInternalPop()).toBe(true);
    expect(takeInternalPop()).toBe(false);

    // A Back the router never saw (no location change) leaves the mark unread
    markInternalPop();
    vi.advanceTimersByTime(1100);
    expect(takeInternalPop()).toBe(false);

    markInternalPop();
    clearInternalPop();
    expect(takeInternalPop()).toBe(false);
  });
});
