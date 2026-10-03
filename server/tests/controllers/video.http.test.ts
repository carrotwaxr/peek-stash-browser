/**
 * The stream proxy over real HTTP, in front of a server standing in for
 * Stash as it answers: HEAD refused with 405 on every media route, the
 * direct file served by byte range, transcodes and HLS segments streamed
 * without a length, and manifests whole. An external player may HEAD a
 * personal stream link; the answer must cost Stash at most one byte of the
 * file, never a whole file or a full transcode.
 */
import http from "http";
import type { AddressInfo } from "net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { proxyStashStream } from "../../controllers/video.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import videoRouter from "../../routes/video.js";
import type * as stashInstanceManagerModule from "../../services/StashInstanceManager.js";
import type * as mediaAccessModule from "../../utils/mediaAccess.js";
import { authenticated } from "../../utils/routeHelpers.js";
import {
  STREAM_LINK_TTL_SECONDS,
  deriveStreamLinkKey,
  signStreamLink,
} from "../../utils/streamLink.js";
import { startTestApp } from "../helpers/httpTestApp.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

const state = vi.hoisted(() => ({ stashUrl: "" }));

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/mediaAccess.js", async (importOriginal) => ({
  ...(await importOriginal<typeof mediaAccessModule>()),
  canUserLoadMedia: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../services/StashInstanceManager.js", async (importOriginal) => {
  const actual = await importOriginal<typeof stashInstanceManagerModule>();
  return {
    UnknownInstanceError: actual.UnknownInstanceError,
    stashInstanceManager: {
      getCredentials: vi.fn(() => ({
        baseUrl: state.stashUrl,
        apiKey: "test-key",
      })),
    },
  };
});

