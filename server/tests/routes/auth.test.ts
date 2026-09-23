/**
 * HTTP tests for the auth routes (sweep item 8): recovery keys are compared by
 * their SHA-256 hash, a recovery-key reset stamps passwordChangedAt, and login
 * issues a token carrying the sign-in time without writing a recovery key.
 * The setup-window `/first-time-password` route is gone (sweep item 7).
 *
 * `authRateLimiter` is module-level and counts failed requests per address, so
 * this file keeps well under its 10 failures.
 */
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import prisma from "../../prisma/singleton.js";
import authRoutes from "../../routes/auth.js";
import {
  formatRecoveryKey,
  generateRecoveryKey,
} from "../../utils/recoveryKey.js";
import { startTestApp } from "../helpers/httpTestApp.js";

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../services/RankingComputeService.js", () => ({
  default: {
    recomputeAllRankings: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

const mockPrisma = vi.mocked(prisma);

// The stored form: SHA-256 hex of the key without dashes, upper case.
const KEY = generateRecoveryKey();
const KEY_HASH = createHash("sha256").update(KEY).digest("hex");
const PASSWORD = "CorrectPass1";

describe("auth routes", () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let fixtureHash: string;

  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    fixtureHash = await bcrypt.hash(PASSWORD, 4);
    ({ baseUrl, close } = await startTestApp((app) => {
      app.use("/api/auth", authRoutes);
    }));
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({} as any);
  });

  describe("POST /forgot-password/reset", () => {
    it("forgot-password/reset accepts the key by its hash and stamps passwordChangedAt", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 7,
        recoveryKeyHash: KEY_HASH,
      } as any);

      const res = await post("/forgot-password/reset", {
        username: "alice",
        recoveryKey: formatRecoveryKey(KEY).toLowerCase(),
        newPassword: "NewPassw0rd",
      });

      expect(res.status).toBe(200);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: {
          password: expect.any(String),
          passwordChangedAt: expect.any(Date),
        },
      });
    });

    it("forgot-password/reset rejects the stored hash used as a key", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 7,
        recoveryKeyHash: KEY_HASH,
      } as any);

      const res = await post("/forgot-password/reset", {
        username: "alice",
        recoveryKey: KEY_HASH,
        newPassword: "NewPassw0rd",
      });

      expect(res.status).toBe(401);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("POST /forgot-password/init", () => {
    it("forgot-password/init reports hasRecoveryKey from the hash column", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 7,
        recoveryKeyHash: KEY_HASH,
      } as any);

      const res = await post("/forgot-password/init", { username: "alice" });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ hasRecoveryKey: true });
    });
  });

  it("POST /api/auth/first-time-password is gone", async () => {
    const res = await post("/first-time-password", {
      username: "admin",
      newPassword: "NewPassw0rd",
    });

    expect(res.status).toBe(404);
  });

  describe("POST /login", () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 7,
        username: "alice",
        password: fixtureHash,
        role: "USER",
        landingPagePreference: null,
        setupCompleted: true,
      } as any);
    });

    it("login no longer writes a recovery key", async () => {
      const res = await post("/login", {
        username: "alice",
        password: PASSWORD,
      });

      expect(res.status).toBe(200);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("login issues a token whose authTime is the sign-in time", async () => {
      const res = await post("/login", {
        username: "alice",
        password: PASSWORD,
      });

      expect(res.status).toBe(200);
      const token = res.headers.get("set-cookie")?.match(/token=([^;]+)/)?.[1];
      expect(token).toBeDefined();
      const claims = jwt.decode(token!) as { authTime?: number };
      const now = Date.now() / 1000;
      expect(claims.authTime).toBeGreaterThan(now - 5);
      expect(claims.authTime).toBeLessThanOrEqual(now + 5);
    });
  });
});
