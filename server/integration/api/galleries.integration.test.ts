import { describe, it, expect } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Gallery API", () => {
  describe("POST /api/library/galleries", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/galleries", {});
      expect(response.status).toBe(401);
    });

    it("returns galleries with pagination", async () => {
      const response = await adminClient.post<{
        galleries: Array<{ id: string; title?: string }>;
        count: number;
      }>("/api/library/galleries", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.galleries).toBeDefined();
      expect(Array.isArray(response.data.galleries)).toBe(true);
    });

    it("returns gallery by ID", async () => {
      const response = await adminClient.post<{
        galleries: Array<{ id: string }>;
      }>("/api/library/galleries", {
        ids: [TEST_ENTITIES.galleryWithImages],
      });

      expect(response.ok).toBe(true);
      if (response.data.galleries.length > 0) {
        expect(response.data.galleries[0].id).toBe(TEST_ENTITIES.galleryWithImages);
      }
    });
  });

  describe("GET /api/library/galleries/:id/images", () => {
    it("returns paginated images from gallery", async () => {
      const response = await adminClient.get<{
        images: Array<{ id: string }>;
        count: number;
      }>(`/api/library/galleries/${TEST_ENTITIES.galleryWithImages}/images?page=1&per_page=10`);

      expect(response.ok).toBe(true);
      expect(response.data.images).toBeDefined();
      expect(Array.isArray(response.data.images)).toBe(true);
    });
  });
});
