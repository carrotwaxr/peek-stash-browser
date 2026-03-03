import { describe, it, expect } from "vitest";
import {
  wallConfig,
  ZOOM_LEVELS,
  DEFAULT_ZOOM,
  DEFAULT_VIEW_MODE,
} from "../../../src/components/wall/wallConfig";

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
      expect((config.getPreviewUrl as (...args: unknown[]) => unknown)({ cover: "/cover.jpg" })).toBeNull();
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
      expect((config.getPreviewUrl as (...args: unknown[]) => unknown)({})).toBeNull();
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

    it("has preview disabled", () => {
      expect(config.hasPreview).toBe(false);
    });
  });

  describe("clip config", () => {
    const config = wallConfig.clip;

    it("returns clip preview URL when id exists", () => {
      const clip = { id: "clip-1" };
      expect(config.getImageUrl(clip)).toBe("/api/proxy/clip/clip-1/preview");
    });

    it("returns null when clip has no id", () => {
      expect(config.getImageUrl({})).toBeNull();
    });

    it("returns preview URL for generated clips", () => {
      const clip = { id: "clip-1", isGenerated: true };
      expect(config.getPreviewUrl(clip)).toBe("/api/proxy/clip/clip-1/preview");
    });

    it("returns null preview URL for non-generated clips", () => {
      const clip = { id: "clip-1", isGenerated: false };
      expect(config.getPreviewUrl(clip)).toBeNull();
    });

    it("calculates aspect ratio from parent scene file dimensions", () => {
      const clip = { scene: { files: [{ width: 1920, height: 1080 }] } };
      expect(config.getAspectRatio(clip)).toBeCloseTo(16 / 9, 2);
    });

    it("returns default 16:9 aspect ratio when no scene dimensions", () => {
      expect(config.getAspectRatio({})).toBeCloseTo(16 / 9, 2);
      expect(config.getAspectRatio({ scene: {} })).toBeCloseTo(16 / 9, 2);
      expect(config.getAspectRatio({ scene: { files: [] } })).toBeCloseTo(16 / 9, 2);
      expect(config.getAspectRatio({ scene: { files: [{}] } })).toBeCloseTo(16 / 9, 2);
    });

    it("returns title or fallback", () => {
      expect(config.getTitle({ title: "Clip Title" })).toBe("Clip Title");
      expect(config.getTitle({})).toBe("Untitled");
    });

    it("builds subtitle from scene title and primary tag", () => {
      const clip = { scene: { title: "Scene 1" }, primaryTag: { name: "Action" } };
      expect(config.getSubtitle(clip)).toBe("Scene 1 • Action");
    });

    it("builds subtitle with scene title only", () => {
      const clip = { scene: { title: "Scene 1" } };
      expect(config.getSubtitle(clip)).toBe("Scene 1");
    });

    it("builds subtitle with primary tag only", () => {
      const clip = { primaryTag: { name: "Action" } };
      expect(config.getSubtitle(clip)).toBe("Action");
    });

    it("returns empty subtitle when no scene or tag", () => {
      expect(config.getSubtitle({})).toBe("");
    });

    it("has preview enabled", () => {
      expect(config.hasPreview).toBe(true);
    });
  });

  describe("scene config - edge cases", () => {
    const config = wallConfig.scene;

    it("builds subtitle with studio only (no date)", () => {
      const scene = { studio: { name: "Studio" } };
      expect(config.getSubtitle(scene)).toBe("Studio");
    });

    it("builds subtitle with date only (no studio)", () => {
      const scene = { date: "2024-01-15" };
      const subtitle = config.getSubtitle(scene);
      // date-fns formats relative dates
      expect(subtitle).toBeTruthy();
      expect(subtitle).not.toContain("•");
    });

    it("returns empty subtitle when no studio or date", () => {
      expect(config.getSubtitle({})).toBe("");
    });

    it("handles invalid date gracefully", () => {
      const scene = { date: "not-a-date" };
      // formatDate should catch and return the raw string
      const subtitle = config.getSubtitle(scene);
      expect(subtitle).toBeTruthy();
    });

    it("returns undefined for image URL when no paths", () => {
      expect(config.getImageUrl({})).toBeUndefined();
    });

    it("returns undefined for preview URL when no paths", () => {
      expect(config.getPreviewUrl({})).toBeUndefined();
    });
  });

  describe("image config - edge cases", () => {
    const config = wallConfig.image;

    it("returns undefined for image URL when no paths", () => {
      expect(config.getImageUrl({})).toBeUndefined();
    });

    it("returns null subtitle when only width provided", () => {
      expect(config.getSubtitle({ width: 1920 })).toBeNull();
    });

    it("returns null subtitle when only height provided", () => {
      expect(config.getSubtitle({ height: 1080 })).toBeNull();
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
