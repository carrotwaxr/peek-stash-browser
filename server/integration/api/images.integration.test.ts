import { describe, it, expect } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";

describe("Image API", () => {
  describe("POST /api/library/images", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/images", {});
      expect(response.status).toBe(401);
    });

    it("returns images with pagination", async () => {
      const response = await adminClient.post<{
        images: Array<{ id: string }>;
        count: number;
      }>("/api/library/images", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.images).toBeDefined();
      expect(Array.isArray(response.data.images)).toBe(true);
    });
  });
});
