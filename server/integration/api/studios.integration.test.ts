import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/studios
interface FindStudiosResponse {
  findStudios: {
    studios: Array<{ id: string; name: string }>;
    count: number;
  };
}

describe("Studio API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/library/studios", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/studios", {});
      expect(response.status).toBe(401);
    });

    it("returns studios with pagination", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
      expect(response.data.findStudios.studios).toBeDefined();
      expect(Array.isArray(response.data.findStudios.studios)).toBe(true);
      expect(response.data.findStudios.count).toBeGreaterThan(0);
    });

    it("returns studio by ID", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        ids: [TEST_ENTITIES.studioWithScenes],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios.studios).toHaveLength(1);
      expect(response.data.findStudios.studios[0].id).toBe(TEST_ENTITIES.studioWithScenes);
    });
  });

  describe("POST /api/library/studios/minimal", () => {
    it("returns minimal studio data", async () => {
      const response = await adminClient.post<{
        studios: Array<{ id: string; name: string }>;
      }>("/api/library/studios/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.studios).toBeDefined();
      expect(Array.isArray(response.data.studios)).toBe(true);
    });
  });
});
