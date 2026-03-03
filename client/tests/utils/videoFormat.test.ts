import { describe, it, expect } from "vitest";
import { canDirectPlayVideo } from "../../src/utils/videoFormat";

describe("videoFormat utilities", () => {
  describe("canDirectPlayVideo", () => {
    it("returns fallback when file is null", () => {
      const result = canDirectPlayVideo(null);
      expect(result.canDirectPlay).toBe(false);
      expect(result.reason).toContain("No file");
      expect(result.fallbackRequired).toBe(true);
    });

    it("handles standard mp4/h264/aac file", () => {
      const result = canDirectPlayVideo({
        format: "mp4",
        video_codec: "h264",
        audio_codec: "aac",
      });
      // In happy-dom, canPlayType returns '' so browser says unsupported,
      // but the function still allows direct play attempt for common formats
      expect(result.canDirectPlay).toBe(true);
      expect(result.reason).toBeDefined();
    });

    it("handles webm/vp9/opus file", () => {
      const result = canDirectPlayVideo({
        format: "webm",
        video_codec: "vp9",
        audio_codec: "opus",
      });
      expect(result.canDirectPlay).toBe(true);
    });

    it("handles mov container", () => {
      const result = canDirectPlayVideo({
        format: "mov",
        video_codec: "h264",
        audio_codec: "aac",
      });
      expect(result.canDirectPlay).toBe(true);
    });

    it("handles unknown codec gracefully", () => {
      const result = canDirectPlayVideo({
        format: "mp4",
        video_codec: "totally_unknown_codec",
        audio_codec: "also_unknown",
      });
      // Should still attempt direct play for mp4 container
      expect(result.canDirectPlay).toBe(true);
      expect(result.fallbackRequired).toBe(true);
    });

    it("handles unknown container format", () => {
      const result = canDirectPlayVideo({
        format: "flv",
        video_codec: "h264",
        audio_codec: "aac",
      });
      // Uncommon format path: attempts direct play anyway
      expect(result.canDirectPlay).toBe(true);
      expect(result.fallbackRequired).toBe(true);
      expect(result.reason).toContain("uncommon format");
    });

    it("returns consistent results when called twice (cache works)", () => {
      const file = { format: "mp4", video_codec: "h264", audio_codec: "aac" };
      const result1 = canDirectPlayVideo(file);
      const result2 = canDirectPlayVideo(file);
      expect(result1).toEqual(result2);
    });

    it("handles empty strings for codec fields", () => {
      const result = canDirectPlayVideo({
        format: "",
        video_codec: "",
        audio_codec: "",
      });
      // Empty format is falsy, goes to uncommon format path
      expect(result.canDirectPlay).toBe(true);
      expect(result.fallbackRequired).toBe(true);
    });

    it("handles file with only format, no codecs", () => {
      const result = canDirectPlayVideo({
        format: "mp4",
      });
      expect(result.canDirectPlay).toBe(true);
    });

    it("handles file with no format but has codecs", () => {
      const result = canDirectPlayVideo({
        video_codec: "h264",
        audio_codec: "aac",
      });
      // No format -> uncommon format path
      expect(result.canDirectPlay).toBe(true);
      expect(result.fallbackRequired).toBe(true);
    });

    it("handles mkv container as uncommon format", () => {
      const result = canDirectPlayVideo({
        format: "mkv",
        video_codec: "h264",
        audio_codec: "aac",
      });
      expect(result.canDirectPlay).toBe(true);
      expect(result.fallbackRequired).toBe(true);
      expect(result.reason).toContain("uncommon format");
    });

    it("handles avi container as uncommon format", () => {
      const result = canDirectPlayVideo({
        format: "avi",
        video_codec: "mpeg4",
        audio_codec: "mp3",
      });
      expect(result.canDirectPlay).toBe(true);
      expect(result.fallbackRequired).toBe(true);
    });

    it("handles file object with extra properties", () => {
      const result = canDirectPlayVideo({
        format: "mp4",
        video_codec: "h264",
        audio_codec: "aac",
        width: 1920,
        height: 1080,
        duration: 120,
      });
      expect(result.canDirectPlay).toBe(true);
    });

    it("reason includes codec info for common formats", () => {
      const result = canDirectPlayVideo({
        format: "mp4",
        video_codec: "h264",
        audio_codec: "aac",
      });
      expect(result.reason).toContain("mp4");
      expect(result.reason).toContain("h264");
      expect(result.reason).toContain("aac");
    });
  });
});
