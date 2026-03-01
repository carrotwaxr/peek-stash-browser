import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks (must be before imports)
// =============================================================================

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    stashScene: { findFirst: vi.fn() },
    stashClip: { findFirst: vi.fn() },
    stashImage: { findFirst: vi.fn() },
  },
}));

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    get: vi.fn().mockReturnValue({ id: "inst-a" }),
    getBaseUrl: vi.fn().mockReturnValue("http://stash:9999"),
    getApiKey: vi.fn().mockReturnValue("test-api-key"),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock http and https modules to intercept proxyHttpRequest
vi.mock("http", () => {
  const mockGet = vi.fn();
  return {
    default: { get: mockGet, Agent: vi.fn(() => ({ keepAlive: true })) },
    Agent: vi.fn(() => ({ keepAlive: true })),
  };
});
vi.mock("https", () => {
  const mockGet = vi.fn();
  return {
    default: { get: mockGet, Agent: vi.fn(() => ({ keepAlive: true })) },
    Agent: vi.fn(() => ({ keepAlive: true })),
  };
});

// =============================================================================
// Imports (after mocks)
// =============================================================================

import {
  proxyScenePreview,
  proxySceneWebp,
  proxyStashMedia,
  proxyClipPreview,
  proxyImage,
} from "../../controllers/proxy.js";
import prisma from "../../prisma/singleton.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import http from "http";
import https from "https";

const mockPrisma = vi.mocked(prisma);
const mockInstanceManager = vi.mocked(stashInstanceManager);
const mockHttpGet = vi.mocked(http.get);
const mockHttpsGet = vi.mocked(https.get);

// =============================================================================
// Helpers
// =============================================================================

function createMockReq(overrides = {}) {
  return { params: {}, query: {}, headers: {}, ...overrides } as any;
}

function createMockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    headersSent: false,
    on: vi.fn(),
  };
  return res;
}

/**
 * Sets up http.get to simulate a successful proxied response.
 * The mock fires the proxyRes 'end' event synchronously so that the
 * concurrency slot is released, preventing timeouts from slot exhaustion.
 * Returns the mock proxyReq object for assertions.
 */
function setupHttpGetSuccess() {
  const mockProxyRes: any = {
    headers: { "content-type": "video/mp4", "content-length": "12345" },
    statusCode: 200,
    pipe: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      // Fire 'end' immediately so the concurrency slot is released
      if (event === "end") {
        cb();
      }
    }),
  };

  const mockProxyReq: any = {
    destroyed: false,
    destroy: vi.fn(),
    on: vi.fn(),
    setTimeout: vi.fn(),
  };

  mockHttpGet.mockImplementation((_url: any, _opts: any, callback: any) => {
    callback(mockProxyRes);
    return mockProxyReq;
  });

  // Also set up https.get for https:// URLs
  mockHttpsGet.mockImplementation((_url: any, _opts: any, callback: any) => {
    callback(mockProxyRes);
    return mockProxyReq;
  });

  return { mockProxyReq, mockProxyRes };
}

// =============================================================================
// Tests
// =============================================================================

