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
import { proxyStashMedia } from "../../controllers/proxy.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import type * as stashInstanceManagerModule from "../../services/StashInstanceManager.js";
import { logger } from "../../utils/logger.js";
import { authenticated } from "../../utils/routeHelpers.js";
import { startTestApp } from "../helpers/httpTestApp.js";
import { stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";

const state = vi.hoisted(() => ({ stashUrl: "" }));

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/mediaAccess.js", () => ({
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
      `${peekUrl}/api/proxy/stash?path=/scene/${sceneId}/screenshot`,
      { signal }
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
