import { describe, it, expect } from "vitest";
import { validatePassword } from "../../utils/passwordValidation.js";

describe("validatePassword", () => {
  describe("valid passwords", () => {
    it("should accept password with 8+ chars, letter, and number", () => {
      const result = validatePassword("Password1");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept longer passwords", () => {
      const result = validatePassword("MySecurePassword123");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept passwords with special characters", () => {
      const result = validatePassword("P@ssw0rd!");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("length requirement", () => {
    it("should reject password shorter than 8 characters", () => {
      const result = validatePassword("Pass1");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must be at least 8 characters");
    });

    it("should accept password with exactly 8 characters", () => {
      const result = validatePassword("Passwo1d");
      expect(result.valid).toBe(true);
    });
  });

  describe("letter requirement", () => {
    it("should reject password without letters", () => {
      const result = validatePassword("12345678");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one letter");
    });

    it("should accept uppercase-only letters", () => {
      const result = validatePassword("ABCDEFG1");
      expect(result.valid).toBe(true);
    });

    it("should accept lowercase-only letters", () => {
      const result = validatePassword("abcdefg1");
      expect(result.valid).toBe(true);
    });
  });

  describe("number requirement", () => {
    it("should reject password without numbers", () => {
      const result = validatePassword("Password");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one number");
    });
  });

  describe("multiple errors", () => {
    it("should return all applicable errors", () => {
      const result = validatePassword("abc");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must be at least 8 characters");
      expect(result.errors).toContain("Password must contain at least one number");
    });

    it("should return all three errors for empty-like password", () => {
      const result = validatePassword("!@#$");
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });
});
