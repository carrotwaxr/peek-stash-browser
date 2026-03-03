import { describe, it, expect } from "vitest";
import { getSiteInfo, getDomainFromUrl } from "../../src/utils/siteInfo";

describe("siteInfo utilities", () => {
  describe("getSiteInfo", () => {
    it("returns correct name for Twitter URL", () => {
      const result = getSiteInfo("https://twitter.com/someuser");
      expect(result.name).toBe("Twitter");
    });

    it("returns correct name for X.com URL", () => {
      const result = getSiteInfo("https://x.com/someuser");
      expect(result.name).toBe("Twitter");
    });

    it("returns correct name for IMDb URL", () => {
      const result = getSiteInfo("https://www.imdb.com/name/nm1234567");
      expect(result.name).toBe("IMDb");
    });

    it("returns correct name for IAFD URL", () => {
      const result = getSiteInfo("https://www.iafd.com/person.rme/perfid=example");
      expect(result.name).toBe("IAFD");
    });

    it("returns correct name for Instagram URL", () => {
      const result = getSiteInfo("https://instagram.com/user123");
      expect(result.name).toBe("Instagram");
    });

    it("returns fallback for unknown URL with extracted domain", () => {
      const result = getSiteInfo("https://example.com/page");
      expect(result.name).toBe("example.com");
      expect(result.useFavicon).toBe(true);
    });

    it("handles URL with no path", () => {
      const result = getSiteInfo("https://twitter.com");
      expect(result.name).toBe("Twitter");
    });

    it("handles URL with subdomain", () => {
      const result = getSiteInfo("https://www.twitter.com/user");
      expect(result.name).toBe("Twitter");
    });

    it("returns Link name for invalid URL", () => {
      const result = getSiteInfo("not-a-url");
      expect(result.name).toBe("Link");
    });

    it("returns a color string for known sites", () => {
      const result = getSiteInfo("https://twitter.com/user");
      expect(result.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it("returns an icon component for known sites", () => {
      const result = getSiteInfo("https://twitter.com/user");
      expect(result.icon).toBeDefined();
      // Lucide icons are ForwardRef objects in the test environment
      expect(result.icon).toBeTruthy();
    });

    it("returns an icon component for unknown URLs", () => {
      const result = getSiteInfo("https://unknownsite.org/path");
      expect(result.icon).toBeDefined();
    });
  });

  describe("getDomainFromUrl", () => {
    it("extracts origin from standard URL", () => {
      const result = getDomainFromUrl("https://example.com/path/to/page");
      expect(result).toBe("https://example.com");
    });

    it("returns null for invalid URL", () => {
      const result = getDomainFromUrl("not a url");
      expect(result).toBeNull();
    });

    it("returns null for empty string", () => {
      const result = getDomainFromUrl("");
      expect(result).toBeNull();
    });

    it("handles URL with port", () => {
      const result = getDomainFromUrl("https://example.com:8080/path");
      expect(result).toBe("https://example.com:8080");
    });

    it("handles URL with subdomain", () => {
      const result = getDomainFromUrl("https://www.example.com/path");
      expect(result).toBe("https://www.example.com");
    });

    it("handles HTTP URL", () => {
      const result = getDomainFromUrl("http://example.com/path");
      expect(result).toBe("http://example.com");
    });
  });
});
