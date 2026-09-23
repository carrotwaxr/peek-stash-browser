import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetForTesting,
  _trackedCountForTesting,
  checkAccountLockout,
  clearFailedAttempts,
  recordFailedAttempt,
} from "../../middleware/accountLockout.js";

const IP = "10.0.0.1";
const LOCKOUT_MS = 15 * 60 * 1000;

const lockOut = (username: string, ip: string) => {
  for (let i = 0; i < 5; i++) {
    recordFailedAttempt(username, ip);
  }
};

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
      const result = checkAccountLockout("unknown", IP);
      expect(result.locked).toBe(false);
    });

    it("should return locked: false for user with few failed attempts", () => {
      recordFailedAttempt("testuser", IP);
      recordFailedAttempt("testuser", IP);
      recordFailedAttempt("testuser", IP);
      const result = checkAccountLockout("testuser", IP);
      expect(result.locked).toBe(false);
    });

    it("should return locked: true after 5 failed attempts", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("testuser", IP);
      }
      const result = checkAccountLockout("testuser", IP);
      expect(result.locked).toBe(true);
      expect(result.remainingMs).toBeGreaterThan(0);
    });

    it("should be case-insensitive for username", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("TestUser", IP);
      }
      const result = checkAccountLockout("testuser", IP);
      expect(result.locked).toBe(true);
    });

    it("should unlock after 15 minutes", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("testuser", IP);
      }

      // Move time forward 15 minutes + 1 second
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

      const result = checkAccountLockout("testuser", IP);
      expect(result.locked).toBe(false);
    });

    it("should return remaining time while locked", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("testuser", IP);
      }

      // Move time forward 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      const result = checkAccountLockout("testuser", IP);
      expect(result.locked).toBe(true);
      // Should have approximately 10 minutes remaining (600000 ms)
      expect(result.remainingMs).toBeGreaterThan(9 * 60 * 1000);
      expect(result.remainingMs).toBeLessThanOrEqual(10 * 60 * 1000);
    });
  });

  describe("recordFailedAttempt", () => {
    it("should increment count for user", () => {
      recordFailedAttempt("testuser", IP);
      recordFailedAttempt("testuser", IP);

      // User should not be locked yet (only 2 attempts)
      const result = checkAccountLockout("testuser", IP);
      expect(result.locked).toBe(false);
    });

    it("should track different users separately", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("user1", IP);
      }
      recordFailedAttempt("user2", IP);

      expect(checkAccountLockout("user1", IP).locked).toBe(true);
      expect(checkAccountLockout("user2", IP).locked).toBe(false);
    });
  });

  describe("clearFailedAttempts", () => {
    it("should reset failed attempts for user", () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt("testuser", IP);
      }

      clearFailedAttempts("testuser", IP);
      recordFailedAttempt("testuser", IP);

      // Should only have 1 attempt now, not locked
      const result = checkAccountLockout("testuser", IP);
      expect(result.locked).toBe(false);
    });

    it("should be case-insensitive", () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt("TestUser", IP);
      }

      clearFailedAttempts("testuser", IP);

      const result = checkAccountLockout("TESTUSER", IP);
      expect(result.locked).toBe(false);
    });

    it("should not affect other users", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("user1", IP);
        recordFailedAttempt("user2", IP);
      }

      clearFailedAttempts("user1", IP);

      expect(checkAccountLockout("user1", IP).locked).toBe(false);
      expect(checkAccountLockout("user2", IP).locked).toBe(true);
    });
  });

  describe("per address", () => {
    it("locks a username only for the address the failures came from", () => {
      lockOut("admin", IP);

      expect(checkAccountLockout("admin", IP).locked).toBe(true);
      expect(checkAccountLockout("admin", "10.0.0.2").locked).toBe(false);
    });

    it("a success from one address does not clear another address's lock", () => {
      lockOut("admin", IP);

      clearFailedAttempts("admin", "10.0.0.2");

      expect(checkAccountLockout("admin", IP).locked).toBe(true);
    });

    it("treats an IPv4-mapped address as its IPv4 form", () => {
      lockOut("admin", "::ffff:10.0.0.1");

      expect(checkAccountLockout("admin", IP).locked).toBe(true);
    });
  });

  describe("record limits", () => {
    it("forgets failures after 15 minutes without another", () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt("testuser", IP);
      }

      vi.advanceTimersByTime(LOCKOUT_MS + 1000);
      recordFailedAttempt("testuser", IP);

      // The earlier four have lapsed, so this is the first of a new count
      expect(checkAccountLockout("testuser", IP).locked).toBe(false);
    });

    it("drops stale records once more than 10,000 are tracked", () => {
      for (let i = 0; i < 10_000; i++) {
        recordFailedAttempt(`user${i}`, IP);
      }
      expect(_trackedCountForTesting()).toBe(10_000);

      vi.advanceTimersByTime(LOCKOUT_MS + 1000);
      recordFailedAttempt("fresh", IP);

      expect(_trackedCountForTesting()).toBe(1);
      expect(checkAccountLockout("fresh", IP).locked).toBe(false);
    });
  });
});
