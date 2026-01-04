import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/galleries
interface FindGalleriesResponse {
  findGalleries: {
    galleries: Array<{ id: string; title?: string }>;
    count: number;
  };
}

describe("Gallery API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/library/galleries", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/galleries", {});
      expect(response.status).toBe(401);
    });

    it("returns galleries with pagination", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
      expect(response.data.findGalleries.galleries).toBeDefined();
      expect(Array.isArray(response.data.findGalleries.galleries)).toBe(true);
      expect(response.data.findGalleries.count).toBeGreaterThan(0);
    });

    it("returns gallery by ID", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        ids: [TEST_ENTITIES.galleryWithImages],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries.galleries).toHaveLength(1);
      expect(response.data.findGalleries.galleries[0].id).toBe(TEST_ENTITIES.galleryWithImages);
    });
  });

  describe("GET /api/library/galleries/:id/images", () => {
    it("returns paginated images from gallery", async () => {
      const response = await adminClient.get<{
        images: Array<{ id: string }>;
        count: number;
        page: number;
        per_page: number;
      }>(`/api/library/galleries/${TEST_ENTITIES.galleryWithImages}/images`);

      expect(response.ok).toBe(true);
      expect(response.data.images).toBeDefined();
      expect(Array.isArray(response.data.images)).toBe(true);
    });
  });
});
