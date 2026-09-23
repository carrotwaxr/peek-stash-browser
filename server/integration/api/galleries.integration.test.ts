import { beforeAll, describe, expect, it } from "vitest";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  adminClient,
  guestClient,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

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
    // Select only test instance to avoid ID collisions with other instances
    await selectTestInstanceOnly();
  });

  describe("POST /api/library/galleries", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/galleries", {});
      expect(response.status).toBe(401);
    });

    it("returns galleries with pagination", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          page: 1,
          per_page: 10,
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
      expect(response.data.findGalleries.galleries).toBeDefined();
      expect(Array.isArray(response.data.findGalleries.galleries)).toBe(true);
      expect(response.data.findGalleries.count).toBeGreaterThan(0);
    });

    it("returns gallery by ID", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          ids: [TEST_ENTITIES.galleryWithImages],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries.galleries).toHaveLength(1);
      expect(response.data.findGalleries.galleries[0].id).toBe(
        TEST_ENTITIES.galleryWithImages
      );
    });
  });

  describe("POST /api/library/images with a galleries filter", () => {
    it("returns that gallery's images", async () => {
      const response = await adminClient.post<{
        findImages: { images: Array<{ id: string }>; count: number };
      }>("/api/library/images", {
        filter: { page: 1, per_page: 100, sort: "path", direction: "ASC" },
        image_filter: {
          galleries: {
            value: [TEST_ENTITIES.galleryWithImages],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages.images).toBeDefined();
      expect(Array.isArray(response.data.findImages.images)).toBe(true);
    });
  });
});
