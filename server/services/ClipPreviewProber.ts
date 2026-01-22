import http from "http";
import https from "https";
import { URL } from "url";
import { logger } from "../utils/logger.js";

const MIN_PREVIEW_SIZE = 5 * 1024; // 5KB - below this is likely a placeholder

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
   * Probe a single preview URL using HEAD request.
   * Returns true if response indicates a real preview (>= 5KB).
   */
  async probePreviewUrl(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(url);
        const client = urlObj.protocol === "https:" ? https : http;

        const req = client.request(
          {
            method: "HEAD",
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            timeout: this.timeoutMs,
          },
          (res) => {
            const contentLength = parseInt(res.headers["content-length"] || "0", 10);
            resolve(contentLength >= MIN_PREVIEW_SIZE);
          }
        );

        req.on("error", (err) => {
          logger.debug("Preview probe failed", { url, error: err.message });
          resolve(false);
        });

        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });

        req.end();
      } catch (err) {
        logger.debug("Preview probe error", { url, error: String(err) });
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
