/**
 * StashClient's request bounds: every request times out, a scoped client's
 * requests end when its signal aborts, and describeStashError reports what
 * Stash said without the request.
 */
import {
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
  createServer,
} from "http";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it } from "vitest";
import {
  STASH_REQUEST_TIMEOUT_MS,
  StashClient,
  StashRequestTimeoutError,
  describeStashError,
} from "../../graphql/StashClient.js";
import { stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

const servers: Server[] = [];

/**
 * A local server on port 0: `answer` responds to each request, or leaves it
 * unanswered when it does nothing.
 */
async function startServer(
  answer: (res: ServerResponse, received: Received) => void = () => undefined,
  received: Received[] = []
): Promise<string> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const request = {
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      received.push(request);
      answer(res, request);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/graphql`;
}

function answerJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Rejects with "still running" when `promise` has not settled after `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error(`still running after ${ms} ms`));
      }, ms)
    ),
  ]);
}

/** The rejection `promise` ends with, or a failure when it resolves. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the request to fail");
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("StashClient", () => {
  it("rejects with StashRequestTimeoutError naming the operation after requestTimeoutMs", async () => {
    const url = await startServer();
    const client = new StashClient({
      url,
      apiKey: "key",
      requestTimeoutMs: 100,
    });

    const started = Date.now();
    const error = await rejectionOf(within(client.findTags({}), 2000));

    expect(String(error)).toMatch(/FindTags timed out after 0\.1 s/);
    expect(error).toBeInstanceOf(StashRequestTimeoutError);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("times out an answer whose body stops midway", async () => {
    const url = await startServer((res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"data":');
    });
    const client = new StashClient({
      url,
      apiKey: "key",
      requestTimeoutMs: 100,
    });

    await expect(within(client.findTags({}), 2000)).rejects.toThrow(
      /FindTags timed out after 0\.1 s/
    );
  });

  it("times out after two minutes by default", () => {
    expect(STASH_REQUEST_TIMEOUT_MS).toBe(120_000);
  });

  it("a withSignal client rejects as soon as the signal aborts", async () => {
    const url = await startServer();
    const controller = new AbortController();
    const client = new StashClient({ url, apiKey: "key" }).withSignal(
      controller.signal
    );

    const request = client.findTags({});
    setTimeout(() => controller.abort(), 50);

    await expect(within(request, 1000)).rejects.toThrow("Sync aborted");
  });

  it("a withSignal client does not send a request once the signal has aborted", async () => {
    const received: Received[] = [];
    const url = await startServer(
      (res) => answerJson(res, 200, { data: { version: {} } }),
      received
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      new StashClient({ url, apiKey: "key" })
        .withSignal(controller.signal)
        .version()
    ).rejects.toThrow("Sync aborted");
    expect(received).toHaveLength(0);
  });

  it("sends the ApiKey header and resolves normally", async () => {
    const received: Received[] = [];
    const url = await startServer(
      (res) =>
        answerJson(res, 200, { data: { findTags: { count: 0, tags: [] } } }),
      received
    );
    const controller = new AbortController();
    const client = new StashClient({ url, apiKey: "secret-key" });

    await expect(client.findTags({})).resolves.toEqual({
      findTags: { count: 0, tags: [] },
    });
    await expect(
      client.withSignal(controller.signal).findTags({})
    ).resolves.toEqual({ findTags: { count: 0, tags: [] } });
    expect(received.map((r) => r.headers.apikey)).toEqual([
      "secret-key",
      "secret-key",
    ]);
    expect(received.map((r) => r.body)).toEqual([
      stringContaining("FindTags"),
      stringContaining("FindTags"),
    ]);
  });
});

describe("describeStashError", () => {
  it("describeStashError keeps GraphQL messages and the HTTP status, never the request", async () => {
    const url = await startServer((res) =>
      answerJson(res, 422, {
        errors: [
          { message: "input: tag_filter: unknown field" },
          { message: "second problem" },
        ],
      })
    );
    const client = new StashClient({ url, apiKey: "secret-key" });

    const error = await rejectionOf(
      client.findTags({ filter: { q: "private-search-term" } })
    );

    // The raw error carries the query and its variables
    expect(String(error)).toContain("private-search-term");
    const described = describeStashError(error);
    expect(described).toBe(
      "FindTags: input: tag_filter: unknown field; second problem (HTTP 422)"
    );
    expect(described).not.toContain("private-search-term");
    expect(described).not.toContain("query");
    expect(described).not.toContain("secret-key");
  });

  it("gives the HTTP status of an answer without GraphQL errors", async () => {
    const url = await startServer((res) => {
      res.writeHead(502, { "Content-Type": "text/html" });
      res.end("<html>Bad Gateway</html>");
    });

    const error = await rejectionOf(
      new StashClient({ url, apiKey: "key" }).version()
    );

    expect(describeStashError(error)).toBe("Version: Stash answered HTTP 502");
  });

  it("names the operation and the path of each GraphQL error, so a stored error says which field broke", async () => {
    // What Stash answers when a resolver fails on one row (SYNC-10)
    const url = await startServer((res) =>
      answerJson(res, 200, {
        data: null,
        errors: [
          {
            message:
              "runtime error: invalid memory address or nil pointer dereference",
            path: ["findStudios", "studios", 3, "parent_studio"],
          },
          { message: "a problem with no path" },
        ],
      })
    );
    const client = new StashClient({ url, apiKey: "secret-key" });

    const error = await rejectionOf(
      client.findStudios({ filter: { q: "private-search-term" } })
    );

    const described = describeStashError(error);
    expect(described).toBe(
      "FindStudios: runtime error: invalid memory address or nil pointer dereference (at findStudios.studios.3.parent_studio); a problem with no path (HTTP 200)"
    );
    expect(described).not.toContain("private-search-term");
    expect(described).not.toContain("query");
    expect(described).not.toContain("secret-key");
  });

  it("keeps a timeout's message", () => {
    expect(
      describeStashError(new StashRequestTimeoutError("FindScenes", 120_000))
    ).toBe("Stash request FindScenes timed out after 120 s");
  });

  it("names a network error by its code, without the address", async () => {
    const url = await startServer();
    const closed = must(servers.pop(), "the server");
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    const error = await rejectionOf(
      new StashClient({ url, apiKey: "key" }).version()
    );

    const described = describeStashError(error);
    expect(described).toBe("Could not reach Stash (ECONNREFUSED)");
    expect(described).not.toContain("127.0.0.1");
  });

  it("gives any other error's message, cut to 500 characters", () => {
    expect(describeStashError(new Error("Sync aborted"))).toBe("Sync aborted");
    expect(describeStashError("plain")).toBe("plain");
    const long = describeStashError(new Error("x".repeat(2000)));
    expect(long).toHaveLength(500);
    expect(long.endsWith("...")).toBe(true);
  });
});
