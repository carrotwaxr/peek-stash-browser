import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient, selectTestInstanceOnly } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/groups
interface FindGroupsResponse {
  findGroups: {
    groups: Array<{
      id: string;
      name: string;
      tags?: Array<{ id: string; name: string; image_path: string | null }>;
      studio?: { id: string; name: string; image_path: string | null } | null;
      performers?: Array<{ id: string; name: string; image_path: string | null }>;
      galleries?: Array<{ id: string; title: string; cover: string | null }>;
    }>;
    count: number;
  };
}

describe("Group API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // Select only test instance to avoid ID collisions with other instances
    await selectTestInstanceOnly();
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

    it("returns group with tooltip entity data (tags, studio, performers, galleries)", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        ids: [TEST_ENTITIES.groupWithScenes],
      });

      expect(response.ok).toBe(true);
      const group = response.data.findGroups.groups[0];

      // Tags should have image_path
      expect(group).toHaveProperty('tags');
      if (group.tags && group.tags.length > 0) {
        expect(group.tags[0]).toHaveProperty('id');
        expect(group.tags[0]).toHaveProperty('name');
        expect(group.tags[0]).toHaveProperty('image_path');
      }

      // Studio should have image_path
      if (group.studio) {
        expect(group.studio).toHaveProperty('id');
        expect(group.studio).toHaveProperty('name');
        expect(group.studio).toHaveProperty('image_path');
      }

      // Performers should exist with tooltip data
      expect(group).toHaveProperty('performers');
      if (group.performers && group.performers.length > 0) {
        expect(group.performers[0]).toHaveProperty('id');
        expect(group.performers[0]).toHaveProperty('name');
        expect(group.performers[0]).toHaveProperty('image_path');
      }

      // Galleries should exist with tooltip data
      expect(group).toHaveProperty('galleries');
      if (group.galleries && group.galleries.length > 0) {
        expect(group.galleries[0]).toHaveProperty('id');
        expect(group.galleries[0]).toHaveProperty('title');
        expect(group.galleries[0]).toHaveProperty('cover');
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
      expect(Array.isArray(response.data.groups)).toBe(true);
    });
  });
});
