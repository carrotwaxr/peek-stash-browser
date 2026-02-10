import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { Response } from "express";
import { logger } from "./logger.js";

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
 */
export async function pipeResponseToClient(
  fetchResponse: globalThis.Response,
  res: Response,
  label: string,
  headersToForward?: string[],
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

  const nodeStream = Readable.fromWeb(
    fetchResponse.body as import("stream/web").ReadableStream,
  );

  try {
    await pipeline(nodeStream, res);
  } catch (err: unknown) {
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
  if ("code" in err && (err as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE") return true;
  return false;
}
