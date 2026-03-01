import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../utils/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn() },
}));

vi.mock("stream/promises", () => ({
  pipeline: vi.fn(),
}));

vi.mock("stream", () => ({
  Readable: { fromWeb: vi.fn() },
}));

import { pipeResponseToClient } from "../../utils/streamProxy.js";
import { logger } from "../../utils/logger.js";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

function makeFetchResponse(opts: {
  headers?: Record<string, string>;
  body?: unknown;
}): globalThis.Response {
  const headersMap = new Map(Object.entries(opts.headers ?? {}));
  return {
    headers: { get: (name: string) => headersMap.get(name) ?? null },
    body: opts.body ?? null,
  } as unknown as globalThis.Response;
}

function makeExpressResponse() {
  return {
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as import("express").Response;
}

describe("pipeResponseToClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards specified headers from fetch response to Express response", async () => {
    const fetchRes = makeFetchResponse({
      headers: { "content-type": "video/mp4", "content-length": "12345" },
      body: null,
    });
    const res = makeExpressResponse();

    await pipeResponseToClient(fetchRes, res, "[TEST]", [
      "content-type",
      "content-length",
    ]);

    expect(res.setHeader).toHaveBeenCalledWith("content-type", "video/mp4");
    expect(res.setHeader).toHaveBeenCalledWith("content-length", "12345");
  });

  it("skips headers that don't exist on fetch response", async () => {
    const fetchRes = makeFetchResponse({
      headers: { "content-type": "video/mp4" },
      body: null,
    });
    const res = makeExpressResponse();

    await pipeResponseToClient(fetchRes, res, "[TEST]", [
      "content-type",
      "x-missing-header",
    ]);

    expect(res.setHeader).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith("content-type", "video/mp4");
  });

  it("calls res.end() when fetchResponse.body is null", async () => {
    const fetchRes = makeFetchResponse({ body: null });
    const res = makeExpressResponse();

    await pipeResponseToClient(fetchRes, res, "[TEST]");

    expect(res.end).toHaveBeenCalledOnce();
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("converts web stream to node stream and pipes via pipeline", async () => {
    const fakeBody = { locked: false };
    const fakeNodeStream = { pipe: vi.fn() };
    vi.mocked(Readable.fromWeb).mockReturnValue(fakeNodeStream as never);
    vi.mocked(pipeline).mockResolvedValue(undefined);

    const fetchRes = makeFetchResponse({ body: fakeBody });
    const res = makeExpressResponse();

    await pipeResponseToClient(fetchRes, res, "[TEST]");

    expect(Readable.fromWeb).toHaveBeenCalledWith(fakeBody);
    expect(pipeline).toHaveBeenCalledWith(fakeNodeStream, res);
  });

  it("silently swallows AbortError (logs debug, not error)", async () => {
    const fakeBody = { locked: false };
    vi.mocked(Readable.fromWeb).mockReturnValue({} as never);

    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    vi.mocked(pipeline).mockRejectedValue(abortError);

    const fetchRes = makeFetchResponse({ body: fakeBody });
    const res = makeExpressResponse();

    await pipeResponseToClient(fetchRes, res, "[PROXY]");

    expect(logger.debug).toHaveBeenCalledWith(
      "[PROXY] Client disconnected (stream closed early)",
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("silently swallows ERR_STREAM_PREMATURE_CLOSE", async () => {
    const fakeBody = { locked: false };
    vi.mocked(Readable.fromWeb).mockReturnValue({} as never);

    const prematureCloseError = new Error("Premature close") as NodeJS.ErrnoException;
    prematureCloseError.code = "ERR_STREAM_PREMATURE_CLOSE";
    vi.mocked(pipeline).mockRejectedValue(prematureCloseError);

    const fetchRes = makeFetchResponse({ body: fakeBody });
    const res = makeExpressResponse();

    await pipeResponseToClient(fetchRes, res, "[STREAM]");

    expect(logger.debug).toHaveBeenCalledWith(
      "[STREAM] Client disconnected (stream closed early)",
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs error for unexpected pipeline errors", async () => {
    const fakeBody = { locked: false };
    vi.mocked(Readable.fromWeb).mockReturnValue({} as never);

    const unexpectedError = new Error("ECONNRESET");
    vi.mocked(pipeline).mockRejectedValue(unexpectedError);

    const fetchRes = makeFetchResponse({ body: fakeBody });
    const res = makeExpressResponse();

    await pipeResponseToClient(fetchRes, res, "[PROXY]");

    expect(logger.error).toHaveBeenCalledWith("[PROXY] Stream pipeline error", {
      error: "ECONNRESET",
    });
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it("works with no headersToForward parameter", async () => {
    const fetchRes = makeFetchResponse({
      headers: { "content-type": "video/mp4" },
      body: null,
    });
    const res = makeExpressResponse();

    await pipeResponseToClient(fetchRes, res, "[TEST]");

    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledOnce();
  });
});
