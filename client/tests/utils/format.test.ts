import { describe, it, expect } from "vitest";
import {
  formatDurationHumanReadable,
  getFilenameFromPath,
  formatDuration,
  formatDurationCompact,
  formatFileSize,
  formatBitRate,
  getSceneTitle,
  getSceneDescription,
  formatResolution,
} from "../../src/utils/format";

describe("format utilities", () => {
  describe("formatDurationHumanReadable", () => {
    it("returns '0m' for null input", () => {
      expect(formatDurationHumanReadable(null as any)).toBe("0m");
    });

    it("returns '0m' for 0 seconds", () => {
      expect(formatDurationHumanReadable(0)).toBe("0m");
    });

    it("formats minutes only", () => {
      expect(formatDurationHumanReadable(300)).toBe("5m"); // 5 minutes
      expect(formatDurationHumanReadable(45 * 60)).toBe("45m"); // 45 minutes
    });

    it("formats hours and minutes", () => {
      expect(formatDurationHumanReadable(3600)).toBe("1h"); // 1 hour (no 0m shown)
      expect(formatDurationHumanReadable(3660)).toBe("1h 1m"); // 1 hour 1 minute
      expect(formatDurationHumanReadable(7200)).toBe("2h"); // 2 hours (no 0m shown)
      expect(formatDurationHumanReadable(9000)).toBe("2h 30m"); // 2.5 hours
    });

    it("formats days, hours, and minutes with includeDays=true (default)", () => {
      expect(formatDurationHumanReadable(86400)).toBe("1d"); // 1 day (no 0h 0m shown)
      expect(formatDurationHumanReadable(90000)).toBe("1d 1h"); // 1 day 1 hour
      expect(formatDurationHumanReadable(172800)).toBe("2d"); // 2 days
      expect(formatDurationHumanReadable(180000)).toBe("2d 2h"); // 2 days 2 hours
    });

    it("converts days to hours when includeDays=false", () => {
      expect(formatDurationHumanReadable(86400, { includeDays: false })).toBe(
        "24h"
      ); // 24 hours (no 0m shown)
      expect(formatDurationHumanReadable(90000, { includeDays: false })).toBe(
        "25h"
      ); // 25 hours
      expect(formatDurationHumanReadable(172800, { includeDays: false })).toBe(
        "48h"
      ); // 48 hours
    });

    it("handles large durations", () => {
      const oneWeek = 7 * 24 * 60 * 60;
      expect(formatDurationHumanReadable(oneWeek)).toBe("7d");
      expect(formatDurationHumanReadable(oneWeek, { includeDays: false })).toBe(
        "168h"
      );
    });
  });

  describe("getFilenameFromPath", () => {
    it("returns null for null input", () => {
      expect(getFilenameFromPath(null as any)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(getFilenameFromPath(undefined as any)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(getFilenameFromPath("")).toBeNull();
    });

    it("extracts filename from Unix path", () => {
      expect(getFilenameFromPath("/home/user/videos/my_video.mp4")).toBe(
        "my_video"
      );
    });

    it("extracts filename from Windows path", () => {
      expect(getFilenameFromPath("C:\\Users\\Videos\\my_video.mp4")).toBe(
        "my_video"
      );
    });

    it("removes extension", () => {
      expect(getFilenameFromPath("/path/to/file.txt")).toBe("file");
      expect(getFilenameFromPath("/path/to/video.mkv")).toBe("video");
    });

    it("handles filenames with multiple dots", () => {
      expect(getFilenameFromPath("/path/to/my.video.file.mp4")).toBe(
        "my.video.file"
      );
    });

    it("handles filename without extension", () => {
      expect(getFilenameFromPath("/path/to/noextension")).toBe("noextension");
    });

    it("handles just a filename (no path)", () => {
      expect(getFilenameFromPath("video.mp4")).toBe("video");
    });
  });

  describe("formatDuration (MM:SS format)", () => {
    it("returns '0:00' for null/undefined", () => {
      expect(formatDuration(null as any)).toBe("0:00");
      expect(formatDuration(undefined as any)).toBe("0:00");
    });

    it("formats seconds less than a minute", () => {
      expect(formatDuration(30)).toBe("0:30");
      expect(formatDuration(59)).toBe("0:59");
    });

    it("formats minutes and seconds", () => {
      expect(formatDuration(60)).toBe("1:00");
      expect(formatDuration(90)).toBe("1:30");
      expect(formatDuration(600)).toBe("10:00");
    });

    it("formats hours, minutes, and seconds", () => {
      expect(formatDuration(3600)).toBe("1:00:00");
      expect(formatDuration(3661)).toBe("1:01:01");
      expect(formatDuration(7325)).toBe("2:02:05");
    });
  });

  describe("formatDurationCompact", () => {
    it("returns '0s' for null/undefined", () => {
      expect(formatDurationCompact(null as any)).toBe("0s");
      expect(formatDurationCompact(undefined as any)).toBe("0s");
    });

    it("formats seconds only", () => {
      expect(formatDurationCompact(30)).toBe("30s");
      expect(formatDurationCompact(59)).toBe("59s");
    });

    it("formats minutes and seconds", () => {
      expect(formatDurationCompact(60)).toBe("1m00s");
      expect(formatDurationCompact(90)).toBe("1m30s");
      expect(formatDurationCompact(600)).toBe("10m00s");
    });

    it("formats hours and minutes", () => {
      expect(formatDurationCompact(3600)).toBe("1h00m");
      expect(formatDurationCompact(3660)).toBe("1h01m");
      expect(formatDurationCompact(7200)).toBe("2h00m");
    });
  });

  describe("formatFileSize", () => {
    it("returns '0 B' for null/undefined/zero", () => {
      expect(formatFileSize(null as any)).toBe("0 B");
      expect(formatFileSize(undefined as any)).toBe("0 B");
      expect(formatFileSize(0)).toBe("0 B");
    });

    it("formats bytes", () => {
      expect(formatFileSize(500)).toBe("500 B");
    });

    it("formats kilobytes", () => {
      expect(formatFileSize(1024)).toBe("1 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
    });

    it("formats megabytes", () => {
      expect(formatFileSize(1048576)).toBe("1 MB");
      expect(formatFileSize(1572864)).toBe("1.5 MB");
    });

    it("formats gigabytes", () => {
      expect(formatFileSize(1073741824)).toBe("1 GB");
      expect(formatFileSize(5368709120)).toBe("5 GB");
    });
  });

  describe("formatBitRate", () => {
    it("returns '0 bps' for null/undefined/zero", () => {
      expect(formatBitRate(null as any)).toBe("0 bps");
      expect(formatBitRate(undefined as any)).toBe("0 bps");
      expect(formatBitRate(0)).toBe("0 bps");
    });

    it("formats kbps", () => {
      expect(formatBitRate(500000)).toBe("500 Kbps");
    });

    it("formats Mbps", () => {
      expect(formatBitRate(5000000)).toBe("5.00 Mbps");
      expect(formatBitRate(10500000)).toBe("10.50 Mbps");
    });
  });

  describe("getSceneTitle", () => {
    it("returns 'Unknown Scene' for null/undefined", () => {
      expect(getSceneTitle(null as any)).toBe("Unknown Scene");
      expect(getSceneTitle(undefined as any)).toBe("Unknown Scene");
    });

    it("returns title if present", () => {
      expect(getSceneTitle({ title: "My Video" })).toBe("My Video");
    });

    it("trims whitespace from title", () => {
      expect(getSceneTitle({ title: "  My Video  " })).toBe("My Video");
    });

    it("uses first file basename if no title", () => {
      expect(
        getSceneTitle({
          title: "",
          files: [{ basename: "video_file.mp4" }],
        })
      ).toBe("video_file");
    });

    it("returns 'Unknown Scene' if no title and no files", () => {
      expect(getSceneTitle({ title: "" })).toBe("Unknown Scene");
      expect(getSceneTitle({ title: "", files: [] })).toBe("Unknown Scene");
    });

    it("returns 'Unknown Scene' when files exist but no basename", () => {
      expect(getSceneTitle({ title: "", files: [{ path: "/foo" }] })).toBe("Unknown Scene");
    });
  });

  describe("getSceneDescription", () => {
    it("returns empty string for null scene", () => {
      expect(getSceneDescription(null)).toBe("");
    });

    it("returns empty string for undefined scene", () => {
      expect(getSceneDescription(undefined as any)).toBe("");
    });

    it("returns empty string when no details", () => {
      expect(getSceneDescription({})).toBe("");
      expect(getSceneDescription({ details: "" })).toBe("");
    });

    it("returns trimmed details", () => {
      expect(getSceneDescription({ details: "  Some description  " })).toBe("Some description");
    });

    it("returns details as-is when already trimmed", () => {
      expect(getSceneDescription({ details: "Clean description" })).toBe("Clean description");
    });
  });

  describe("formatResolution", () => {
    it("returns empty string for null/undefined/zero dimensions", () => {
      expect(formatResolution(null as any, null as any)).toBe("");
      expect(formatResolution(0, 0)).toBe("");
      expect(formatResolution(1920, 0)).toBe("");
      expect(formatResolution(0, 1080)).toBe("");
    });

    it("returns '4K' for 2160p+ heights", () => {
      expect(formatResolution(3840, 2160)).toBe("4K");
      expect(formatResolution(7680, 4320)).toBe("4K"); // 8K height > 2160
    });

    it("returns '1440p' for 1440p heights", () => {
      expect(formatResolution(2560, 1440)).toBe("1440p");
    });

    it("returns '1080p' for 1080p heights", () => {
      expect(formatResolution(1920, 1080)).toBe("1080p");
    });

    it("returns '720p' for 720p heights", () => {
      expect(formatResolution(1280, 720)).toBe("720p");
    });

    it("returns '480p' for 480p heights", () => {
      expect(formatResolution(854, 480)).toBe("480p");
    });

    it("returns '360p' for 360p heights", () => {
      expect(formatResolution(640, 360)).toBe("360p");
    });

    it("returns '240p' for 240p heights", () => {
      expect(formatResolution(426, 240)).toBe("240p");
    });

    it("returns height with p suffix for small resolutions", () => {
      expect(formatResolution(320, 180)).toBe("180p");
      expect(formatResolution(176, 144)).toBe("144p");
    });
  });

  describe("formatBitRate - edge cases", () => {
    it("formats sub-kbps values", () => {
      expect(formatBitRate(500)).toBe("1 Kbps");
    });

    it("formats exactly 1 Mbps", () => {
      expect(formatBitRate(1000000)).toBe("1.00 Mbps");
    });
  });

  describe("formatFileSize - edge cases", () => {
    it("formats terabytes", () => {
      expect(formatFileSize(1099511627776)).toBe("1 TB");
    });
  });

  describe("formatDuration - edge cases", () => {
    it("pads seconds with leading zero", () => {
      expect(formatDuration(5)).toBe("0:05");
    });

    it("handles exact minute boundaries", () => {
      expect(formatDuration(120)).toBe("2:00");
    });
  });

  describe("formatDurationCompact - edge cases", () => {
    it("formats hours with minutes padded", () => {
      expect(formatDurationCompact(3601)).toBe("1h00m");
    });
  });

  describe("formatDurationHumanReadable - edge cases", () => {
    it("shows only days and minutes when hours are 0", () => {
      // 1 day + 30 minutes = 86400 + 1800 = 88200
      expect(formatDurationHumanReadable(88200)).toBe("1d 30m");
    });

    it("shows only minutes for durations under an hour", () => {
      expect(formatDurationHumanReadable(1800)).toBe("30m");
    });

    it("falls back to 0m for very small durations that round to 0", () => {
      expect(formatDurationHumanReadable(10)).toBe("0m");
    });

    it("handles includeDays=false with minutes", () => {
      // 1 day + 0 hours + 30 minutes
      expect(formatDurationHumanReadable(88200, { includeDays: false })).toBe("24h 30m");
    });

    it("handles includeDays=false with no remaining minutes", () => {
      // 2 days exactly = 172800 seconds
      expect(formatDurationHumanReadable(172800, { includeDays: false })).toBe("48h");
    });
  });
});
