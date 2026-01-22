import { describe, it, expect } from "vitest";
import { ClipPreviewProber } from "../../services/ClipPreviewProber.js";

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
});
