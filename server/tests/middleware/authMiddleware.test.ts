/**
 * Unit Tests for Auth Middleware Functions
 *
 * Tests authenticate, authenticateToken, requireAdmin, and requireCacheReady
 * middleware functions with mocked Prisma and UserInstanceService.
 * Covers proxy auth flow, JWT token validation, token refresh, role checks,
 * and cache readiness.
 */
import type { User } from "@prisma/client";
import fs from "fs";
import jwt from "jsonwebtoken";
import os from "os";
import path from "path";
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  authenticate,
  authenticateToken,
  generateToken,
  requireAdmin,
  requireCacheReady,
  setTokenCookie,
} from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import {
  _resetJwtSecretForTesting,
  getJwtSecret,
} from "../../utils/jwtSecret.js";
import { _resetLogThrottleForTesting } from "../../utils/logThrottle.js";
import { logger } from "../../utils/logger.js";
import {
  type ReqParts,
  reqFor,
  resFor,
} from "../helpers/controllerTestUtils.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// The instances each user sees (enabled, selected, first sync done)
vi.mock("../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn(),
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

const mockPrisma = vi.mocked(prisma, true);
const mockAllowedInstances = vi.mocked(getUserAllowedInstanceIds);

/** The fields the middleware's user lookup selects. */
const MOCK_USER: User = partialRow({
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
  passwordChangedAt: null,
});

const MOCK_ADMIN: User = {
  ...MOCK_USER,
  id: 2,
  username: "admin",
  role: "ADMIN",
};

/** A request as the auth middleware sees it (every one takes a plain `Request`). */
function createMockReq(parts: ReqParts<typeof authenticate> = {}) {
  return reqFor(authenticate, parts);
}

function createMockRes() {
  const res = resFor(authenticate);
  return { res, statusFn: res.status, jsonFn: res.json, cookieFn: res.cookie };
}

describe("Auth Middleware", () => {
  let nextFn: Mock<() => void>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    nextFn = vi.fn<() => void>();
    // Reset env
    delete process.env.PROXY_AUTH_HEADER;
    delete process.env.PROXY_AUTH_TRUSTED_IPS;
    _resetLogThrottleForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _resetJwtSecretForTesting();
  });

  describe("authenticateToken", () => {
    it("returns 401 when no token is provided", async () => {
      const req = createMockReq();
      const { res, statusFn, jsonFn } = createMockRes();

      await authenticateToken(req, res, nextFn);

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

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

      await authenticateToken(req, res, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(must(req.user).id).toBe(MOCK_USER.id);
      expect(must(req.user).username).toBe(MOCK_USER.username);
    });

    it("authenticates via Authorization Bearer header", async () => {
      const token = generateToken({
        id: MOCK_USER.id,
        username: MOCK_USER.username,
        role: MOCK_USER.role,
      });
      const req = createMockReq({
        headers: { Authorization: `Bearer ${token}` },
      });
      const { res } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

      await authenticateToken(req, res, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(must(req.user).id).toBe(MOCK_USER.id);
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

      await authenticateToken(req, res, nextFn);

      expect(statusFn).toHaveBeenCalledWith(401);
      expect(jsonFn).toHaveBeenCalledWith({
        error: "Invalid token. User not found.",
      });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("returns 403 for invalid/tampered token", async () => {
      const req = createMockReq({ cookies: { token: "invalid.jwt.token" } });
      const { res, statusFn, jsonFn } = createMockRes();

      await authenticateToken(req, res, nextFn);

      expect(statusFn).toHaveBeenCalledWith(403);
      expect(jsonFn).toHaveBeenCalledWith({ error: "Invalid token." });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("does not refresh token for Bearer auth (only cookie-based)", async () => {
      // Create a token with a backdated iat (older than 1 hour threshold)
      const jwt = await import("jsonwebtoken");
      const secret = getJwtSecret();
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

      // No cookies — Bearer auth
      const req = createMockReq({
        cookies: {},
        headers: { Authorization: `Bearer ${token}` },
      });
      const { res, cookieFn } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

      await authenticateToken(req, res, nextFn);

      expect(nextFn).toHaveBeenCalled();
      // Should NOT set a new cookie — Bearer clients don't get cookie refresh
      expect(cookieFn).not.toHaveBeenCalled();
    });

    it("refreshes token when cookie-based and older than 1 hour", async () => {
      const jwt = await import("jsonwebtoken");
      const secret = getJwtSecret();
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

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

      await authenticateToken(req, res, nextFn);

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

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

      await authenticateToken(req, res, nextFn);

      expect(nextFn).toHaveBeenCalled();
      // Fresh token — no refresh needed
      expect(cookieFn).not.toHaveBeenCalled();
    });
  });

  describe("session end on password change", () => {
    const nowSeconds = () => Math.floor(Date.now() / 1000);
    const signToken = (
      claims: Record<string, unknown>,
      secret = getJwtSecret()
    ) =>
      jwt.sign(
        {
          id: MOCK_USER.id,
          username: MOCK_USER.username,
          role: MOCK_USER.role,
          ...claims,
        },
        secret,
        { expiresIn: "24h" }
      );

    it("rejects a token issued before the user's last password change", async () => {
      const token = signToken({ iat: nowSeconds() - 10 });
      const req = createMockReq({ cookies: { token } });
      const { res, statusFn, jsonFn } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        passwordChangedAt: new Date(),
      });

      await authenticateToken(req, res, nextFn);

      expect(statusFn).toHaveBeenCalledWith(401);
      expect(jsonFn).toHaveBeenCalledWith({
        error: "Session expired. Please log in again.",
      });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("accepts a token issued in the same second as the password change", async () => {
      const iat = nowSeconds();
      const token = signToken({ iat });
      const req = createMockReq({ cookies: { token } });
      const { res } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        passwordChangedAt: new Date(iat * 1000 + 999),
      });

      await authenticateToken(req, res, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it("does not put passwordChangedAt on req.user", async () => {
      const passwordChangedAt = new Date((nowSeconds() - 60) * 1000);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        passwordChangedAt,
      });

      // Token path
      const tokenReq = createMockReq({ cookies: { token: signToken({}) } });
      await authenticateToken(tokenReq, createMockRes().res, nextFn);
      expect(must(tokenReq.user).id).toBe(MOCK_USER.id);
      expect(must(tokenReq.user)).not.toHaveProperty("passwordChangedAt");

      // Proxy-header path
      process.env.PROXY_AUTH_HEADER = "X-Forwarded-User";
      const proxyReq = createMockReq({
        headers: { "X-Forwarded-User": "testuser" },
      });
      await authenticate(proxyReq, createMockRes().res, nextFn);
      expect(must(proxyReq.user).id).toBe(MOCK_USER.id);
      expect(must(proxyReq.user)).not.toHaveProperty("passwordChangedAt");
      expect(nextFn).toHaveBeenCalledTimes(2);
    });

    it("rejects a token signed with the old built-in fallback secret", async () => {
      delete process.env.JWT_SECRET;
      const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-jwt-"));
      process.env.CONFIG_DIR = configDir;
      _resetJwtSecretForTesting();

      try {
        const token = signToken({}, "your-secret-key-change-in-production");
        const req = createMockReq({ cookies: { token } });
        const { res, statusFn } = createMockRes();

        mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

        await authenticateToken(req, res, nextFn);

        expect(statusFn).toHaveBeenCalledWith(403);
        expect(nextFn).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(configDir, { recursive: true, force: true });
      }
    });
  });

  describe("30-day session cap", () => {
    const T = new Date("2026-09-23T12:00:00Z");
    const Tsec = Math.floor(T.getTime() / 1000);
    const signToken = (claims: Record<string, unknown>) =>
      jwt.sign(
        {
          id: MOCK_USER.id,
          username: MOCK_USER.username,
          role: MOCK_USER.role,
          ...claims,
        },
        getJwtSecret(),
        { expiresIn: "24h" }
      );
    const refreshedClaims = (
      cookieFn: ReturnType<typeof createMockRes>["cookieFn"]
    ) => {
      expect(cookieFn).toHaveBeenCalledWith(
        "token",
        expect.any(String),
        expect.anything()
      );
      return jwt.decode(must(cookieFn.mock.calls[0])[1]) as {
        authTime?: number;
      };
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(T);
      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("the hourly refresh keeps the original authTime", async () => {
      const token = signToken({
        iat: Tsec - 2 * 3600,
        authTime: Tsec - 5 * 86400,
      });
      const req = createMockReq({ cookies: { token } });
      const { res, cookieFn } = createMockRes();

      await authenticateToken(req, res, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(refreshedClaims(cookieFn).authTime).toBe(Tsec - 5 * 86400);
    });

    it("treats a token without authTime as signed in at iat", async () => {
      const token = signToken({ iat: Tsec - 2 * 3600 });
      const req = createMockReq({ cookies: { token } });
      const { res, cookieFn } = createMockRes();

      await authenticateToken(req, res, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(refreshedClaims(cookieFn).authTime).toBe(Tsec - 2 * 3600);
    });

    it("rejects a session 30 days and one second after sign-in", async () => {
      const token = signToken({ iat: Tsec - 10, authTime: Tsec - 2592001 });
      const req = createMockReq({ cookies: { token } });
      const { res, statusFn, jsonFn } = createMockRes();

      await authenticateToken(req, res, nextFn);

      expect(statusFn).toHaveBeenCalledWith(401);
      expect(jsonFn).toHaveBeenCalledWith({
        error: "Session expired. Please log in again.",
      });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("accepts a session one second short of 30 days", async () => {
      const token = signToken({ iat: Tsec - 10, authTime: Tsec - 2591999 });
      const req = createMockReq({ cookies: { token } });
      const { res } = createMockRes();

      await authenticateToken(req, res, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });
  });

  describe("authenticate", () => {
    it("uses proxy auth when PROXY_AUTH_HEADER is set and header present", async () => {
      process.env.PROXY_AUTH_HEADER = "X-Forwarded-User";
      const req = createMockReq({
        headers: { "X-Forwarded-User": "testuser" },
      });
      const { res } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

      await authenticate(req, res, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(must(req.user).id).toBe(MOCK_USER.id);
      expect(must(req.user).username).toBe("testuser");
    });

    it("falls back to JWT when proxy header is set but not present in request", async () => {
      process.env.PROXY_AUTH_HEADER = "X-Forwarded-User";
      const req = createMockReq({ cookies: {} });
      const { res, statusFn } = createMockRes();

      await authenticate(req, res, nextFn);

      // Falls back to authenticateToken which returns 401 (no token)
      expect(statusFn).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("falls back to JWT when proxy auth user not found in database", async () => {
      process.env.PROXY_AUTH_HEADER = "X-Forwarded-User";
      const req = createMockReq({
        headers: { "X-Forwarded-User": "unknown_user" },
        cookies: {},
      });
      const { res, statusFn } = createMockRes();

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await authenticate(req, res, nextFn);

      // Falls back to authenticateToken → 401
      expect(statusFn).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    describe("proxy auth trusted addresses", () => {
      const HEADER = "X-Forwarded-User";

      /** A request as the bundled nginx forwards it: loopback socket, X-Real-IP set. */
      const proxyReq = (
        username: string,
        realIp: string,
        socketAddress = "127.0.0.1"
      ) => {
        return createMockReq({
          headers: { "x-forwarded-user": username, "x-real-ip": realIp },
          remoteAddress: socketAddress,
          cookies: {},
        });
      };

      const warnMessages = () =>
        vi.mocked(logger.warn).mock.calls.map(([message]) => message);

      beforeEach(() => {
        process.env.PROXY_AUTH_HEADER = HEADER;
      });

      it("honours the header from an address in PROXY_AUTH_TRUSTED_IPS", async () => {
        process.env.PROXY_AUTH_TRUSTED_IPS = "10.0.0.5, 192.168.1.0/24";
        mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);
        const req = proxyReq("testuser", "192.168.1.5");
        const { res } = createMockRes();

        await authenticate(req, res, nextFn);

        expect(nextFn).toHaveBeenCalled();
        expect(must(req.user).username).toBe("testuser");
        expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { username: "testuser" } })
        );
      });

      it("ignores the header from any other address and falls back to cookie auth", async () => {
        process.env.PROXY_AUTH_TRUSTED_IPS = "192.168.1.0/24";
        mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

        for (let i = 0; i < 3; i++) {
          const req = proxyReq("testuser", "10.0.0.9");
          const { res, statusFn } = createMockRes();
          await authenticate(req, res, nextFn);
          expect(statusFn).toHaveBeenCalledWith(401);
        }

        expect(nextFn).not.toHaveBeenCalled();
        expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
        // One warning for three requests, naming the address to add
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(warnMessages()[0]).toBe(
          `Proxy auth: ignored the ${HEADER} header from 10.0.0.9, which is not in PROXY_AUTH_TRUSTED_IPS`
        );
      });

      it("checks the socket address, not X-Real-IP, when the peer is not loopback", async () => {
        process.env.PROXY_AUTH_TRUSTED_IPS = "192.168.1.0/24";
        const req = proxyReq("testuser", "192.168.1.5", "172.18.0.3");
        const { res, statusFn } = createMockRes();

        await authenticate(req, res, nextFn);

        expect(statusFn).toHaveBeenCalledWith(401);
        expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
        expect(warnMessages()[0]).toContain("from 172.18.0.3,");
      });

      it("honours the header from any address when PROXY_AUTH_TRUSTED_IPS is unset", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);
        const req = proxyReq("testuser", "203.0.113.7", "172.18.0.3");
        const { res } = createMockRes();

        await authenticate(req, res, nextFn);

        expect(nextFn).toHaveBeenCalled();
        expect(must(req.user).username).toBe("testuser");
      });

      it("honours the header from no address when PROXY_AUTH_TRUSTED_IPS has an invalid entry", async () => {
        process.env.PROXY_AUTH_TRUSTED_IPS = "192.168.1.0/24, nope";
        mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);
        const req = proxyReq("testuser", "192.168.1.5");
        const { res, statusFn } = createMockRes();

        await authenticate(req, res, nextFn);

        expect(statusFn).toHaveBeenCalledWith(401);
        expect(nextFn).not.toHaveBeenCalled();
        expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      });

      it("warns once per window when the header names an unknown user", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
        try {
          for (let i = 0; i < 2; i++) {
            const { res, statusFn } = createMockRes();
            await authenticate(proxyReq("ghost", "192.168.1.5"), res, nextFn);
            expect(statusFn).toHaveBeenCalledWith(401);
          }
          expect(logger.warn).toHaveBeenCalledTimes(1);
          expect(logger.warn).toHaveBeenCalledWith(
            "Proxy auth: the header names no Peek user",
            { username: "ghost", peer: "192.168.1.5" }
          );

          // Ten minutes later it warns again
          nowSpy.mockReturnValue(1_000_000 + 10 * 60 * 1000);
          const { res } = createMockRes();
          await authenticate(proxyReq("ghost", "192.168.1.5"), res, nextFn);
          expect(logger.warn).toHaveBeenCalledTimes(2);
        } finally {
          nowSpy.mockRestore();
        }
      });

      it("logs the first header sign-in per user at info, with the peer address", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

        for (let i = 0; i < 2; i++) {
          const { res } = createMockRes();
          await authenticate(proxyReq("testuser", "192.168.1.5"), res, nextFn);
        }

        expect(nextFn).toHaveBeenCalledTimes(2);
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(
          "Proxy auth: signed in from header",
          { username: "testuser", peer: "192.168.1.5" }
        );
      });

      it("logs an error and falls back to cookie auth when the user lookup throws", async () => {
        mockPrisma.user.findUnique.mockRejectedValue(new Error("db locked"));
        const req = proxyReq("testuser", "192.168.1.5");
        const { res, statusFn } = createMockRes();

        await authenticate(req, res, nextFn);

        expect(statusFn).toHaveBeenCalledWith(401);
        expect(nextFn).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
          "Proxy auth: user lookup failed",
          expect.objectContaining({ username: "testuser", error: "db locked" })
        );
      });
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

      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

      await authenticate(req, res, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(must(req.user).id).toBe(MOCK_USER.id);
    });
  });

  describe("requireAdmin", () => {
    it("calls next for admin users", () => {
      const req = createMockReq({ user: MOCK_ADMIN });
      const { res } = createMockRes();

      requireAdmin(req, res, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it("returns 403 for non-admin users", () => {
      const req = createMockReq({ user: MOCK_USER });
      const { res, statusFn, jsonFn } = createMockRes();

      requireAdmin(req, res, nextFn);

      expect(statusFn).toHaveBeenCalledWith(403);
      expect(jsonFn).toHaveBeenCalledWith({ error: "Admin access required." });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("returns 403 when user is not set on request", () => {
      const req = createMockReq();
      const { res, statusFn, jsonFn } = createMockRes();

      requireAdmin(req, res, nextFn);

      expect(statusFn).toHaveBeenCalledWith(403);
      expect(jsonFn).toHaveBeenCalledWith({ error: "Admin access required." });
      expect(nextFn).not.toHaveBeenCalled();
    });
  });

  describe("requireCacheReady", () => {
    it("requireCacheReady uses the user's allowed instances", async () => {
      mockAllowedInstances.mockResolvedValue(["inst-a"]);
      const req = createMockReq({ user: MOCK_USER });
      const { res, statusFn } = createMockRes();

      await requireCacheReady(req, res, nextFn);

      expect(mockAllowedInstances).toHaveBeenCalledExactlyOnceWith(
        MOCK_USER.id
      );
      expect(nextFn).toHaveBeenCalledOnce();
      expect(statusFn).not.toHaveBeenCalled();
    });

    it("answers 503 ready:false when none of the user's instances has finished its first sync", async () => {
      // A fresh install, or a user whose every instance is on its first sync
      mockAllowedInstances.mockResolvedValue([]);
      const req = createMockReq({ user: MOCK_ADMIN });
      const { res, statusFn, jsonFn } = createMockRes();

      await requireCacheReady(req, res, nextFn);

      expect(mockAllowedInstances).toHaveBeenCalledExactlyOnceWith(
        MOCK_ADMIN.id
      );
      expect(statusFn).toHaveBeenCalledWith(503);
      expect(jsonFn).toHaveBeenCalledWith({
        error: "Server is initializing",
        message: "Cache is still loading. Please wait a moment and try again.",
        ready: false,
      });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("answers 401 without a signed-in user", async () => {
      const req = createMockReq();
      const { res, statusFn } = createMockRes();

      await requireCacheReady(req, res, nextFn);

      expect(statusFn).toHaveBeenCalledWith(401);
      expect(mockAllowedInstances).not.toHaveBeenCalled();
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
      setTokenCookie(res, token);

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
      setTokenCookie(res, token);

      expect(cookieFn).toHaveBeenCalledWith(
        "token",
        token,
        expect.objectContaining({ secure: true })
      );
    });
  });
});
