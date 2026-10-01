import type { Response } from "express";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { logger } from "./logger.js";

/** Stash did not answer, or went quiet, within the limit. */
export class StashTimeoutError extends Error {
  constructor(message = "Stash did not answer in time") {
    super(message);
    this.name = "StashTimeoutError";
  }
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
