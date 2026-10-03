/**
 * Unit tests for authenticateStreamRequest (sweep item 2).
 *
 * A stream request without `sig` needs the session like any other route.
 * With `sig`, the link's claims are checked against the user's current
 * passwordChangedAt. A v1 link (no `scope`) opens the direct stream only; a
 * `media` link opens its one scene's direct stream, HLS playlist, segments
 * and captions.
 */
import type { User } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate } from "../../middleware/auth.js";
import {
  authenticateCaptionRequest,
  authenticatePosterRequest,
  authenticateStreamRequest,
} from "../../middleware/streamAuth.js";
import prisma from "../../prisma/singleton.js";
import {
  STREAM_LINK_TTL_SECONDS,
  type StreamLinkClaims,
  deriveStreamLinkKey,
  signStreamLink,
} from "../../utils/streamLink.js";
import { reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

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

const mockPrisma = vi.mocked(prisma, true);
const mockAuthenticate = vi.mocked(authenticate);

const NOW = new Date("2026-09-23T12:00:00Z");
const PASSWORD_CHANGED_AT = new Date("2026-09-01T00:00:00Z");
const KEY = deriveStreamLinkKey("test-secret");

/** The fields the middleware's user lookup selects. */
const DB_USER: User = partialRow({
  id: 7,
  username: "u",
  role: "USER",
  passwordChangedAt: PASSWORD_CHANGED_AT,
});

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
    query?: Record<string, string | string[]>;
  } = {}
) {
  const sig = signStreamLink(claims, KEY);
  return reqFor(authenticateStreamRequest, {
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
  });
}

function createMockRes() {
  return resFor(authenticateStreamRequest);
}

