/**
 * The media proxy over real HTTP, in front of a real server standing in for
 * Stash: what the browser sees when Stash fails after the response started.
 * `pipe` neither passes a source error on nor ends its destination, so a
 * reset or a stall mid-body left the browser waiting for the promised
 * Content-Length until nginx gave up (a minute on `/api/proxy/`).
 */
import http from "http";
import type { AddressInfo, Socket } from "net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  proxyClipPreview,
  proxyImage,
  proxyScenePreview,
  proxySceneWebp,
  proxyStashMedia,
} from "../../controllers/proxy.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import type * as stashInstanceManagerModule from "../../services/StashInstanceManager.js";
import { logger } from "../../utils/logger.js";
import type * as mediaAccessModule from "../../utils/mediaAccess.js";
import { authenticated } from "../../utils/routeHelpers.js";
import { startTestApp } from "../helpers/httpTestApp.js";
import { stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";

const state = vi.hoisted(() => ({ stashUrl: "" }));

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/mediaAccess.js", async (importOriginal) => ({
  ...(await importOriginal<typeof mediaAccessModule>()),
  canUserLoadMedia: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../services/EntityAccessService.js", () => ({
  canUserAccessEntity: vi.fn(() => Promise.resolve(true)),
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

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

/** Bytes Stash promises for each image, and how many it sends before failing. */
const PROMISED_BYTES = 1000;
const SENT_BYTES = 100;

type Outcome = "resolved" | "rejected" | "pending";

/** How `promise` stands after `ms`: still pending unless it settled by then. */
async function outcomeWithin(
  promise: Promise<unknown>,
  ms: number
): Promise<Outcome> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => resolve("pending"), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        (): Outcome => "resolved",
        (): Outcome => "rejected"
      ),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function closeServer(server: http.Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}

