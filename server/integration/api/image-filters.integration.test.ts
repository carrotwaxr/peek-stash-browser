import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Image Filters Integration Tests
 *
 * Tests image-specific filters:
 * - favorite filter
 * - rating100 filter
 * - o_counter filter
 * - performers filter
 * - tags filter
 * - studios filter
 * - galleries filter
 * - text search (q parameter)
 */

interface FindImagesResponse {
  findImages: {
    images: Array<{
      id: string;
      title?: string;
      favorite?: boolean;
      rating100?: number | null;
      o_counter?: number;
      performers?: Array<{ id: string; name: string }>;
      studio?: { id: string; name: string } | null;
      tags?: Array<{ id: string; name?: string }>;
      galleries?: Array<{ id: string; title?: string }>;
    }>;
    count: number;
  };
}

describe("Image Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("favorite filter", () => {
    it("filters favorite images", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();

      for (const image of response.data.findImages.images) {
        expect(image.favorite).toBe(true);
      }
    });

    it("filters non-favorite images", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          favorite: false,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          rating100: {
            value: 70,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          rating100: {
            value: 50,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          rating100: {
            value: 50,
            value2: 80,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("o_counter filter", () => {
    it("filters by o_counter GREATER_THAN", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          o_counter: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("filters by o_counter EQUALS zero", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          o_counter: {
            value: 0,
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("performers filter", () => {
    it("filters images by performer with INCLUDES", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("tags filter", () => {
    it("filters images by tag with INCLUDES", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("filters images by tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("studios filter", () => {
    it("filters images by studio", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("galleries filter", () => {
    it("filters images by gallery", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          galleries: {
            value: [TEST_ENTITIES.galleryWithImages],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
      expect(response.data.findImages.count).toBeGreaterThan(0);
    });
  });

  describe("text search (q parameter)", () => {
    it("searches images by title", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: {
          per_page: 50,
          q: "a",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("combined filters", () => {
    it("combines favorite and rating filters", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          favorite: true,
          rating100: {
            value: 50,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();

      for (const image of response.data.findImages.images) {
        expect(image.favorite).toBe(true);
      }
    });

    it("combines performer and gallery filters", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
          galleries: {
            value: [TEST_ENTITIES.galleryWithImages],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("combines studio and tags filters", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("sorting", () => {
    it("sorts images by title ASC", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: {
          per_page: 50,
          sort: "title",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("sorts images by rating100 DESC", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: {
          per_page: 50,
          sort: "rating100",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("sorts images by o_counter DESC", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: {
          per_page: 50,
          sort: "o_counter",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("pagination", () => {
    it("paginates images correctly", async () => {
      const page1 = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: {
          page: 1,
          per_page: 10,
        },
      });

      const page2 = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: {
          page: 2,
          per_page: 10,
        },
      });

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      const page1Ids = page1.data.findImages.images.map((i) => i.id);
      const page2Ids = page2.data.findImages.images.map((i) => i.id);

      // Pages should have different images
      if (page1Ids.length > 0 && page2Ids.length > 0) {
        for (const id of page2Ids) {
          expect(page1Ids).not.toContain(id);
        }
      }
    });
  });
});
