import { describe, expect, it } from "vitest";
import { isVideoImage } from "../../src/utils/imageMedia";

describe("isVideoImage", () => {
  it.each(["mp4", "m4v", "webm", "mov"])(
    "treats a .%s filePath as video",
    (ext) => {
      expect(isVideoImage({ filePath: `/data/clip.${ext}` })).toBe(true);
    }
  );

  it("matches the extension case-insensitively", () => {
    expect(isVideoImage({ filePath: "/data/CLIP.MP4" })).toBe(true);
    expect(isVideoImage({ filePath: "/data/Clip.WebM" })).toBe(true);
  });

  it.each(["jpg", "png", "gif", "webp", "avif"])(
    "treats a .%s filePath as an image",
    (ext) => {
      expect(isVideoImage({ filePath: `/data/pic.${ext}` })).toBe(false);
    }
  );

  it("is false without a path or files", () => {
    expect(isVideoImage({})).toBe(false);
    expect(isVideoImage({ filePath: null, files: [] })).toBe(false);
    expect(isVideoImage(null)).toBe(false);
    expect(isVideoImage(undefined)).toBe(false);
  });

  it("ignores a dot in a directory name", () => {
    expect(isVideoImage({ filePath: "/data/a.mp4/pic" })).toBe(false);
  });

  it("uses the first file's mime type when present", () => {
    expect(
      isVideoImage({ filePath: null, files: [{ mime_type: "video/mp4" }] })
    ).toBe(true);
    expect(
      isVideoImage({ filePath: null, files: [{ mime_type: "image/jpeg" }] })
    ).toBe(false);
  });

  it("falls back to the first file's path when filePath is empty", () => {
    expect(
      isVideoImage({ filePath: null, files: [{ path: "/x/a.mov" }] })
    ).toBe(true);
  });
});