describe("the media proxy when Stash fails mid-transfer", () => {
  let stashServer: http.Server;
  /** Stash's side of each transfer still open, oldest first. */
  const openTransfers: Socket[] = [];
  let stashRequests = 0;
  let peekUrl: string;
  let closePeek: () => Promise<void>;

  beforeAll(async () => {
    // Every image: headers promising 1,000 bytes, then the first 100, then
    // nothing until the test resets the connection (or never)
    stashServer = http.createServer((req, res) => {
      stashRequests++;
      res.writeHead(200, {
        "content-type": "image/jpeg",
        "content-length": String(PROMISED_BYTES),
      });
      res.write(Buffer.alloc(SENT_BYTES, 1));
      openTransfers.push(req.socket);
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
      app.get("/api/proxy/stash", authenticated(proxyStashMedia));
    });
    peekUrl = peek.baseUrl;
    closePeek = peek.close;
  });

  afterAll(async () => {
    await closePeek();
    await closeServer(stashServer);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    stashRequests = 0;
    for (const socket of openTransfers.splice(0)) socket.destroy();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The browser's request for a scene's screenshot, answered once headers arrive. */
  async function requestScreenshot(
    sceneId: number,
    signal?: AbortSignal
  ): Promise<Response> {
    const res = await fetch(
      `${peekUrl}/api/proxy/stash?path=/scene/${sceneId}/screenshot&instanceId=inst-a`,
      signal ? { signal } : {}
    );
    // The response has started: its status and length are out
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe(String(PROMISED_BYTES));
    return res;
  }

  /** Stash drops the oldest open transfer with a reset. */
  function resetOldestTransfer(): void {
    must(openTransfers.shift(), "an open transfer").resetAndDestroy();
  }

  /** Resolves once Stash's side of the oldest open transfer has closed. */
  function oldestTransferClosed(): Promise<void> {
    const socket = must(openTransfers.shift(), "an open transfer");
    if (socket.destroyed) return Promise.resolve();
    return new Promise((resolve) => socket.once("close", () => resolve()));
  }

  it("an upstream that sends 100 of 1,000 promised bytes and resets ends the client's response within a second", async () => {
    const res = await requestScreenshot(1);

    resetOldestTransfer();

    expect(await outcomeWithin(res.arrayBuffer(), 1000)).toBe("rejected");
    // Logged as Stash's failure, not as a browser that left
    expect(logger.warn).toHaveBeenCalledWith(
      stringContaining("[PROXY stash media] Stash failed mid-transfer"),
      expect.anything()
    );
    expect(logger.debug).not.toHaveBeenCalledWith(
      stringContaining("Client disconnected")
    );
  });

  it("seven such requests in a row all end (the six slots are released)", async () => {
    for (let sceneId = 1; sceneId <= 7; sceneId++) {
      const res = await requestScreenshot(sceneId);
      resetOldestTransfer();
      expect(
        await outcomeWithin(res.arrayBuffer(), 1000),
        `request ${sceneId}`
      ).toBe("rejected");
    }
    expect(stashRequests).toBe(7);
  });

  it("an upstream that stalls after headers is ended at the timeout", async () => {
    // The proxy's idle timeout on its request to Stash, fired by the test
    // rather than after 30 s of silence
    const timeouts: { ms: number; fire: () => void }[] = [];
    vi.spyOn(http.ClientRequest.prototype, "setTimeout").mockImplementation(
      function (this: http.ClientRequest, ms: number, callback?: () => void) {
        timeouts.push({ ms, fire: callback ?? (() => undefined) });
        return this;
      }
    );

    const res = await requestScreenshot(1);

    // Stash sent headers and 100 bytes, then nothing
    const timeout = must(timeouts[0], "the proxy's upstream timeout");
    expect(timeout.ms).toBe(30000);
    timeout.fire();

    expect(await outcomeWithin(res.arrayBuffer(), 1000)).toBe("rejected");
    expect(logger.warn).toHaveBeenCalledWith(
      stringContaining("[PROXY stash media] Stash sent nothing for 30000 ms"),
      expect.anything()
    );
  });

  it("a browser that leaves mid-transfer ends Stash's side, frees its slot and logs at debug only", async () => {
    // Seven in a row: a slot held by any of them would leave the seventh
    // queued, and its headers would never come
    for (let sceneId = 1; sceneId <= 7; sceneId++) {
      const browser = new AbortController();
      await requestScreenshot(sceneId, browser.signal);

      browser.abort();

      await oldestTransferClosed();
    }
    expect(stashRequests).toBe(7);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

/** What Stash received for one request, in lower-case header names. */
interface StashRequest {
  url: string;
  headers: http.IncomingHttpHeaders;
}

const FILE_BYTES = 1000;

describe("the media proxy and byte ranges", () => {
  let stashServer: http.Server;
  const stashRequests: StashRequest[] = [];
  let peekUrl: string;
  let closePeek: () => Promise<void>;
  const mockPrisma = vi.mocked(prisma, true);

  beforeAll(async () => {
    // A Stash that serves byte ranges: "bytes=0-9" gets 206 with 10 bytes,
    // anything else the whole file with its validators
    stashServer = http.createServer((req, res) => {
      stashRequests.push({ url: req.url ?? "", headers: req.headers });
      res.setHeader("content-type", "video/mp4");
      res.setHeader("accept-ranges", "bytes");
      res.setHeader("etag", '"abc123"');
      res.setHeader("last-modified", "Wed, 01 Jan 2025 00:00:00 GMT");
      if (req.headers.range === "bytes=0-9") {
        res.writeHead(206, {
          "content-range": `bytes 0-9/${FILE_BYTES}`,
          "content-length": "10",
        });
        res.end(Buffer.alloc(10, 1));
        return;
      }
      res.writeHead(200, { "content-length": String(FILE_BYTES) });
      res.end(Buffer.alloc(FILE_BYTES, 1));
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
      app.get("/api/proxy/scene/:id/preview", authenticated(proxyScenePreview));
      app.get("/api/proxy/scene/:id/webp", authenticated(proxySceneWebp));
      app.get("/api/proxy/stash", authenticated(proxyStashMedia));
      app.get("/api/proxy/clip/:id/preview", authenticated(proxyClipPreview));
      app.get("/api/proxy/image/:imageId/:type", authenticated(proxyImage));
    });
    peekUrl = peek.baseUrl;
    closePeek = peek.close;
  });

  afterAll(async () => {
    await closePeek();
    await closeServer(stashServer);
  });

  beforeEach(() => {
    stashRequests.length = 0;
    mockPrisma.stashClip.findUnique.mockResolvedValue({
      streamPath: `${state.stashUrl}/clip/9/stream.mp4`,
      screenshotPath: null,
      deletedAt: null,
    } as never);
    mockPrisma.stashImage.findUnique.mockResolvedValue({
      pathThumbnail: null,
      pathPreview: null,
      pathImage: "/image/5/image",
      deletedAt: null,
    } as never);
  });

  /** Every handler's route, with a path that reaches Stash. */
  const ROUTES: Record<string, string> = {
    "scene preview": "/api/proxy/scene/1/preview?instanceId=inst-a",
    "scene webp": "/api/proxy/scene/1/webp?instanceId=inst-a",
    "stash media":
      "/api/proxy/stash?path=/scene/1/screenshot&instanceId=inst-a",
    "clip preview": "/api/proxy/clip/9/preview?instanceId=inst-a",
    image: "/api/proxy/image/5/image?instanceId=inst-a",
  };

  it("a Range request for a scene preview reaches Stash and answers 206 with Stash's Content-Range and 10 bytes", async () => {
    const res = await fetch(`${peekUrl}${ROUTES["scene preview"]}`, {
      headers: { Range: "bytes=0-9" },
    });

    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-9/${FILE_BYTES}`);
    expect((await res.arrayBuffer()).byteLength).toBe(10);
    expect(stashRequests[0]?.headers.range).toBe("bytes=0-9");
  });

  it("Accept-Ranges, ETag and Last-Modified pass through on a full response", async () => {
    const res = await fetch(`${peekUrl}${ROUTES["scene preview"]}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("etag")).toBe('"abc123"');
    expect(res.headers.get("last-modified")).toBe(
      "Wed, 01 Jan 2025 00:00:00 GMT"
    );
    expect((await res.arrayBuffer()).byteLength).toBe(FILE_BYTES);
  });

  it("no Range header from the browser sends none to Stash", async () => {
    const res = await fetch(`${peekUrl}${ROUTES["scene preview"]}`);
    await res.arrayBuffer();

    expect(stashRequests).toHaveLength(1);
    expect(stashRequests[0]?.headers.range).toBeUndefined();
    expect(stashRequests[0]?.headers["if-range"]).toBeUndefined();
  });

  it.each(Object.entries(ROUTES))(
    "the %s handler passes Range and If-Range to Stash and answers 206",
    async (_name, route) => {
      const res = await fetch(`${peekUrl}${route}`, {
        headers: { Range: "bytes=0-9", "If-Range": '"abc123"' },
      });

      expect(res.status).toBe(206);
      expect((await res.arrayBuffer()).byteLength).toBe(10);
      expect(stashRequests[0]?.headers.range).toBe("bytes=0-9");
      expect(stashRequests[0]?.headers["if-range"]).toBe('"abc123"');
    }
  );
});

/** Bytes Stash sends for a large preview: far more than the sockets buffer. */
const LARGE_BYTES = 32 * 1024 * 1024;

describe("the media proxy and a browser that reads slowly", () => {
  let stashServer: http.Server;
  /** Bytes Stash has handed to its socket in the latest transfer. */
  let stashSent = 0;
  let peekUrl: string;
  let closePeek: () => Promise<void>;
  let setTimeoutSpy: { mockRestore: () => void } | undefined;

  beforeAll(async () => {
    // A large preview, written as fast as Peek reads it
    stashServer = http.createServer((_req, res) => {
      stashSent = 0;
      res.writeHead(200, {
        "content-type": "video/mp4",
        "content-length": String(LARGE_BYTES),
      });
      const chunk = Buffer.alloc(64 * 1024, 1);
      const writeMore = (): void => {
        while (stashSent < LARGE_BYTES) {
          stashSent += chunk.length;
          if (!res.write(chunk)) {
            res.once("drain", writeMore);
            return;
          }
        }
        res.end();
      };
      writeMore();
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
      app.get("/api/proxy/scene/:id/preview", authenticated(proxyScenePreview));
    });
    peekUrl = peek.baseUrl;
    closePeek = peek.close;
  });

  afterAll(async () => {
    await closePeek();
    await closeServer(stashServer);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    stashSent = 0;
  });

  afterEach(() => {
    setTimeoutSpy?.mockRestore();
    setTimeoutSpy = undefined;
  });

  /** The browser's request, its body left unread once the headers came. */
  function requestPaused(): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      http
        .get(`${peekUrl}/api/proxy/scene/1/preview?instanceId=inst-a`, (res) => {
          res.pause();
          resolve(res);
        })
        .on("error", reject);
    });
  }

  /** Reads the rest of the body; rejects when the response is cut short. */
  function readAll(res: http.IncomingMessage): Promise<number> {
    return new Promise((resolve, reject) => {
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
      });
      res.on("end", () => resolve(bytes));
      res.on("error", reject);
      res.on("close", () => {
        if (!res.complete) reject(new Error("the response was cut short"));
      });
      res.resume();
    });
  }

  it("a browser that stops reading is not taken for a silent Stash", async () => {
    // The proxy's idle timeout on its request to Stash, fired by the test
    const timeouts: { ms: number; fire: () => void }[] = [];
    setTimeoutSpy = vi
      .spyOn(http.ClientRequest.prototype, "setTimeout")
      .mockImplementation(function (
        this: http.ClientRequest,
        ms: number,
        callback?: () => void
      ) {
        timeouts.push({ ms, fire: callback ?? (() => undefined) });
        return this;
      });

    const res = await requestPaused();
    expect(res.statusCode).toBe(200);
    // Every buffer between the browser and Stash fills: Peek stops reading
    // from Stash because the browser stopped reading from Peek, and Stash
    // sends nothing more
    let lastSent = -1;
    await vi.waitFor(
      () => {
        const moved = stashSent !== lastSent;
        lastSent = stashSent;
        expect(moved).toBe(false);
      },
      { timeout: 10000, interval: 200 }
    );
    expect(stashSent).toBeLessThan(LARGE_BYTES);

    // The idle limit passes while the browser holds the transfer back
    must(timeouts[0], "the proxy's upstream timeout").fire();

    expect(await readAll(res)).toBe(LARGE_BYTES);
    expect(logger.warn).not.toHaveBeenCalled();
  }, 15000);
});
