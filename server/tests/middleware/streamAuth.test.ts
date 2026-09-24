/**
 * Unit tests for authenticateStreamRequest (sweep item 2).
 *
 * A stream request without `sig` needs the session like any other route.
 * With `sig`, the link's claims are checked against the user's current
 * passwordChangedAt and the request is accepted for the direct stream only.
 */
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate } from "../../middleware/auth.js";
import { authenticateStreamRequest } from "../../middleware/streamAuth.js";
import prisma from "../../prisma/singleton.js";
import {
  STREAM_LINK_TTL_SECONDS,
  type StreamLinkClaims,
  deriveStreamLinkKey,
  signStreamLink,
} from "../../utils/streamLink.js";

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../../middleware/auth.js", () => ({
  authenticate: vi.fn((_req: Request, _res: Response, next: NextFunction) =>
    next()
  ),
}));

vi.mock("../../utils/jwtSecret.js", () => ({
  getJwtSecret: vi.fn().mockReturnValue("test-secret"),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma);
const mockAuthenticate = vi.mocked(authenticate);

const NOW = new Date("2026-09-23T12:00:00Z");
const PASSWORD_CHANGED_AT = new Date("2026-09-01T00:00:00Z");
const KEY = deriveStreamLinkKey("test-secret");

const DB_USER = {
  id: 7,
  username: "u",
  role: "USER",
  passwordChangedAt: PASSWORD_CHANGED_AT,
};

function claimsFor(
  overrides: Partial<StreamLinkClaims> = {}
): StreamLinkClaims {
  return {
    userId: 7,
    sceneId: "123",
    instanceId: "inst-a",
    exp: Math.floor(NOW.getTime() / 1000) + STREAM_LINK_TTL_SECONDS,
    passwordChangedAtMs: PASSWORD_CHANGED_AT.getTime(),
    ...overrides,
  };
}

function signedReq(
  claims: StreamLinkClaims,
  overrides: {
    params?: Record<string, string>;
    query?: Record<string, string>;
  } = {}
) {
  const sig = signStreamLink(claims, KEY);
  return {
    params: {
      sceneId: claims.sceneId,
      streamPath: "stream",
      ...overrides.params,
    },
    query: {
      instanceId: claims.instanceId,
      uid: String(claims.userId),
      exp: String(claims.exp),
      sig,
      ...overrides.query,
    },
    headers: {},
    cookies: {},
  } as any;
}

function createMockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

describe("authenticateStreamRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockPrisma.user.findUnique.mockResolvedValue(DB_USER as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delegates to authenticate when the request has no sig", async () => {
    const req = {
      params: { sceneId: "123", streamPath: "stream.m3u8" },
      query: { instanceId: "inst-a" },
      headers: {},
      cookies: {},
    } as any;
    const res = createMockRes();
    const next = vi.fn();

    await authenticateStreamRequest(req, res, next);

    expect(mockAuthenticate).toHaveBeenCalledWith(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("accepts a valid link without a cookie and sets req.user", async () => {
    const req = signedReq(claimsFor());
    const res = createMockRes();
    const next = vi.fn();

    await authenticateStreamRequest(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 7, username: "u", role: "USER" });
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { id: true, username: true, role: true, passwordChangedAt: true },
    });
  });

  it("returns 401 after expiry", async () => {
    const req = signedReq(claimsFor());
    vi.setSystemTime(
      new Date(NOW.getTime() + STREAM_LINK_TTL_SECONDS * 1000 + 1000)
    );
    const res = createMockRes();
    const next = vi.fn();

    await authenticateStreamRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Stream link expired" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the password changed after signing", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...DB_USER,
      passwordChangedAt: new Date("2026-09-23T11:59:00Z"),
    } as any);
    const req = signedReq(claimsFor());
    const res = createMockRes();
    const next = vi.fn();

    await authenticateStreamRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid stream link" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the user no longer exists", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const req = signedReq(claimsFor());
    const res = createMockRes();
    const next = vi.fn();

    await authenticateStreamRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid stream link" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 for a signed request to an HLS path", async () => {
    const req = signedReq(claimsFor(), {
      params: { streamPath: "stream.m3u8" },
    });
    const res = createMockRes();
    const next = vi.fn();

    await authenticateStreamRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Signed links are valid only for the direct stream",
    });
    expect(next).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();

    // A segment under the direct stream name is not the direct stream either
    const segment = signedReq(claimsFor(), {
      params: { streamPath: "stream", subPath: "0.ts" },
    });
    const segmentRes = createMockRes();
    await authenticateStreamRequest(segment, segmentRes, next);
    expect(segmentRes.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 for an exp further ahead than the TTL", async () => {
    const req = signedReq(
      claimsFor({
        exp: Math.floor(NOW.getTime() / 1000) + STREAM_LINK_TTL_SECONDS + 61,
      })
    );
    const res = createMockRes();
    const next = vi.fn();

    await authenticateStreamRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid stream link" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 for a tampered signature or malformed claims", async () => {
    // Only user 7 exists, so a foreign uid finds nobody
    mockPrisma.user.findUnique.mockImplementation((async (args: {
      where: { id: number };
    }) => (args.where.id === 7 ? DB_USER : null)) as any);
    const good = signedReq(claimsFor());
    const cases: Array<Record<string, string>> = [
      {
        sig:
          good.query.sig.slice(0, -1) +
          (good.query.sig.at(-1) === "A" ? "B" : "A"),
      },
      { sig: "short" },
      { uid: "7a" },
      { uid: "8" },
      { exp: "abc" },
      { instanceId: "inst a" },
      { instanceId: "inst-b" },
    ];
    for (const query of cases) {
      const req = signedReq(claimsFor(), { query });
      const res = createMockRes();
      const next = vi.fn();
      await authenticateStreamRequest(req, res, next);
      expect(res.status, JSON.stringify(query)).toHaveBeenCalledWith(401);
      expect(res.json, JSON.stringify(query)).toHaveBeenCalledWith({
        error: "Invalid stream link",
      });
      expect(next, JSON.stringify(query)).not.toHaveBeenCalled();
    }
  });

  it("rejects a sig array without throwing", async () => {
    const req = signedReq(claimsFor());
    req.query.sig = [req.query.sig, req.query.sig];
    const res = createMockRes();
    const next = vi.fn();

    await authenticateStreamRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
