import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  checkAccountLockout,
  recordFailedAttempt,
  clearFailedAttempts,
  _resetForTesting,
} from "../../middleware/accountLockout.js";

describe("accountLockout", () => {
  beforeEach(() => {
    _resetForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("checkAccountLockout", () => {
    it("should return locked: false for unknown user", () => {
      const result = checkAccountLockout("unknown");
      expect(result.locked).toBe(false);
    });

    it("should return locked: false for user with few failed attempts", () => {
      recordFailedAttempt("testuser");
      recordFailedAttempt("testuser");
      recordFailedAttempt("testuser");
      const result = checkAccountLockout("testuser");
      expect(result.locked).toBe(false);
    });

    it("should return locked: true after 5 failed attempts", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("testuser");
      }
      const result = checkAccountLockout("testuser");
      expect(result.locked).toBe(true);
      expect(result.remainingMs).toBeGreaterThan(0);
    });

    it("should be case-insensitive for username", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("TestUser");
      }
      const result = checkAccountLockout("testuser");
      expect(result.locked).toBe(true);
    });

    it("should unlock after 15 minutes", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("testuser");
      }

      // Move time forward 15 minutes + 1 second
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

      const result = checkAccountLockout("testuser");
      expect(result.locked).toBe(false);
    });

    it("should return remaining time while locked", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("testuser");
      }

      // Move time forward 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      const result = checkAccountLockout("testuser");
      expect(result.locked).toBe(true);
      // Should have approximately 10 minutes remaining (600000 ms)
      expect(result.remainingMs).toBeGreaterThan(9 * 60 * 1000);
      expect(result.remainingMs).toBeLessThanOrEqual(10 * 60 * 1000);
    });
  });

  describe("recordFailedAttempt", () => {
    it("should increment count for user", () => {
      recordFailedAttempt("testuser");
      recordFailedAttempt("testuser");

      // User should not be locked yet (only 2 attempts)
      const result = checkAccountLockout("testuser");
      expect(result.locked).toBe(false);
    });

    it("should track different users separately", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("user1");
      }
      recordFailedAttempt("user2");

      expect(checkAccountLockout("user1").locked).toBe(true);
      expect(checkAccountLockout("user2").locked).toBe(false);
    });
  });

  describe("clearFailedAttempts", () => {
    it("should reset failed attempts for user", () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt("testuser");
      }

      clearFailedAttempts("testuser");
      recordFailedAttempt("testuser");

      // Should only have 1 attempt now, not locked
      const result = checkAccountLockout("testuser");
      expect(result.locked).toBe(false);
    });

    it("should be case-insensitive", () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt("TestUser");
      }

      clearFailedAttempts("testuser");

      const result = checkAccountLockout("TESTUSER");
      expect(result.locked).toBe(false);
    });

    it("should not affect other users", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("user1");
        recordFailedAttempt("user2");
      }

      clearFailedAttempts("user1");

      expect(checkAccountLockout("user1").locked).toBe(false);
      expect(checkAccountLockout("user2").locked).toBe(true);
    });
  });
});
