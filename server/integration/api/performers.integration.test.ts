import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/performers
interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{ id: string; name: string }>;
    count: number;
  };
}

describe("Performer API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/library/performers", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/performers", {});
      expect(response.status).toBe(401);
    });

    it("returns performers with pagination", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          page: 1,
          per_page: 10,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
      expect(response.data.findPerformers.performers).toBeDefined();
      expect(Array.isArray(response.data.findPerformers.performers)).toBe(true);
      expect(response.data.findPerformers.performers.length).toBeLessThanOrEqual(10);
      expect(response.data.findPerformers.count).toBeGreaterThan(0);
    });

    it("returns performer by ID", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        ids: [TEST_ENTITIES.performerWithScenes],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers.performers).toHaveLength(1);
      expect(response.data.findPerformers.performers[0].id).toBe(TEST_ENTITIES.performerWithScenes);
      expect(response.data.findPerformers.performers[0].name).toBeDefined();
    });
  });

  describe("POST /api/library/performers/minimal", () => {
    it("returns minimal performer data for dropdowns", async () => {
      const response = await adminClient.post<{
        performers: Array<{ id: string; name: string }>;
      }>("/api/library/performers/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.performers).toBeDefined();
      expect(Array.isArray(response.data.performers)).toBe(true);
    });
  });
});
