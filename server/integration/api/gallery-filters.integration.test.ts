import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Gallery Filters Integration Tests
 *
 * Tests gallery-specific filters:
 * - favorite filter
 * - rating100 filter
 * - image_count filter
 * - title text search
 * - studios filter (with hierarchy)
 * - performers filter
 * - tags filter (with hierarchy)
 */

interface FindGalleriesResponse {
  findGalleries: {
    galleries: Array<{
      id: string;
      title?: string;
      favorite?: boolean;
      rating100?: number | null;
      image_count?: number;
      studio?: { id: string; name: string } | null;
      performers?: Array<{ id: string; name: string }>;
      tags?: Array<{ id: string; name?: string }>;
    }>;
    count: number;
  };
}

describe("Gallery Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("favorite filter", () => {
    it("filters favorite galleries", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();

      for (const gallery of response.data.findGalleries.galleries) {
        expect(gallery.favorite).toBe(true);
      }
    });

    it("filters non-favorite galleries", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          favorite: false,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          rating100: {
            value: 70,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          rating100: {
            value: 50,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          rating100: {
            value: 50,
            value2: 80,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("image_count filter", () => {
    it("filters galleries with many images", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          image_count: {
            value: 10,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries with few images", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          image_count: {
            value: 5,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries with image_count BETWEEN", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          image_count: {
            value: 10,
            value2: 50,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("title filter", () => {
    it("filters galleries by title text search", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          title: {
            value: "a",
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("studios filter", () => {
    it("filters galleries by studio", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries by studio with hierarchy depth", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
            depth: 1,
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("scenes filter", () => {
    it("filters galleries containing specific scene with INCLUDES", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          scenes: {
            value: [TEST_ENTITIES.sceneWithRelations],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries excluding specific scene with EXCLUDES", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          scenes: {
            value: [TEST_ENTITIES.sceneWithRelations],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("performers filter", () => {
    it("filters galleries by performer", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("tags filter", () => {
    it("filters galleries by tag with INCLUDES", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries by tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries by tag with hierarchy depth", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
            depth: 1,
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("text search (q parameter)", () => {
    it("searches galleries by title", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: {
          per_page: 50,
          q: "a",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("combined filters", () => {
    it("combines favorite and image_count filters", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          favorite: true,
          image_count: {
            value: 5,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();

      for (const gallery of response.data.findGalleries.galleries) {
        expect(gallery.favorite).toBe(true);
      }
    });

    it("combines studio and performer filters", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("combines rating and tags filters", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          rating100: {
            value: 60,
            modifier: "GREATER_THAN",
          },
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("sorting", () => {
    it("sorts galleries by title ASC", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: {
          per_page: 50,
          sort: "title",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("sorts galleries by image_count DESC", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: {
          per_page: 50,
          sort: "image_count",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("sorts galleries by rating100 DESC", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: {
          per_page: 50,
          sort: "rating100",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("gallery by ID", () => {
    it("returns gallery by ID with details", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        ids: [TEST_ENTITIES.galleryWithImages],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries.galleries).toHaveLength(1);
      expect(response.data.findGalleries.galleries[0].id).toBe(TEST_ENTITIES.galleryWithImages);
    });
  });
});
