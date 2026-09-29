import { describe, expect, it } from "vitest";
import { extractBasename } from "../../utils/titleUtils.js";

describe("extractBasename", () => {
  it("returns the last path segment for / and \\ separators", () => {
    expect(extractBasename("/media/a/clip.mp4")).toBe("clip.mp4");
    expect(extractBasename("C:\\media\\clip.mp4")).toBe("clip.mp4");
  });

  it("falls back to the whole path when it ends with a separator", () => {
    expect(extractBasename("/media/a/")).toBe("/media/a/");
  });
});
