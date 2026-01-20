import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, guestClient, TestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/tags
interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
      performers?: Array<{ id: string; name: string; image_path: string | null }>;
      studios?: Array<{ id: string; name: string; image_path: string | null }>;
      groups?: Array<{ id: string; name: string; front_image_path: string | null }>;
      galleries?: Array<{ id: string; title: string; cover: string | null }>;
    }>;
    count: number;
  };
}

describe("Tag API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/library/tags", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/tags", {});
      expect(response.status).toBe(401);
    });

    it("returns tags with pagination", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
      expect(response.data.findTags.tags).toBeDefined();
      expect(Array.isArray(response.data.findTags.tags)).toBe(true);
      expect(response.data.findTags.count).toBeGreaterThan(0);
    });

    it("returns tag by ID", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        ids: [TEST_ENTITIES.tagWithEntities],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags.tags).toHaveLength(1);
      expect(response.data.findTags.tags[0].id).toBe(TEST_ENTITIES.tagWithEntities);
    });

    it("returns tag with tooltip entity data (performers, studios, groups, galleries)", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        ids: [TEST_ENTITIES.tagWithEntities],
      });

      expect(response.ok).toBe(true);
      const tag = response.data.findTags.tags[0];

      // Performers should exist with tooltip data
      expect(tag).toHaveProperty('performers');
      if (tag.performers && tag.performers.length > 0) {
        expect(tag.performers[0]).toHaveProperty('id');
        expect(tag.performers[0]).toHaveProperty('name');
        expect(tag.performers[0]).toHaveProperty('image_path');
      }

      // Studios should exist with tooltip data
      expect(tag).toHaveProperty('studios');
      if (tag.studios && tag.studios.length > 0) {
        expect(tag.studios[0]).toHaveProperty('id');
        expect(tag.studios[0]).toHaveProperty('name');
        expect(tag.studios[0]).toHaveProperty('image_path');
      }

      // Groups should exist with tooltip data
      expect(tag).toHaveProperty('groups');
      if (tag.groups && tag.groups.length > 0) {
        expect(tag.groups[0]).toHaveProperty('id');
        expect(tag.groups[0]).toHaveProperty('name');
        expect(tag.groups[0]).toHaveProperty('front_image_path');
      }

      // Galleries should exist with tooltip data
      expect(tag).toHaveProperty('galleries');
      if (tag.galleries && tag.galleries.length > 0) {
        expect(tag.galleries[0]).toHaveProperty('id');
        expect(tag.galleries[0]).toHaveProperty('title');
        expect(tag.galleries[0]).toHaveProperty('cover');
      }
    });
  });

  describe("POST /api/library/tags/minimal", () => {
    it("returns minimal tag data", async () => {
      const response = await adminClient.post<{
        tags: Array<{ id: string; name: string }>;
      }>("/api/library/tags/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.tags).toBeDefined();
      expect(Array.isArray(response.data.tags)).toBe(true);
    });
  });

  describe("Non-admin user tag visibility (folder view)", () => {
    let testUserId: number;
    let testUserClient: TestClient;

    beforeAll(async () => {
      // Create a fresh test user with no restrictions
      const createResponse = await adminClient.post<{
        success: boolean;
        user: { id: number; username: string };
      }>("/api/user/create", {
        username: "folder_view_test_user",
        password: "test_password_123",
        role: "USER",
      });

      if (createResponse.ok && createResponse.data.user) {
        testUserId = createResponse.data.user.id;
      } else {
        // User might already exist from previous test run - fetch them
        const usersResponse = await adminClient.get<{
          users: Array<{ id: number; username: string }>;
        }>("/api/user/all");

        const existingUser = usersResponse.data.users?.find(
          (u) => u.username === "folder_view_test_user"
        );
        if (existingUser) {
          testUserId = existingUser.id;
        } else {
          throw new Error("Failed to create or find test user");
        }
      }

      // Ensure exclusions are computed for this user
      await adminClient.post(`/api/exclusions/recompute/${testUserId}`);

      // Create and login the test user client
      testUserClient = new TestClient();
      await testUserClient.login("folder_view_test_user", "test_password_123");
    });

    afterAll(async () => {
      // Clean up: delete the test user
      if (testUserId) {
        await adminClient.delete(`/api/user/${testUserId}`);
      }
    });

    it("non-admin user with no restrictions should see most tags (parent tags preserved for folder view)", async () => {
      // Get admin tag count
      const adminResponse = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: {
          per_page: -1,
          sort: "name",
          direction: "ASC",
        },
      });

      expect(adminResponse.ok).toBe(true);
      const adminTagCount = adminResponse.data.findTags.count;

      // Get non-admin tag count (same query as folder view uses)
      const userResponse = await testUserClient.post<FindTagsResponse>("/api/library/tags", {
        filter: {
          per_page: -1,
          sort: "name",
          direction: "ASC",
        },
      });

      expect(userResponse.ok).toBe(true);
      const userTagCount = userResponse.data.findTags.count;

      // User should see at least 95% of tags - the small difference is truly empty leaf tags
      // (tags with no direct attachments AND no children) which are legitimately excluded
      // The key fix is that parent/organizational tags (used for folder navigation) are now visible
      expect(userTagCount).toBeGreaterThan(adminTagCount * 0.95);
      expect(userTagCount).toBeGreaterThan(0);
    });

    it("non-admin user should see tags via minimal endpoint", async () => {
      // Get admin minimal tags
      const adminResponse = await adminClient.post<{
        tags: Array<{ id: string; name: string }>;
      }>("/api/library/tags/minimal", {});

      expect(adminResponse.ok).toBe(true);
      const adminTagCount = adminResponse.data.tags.length;

      // Get non-admin minimal tags
      const userResponse = await testUserClient.post<{
        tags: Array<{ id: string; name: string }>;
      }>("/api/library/tags/minimal", {});

      expect(userResponse.ok).toBe(true);
      const userTagCount = userResponse.data.tags.length;

      // User should see at least 95% of tags (small difference is truly empty leaf tags)
      expect(userTagCount).toBeGreaterThan(adminTagCount * 0.95);
      expect(userTagCount).toBeGreaterThan(0);
    });
  });
});
