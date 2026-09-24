/**
 * shouldLogOnce lets a log line through at most once per window per key, so
 * a request loop cannot flood the log. Its Map is module state.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetLogThrottleForTesting,
  shouldLogOnce,
} from "../../utils/logThrottle.js";

describe("shouldLogOnce", () => {
  beforeEach(() => {
    _resetLogThrottleForTesting();
  });

  it("allows a key once per window", () => {
    expect(shouldLogOnce("a", 1000, 0)).toBe(true);
    expect(shouldLogOnce("a", 1000, 999)).toBe(false);
    // Keys are independent
    expect(shouldLogOnce("b", 1000, 999)).toBe(true);
    // The window has passed: allowed again, and a new window starts
    expect(shouldLogOnce("a", 1000, 1000)).toBe(true);
    expect(shouldLogOnce("a", 1000, 1999)).toBe(false);
  });

  it("forgets keys past 1000", () => {
    expect(shouldLogOnce("k0", 60_000, 0)).toBe(true);
    for (let i = 1; i < 1000; i++) shouldLogOnce(`k${i}`, 60_000, 0);
    // 1000 keys held: k0 is still remembered
    expect(shouldLogOnce("k0", 60_000, 1)).toBe(false);

    // The 1001st key clears the Map
    expect(shouldLogOnce("k1000", 60_000, 1)).toBe(true);
    expect(shouldLogOnce("k0", 60_000, 2)).toBe(true);
  });
});
