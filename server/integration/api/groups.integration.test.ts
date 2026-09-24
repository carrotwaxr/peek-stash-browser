import { beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  adminClient,
  guestClient,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

// Response type for /api/library/groups
interface FindGroupsResponse {
  findGroups: {
    groups: Array<{
      id: string;
      name: string;
      tags?: Array<{ id: string; name: string; image_path: string | null }>;
      studio?: { id: string; name: string; image_path: string | null } | null;
      performers?: Array<{
        id: string;
        name: string;
        image_path: string | null;
      }>;
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
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          page: 1,
          per_page: 10,
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
      expect(response.data.findGroups.groups).toBeDefined();
      expect(Array.isArray(response.data.findGroups.groups)).toBe(true);
      expect(response.data.findGroups.count).toBeGreaterThan(0);
    });

    it("returns group by ID", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          ids: [TEST_ENTITIES.groupWithScenes],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups.groups).toHaveLength(1);
      expect(must(response.data.findGroups.groups[0]).id).toBe(
        TEST_ENTITIES.groupWithScenes
      );
    });

    it("returns group with tooltip entity data (tags, performers, galleries)", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          ids: [TEST_ENTITIES.groupWithScenes],
        }
      );

      expect(response.ok).toBe(true);
      const group = must(response.data.findGroups.groups[0]);

      // Tags should have image_path
      expect(group).toHaveProperty("tags");
      const firstTag = must(group.tags?.[0], "group.tags[0]");
      expect(firstTag).toHaveProperty("id");
      expect(firstTag).toHaveProperty("name");
      expect(firstTag).toHaveProperty("image_path");

      // Performers should exist with tooltip data
      expect(group).toHaveProperty("performers");
      const firstPerformer = must(group.performers?.[0], "group.performers[0]");
      expect(firstPerformer).toHaveProperty("id");
      expect(firstPerformer).toHaveProperty("name");
      expect(firstPerformer).toHaveProperty("image_path");

      // Galleries should exist with tooltip data
      expect(group).toHaveProperty("galleries");
      const firstGallery = must(group.galleries?.[0], "group.galleries[0]");
      expect(firstGallery).toHaveProperty("id");
      expect(firstGallery).toHaveProperty("title");
      expect(firstGallery).toHaveProperty("cover");
    });

    // The studio is optional: the test skips when groupWithScenes has none,
    // rather than passing without checking anything
    it("returns group studio with tooltip data", async ({ skip }) => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          ids: [TEST_ENTITIES.groupWithScenes],
        }
      );

      expect(response.ok).toBe(true);
      const group = must(response.data.findGroups.groups[0]);
      skip(!group.studio, "groupWithScenes has no studio");

      // Studio should have image_path
      const groupStudio = must(group.studio, "group.studio");
      expect(groupStudio).toHaveProperty("id");
      expect(groupStudio).toHaveProperty("name");
      expect(groupStudio).toHaveProperty("image_path");
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
