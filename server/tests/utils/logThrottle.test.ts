/**
 * shouldLogOnce lets a log line through at most once per window per key, so
 * a request loop cannot flood the log. Its Map is module state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  describe("at 1000 keys", () => {
    const MINUTE = 60_000;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("keeps the most recent keys when a new key arrives", () => {
      for (let i = 0; i < 1000; i++) {
        expect(shouldLogOnce(`k${i}`, MINUTE)).toBe(true);
        vi.advanceTimersByTime(1);
      }
      // 1000 keys held: the oldest is still remembered
      expect(shouldLogOnce("k0", MINUTE)).toBe(false);

      expect(shouldLogOnce("new", MINUTE)).toBe(true);

      // The key logged last, a millisecond ago, is still throttled
      expect(shouldLogOnce("k999", MINUTE)).toBe(false);
      expect(shouldLogOnce("new", MINUTE)).toBe(false);
      // Only the oldest 100 were forgotten
      expect(shouldLogOnce("k100", MINUTE)).toBe(false);
      expect(shouldLogOnce("k99", MINUTE)).toBe(true);
    });

    it("orders keys by when they last logged", () => {
      for (let i = 0; i < 1000; i++) {
        shouldLogOnce(`k${i}`, MINUTE);
        vi.advanceTimersByTime(1);
      }
      // k0's window passes and it logs again, so it is now the newest
      vi.advanceTimersByTime(MINUTE - 1000);
      expect(shouldLogOnce("k0", MINUTE)).toBe(true);

      expect(shouldLogOnce("new", MINUTE)).toBe(true);

      expect(shouldLogOnce("k0", MINUTE)).toBe(false);
    });

    it("drops keys whose window has passed before any other", () => {
      // The long-window keys are the oldest, the short-window ones the newest
      for (let i = 0; i < 500; i++) shouldLogOnce(`long${i}`, MINUTE);
      for (let i = 0; i < 500; i++) shouldLogOnce(`short${i}`, 1000);
      vi.advanceTimersByTime(2000);

      // A short window on the new key does not expire the long-window keys
      expect(shouldLogOnce("new", 1000)).toBe(true);

      // Dropping the 500 expired keys made room, so no live key was forgotten
      expect(shouldLogOnce("long0", MINUTE)).toBe(false);
      expect(shouldLogOnce("long499", MINUTE)).toBe(false);
    });
  });
});
