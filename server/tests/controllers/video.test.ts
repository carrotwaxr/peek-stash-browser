import type { StashInstance } from "@prisma/client";
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
import {
  type MockRes,
  type ReqParts,
  malformed,
  reqFor,
  resFor,
} from "../helpers/controllerTestUtils.js";
import { stashInstanceRow } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

// ---------------------------------------------------------------------------
// Mocks (must come before imports)
// ---------------------------------------------------------------------------

vi.mock("../../services/EntityAccessService.js", () => ({
  canUserAccessEntity: vi.fn().mockResolvedValue(true),
}));

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

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

const mockCanUserAccessEntity = vi.mocked(canUserAccessEntity);
const mockPrisma = vi.mocked(prisma, true);
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

/**
 * Load `rows` into the real instance manager, as its database query returns
 * them (enabled instances, in priority order).
 */
async function loadInstances(...rows: StashInstance[]): Promise<void> {
  mockPrisma.stashInstance.findMany.mockResolvedValue(rows);
  await stashInstanceManager.reload();
}

/**
 * The owner's instance id is literally "default". Here another instance has
 * the top priority, so "the default instance" and the instance named
 * "default" differ.
 */
const TOP_PRIORITY = stashInstanceRow({
  id: "b",
  priority: 0,
  url: "http://stash-b:9999/graphql",
  apiKey: "key-b",
});
const NAMED_DEFAULT = stashInstanceRow({
  id: "default",
  priority: 5,
  url: "http://stash-default:9999/graphql",
  apiKey: "key-default",
});

/** A request for the scene's HLS playlist; `parts` replace the defaults. */
function createMockReq(parts: ReqParts<typeof proxyStashStream> = {}) {
  return reqFor(proxyStashStream, {
    params: { sceneId: "123", streamPath: "stream.m3u8" },
    query: { instanceId: "inst-a" },
    url: "/api/scene/123/proxy-stream/stream.m3u8?instanceId=inst-a",
    user: USER,
    ...parts,
  });
}

/** What the handler passed to its first `res.send()`, as text. */
function sentText(res: MockRes<unknown>): string {
  const body = must(res.send.mock.calls[0], "a res.send call")[0];
  if (typeof body !== "string") throw new Error("expected a text body");
  return body;
}

function makeFetchResponse(
  body: string,
  options: { contentType?: string; cacheControl?: string } = {}
): Response {
  const { contentType = "application/vnd.apple.mpegurl", cacheControl } =
    options;
  const headers = new Headers({ "content-type": contentType });
  if (cacheControl) headers.set("cache-control", cacheControl);
  return new Response(body, { status: 200, statusText: "OK", headers });
}

/** The URL of the first fetch to Stash; the controller passes a string. */
function fetchedUrl(): string {
  const url = must(vi.mocked(global.fetch).mock.calls[0], "a fetch call")[0];
  if (typeof url !== "string") throw new Error("expected a string URL");
  return url;
}

/** The headers of the first fetch to Stash; the controller passes an object. */
function fetchedHeaders(): Record<string, string> {
  const init = must(vi.mocked(global.fetch).mock.calls[0], "a fetch call")[1];
  const headers = init?.headers;
  if (!headers || Array.isArray(headers) || headers instanceof Headers) {
    throw new Error("expected fetch headers as a plain object");
  }
  return headers;
}

/** Non-tag lines of a rewritten playlist, as [streamPath, subPath] pairs. */
function proxiedPaths(playlist: string): Array<[string, string | undefined]> {
  return playlist
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const afterProxy = line.split("/proxy-stream/")[1] ?? "";
      const [streamPath, subPath] = must(afterProxy.split("?")[0]).split("/");
      return [must(streamPath), subPath];
    });
}

/** The playlist proxyStashStream sends for an upstream HLS body. */
async function rewrittenPlaylist(upstream: string): Promise<string> {
  vi.mocked(global.fetch).mockResolvedValue(makeFetchResponse(upstream));
  const res = resFor(proxyStashStream);
  await proxyStashStream(createMockReq(), res);
  return sentText(res);
}

