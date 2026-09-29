/**
 * What the media proxy logs when a response ends early, by who ended it.
 * `pipeline` reports ERR_STREAM_PREMATURE_CLOSE both when Stash fails and
 * when the browser closes the connection (a seek, a page change); only the
 * first is a warning. The pipeline is replaced here so the test decides when
 * it reports, and Stash's response is a stand-in in the state that matters:
 * destroyed, whole or cut short.
 */
import { EventEmitter } from "events";
import http from "http";
import net from "net";
import type * as streamModule from "stream";
import type { Writable } from "stream";
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

type PipelineCallback = (error?: Error) => void;

const state = vi.hoisted(() => ({
  pipelineCalls: [] as { res: Writable; done: PipelineCallback }[],
}));

vi.mock("stream", async (importOriginal) => {
  const actual = await importOriginal<typeof streamModule>();
  const pipeline = (
    _source: unknown,
    res: Writable,
    done: PipelineCallback
  ) => {
    state.pipelineCalls.push({ res, done });
  };
  return Object.assign({}, actual, { default: actual, pipeline });
});

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
        baseUrl: "http://127.0.0.1:1",
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

const PREMATURE_CLOSE = Object.assign(new Error("Premature close"), {
  code: "ERR_STREAM_PREMATURE_CLOSE",
});

describe("the media proxy's log when a response ends early", () => {
  let peekPort: number;
  let closePeek: () => Promise<void>;

  beforeAll(async () => {
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
    peekPort = Number(new URL(peek.baseUrl).port);
    closePeek = peek.close;
  });

  afterAll(async () => {
    await closePeek();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    state.pipelineCalls.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Stash answers at once with a response in the given state. */
  function stashAnswersWith(response: {
    destroyed: boolean;
    complete: boolean;
  }) {
    vi.spyOn(http, "get").mockImplementation(((
      _url: unknown,
      _options: unknown,
      callback: (res: http.IncomingMessage) => void
    ) => {
      const proxyReq = Object.assign(new EventEmitter(), {
        destroyed: false,
        destroy() {
          this.destroyed = true;
        },
        setTimeout: () => proxyReq,
      });
      queueMicrotask(() =>
        callback({
          headers: { "content-type": "video/mp4" },
          statusCode: 200,
          ...response,
        } as unknown as http.IncomingMessage)
      );
      return proxyReq;
    }) as unknown as typeof http.get);
  }

  /** A browser asking for a video; resolves with its connection once Peek has piped. */
  async function browserRequests(): Promise<net.Socket> {
    const browser = net.connect(peekPort, "127.0.0.1");
    browser.write(
      "GET /api/proxy/stash?path=/scene/1/screenshot HTTP/1.1\r\nHost: peek\r\n\r\n"
    );
    await vi.waitFor(() => expect(state.pipelineCalls).toHaveLength(1));
    return browser;
  }

  it("the browser closing after Stash sent its last byte is debug, not a warning", async () => {
    // Stash's response is destroyed once it ended, and it is complete
    stashAnswersWith({ destroyed: true, complete: true });
    const browser = await browserRequests();
    const { res, done } = must(state.pipelineCalls[0]);
    // The response closes before it finished: the pipeline reports it
    res.once("close", () => done(PREMATURE_CLOSE));

    browser.destroy();
    await vi.waitFor(() =>
      expect(logger.debug).toHaveBeenCalledWith(
        stringContaining("Client disconnected mid-transfer")
      )
    );

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("Stash closing before its last byte is a warning", async () => {
    // Destroyed and cut short: Stash ended the connection mid-body
    stashAnswersWith({ destroyed: true, complete: false });
    const browser = await browserRequests();
    const { res, done } = must(state.pipelineCalls[0]);
    // Stash's failure destroys the response: the pipeline reports it, and the
    // response closes after
    done(PREMATURE_CLOSE);
    res.destroy();

    await vi.waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        stringContaining("Stash failed mid-transfer"),
        expect.anything()
      )
    );

    expect(logger.debug).not.toHaveBeenCalledWith(
      stringContaining("Client disconnected")
    );
    browser.destroy();
  });
});
