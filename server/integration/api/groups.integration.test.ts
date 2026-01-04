import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/groups
interface FindGroupsResponse {
  findGroups: {
    groups: Array<{ id: string; name: string }>;
    count: number;
  };
}

describe("Group API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/library/groups", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/groups", {});
      expect(response.status).toBe(401);
    });

    it("returns groups with pagination", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
      expect(response.data.findGroups.groups).toBeDefined();
      expect(Array.isArray(response.data.findGroups.groups)).toBe(true);
      expect(response.data.findGroups.count).toBeGreaterThan(0);
    });

    it("returns group by ID", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        ids: [TEST_ENTITIES.groupWithScenes],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups.groups).toHaveLength(1);
      expect(response.data.findGroups.groups[0].id).toBe(TEST_ENTITIES.groupWithScenes);
    });
  });

  describe("POST /api/library/groups/minimal", () => {
    it("returns minimal group data", async () => {
      const response = await adminClient.post<{
        groups: Array<{ id: string; name: string }>;
      }>("/api/library/groups/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.groups).toBeDefined();
      expect(Array.isArray(response.data.groups)).toBe(true);
    });
  });
});
