import crypto from "crypto";
import http from "http";
import https from "https";
import { URL } from "url";
import { logger } from "../utils/logger.js";

const MIN_PREVIEW_SIZE = 5 * 1024; // 5KB - below this is likely a placeholder
const PLACEHOLDER_SIZE = 1199; // Exact size of Stash's "Pending Generate" placeholder
const PLACEHOLDER_MD5 = "c4a2e6b6547057dd0ef0c7d7e3c420d4"; // MD5 hash of placeholder image

interface ProberOptions {
  maxConcurrent?: number;
  timeoutMs?: number;
}

export class ClipPreviewProber {
  private readonly maxConcurrent: number;
  private readonly timeoutMs: number;

  constructor(options: ProberOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 10;
    this.timeoutMs = options.timeoutMs ?? 5000;
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
   */
  async probePreviewUrl(url: string): Promise<boolean> {
    try {
      // First, get the total size via Range request
      const sizeResult = await this.getPreviewSize(url);

      if (sizeResult === null) {
        // Request failed or 404 - not generated
        return false;
      }

      // If size is definitely not the placeholder size, use size-based check
      if (sizeResult !== PLACEHOLDER_SIZE) {
        return sizeResult >= MIN_PREVIEW_SIZE;
      }

      // Size matches placeholder exactly - need to verify via hash
      return this.verifyNotPlaceholder(url);
    } catch (err) {
      logger.debug("Preview probe error", { url, error: String(err) });
      return false;
    }
  }

  /**
   * Get the total size of a preview file via Range request.
   * Returns null if the file doesn't exist or request fails.
   */
  private getPreviewSize(url: string): Promise<number | null> {
    return new Promise((resolve) => {
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
                  resolve(parseInt(match[1], 10));
                  return;
                }
              }
            }

            // For 200 OK (server doesn't support Range), use Content-Length
            if (res.statusCode === 200) {
              resolve(parseInt(res.headers["content-length"] || "0", 10));
              return;
            }

            // 404 or other errors mean not generated
            resolve(null);
          }
        );

        req.on("error", (err) => {
          logger.debug("Preview size check failed", { url, error: err.message });
          resolve(null);
        });

        req.on("timeout", () => {
          req.destroy();
          resolve(null);
        });

        req.end();
      } catch (err) {
        logger.debug("Preview size check error", { url, error: String(err) });
        resolve(null);
      }
    });
  }

  /**
   * Fetch the full preview content and verify it's not the placeholder via MD5 hash.
   * Returns true if the content is NOT the placeholder (i.e., it's a real preview).
   */
  private verifyNotPlaceholder(url: string): Promise<boolean> {
    return new Promise((resolve) => {
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
              resolve(false);
              return;
            }

            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => {
              const content = Buffer.concat(chunks);
              const hash = crypto.createHash("md5").update(content).digest("hex");
              // If hash matches placeholder, it's NOT generated
              // If hash doesn't match, it's a real preview that happens to be 1199 bytes
              const isGenerated = hash !== PLACEHOLDER_MD5;
              logger.debug("Placeholder hash check", {
                url,
                size: content.length,
                hash,
                isGenerated
              });
              resolve(isGenerated);
            });
            res.on("error", () => resolve(false));
          }
        );

        req.on("error", (err) => {
          logger.debug("Placeholder verification failed", { url, error: err.message });
          resolve(false);
        });

        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });

        req.end();
      } catch (err) {
        logger.debug("Placeholder verification error", { url, error: String(err) });
        resolve(false);
      }
    });
  }

  /**
   * Probe multiple URLs with concurrency limiting.
   * Returns Map of url -> isGenerated.
   */
  async probeBatch(urls: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const queue = [...urls];
    const inFlight: Promise<void>[] = [];

    const processNext = async (): Promise<void> => {
      const url = queue.shift();
      if (!url) return;

      const isGenerated = await this.probePreviewUrl(url);
      results.set(url, isGenerated);
      await processNext();
    };

    // Start up to maxConcurrent workers
    for (let i = 0; i < Math.min(this.maxConcurrent, urls.length); i++) {
      inFlight.push(processNext());
    }

    await Promise.all(inFlight);
    return results;
  }
}

export const clipPreviewProber = new ClipPreviewProber();
