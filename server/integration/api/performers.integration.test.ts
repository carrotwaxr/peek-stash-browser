import { describe, it, expect } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Performer API", () => {
  describe("POST /api/library/performers", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/performers", {});
      expect(response.status).toBe(401);
    });

    it("returns performers with pagination", async () => {
      const response = await adminClient.post<{
        performers: Array<{ id: string; name: string }>;
        count: number;
      }>("/api/library/performers", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.performers).toBeDefined();
      expect(Array.isArray(response.data.performers)).toBe(true);
      expect(response.data.performers.length).toBeLessThanOrEqual(10);
      expect(response.data.count).toBeGreaterThan(0);
    });

    it("returns performer by ID", async () => {
      const response = await adminClient.post<{
        performers: Array<{ id: string; name: string }>;
      }>("/api/library/performers", {
        ids: [TEST_ENTITIES.performerWithScenes],
      });

      expect(response.ok).toBe(true);
      expect(response.data.performers).toHaveLength(1);
      expect(response.data.performers[0].id).toBe(TEST_ENTITIES.performerWithScenes);
      expect(response.data.performers[0].name).toBeDefined();
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