describe("authenticateStreamRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockPrisma.user.findUnique.mockResolvedValue(DB_USER);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delegates to authenticate when the request has no sig", async () => {
    const req = reqFor(authenticateStreamRequest, {
      params: { sceneId: "123", streamPath: "stream.m3u8" },
      query: { instanceId: "inst-a" },
    });
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
    });
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
    mockPrisma.user.findUnique.mockImplementation(
      prismaImpl(({ where }) => (where.id === 7 ? DB_USER : null))
    );
    const goodSig = signStreamLink(claimsFor(), KEY);
    const cases: Array<Record<string, string>> = [
      {
        sig: goodSig.slice(0, -1) + (goodSig.endsWith("A") ? "B" : "A"),
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
    const sig = signStreamLink(claimsFor(), KEY);
    const req = signedReq(claimsFor(), { query: { sig: [sig, sig] } });
    const res = createMockRes();
    const next = vi.fn();

    await authenticateStreamRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  describe("media links", () => {
    const media = (overrides: Partial<StreamLinkClaims> = {}) =>
      claimsFor({ scope: "media", ...overrides });

    function mediaReq(
      claims: StreamLinkClaims,
      overrides: {
        params?: Record<string, string>;
        query?: Record<string, string | string[]>;
      } = {}
    ) {
      return signedReq(claims, {
        ...overrides,
        query: { scope: "media", ...overrides.query },
      });
    }

    it("a v1 link still opens only `stream`", async () => {
      const ok = signedReq(claimsFor());
      const okRes = createMockRes();
      const okNext = vi.fn();
      await authenticateStreamRequest(ok, okRes, okNext);
      expect(okNext).toHaveBeenCalledTimes(1);

      for (const params of [
        { streamPath: "stream.m3u8" },
        { streamPath: "stream.m3u8", subPath: "0.ts" },
        { streamPath: "stream.mp4" },
      ]) {
        const req = signedReq(claimsFor(), { params });
        const res = createMockRes();
        const next = vi.fn();
        await authenticateStreamRequest(req, res, next);
        expect(res.status, JSON.stringify(params)).toHaveBeenCalledWith(401);
        expect(next, JSON.stringify(params)).not.toHaveBeenCalled();
      }
    });

    it("a media link opens `stream`, `stream.m3u8` and `stream.m3u8/<n>.ts`", async () => {
      for (const params of [
        { streamPath: "stream" },
        { streamPath: "stream.m3u8" },
        { streamPath: "stream.m3u8", subPath: "0.ts" },
        { streamPath: "stream.m3u8", subPath: "17.ts" },
      ]) {
        const req = mediaReq(media(), { params });
        const res = createMockRes();
        const next = vi.fn();
        await authenticateStreamRequest(req, res, next);
        expect(next, JSON.stringify(params)).toHaveBeenCalledTimes(1);
        expect(res.status, JSON.stringify(params)).not.toHaveBeenCalled();
        expect(req.user).toEqual({ id: 7, username: "u", role: "USER" });
      }
    });

    it("a media link is refused on `stream.mpd`, `stream.mp4`, `stream.webm` and `stream.mkv` (401)", async () => {
      for (const params of [
        { streamPath: "stream.mpd" },
        { streamPath: "stream.mp4" },
        { streamPath: "stream.webm" },
        { streamPath: "stream.mkv" },
        { streamPath: "stream", subPath: "0.ts" },
      ]) {
        const req = mediaReq(media(), { params });
        const res = createMockRes();
        const next = vi.fn();
        await authenticateStreamRequest(req, res, next);
        expect(res.status, JSON.stringify(params)).toHaveBeenCalledWith(401);
        expect(next, JSON.stringify(params)).not.toHaveBeenCalled();
      }
    });

    it("`scope=` (empty) is 401, not read as v1", async () => {
      // A valid v1 signature, so reading the empty scope as absent would pass
      const req = signedReq(claimsFor(), { query: { scope: "" } });
      const res = createMockRes();
      const next = vi.fn();

      await authenticateStreamRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid stream link" });
      expect(next).not.toHaveBeenCalled();
    });

    it("a repeated `scope` is 401", async () => {
      const req = mediaReq(media(), {
        query: { scope: ["media", "media"] },
      });
      const res = createMockRes();
      const next = vi.fn();

      await authenticateStreamRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid stream link" });
      expect(next).not.toHaveBeenCalled();
    });

    it("an unknown `scope` value is 401", async () => {
      for (const scope of ["MEDIA", "download", "v1", "media "]) {
        const req = mediaReq(media(), { query: { scope } });
        const res = createMockRes();
        const next = vi.fn();
        await authenticateStreamRequest(req, res, next);
        expect(res.status, scope).toHaveBeenCalledWith(401);
        expect(res.json, scope).toHaveBeenCalledWith({
          error: "Invalid stream link",
        });
        expect(next, scope).not.toHaveBeenCalled();
      }
    });

    it("a media link for scene 5 is refused on scene 6, and on scene 5 of another instance", async () => {
      const sig = signStreamLink(media({ sceneId: "5" }), KEY);
      for (const target of [
        { sceneId: "6", instanceId: "inst-a" },
        { sceneId: "5", instanceId: "inst-b" },
      ]) {
        const req = mediaReq(media({ sceneId: "5" }), {
          params: { sceneId: target.sceneId, streamPath: "stream.m3u8" },
          query: { instanceId: target.instanceId, sig },
        });
        const res = createMockRes();
        const next = vi.fn();
        await authenticateStreamRequest(req, res, next);
        expect(res.status, JSON.stringify(target)).toHaveBeenCalledWith(401);
        expect(next, JSON.stringify(target)).not.toHaveBeenCalled();
      }

      // The same link on its own scene and instance passes
      const own = mediaReq(media({ sceneId: "5" }), {
        params: { sceneId: "5", streamPath: "stream.m3u8" },
      });
      const next = vi.fn();
      await authenticateStreamRequest(own, createMockRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("a v1 signature does not pass as a media link, nor the reverse", async () => {
      const v1AsMedia = signedReq(claimsFor(), { query: { scope: "media" } });
      const res = createMockRes();
      await authenticateStreamRequest(v1AsMedia, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(401);

      const mediaSig = signStreamLink(media(), KEY);
      const mediaAsV1 = signedReq(claimsFor(), { query: { sig: mediaSig } });
      const res2 = createMockRes();
      await authenticateStreamRequest(mediaAsV1, res2, vi.fn());
      expect(res2.status).toHaveBeenCalledWith(401);
    });

    it("a media link opens the caption route; a v1 link does not", async () => {
      const claims = media();
      const sig = signStreamLink(claims, KEY);
      const query = {
        lang: "en",
        type: "vtt",
        instanceId: claims.instanceId,
        uid: String(claims.userId),
        exp: String(claims.exp),
        scope: "media",
        sig,
      };
      const req = reqFor(authenticateCaptionRequest, {
        params: { sceneId: claims.sceneId },
        query,
      });
      const res = resFor(authenticateCaptionRequest);
      const next = vi.fn();
      await authenticateCaptionRequest(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toEqual({ id: 7, username: "u", role: "USER" });

      const v1 = claimsFor();
      const v1Req = reqFor(authenticateCaptionRequest, {
        params: { sceneId: v1.sceneId },
        query: {
          lang: "en",
          type: "vtt",
          instanceId: v1.instanceId,
          uid: String(v1.userId),
          exp: String(v1.exp),
          sig: signStreamLink(v1, KEY),
        },
      });
      const v1Res = resFor(authenticateCaptionRequest);
      const v1Next = vi.fn();
      await authenticateCaptionRequest(v1Req, v1Res, v1Next);
      expect(v1Res.status).toHaveBeenCalledWith(401);
      expect(v1Next).not.toHaveBeenCalled();

      // Without sig the caption route needs the session, as before
      const plain = reqFor(authenticateCaptionRequest, {
        params: { sceneId: "123" },
        query: { lang: "en", type: "vtt", instanceId: "inst-a" },
      });
      const plainRes = resFor(authenticateCaptionRequest);
      const plainNext = vi.fn();
      await authenticateCaptionRequest(plain, plainRes, plainNext);
      expect(mockAuthenticate).toHaveBeenCalledWith(plain, plainRes, plainNext);
    });

    it("a media link opens the poster route with no cookie, for its own scene only", async () => {
      const claims = media({ sceneId: "5" });
      const sig = signStreamLink(claims, KEY);
      const posterReq = (sceneId: string, query: Record<string, string> = {}) =>
        reqFor(authenticatePosterRequest, {
          params: { sceneId },
          query: {
            instanceId: claims.instanceId,
            uid: String(claims.userId),
            exp: String(claims.exp),
            scope: "media",
            sig,
            ...query,
          },
        });

      const req = posterReq("5");
      const next = vi.fn();
      await authenticatePosterRequest(
        req,
        resFor(authenticatePosterRequest),
        next
      );
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toEqual({ id: 7, username: "u", role: "USER" });
      expect(mockAuthenticate).not.toHaveBeenCalled();

      // Scene 6's poster, another instance and a tampered scope are 401
      for (const [sceneId, query] of [
        ["6", {}],
        ["5", { instanceId: "inst-b" }],
        ["5", { scope: "other" }],
      ] as const) {
        const bad = posterReq(sceneId, query);
        const res = resFor(authenticatePosterRequest);
        const badNext = vi.fn();
        await authenticatePosterRequest(bad, res, badNext);
        expect(
          res.status,
          JSON.stringify([sceneId, query])
        ).toHaveBeenCalledWith(401);
        expect(badNext).not.toHaveBeenCalled();
      }
    });

    it("a v1 link is refused on the poster route", async () => {
      const v1 = claimsFor({ sceneId: "5" });
      const req = reqFor(authenticatePosterRequest, {
        params: { sceneId: "5" },
        query: {
          instanceId: v1.instanceId,
          uid: String(v1.userId),
          exp: String(v1.exp),
          sig: signStreamLink(v1, KEY),
        },
      });
      const res = resFor(authenticatePosterRequest);
      const next = vi.fn();

      await authenticatePosterRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("the poster route needs the session without sig", async () => {
      const req = reqFor(authenticatePosterRequest, {
        params: { sceneId: "5" },
        query: { instanceId: "inst-a" },
      });
      const res = resFor(authenticatePosterRequest);
      const next = vi.fn();

      await authenticatePosterRequest(req, res, next);

      expect(mockAuthenticate).toHaveBeenCalledWith(req, res, next);
    });

    it("the verified claims are on `res.locals.streamLink`", async () => {
      const claims = media();
      const sig = signStreamLink(claims, KEY);
      const req = mediaReq(claims, { params: { streamPath: "stream.m3u8" } });
      const res = createMockRes();
      const next = vi.fn();

      await authenticateStreamRequest(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.locals.streamLink).toEqual({
        uid: 7,
        exp: claims.exp,
        scope: "media",
        sig,
      });
    });

    it("a session request leaves `res.locals.streamLink` unset", async () => {
      const req = reqFor(authenticateStreamRequest, {
        params: { sceneId: "123", streamPath: "stream.m3u8" },
        query: { instanceId: "inst-a" },
      });
      const res = createMockRes();

      await authenticateStreamRequest(req, res, vi.fn());

      expect(res.locals.streamLink).toBeUndefined();
    });
  });
});
