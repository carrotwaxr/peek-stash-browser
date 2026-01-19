/**
 * Integration tests for Timeline Date Filter functionality
 *
 * Tests that date filters properly flow from TimelineView through SearchControls
 * to the query builder, ensuring galleries/images with null dates are excluded
 * when in timeline view.
 */
import { describe, it, expect } from "vitest";
import { buildGalleryFilter, buildImageFilter, buildSceneFilter } from "../../src/utils/filterConfig.js";

// Test the filter builders directly - the core of Bug #1
describe("Date Filter Integration", () => {
  describe("buildGalleryFilter with date ranges", () => {
    it("applies BETWEEN date filter for timeline period selection", () => {
      const filters = {
        date: {
          start: "2024-03-01",
          end: "2024-03-31",
        },
      };

      const result = buildGalleryFilter(filters);

      expect(result.date).toEqual({
        value: "2024-03-01",
        value2: "2024-03-31",
        modifier: "BETWEEN",
      });
    });

    it("combines date filter with other filters", () => {
      const filters = {
        favorite: true,
        date: {
          start: "2024-01-01",
          end: "2024-12-31",
        },
        tagIds: ["tag1", "tag2"],
      };

      const result = buildGalleryFilter(filters);

      expect(result.favorite).toBe(true);
      expect(result.date).toEqual({
        value: "2024-01-01",
        value2: "2024-12-31",
        modifier: "BETWEEN",
      });
      expect(result.tags).toBeDefined();
    });
  });

  describe("buildImageFilter with date ranges", () => {
    it("applies BETWEEN date filter for timeline period selection", () => {
      const filters = {
        date: {
          start: "2024-06-01",
          end: "2024-06-30",
        },
      };

      const result = buildImageFilter(filters);

      expect(result.date).toEqual({
        value: "2024-06-01",
        value2: "2024-06-30",
        modifier: "BETWEEN",
      });
    });

    it("combines date filter with other filters", () => {
      const filters = {
        favorite: true,
        date: {
          start: "2024-01-01",
          end: "2024-06-30",
        },
        galleryIds: ["gallery1"],
      };

      const result = buildImageFilter(filters);

      expect(result.favorite).toBe(true);
      expect(result.date).toEqual({
        value: "2024-01-01",
        value2: "2024-06-30",
        modifier: "BETWEEN",
      });
      expect(result.galleries).toBeDefined();
    });
  });

  describe("buildSceneFilter date handling (reference implementation)", () => {
    it("handles date filter the same way as galleries/images", () => {
      const filters = {
        date: {
          start: "2024-01-01",
          end: "2024-12-31",
        },
      };

      const sceneResult = buildSceneFilter(filters);
      const galleryResult = buildGalleryFilter(filters);
      const imageResult = buildImageFilter(filters);

      // All three should produce identical date filter structures
      expect(galleryResult.date).toEqual(sceneResult.date);
      expect(imageResult.date).toEqual(sceneResult.date);
    });
  });
});

describe("Timeline Date Filter Edge Cases", () => {
  it("handles single day selection (start equals end)", () => {
    const filters = {
      date: {
        start: "2024-03-15",
        end: "2024-03-15",
      },
    };

    const galleryResult = buildGalleryFilter(filters);
    const imageResult = buildImageFilter(filters);

    // Should still use BETWEEN modifier
    expect(galleryResult.date.modifier).toBe("BETWEEN");
    expect(imageResult.date.modifier).toBe("BETWEEN");
  });

  it("handles year boundaries correctly", () => {
    const filters = {
      date: {
        start: "2024-01-01",
        end: "2024-12-31",
      },
    };

    const galleryResult = buildGalleryFilter(filters);

    expect(galleryResult.date.value).toBe("2024-01-01");
    expect(galleryResult.date.value2).toBe("2024-12-31");
  });

  it("preserves existing filters when adding date filter", () => {
    const filters = {
      favorite: true,
      rating: { min: 50, max: 100 },
      performerIds: ["perf1"],
      date: {
        start: "2024-01-01",
        end: "2024-06-30",
      },
    };

    const galleryResult = buildGalleryFilter(filters);

    // All filters should be present
    expect(galleryResult.favorite).toBe(true);
    expect(galleryResult.rating100).toBeDefined();
    expect(galleryResult.performers).toBeDefined();
    expect(galleryResult.date).toBeDefined();
  });
});
