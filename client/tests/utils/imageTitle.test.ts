import { describe, expect, it } from "vitest";
import { getImageTitle } from "../../src/utils/imageTitle";

describe("getImageTitle", () => {
  it("prefers the title", () => {
    expect(
      getImageTitle({ id: "1", title: "Sunset", filePath: "/a/b.jpg" })
    ).toBe("Sunset");
  });

  it("falls back to the file name, with either separator", () => {
    expect(getImageTitle({ id: "1", title: null, filePath: "/a/b.jpg" })).toBe(
      "b.jpg"
    );
    expect(
      getImageTitle({ id: "1", title: null, filePath: "C:\\a\\c.png" })
    ).toBe("c.png");
  });

  it("falls back to Image <id>, then to null", () => {
    expect(getImageTitle({ id: "7", title: null, filePath: null })).toBe(
      "Image 7"
    );
    expect(getImageTitle(null)).toBeNull();
  });
});
