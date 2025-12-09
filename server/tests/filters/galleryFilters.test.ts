/**
 * Unit Tests for Gallery Filtering Logic
 *
 * Tests the gallery filters in controllers/library/galleries.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { NormalizedGallery, PeekGalleryFilter } from "../../types/index.js";
import { applyGalleryFilters } from "../../controllers/library/galleries.js";
import {
  createMockGallery,
  createMockGalleries,
  createMockTags,
  createMockStudios,
  createMockPerformers,
} from "../helpers/mockDataGenerators.js";

describe("Gallery Filters", () => {
  let mockTags: ReturnType<typeof createMockTags>;
  let mockStudios: ReturnType<typeof createMockStudios>;
  let mockPerformers: ReturnType<typeof createMockPerformers>;
  let mockGalleries: NormalizedGallery[];

  beforeEach(() => {
    mockTags = createMockTags(15);
    mockStudios = createMockStudios(10);
    mockPerformers = createMockPerformers(20);
    mockGalleries = createMockGalleries(50);
  });

  describe("ID Filter", () => {
    it("should filter galleries by single ID", async () => {
      const filter: PeekGalleryFilter = {
        ids: [mockGalleries[0].id],
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe(mockGalleries[0].id);
    });

    it("should filter galleries by multiple IDs", async () => {
      const targetIds = [mockGalleries[0].id, mockGalleries[5].id, mockGalleries[10].id];
      const filter: PeekGalleryFilter = {
        ids: targetIds,
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      expect(result.length).toBe(3);
      result.forEach((gallery) => {
        expect(targetIds).toContain(gallery.id);
      });
    });

    it("should return empty array when filtering by non-existent ID", async () => {
      const filter: PeekGalleryFilter = {
        ids: ["nonexistent-id"],
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      expect(result.length).toBe(0);
    });

    it("should return all galleries when ids is empty array", async () => {
      const filter: PeekGalleryFilter = {
        ids: [],
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      expect(result.length).toBe(mockGalleries.length);
    });
  });

  describe("Favorite Filter", () => {
    it("should filter favorite galleries when favorite=true", async () => {
      const filter: PeekGalleryFilter = {
        favorite: true,
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      result.forEach((gallery) => {
        expect(gallery.favorite).toBe(true);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter non-favorite galleries when favorite=false", async () => {
      const filter: PeekGalleryFilter = {
        favorite: false,
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      result.forEach((gallery) => {
        expect(gallery.favorite).toBe(false);
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should return all galleries when favorite filter not specified", async () => {
      const result = await applyGalleryFilters(mockGalleries, {});

      expect(result.length).toBe(mockGalleries.length);
    });
  });

  describe("Rating Filter", () => {
    it("should filter by rating100 with GREATER_THAN modifier", async () => {
      const threshold = 50;
      const filter: PeekGalleryFilter = {
        rating100: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      result.forEach((gallery) => {
        const rating = gallery.rating100 || 0;
        expect(rating).toBeGreaterThan(threshold);
      });
    });

    it("should filter by rating100 with EQUALS modifier", async () => {
      const rating = 80;
      const filter: PeekGalleryFilter = {
        rating100: { value: rating, modifier: "EQUALS" },
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      result.forEach((gallery) => {
        expect(gallery.rating100).toBe(rating);
      });
    });

    it("should filter by rating100 with NOT_EQUALS modifier", async () => {
      const rating = 0;
      const filter: PeekGalleryFilter = {
        rating100: { value: rating, modifier: "NOT_EQUALS" },
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      result.forEach((gallery) => {
        expect(gallery.rating100).not.toBe(rating);
      });
    });

    it("should filter by rating100 with BETWEEN modifier", async () => {
      const min = 20;
      const max = 80;
      const filter: PeekGalleryFilter = {
        rating100: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      result.forEach((gallery) => {
        const rating = gallery.rating100 || 0;
        expect(rating).toBeGreaterThanOrEqual(min);
        expect(rating).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Image Count Filter", () => {
    it("should filter by image_count with GREATER_THAN modifier", async () => {
      const threshold = 50;
      const filter: PeekGalleryFilter = {
        image_count: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      result.forEach((gallery) => {
        const imageCount = gallery.image_count || 0;
        expect(imageCount).toBeGreaterThan(threshold);
      });
    });

    it("should filter by image_count with LESS_THAN modifier", async () => {
      const threshold = 100;
      const filter: PeekGalleryFilter = {
        image_count: { value: threshold, modifier: "LESS_THAN" },
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      result.forEach((gallery) => {
        const imageCount = gallery.image_count || 0;
        expect(imageCount).toBeLessThan(threshold);
      });
    });

    it("should filter by image_count with BETWEEN modifier", async () => {
      const min = 30;
      const max = 150;
      const filter: PeekGalleryFilter = {
        image_count: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      result.forEach((gallery) => {
        const imageCount = gallery.image_count || 0;
        expect(imageCount).toBeGreaterThanOrEqual(min);
        expect(imageCount).toBeLessThanOrEqual(max);
      });
    });
  });

  describe("Text Search Filters", () => {
    it("should filter by title (case-insensitive)", async () => {
      const searchTerm = "Gallery";
      const filter: PeekGalleryFilter = {
        title: {
          value: searchTerm,
          modifier: "INCLUDES",
        },
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      result.forEach((gallery) => {
        expect(gallery.title.toLowerCase()).toContain(searchTerm.toLowerCase());
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter by title with special characters", async () => {
      const mockGalleryWithTitle = createMockGallery({
        id: "title-test",
        title: "Special Gallery: Test & Examples",
      });
      const galleriesWithTitle = [...mockGalleries, mockGalleryWithTitle];

      const filter: PeekGalleryFilter = {
        title: {
          value: "Special",
          modifier: "INCLUDES",
        },
      };

      const result = await applyGalleryFilters(galleriesWithTitle, filter);

      result.forEach((gallery) => {
        expect(gallery.title.toLowerCase()).toContain("special");
      });

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("Studio Filter", () => {
    it("should filter galleries by studio", async () => {
      const studioId = mockStudios[0].id;
      const filter: PeekGalleryFilter = {
        studios: {
          value: [studioId],
          modifier: "INCLUDES",
        },
      };

      // Add studio to some galleries
      const galleriesWithStudio = mockGalleries.map((g, i) => ({
        ...g,
        studio: i % 3 === 0 ? mockStudios[0] : null,
      }));

      const result = await applyGalleryFilters(galleriesWithStudio, filter);

      result.forEach((gallery) => {
        expect(gallery.studio).toBeTruthy();
        expect(gallery.studio!.id).toBe(studioId);
      });
    });

    it("should filter galleries by multiple studios", async () => {
      const studioIds = [mockStudios[0].id, mockStudios[1].id];
      const filter: PeekGalleryFilter = {
        studios: {
          value: studioIds,
          modifier: "INCLUDES",
        },
      };

      // Add studios to some galleries
      const galleriesWithStudios = mockGalleries.map((g, i) => ({
        ...g,
        studio: i % 2 === 0 ? mockStudios[0] : i % 3 === 0 ? mockStudios[1] : null,
      }));

      const result = await applyGalleryFilters(galleriesWithStudios, filter);

      result.forEach((gallery) => {
        expect(gallery.studio).toBeTruthy();
        expect(studioIds).toContain(gallery.studio!.id);
      });
    });

    it("should return empty array when no galleries match studio filter", async () => {
      const galleriesWithoutStudios = mockGalleries.map((g) => ({
        ...g,
        studio: null,
      }));

      const filter: PeekGalleryFilter = {
        studios: {
          value: [mockStudios[0].id],
          modifier: "INCLUDES",
        },
      };

      const result = await applyGalleryFilters(galleriesWithoutStudios, filter);

      expect(result.length).toBe(0);
    });
  });

  describe("Performers Filter", () => {
    it("should filter galleries by performer", async () => {
      const performerId = mockPerformers[0].id;
      const filter: PeekGalleryFilter = {
        performers: {
          value: [performerId],
          modifier: "INCLUDES",
        },
      };

      // Add performers to some galleries
      const galleriesWithPerformers = mockGalleries.map((g, i) => ({
        ...g,
        performers: i % 3 === 0 ? [mockPerformers[0]] : [],
      }));

      const result = await applyGalleryFilters(galleriesWithPerformers, filter);

      result.forEach((gallery) => {
        const performerIds = (gallery.performers || []).map((p) => p.id);
        expect(performerIds).toContain(performerId);
      });
    });

    it("should filter galleries by multiple performers", async () => {
      const performerIds = [mockPerformers[0].id, mockPerformers[1].id];
      const filter: PeekGalleryFilter = {
        performers: {
          value: performerIds,
          modifier: "INCLUDES",
        },
      };

      // Add performers to some galleries
      const galleriesWithPerformers = mockGalleries.map((g, i) => ({
        ...g,
        performers:
          i % 2 === 0 ? [mockPerformers[0]] : i % 3 === 0 ? [mockPerformers[1]] : [],
      }));

      const result = await applyGalleryFilters(galleriesWithPerformers, filter);

      result.forEach((gallery) => {
        const galleryPerformerIds = (gallery.performers || []).map((p) => p.id);
        const hasMatch = performerIds.some((id) => galleryPerformerIds.includes(id));
        expect(hasMatch).toBe(true);
      });
    });
  });

  describe("Tags Filter", () => {
    it("should filter galleries by tag", async () => {
      const tagId = mockTags[0].id;
      const filter: PeekGalleryFilter = {
        tags: {
          value: [tagId],
          modifier: "INCLUDES",
        },
      };

      // Add tags to some galleries
      const galleriesWithTags = mockGalleries.map((g, i) => ({
        ...g,
        tags: i % 3 === 0 ? [mockTags[0]] : [],
      }));

      const result = await applyGalleryFilters(galleriesWithTags, filter);

      result.forEach((gallery) => {
        const tagIds = (gallery.tags || []).map((t) => t.id);
        expect(tagIds).toContain(tagId);
      });
    });

    it("should filter galleries by multiple tags", async () => {
      const tagIds = [mockTags[0].id, mockTags[1].id];
      const filter: PeekGalleryFilter = {
        tags: {
          value: tagIds,
          modifier: "INCLUDES",
        },
      };

      // Add tags to some galleries
      const galleriesWithTags = mockGalleries.map((g, i) => ({
        ...g,
        tags: i % 2 === 0 ? [mockTags[0]] : i % 3 === 0 ? [mockTags[1]] : [],
      }));

      const result = await applyGalleryFilters(galleriesWithTags, filter);

      result.forEach((gallery) => {
        const galleryTagIds = (gallery.tags || []).map((t) => t.id);
        const hasMatch = tagIds.some((id) => galleryTagIds.includes(id));
        expect(hasMatch).toBe(true);
      });
    });
  });

  describe("Multiple Combined Filters", () => {
    it("should apply multiple filters together (AND logic)", async () => {
      const filter: PeekGalleryFilter = {
        favorite: true,
        rating100: { value: 60, modifier: "GREATER_THAN" },
        image_count: { value: 30, modifier: "GREATER_THAN" },
      };

      const result = await applyGalleryFilters(mockGalleries, filter);

      result.forEach((gallery) => {
        expect(gallery.favorite).toBe(true);
        expect(gallery.rating100 || 0).toBeGreaterThan(60);
        expect(gallery.image_count || 0).toBeGreaterThan(30);
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle null filter gracefully", async () => {
      const result = await applyGalleryFilters(mockGalleries, null);

      expect(result.length).toBe(mockGalleries.length);
    });

    it("should handle undefined filter gracefully", async () => {
      const result = await applyGalleryFilters(mockGalleries, undefined);

      expect(result.length).toBe(mockGalleries.length);
    });

    it("should handle galleries without ratings correctly", async () => {
      const galleriesWithNullRatings = mockGalleries.filter((g) => !g.rating100);

      const filter: PeekGalleryFilter = {
        rating100: { value: 0, modifier: "GREATER_THAN" },
      };

      const result = await applyGalleryFilters(galleriesWithNullRatings, filter);

      // Galleries with null ratings should be treated as 0
      expect(result.length).toBe(0);
    });

    it("should handle galleries without tags correctly", async () => {
      const galleriesWithoutTags = mockGalleries.map((g) => ({ ...g, tags: [] }));

      const filter: PeekGalleryFilter = {
        tags: {
          value: [mockTags[0].id],
          modifier: "INCLUDES",
        },
      };

      const result = await applyGalleryFilters(galleriesWithoutTags, filter);

      expect(result.length).toBe(0);
    });

    it("should handle galleries without performers correctly", async () => {
      const galleriesWithoutPerformers = mockGalleries.map((g) => ({
        ...g,
        performers: [],
      }));

      const filter: PeekGalleryFilter = {
        performers: {
          value: [mockPerformers[0].id],
          modifier: "INCLUDES",
        },
      };

      const result = await applyGalleryFilters(galleriesWithoutPerformers, filter);

      expect(result.length).toBe(0);
    });
  });
});