vi.mock("../../utils/jwtSecret.js", () => ({
  getJwtSecret: vi.fn().mockReturnValue("test-secret"),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

/** The direct file's size, and what a transcode or segment streams. */
const FILE_BYTES = 4 * 1024 * 1024;
const CHUNK = Buffer.alloc(64 * 1024, 1);

const MANIFEST = [
  "#EXTM3U",
  "#EXT-X-TARGETDURATION:2",
  "#EXTINF:2.000,",
  "/scene/1/stream.m3u8/0.ts?resolution=STANDARD",
  "#EXT-X-ENDLIST",
  "",
].join("\n");

const MPD = '<?xml version="1.0"?><MPD><Period/></MPD>';

/** What Stash received and sent for one request. */
interface StashExchange {
  method: string;
  url: string;
  range: string | undefined;
  /** Body bytes Stash handed to the socket while the connection was open */
  bodyBytes: number;
  /** Resolves once Stash's side of the exchange has closed or finished */
  done: Promise<void>;
}

describe("a HEAD on the stream proxy", () => {
  let stashServer: http.Server;
  const exchanges: StashExchange[] = [];
  let peekUrl: string;
  let closePeek: () => Promise<void>;

  beforeAll(async () => {
    stashServer = http.createServer((req, res) => {
      let finish = (): void => undefined;
      const exchange: StashExchange = {
        method: req.method ?? "",
        url: req.url ?? "",
        range: req.headers.range,
        bodyBytes: 0,
        done: new Promise<void>((resolve) => {
          finish = resolve;
        }),
      };
      exchanges.push(exchange);
      let closed = false;
      res.on("close", () => {
        closed = true;
        finish();
      });

      if (req.method !== "GET") {
        res.writeHead(405, { allow: "GET", "content-type": "text/plain" });
        res.end("Method Not Allowed");
        return;
      }

      const path = new URL(req.url ?? "/", "http://stash").pathname;
      // The body follows the headers once Peek has had time to hang up: a
      // proxy that reads the body gets it, one that hangs up gets none
      const sendBody = (body: Buffer | "stream"): void => {
        res.flushHeaders();
        const afterHangUp = setTimeout(write, 300);
        res.once("close", () => clearTimeout(afterHangUp));
        function write(): void {
          if (closed) return;
          if (body !== "stream") {
            exchange.bodyBytes += body.length;
            res.end(body);
            return;
          }
          if (exchange.bodyBytes >= FILE_BYTES) {
            res.end();
            return;
          }
          exchange.bodyBytes += CHUNK.length;
          if (res.write(CHUNK)) setImmediate(write);
          else res.once("drain", write);
        }
      };

      const lastModified = "Wed, 01 Jan 2025 00:00:00 GMT";
      if (path === "/scene/1/stream") {
        // The direct file: Stash serves it by byte range
        const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? "");
        if (range) {
          const start = Number(range[1]);
          const end = Number(range[2]);
          res.writeHead(206, {
            "content-type": "video/mp4",
            "accept-ranges": "bytes",
            "last-modified": lastModified,
            "content-range": `bytes ${start}-${end}/${FILE_BYTES}`,
            "content-length": String(end - start + 1),
          });
          sendBody(Buffer.alloc(end - start + 1, 1));
          return;
        }
        res.writeHead(200, {
          "content-type": "video/mp4",
          "accept-ranges": "bytes",
          "last-modified": lastModified,
          "content-length": String(FILE_BYTES),
        });
        sendBody("stream");
        return;
      }
      if (
        path === "/scene/1/stream.mp4" ||
        path === "/scene/1/stream.m3u8/0.ts"
      ) {
        // A transcode or an HLS segment: no Range, no length
        res.writeHead(200, {
          "content-type": path.endsWith(".ts") ? "video/MP2T" : "video/mp4",
          "cache-control": "no-store",
        });
        sendBody("stream");
        return;
      }
      if (path === "/scene/1/stream.m3u8") {
        res.writeHead(200, {
          "content-type": "application/vnd.apple.mpegurl",
          "content-length": String(Buffer.byteLength(MANIFEST)),
        });
        sendBody(Buffer.from(MANIFEST));
        return;
      }
      if (path === "/scene/1/stream.mpd") {
        res.writeHead(200, {
          "content-type": "application/dash+xml",
          "content-length": String(Buffer.byteLength(MPD)),
        });
        sendBody(Buffer.from(MPD));
        return;
      }
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    });
    await new Promise<void>((resolve) =>
      stashServer.listen(0, "127.0.0.1", resolve)
    );
    state.stashUrl = `http://127.0.0.1:${(stashServer.address() as AddressInfo).port}`;

    const peek = await startTestApp((app) => {
      app.use((req, _res, next) => {
        (req as AuthenticatedRequest).user = {
          id: 1,
          username: "u",
          role: "USER",
        };
        next();
      });
      app.get(
        "/api/scene/:sceneId/proxy-stream/:streamPath/:subPath",
        authenticated(proxyStashStream)
      );
      app.get(
        "/api/scene/:sceneId/proxy-stream/:streamPath",
        authenticated(proxyStashStream)
      );
    });
    peekUrl = peek.baseUrl;
    closePeek = peek.close;
  });

  afterAll(async () => {
    await closePeek();
    stashServer.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      stashServer.close((err) => (err ? reject(err) : resolve()))
    );
  });

  beforeEach(() => {
    exchanges.length = 0;
  });

  /** HEAD a stream path; Stash's side of the one exchange once it is over. */
  async function head(
    streamPath: string,
    headers: Record<string, string> = {}
  ): Promise<{ res: Response; stash: StashExchange }> {
    const res = await fetch(
      `${peekUrl}/api/scene/1/proxy-stream/${streamPath}${streamPath.includes("?") ? "&" : "?"}instanceId=inst-a`,
      { method: "HEAD", headers }
    );
    expect(exchanges).toHaveLength(1);
    const stash = must(exchanges[0], "Stash's exchange");
    await stash.done;
    return { res, stash };
  }

  it("the direct file is asked for one byte and answered 200 with its whole length", async () => {
    const { res, stash } = await head("stream");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-length")).toBe(String(FILE_BYTES));
    expect(res.headers.get("content-range")).toBeNull();
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect((await res.arrayBuffer()).byteLength).toBe(0);
    expect([stash.method, stash.range]).toEqual(["GET", "bytes=0-0"]);
    expect(stash.bodyBytes).toBeLessThanOrEqual(1);
  });

  it("the direct file with the player's own Range answers Stash's 206 for it", async () => {
    const { res, stash } = await head("stream", { Range: "bytes=0-9" });

    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-9/${FILE_BYTES}`);
    expect(res.headers.get("content-length")).toBe("10");
    expect((await res.arrayBuffer()).byteLength).toBe(0);
    expect([stash.method, stash.range]).toEqual(["GET", "bytes=0-9"]);
  });

  it.each([
    ["a transcode", "stream.mp4", "video/mp4"],
    ["an HLS segment", "stream.m3u8/0.ts?resolution=STANDARD", "video/MP2T"],
    ["an HLS manifest", "stream.m3u8", "application/vnd.apple.mpegurl"],
    ["a DASH manifest", "stream.mpd", "application/dash+xml"],
  ])(
    "%s is answered from Stash's headers, and Stash sends no body",
    async (_name, streamPath, contentType) => {
      const { res, stash } = await head(streamPath);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type") ?? "").toContain(contentType);
      expect((await res.arrayBuffer()).byteLength).toBe(0);
      // Never HEAD (Stash refuses it) and never a Range these do not take
      expect([stash.method, stash.range]).toEqual(["GET", undefined]);
      expect(stash.bodyBytes).toBe(0);
    }
  );

  it("a HEAD for a stream Stash does not have answers 404", async () => {
    const res = await fetch(
      `${peekUrl}/api/scene/2/proxy-stream/stream?instanceId=inst-a`,
      { method: "HEAD" }
    );

    expect(res.status).toBe(404);
  });

  it("a GET of the direct file still streams it whole", async () => {
    const res = await fetch(
      `${peekUrl}/api/scene/1/proxy-stream/stream?instanceId=inst-a`
    );

    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(FILE_BYTES);
  });
});

/**
 * A playlist fetched with a media link and no cookie: every URL it lists
 * must open on the link's signature alone, through the real stream guard.
 */
describe("a signed HLS playlist over HTTP", () => {
  let stashServer: http.Server;
  let peekUrl: string;
  let closePeek: () => Promise<void>;

  const exp = Math.floor(Date.now() / 1000) + STREAM_LINK_TTL_SECONDS;
  const claims = {
    userId: 7,
    sceneId: "1",
    instanceId: "inst-a",
    exp,
    passwordChangedAtMs: 0,
    scope: "media" as const,
  };
  const sig = signStreamLink(claims, deriveStreamLinkKey("test-secret"));
  const playlistUrl = (): string =>
    `${peekUrl}/api/scene/1/proxy-stream/stream.m3u8?instanceId=inst-a&uid=7&exp=${exp}&scope=media&sig=${sig}`;

  beforeAll(async () => {
    stashServer = http.createServer((req, res) => {
      const path = new URL(req.url ?? "/", "http://stash").pathname;
      if (path === "/scene/1/stream.m3u8") {
        res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl" });
        res.end(
          [
            "#EXTM3U",
            "#EXTINF:2.000,",
            `${state.stashUrl}/scene/1/stream.m3u8/0.ts?apikey=test-key&resolution=STANDARD`,
            "#EXTINF:2.000,",
            "/scene/1/stream.m3u8/0.ts?resolution=STANDARD",
            "#EXT-X-ENDLIST",
            "",
          ].join("\n")
        );
        return;
      }
      if (path === "/scene/1/stream.m3u8/0.ts") {
        res.writeHead(200, { "content-type": "video/MP2T" });
        res.end(Buffer.alloc(1024, 1));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) =>
      stashServer.listen(0, "127.0.0.1", resolve)
    );
    state.stashUrl = `http://127.0.0.1:${(stashServer.address() as AddressInfo).port}`;

    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      partialRow({ id: 7, username: "u", role: "USER" })
    );
    const peek = await startTestApp((app) => {
      app.use("/api", videoRouter);
    });
    peekUrl = peek.baseUrl;
    closePeek = peek.close;
  });

  afterAll(async () => {
    await closePeek();
    stashServer.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      stashServer.close((err) => (err ? reject(err) : resolve()))
    );
  });

  it("each segment URL from a signed playlist answers 200 with no cookie", async () => {
    const playlist = await fetch(playlistUrl());
    expect(playlist.status).toBe(200);
    const segments = (await playlist.text())
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"));
    expect(segments).toHaveLength(2);

    for (const segment of segments) {
      const res = await fetch(`${peekUrl}${segment}`);
      expect(res.status, segment).toBe(200);
      expect((await res.arrayBuffer()).byteLength).toBe(1024);
    }
  });

  it("the same playlist without its signature answers 401", async () => {
    const res = await fetch(
      `${peekUrl}/api/scene/1/proxy-stream/stream.m3u8/0.ts?instanceId=inst-a`
    );

    expect(res.status).toBe(401);
  });
});
