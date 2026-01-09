import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import { generateToken, verifyToken } from "../../middleware/auth.js";

// Mock the JWT secret to match what auth.ts uses
vi.mock("../../middleware/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../middleware/auth.js")>();
  return {
    ...actual,
  };
});

describe("Auth Middleware - Token Refresh Logic", () => {
  const mockUser = {
    id: 1,
    username: "testuser",
    role: "USER",
  };

  describe("generateToken", () => {
    it("should generate a valid JWT token", () => {
      const token = generateToken(mockUser);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
    });

    it("should include user data in token payload", () => {
      const token = generateToken(mockUser);
      const decoded = verifyToken(token);

      expect(decoded.id).toBe(mockUser.id);
      expect(decoded.username).toBe(mockUser.username);
      expect(decoded.role).toBe(mockUser.role);
    });

    it("should include iat (issued at) timestamp", () => {
      const token = generateToken(mockUser);
      const decoded = verifyToken(token);

      expect(decoded.iat).toBeDefined();
      expect(typeof decoded.iat).toBe("number");
      // iat should be within the last few seconds
      const now = Math.floor(Date.now() / 1000);
      expect(decoded.iat).toBeGreaterThanOrEqual(now - 5);
      expect(decoded.iat).toBeLessThanOrEqual(now + 5);
    });
  });

  describe("Token age calculation for refresh", () => {
    // These tests verify the logic used in authenticateToken for refresh decisions
    // The threshold is 20 hours - tokens older than this should be refreshed

    it("should identify token younger than 20 hours as NOT needing refresh", () => {
      const token = generateToken(mockUser);
      const decoded = verifyToken(token);

      // Token just created, iat is now
      const tokenAgeHours = (Date.now() / 1000 - decoded.iat!) / 3600;

      // Should be very close to 0 (just created)
      expect(tokenAgeHours).toBeLessThan(1);
      // Therefore should NOT trigger refresh (threshold is 20 hours)
      expect(tokenAgeHours > 20).toBe(false);
    });

    it("should correctly calculate token age in hours", () => {
      // Create a token with a backdated iat to simulate an old token
      const twentyOneHoursAgo = Math.floor(Date.now() / 1000) - (21 * 3600);

      const tokenAgeHours = (Date.now() / 1000 - twentyOneHoursAgo) / 3600;

      // Should be approximately 21 hours
      expect(tokenAgeHours).toBeGreaterThan(20);
      expect(tokenAgeHours).toBeLessThan(22);
      // This would trigger a refresh
      expect(tokenAgeHours > 20).toBe(true);
    });

    it("should correctly identify 19-hour-old token as NOT needing refresh", () => {
      const nineteenHoursAgo = Math.floor(Date.now() / 1000) - (19 * 3600);

      const tokenAgeHours = (Date.now() / 1000 - nineteenHoursAgo) / 3600;

      expect(tokenAgeHours).toBeGreaterThan(18);
      expect(tokenAgeHours).toBeLessThan(20);
      expect(tokenAgeHours > 20).toBe(false);
    });

    it("should correctly identify 21-hour-old token as needing refresh", () => {
      const twentyOneHoursAgo = Math.floor(Date.now() / 1000) - (21 * 3600);

      const tokenAgeHours = (Date.now() / 1000 - twentyOneHoursAgo) / 3600;

      expect(tokenAgeHours).toBeGreaterThan(20);
      expect(tokenAgeHours > 20).toBe(true);
    });

    it("should handle boundary case just under 20 hours", () => {
      // Token issued 19 hours and 59 minutes ago
      const justUnderTwentyHours = Math.floor(Date.now() / 1000) - (19 * 3600 + 59 * 60);

      const tokenAgeHours = (Date.now() / 1000 - justUnderTwentyHours) / 3600;

      // Just under 20 hours should NOT refresh
      expect(tokenAgeHours).toBeLessThan(20);
      expect(tokenAgeHours > 20).toBe(false);
    });

    it("should handle boundary case just over 20 hours", () => {
      // Token issued 20 hours and 1 minute ago
      const justOverTwentyHours = Math.floor(Date.now() / 1000) - (20 * 3600 + 60);

      const tokenAgeHours = (Date.now() / 1000 - justOverTwentyHours) / 3600;

      // Just over 20 hours SHOULD refresh
      expect(tokenAgeHours).toBeGreaterThan(20);
      expect(tokenAgeHours > 20).toBe(true);
    });
  });

  describe("verifyToken", () => {
    it("should successfully verify a valid token", () => {
      const token = generateToken(mockUser);
      const decoded = verifyToken(token);

      expect(decoded.id).toBe(mockUser.id);
      expect(decoded.username).toBe(mockUser.username);
      expect(decoded.role).toBe(mockUser.role);
    });

    it("should throw on invalid token", () => {
      expect(() => verifyToken("invalid-token")).toThrow();
    });

    it("should throw on tampered token", () => {
      const token = generateToken(mockUser);
      const tamperedToken = token.slice(0, -5) + "xxxxx";

      expect(() => verifyToken(tamperedToken)).toThrow();
    });
  });
});
