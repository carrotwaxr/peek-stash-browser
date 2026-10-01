import type { Response } from "express";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as WebReadableStream } from "stream/web";
import {
  AppError,
  BadGatewayError,
  GatewayTimeoutError,
  NotFoundError,
} from "../middleware/errorHandler.js";
import { logger } from "./logger.js";

/** Stash did not answer, or went quiet, within the limit. */
export class StashTimeoutError extends Error {
  constructor(message = "Stash did not answer in time") {
    super(message);
    this.name = "StashTimeoutError";
  }
}

const STASH_MEDIA_FAILED = "Stash could not serve this media";

/**
 * What Stash's status means for a media answer: null to pass it on (any 2xx,
 * and 206, 304 and 416, which Range and validators need), a NotFoundError for
 * 404, and a BadGatewayError for everything else (Stash's own 401, 403 and
 * 5xx say nothing the browser may act on, and are not the user's to see).
 */
export function stashFailure(status: number): AppError | null {
  if (status >= 200 && status < 300) return null;
  if (status === 304 || status === 416) return null;
  if (status === 404) return new NotFoundError();
  return new BadGatewayError(STASH_MEDIA_FAILED);
}

/**
 * The error a failed Stash fetch or read answers with, to be thrown to the
 * central handler; null when the client's own close caused it, which is
 * routine (a seek, a refresh). A StashTimeoutError is 504, an AppError stands
 * and anything else is 502.
 */
export function stashFetchError(err: unknown, res: Response): AppError | null {
  if (err instanceof StashTimeoutError) {
    return new GatewayTimeoutError("Stash did not answer");
  }
  if (err instanceof AppError) return err;
  const clientLeft =
    res.destroyed || (err instanceof Error && err.name === "AbortError");
  if (clientLeft) {
    logger.debug("Client closed before Stash answered");
    return null;
  }
  return new BadGatewayError(STASH_MEDIA_FAILED);
}

/**
 * The range a HEAD asks Stash for when the client named none: Stash answers
 * HEAD with 405 on its media routes, so a HEAD goes as a GET for one byte of
 * a file Stash serves by range.
 */
export const HEAD_PROBE_RANGE = "bytes=0-0";

/**
 * The status and length to answer a HEAD with, from Stash's answer to its
 * GET. A 206 (or a 416, for an empty file) to the one-byte range Peek added
 * is answered as 200 with the whole file's length from `Content-Range`, and
 * without that Content-Range, so the client reads what a GET would have
 * answered; any other answer stands as it is.
 */
export function headAnswer(
  upstream: {
    status: number;
    contentLength: string | null | undefined;
    contentRange: string | null | undefined;
  },
  rangeAdded: boolean
): {
  status: number;
  contentLength: string | undefined;
  keepContentRange: boolean;
} {
  const { status } = upstream;
  if (!rangeAdded || (status !== 206 && status !== 416)) {
    return {
      status,
      contentLength: upstream.contentLength ?? undefined,
      keepContentRange: true,
    };
  }
  const total = /\/(\d+)$/.exec(upstream.contentRange ?? "")?.[1];
  return { status: 200, contentLength: total, keepContentRange: false };
}

export interface StashFetchOptions {
  apiKey: string;
  /** Closing it aborts Stash's request (optional: a zip's job has no client) */
  clientRes?: Response;
  /** An outside abort, such as a zip job's signal */
  signal?: AbortSignal;
  headersTimeoutMs: number;
  /** Extra request headers (Range) */
  headers?: Record<string, string>;
}

/**
 * Fetch from Stash with the API key, giving up when no headers arrive within
 * `headersTimeoutMs` (StashTimeoutError), when the client's response closes
 * or when `signal` aborts. The returned AbortController stays live for the
 * body: aborting it, or either of those, cuts the transfer.
 */
