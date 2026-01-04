import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/images
interface FindImagesResponse {
  findImages: {
    images: Array<{ id: string }>;
    count: number;
  };
}

describe("Image API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/library/images", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/images", {});
      expect(response.status).toBe(401);
    });

    it("returns images with pagination", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
      expect(response.data.findImages.images).toBeDefined();
      expect(Array.isArray(response.data.findImages.images)).toBe(true);
      expect(response.data.findImages.count).toBeGreaterThan(0);
    });
  });
});
