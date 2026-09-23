import { describe, expect, it } from "vitest";
import {
  formatRecoveryKey,
  generateRecoveryKey,
  hashRecoveryKey,
  isRecoveryKeyHash,
  normalizeRecoveryKey,
  recoveryKeyMatches,
} from "../../utils/recoveryKey.js";

describe("recoveryKey utils", () => {
  describe("generateRecoveryKey", () => {
    it("generates 28 character key", () => {
      const key = generateRecoveryKey();
      expect(key).toHaveLength(28);
    });

    it("uses only valid characters", () => {
      const key = generateRecoveryKey();
      const validChars = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;
      expect(key).toMatch(validChars);
    });

    it("generates unique keys", () => {
      const keys = new Set();
      for (let i = 0; i < 100; i++) {
        keys.add(generateRecoveryKey());
      }
      expect(keys.size).toBe(100);
    });
  });

  describe("formatRecoveryKey", () => {
    it("formats key with dashes", () => {
      const key = "ABCD1234EFGH5678IJKL9012MNOP";
      expect(formatRecoveryKey(key)).toBe("ABCD-1234-EFGH-5678-IJKL-9012-MNOP");
    });
  });

  describe("normalizeRecoveryKey", () => {
    it("removes dashes and uppercases", () => {
      const input = "abcd-1234-efgh-5678-ijkl-9012-mnop";
      expect(normalizeRecoveryKey(input)).toBe("ABCD1234EFGH5678IJKL9012MNOP");
    });
  });

  describe("hashRecoveryKey", () => {
    it("hashRecoveryKey normalizes dashes and case before hashing", () => {
      expect(hashRecoveryKey("abcd-efgh")).toBe(hashRecoveryKey("ABCDEFGH"));
      expect(hashRecoveryKey("abcd-efgh")).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("recoveryKeyMatches", () => {
    it("recoveryKeyMatches compares against the stored hash", () => {
      const key = generateRecoveryKey();
      const storedHash = hashRecoveryKey(key);

      expect(
        recoveryKeyMatches(formatRecoveryKey(key).toLowerCase(), storedHash)
      ).toBe(true);
      expect(recoveryKeyMatches(generateRecoveryKey(), storedHash)).toBe(false);
      expect(recoveryKeyMatches(storedHash, storedHash)).toBe(false);
    });
  });

  describe("isRecoveryKeyHash", () => {
    it("isRecoveryKeyHash tells hashes from legacy plaintext keys", () => {
      expect(isRecoveryKeyHash(hashRecoveryKey(generateRecoveryKey()))).toBe(
        true
      );
      expect(isRecoveryKeyHash("ABCDEFGHJKMNPQRSTUVWXYZ23456")).toBe(false);
      expect(isRecoveryKeyHash(generateRecoveryKey())).toBe(false);
    });
  });
});
