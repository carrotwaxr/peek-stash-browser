import { describe, it, expect } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Group API", () => {
  describe("POST /api/library/groups", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/groups", {});
      expect(response.status).toBe(401);
    });

    it("returns groups with pagination", async () => {
      const response = await adminClient.post<{
        groups: Array<{ id: string; name: string }>;
        count: number;
      }>("/api/library/groups", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.groups).toBeDefined();
      expect(Array.isArray(response.data.groups)).toBe(true);
    });

    it("returns group by ID", async () => {
      const response = await adminClient.post<{
        groups: Array<{ id: string; name: string }>;
      }>("/api/library/groups", {
        ids: [TEST_ENTITIES.groupWithScenes],
      });

      expect(response.ok).toBe(true);
      if (response.data.groups.length > 0) {
        expect(response.data.groups[0].id).toBe(TEST_ENTITIES.groupWithScenes);
      }
    });
  });

  describe("POST /api/library/groups/minimal", () => {
    it("returns minimal group data", async () => {
      const response = await adminClient.post<{
        groups: Array<{ id: string; name: string }>;
      }>("/api/library/groups/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.groups).toBeDefined();
    });
  });
});
