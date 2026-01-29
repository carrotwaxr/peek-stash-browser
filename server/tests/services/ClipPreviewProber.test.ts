import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";
import { ClipPreviewProber } from "../../services/ClipPreviewProber.js";
import crypto from "crypto";

describe("ClipPreviewProber", () => {
  describe("probePreviewUrl", () => {
    it("should return false for invalid URLs", async () => {
      const prober = new ClipPreviewProber({ timeoutMs: 1000 });
      const result = await prober.probePreviewUrl("http://localhost:99999/nonexistent");
      expect(result).toBe(false);
    });

    it("should return false on timeout", async () => {
      const prober = new ClipPreviewProber({ timeoutMs: 1 });
      // This will timeout since we're using a very short timeout
      const result = await prober.probePreviewUrl("http://httpbin.org/delay/10");
      expect(result).toBe(false);
    });
  });

  describe("probeBatch", () => {
    it("should process all URLs and return results map", async () => {
      const prober = new ClipPreviewProber({ maxConcurrent: 2, timeoutMs: 1000 });
      const urls = [
        "http://localhost:99999/fake1",
        "http://localhost:99999/fake2",
        "http://localhost:99999/fake3",
      ];
      const results = await prober.probeBatch(urls);
      expect(results.size).toBe(3);
      // All should be false since the URLs don't exist
      for (const [, value] of results) {
        expect(value).toBe(false);
      }
    });

    it("should handle empty URL list", async () => {
      const prober = new ClipPreviewProber();
      const results = await prober.probeBatch([]);
      expect(results.size).toBe(0);
    });
  });

  describe("hash-based detection", () => {
    let server: http.Server;
    let port: number;

    // Known placeholder values
    const PLACEHOLDER_SIZE = 1199;
    const PLACEHOLDER_MD5 = "c4a2e6b6547057dd0ef0c7d7e3c420d4";

    // Create a fake placeholder content that matches the MD5
    // Since we don't have the actual placeholder, we'll test the logic with mock content
    const mockPlaceholder = Buffer.alloc(PLACEHOLDER_SIZE, 0);
    const mockPlaceholderHash = crypto.createHash("md5").update(mockPlaceholder).digest("hex");

    beforeEach(() => {
      return new Promise<void>((resolve) => {
        server = http.createServer((req, res) => {
          const url = req.url || "";

          if (url === "/large-preview") {
            // Large file - definitely generated
            const content = Buffer.alloc(10000, "x");
            if (req.headers.range) {
              res.writeHead(206, {
                "Content-Range": `bytes 0-0/${content.length}`,
                "Content-Length": "1",
              });
              res.end(content.slice(0, 1));
            } else {
              res.writeHead(200, { "Content-Length": content.length.toString() });
              res.end(content);
            }
          } else if (url === "/small-preview") {
            // Small file below threshold but not placeholder size
            const content = Buffer.alloc(1000, "y");
            if (req.headers.range) {
              res.writeHead(206, {
                "Content-Range": `bytes 0-0/${content.length}`,
                "Content-Length": "1",
              });
              res.end(content.slice(0, 1));
            } else {
              res.writeHead(200, { "Content-Length": content.length.toString() });
              res.end(content);
            }
          } else if (url === "/placeholder-size-real") {
            // File that's exactly 1199 bytes but NOT a placeholder (different hash)
            const content = Buffer.alloc(PLACEHOLDER_SIZE, "z");
            if (req.headers.range) {
              res.writeHead(206, {
                "Content-Range": `bytes 0-0/${content.length}`,
                "Content-Length": "1",
              });
              res.end(content.slice(0, 1));
            } else {
              res.writeHead(200, { "Content-Length": content.length.toString() });
              res.end(content);
            }
          } else if (url === "/placeholder-size-fake") {
            // Simulate the actual placeholder (1199 bytes with known hash)
            // We create content that matches our mock hash
            if (req.headers.range) {
              res.writeHead(206, {
                "Content-Range": `bytes 0-0/${mockPlaceholder.length}`,
                "Content-Length": "1",
              });
              res.end(mockPlaceholder.slice(0, 1));
            } else {
              res.writeHead(200, { "Content-Length": mockPlaceholder.length.toString() });
              res.end(mockPlaceholder);
            }
          } else if (url === "/404") {
            res.writeHead(404);
            res.end();
          } else {
            res.writeHead(404);
            res.end();
          }
        });

        server.listen(0, () => {
          const address = server.address();
          if (address && typeof address !== "string") {
            port = address.port;
          }
          resolve();
        });
      });
    });

    afterEach(() => {
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it("should return true for large previews (>= 5KB)", async () => {
      const prober = new ClipPreviewProber({ timeoutMs: 5000 });
      const result = await prober.probePreviewUrl(`http://localhost:${port}/large-preview`);
      expect(result).toBe(true);
    });

    it("should return false for small previews (< 5KB, not placeholder size)", async () => {
      const prober = new ClipPreviewProber({ timeoutMs: 5000 });
      const result = await prober.probePreviewUrl(`http://localhost:${port}/small-preview`);
      expect(result).toBe(false);
    });

    it("should return true for 1199-byte file with different hash (real small clip)", async () => {
      const prober = new ClipPreviewProber({ timeoutMs: 5000 });
      const result = await prober.probePreviewUrl(`http://localhost:${port}/placeholder-size-real`);
      // This should be TRUE because even though it's 1199 bytes, the hash doesn't match placeholder
      expect(result).toBe(true);
    });

    it("should return false for 404 responses", async () => {
      const prober = new ClipPreviewProber({ timeoutMs: 5000 });
      const result = await prober.probePreviewUrl(`http://localhost:${port}/404`);
      expect(result).toBe(false);
    });
  });
});
