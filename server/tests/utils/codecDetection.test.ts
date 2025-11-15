import { describe, it, expect } from "vitest";
import {
  isVideoStreamable,
  isSceneStreamable,
} from "../../utils/codecDetection.js";

describe("Codec Detection - isVideoStreamable", () => {
  describe("Streamable combinations", () => {
    it("should detect H264 + AAC in MP4 as streamable", () => {
      const result = isVideoStreamable("h264", "aac", "/path/to/video.mp4");

      expect(result.isStreamable).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.videoCodec).toBe("h264");
      expect(result.audioCodec).toBe("aac");
      expect(result.container).toBe("mp4");
    });

    it("should detect HEVC + AAC in MP4 as streamable", () => {
      const result = isVideoStreamable("hevc", "aac", "/path/to/video.mp4");

      expect(result.isStreamable).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.videoCodec).toBe("hevc");
      expect(result.audioCodec).toBe("aac");
    });

    it("should detect VP9 + Opus in WebM as streamable", () => {
      const result = isVideoStreamable("vp9", "opus", "/path/to/video.webm");

      expect(result.isStreamable).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.videoCodec).toBe("vp9");
      expect(result.audioCodec).toBe("opus");
      expect(result.container).toBe("webm");
    });

    it("should detect AV1 + Opus in WebM as streamable", () => {
      const result = isVideoStreamable("av1", "opus", "/path/to/video.webm");

      expect(result.isStreamable).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it("should handle M4V container (treated as MP4)", () => {
      const result = isVideoStreamable("h264", "aac", "/path/to/video.m4v");

      expect(result.isStreamable).toBe(true);
      expect(result.container).toBe("mp4");
    });

    it("should handle MOV container (treated as MP4)", () => {
      const result = isVideoStreamable("h264", "aac", "/path/to/video.mov");

      expect(result.isStreamable).toBe(true);
      expect(result.container).toBe("mp4");
    });

    it("should allow videos without audio codec", () => {
      const result = isVideoStreamable("h264", null, "/path/to/video.mp4");

      expect(result.isStreamable).toBe(true);
      expect(result.audioCodec).toBeUndefined();
    });
  });

  describe("Non-streamable combinations", () => {
    it("should detect non-compatible video codec", () => {
      const result = isVideoStreamable("mpeg4", "aac", "/path/to/video.mp4");

      expect(result.isStreamable).toBe(false);
      expect(result.reasons).toContain(
        "Video codec 'mpeg4' not browser-compatible"
      );
    });

    it("should detect non-compatible audio codec", () => {
      const result = isVideoStreamable("h264", "ac3", "/path/to/video.mp4");

      expect(result.isStreamable).toBe(false);
      expect(result.reasons).toContain(
        "Audio codec 'ac3' not browser-compatible"
      );
    });

    it("should detect non-compatible container", () => {
      const result = isVideoStreamable("h264", "aac", "/path/to/video.mkv");

      expect(result.isStreamable).toBe(false);
      expect(result.reasons).toContain("Container 'mkv' not browser-compatible");
    });

    it("should detect missing video codec", () => {
      const result = isVideoStreamable(null, "aac", "/path/to/video.mp4");

      expect(result.isStreamable).toBe(false);
      expect(result.reasons).toContain("Video codec not detected");
    });

    it("should handle multiple incompatibilities", () => {
      const result = isVideoStreamable("mpeg4", "ac3", "/path/to/video.mkv");

      expect(result.isStreamable).toBe(false);
      expect(result.reasons).toHaveLength(3);
      expect(result.reasons).toContain("Container 'mkv' not browser-compatible");
      expect(result.reasons).toContain(
        "Video codec 'mpeg4' not browser-compatible"
      );
      expect(result.reasons).toContain(
        "Audio codec 'ac3' not browser-compatible"
      );
    });
  });

  describe("Codec name normalization", () => {
    it("should normalize H.264 to h264", () => {
      const result = isVideoStreamable("H.264", "aac", "/path/to/video.mp4");

      expect(result.isStreamable).toBe(true);
      expect(result.videoCodec).toBe("h264");
    });

    it("should normalize AVC to h264", () => {
      const result = isVideoStreamable("avc", "aac", "/path/to/video.mp4");

      expect(result.isStreamable).toBe(true);
      expect(result.videoCodec).toBe("h264");
    });

    it("should normalize AVC1 to h264", () => {
      const result = isVideoStreamable("avc1", "aac", "/path/to/video.mp4");

      expect(result.isStreamable).toBe(true);
      expect(result.videoCodec).toBe("h264");
    });

    it("should normalize H.265/HEVC variations", () => {
      const result1 = isVideoStreamable("H.265", "aac", "/path/to/video.mp4");
      const result2 = isVideoStreamable("hevc", "aac", "/path/to/video.mp4");
      const result3 = isVideoStreamable("hvc1", "aac", "/path/to/video.mp4");

      expect(result1.videoCodec).toBe("hevc");
      expect(result2.videoCodec).toBe("hevc");
      expect(result3.videoCodec).toBe("hevc");
    });

    it("should normalize AAC variations", () => {
      const result1 = isVideoStreamable("h264", "AAC", "/path/to/video.mp4");
      const result2 = isVideoStreamable("h264", "aac lc", "/path/to/video.mp4");

      expect(result1.audioCodec).toBe("aac");
      expect(result2.audioCodec).toBe("aac");
    });

    it("should normalize MPEG audio to mp3", () => {
      const result = isVideoStreamable("h264", "mpeg audio", "/path/to/video.mp4");

      expect(result.audioCodec).toBe("mp3");
    });

    it("should handle case insensitivity", () => {
      const result = isVideoStreamable("H264", "AAC", "/path/to/VIDEO.MP4");

      expect(result.isStreamable).toBe(true);
      expect(result.videoCodec).toBe("h264");
      expect(result.audioCodec).toBe("aac");
    });
  });

  describe("Edge cases", () => {
    it("should handle undefined codecs", () => {
      const result = isVideoStreamable(undefined, undefined, "/path/to/video.mp4");

      expect(result.isStreamable).toBe(false);
      expect(result.reasons).toContain("Video codec not detected");
    });

    it("should handle empty strings", () => {
      const result = isVideoStreamable("", "", "/path/to/video.mp4");

      expect(result.isStreamable).toBe(false);
      expect(result.reasons).toContain("Video codec not detected");
    });

    it("should handle file path without proper extension", () => {
      // In practice, this edge case rarely matters since Stash provides proper file paths
      const result = isVideoStreamable("h264", "aac", "/path/to/video");

      expect(result.isStreamable).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it("should handle uppercase file extensions", () => {
      const result = isVideoStreamable("h264", "aac", "/path/to/VIDEO.MP4");

      expect(result.isStreamable).toBe(true);
      expect(result.container).toBe("mp4");
    });
  });
});

describe("Codec Detection - isSceneStreamable", () => {
  describe("Streamable scenes", () => {
    it("should detect streamable scene with valid codecs", () => {
      const scene = {
        files: [
          {
            video_codec: "h264",
            audio_codec: "aac",
            path: "/media/scenes/test.mp4",
          },
        ],
      };

      const result = isSceneStreamable(scene);

      expect(result.isStreamable).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it("should use first file if multiple files present", () => {
      const scene = {
        files: [
          {
            video_codec: "h264",
            audio_codec: "aac",
            path: "/media/scenes/test.mp4",
          },
          {
            video_codec: "mpeg4",
            audio_codec: "ac3",
            path: "/media/scenes/test_low.mkv",
          },
        ],
      };

      const result = isSceneStreamable(scene);

      expect(result.isStreamable).toBe(true);
    });

    it("should fallback to scene.path if file.path missing", () => {
      const scene = {
        files: [
          {
            video_codec: "h264",
            audio_codec: "aac",
          },
        ],
        path: "/media/scenes/test.mp4",
      };

      const result = isSceneStreamable(scene);

      expect(result.isStreamable).toBe(true);
    });
  });

  describe("Non-streamable scenes", () => {
    it("should detect non-streamable scene with incompatible codecs", () => {
      const scene = {
        files: [
          {
            video_codec: "mpeg4",
            audio_codec: "ac3",
            path: "/media/scenes/test.mkv",
          },
        ],
      };

      const result = isSceneStreamable(scene);

      expect(result.isStreamable).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it("should handle scene with no files", () => {
      const scene = {
        files: [],
        path: "/media/scenes/test.mp4",
      };

      const result = isSceneStreamable(scene);

      expect(result.isStreamable).toBe(false);
      expect(result.reasons).toContain("No file information available");
    });

    it("should handle scene with undefined files", () => {
      const scene = {
        path: "/media/scenes/test.mp4",
      };

      const result = isSceneStreamable(scene);

      expect(result.isStreamable).toBe(false);
      expect(result.reasons).toContain("No file information available");
    });

    it("should handle scene with null codec values", () => {
      const scene = {
        files: [
          {
            video_codec: null,
            audio_codec: null,
            path: "/media/scenes/test.mp4",
          },
        ],
      };

      const result = isSceneStreamable(scene);

      expect(result.isStreamable).toBe(false);
      expect(result.reasons).toContain("Video codec not detected");
    });
  });

  describe("Real-world scenarios", () => {
    it("should handle typical Stash scene structure", () => {
      const scene = {
        id: "123",
        title: "Test Scene",
        files: [
          {
            id: "456",
            path: "/data/scenes/test.mp4",
            video_codec: "h264",
            audio_codec: "aac",
            width: 1920,
            height: 1080,
            duration: 1234.5,
            bit_rate: 5000000,
          },
        ],
      };

      const result = isSceneStreamable(scene);

      expect(result.isStreamable).toBe(true);
      expect(result.videoCodec).toBe("h264");
      expect(result.audioCodec).toBe("aac");
      expect(result.container).toBe("mp4");
    });

    it("should handle scene requiring transcoding", () => {
      const scene = {
        id: "789",
        title: "MKV Scene",
        files: [
          {
            id: "101",
            path: "/data/scenes/test.mkv",
            video_codec: "h264",
            audio_codec: "aac",
            width: 1920,
            height: 1080,
          },
        ],
      };

      const result = isSceneStreamable(scene);

      expect(result.isStreamable).toBe(false);
      expect(result.reasons).toContain("Container 'mkv' not browser-compatible");
    });
  });
});
