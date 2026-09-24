import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
// =============================================================================
// Imports (after mocks)
// =============================================================================

import {
  proxyClipPreview,
  proxyImage,
  proxyScenePreview,
  proxySceneWebp,
  proxyStashMedia,
} from "../../controllers/proxy.js";
import prisma from "../../prisma/singleton.js";
import { canUserAccessEntity } from "../../services/EntityAccessService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { stashInstanceRow } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

// =============================================================================
// Mocks (must be before imports)
// =============================================================================

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    get: vi.fn().mockReturnValue({ id: "inst-a" }),
    getBaseUrl: vi.fn().mockReturnValue("http://stash:9999"),
    getApiKey: vi.fn().mockReturnValue("test-api-key"),
    getDefaultConfig: vi.fn().mockReturnValue({ id: "inst-default" }),
  },
}));

vi.mock("../../services/EntityAccessService.js", () => ({
  canUserAccessEntity: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** The parts of the upstream response the proxy reads. */
interface FakeProxyRes {
  headers: Record<string, string>;
  statusCode: number;
  pipe: Mock<(destination: unknown) => void>;
  on: Mock<(event: string, cb: () => void) => void>;
}

/** The parts of the upstream request the proxy calls. */
interface FakeProxyReq {
  destroyed: boolean;
  destroy: Mock<() => void>;
  on: Mock<(event: string, cb: () => void) => void>;
  setTimeout: Mock<(ms: number, cb: () => void) => void>;
}

/** `http.get` and `https.get` as the proxy calls them. */
type FakeGet = (
  url: string,
  options: object,
  callback: (res: FakeProxyRes) => void
) => FakeProxyReq;

const { mockHttpGet, mockHttpsGet } = vi.hoisted(() => ({
  mockHttpGet: vi.fn<FakeGet>(),
  mockHttpsGet: vi.fn<FakeGet>(),
}));

// Mock http and https modules to intercept proxyHttpRequest
vi.mock("http", () => ({
  default: { get: mockHttpGet, Agent: vi.fn(() => ({ keepAlive: true })) },
  Agent: vi.fn(() => ({ keepAlive: true })),
}));
vi.mock("https", () => ({
  default: { get: mockHttpsGet, Agent: vi.fn(() => ({ keepAlive: true })) },
  Agent: vi.fn(() => ({ keepAlive: true })),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockInstanceManager = vi.mocked(stashInstanceManager);
const mockCanUserAccessEntity = vi.mocked(canUserAccessEntity);

// =============================================================================
// Helpers
// =============================================================================

const USER = { id: 7, username: "u", role: "USER" };

/**
 * Sets up http.get to simulate a successful proxied response.
 * The mock fires the proxyRes 'end' event synchronously so that the
 * concurrency slot is released, preventing timeouts from slot exhaustion.
 * Returns the mock proxyReq object for assertions.
 */
function setupHttpGetSuccess(headers: Record<string, string> = {}) {
  const mockProxyRes: FakeProxyRes = {
    headers: {
      "content-type": "video/mp4",
      "content-length": "12345",
      ...headers,
    },
    statusCode: 200,
    pipe: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      // Fire 'end' immediately so the concurrency slot is released
      if (event === "end") {
        cb();
      }
    }),
  };

  const mockProxyReq: FakeProxyReq = {
    destroyed: false,
    destroy: vi.fn(),
    on: vi.fn(),
    setTimeout: vi.fn(),
  };

  mockHttpGet.mockImplementation((_url, _opts, callback) => {
    callback(mockProxyRes);
    return mockProxyReq;
  });

  // Also set up https.get for https:// URLs
  mockHttpsGet.mockImplementation((_url, _opts, callback) => {
    callback(mockProxyRes);
    return mockProxyReq;
  });

  return { mockProxyReq, mockProxyRes };
}

function restoreDefaults() {
  mockInstanceManager.get.mockReturnValue(partialRow({}));
  mockInstanceManager.getBaseUrl.mockReturnValue("http://stash:9999");
  mockInstanceManager.getApiKey.mockReturnValue("test-api-key");
  mockInstanceManager.getDefaultConfig.mockReturnValue(
    stashInstanceRow({ id: "inst-default" })
  );
  mockCanUserAccessEntity.mockResolvedValue(true);
}

// =============================================================================
// Tests
// =============================================================================

describe("Proxy Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock return values after clearAllMocks
    restoreDefaults();
  });

  // ===========================================================================
  // proxyStashMedia
  // ===========================================================================

  describe("proxyStashMedia", () => {
    it("returns 400 when path is missing", async () => {
      const req = reqFor(proxyStashMedia, { query: {}, user: USER });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Missing or invalid path parameter",
      });
    });

    it("returns 400 when path does not start with /", async () => {
      const req = reqFor(proxyStashMedia, {
        query: { path: "scene/123/preview" },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid path parameter",
      });
    });

    it("returns 400 when path contains .. (traversal attack)", async () => {
      const req = reqFor(proxyStashMedia, {
        query: { path: "/scene/../../etc/passwd" },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid path parameter",
      });
    });

    it("returns 400 when path contains :// (protocol injection)", async () => {
      const req = reqFor(proxyStashMedia, {
        query: { path: "/redirect?url=http://evil.com" },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid path parameter",
      });
    });

    it("returns 400 for /graphql?query=... and never calls http.get", async () => {
      setupHttpGetSuccess();
      const req = reqFor(proxyStashMedia, {
        query: { path: "/graphql?query={version{version}}" },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid path parameter",
      });
      expect(mockHttpGet).not.toHaveBeenCalled();
      expect(mockCanUserAccessEntity).not.toHaveBeenCalled();
    });

    it("returns 400 for a hash-keyed sprite path", async () => {
      setupHttpGetSuccess();
      const req = reqFor(proxyStashMedia, {
        query: { path: "/scene/54d60970d229e3a3_sprite.jpg" },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockHttpGet).not.toHaveBeenCalled();
    });

    it("returns 400 for a malformed instanceId", async () => {
      setupHttpGetSuccess();
      const req = reqFor(proxyStashMedia, {
        query: { path: "/scene/1/screenshot", instanceId: "inst a" },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockHttpGet).not.toHaveBeenCalled();
    });

    it("returns 404 when the user cannot access the entity in the path", async () => {
      setupHttpGetSuccess();
      mockCanUserAccessEntity.mockResolvedValue(false);

      const req = reqFor(proxyStashMedia, {
        query: { path: "/performer/5/image", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        7,
        "performer",
        "5",
        "inst-a"
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Not found" });
      expect(mockHttpGet).not.toHaveBeenCalled();

      // Without an instance the default instance is checked
      mockCanUserAccessEntity.mockClear();
      const req2 = reqFor(proxyStashMedia, {
        query: { path: "/performer/5/image" },
        user: USER,
      });
      await proxyStashMedia(req2, resFor(proxyStashMedia));
      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        7,
        "performer",
        "5",
        "inst-default"
      );
    });

    it("checks both the scene and the clip for a scene_marker path", async () => {
      setupHttpGetSuccess();

      const req = reqFor(proxyStashMedia, {
        query: {
          path: "/scene/2587/scene_marker/429/screenshot",
          instanceId: "inst-a",
        },
        user: USER,
      });
      await proxyStashMedia(req, resFor(proxyStashMedia));

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        7,
        "scene",
        "2587",
        "inst-a"
      );
      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        7,
        "clip",
        "429",
        "inst-a"
      );
      expect(mockHttpGet).toHaveBeenCalledTimes(1);

      // Either entity hidden hides the clip media
      for (const hidden of ["scene", "clip"]) {
        mockHttpGet.mockClear();
        mockCanUserAccessEntity.mockImplementation(
          async (_u, entityType) => entityType !== hidden
        );
        const res = resFor(proxyStashMedia);
        await proxyStashMedia(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(mockHttpGet).not.toHaveBeenCalled();
      }
    });

    it("returns 500 when instance credentials fail", async () => {
      mockInstanceManager.get.mockReturnValue(undefined);
      mockInstanceManager.getBaseUrl.mockImplementation(() => {
        throw new Error("Stash instance not found: bad-id");
      });

      const req = reqFor(proxyStashMedia, {
        query: { path: "/scene/1/preview", instanceId: "bad-id" },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Stash configuration missing",
      });
    });

    it("constructs correct URL and calls proxyHttpRequest for valid path", async () => {
      setupHttpGetSuccess();

      const req = reqFor(proxyStashMedia, {
        query: { path: "/scene/12/vtt/sprite", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/scene/12/vtt/sprite?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("appends apikey with & when path already contains query params", async () => {
      setupHttpGetSuccess();

      const req = reqFor(proxyStashMedia, {
        query: { path: "/scene/1/screenshot?t=5" },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/scene/1/screenshot?t=5&apikey=test-api-key",
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("forwards only t and default upstream", async () => {
      setupHttpGetSuccess();

      const req = reqFor(proxyStashMedia, {
        query: {
          path: "/performer/6/image?t=5&apikey=evil&x=1&default=true&redirect=http://evil.test",
        },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/performer/6/image?t=5&default=true&apikey=test-api-key",
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("sets private Cache-Control even when Stash sends public", async () => {
      setupHttpGetSuccess({ "cache-control": "public, max-age=604800" });

      const req = reqFor(proxyStashMedia, {
        query: { path: "/scene/1/screenshot" },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "private, max-age=604800"
      );
    });

    it("forwards nothing and holds no slot once the client has gone", async () => {
      setupHttpGetSuccess();

      // Seven requests whose browser moved on while they waited on the
      // session and access checks: more than the six upstream slots. Each
      // must be dropped without an upstream request, or the slot it takes
      // starves every later request.
      for (let i = 0; i < 7; i++) {
        const res = resFor(proxyStashMedia);
        res.destroyed = true;
        await proxyStashMedia(
          reqFor(proxyStashMedia, {
            query: { path: `/scene/${i + 1}/screenshot` },
            user: USER,
          }),
          res
        );
      }
      expect(mockHttpGet).not.toHaveBeenCalled();

      // A live request still gets a slot afterwards (hangs here if leaked)
      const live = resFor(proxyStashMedia);
      await proxyStashMedia(
        reqFor(proxyStashMedia, {
          query: { path: "/scene/9/screenshot" },
          user: USER,
        }),
        live
      );
      expect(mockHttpGet).toHaveBeenCalledTimes(1);
      expect(live.status).toHaveBeenCalledWith(200);
    });

    it("uses a private, immutable default when Stash sends no Cache-Control", async () => {
      setupHttpGetSuccess();

      const req = reqFor(proxyStashMedia, {
        query: { path: "/scene/1/screenshot" },
        user: USER,
      });
      const res = resFor(proxyStashMedia);

      await proxyStashMedia(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "private, max-age=31536000, immutable"
      );
    });
  });

  // ===========================================================================
  // proxyScenePreview
  // ===========================================================================

  describe("proxyScenePreview", () => {
    it("returns 400 when id is missing", async () => {
      const req = reqFor(proxyScenePreview, {
        params: malformed({}),
        user: USER,
      });
      const res = resFor(proxyScenePreview);

      await proxyScenePreview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing scene ID" });
    });

    it("returns 400 for a non-numeric id", async () => {
      const req = reqFor(proxyScenePreview, {
        params: { id: "scene-1" },
        user: USER,
      });
      const res = resFor(proxyScenePreview);

      await proxyScenePreview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPrisma.stashScene.findFirst).not.toHaveBeenCalled();
    });

    it("returns 404 when scene not found in DB", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(null);

      const req = reqFor(proxyScenePreview, {
        params: { id: "999" },
        user: USER,
      });
      const res = resFor(proxyScenePreview);

      await proxyScenePreview(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Scene not found" });
    });

    it("filters the lookup by instanceId when given", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(null);

      const req = reqFor(proxyScenePreview, {
        params: { id: "1" },
        query: { instanceId: "inst-b" },
        user: USER,
      });
      await proxyScenePreview(req, resFor(proxyScenePreview));

      expect(mockPrisma.stashScene.findFirst).toHaveBeenCalledWith({
        where: { id: "1", deletedAt: null, stashInstanceId: "inst-b" },
        select: { stashInstanceId: true },
      });
    });

    it("returns 404 when canUserAccessEntity is false", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(
        partialRow({
          stashInstanceId: "inst-a",
        })
      );
      mockCanUserAccessEntity.mockResolvedValue(false);
      setupHttpGetSuccess();

      const req = reqFor(proxyScenePreview, {
        params: { id: "42" },
        user: USER,
      });
      const res = resFor(proxyScenePreview);

      await proxyScenePreview(req, res);

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        7,
        "scene",
        "42",
        "inst-a"
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockHttpGet).not.toHaveBeenCalled();
    });

    it("returns 500 when instance credentials fail", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(
        partialRow({
          stashInstanceId: "bad-instance",
        })
      );
      mockInstanceManager.get.mockReturnValue(undefined);
      mockInstanceManager.getBaseUrl.mockImplementation((id?: string) => {
        if (id === "bad-instance") throw new Error("Stash instance not found");
        return "http://stash:9999";
      });

      const req = reqFor(proxyScenePreview, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(proxyScenePreview);

      await proxyScenePreview(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Stash configuration missing",
      });
    });

    it("constructs correct Stash URL with preview path", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(
        partialRow({
          stashInstanceId: "inst-a",
        })
      );
      setupHttpGetSuccess();

      const req = reqFor(proxyScenePreview, {
        params: { id: "42" },
        user: USER,
      });
      const res = resFor(proxyScenePreview);

      await proxyScenePreview(req, res);

      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/scene/42/preview?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("queries prisma with deletedAt: null filter", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(null);

      const req = reqFor(proxyScenePreview, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(proxyScenePreview);

      await proxyScenePreview(req, res);

      expect(mockPrisma.stashScene.findFirst).toHaveBeenCalledWith({
        where: { id: "1", deletedAt: null },
        select: { stashInstanceId: true },
      });
    });
  });

  // ===========================================================================
  // proxySceneWebp
  // ===========================================================================

  describe("proxySceneWebp", () => {
    it("returns 400 when id is missing", async () => {
      const req = reqFor(proxySceneWebp, { params: malformed({}), user: USER });
      const res = resFor(proxySceneWebp);

      await proxySceneWebp(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing scene ID" });
    });

    it("returns 400 for a non-numeric id", async () => {
      const req = reqFor(proxySceneWebp, {
        params: { id: "scene-7" },
        user: USER,
      });
      const res = resFor(proxySceneWebp);

      await proxySceneWebp(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPrisma.stashScene.findFirst).not.toHaveBeenCalled();
    });

    it("returns 404 when scene not found in DB", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(null);

      const req = reqFor(proxySceneWebp, { params: { id: "999" }, user: USER });
      const res = resFor(proxySceneWebp);

      await proxySceneWebp(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Scene not found" });
    });

    it("filters the lookup by instanceId when given", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(null);

      const req = reqFor(proxySceneWebp, {
        params: { id: "7" },
        query: { instanceId: "inst-b" },
        user: USER,
      });
      await proxySceneWebp(req, resFor(proxySceneWebp));

      expect(mockPrisma.stashScene.findFirst).toHaveBeenCalledWith({
        where: { id: "7", deletedAt: null, stashInstanceId: "inst-b" },
        select: { stashInstanceId: true },
      });
    });

    it("returns 404 when canUserAccessEntity is false", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(
        partialRow({
          stashInstanceId: "inst-a",
        })
      );
      mockCanUserAccessEntity.mockResolvedValue(false);
      setupHttpGetSuccess();

      const req = reqFor(proxySceneWebp, { params: { id: "7" }, user: USER });
      const res = resFor(proxySceneWebp);

      await proxySceneWebp(req, res);

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        7,
        "scene",
        "7",
        "inst-a"
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockHttpGet).not.toHaveBeenCalled();
    });

    it("constructs correct Stash URL with webp path", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(
        partialRow({
          stashInstanceId: "inst-a",
        })
      );
      setupHttpGetSuccess();

      const req = reqFor(proxySceneWebp, { params: { id: "7" }, user: USER });
      const res = resFor(proxySceneWebp);

      await proxySceneWebp(req, res);

      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/scene/7/webp?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  // ===========================================================================
  // proxyClipPreview
  // ===========================================================================

  describe("proxyClipPreview", () => {
    it("returns 400 when id is missing", async () => {
      const req = reqFor(proxyClipPreview, {
        params: malformed({}),
        user: USER,
      });
      const res = resFor(proxyClipPreview);

      await proxyClipPreview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing clip ID" });
    });

    it("returns 404 when clip not found in DB", async () => {
      mockPrisma.stashClip.findFirst.mockResolvedValue(null);

      const req = reqFor(proxyClipPreview, {
        params: { id: "99" },
        user: USER,
      });
      const res = resFor(proxyClipPreview);

      await proxyClipPreview(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Clip preview not found",
      });
    });

    it("ignores soft-deleted clips", async () => {
      mockPrisma.stashClip.findFirst.mockResolvedValue(null);

      const req = reqFor(proxyClipPreview, {
        params: { id: "429" },
        user: USER,
      });
      await proxyClipPreview(req, resFor(proxyClipPreview));

      expect(mockPrisma.stashClip.findFirst).toHaveBeenCalledWith({
        where: { id: "429", deletedAt: null },
        select: {
          streamPath: true,
          screenshotPath: true,
          stashInstanceId: true,
        },
      });
    });

    it("filters the lookup by instanceId when given", async () => {
      mockPrisma.stashClip.findFirst.mockResolvedValue(null);

      const req = reqFor(proxyClipPreview, {
        params: { id: "429" },
        query: { instanceId: "inst-b" },
        user: USER,
      });
      await proxyClipPreview(req, resFor(proxyClipPreview));

      expect(mockPrisma.stashClip.findFirst).toHaveBeenCalledWith({
        where: { id: "429", deletedAt: null, stashInstanceId: "inst-b" },
        select: {
          streamPath: true,
          screenshotPath: true,
          stashInstanceId: true,
        },
      });
    });

    it("checks the clip with canUserAccessEntity(userId, 'clip', id, instanceId)", async () => {
      mockPrisma.stashClip.findFirst.mockResolvedValue(
        partialRow({
          streamPath: "http://stash:9999/scene/1/scene_marker/429/stream",
          screenshotPath: null,
          stashInstanceId: "inst-a",
        })
      );
      setupHttpGetSuccess();

      const req = reqFor(proxyClipPreview, {
        params: { id: "429" },
        user: USER,
      });
      await proxyClipPreview(req, resFor(proxyClipPreview));

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        7,
        "clip",
        "429",
        "inst-a"
      );
      expect(mockHttpGet).toHaveBeenCalledTimes(1);

      mockHttpGet.mockClear();
      mockCanUserAccessEntity.mockResolvedValue(false);
      const res = resFor(proxyClipPreview);
      await proxyClipPreview(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockHttpGet).not.toHaveBeenCalled();
    });

    it("returns 404 when clip has no media path (both streamPath and screenshotPath null)", async () => {
      mockPrisma.stashClip.findFirst.mockResolvedValue(
        partialRow({
          streamPath: null,
          screenshotPath: null,
          stashInstanceId: "inst-a",
        })
      );

      const req = reqFor(proxyClipPreview, { params: { id: "1" }, user: USER });
      const res = resFor(proxyClipPreview);

      await proxyClipPreview(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Clip preview not found",
      });
    });

    it("uses streamPath when available", async () => {
      mockPrisma.stashClip.findFirst.mockResolvedValue(
        partialRow({
          streamPath: "http://stash:9999/scene/1/stream?start=10&end=30",
          screenshotPath: "http://stash:9999/scene/1/screenshot?t=10",
          stashInstanceId: "inst-a",
        })
      );
      setupHttpGetSuccess();

      const req = reqFor(proxyClipPreview, { params: { id: "1" }, user: USER });
      const res = resFor(proxyClipPreview);

      await proxyClipPreview(req, res);

      // streamPath already has ?, so apikey appended with &
      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/scene/1/stream?start=10&end=30&apikey=test-api-key",
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("falls back to screenshotPath when streamPath is null", async () => {
      mockPrisma.stashClip.findFirst.mockResolvedValue(
        partialRow({
          streamPath: null,
          screenshotPath: "http://stash:9999/scene/1/screenshot",
          stashInstanceId: "inst-a",
        })
      );
      setupHttpGetSuccess();

      const req = reqFor(proxyClipPreview, { params: { id: "2" }, user: USER });
      const res = resFor(proxyClipPreview);

      await proxyClipPreview(req, res);

      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/scene/1/screenshot?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  // ===========================================================================
  // proxyImage
  // ===========================================================================

  describe("proxyImage", () => {
    it("returns 400 when imageId is missing", async () => {
      const req = reqFor(proxyImage, {
        params: malformed({ type: "thumbnail" }),
        user: USER,
      });
      const res = resFor(proxyImage);

      await proxyImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing image ID" });
    });

    it("returns 400 for a non-numeric id", async () => {
      const req = reqFor(proxyImage, {
        params: { imageId: "img-1", type: "thumbnail" },
        user: USER,
      });
      const res = resFor(proxyImage);

      await proxyImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPrisma.stashImage.findFirst).not.toHaveBeenCalled();
    });

    it("returns 400 when type is invalid", async () => {
      const req = reqFor(proxyImage, {
        params: { imageId: "1", type: "poster" },
        user: USER,
      });
      const res = resFor(proxyImage);

      await proxyImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid image type. Must be: thumbnail, preview, or image",
      });
    });

    it("returns 400 when type is missing", async () => {
      const req = reqFor(proxyImage, {
        params: malformed({ imageId: "1" }),
        user: USER,
      });
      const res = resFor(proxyImage);

      await proxyImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid image type. Must be: thumbnail, preview, or image",
      });
    });

    it("returns 404 when image not found", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(null);

      const req = reqFor(proxyImage, {
        params: { imageId: "999", type: "thumbnail" },
        user: USER,
      });
      const res = resFor(proxyImage);

      await proxyImage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Image not found" });
    });

    it("filters the lookup by instanceId when given", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(null);

      const req = reqFor(proxyImage, {
        params: { imageId: "1", type: "thumbnail" },
        query: { instanceId: "inst-b" },
        user: USER,
      });
      await proxyImage(req, resFor(proxyImage));

      expect(mockPrisma.stashImage.findFirst).toHaveBeenCalledWith({
        where: { id: "1", deletedAt: null, stashInstanceId: "inst-b" },
        select: {
          pathThumbnail: true,
          pathPreview: true,
          pathImage: true,
          stashInstanceId: true,
        },
      });
    });

    it("returns 404 when canUserAccessEntity is false", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(
        partialRow({
          pathThumbnail: "/image/1/thumbnail",
          pathPreview: null,
          pathImage: null,
          stashInstanceId: "inst-a",
        })
      );
      mockCanUserAccessEntity.mockResolvedValue(false);
      setupHttpGetSuccess();

      const req = reqFor(proxyImage, {
        params: { imageId: "1", type: "thumbnail" },
        user: USER,
      });
      const res = resFor(proxyImage);

      await proxyImage(req, res);

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        7,
        "image",
        "1",
        "inst-a"
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockHttpGet).not.toHaveBeenCalled();
    });

    it("returns 404 when image path for type is null", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(
        partialRow({
          pathThumbnail: null,
          pathPreview: "/some/path",
          pathImage: "/some/path",
          stashInstanceId: "inst-a",
        })
      );

      const req = reqFor(proxyImage, {
        params: { imageId: "1", type: "thumbnail" },
        user: USER,
      });
      const res = resFor(proxyImage);

      await proxyImage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Image thumbnail path not available",
      });
    });

    it("handles full URL paths (starting with http)", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(
        partialRow({
          pathThumbnail: "http://stash:9999/image/1/thumbnail",
          pathPreview: null,
          pathImage: null,
          stashInstanceId: "inst-a",
        })
      );
      setupHttpGetSuccess();

      const req = reqFor(proxyImage, {
        params: { imageId: "1", type: "thumbnail" },
        user: USER,
      });
      const res = resFor(proxyImage);

      await proxyImage(req, res);

      // Full URL: apikey appended directly (no stashUrl prefix)
      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/image/1/thumbnail?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("handles relative paths (prepends stashUrl)", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(
        partialRow({
          pathThumbnail: null,
          pathPreview: "/image/2/preview",
          pathImage: null,
          stashInstanceId: "inst-a",
        })
      );
      setupHttpGetSuccess();

      const req = reqFor(proxyImage, {
        params: { imageId: "2", type: "preview" },
        user: USER,
      });
      const res = resFor(proxyImage);

      await proxyImage(req, res);

      // Relative path: stashUrl prepended
      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/image/2/preview?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("handles full https URL paths", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(
        partialRow({
          pathThumbnail: null,
          pathPreview: null,
          pathImage: "https://stash-cdn.example.com/image/3/full",
          stashInstanceId: "inst-a",
        })
      );
      setupHttpGetSuccess();

      const req = reqFor(proxyImage, {
        params: { imageId: "3", type: "image" },
        user: USER,
      });
      const res = resFor(proxyImage);

      await proxyImage(req, res);

      // Full https URL: uses https.get, no stashUrl prefix
      expect(mockHttpsGet).toHaveBeenCalledWith(
        "https://stash-cdn.example.com/image/3/full?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("queries prisma with deletedAt: null filter and correct select", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(null);

      const req = reqFor(proxyImage, {
        params: { imageId: "1", type: "thumbnail" },
        user: USER,
      });
      const res = resFor(proxyImage);

      await proxyImage(req, res);

      expect(mockPrisma.stashImage.findFirst).toHaveBeenCalledWith({
        where: { id: "1", deletedAt: null },
        select: {
          pathThumbnail: true,
          pathPreview: true,
          pathImage: true,
          stashInstanceId: true,
        },
      });
    });

    it("maps each valid type to the correct path field", async () => {
      const pathData = {
        pathThumbnail: "/thumb/path",
        pathPreview: "/preview/path",
        pathImage: "/image/path",
        stashInstanceId: "inst-a",
      };

      const typeMappings = [
        { type: "thumbnail", expectedPath: "/thumb/path" },
        { type: "preview", expectedPath: "/preview/path" },
        { type: "image", expectedPath: "/image/path" },
      ];

      for (const { type, expectedPath } of typeMappings) {
        vi.clearAllMocks();
        restoreDefaults();
        mockPrisma.stashImage.findFirst.mockResolvedValue(partialRow(pathData));
        setupHttpGetSuccess();

        const req = reqFor(proxyImage, {
          params: { imageId: "1", type },
          user: USER,
        });
        const res = resFor(proxyImage);

        await proxyImage(req, res);

        expect(mockHttpGet).toHaveBeenCalledWith(
          `http://stash:9999${expectedPath}?apikey=test-api-key`,
          expect.any(Object),
          expect.any(Function)
        );
      }
    });

    it("returns 500 when instance credentials fail", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(
        partialRow({
          pathThumbnail: "/thumb",
          pathPreview: null,
          pathImage: null,
          stashInstanceId: "bad-instance",
        })
      );
      mockInstanceManager.getBaseUrl.mockImplementation((id?: string) => {
        if (id === "bad-instance") throw new Error("Stash instance not found");
        return "http://stash:9999";
      });

      const req = reqFor(proxyImage, {
        params: { imageId: "1", type: "thumbnail" },
        user: USER,
      });
      const res = resFor(proxyImage);

      await proxyImage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Stash configuration missing",
      });
    });
  });

  // ===========================================================================
  // SECURITY tests
  // ===========================================================================

  describe("Security", () => {
    it("rejects path traversal with .. in proxyStashMedia", async () => {
      const traversalPaths = [
        "/../../etc/passwd",
        "/scene/../../../secrets",
        "/a/b/c/../../..",
        "/scene/1/../../graphql",
        "/performer/1/image/../../graphql",
      ];

      for (const path of traversalPaths) {
        const req = reqFor(proxyStashMedia, { query: { path }, user: USER });
        const res = resFor(proxyStashMedia);

        await proxyStashMedia(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: "Invalid path parameter",
        });
      }
    });

    it("rejects protocol injection with :// in proxyStashMedia", async () => {
      const injectionPaths = [
        "/redirect?target=http://evil.com",
        "/scene/1?redirect=https://attacker.org",
        "/ftp://internal-server/data",
        "//evil.test/scene/1/screenshot",
      ];

      for (const path of injectionPaths) {
        const req = reqFor(proxyStashMedia, { query: { path }, user: USER });
        const res = resFor(proxyStashMedia);

        await proxyStashMedia(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: "Invalid path parameter",
        });
      }
    });

    it("proxies every allowlisted shape", async () => {
      const allowedPaths = [
        "/scene/12/screenshot?t=1780427975",
        "/scene/12/preview",
        "/scene/12/webp",
        "/scene/12/vtt/thumbs",
        "/scene/12/vtt/sprite",
        "/scene/12/vtt/chapter",
        "/scene/2587/scene_marker/429/screenshot",
        "/scene/2587/scene_marker/429/preview",
        "/scene/2587/scene_marker/429/stream",
        "/performer/6225/image?t=1771565524&default=true",
        "/studio/874/image?t=1",
        "/tag/193/image",
        "/group/131/frontimage?t=1&default=true",
        "/group/32/backimage",
        "/gallery/5/cover?t=1761756397",
        "/image/1/thumbnail",
        "/image/1/preview",
        "/image/1/image?t=1",
      ];

      for (const path of allowedPaths) {
        vi.clearAllMocks();
        restoreDefaults();
        setupHttpGetSuccess();

        const req = reqFor(proxyStashMedia, { query: { path }, user: USER });
        const res = resFor(proxyStashMedia);

        await proxyStashMedia(req, res);

        expect(res.status, path).not.toHaveBeenCalledWith(400);
        expect(mockHttpGet, path).toHaveBeenCalledTimes(1);
        const url = must(mockHttpGet.mock.calls[0])[0];
        expect(url.startsWith(`http://stash:9999${path.split("?")[0]}?`)).toBe(
          true
        );
        expect(url.endsWith("apikey=test-api-key")).toBe(true);
      }
    });
  });
});
