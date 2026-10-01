/**
 * fetchFromStash and pipeResponseToClient over real HTTP, against a stand-in
 * for Stash on a random port, with real (short) limits: what a Stash that
 * stalls does to the browser's request, and what a slow reader does not.
 */
import { EventEmitter } from "events";
import type { Response } from "express";
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
import { logger } from "../../utils/logger.js";
import {
  StashTimeoutError,
  fetchFromStash,
  pipeResponseToClient,
} from "../../utils/streamProxy.js";
import { stringContaining } from "../helpers/matchers.js";

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

type StandIn = (req: http.IncomingMessage, res: http.ServerResponse) => void;

const LIMIT_MS = 50;

function closeServer(server: http.Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves once the stand-in's side of `socket` has closed. */
function socketClosed(socket: Socket): Promise<void> {
  if (socket.destroyed) return Promise.resolve();
  return new Promise((resolve) => socket.once("close", () => resolve()));
}

/** A response object for fetchFromStash: it only needs to emit "close". */
function fakeClientRes(): Response {
  return new EventEmitter() as unknown as Response;
}

describe("Stash fetches over real HTTP", () => {
  let stash: http.Server;
  let stashUrl: string;
  /** What the stand-in does for the next request. */
  let behaviour: StandIn;
  /** Sockets of the requests the stand-in has seen, oldest first. */
  const sockets: Socket[] = [];
  /** Servers the test started for the "Peek" side; closed afterwards. */
  const peekServers: http.Server[] = [];

  beforeAll(async () => {
    stash = http.createServer((req, res) => {
      sockets.push(req.socket);
      behaviour(req, res);
    });
    await new Promise<void>((resolve) => stash.listen(0, "127.0.0.1", resolve));
    stashUrl = `http://127.0.0.1:${(stash.address() as AddressInfo).port}/x`;
  });

  afterAll(async () => {
    await closeServer(stash);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    sockets.length = 0;
  });

  afterEach(async () => {
    for (const socket of sockets) socket.destroy();
    await Promise.all(peekServers.splice(0).map(closeServer));
  });

  /** A Peek-side server whose handler runs `pipeResponseToClient` on Stash's answer. */
  async function startPeek(
    idleTimeoutMs: number,
    outcome: { done?: Promise<void> } = {}
  ): Promise<string> {
    const peek = http.createServer((req, res) => {
      void (async () => {
        try {
          const { response, abort } = await fetchFromStash(stashUrl, {
            apiKey: "k",
            clientRes: res as unknown as Response,
            headersTimeoutMs: 5000,
          });
          outcome.done = pipeResponseToClient(
            response,
            res as unknown as Response,
            "[TEST]",
            ["content-type"],
            { idleTimeoutMs, abort }
          );
        } catch {
          res.destroy();
        }
      })();
      req.resume();
    });
    await new Promise<void>((resolve) => peek.listen(0, "127.0.0.1", resolve));
    peekServers.push(peek);
    return `http://127.0.0.1:${(peek.address() as AddressInfo).port}`;
  }

  it("fetchFromStash rejects with StashTimeoutError when Stash sends no headers within headersTimeoutMs, and the stand-in sees its request closed", async () => {
    behaviour = () => {
      // Never answers
    };

    await expect(
      fetchFromStash(stashUrl, {
        apiKey: "k",
        clientRes: fakeClientRes(),
        headersTimeoutMs: LIMIT_MS,
      })
    ).rejects.toBeInstanceOf(StashTimeoutError);

    await socketClosed(sockets[0] as Socket);
  });

  it("the headers limit does not cut a long body", async () => {
    behaviour = (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("a");
      // Body outlasts the 50 ms headers limit by a wide margin
      setTimeout(() => res.end("b"), LIMIT_MS * 4);
    };

    const { response } = await fetchFromStash(stashUrl, {
      apiKey: "k",
      clientRes: fakeClientRes(),
      headersTimeoutMs: LIMIT_MS,
    });

    expect(await response.text()).toBe("ab");
  });

  it("fetchFromStash aborts the upstream request when the client's response closes", async () => {
    behaviour = (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("a");
    };
    const clientRes = fakeClientRes();

    const { response } = await fetchFromStash(stashUrl, {
      apiKey: "k",
      clientRes,
      headersTimeoutMs: 5000,
    });
    clientRes.emit("close");

    await expect(response.text()).rejects.toThrow();
    await socketClosed(sockets[0] as Socket);
  });

  it("fetchFromStash aborts the upstream request when the given signal aborts", async () => {
    behaviour = (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("a");
    };
    const job = new AbortController();

    const { response } = await fetchFromStash(stashUrl, {
      apiKey: "k",
      signal: job.signal,
      headersTimeoutMs: 5000,
    });
    job.abort();

    await expect(response.text()).rejects.toThrow();
    await socketClosed(sockets[0] as Socket);
  });

  it("pipeResponseToClient ends the client's response and aborts Stash's when no chunk arrives for idleTimeoutMs, and logs at warn once", async () => {
    behaviour = (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("first");
      // then silence
    };
    const outcome: { done?: Promise<void> } = {};
    const peekUrl = await startPeek(LIMIT_MS, outcome);

    const res = await fetch(peekUrl);
    // The client's response ends with an error once the idle limit passes
    await expect(res.text()).rejects.toThrow();
    await outcome.done;

    await socketClosed(sockets[0] as Socket);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      stringContaining("[TEST] Stash sent nothing for")
    );
    expect(logger.debug).not.toHaveBeenCalledWith(
      stringContaining("Client disconnected")
    );
  });

  it("a body that keeps sending is never cut, however long", async () => {
    behaviour = (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      let sent = 0;
      const timer = setInterval(() => {
        // Ten chunks, 30 ms apart: 300 ms, well past the 50 ms idle limit
        res.write("x");
        if (++sent === 10) {
          clearInterval(timer);
          res.end();
        }
      }, 30);
    };
    const peekUrl = await startPeek(LIMIT_MS);

    const res = await fetch(peekUrl);

    expect(await res.text()).toBe("x".repeat(10));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("a client that stops reading for longer than idleTimeoutMs is not cut, and receives the rest once it reads again", async () => {
    const chunk = Buffer.alloc(64 * 1024, 7);
    const chunks = 400; // 25 MB: more than the socket buffers hold
    behaviour = (_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      let sent = 0;
      const write = (): void => {
        while (sent < chunks) {
          sent++;
          if (!res.write(chunk)) {
            res.once("drain", write);
            return;
          }
        }
        res.end();
      };
      write();
    };
    const peekUrl = await startPeek(LIMIT_MS);

    const res = await fetch(peekUrl);
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    // Read one piece, then stop reading for four idle limits
    let total = (await reader.read()).value?.byteLength ?? 0;
    await sleep(LIMIT_MS * 4);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
    }

    expect(total).toBe(chunk.byteLength * chunks);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