export async function fetchFromStash(
  url: string,
  o: StashFetchOptions
): Promise<{ response: globalThis.Response; abort: AbortController }> {
  const abort = new AbortController();
  o.clientRes?.on("close", () => abort.abort());
  const signal = o.signal
    ? AbortSignal.any([abort.signal, o.signal])
    : abort.signal;
  const timer = setTimeout(
    () =>
      abort.abort(
        new StashTimeoutError(
          `Stash sent no response headers within ${o.headersTimeoutMs} ms`
        )
      ),
    o.headersTimeoutMs
  );
  try {
    const response = await fetch(url, {
      headers: { ApiKey: o.apiKey, ...o.headers },
      signal,
    });
    return { response, abort };
  } catch (err) {
    if (abort.signal.reason instanceof StashTimeoutError) {
      throw abort.signal.reason;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a Stash response whole as text, giving up (StashTimeoutError, and the
 * request aborted) when it takes longer than `timeoutMs` in all.
 */
export async function readStashText(
  response: globalThis.Response,
  abort: AbortController,
  timeoutMs: number
): Promise<string> {
  const timer = setTimeout(
    () =>
      abort.abort(
        new StashTimeoutError(`Stash sent no body within ${timeoutMs} ms`)
      ),
    Math.max(timeoutMs, 0)
  );
  try {
    return await response.text();
  } catch (err) {
    if (abort.signal.reason instanceof StashTimeoutError) {
      throw abort.signal.reason;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface IdleLimit {
  /** The most Stash may send nothing before the transfer is cut */
  idleTimeoutMs: number;
  /** Aborts Stash's request, as fetchFromStash returned it */
  abort: AbortController;
}

/**
 * Pipe a fetch Response body to an Express response using Node.js streams.
 *
 * Uses `Readable.fromWeb()` + `stream.pipeline()` for proper backpressure
 * and automatic cleanup when either side disconnects.
 *
 * Silently swallows AbortError / ERR_STREAM_PREMATURE_CLOSE since these
 * are expected when the client navigates away or seeks in a video.
 *
 * @param fetchResponse - The fetch() Response whose body will be piped
 * @param res - Express Response to write to
 * @param label - Short label for log messages (e.g. "[PROXY]", "[DOWNLOAD]")
 * @param headersToForward - Optional list of header names to copy from fetchResponse to res
 * @param idle - Optional idle limit: when Stash sends no chunk for `idleTimeoutMs`
 *   (and the client is reading), Stash's request is aborted and `res` destroyed
 */
export async function pipeResponseToClient(
  fetchResponse: globalThis.Response,
  res: Response,
  label: string,
  headersToForward?: string[],
  idle?: IdleLimit
): Promise<void> {
  // Forward headers if requested
  if (headersToForward) {
    for (const header of headersToForward) {
      const value = fetchResponse.headers.get(header);
      if (value) {
        res.setHeader(header, value);
      }
    }
  }

  if (!fetchResponse.body) {
    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(fetchResponse.body as WebReadableStream);

  let timer: NodeJS.Timeout | undefined;
  const idleState = { stalled: false };

  try {
    if (idle) {
      const arm = (): void => {
        clearTimeout(timer);
        timer = setTimeout(onIdle, idle.idleTimeoutMs);
      };
      const onIdle = (): void => {
        // A client that has stopped reading is not a silent Stash: the
        // pipeline is paused by backpressure, so wait for it
        if (res.writableNeedDrain) {
          arm();
          return;
        }
        idleState.stalled = true;
        logger.warn(`${label} Stash sent nothing for ${idle.idleTimeoutMs} ms`);
        idle.abort.abort(new StashTimeoutError());
        res.destroy();
      };
      arm();
      const guard = new Transform({
        transform(chunk, _encoding, callback) {
          arm();
          callback(null, chunk);
        },
      });
      await pipeline(nodeStream, guard, res);
    } else {
      await pipeline(nodeStream, res);
    }
  } catch (err: unknown) {
    // Already logged where the idle timer fired
    if (idleState.stalled) return;
    // Client disconnects (seek, refresh, navigate away) cause these errors.
    // They are completely expected and not worth logging as errors.
    if (isExpectedDisconnectError(err)) {
      logger.debug(`${label} Client disconnected (stream closed early)`);
      return;
    }
    // Unexpected error — log it but don't re-throw since the response is
    // already in an indeterminate state.
    logger.error(`${label} Stream pipeline error`, {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns true for errors that are expected when a client disconnects
 * mid-stream (e.g. user seeks in a video, refreshes, or navigates away).
 */
function isExpectedDisconnectError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // AbortError is thrown when an AbortController.abort() fires
  if (err.name === "AbortError") return true;
  // ERR_STREAM_PREMATURE_CLOSE is thrown by pipeline() when the writable
  // (Express response) is destroyed before the readable is done
  if (
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE"
  )
    return true;
  return false;
}
