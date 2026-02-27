/**
 * Unit Tests for Auth Middleware Functions
 *
 * Tests authenticate, authenticateToken, requireAdmin, and requireCacheReady
 * middleware functions with mocked Prisma and StashEntityService.
 * Covers proxy auth flow, JWT token validation, token refresh, role checks,
 * and cache readiness.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: { findUnique: vi.fn() },
  },
}));

// Mock StashEntityService
vi.mock("../../services/StashEntityService.js", () => ({
  stashEntityService: {
    isReady: vi.fn(),
  },
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import {
  authenticate,
  authenticateToken,
  requireAdmin,
  requireCacheReady,
  generateToken,
  setTokenCookie,
} from "../../middleware/auth.js";
import type { Request, Response, NextFunction } from "express";

const mockPrisma = vi.mocked(prisma);
const mockEntityService = vi.mocked(stashEntityService);

const MOCK_USER = {
  id: 1,
  username: "testuser",
  role: "USER",
  preferredQuality: null,
  preferredPlaybackMode: null,
  preferredPreviewQuality: null,
  enableCast: false,
  theme: null,
  hideConfirmationDisabled: false,
  landingPagePreference: null,
  setupCompleted: true,
};

const MOCK_ADMIN = {
  ...MOCK_USER,
  id: 2,
  username: "admin",
  role: "ADMIN",
};

function createMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    cookies: {},
    header: vi.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

function createMockRes(): {
  res: Partial<Response>;
  statusFn: ReturnType<typeof vi.fn>;
  jsonFn: ReturnType<typeof vi.fn>;
  cookieFn: ReturnType<typeof vi.fn>;
} {
  const jsonFn = vi.fn();
  const cookieFn = vi.fn();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  return {
    res: { status: statusFn, json: jsonFn, cookie: cookieFn } as any,
    statusFn,
    jsonFn,
    cookieFn,
  };
}

describe("Auth Middleware", () => {
  let nextFn: ReturnType<typeof vi.fn>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    nextFn = vi.fn();
    // Reset env
    delete process.env.PROXY_AUTH_HEADER;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("authenticateToken", () => {
    it("returns 401 when no token is provided", async () => {
      const req = createMockReq();
      const { res, statusFn, jsonFn } = createMockRes();

      await authenticateToken(req as Request, res as Response, nextFn);

      expect(statusFn).toHaveBeenCalledWith(401);
      expect(jsonFn).toHaveBeenCalledWith({
        error: "Access denied. No token provided.",
      });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("authenticates via cookie token", async () => {
      const token = generateToken({
        id: MOCK_USER.id,
        username: MOCK_USER.username,
        role: MOCK_USER.role,
      });
      const req = createMockReq({ cookies: { token } });
      const { res } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER as any);

      await authenticateToken(req as Request, res as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect((req as any).user.id).toBe(MOCK_USER.id);
      expect((req as any).user.username).toBe(MOCK_USER.username);
    });

    it("authenticates via Authorization Bearer header", async () => {
      const token = generateToken({
        id: MOCK_USER.id,
        username: MOCK_USER.username,
        role: MOCK_USER.role,
      });
      const headerFn = vi.fn((name: string) => {
        if (name === "Authorization") return `Bearer ${token}`;
        return undefined;
      });
      const req = createMockReq({ header: headerFn } as any);
      const { res } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER as any);

      await authenticateToken(req as Request, res as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect((req as any).user.id).toBe(MOCK_USER.id);
    });

    it("returns 401 when token user is not found in database", async () => {
      const token = generateToken({
        id: 999,
        username: "deleted_user",
        role: "USER",
      });
      const req = createMockReq({ cookies: { token } });
      const { res, statusFn, jsonFn } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await authenticateToken(req as Request, res as Response, nextFn);

      expect(statusFn).toHaveBeenCalledWith(401);
      expect(jsonFn).toHaveBeenCalledWith({
        error: "Invalid token. User not found.",
      });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("returns 403 for invalid/tampered token", async () => {
      const req = createMockReq({ cookies: { token: "invalid.jwt.token" } });
      const { res, statusFn, jsonFn } = createMockRes();

      await authenticateToken(req as Request, res as Response, nextFn);

      expect(statusFn).toHaveBeenCalledWith(403);
      expect(jsonFn).toHaveBeenCalledWith({ error: "Invalid token." });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("does not refresh token for Bearer auth (only cookie-based)", async () => {
      // Create a token with a backdated iat (older than 1 hour threshold)
      const jwt = await import("jsonwebtoken");
      const secret =
        process.env.JWT_SECRET || "your-secret-key-change-in-production";
      const twoHoursAgoIat = Math.floor(Date.now() / 1000) - 2 * 3600;
      const token = jwt.default.sign(
        {
          id: MOCK_USER.id,
          username: MOCK_USER.username,
          role: MOCK_USER.role,
          iat: twoHoursAgoIat,
        },
        secret,
        { expiresIn: "24h" }
      );

      const headerFn = vi.fn((name: string) => {
        if (name === "Authorization") return `Bearer ${token}`;
        return undefined;
      });
      // No cookies — Bearer auth
      const req = createMockReq({ cookies: {}, header: headerFn } as any);
      const { res, cookieFn } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER as any);

      await authenticateToken(req as Request, res as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      // Should NOT set a new cookie — Bearer clients don't get cookie refresh
      expect(cookieFn).not.toHaveBeenCalled();
    });

    it("refreshes token when cookie-based and older than 1 hour", async () => {
      const jwt = await import("jsonwebtoken");
      const secret =
        process.env.JWT_SECRET || "your-secret-key-change-in-production";
      const twoHoursAgoIat = Math.floor(Date.now() / 1000) - 2 * 3600;
      const token = jwt.default.sign(
        {
          id: MOCK_USER.id,
          username: MOCK_USER.username,
          role: MOCK_USER.role,
          iat: twoHoursAgoIat,
        },
        secret,
        { expiresIn: "24h" }
      );

      const req = createMockReq({ cookies: { token } });
      const { res, cookieFn } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER as any);

      await authenticateToken(req as Request, res as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      // Should set a new cookie — token is older than 1h threshold
      expect(cookieFn).toHaveBeenCalledWith(
        "token",
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: "strict",
        })
      );
    });

    it("does not refresh fresh cookie token (under 1 hour)", async () => {
      const token = generateToken({
        id: MOCK_USER.id,
        username: MOCK_USER.username,
        role: MOCK_USER.role,
      });
      const req = createMockReq({ cookies: { token } });
      const { res, cookieFn } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER as any);

      await authenticateToken(req as Request, res as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      // Fresh token — no refresh needed
      expect(cookieFn).not.toHaveBeenCalled();
    });
  });

  describe("authenticate", () => {
    it("uses proxy auth when PROXY_AUTH_HEADER is set and header present", async () => {
      process.env.PROXY_AUTH_HEADER = "X-Forwarded-User";
      const headerFn = vi.fn((name: string) => {
        if (name === "X-Forwarded-User") return "testuser";
        return undefined;
      });
      const req = createMockReq({ header: headerFn } as any);
      const { res } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER as any);

      await authenticate(req as Request, res as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect((req as any).user.id).toBe(MOCK_USER.id);
      expect((req as any).user.username).toBe("testuser");
    });

    it("falls back to JWT when proxy header is set but not present in request", async () => {
      process.env.PROXY_AUTH_HEADER = "X-Forwarded-User";
      const headerFn = vi.fn().mockReturnValue(undefined);
      const req = createMockReq({
        header: headerFn,
        cookies: {},
      } as any);
      const { res, statusFn } = createMockRes();

      await authenticate(req as Request, res as Response, nextFn);

      // Falls back to authenticateToken which returns 401 (no token)
      expect(statusFn).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("falls back to JWT when proxy auth user not found in database", async () => {
      process.env.PROXY_AUTH_HEADER = "X-Forwarded-User";
      const headerFn = vi.fn((name: string) => {
        if (name === "X-Forwarded-User") return "unknown_user";
        return undefined;
      });
      const req = createMockReq({
        header: headerFn,
        cookies: {},
      } as any);
      const { res, statusFn } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await authenticate(req as Request, res as Response, nextFn);

      // Falls back to authenticateToken → 401
      expect(statusFn).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("uses JWT auth when PROXY_AUTH_HEADER is not set", async () => {
      delete process.env.PROXY_AUTH_HEADER;
      const token = generateToken({
        id: MOCK_USER.id,
        username: MOCK_USER.username,
        role: MOCK_USER.role,
      });
      const req = createMockReq({ cookies: { token } });
      const { res } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER as any);

      await authenticate(req as Request, res as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect((req as any).user.id).toBe(MOCK_USER.id);
    });
  });

  describe("requireAdmin", () => {
    it("calls next for admin users", () => {
      const req = createMockReq();
      (req as any).user = MOCK_ADMIN;
      const { res } = createMockRes();

      requireAdmin(req as Request, res as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it("returns 403 for non-admin users", () => {
      const req = createMockReq();
      (req as any).user = MOCK_USER;
      const { res, statusFn, jsonFn } = createMockRes();

      requireAdmin(req as Request, res as Response, nextFn);

      expect(statusFn).toHaveBeenCalledWith(403);
      expect(jsonFn).toHaveBeenCalledWith({ error: "Admin access required." });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("returns 403 when user is not set on request", () => {
      const req = createMockReq();
      const { res, statusFn, jsonFn } = createMockRes();

      requireAdmin(req as Request, res as Response, nextFn);

      expect(statusFn).toHaveBeenCalledWith(403);
      expect(jsonFn).toHaveBeenCalledWith({ error: "Admin access required." });
      expect(nextFn).not.toHaveBeenCalled();
    });
  });

  describe("requireCacheReady", () => {
    it("calls next when cache is ready", async () => {
      mockEntityService.isReady.mockResolvedValue(true);
      const req = createMockReq();
      const { res } = createMockRes();

      await requireCacheReady(req as Request, res as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it("returns 503 when cache is not ready", async () => {
      mockEntityService.isReady.mockResolvedValue(false);
      const req = createMockReq();
      const { res, statusFn, jsonFn } = createMockRes();

      await requireCacheReady(req as Request, res as Response, nextFn);

      expect(statusFn).toHaveBeenCalledWith(503);
      expect(jsonFn).toHaveBeenCalledWith({
        error: "Server is initializing",
        message:
          "Cache is still loading. Please wait a moment and try again.",
        ready: false,
      });
      expect(nextFn).not.toHaveBeenCalled();
    });
  });

  describe("setTokenCookie", () => {
    it("sets httpOnly cookie with correct options", () => {
      const { res, cookieFn } = createMockRes();

      const token = generateToken({
        id: 1,
        username: "test",
        role: "USER",
      });
      setTokenCookie(res as Response, token);

      expect(cookieFn).toHaveBeenCalledWith("token", token, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 2 * 60 * 60 * 1000, // 2 hours
      });
    });

    it("sets secure flag when SECURE_COOKIES is true", () => {
      process.env.SECURE_COOKIES = "true";
      const { res, cookieFn } = createMockRes();

      const token = generateToken({
        id: 1,
        username: "test",
        role: "USER",
      });
      setTokenCookie(res as Response, token);

      expect(cookieFn).toHaveBeenCalledWith(
        "token",
        token,
        expect.objectContaining({ secure: true })
      );
    });
  });
});