/** A request for the scene's DASH manifest. */
function createMpdReq(overrides: ReqParts<typeof proxyStashStream> = {}) {
  return createMockReq({
    params: { sceneId: "123", streamPath: "stream.mpd" },
    url: "/api/scene/123/proxy-stream/stream.mpd?resolution=LOW&instanceId=inst-a",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("Video Controller", () => {
  beforeEach(async () => {
    global.fetch = vi.fn();
    // Two enabled instances on one Stash address; inst-default comes first
    await loadInstances(
      ...["inst-default", "inst-a"].map((id, priority) =>
        stashInstanceRow({
          id,
          priority,
          url: "http://stash:9999/graphql",
          apiKey: "test-api-key",
        })
      )
    );
    // After the load, whose log lines are not the handler's
    vi.clearAllMocks();
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
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const sentContent: string = sentText(res);
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
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const sentContent: string = sentText(res);
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
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const sentContent: string = sentText(res);
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
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const sentContent: string = sentText(res);
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
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const sentContent: string = sentText(res);
        const lines = sentContent.split("\n");

        expect(lines[2]).toContain("resolution=FULL_HD");
        expect(lines[2]).toContain("instanceId=inst-a");
        expect(lines[2]).not.toContain("apikey");
      });

      it("sets content-type to application/vnd.apple.mpegurl for HLS", async () => {
        const req = createMockReq();
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
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
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const sentContent: string = sentText(res);
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
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse(hlsContent)
        );

        await proxyStashStream(req, res);

        const pairs = proxiedPaths(sentText(res));
        expect(pairs).toHaveLength(4);
        for (const [streamPath, subPath] of pairs) {
          expect(isAllowedStreamPath(streamPath, subPath), streamPath).toBe(
            true
          );
        }
      });

      it("never returns a line that fails to parse, even with apikey in it", async () => {
        const sent = await rewrittenPlaylist(
          [
            "#EXTM3U",
            "#EXTINF:10.0,",
            "http://[bad/scene/1/stream.m3u8/0.ts?apikey=SECRET",
            "#EXTINF:10.0,",
            "http://stash:9999/scene/123/stream.m3u8/1.ts?resolution=LOW",
          ].join("\n")
        );

        expect(sent).not.toContain("SECRET");
        expect(sent).not.toMatch(/apikey/i);
        // The bad line is dropped; the good one is still rewritten
        expect(sent.split("\n")).toEqual([
          "#EXTM3U",
          "#EXTINF:10.0,",
          "",
          "#EXTINF:10.0,",
          "/api/scene/123/proxy-stream/stream.m3u8/1.ts?resolution=LOW&instanceId=inst-a",
        ]);
        expect(logger.warn).toHaveBeenCalled();
        expect(allLogged()).not.toContain("SECRET");
      });

      it("rewrites URI attributes in tags and strips the key", async () => {
        const sent = await rewrittenPlaylist(
          [
            "#EXTM3U",
            '#EXT-X-KEY:METHOD=AES-128,URI="http://stash:9999/scene/123/stream.m3u8/key?apikey=SECRET"',
            '#EXT-X-MAP:URI="init.mp4?apikey=SECRET"',
            '#EXT-X-MAP:URI="http://[bad/init.mp4?apikey=SECRET"',
            "#EXTINF:10.0,",
            "stream.m3u8/0.ts?resolution=LOW",
          ].join("\n")
        );

        expect(sent.split("\n")).toEqual([
          "#EXTM3U",
          '#EXT-X-KEY:METHOD=AES-128,URI="/api/scene/123/proxy-stream/stream.m3u8/key?instanceId=inst-a"',
          '#EXT-X-MAP:URI="/api/scene/123/proxy-stream/init.mp4?instanceId=inst-a"',
          // A URI that cannot be rewritten drops its whole tag
          "",
          "#EXTINF:10.0,",
          "/api/scene/123/proxy-stream/stream.m3u8/0.ts?resolution=LOW&instanceId=inst-a",
        ]);
        expect(allLogged()).not.toContain("SECRET");
      });

      it("strips apikey in any casing", async () => {
        const sent = await rewrittenPlaylist(
          [
            "#EXTM3U",
            "#EXTINF:10.0,",
            "http://stash:9999/scene/123/stream.m3u8/0.ts?apiKey=SECRET&resolution=LOW",
            "#EXTINF:10.0,",
            "/scene/123/stream.m3u8/1.ts?APIKey=SECRET&resolution=LOW",
            "#EXTINF:10.0,",
            "stream.m3u8/2.ts?resolution=LOW&aPiKeY=SECRET",
          ].join("\n")
        );

        // Stripped, not dropped: every segment line survives
        const lines = sent.split("\n");
        for (const [index, segment] of [
          [2, 0],
          [4, 1],
          [6, 2],
        ] as const) {
          expect(lines[index]).toBe(
            `/api/scene/123/proxy-stream/stream.m3u8/${segment}.ts?resolution=LOW&instanceId=inst-a`
          );
        }
        expect(sent).not.toContain("SECRET");
      });

      it("no output line ever contains apikey", async () => {
        const hostilePlaylists: string[][] = [
          // Tags carrying URI attributes
          [
            '#EXT-X-SESSION-DATA:DATA-ID="com.stash",URI="http://stash:9999/data.json?apikey=SECRET"',
            '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="en",URI="audio.m3u8?APIKEY=SECRET"',
            '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1,URI="/scene/1/iframe.m3u8?ApiKey=SECRET"',
            '#EXT-X-KEY:METHOD=AES-128,URI="http://[bad/key?apikey=SECRET"',
            '#EXT-X-KEY:METHOD=AES-128,URI="key?resolution=LOW",KEYFORMAT="x?apikey=SECRET"',
          ],
          // Tags naming the key outside a URI attribute
          [
            '#EXT-X-FOO:BAR="apikey=SECRET"',
            "#EXT-X-FOO:APIKEY=SECRET",
            "#apikey SECRET",
          ],
          // Segment lines: absolute, path, relative, repeated, encoded, in the path
          [
            "http://stash:9999/scene/1/stream.m3u8/0.ts?a=1&aPiKeY=SECRET&b=2",
            "/scene/1/stream.m3u8/1.ts?apikey=SECRET&APIKEY=SECRET",
            "stream.m3u8/2.ts?resolution=LOW#apikey=SECRET",
            "3.ts?apikey%3DSECRET",
            "/scene/1/apikey=SECRET/4.ts",
            "http://stash:9999/scene/1/stream.m3u8/5.ts?api%4Bey=SECRET",
          ],
          // Malformed lines
          [
            "http://[bad/scene/1/stream.m3u8/0.ts?apikey=SECRET",
            "http://stash:99999/scene/1/stream.m3u8/1.ts?APIKEY=SECRET",
            "  ?apikey=SECRET",
            "apikey=SECRET\r",
          ],
        ];

        for (const playlist of hostilePlaylists) {
          const sent = await rewrittenPlaylist(
            ["#EXTM3U", ...playlist].join("\n")
          );
          for (const line of sent.split("\n")) {
            expect(line, playlist.join(" | ")).not.toMatch(/apikey/i);
            expect(line, playlist.join(" | ")).not.toContain("SECRET");
          }
        }
        expect(allLogged()).not.toContain("SECRET");
      });
    });

    // -----------------------------------------------------------------------
    // DASH manifest. Stash echoes apikey into segment templates when the key
    // arrives as a query parameter; Peek sends it as a header, but the
    // manifest must never carry it whatever Stash does.
    // -----------------------------------------------------------------------
    describe("DASH manifest", () => {
      it("a DASH manifest never carries apikey", async () => {
        const mpd = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">',
          "  <BaseURL>/scene/1/stream.mpd/?apikey=SECRET</BaseURL>",
          "  <Period>",
          '    <AdaptationSet mimeType="video/webm">',
          '      <SegmentTemplate initialization="init_v.webm?apikey=SECRET&amp;resolution=LOW" media="$Number$_v.webm?resolution=LOW&amp;apikey=SECRET"></SegmentTemplate>',
          "    </AdaptationSet>",
          "  </Period>",
          "</MPD>",
        ].join("\n");
        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse(mpd, {
            contentType: "application/dash+xml",
            cacheControl: "public, max-age=60",
          })
        );
        const res = resFor(proxyStashStream);

        await proxyStashStream(createMpdReq(), res);

        const body: string = sentText(res);
        expect(body).not.toContain("SECRET");
        expect(body).not.toMatch(/apikey/i);
        expect(body).toContain("<BaseURL>/scene/1/stream.mpd/</BaseURL>");
        expect(body).toContain('initialization="init_v.webm?resolution=LOW"');
        expect(body).toContain('media="$Number$_v.webm?resolution=LOW"');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.setHeader).toHaveBeenCalledWith(
          "content-type",
          "application/dash+xml"
        );
        expect(res.setHeader).toHaveBeenCalledWith(
          "cache-control",
          "private, max-age=60"
        );
        expect(mockPipeResponseToClient).not.toHaveBeenCalled();
      });

      it("strips repeated and middle apikey parameters and keeps the rest of each query", async () => {
        const mpd = [
          '<S a="a.webm?x=1&amp;apikey=K1&amp;APIKEY=K2&amp;y=2"/>',
          '<S b="b.webm?apiKey=K3&amp;apikey=K4&amp;y=2"/>',
          '<S c="c.webm?x=1&apikey=K5"/>',
          "<U>d.webm?ApiKey=K6&x=1</U>",
        ].join("\n");
        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse(mpd, { contentType: "application/dash+xml" })
        );
        const res = resFor(proxyStashStream);

        await proxyStashStream(createMpdReq(), res);

        expect(sentText(res)).toBe(
          [
            '<S a="a.webm?x=1&amp;y=2"/>',
            '<S b="b.webm?y=2"/>',
            '<S c="c.webm?x=1"/>',
            "<U>d.webm?x=1</U>",
          ].join("\n")
        );
      });

      it("refuses a DASH manifest that still names apikey after stripping", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse(
            "<MPD><BaseURL>/x?path=%2Fy%3Fapikey%3DSECRET</BaseURL></MPD>",
            { contentType: "application/dash+xml" }
          )
        );
        const res = resFor(proxyStashStream);

        await proxyStashStream(createMpdReq(), res);

        expect(res.status).toHaveBeenLastCalledWith(502);
        expect(JSON.stringify(res.send.mock.calls)).not.toContain("SECRET");
        expect(allLogged()).not.toContain("SECRET");
      });
    });

    // A ranged manifest request would let a slice start past "apikey=" and
    // carry the bare key through every rewrite; Stash honours Range there.
    it("never forwards Range on a manifest request", async () => {
      for (const streamPath of ["stream.m3u8", "stream.mpd"]) {
        vi.mocked(global.fetch).mockClear();
        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse("#EXTM3U\n")
        );

        await proxyStashStream(
          createMockReq({
            params: { sceneId: "123", streamPath },
            url: `/api/scene/123/proxy-stream/${streamPath}?instanceId=inst-a`,
            headers: { range: "bytes=40-" },
          }),
          resFor(proxyStashStream)
        );

        expect(fetchedHeaders(), streamPath).not.toHaveProperty("Range");
      }
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
        const res = resFor(proxyStashStream);

        const fetchResp = makeFetchResponse("binary data", {
          contentType: "video/mp4",
        });
        vi.mocked(global.fetch).mockResolvedValue(fetchResp);

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
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp4" })
        );

        await proxyStashStream(req, res);

        expect(fetchedHeaders()).toEqual(
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
        const res = resFor(proxyStashStream);

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
        const res = resFor(proxyStashStream);

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
        const res = resFor(proxyStashStream);

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it("returns 400 for a malformed instanceId", async () => {
        const req = createMockReq({
          query: { instanceId: "inst a" },
          url: "/api/scene/123/proxy-stream/stream.m3u8?instanceId=inst%20a",
        });
        const res = resFor(proxyStashStream);

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it("returns 404 when canUserAccessEntity is false", async () => {
        mockCanUserAccessEntity.mockResolvedValue(false);
        const req = createMockReq();
        const res = resFor(proxyStashStream);

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
        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse("#EXTM3U\n")
        );

        await proxyStashStream(req, resFor(proxyStashStream));

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
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp4" })
        );

        await proxyStashStream(req, res);

        const stashUrl = fetchedUrl();
        expect(stashUrl).toBe(
          "http://stash:9999/scene/123/stream.mp4?resolution=LOW&start=12.5"
        );
      });

      it("sets private Cache-Control on direct streams and on HLS playlists", async () => {
        // HLS playlist
        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse("#EXTM3U\n", { cacheControl: "public, max-age=60" })
        );
        const hlsRes = resFor(proxyStashStream);
        await proxyStashStream(createMockReq(), hlsRes);
        expect(hlsRes.setHeader).toHaveBeenCalledWith(
          "cache-control",
          "private, no-cache"
        );

        // Direct stream with an upstream public value
        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse("", {
            contentType: "video/mp4",
            cacheControl: "public, max-age=60",
          })
        );
        const directRes = resFor(proxyStashStream);
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
        const forwarded = must(mockPipeResponseToClient.mock.calls[0])[3];
        expect(forwarded).not.toContain("cache-control");
      });
    });

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------
    describe("error handling", () => {
      it("returns 404 for an instance that is not enabled (disabled or deleted)", async () => {
        const req = createMockReq({
          query: { instanceId: "bad-inst" },
          url: "/api/scene/123/proxy-stream/stream.m3u8?instanceId=bad-inst",
        });
        const res = resFor(proxyStashStream);

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.send).toHaveBeenCalledWith("Not found");
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it("returns Stash error status when Stash returns non-ok", async () => {
        const req = createMockReq();
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          new Response(null, { status: 404, statusText: "Not Found" })
        );

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.send).toHaveBeenCalledWith("Stash stream error: Not Found");
      });

      it("the stream proxy logs no query string", async () => {
        const req = createMockReq({
          params: { sceneId: "123", streamPath: "stream.mp4" },
          // A signed link's claims, which the handler's query type leaves out
          query: malformed({ sig: "SECRETSIG", exp: "1" }),
          url: "/api/scene/123/proxy-stream/stream.mp4?sig=SECRETSIG&exp=1",
        });
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          new Response(null, { status: 404, statusText: "Not Found" })
        );

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(allLogged()).toContain("stream.mp4");
        expect(allLogged()).not.toContain("SECRETSIG");
      });

      it("returns 500 and sends error when fetch throws (headers not sent)", async () => {
        const req = createMockReq();
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockRejectedValue(new Error("Network failure"));

        await proxyStashStream(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith("Stream proxy failed");
      });

      it("does not send error response when headers already sent", async () => {
        const req = createMockReq();
        const res = resFor(proxyStashStream);
        res.headersSent = true;

        vi.mocked(global.fetch).mockRejectedValue(new Error("Network failure"));

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
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp4" })
        );

        await proxyStashStream(req, res);

        const stashUrl = fetchedUrl();
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
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp2t" })
        );

        await proxyStashStream(req, res);

        const stashUrl = fetchedUrl();
        expect(stashUrl).toBe("http://stash:9999/scene/123/stream.m3u8/0.ts");
      });

      it("registers an abort handler on res close", async () => {
        const req = createMockReq({
          params: { sceneId: "123", streamPath: "stream.mp4" },
          url: "/api/scene/123/proxy-stream/stream.mp4?instanceId=inst-a",
        });
        const res = resFor(proxyStashStream);

        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp4" })
        );

        await proxyStashStream(req, res);

        expect(res.on).toHaveBeenCalledWith("close", expect.any(Function));
      });
    });
    // -----------------------------------------------------------------------
    // An instance whose id is "default" (the owner's)
    // -----------------------------------------------------------------------
    describe("an instance whose id is `default`", () => {
      it("with instanceId=default fetches from the `default` instance when another has higher priority", async () => {
        await loadInstances(TOP_PRIORITY, NAMED_DEFAULT);
        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse("", { contentType: "video/mp4" })
        );

        await proxyStashStream(
          createMockReq({
            params: { sceneId: "123", streamPath: "stream.mp4" },
            query: { instanceId: "default" },
            url: "/api/scene/123/proxy-stream/stream.mp4?instanceId=default&resolution=STANDARD",
          }),
          resFor(proxyStashStream)
        );

        expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
          7,
          "scene",
          "123",
          "default"
        );
        expect(fetchedUrl()).toBe(
          "http://stash-default:9999/scene/123/stream.mp4?resolution=STANDARD"
        );
        expect(fetchedHeaders()).toEqual({ ApiKey: "key-default" });
      });

      it("an HLS playlist from `default` keeps instanceId=default on every segment", async () => {
        await loadInstances(TOP_PRIORITY, NAMED_DEFAULT);
        vi.mocked(global.fetch).mockResolvedValue(
          makeFetchResponse(
            "#EXTM3U\n#EXTINF:10,\n/scene/123/stream.m3u8/0.ts?apikey=key-default&resolution=LOW\n"
          )
        );
        const res = resFor(proxyStashStream);

        await proxyStashStream(
          createMockReq({
            query: { instanceId: "default" },
            url: "/api/scene/123/proxy-stream/stream.m3u8?instanceId=default",
          }),
          res
        );

        expect(fetchedUrl()).toBe(
          "http://stash-default:9999/scene/123/stream.m3u8"
        );
        expect(sentText(res)).toContain(
          "/api/scene/123/proxy-stream/stream.m3u8/0.ts?resolution=LOW&instanceId=default"
        );
      });

      it("the owner's setup, `default` alone at priority 0, serves it whether a request names it or not", async () => {
        await loadInstances({ ...NAMED_DEFAULT, priority: 0 });
        vi.mocked(global.fetch).mockImplementation(() =>
          Promise.resolve(makeFetchResponse("", { contentType: "video/mp4" }))
        );

        for (const query of [{ instanceId: "default" }, {}]) {
          await proxyStashStream(
            createMockReq({
              params: { sceneId: "123", streamPath: "stream" },
              query,
              url: "/api/scene/123/proxy-stream/stream",
            }),
            resFor(proxyStashStream)
          );
        }

        const calls = vi.mocked(global.fetch).mock.calls;
        expect(calls.map(([url]) => url)).toEqual([
          "http://stash-default:9999/scene/123/stream",
          "http://stash-default:9999/scene/123/stream",
        ]);
        expect(calls.map(([, init]) => init?.headers)).toEqual([
          { ApiKey: "key-default" },
          { ApiKey: "key-default" },
        ]);
        expect(
          mockCanUserAccessEntity.mock.calls.map(
            ([, , , instanceId]) => instanceId
          )
        ).toEqual(["default", "default"]);
      });
    });
  });

  // =========================================================================
  // getCaption
  // =========================================================================
  describe("getCaption", () => {
    function captionResponse(body = "WEBVTT\n\n"): Response {
      return new Response(body);
    }

    it("returns 400 when lang is missing", async () => {
      const req = reqFor(getCaption, {
        params: { sceneId: "123" },
        query: { type: "srt", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith("Missing lang or type parameter");
    });

    it("returns 400 when type is missing", async () => {
      const req = reqFor(getCaption, {
        params: { sceneId: "123" },
        query: { lang: "en", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith("Missing lang or type parameter");
    });

    it("returns 400 when type is not srt or vtt", async () => {
      const req = reqFor(getCaption, {
        params: { sceneId: "123" },
        query: { lang: "en", type: "ass", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns 400 for lang with & or =", async () => {
      const req = reqFor(getCaption, {
        params: { sceneId: "123" },
        query: { lang: "en&admin=1", type: "srt", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns 400 for a non-numeric sceneId", async () => {
      const req = reqFor(getCaption, {
        params: { sceneId: "abc" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns 404 when canUserAccessEntity is false", async () => {
      mockCanUserAccessEntity.mockResolvedValue(false);
      const req = reqFor(getCaption, {
        params: { sceneId: "456" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

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
      const req = reqFor(getCaption, {
        params: { sceneId: "456" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

      vi.mocked(global.fetch).mockResolvedValue(
        captionResponse("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello")
      );

      await getCaption(req, res);

      const fetchUrl = fetchedUrl();
      expect(fetchUrl).toBe(
        "http://stash:9999/scene/456/caption?lang=en&type=srt"
      );
    });

    it("caption requests log at debug, not info", async () => {
      const req = reqFor(getCaption, {
        params: { sceneId: "456" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

      vi.mocked(global.fetch).mockResolvedValue(captionResponse());

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
      const req = reqFor(getCaption, {
        params: { sceneId: "456" },
        query: { lang: "pt-BR", type: "vtt", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

      vi.mocked(global.fetch).mockResolvedValue(captionResponse());

      await getCaption(req, res);

      const fetchUrl = fetchedUrl();
      const url = new URL(fetchUrl);
      expect(url.pathname).toBe("/scene/456/caption");
      expect([...url.searchParams.entries()]).toEqual([
        ["lang", "pt-BR"],
        ["type", "vtt"],
      ]);
    });

    it("sets Content-Type to text/vtt", async () => {
      const req = reqFor(getCaption, {
        params: { sceneId: "123" },
        query: { lang: "en", type: "vtt", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

      vi.mocked(global.fetch).mockResolvedValue(captionResponse());

      await getCaption(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "text/vtt; charset=utf-8"
      );
    });

    it("sets Cache-Control private, max-age=86400", async () => {
      const req = reqFor(getCaption, {
        params: { sceneId: "123" },
        query: { lang: "en", type: "vtt", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

      vi.mocked(global.fetch).mockResolvedValue(captionResponse());

      await getCaption(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "private, max-age=86400"
      );
    });

    it("returns Stash error status on non-ok response", async () => {
      const req = reqFor(getCaption, {
        params: { sceneId: "123" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

      vi.mocked(global.fetch).mockResolvedValue(
        new Response(null, { status: 404 })
      );

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith("Caption not found");
    });

    it("sends API key in ApiKey header, not in the URL", async () => {
      const req = reqFor(getCaption, {
        params: { sceneId: "123" },
        query: { lang: "en", type: "srt", instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(getCaption);

      vi.mocked(global.fetch).mockResolvedValue(captionResponse());

      await getCaption(req, res);

      const fetchUrl = fetchedUrl();

      // API key must be in the header
      expect(fetchedHeaders()).toEqual(
        expect.objectContaining({ ApiKey: "test-api-key" })
      );
      // API key must NOT be in the URL
      expect(fetchUrl).not.toContain("test-api-key");
      expect(fetchUrl).not.toMatch(/apikey/i);
    });

    it("returns 404 for an instance that is not enabled (disabled or deleted)", async () => {
      const req = reqFor(getCaption, {
        params: { sceneId: "123" },
        query: { lang: "en", type: "srt", instanceId: "bad-inst" },
        user: USER,
      });
      const res = resFor(getCaption);

      await getCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith("Not found");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("with instanceId=default fetches from the `default` instance when another has higher priority", async () => {
      await loadInstances(TOP_PRIORITY, NAMED_DEFAULT);
      vi.mocked(global.fetch).mockResolvedValue(captionResponse());

      await getCaption(
        reqFor(getCaption, {
          params: { sceneId: "123" },
          query: { lang: "en", type: "srt", instanceId: "default" },
          user: USER,
        }),
        resFor(getCaption)
      );

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        7,
        "scene",
        "123",
        "default"
      );
      expect(fetchedUrl()).toBe(
        "http://stash-default:9999/scene/123/caption?lang=en&type=srt"
      );
      expect(fetchedHeaders()).toEqual({ ApiKey: "key-default" });
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
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          passwordChangedAt: PASSWORD_CHANGED_AT,
        })
      );
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns a direct-stream path carrying uid, exp 12 h ahead and a signature", async () => {
      const req = reqFor(createExternalPlayerLink, {
        params: { sceneId: "123" },
        query: {},
        body: { instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(createExternalPlayerLink);

      await createExternalPlayerLink(req, res);

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        7,
        "scene",
        "123",
        "inst-a"
      );
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
      expect(res.json).toHaveBeenCalledTimes(1);
      const body = res._getOkBody();
      expect(body.url).toMatch(
        /^\/api\/scene\/123\/proxy-stream\/stream\?instanceId=inst-a&uid=7&exp=1790208000&sig=[A-Za-z0-9_-]{43}$/
      );
      expect(body.expiresAt).toBe("2026-09-24T00:00:00.000Z");

      const sig = must(
        new URL(body.url, "http://peek.test").searchParams.get("sig")
      );
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
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          passwordChangedAt: null,
        })
      );
      const req = reqFor(createExternalPlayerLink, {
        params: { sceneId: "123" },
        query: {},
        body: { instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(createExternalPlayerLink);

      await createExternalPlayerLink(req, res);

      const body = res._getOkBody();
      const sig = must(
        new URL(body.url, "http://peek.test").searchParams.get("sig")
      );
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
      const req = reqFor(createExternalPlayerLink, {
        params: { sceneId: "123" },
        query: {},
        body: { instanceId: "inst-a" },
        user: USER,
      });
      const res = resFor(createExternalPlayerLink);

      await createExternalPlayerLink(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Not found" });
    });

    it("returns 400 for a non-numeric sceneId or a missing instanceId", async () => {
      const badScene = resFor(createExternalPlayerLink);
      await createExternalPlayerLink(
        reqFor(createExternalPlayerLink, {
          params: { sceneId: "abc" },
          query: {},
          body: { instanceId: "inst-a" },
          user: USER,
        }),
        badScene
      );
      expect(badScene.status).toHaveBeenCalledWith(400);

      const noInstance = resFor(createExternalPlayerLink);
      await createExternalPlayerLink(
        reqFor(createExternalPlayerLink, {
          params: { sceneId: "123" },
          query: {},
          body: malformed({}),
          user: USER,
        }),
        noInstance
      );
      expect(noInstance.status).toHaveBeenCalledWith(400);

      const badInstance = resFor(createExternalPlayerLink);
      await createExternalPlayerLink(
        reqFor(createExternalPlayerLink, {
          params: { sceneId: "123" },
          query: {},
          body: { instanceId: "inst a" },
          user: USER,
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
      const res = resFor(proxyStashStream);

      vi.mocked(global.fetch).mockResolvedValue(
        makeFetchResponse("", { contentType: "video/mp4" })
      );

      await proxyStashStream(req, res);

      const fetchUrl = fetchedUrl();

      // API key sent in header
      expect(fetchedHeaders().ApiKey).toBe("test-api-key");
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
      const res = resFor(proxyStashStream);

      vi.mocked(global.fetch).mockResolvedValue(makeFetchResponse(hlsContent));

      await proxyStashStream(req, res);

      const sentContent: string = sentText(res);

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
