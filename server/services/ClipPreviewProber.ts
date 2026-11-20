import crypto from "crypto";
import http from "http";
import https from "https";
import { URL } from "url";
import { redactUrl } from "../utils/logRedaction.js";
import { logger } from "../utils/logger.js";
import { emptyToNull } from "../utils/sqlHelpers.js";

const MIN_PREVIEW_SIZE = 5 * 1024; // 5KB - below this is likely a placeholder
const PLACEHOLDER_SIZE = 1199; // Exact size of Stash's "Pending Generate" placeholder
const PLACEHOLDER_MD5 = "c4a2e6b6547057dd0ef0c7d7e3c420d4"; // MD5 hash of placeholder image

/** Why a preview counts as not generated */
export type ProbeMissReason =
  | "placeholder"
  | "not_found"
  | "too_small"
  | "fetch_error";

/**
 * What probing one preview found. A miss names its reason; `status` is the
 * HTTP status that caused it and `error` the failure's text. Neither holds
 * the URL or the API key the URL carries.
 */
export type ProbeOutcome =
  | { generated: true }
  | {
      generated: false;
      reason: ProbeMissReason;
      status?: number;
      error?: string;
    };

interface ProberOptions {
  maxConcurrent?: number;
  timeoutMs?: number;
}

/** A probe request that failed: an HTTP status, or an error with a safe message */
class ProbeFailure extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

/** The failure as a message without secrets, from whatever was thrown */
function failureOf(err: unknown): ProbeFailure {
  if (err instanceof ProbeFailure) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ProbeFailure(redactUrl(message));
}

export class ClipPreviewProber {
  private readonly maxConcurrent: number;
  private readonly timeoutMs: number;

