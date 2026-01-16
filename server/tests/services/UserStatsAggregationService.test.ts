/**
 * Unit Tests for UserStatsAggregationService
 *
 * Tests the transformUrl function for proper URL proxying
 */
import { describe, it, expect } from "vitest";
import { transformUrl } from "../../services/UserStatsAggregationService.js";

describe("UserStatsAggregationService", () => {
  describe("transformUrl", () => {
    it("returns null for null input", () => {
      expect(transformUrl(null)).toBeNull();
    });

    it("returns null for empty string", () => {
      // Empty string is falsy, so it returns null
      expect(transformUrl("")).toBeNull();
    });

    it("returns proxy URL unchanged if already proxied", () => {
      const proxyUrl = "/api/proxy/stash?path=%2Fscene%2F123%2Fscreenshot";
      expect(transformUrl(proxyUrl)).toBe(proxyUrl);
    });

    it("transforms simple path to proxy URL", () => {
      const path = "/scene/123/screenshot";
      const result = transformUrl(path);
      expect(result).toBe(
        `/api/proxy/stash?path=${encodeURIComponent(path)}`
      );
    });

    it("transforms full HTTP URL to proxy URL", () => {
      const url = "http://localhost:9999/scene/123/screenshot";
      const result = transformUrl(url);
      expect(result).toBe(
        `/api/proxy/stash?path=${encodeURIComponent("/scene/123/screenshot")}`
      );
    });

    it("transforms full HTTPS URL to proxy URL", () => {
      const url = "https://stash.example.com/scene/123/screenshot";
      const result = transformUrl(url);
      expect(result).toBe(
        `/api/proxy/stash?path=${encodeURIComponent("/scene/123/screenshot")}`
      );
    });

    it("preserves query parameters from full URL", () => {
      const url = "http://localhost:9999/scene/123/screenshot?t=1234567890";
      const result = transformUrl(url);
      expect(result).toBe(
        `/api/proxy/stash?path=${encodeURIComponent("/scene/123/screenshot?t=1234567890")}`
      );
    });

    it("handles URL with port number", () => {
      const url = "http://192.168.1.100:9999/performer/456/image";
      const result = transformUrl(url);
      expect(result).toBe(
        `/api/proxy/stash?path=${encodeURIComponent("/performer/456/image")}`
      );
    });

    it("handles path with special characters", () => {
      const path = "/scene/123/screenshot?api_key=secret&t=123";
      const result = transformUrl(path);
      expect(result).toBe(
        `/api/proxy/stash?path=${encodeURIComponent(path)}`
      );
    });

    it("handles performer image path", () => {
      const path = "/performer/abc-123/image";
      const result = transformUrl(path);
      expect(result).toBe(
        `/api/proxy/stash?path=${encodeURIComponent(path)}`
      );
    });

    it("handles studio image path", () => {
      const path = "/studio/studio-id/image";
      const result = transformUrl(path);
      expect(result).toBe(
        `/api/proxy/stash?path=${encodeURIComponent(path)}`
      );
    });

    it("handles tag image path", () => {
      const path = "/tag/tag-id/image";
      const result = transformUrl(path);
      expect(result).toBe(
        `/api/proxy/stash?path=${encodeURIComponent(path)}`
      );
    });

    it("handles image thumbnail path", () => {
      const path = "/image/img-123/thumbnail";
      const result = transformUrl(path);
      expect(result).toBe(
        `/api/proxy/stash?path=${encodeURIComponent(path)}`
      );
    });
  });
});
