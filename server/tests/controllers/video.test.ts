import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must come before imports
// ---------------------------------------------------------------------------

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    get: vi.fn(),
    getBaseUrl: vi.fn().mockReturnValue("http://stash:9999"),
    getApiKey: vi.fn().mockReturnValue("test-api-key"),
  },
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { proxyStashStream, getCaption } from "../../controllers/video.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { pipeResponseToClient } from "../../utils/streamProxy.js";

const mockInstanceManager = vi.mocked(stashInstanceManager);
const mockPipeResponseToClient = vi.mocked(pipeResponseToClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockReq(overrides = {}) {
  return {
    params: { sceneId: "123", streamPath: "stream.m3u8" },
    query: { instanceId: "inst-a" },
    url: "/api/scene/123/proxy-stream/stream.m3u8?instanceId=inst-a",
    headers: {},
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

function makeFetchResponse(body: string, options: { ok?: boolean; status?: number; contentType?: string } = {}) {
  const { ok = true, status = 200, contentType = "application/vnd.apple.mpegurl" } = options;
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers: new Headers({ "content-type": contentType }),
    text: vi.fn().mockResolvedValue(body),
    body: new ReadableStream(),
  };
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
  });

  // =========================================================================
  // proxyStashStream
  // =========================================================================
  describe("proxyStashStream", () => {
    // -----------------------------------------------------------------------
    // HLS playlist rewriting
    // -----------------------------------------------------------------------
    describe("HLS playlist rewriting", () => {
      it("rewrites absolute Stash URLs, stripping apikey and adding instanceId", async () => {
        const hlsContent = [
          "#EXTM3U",
          "#EXT-X-VERSION:3",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream/segment_0.ts?apikey=secret123&resolution=FULL_HD",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream/segment_1.ts?ApiKey=secret123",
          "",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent),
        );

        await proxyStashStream(req, res);

        const sentContent: string = res.send.mock.calls[0][0];
        const lines = sentContent.split("\n");

        // Absolute URL rewritten to proxy path, apikey stripped, instanceId added
        expect(lines[3]).toBe(
          "/api/scene/123/proxy-stream/stream/segment_0.ts?resolution=FULL_HD&instanceId=inst-a",
        );
        expect(lines[5]).toBe(
          "/api/scene/123/proxy-stream/stream/segment_1.ts?instanceId=inst-a",
        );
      });

      it("rewrites absolute paths in HLS playlist", async () => {
        const hlsContent = [
          "#EXTM3U",
          "#EXTINF:10.0,",
          "/scene/123/stream/segment_0.ts?apikey=secret",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent),
        );

        await proxyStashStream(req, res);

        const sentContent: string = res.send.mock.calls[0][0];
        const lines = sentContent.split("\n");

        expect(lines[2]).toBe(
          "/api/scene/123/proxy-stream/stream/segment_0.ts?instanceId=inst-a",
        );
      });

      it("rewrites relative paths in HLS playlist", async () => {
        const hlsContent = [
          "#EXTM3U",
          "#EXTINF:10.0,",
          "stream/segment_0.ts?apikey=secret",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent),
        );

        await proxyStashStream(req, res);

        const sentContent: string = res.send.mock.calls[0][0];
        const lines = sentContent.split("\n");

        expect(lines[2]).toBe(
          "/api/scene/123/proxy-stream/stream/segment_0.ts?instanceId=inst-a",
        );
      });

      it("preserves HLS tags (lines starting with #)", async () => {
        const hlsContent = [
          "#EXTM3U",
          "#EXT-X-VERSION:3",
          "#EXT-X-TARGETDURATION:10",
          "#EXT-X-MEDIA-SEQUENCE:0",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream/segment_0.ts?apikey=secret",
          "#EXT-X-ENDLIST",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent),
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
          "http://stash:9999/scene/123/stream/segment_0.ts?apikey=secret&resolution=FULL_HD",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent),
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
          makeFetchResponse("#EXTM3U\n"),
        );

        await proxyStashStream(req, res);

        expect(res.setHeader).toHaveBeenCalledWith(
          "content-type",
          "application/vnd.apple.mpegurl",
        );
      });

      it("sets cache-control to no-cache for HLS playlists", async () => {
        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse("#EXTM3U\n"),
        );

        await proxyStashStream(req, res);

        expect(res.setHeader).toHaveBeenCalledWith("cache-control", "no-cache");
      });

      it("strips all case variants of apikey (apikey, ApiKey, APIKEY)", async () => {
        const hlsContent = [
          "#EXTM3U",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream/seg0.ts?apikey=a",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream/seg1.ts?ApiKey=b",
          "#EXTINF:10.0,",
          "http://stash:9999/scene/123/stream/seg2.ts?APIKEY=c",
        ].join("\n");

        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse(hlsContent),
        );

        await proxyStashStream(req, res);

        const sentContent: string = res.send.mock.calls[0][0];
        expect(sentContent).not.toMatch(/apikey/i);
        // instanceId should still be present
        expect(sentContent).toContain("instanceId=inst-a");
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

        expect(mockPipeResponseToClient).toHaveBeenCalledWith(
          fetchResp,
          res,
          "[PROXY]",
          [
            "content-type",
            "content-length",
            "accept-ranges",
            "content-range",
            "cache-control",
            "last-modified",
            "etag",
          ],
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
          makeFetchResponse("", { contentType: "video/mp4" }),
        );

        await proxyStashStream(req, res);

        const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(fetchCall[1].headers).toEqual(
          expect.objectContaining({ Range: "bytes=0-1024" }),
        );
      });
    });

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------
    describe("error handling", () => {
      it("returns 500 when instance not found", async () => {
        mockInstanceManager.get.mockReturnValue(undefined as any);
        // Make getInstanceCredentials throw by simulating missing instance
        mockInstanceManager.getBaseUrl.mockImplementation((id?: string) => {
          if (id === "bad-inst") throw new Error("Stash instance not found: bad-inst");
          return "http://stash:9999";
        });

        // We need to trigger the error path — the controller calls
        // getInstanceCredentials which calls stashInstanceManager.get() and
        // throws if it returns falsy (for non-default instanceId).
        // The actual throw happens inside getInstanceCredentials, so we need
        // to mock .get() to return undefined for the specific instanceId.
        mockInstanceManager.get.mockReturnValue(undefined as any);

        const req = createMockReq({ query: { instanceId: "bad-inst" } });
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

      it("returns 500 and sends error when fetch throws (headers not sent)", async () => {
        const req = createMockReq();
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error("Network failure"),
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
          new Error("Network failure"),
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
          makeFetchResponse("", { contentType: "video/mp4" }),
        );

        await proxyStashStream(req, res);

        const stashUrl: string = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(stashUrl).not.toContain("instanceId");
        expect(stashUrl).toContain("resolution=FULL_HD");
      });

      it("combines streamPath and subPath for HLS segments", async () => {
        const req = createMockReq({
          params: { sceneId: "123", streamPath: "stream", subPath: "segment_0.ts" },
          url: "/api/scene/123/proxy-stream/stream/segment_0.ts?instanceId=inst-a",
        });
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp2t" }),
        );

        await proxyStashStream(req, res);

        const stashUrl: string = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(stashUrl).toBe("http://stash:9999/scene/123/stream/segment_0.ts");
      });

      it("registers an abort handler on res close", async () => {
        const req = createMockReq({
          params: { sceneId: "123", streamPath: "stream.mp4" },
          url: "/api/scene/123/proxy-stream/stream.mp4?instanceId=inst-a",
        });
        const res = createMockRes();

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp4" }),
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

    it("proxies caption from Stash with correct URL", async () => {
      const req = createMockReq({
        params: { sceneId: "456" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello"),
        headers: new Headers(),
      });

      await getCaption(req, res);

      const fetchUrl: string = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(fetchUrl).toBe("http://stash:9999/scene/456/caption?lang=en&type=srt");
    });

    it("sets Content-Type to text/vtt", async () => {
      const req = createMockReq({
        params: { sceneId: "123" },
        query: { lang: "en", type: "vtt", instanceId: "inst-a" },
      });
      const res = createMockRes();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue("WEBVTT\n\n"),
        headers: new Headers(),
      });

      await getCaption(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "text/vtt; charset=utf-8",
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

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue("WEBVTT\n\n"),
        headers: new Headers(),
      });

      await getCaption(req, res);

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const fetchUrl: string = fetchCall[0];
      const fetchOptions = fetchCall[1];

      // API key must be in the header
      expect(fetchOptions.headers).toEqual(
        expect.objectContaining({ ApiKey: "test-api-key" }),
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
        makeFetchResponse("", { contentType: "video/mp4" }),
      );

      await proxyStashStream(req, res);

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
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
        "http://stash:9999/scene/123/stream/seg0.ts?apikey=LEAK1&resolution=720",
        "#EXTINF:10.0,",
        "/scene/123/stream/seg1.ts?ApiKey=LEAK2",
        "#EXTINF:10.0,",
        "stream/seg2.ts?APIKEY=LEAK3&foo=bar",
      ].join("\n");

      const req = createMockReq();
      const res = createMockRes();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFetchResponse(hlsContent),
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
      expect(sentContent).toContain("resolution=720");
      expect(sentContent).toContain("foo=bar");
      expect(sentContent).toContain("instanceId=inst-a");
    });
  });
});
