import { describe, it, expect } from "vitest";
import {
  wallConfig,
  ZOOM_LEVELS,
  DEFAULT_ZOOM,
  DEFAULT_VIEW_MODE,
} from "../../../src/components/wall/wallConfig.js";

describe("wallConfig", () => {
  describe("scene config", () => {
    const config = wallConfig.scene;

    it("returns screenshot as image URL", () => {
      const scene = { paths: { screenshot: "/screenshot.jpg" } };
      expect(config.getImageUrl(scene)).toBe("/screenshot.jpg");
    });

    it("returns preview as preview URL", () => {
      const scene = { paths: { preview: "/preview.mp4" } };
      expect(config.getPreviewUrl(scene)).toBe("/preview.mp4");
    });

    it("calculates aspect ratio from file dimensions", () => {
      const scene = { files: [{ width: 1920, height: 1080 }] };
      expect(config.getAspectRatio(scene)).toBeCloseTo(16 / 9, 2);
    });

    it("returns default 16:9 aspect ratio when no dimensions", () => {
      expect(config.getAspectRatio({})).toBeCloseTo(16 / 9, 2);
      expect(config.getAspectRatio({ files: [] })).toBeCloseTo(16 / 9, 2);
      expect(config.getAspectRatio({ files: [{}] })).toBeCloseTo(16 / 9, 2);
    });

    it("returns title or fallback", () => {
      expect(config.getTitle({ title: "Test Scene" })).toBe("Test Scene");
      expect(config.getTitle({})).toBe("Untitled");
    });

    it("builds subtitle from studio and date", () => {
      const scene = { studio: { name: "Studio Name" }, date: "2024-01-15" };
      const subtitle = config.getSubtitle(scene);
      expect(subtitle).toContain("Studio Name");
    });

    it("returns correct link path", () => {
      expect(config.getLinkPath({ id: "123" })).toBe("/scene/123");
    });

    it("has preview enabled", () => {
      expect(config.hasPreview).toBe(true);
    });
  });

  describe("gallery config", () => {
    const config = wallConfig.gallery;

    it("returns cover as image URL", () => {
      const gallery = { cover: "/api/proxy/stash?path=/gallery/1/cover" };
      expect(config.getImageUrl(gallery)).toBe(
        "/api/proxy/stash?path=/gallery/1/cover"
      );
    });

    it("returns null when no cover", () => {
      expect(config.getImageUrl({})).toBeNull();
      expect(config.getImageUrl({ cover: null })).toBeNull();
    });

    it("returns null for preview URL (galleries have no preview)", () => {
      expect(config.getPreviewUrl({ cover: "/cover.jpg" })).toBeNull();
    });

    it("calculates aspect ratio from cover dimensions", () => {
      const gallery = { coverWidth: 1920, coverHeight: 1080 };
      expect(config.getAspectRatio(gallery)).toBeCloseTo(16 / 9, 2);
    });

    it("returns 1 (square) aspect ratio when no dimensions", () => {
      expect(config.getAspectRatio({})).toBe(1);
      expect(config.getAspectRatio({ coverWidth: null, coverHeight: null })).toBe(1);
      expect(config.getAspectRatio({ coverWidth: 100 })).toBe(1); // Missing height
      expect(config.getAspectRatio({ coverHeight: 100 })).toBe(1); // Missing width
    });

    it("calculates correct aspect ratio for various dimensions", () => {
      // Landscape
      expect(
        config.getAspectRatio({ coverWidth: 1920, coverHeight: 1080 })
      ).toBeCloseTo(1.78, 1);

      // Portrait
      expect(
        config.getAspectRatio({ coverWidth: 1080, coverHeight: 1920 })
      ).toBeCloseTo(0.56, 1);

      // Square
      expect(
        config.getAspectRatio({ coverWidth: 1000, coverHeight: 1000 })
      ).toBe(1);

      // 4:3
      expect(
        config.getAspectRatio({ coverWidth: 800, coverHeight: 600 })
      ).toBeCloseTo(4 / 3, 2);
    });

    it("returns title or fallback", () => {
      expect(config.getTitle({ title: "Test Gallery" })).toBe("Test Gallery");
      expect(config.getTitle({})).toBe("Untitled Gallery");
    });

    it("builds subtitle with image count", () => {
      expect(config.getSubtitle({ image_count: 25 })).toBe("25 images");
      expect(config.getSubtitle({})).toBe("0 images");
    });

    it("returns correct link path", () => {
      expect(config.getLinkPath({ id: "456" })).toBe("/gallery/456");
    });

    it("has preview disabled", () => {
      expect(config.hasPreview).toBe(false);
    });
  });

  describe("image config", () => {
    const config = wallConfig.image;

    it("returns thumbnail as image URL", () => {
      const image = { paths: { thumbnail: "/thumb.jpg" } };
      expect(config.getImageUrl(image)).toBe("/thumb.jpg");
    });

    it("returns null for preview URL (images have no preview)", () => {
      expect(config.getPreviewUrl({})).toBeNull();
    });

    it("calculates aspect ratio from dimensions", () => {
      const image = { width: 1920, height: 1080 };
      expect(config.getAspectRatio(image)).toBeCloseTo(16 / 9, 2);
    });

    it("returns 1 (square) aspect ratio when no dimensions", () => {
      expect(config.getAspectRatio({})).toBe(1);
    });

    it("returns title with fallback to filename", () => {
      expect(config.getTitle({ title: "Test Image" })).toBe("Test Image");
      expect(
        config.getTitle({ files: [{ basename: "photo.jpg" }] })
      ).toBe("photo.jpg");
      expect(config.getTitle({})).toBe("Untitled");
    });

    it("builds subtitle with resolution", () => {
      const image = { width: 1920, height: 1080 };
      expect(config.getSubtitle(image)).toBe("1920×1080");
    });

    it("returns null subtitle when no dimensions", () => {
      expect(config.getSubtitle({})).toBeNull();
    });

    it("returns correct link path", () => {
      expect(config.getLinkPath({ id: "789" })).toBe("/image/789");
    });

    it("has preview disabled", () => {
      expect(config.hasPreview).toBe(false);
    });
  });
});

describe("ZOOM_LEVELS", () => {
  it("has small, medium, and large levels", () => {
    expect(ZOOM_LEVELS).toHaveProperty("small");
    expect(ZOOM_LEVELS).toHaveProperty("medium");
    expect(ZOOM_LEVELS).toHaveProperty("large");
  });

  it("has increasing row heights", () => {
    expect(ZOOM_LEVELS.small.targetRowHeight).toBeLessThan(
      ZOOM_LEVELS.medium.targetRowHeight
    );
    expect(ZOOM_LEVELS.medium.targetRowHeight).toBeLessThan(
      ZOOM_LEVELS.large.targetRowHeight
    );
  });

  it("has labels for each level", () => {
    expect(ZOOM_LEVELS.small.label).toBe("S");
    expect(ZOOM_LEVELS.medium.label).toBe("M");
    expect(ZOOM_LEVELS.large.label).toBe("L");
  });
});

describe("defaults", () => {
  it("has medium as default zoom", () => {
    expect(DEFAULT_ZOOM).toBe("medium");
    expect(ZOOM_LEVELS[DEFAULT_ZOOM]).toBeDefined();
  });

  it("has grid as default view mode", () => {
    expect(DEFAULT_VIEW_MODE).toBe("grid");
  });
});
