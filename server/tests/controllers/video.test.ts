import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  createExternalPlayerLink,
  getCaption,
  proxyStashStream,
} from "../../controllers/video.js";
import prisma from "../../prisma/singleton.js";
import { canUserAccessEntity } from "../../services/EntityAccessService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { logger } from "../../utils/logger.js";
import { isAllowedStreamPath } from "../../utils/stashMediaPath.js";
import {
  deriveStreamLinkKey,
  isStreamLinkSignatureValid,
} from "../../utils/streamLink.js";
import { pipeResponseToClient } from "../../utils/streamProxy.js";

// ---------------------------------------------------------------------------
// Mocks (must come before imports)
// ---------------------------------------------------------------------------

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    get: vi.fn(),
    getBaseUrl: vi.fn().mockReturnValue("http://stash:9999"),
    getApiKey: vi.fn().mockReturnValue("test-api-key"),
    getDefaultConfig: vi.fn().mockReturnValue({ id: "inst-default" }),
  },
}));

vi.mock("../../services/EntityAccessService.js", () => ({
  canUserAccessEntity: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../../utils/jwtSecret.js", () => ({
  getJwtSecret: vi.fn().mockReturnValue("test-secret"),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../utils/streamProxy.js", () => ({
  pipeResponseToClient: vi.fn().mockResolvedValue(undefined),
}));

const mockInstanceManager = vi.mocked(stashInstanceManager);
const mockCanUserAccessEntity = vi.mocked(canUserAccessEntity);
const mockPrisma = vi.mocked(prisma);
const mockPipeResponseToClient = vi.mocked(pipeResponseToClient);

/** Every logger call so far, at any level, as one string. */
const allLogged = () =>
  JSON.stringify(
    (["debug", "info", "warn", "error"] as const).map(
      (level) => vi.mocked(logger[level]).mock.calls
    )
  );

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER = { id: 7, username: "u", role: "USER" };

function createMockReq(overrides = {}) {
  return {
    params: { sceneId: "123", streamPath: "stream.m3u8" },
    query: { instanceId: "inst-a" },
    url: "/api/scene/123/proxy-stream/stream.m3u8?instanceId=inst-a",
    headers: {},
    user: USER,
    body: {},
    ...overrides,
  } as any;
}

function createMockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    headersSent: false,
    on: vi.fn(),
  };
  return res;
}

function makeFetchResponse(
  body: string,
  options: {
    ok?: boolean;
    status?: number;
    contentType?: string;
    cacheControl?: string;
  } = {}
) {
  const {
    ok = true,
    status = 200,
    contentType = "application/vnd.apple.mpegurl",
    cacheControl,
  } = options;
  const headers = new Headers({ "content-type": contentType });
  if (cacheControl) headers.set("cache-control", cacheControl);
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers,
    text: vi.fn().mockResolvedValue(body),
    body: new ReadableStream(),
  };
}

