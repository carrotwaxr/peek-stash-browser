import { describe, it, expect } from "vitest";
import { galleryTitle } from "../../src/utils/gallery";

describe("gallery utilities", () => {
  describe("galleryTitle", () => {
    it("returns title when present", () => {
      expect(galleryTitle({ title: "My Gallery" })).toBe("My Gallery");
    });

    it("returns file basename when no title", () => {
      expect(
        galleryTitle({ files: [{ basename: "vacation_2024" }] })
      ).toBe("vacation_2024");
    });

    it("returns folder path basename when no title and no files", () => {
      const result = galleryTitle({ folder: { path: "/photos/beach" } });
      expect(result).toBe("beach");
    });

    it("returns 'Untitled Gallery' for null", () => {
      expect(galleryTitle(null)).toBe("Untitled Gallery");
    });

    it("returns 'Untitled Gallery' for empty object", () => {
      expect(galleryTitle({})).toBe("Untitled Gallery");
    });

    it("returns 'Untitled Gallery' for empty title", () => {
      expect(galleryTitle({ title: "" })).toBe("Untitled Gallery");
    });

    it("returns 'Untitled Gallery' when files array is empty", () => {
      expect(galleryTitle({ files: [] })).toBe("Untitled Gallery");
    });

    it("uses title when all three fields are present (title wins)", () => {
      expect(
        galleryTitle({
          title: "Winner",
          files: [{ basename: "file.jpg" }],
          folder: { path: "/photos/beach" },
        })
      ).toBe("Winner");
    });

    it("falls back to file path when basename is missing", () => {
      const result = galleryTitle({
        files: [{ path: "/images/gallery/photo.jpg" }],
      });
      expect(result).toBe("photo.jpg");
    });

    it("uses folder path when files exist but have no basename or path", () => {
      const result = galleryTitle({
        files: [{}],
        folder: { path: "/albums/summer" },
      });
      // files[0] has no basename and no path, so falls through to folder
      expect(result).toBe("summer");
    });
  });
});
