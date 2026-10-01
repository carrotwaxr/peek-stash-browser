import { describe, expect, it } from "vitest";
import { videoMimeType } from "../../utils/videoMimeType.js";

describe("videoMimeType", () => {
  it("maps each extension", () => {
    const cases: Array<[string, string]> = [
      ["/media/a.mp4", "video/mp4"],
      ["/media/a.m4v", "video/x-m4v"],
      ["/media/a.mkv", "video/x-matroska"],
      ["/media/a.webm", "video/webm"],
      ["/media/a.wmv", "video/x-ms-wmv"],
      ["/media/a.avi", "video/x-msvideo"],
      ["/media/a.mov", "video/quicktime"],
      ["/media/a.mpg", "video/mpeg"],
      ["/media/a.mpeg", "video/mpeg"],
      ["/media/a.flv", "video/x-flv"],
      ["/media/a.ts", "video/mp2t"],
    ];
    for (const [path, type] of cases) {
      expect(videoMimeType(path), path).toBe(type);
    }
  });

  it("is case-insensitive and reads only the last extension", () => {
    expect(videoMimeType("C:\\Videos\\Clip.MKV")).toBe("video/x-matroska");
    expect(videoMimeType("/media/a.mkv.mp4")).toBe("video/mp4");
  });

  it("gives video/* for an unknown extension, none or no path", () => {
    expect(videoMimeType("/media/a.rmvb")).toBe("video/*");
    expect(videoMimeType("/media/noextension")).toBe("video/*");
    expect(videoMimeType("")).toBe("video/*");
    expect(videoMimeType(null)).toBe("video/*");
  });
});