/** Non-tag lines of a rewritten playlist, as [streamPath, subPath] pairs. */
function proxiedPaths(playlist: string): Array<[string, string | undefined]> {
  return playlist
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const afterProxy = line.split("/proxy-stream/")[1] ?? "";
      const [streamPath, subPath] = afterProxy.split("?")[0]!.split("/");
      return [streamPath!, subPath];
    });
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("Video Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // Default: instance exists
    mockInstanceManager.get.mockReturnValue({} as any);
    mockInstanceManager.getBaseUrl.mockReturnValue("http://stash:9999");
    mockInstanceManager.getApiKey.mockReturnValue("test-api-key");
    mockInstanceManager.getDefaultConfig.mockReturnValue({
      id: "inst-default",
    } as any);
    mockCanUserAccessEntity.mockResolvedValue(true);
  });

  // =========================================================================
  // proxyStashStream
  // =========================================================================
  describe("proxyStashStream", () => {
    // -----------------------------------------------------------------------
    // HLS playlist rewriting. Stash 0.31 emits segments as
    // /scene/{id}/stream.m3u8/{n}.ts?resolution=..., absolute or as a path.
    // -----------------------------------------------------------------------
    describe("HLS playlist rewriting", () => {
      it("rewrites absolute Stash URLs, stripping apikey and adding instanceId", async () => {
        const hlsContent = [
          "#EXTM3U",
          "#EXT-X-VERSION:3",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream.m3u8/0.ts?apikey=secret123&resolution=LOW",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream.m3u8/1.ts?ApiKey=secret123",
          "",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const sentContent: string = res.send.mock.calls[0][0];
        const lines = sentContent.split("\n");

        // Absolute URL rewritten to proxy path, apikey stripped, instanceId added
        expect(lines[3]).toBe(
          "/api/scene/123/proxy-stream/stream.m3u8/0.ts?resolution=LOW&instanceId=inst-a"
        );
        expect(lines[5]).toBe(
          "/api/scene/123/proxy-stream/stream.m3u8/1.ts?instanceId=inst-a"
        );
      });

      it("rewrites absolute paths in HLS playlist", async () => {
        const hlsContent = [
          "#EXTM3U",
          "#EXTINF:10.0,",
          "/scene/123/stream.m3u8/0.ts?apikey=secret&resolution=LOW",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const sentContent: string = res.send.mock.calls[0][0];
        const lines = sentContent.split("\n");

        expect(lines[2]).toBe(
          "/api/scene/123/proxy-stream/stream.m3u8/0.ts?resolution=LOW&instanceId=inst-a"
        );
      });

      it("rewrites relative paths in HLS playlist", async () => {
        const hlsContent = [
          "#EXTM3U",
          "#EXTINF:10.0,",
          "stream.m3u8/0.ts?apikey=secret",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const sentContent: string = res.send.mock.calls[0][0];
        const lines = sentContent.split("\n");

        expect(lines[2]).toBe(
          "/api/scene/123/proxy-stream/stream.m3u8/0.ts?instanceId=inst-a"
        );
      });

      it("preserves HLS tags (lines starting with #)", async () => {
        const hlsContent = [
          "#EXTM3U",
          "#EXT-X-VERSION:3",
          "#EXT-X-TARGETDURATION:10",
          "#EXT-X-MEDIA-SEQUENCE:0",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream.m3u8/0.ts?apikey=secret",
          "#EXT-X-ENDLIST",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const sentContent: string = res.send.mock.calls[0][0];
        const lines = sentContent.split("\n");

        expect(lines[0]).toBe("#EXTM3U");
        expect(lines[1]).toBe("#EXT-X-VERSION:3");
        expect(lines[2]).toBe("#EXT-X-TARGETDURATION:10");
        expect(lines[3]).toBe("#EXT-X-MEDIA-SEQUENCE:0");
        expect(lines[4]).toBe("#EXTINF:10.0,");
        expect(lines[6]).toBe("#EXT-X-ENDLIST");
      });

      it("preserves non-apikey query params like resolution", async () => {
        const hlsContent = [
          "#EXTM3U",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream.m3u8/0.ts?apikey=secret&resolution=FULL_HD",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const sentContent: string = res.send.mock.calls[0][0];
        const lines = sentContent.split("\n");

        expect(lines[2]).toContain("resolution=FULL_HD");
        expect(lines[2]).toContain("instanceId=inst-a");
        expect(lines[2]).not.toContain("apikey");
      });

      it("sets content-type to application/vnd.apple.mpegurl for HLS", async () => {
        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse("#EXTM3U\n")
        );

        await proxyStashStream(req, res);

        expect(res.setHeader).toHaveBeenCalledWith(
          "content-type",
          "application/vnd.apple.mpegurl"
        );
      });

      it("strips all case variants of apikey (apikey, ApiKey, APIKEY)", async () => {
        const hlsContent = [
          "#EXTM3U",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream.m3u8/0.ts?apikey=a",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream.m3u8/1.ts?ApiKey=b",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream.m3u8/2.ts?APIKEY=c",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const sentContent: string = res.send.mock.calls[0][0];
        expect(sentContent).not.toMatch(/apikey/i);
        // instanceId should still be present
        expect(sentContent).toContain("instanceId=inst-a");
      });

      it("every URL rewriteHlsPlaylist emits for a Stash manifest passes isAllowedStreamPath", async () => {
        const hlsContent = [
          "#EXTM3U",
          "#EXT-X-VERSION:3",
          "#EXT-X-TARGETDURATION:10",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream.m3u8/0.ts?apikey=secret&resolution=LOW",
          "#EXTINF:10.0,",
          "/scene/123/stream.m3u8/1.ts?apikey=secret&resolution=LOW",
          "#EXTINF:10.0,",
          "stream.m3u8/2.ts?resolution=LOW",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream.m3u8/123456.ts?resolution=LOW",
          "#EXT-X-ENDLIST",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const pairs = proxiedPaths(res.send.mock.calls[0][0]);
        expect(pairs).toHaveLength(4);
        for (const [streamPath, subPath] of pairs) {
          expect(isAllowedStreamPath(streamPath, subPath), streamPath).toBe(
            true
          );
        }
      });
    });

    // -----------------------------------------------------------------------
    // Non-HLS passthrough
    // -----------------------------------------------------------------------
    describe("non-HLS passthrough", () => {
      it("pipes response to client via pipeResponseToClient for non-m3u8 requests", async () => {
        const req = createMockReq({
          params: { sceneId: "123", streamPath: "stream.mp4" },
          url: "/api/scene/123/proxy-stream/stream.mp4?instanceId=inst-a",
        });
        const res = createMockRes();

        const fetchResp = makeFetchResponse("binary data", {
          contentType: "video/mp4",
        });
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fetchResp);

        await proxyStashStream(req, res);

        // cache-control is set by the controller, never copied from Stash
        expect(mockPipeResponseToClient).toHaveBeenCalledWith(
          fetchResp,
          res,
          "[PROXY]",
          [
            "content-type",
            "content-length",
            "accept-ranges",
            "content-range",
            "last-modified",
            "etag",
          ]
        );
      });

      it("forwards range header to Stash", async () => {
        const req = createMockReq({
          params: { sceneId: "123", streamPath: "stream.mp4" },
          url: "/api/scene/123/proxy-stream/stream.mp4?instanceId=inst-a",
          headers: { range: "bytes=0-1024" },
        });
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp4" })
        );

        await proxyStashStream(req, res);

        const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock
          .calls[0];
        expect(fetchCall[1].headers).toEqual(
          expect.objectContaining({ Range: "bytes=0-1024" })
        );
      });
    });

    // -----------------------------------------------------------------------
    // Validation and access
    // -----------------------------------------------------------------------
    describe("validation and access", () => {
      it("returns 400 for the ../../graphql traversal and never fetches", async () => {
        const req = createMockReq({
          params: {
            sceneId: "1",
            streamPath: "../../graphql?query={version{version}}",
          },
          url: "/api/scene/1/proxy-stream/..%2F..%2Fgraphql%3Fquery%3D%7Bversion%7Bversion%7D%7D",
          query: {},
        });
        const res = createMockRes();

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith("Invalid stream path");
        expect(global.fetch).not.toHaveBeenCalled();
        expect(mockCanUserAccessEntity).not.toHaveBeenCalled();
      });

      it("returns 400 for a non-numeric sceneId", async () => {
        const req = createMockReq({
          params: { sceneId: "abc", streamPath: "stream.m3u8" },
        });
        const res = createMockRes();

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it("returns 400 for subPath segment_0.ts under stream", async () => {
        const req = createMockReq({
          params: {
            sceneId: "123",
            streamPath: "stream",
            subPath: "segment_0.ts",
          },
          url: "/api/scene/123/proxy-stream/stream/segment_0.ts?instanceId=inst-a",
        });
        const res = createMockRes();

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it("returns 400 for a malformed instanceId", async () => {
        const req = createMockReq({
          query: { instanceId: "inst a" },
          url: "/api/scene/123/proxy-stream/stream.m3u8?instanceId=inst%20a",
        });
        const res = createMockRes();

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it("returns 404 when canUserAccessEntity is false", async () => {
        mockCanUserAccessEntity.mockResolvedValue(false);
        const req = createMockReq();
        const res = createMockRes();

        await proxyStashStream(req, res);

        expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
          7,
          "scene",
          "123",
          "inst-a"
        );
        expect(res.status).toHaveBeenCalledWith(404);
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it("checks the default instance when instanceId is absent", async () => {
        const req = createMockReq({
          query: {},
          url: "/api/scene/123/proxy-stream/stream.m3u8",
        });
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse("#EXTM3U\n")
        );

        await proxyStashStream(req, createMockRes());

        expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
          7,
          "scene",
          "123",
          "inst-default"
        );
      });

      it("forwards only resolution and start to Stash", async () => {
        const req = createMockReq({
          params: { sceneId: "123", streamPath: "stream.mp4" },
          url: "/api/scene/123/proxy-stream/stream.mp4?resolution=LOW&start=12.5&uid=1&sig=x&foo=bar&instanceId=inst-a",
        });
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp4" })
        );

        await proxyStashStream(req, res);

        const stashUrl: string = (global.fetch as ReturnType<typeof vi.fn>).mock
          .calls[0][0];
        expect(stashUrl).toBe(
          "http://stash:9999/scene/123/stream.mp4?resolution=LOW&start=12.5"
        );
      });

      it("sets private Cache-Control on direct streams and on HLS playlists", async () => {
        // HLS playlist
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse("#EXTM3U\n", { cacheControl: "public, max-age=60" })
        );
        const hlsRes = createMockRes();
        await proxyStashStream(createMockReq(), hlsRes);
        expect(hlsRes.setHeader).toHaveBeenCalledWith(
          "cache-control",
          "private, no-cache"
        );

        // Direct stream with an upstream public value
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse("", {
            contentType: "video/mp4",
            cacheControl: "public, max-age=60",
          })
        );
        const directRes = createMockRes();
        await proxyStashStream(
          createMockReq({
            params: { sceneId: "123", streamPath: "stream" },
            url: "/api/scene/123/proxy-stream/stream?instanceId=inst-a",
          }),
          directRes
        );
        expect(directRes.setHeader).toHaveBeenCalledWith(
          "cache-control",
          "private, max-age=60"
        );
        const forwarded = mockPipeResponseToClient.mock.calls[0]![3];
        expect(forwarded).not.toContain("cache-control");
      });
    });

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------
    describe("error handling", () => {
      it("returns 500 when instance not found", async () => {
        mockInstanceManager.get.mockReturnValue(undefined as any);
        mockInstanceManager.getBaseUrl.mockImplementation((id?: string) => {
          if (id === "bad-inst")
            throw new Error("Stash instance not found: bad-inst");
          return "http://stash:9999";
        });

        const req = createMockReq({
          query: { instanceId: "bad-inst" },
          url: "/api/scene/123/proxy-stream/stream.m3u8?instanceId=bad-inst",
        });
        const res = createMockRes();

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith("Stash not configured");
      });

      it("returns Stash error status when Stash returns non-ok", async () => {
        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: new Headers(),
        });

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.send).toHaveBeenCalledWith("Stash stream error: Not Found");
      });

      it("the stream proxy logs no query string", async () => {
        const req = createMockReq({
          params: { sceneId: "123", streamPath: "stream.mp4" },
          query: { sig: "SECRETSIG", exp: "1" },
          url: "/api/scene/123/proxy-stream/stream.mp4?sig=SECRETSIG&exp=1",
        });
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: new Headers(),
        });

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(allLogged()).toContain("stream.mp4");
        expect(allLogged()).not.toContain("SECRETSIG");
      });

      it("returns 500 and sends error when fetch throws (headers not sent)", async () => {
        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error("Network failure")
        );

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith("Stream proxy failed");
      });

      it("does not send error response when headers already sent", async () => {
        const req = createMockReq();
        const res = createMockRes();
        res.headersSent = true;

        (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error("Network failure")
        );

        await proxyStashStream(req, res);

        // status/send should NOT be called since headersSent is true
        expect(res.status).not.toHaveBeenCalled();
        expect(res.send).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // Miscellaneous behavior
    // -----------------------------------------------------------------------
    describe("URL construction", () => {
      it("removes instanceId from the query forwarded to Stash", async () => {
        const req = createMockReq({
          params: { sceneId: "123", streamPath: "stream.mp4" },
          url: "/api/scene/123/proxy-stream/stream.mp4?instanceId=inst-a&resolution=FULL_HD",
        });
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp4" })
        );

        await proxyStashStream(req, res);

        const stashUrl: string = (global.fetch as ReturnType<typeof vi.fn>).mock
          .calls[0][0];
        expect(stashUrl).not.toContain("instanceId");
        expect(stashUrl).toContain("resolution=FULL_HD");
      });

      it("combines streamPath and subPath for HLS segments", async () => {
        const req = createMockReq({
          params: {
            sceneId: "123",
            streamPath: "stream.m3u8",
            subPath: "0.ts",
          },
          url: "/api/scene/123/proxy-stream/stream.m3u8/0.ts?instanceId=inst-a",
        });
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp2t" })
        );

        await proxyStashStream(req, res);

        const stashUrl: string = (global.fetch as ReturnType<typeof vi.fn>).mock
          .calls[0][0];
        expect(stashUrl).toBe("http://stash:9999/scene/123/stream.m3u8/0.ts");
      });

      it("registers an abort handler on res close", async () => {
        const req = createMockReq({
          params: { sceneId: "123", streamPath: "stream.mp4" },
          url: "/api/scene/123/proxy-stream/stream.mp4?instanceId=inst-a",
        });
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp4" })
        );

        await proxyStashStream(req, res);

        expect(res.on).toHaveBeenCalledWith("close", expect.any(Function));
      });
    });
  });

  // =========================================================================
  // getCaption
  // =========================================================================
  describe("getCaption", () => {
    function captionResponse(body = "WEBVTT\n\n") {
      return {
        ok: true,
        text: vi.fn().mockResolvedValue(body),
        headers: new Headers(),
      };
    }

    it("returns 400 when lang is missing", async () => {
      const req = createMockReq({
        params: { sceneId: "123" },
        query: { type: "srt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith("Missing lang or type parameter");
    });

    it("returns 400 when type is missing", async () => {
      const req = createMockReq({
        params: { sceneId: "123" },
        query: { lang: "en", instanceId: "inst-a" },
      });
      const res = createMockRes();

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith("Missing lang or type parameter");
    });

    it("returns 400 when type is not srt or vtt", async () => {
      const req = createMockReq({
        params: { sceneId: "123" },
        query: { lang: "en", type: "ass", instanceId: "inst-a" },
      });
      const res = createMockRes();

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns 400 for lang with & or =", async () => {
      const req = createMockReq({
        params: { sceneId: "123" },
        query: { lang: "en&admin=1", type: "srt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns 400 for a non-numeric sceneId", async () => {
      const req = createMockReq({
        params: { sceneId: "abc" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns 404 when canUserAccessEntity is false", async () => {
      mockCanUserAccessEntity.mockResolvedValue(false);
      const req = createMockReq({
        params: { sceneId: "456" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      await getCaption(req, res);

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        7,
        "scene",
        "456",
        "inst-a"
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("proxies caption from Stash with correct URL", async () => {
      const req = createMockReq({
        params: { sceneId: "456" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        captionResponse("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello")
      );

      await getCaption(req, res);

      const fetchUrl: string = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(fetchUrl).toBe(
        "http://stash:9999/scene/456/caption?lang=en&type=srt"
      );
    });

    it("caption requests log at debug, not info", async () => {
      const req = createMockReq({
        params: { sceneId: "456" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        captionResponse()
      );

      await getCaption(req, res);

      expect(res.send).toHaveBeenCalledWith("WEBVTT\n\n");
      expect(logger.info).not.toHaveBeenCalled();
      const debugMessages = vi
        .mocked(logger.debug)
        .mock.calls.map(([message]) => message);
      expect(debugMessages).toEqual(
        expect.arrayContaining([
          expect.stringContaining("[CAPTION] Request: scene=456"),
          expect.stringContaining("[CAPTION] Served caption: scene=456"),
        ])
      );
    });

    it("builds the upstream query with URLSearchParams", async () => {
      const req = createMockReq({
        params: { sceneId: "456" },
        query: { lang: "pt-BR", type: "vtt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        captionResponse()
      );

      await getCaption(req, res);

      const fetchUrl: string = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      const url = new URL(fetchUrl);
      expect(url.pathname).toBe("/scene/456/caption");
      expect([...url.searchParams.entries()]).toEqual([
        ["lang", "pt-BR"],
        ["type", "vtt"],
      ]);
    });

    it("sets Content-Type to text/vtt", async () => {
      const req = createMockReq({
        params: { sceneId: "123" },
        query: { lang: "en", type: "vtt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        captionResponse()
      );

      await getCaption(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "text/vtt; charset=utf-8"
      );
    });

    it("sets Cache-Control private, max-age=86400", async () => {
      const req = createMockReq({
        params: { sceneId: "123" },
        query: { lang: "en", type: "vtt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        captionResponse()
      );

      await getCaption(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "private, max-age=86400"
      );
    });

    it("returns Stash error status on non-ok response", async () => {
      const req = createMockReq({
        params: { sceneId: "123" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
      });

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith("Caption not found");
    });

    it("sends API key in ApiKey header, not in the URL", async () => {
      const req = createMockReq({
        params: { sceneId: "123" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        captionResponse()
      );

      await getCaption(req, res);

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const fetchUrl: string = fetchCall[0];
      const fetchOptions = fetchCall[1];

      // API key must be in the header
      expect(fetchOptions.headers).toEqual(
        expect.objectContaining({ ApiKey: "test-api-key" })
      );
      // API key must NOT be in the URL
      expect(fetchUrl).not.toContain("test-api-key");
      expect(fetchUrl).not.toMatch(/apikey/i);
    });

    it("returns 500 when instance not found", async () => {
      mockInstanceManager.get.mockReturnValue(undefined as any);

      const req = createMockReq({
        params: { sceneId: "123" },
        query: { lang: "en", type: "srt", instanceId: "bad-inst" },
      });
      const res = createMockRes();

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith("Stash configuration missing");
    });
  });

  // =========================================================================
  // createExternalPlayerLink
  // =========================================================================
  describe("createExternalPlayerLink", () => {
    const NOW = new Date("2026-09-23T12:00:00Z");
    const PASSWORD_CHANGED_AT = new Date("2026-09-01T00:00:00Z");

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordChangedAt: PASSWORD_CHANGED_AT,
      } as any);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns a direct-stream path carrying uid, exp 12 h ahead and a signature", async () => {
      const req = createMockReq({
        params: { sceneId: "123" },
        query: {},
        body: { instanceId: "inst-a" },
      });
      const res = createMockRes();

      await createExternalPlayerLink(req, res);

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        7,
        "scene",
        "123",
        "inst-a"
      );
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
      expect(res.json).toHaveBeenCalledTimes(1);
      const body = res.json.mock.calls[0][0] as {
        url: string;
        expiresAt: string;
      };
      expect(body.url).toMatch(
        /^\/api\/scene\/123\/proxy-stream\/stream\?instanceId=inst-a&uid=7&exp=1790208000&sig=[A-Za-z0-9_-]{43}$/
      );
      expect(body.expiresAt).toBe("2026-09-24T00:00:00.000Z");

      const sig = new URL(body.url, "http://peek.test").searchParams.get(
        "sig"
      )!;
      expect(
        isStreamLinkSignatureValid(
          {
            userId: 7,
            sceneId: "123",
            instanceId: "inst-a",
            exp: 1790208000,
            passwordChangedAtMs: PASSWORD_CHANGED_AT.getTime(),
          },
          sig,
          deriveStreamLinkKey("test-secret")
        )
      ).toBe(true);
    });

    it("signs passwordChangedAt as 0 for a user who never changed it", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordChangedAt: null,
      } as any);
      const req = createMockReq({
        params: { sceneId: "123" },
        query: {},
        body: { instanceId: "inst-a" },
      });
      const res = createMockRes();

      await createExternalPlayerLink(req, res);

      const body = res.json.mock.calls[0][0] as { url: string };
      const sig = new URL(body.url, "http://peek.test").searchParams.get(
        "sig"
      )!;
      expect(
        isStreamLinkSignatureValid(
          {
            userId: 7,
            sceneId: "123",
            instanceId: "inst-a",
            exp: 1790208000,
            passwordChangedAtMs: 0,
          },
          sig,
          deriveStreamLinkKey("test-secret")
        )
      ).toBe(true);
    });

    it("returns 404 when the user cannot access the scene", async () => {
      mockCanUserAccessEntity.mockResolvedValue(false);
      const req = createMockReq({
        params: { sceneId: "123" },
        query: {},
        body: { instanceId: "inst-a" },
      });
      const res = createMockRes();

      await createExternalPlayerLink(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Not found" });
    });

    it("returns 400 for a non-numeric sceneId or a missing instanceId", async () => {
      const badScene = createMockRes();
      await createExternalPlayerLink(
        createMockReq({
          params: { sceneId: "abc" },
          query: {},
          body: { instanceId: "inst-a" },
        }),
        badScene
      );
      expect(badScene.status).toHaveBeenCalledWith(400);

      const noInstance = createMockRes();
      await createExternalPlayerLink(
        createMockReq({ params: { sceneId: "123" }, query: {}, body: {} }),
        noInstance
      );
      expect(noInstance.status).toHaveBeenCalledWith(400);

      const badInstance = createMockRes();
      await createExternalPlayerLink(
        createMockReq({
          params: { sceneId: "123" },
          query: {},
          body: { instanceId: "inst a" },
        }),
        badInstance
      );
      expect(badInstance.status).toHaveBeenCalledWith(400);

      expect(mockCanUserAccessEntity).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SECURITY
  // =========================================================================
  describe("SECURITY", () => {
    it("sends API key to Stash in ApiKey header, NOT in URL query (proxyStashStream)", async () => {
      const req = createMockReq({
        params: { sceneId: "123", streamPath: "stream.mp4" },
        url: "/api/scene/123/proxy-stream/stream.mp4?instanceId=inst-a",
      });
      const res = createMockRes();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFetchResponse("", { contentType: "video/mp4" })
      );

      await proxyStashStream(req, res);

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const fetchUrl: string = fetchCall[0];
      const fetchOptions = fetchCall[1];

      // API key sent in header
      expect(fetchOptions.headers.ApiKey).toBe("test-api-key");
      // API key NOT in the URL
      expect(fetchUrl).not.toContain("test-api-key");
      expect(fetchUrl).not.toMatch(/apikey/i);
    });

    it("HLS rewritten content never contains apikey in any case variant", async () => {
      // Build a playlist with all apikey case variants
      const hlsContent = [
        "#EXTM3U",
        "#EXTINF:10.0,",
        "http://stash:9999/scene/123/stream.m3u8/0.ts?apikey=LEAK1&resolution=LOW",
        "#EXTINF:10.0,",
        "/scene/123/stream.m3u8/1.ts?ApiKey=LEAK2",
        "#EXTINF:10.0,",
        "stream.m3u8/2.ts?APIKEY=LEAK3&foo=bar",
      ].join("\n");

      const req = createMockReq();
      const res = createMockRes();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFetchResponse(hlsContent)
      );

      await proxyStashStream(req, res);

      const sentContent: string = res.send.mock.calls[0][0];

      // No apikey parameter in any form
      expect(sentContent).not.toMatch(/apikey=/i);
      // No leaked key values
      expect(sentContent).not.toContain("LEAK1");
      expect(sentContent).not.toContain("LEAK2");
      expect(sentContent).not.toContain("LEAK3");
      // But non-apikey params and instanceId are preserved
      expect(sentContent).toContain("resolution=LOW");
      expect(sentContent).toContain("foo=bar");
      expect(sentContent).toContain("instanceId=inst-a");
    });
  });
});
