import { describe, it, expect } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Studio API", () => {
  describe("POST /api/library/studios", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/studios", {});
      expect(response.status).toBe(401);
    });

    it("returns studios with pagination", async () => {
      const response = await adminClient.post<{
        studios: Array<{ id: string; name: string }>;
        count: number;
      }>("/api/library/studios", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.studios).toBeDefined();
      expect(Array.isArray(response.data.studios)).toBe(true);
      expect(response.data.count).toBeGreaterThan(0);
    });

    it("returns studio by ID", async () => {
      const response = await adminClient.post<{
        studios: Array<{ id: string; name: string }>;
      }>("/api/library/studios", {
        ids: [TEST_ENTITIES.studioWithScenes],
      });

      expect(response.ok).toBe(true);
      expect(response.data.studios).toHaveLength(1);
      expect(response.data.studios[0].id).toBe(TEST_ENTITIES.studioWithScenes);
    });
  });

  describe("POST /api/library/studios/minimal", () => {
    it("returns minimal studio data", async () => {
      const response = await adminClient.post<{
        studios: Array<{ id: string; name: string }>;
      }>("/api/library/studios/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.studios).toBeDefined();
    });
  });
});