  constructor(options: ProberOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 10;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  /** Whether the preview is a real one; `probePreviewOutcome` says why not */
  async probePreviewUrl(url: string): Promise<boolean> {
    return (await this.probePreviewOutcome(url)).generated;
  }

  /**
   * Probe a single preview URL to determine if it's a real preview or placeholder.
   *
   * Detection strategy:
   * 1. Use Range request to get total file size efficiently
   * 2. If size != 1199 bytes, use size threshold (>= 5KB = real preview)
   * 3. If size == 1199 bytes (placeholder size), fetch content and verify MD5 hash
   *
   * This hash-based approach prevents false negatives for legitimate small clips
   * while still correctly identifying the "Pending Generate" placeholder.
   *
   * A miss names its reason: a 404 is `not_found`, any other failed request
   * (network, timeout, another status) `fetch_error`.
   */
  async probePreviewOutcome(url: string): Promise<ProbeOutcome> {
    try {
      const size = await this.getPreviewSize(url);

      // Not the placeholder's size: the size decides
      if (size !== PLACEHOLDER_SIZE) {
        return size >= MIN_PREVIEW_SIZE
          ? { generated: true }
          : { generated: false, reason: "too_small" };
      }

      // Size matches placeholder exactly - need to verify via hash
      return (await this.verifyNotPlaceholder(url))
        ? { generated: true }
        : { generated: false, reason: "placeholder" };
    } catch (err) {
      const failure = failureOf(err);
      logger.debug("Preview probe error", {
        url: redactUrl(url),
        error: failure.message,
        status: failure.status,
      });
      if (failure.status === 404) {
        return { generated: false, reason: "not_found", status: 404 };
      }
      return {
        generated: false,
        reason: "fetch_error",
        ...(failure.status === undefined ? {} : { status: failure.status }),
        error: failure.message,
      };
    }
  }

  /**
   * Get the total size of a preview file via Range request.
   * Rejects with a `ProbeFailure` when the request fails or Stash answers
   * with a status that carries no size (404 included).
   */
  private getPreviewSize(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(url);
        const client = urlObj.protocol === "https:" ? https : http;

        const req = client.request(
          {
            method: "GET",
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            headers: {
              Range: "bytes=0-0",
            },
            timeout: this.timeoutMs,
          },
          (res) => {
            // Consume response body to prevent memory leak
            res.resume();

            // For 206 Partial Content, parse Content-Range for total size
            // Format: "bytes 0-0/398136"
            if (res.statusCode === 206) {
              const contentRange = res.headers["content-range"];
              if (contentRange) {
                const match = contentRange.match(/\/(\d+)$/);
                if (match) {
                  resolve(parseInt(match[1] as string, 10));
                  return;
                }
              }
            }

            // For 200 OK (server doesn't support Range), use Content-Length
            if (res.statusCode === 200) {
              resolve(
                parseInt(emptyToNull(res.headers["content-length"]) ?? "0", 10)
              );
              return;
            }

            // 404 or other statuses: no size to read
            reject(
              new ProbeFailure(
                `Stash answered HTTP ${res.statusCode ?? "without a status"}`,
                res.statusCode
              )
            );
          }
        );

        req.on("error", (err) => {
          logger.debug("Preview size check failed", {
            url: redactUrl(url),
            error: err.message,
          });
          reject(failureOf(err));
        });

        req.on("timeout", () => {
          req.destroy();
          reject(
            new ProbeFailure(`Timed out after ${this.timeoutMs} ms`, undefined)
          );
        });

        req.end();
      } catch (err) {
        logger.debug("Preview size check error", {
          url: redactUrl(url),
          error: String(err),
        });
        reject(failureOf(err));
      }
    });
  }

  /**
   * Fetch the full preview content and verify it's not the placeholder via MD5 hash.
   * Resolves true if the content is NOT the placeholder (i.e., it's a real preview).
   * Rejects with a `ProbeFailure` when the request fails.
   */
  private verifyNotPlaceholder(url: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(url);
        const client = urlObj.protocol === "https:" ? https : http;

        const req = client.request(
          {
            method: "GET",
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            timeout: this.timeoutMs,
          },
          (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              reject(
                new ProbeFailure(
                  `Stash answered HTTP ${res.statusCode ?? "without a status"}`,
                  res.statusCode
                )
              );
              return;
            }

            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => {
              const content = Buffer.concat(chunks);
              const hash = crypto
                .createHash("md5")
                .update(content)
                .digest("hex");
              // If hash matches placeholder, it's NOT generated
              // If hash doesn't match, it's a real preview that happens to be 1199 bytes
              const isGenerated = hash !== PLACEHOLDER_MD5;
              logger.debug("Placeholder hash check", {
                url: redactUrl(url),
                size: content.length,
                hash,
                isGenerated,
              });
              resolve(isGenerated);
            });
            res.on("error", (err) => reject(failureOf(err)));
          }
        );

        req.on("error", (err) => {
          logger.debug("Placeholder verification failed", {
            url: redactUrl(url),
            error: err.message,
          });
          reject(failureOf(err));
        });

        req.on("timeout", () => {
          req.destroy();
          reject(
            new ProbeFailure(`Timed out after ${this.timeoutMs} ms`, undefined)
          );
        });

        req.end();
      } catch (err) {
        logger.debug("Placeholder verification error", {
          url: redactUrl(url),
          error: String(err),
        });
        reject(failureOf(err));
      }
    });
  }

  /**
   * Probe multiple URLs with concurrency limiting.
   * Returns Map of url -> outcome (with the reason for each miss).
   */
  async probeBatchDetailed(urls: string[]): Promise<Map<string, ProbeOutcome>> {
    const results = new Map<string, ProbeOutcome>();
    const queue = [...urls];
    const inFlight: Promise<void>[] = [];

    const processNext = async (): Promise<void> => {
      const url = queue.shift();
      if (!url) return;

      results.set(url, await this.probePreviewOutcome(url));
      await processNext();
    };

    // Start up to maxConcurrent workers
    for (let i = 0; i < Math.min(this.maxConcurrent, urls.length); i++) {
      inFlight.push(processNext());
    }

    await Promise.all(inFlight);
    return results;
  }

  /**
   * Probe multiple URLs with concurrency limiting.
   * Returns Map of url -> isGenerated.
   */
  async probeBatch(urls: string[]): Promise<Map<string, boolean>> {
    const detailed = await this.probeBatchDetailed(urls);
    return new Map(
      Array.from(detailed, ([url, outcome]) => [url, outcome.generated])
    );
  }
}

export const clipPreviewProber = new ClipPreviewProber();