describe("Proxy Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock return values after clearAllMocks
    mockInstanceManager.get.mockReturnValue({ id: "inst-a" } as any);
    mockInstanceManager.getBaseUrl.mockReturnValue("http://stash:9999");
    mockInstanceManager.getApiKey.mockReturnValue("test-api-key");
  });

  // ===========================================================================
  // proxyStashMedia
  // ===========================================================================

  describe("proxyStashMedia", () => {
    it("returns 400 when path is missing", async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Missing or invalid path parameter",
      });
    });

    it("returns 400 when path does not start with /", async () => {
      const req = createMockReq({ query: { path: "scene/123/preview" } });
      const res = createMockRes();

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid path parameter",
      });
    });

    it("returns 400 when path contains .. (traversal attack)", async () => {
      const req = createMockReq({
        query: { path: "/scene/../../etc/passwd" },
      });
      const res = createMockRes();

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid path parameter",
      });
    });

    it("returns 400 when path contains :// (protocol injection)", async () => {
      const req = createMockReq({
        query: { path: "/redirect?url=http://evil.com" },
      });
      const res = createMockRes();

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid path parameter",
      });
    });

    it("returns 500 when instance credentials fail", async () => {
      mockInstanceManager.get.mockReturnValue(undefined as any);
      mockInstanceManager.getBaseUrl.mockImplementation(() => {
        throw new Error("Stash instance not found: bad-id");
      });

      const req = createMockReq({
        query: { path: "/scene/1/preview", instanceId: "bad-id" },
      });
      const res = createMockRes();

      await proxyStashMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Stash configuration missing",
      });
    });

    it("constructs correct URL and calls proxyHttpRequest for valid path", async () => {
      setupHttpGetSuccess();

      const req = createMockReq({
        query: { path: "/scene/abc/sprite", instanceId: "inst-a" },
      });
      const res = createMockRes();

      await proxyStashMedia(req, res);

      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/scene/abc/sprite?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("appends apikey with & when path already contains query params", async () => {
      setupHttpGetSuccess();

      const req = createMockReq({
        query: { path: "/scene/abc/sprite?t=123" },
      });
      const res = createMockRes();

      await proxyStashMedia(req, res);

      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/scene/abc/sprite?t=123&apikey=test-api-key",
        expect.any(Object),
        expect.any(Function),
      );
    });
  });

  // ===========================================================================
  // proxyScenePreview
  // ===========================================================================

  describe("proxyScenePreview", () => {
    it("returns 400 when id is missing", async () => {
      const req = createMockReq({ params: {} });
      const res = createMockRes();

      await proxyScenePreview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing scene ID" });
    });

    it("returns 404 when scene not found in DB", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(null);

      const req = createMockReq({ params: { id: "nonexistent" } });
      const res = createMockRes();

      await proxyScenePreview(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Scene not found" });
    });

    it("returns 500 when instance credentials fail", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue({
        stashInstanceId: "bad-instance",
      } as any);
      mockInstanceManager.get.mockReturnValue(undefined as any);
      mockInstanceManager.getBaseUrl.mockImplementation((id?: string) => {
        if (id === "bad-instance") throw new Error("Stash instance not found");
        return "http://stash:9999";
      });

      const req = createMockReq({ params: { id: "scene-1" } });
      const res = createMockRes();

      await proxyScenePreview(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Stash configuration missing",
      });
    });

    it("constructs correct Stash URL with preview path", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue({
        stashInstanceId: "inst-a",
      } as any);
      setupHttpGetSuccess();

      const req = createMockReq({ params: { id: "scene-42" } });
      const res = createMockRes();

      await proxyScenePreview(req, res);

      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/scene/scene-42/preview?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("queries prisma with deletedAt: null filter", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(null);

      const req = createMockReq({ params: { id: "scene-1" } });
      const res = createMockRes();

      await proxyScenePreview(req, res);

      expect(mockPrisma.stashScene.findFirst).toHaveBeenCalledWith({
        where: { id: "scene-1", deletedAt: null },
        select: { stashInstanceId: true },
      });
    });
  });

  // ===========================================================================
  // proxySceneWebp
  // ===========================================================================

  describe("proxySceneWebp", () => {
    it("returns 400 when id is missing", async () => {
      const req = createMockReq({ params: {} });
      const res = createMockRes();

      await proxySceneWebp(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing scene ID" });
    });

    it("returns 404 when scene not found in DB", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(null);

      const req = createMockReq({ params: { id: "nonexistent" } });
      const res = createMockRes();

      await proxySceneWebp(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Scene not found" });
    });

    it("constructs correct Stash URL with webp path", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue({
        stashInstanceId: "inst-a",
      } as any);
      setupHttpGetSuccess();

      const req = createMockReq({ params: { id: "scene-7" } });
      const res = createMockRes();

      await proxySceneWebp(req, res);

      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/scene/scene-7/webp?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function),
      );
    });
  });

  // ===========================================================================
  // proxyClipPreview
  // ===========================================================================

  describe("proxyClipPreview", () => {
    it("returns 400 when id is missing", async () => {
      const req = createMockReq({ params: {} });
      const res = createMockRes();

      await proxyClipPreview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing clip ID" });
    });

    it("returns 404 when clip not found in DB", async () => {
      mockPrisma.stashClip.findFirst.mockResolvedValue(null);

      const req = createMockReq({ params: { id: "clip-99" } });
      const res = createMockRes();

      await proxyClipPreview(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Clip preview not found",
      });
    });

    it("returns 404 when clip has no media path (both streamPath and screenshotPath null)", async () => {
      mockPrisma.stashClip.findFirst.mockResolvedValue({
        streamPath: null,
        screenshotPath: null,
        stashInstanceId: "inst-a",
      } as any);

      const req = createMockReq({ params: { id: "clip-1" } });
      const res = createMockRes();

      await proxyClipPreview(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Clip preview not found",
      });
    });

    it("uses streamPath when available", async () => {
      mockPrisma.stashClip.findFirst.mockResolvedValue({
        streamPath: "http://stash:9999/scene/1/stream?start=10&end=30",
        screenshotPath: "http://stash:9999/scene/1/screenshot?t=10",
        stashInstanceId: "inst-a",
      } as any);
      setupHttpGetSuccess();

      const req = createMockReq({ params: { id: "clip-1" } });
      const res = createMockRes();

      await proxyClipPreview(req, res);

      // streamPath already has ?, so apikey appended with &
      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/scene/1/stream?start=10&end=30&apikey=test-api-key",
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("falls back to screenshotPath when streamPath is null", async () => {
      mockPrisma.stashClip.findFirst.mockResolvedValue({
        streamPath: null,
        screenshotPath: "http://stash:9999/scene/1/screenshot",
        stashInstanceId: "inst-a",
      } as any);
      setupHttpGetSuccess();

      const req = createMockReq({ params: { id: "clip-2" } });
      const res = createMockRes();

      await proxyClipPreview(req, res);

      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/scene/1/screenshot?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function),
      );
    });
  });

  // ===========================================================================
  // proxyImage
  // ===========================================================================

  describe("proxyImage", () => {
    it("returns 400 when imageId is missing", async () => {
      const req = createMockReq({ params: { type: "thumbnail" } });
      const res = createMockRes();

      await proxyImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing image ID" });
    });

    it("returns 400 when type is invalid", async () => {
      const req = createMockReq({
        params: { imageId: "img-1", type: "poster" },
      });
      const res = createMockRes();

      await proxyImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid image type. Must be: thumbnail, preview, or image",
      });
    });

    it("returns 400 when type is missing", async () => {
      const req = createMockReq({ params: { imageId: "img-1" } });
      const res = createMockRes();

      await proxyImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid image type. Must be: thumbnail, preview, or image",
      });
    });

    it("returns 404 when image not found", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(null);

      const req = createMockReq({
        params: { imageId: "img-nonexistent", type: "thumbnail" },
      });
      const res = createMockRes();

      await proxyImage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Image not found" });
    });

    it("returns 404 when image path for type is null", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue({
        pathThumbnail: null,
        pathPreview: "/some/path",
        pathImage: "/some/path",
        stashInstanceId: "inst-a",
      } as any);

      const req = createMockReq({
        params: { imageId: "img-1", type: "thumbnail" },
      });
      const res = createMockRes();

      await proxyImage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Image thumbnail path not available",
      });
    });

    it("handles full URL paths (starting with http)", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue({
        pathThumbnail: "http://stash:9999/image/1/thumbnail",
        pathPreview: null,
        pathImage: null,
        stashInstanceId: "inst-a",
      } as any);
      setupHttpGetSuccess();

      const req = createMockReq({
        params: { imageId: "img-1", type: "thumbnail" },
      });
      const res = createMockRes();

      await proxyImage(req, res);

      // Full URL: apikey appended directly (no stashUrl prefix)
      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/image/1/thumbnail?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("handles relative paths (prepends stashUrl)", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue({
        pathThumbnail: null,
        pathPreview: "/image/2/preview",
        pathImage: null,
        stashInstanceId: "inst-a",
      } as any);
      setupHttpGetSuccess();

      const req = createMockReq({
        params: { imageId: "img-2", type: "preview" },
      });
      const res = createMockRes();

      await proxyImage(req, res);

      // Relative path: stashUrl prepended
      expect(mockHttpGet).toHaveBeenCalledWith(
        "http://stash:9999/image/2/preview?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("handles full https URL paths", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue({
        pathThumbnail: null,
        pathPreview: null,
        pathImage: "https://stash-cdn.example.com/image/3/full",
        stashInstanceId: "inst-a",
      } as any);
      setupHttpGetSuccess();

      const req = createMockReq({
        params: { imageId: "img-3", type: "image" },
      });
      const res = createMockRes();

      await proxyImage(req, res);

      // Full https URL: uses https.get, no stashUrl prefix
      expect(mockHttpsGet).toHaveBeenCalledWith(
        "https://stash-cdn.example.com/image/3/full?apikey=test-api-key",
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("queries prisma with deletedAt: null filter and correct select", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(null);

      const req = createMockReq({
        params: { imageId: "img-1", type: "thumbnail" },
      });
      const res = createMockRes();

      await proxyImage(req, res);

      expect(mockPrisma.stashImage.findFirst).toHaveBeenCalledWith({
        where: { id: "img-1", deletedAt: null },
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
        mockInstanceManager.get.mockReturnValue({ id: "inst-a" } as any);
        mockInstanceManager.getBaseUrl.mockReturnValue("http://stash:9999");
        mockInstanceManager.getApiKey.mockReturnValue("test-api-key");
        mockPrisma.stashImage.findFirst.mockResolvedValue(pathData as any);
        setupHttpGetSuccess();

        const req = createMockReq({
          params: { imageId: "img-1", type },
        });
        const res = createMockRes();

        await proxyImage(req, res);

        expect(mockHttpGet).toHaveBeenCalledWith(
          `http://stash:9999${expectedPath}?apikey=test-api-key`,
          expect.any(Object),
          expect.any(Function),
        );
      }
    });

    it("returns 500 when instance credentials fail", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue({
        pathThumbnail: "/thumb",
        pathPreview: null,
        pathImage: null,
        stashInstanceId: "bad-instance",
      } as any);
      mockInstanceManager.getBaseUrl.mockImplementation((id?: string) => {
        if (id === "bad-instance") throw new Error("Stash instance not found");
        return "http://stash:9999";
      });

      const req = createMockReq({
        params: { imageId: "img-1", type: "thumbnail" },
      });
      const res = createMockRes();

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
        "/scene/..%2F..%2Fetc%2Fpasswd", // won't match because raw string has ..
      ];

      for (const path of traversalPaths) {
        if (!path.includes("..")) continue;
        const req = createMockReq({ query: { path } });
        const res = createMockRes();

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
      ];

      for (const path of injectionPaths) {
        const req = createMockReq({ query: { path } });
        const res = createMockRes();

        await proxyStashMedia(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: "Invalid path parameter",
        });
      }
    });

    it("allows valid paths that look similar to attacks but are safe", async () => {
      setupHttpGetSuccess();

      // Single dots are fine, colons without // are fine
      const safePaths = [
        "/scene/file.name.mp4",
        "/image/path/to/file",
      ];

      for (const path of safePaths) {
        vi.clearAllMocks();
        mockInstanceManager.get.mockReturnValue({ id: "inst-a" } as any);
        mockInstanceManager.getBaseUrl.mockReturnValue("http://stash:9999");
        mockInstanceManager.getApiKey.mockReturnValue("test-api-key");
        setupHttpGetSuccess();

        const req = createMockReq({ query: { path } });
        const res = createMockRes();

        await proxyStashMedia(req, res);

        // Should NOT return 400 — http.get should have been called
        expect(mockHttpGet).toHaveBeenCalled();
      }
    });
  });
});
