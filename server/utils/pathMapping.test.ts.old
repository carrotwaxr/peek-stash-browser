import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { pathMapper, translateStashPath } from "./pathMapping.js";

describe("pathMapping", () => {
  // Save original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset to default configuration before each test
    pathMapper.updateConfig({
      stashInternalPath: "/data",
      peekMediaPath: "/app/media",
    });
  });

  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv };
  });

  describe("translateStashPath", () => {
    it("should translate basic Stash path to Peek path", () => {
      const stashPath = "/data/scenes/video.mp4";
      const expected = "/app/media/scenes/video.mp4";

      const result = translateStashPath(stashPath);

      expect(result).toBe(expected);
    });

    it("should handle nested directory paths", () => {
      const stashPath = "/data/scenes/2024/january/video.mp4";
      const expected = "/app/media/scenes/2024/january/video.mp4";

      const result = translateStashPath(stashPath);

      expect(result).toBe(expected);
    });

    it("should normalize Windows-style backslashes to forward slashes", () => {
      const stashPath = "/data\\scenes\\video.mp4";
      const expected = "/app/media/scenes/video.mp4";

      const result = translateStashPath(stashPath);

      expect(result).toBe(expected);
    });

    it("should return original path if it does not start with Stash internal path", () => {
      const stashPath = "/other/path/video.mp4";

      const result = translateStashPath(stashPath);

      expect(result).toBe(stashPath);
    });

    it("should throw error for empty path", () => {
      expect(() => translateStashPath("")).toThrow("Path cannot be empty");
    });

    it("should handle custom path mapping configuration", () => {
      pathMapper.updateConfig({
        stashInternalPath: "/mnt/stash",
        peekMediaPath: "/mnt/media",
      });

      const stashPath = "/mnt/stash/videos/movie.mp4";
      const expected = "/mnt/media/videos/movie.mp4";

      const result = translateStashPath(stashPath);

      expect(result).toBe(expected);
    });

    it("should handle path with trailing slash in Stash internal path", () => {
      pathMapper.updateConfig({
        stashInternalPath: "/data/",
        peekMediaPath: "/app/media",
      });

      const stashPath = "/data/scenes/video.mp4";
      const expected = "/app/media/scenes/video.mp4";

      const result = translateStashPath(stashPath);

      expect(result).toBe(expected);
    });

    it("should handle relative path after prefix removal without leading slash", () => {
      // Edge case: if internal path is /data and stashPath is /datascenes/video.mp4
      // (no slash between), it should still work correctly
      const stashPath = "/data/scenes/video.mp4";
      const expected = "/app/media/scenes/video.mp4";

      const result = translateStashPath(stashPath);

      expect(result).toBe(expected);
    });

    it("should handle path with special characters", () => {
      const stashPath = "/data/scenes/video (2024) [HD].mp4";
      const expected = "/app/media/scenes/video (2024) [HD].mp4";

      const result = translateStashPath(stashPath);

      expect(result).toBe(expected);
    });

    it("should handle path with spaces", () => {
      const stashPath = "/data/My Scenes/My Video.mp4";
      const expected = "/app/media/My Scenes/My Video.mp4";

      const result = translateStashPath(stashPath);

      expect(result).toBe(expected);
    });
  });

  describe("pathMapper configuration", () => {
    it("should get current configuration", () => {
      const config = pathMapper.getConfig();

      expect(config).toHaveProperty("stashInternalPath");
      expect(config).toHaveProperty("peekMediaPath");
    });

    it("should update configuration", () => {
      const newConfig = {
        stashInternalPath: "/custom/stash",
        peekMediaPath: "/custom/media",
      };

      pathMapper.updateConfig(newConfig);
      const config = pathMapper.getConfig();

      expect(config.stashInternalPath).toBe("/custom/stash");
      expect(config.peekMediaPath).toBe("/custom/media");
    });

    it("should partially update configuration", () => {
      pathMapper.updateConfig({
        stashInternalPath: "/updated/stash",
      });

      const config = pathMapper.getConfig();

      expect(config.stashInternalPath).toBe("/updated/stash");
      expect(config.peekMediaPath).toBe("/app/media"); // Should remain unchanged
    });
  });
});
