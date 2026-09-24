import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  TestClient,
  adminClient,
  guestClient,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

// Response type for /api/library/tags
interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
      performers?: Array<{
        id: string;
        name: string;
        image_path: string | null;
      }>;
      studios?: Array<{ id: string; name: string; image_path: string | null }>;
      groups?: Array<{
        id: string;
        name: string;
        front_image_path: string | null;
      }>;
      galleries?: Array<{ id: string; title: string; cover: string | null }>;
    }>;
    count: number;
  };
}

describe("Tag API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // Select only test instance to avoid ID collisions with other instances
    await selectTestInstanceOnly();
  });

  describe("POST /api/library/tags", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/tags", {});
      expect(response.status).toBe(401);
    });

    it("returns tags with pagination", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          page: 1,
          per_page: 10,
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
      expect(response.data.findTags.tags).toBeDefined();
      expect(Array.isArray(response.data.findTags.tags)).toBe(true);
      expect(response.data.findTags.count).toBeGreaterThan(0);
    });

    it("returns tag by ID", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          ids: [TEST_ENTITIES.tagWithEntities],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags.tags).toHaveLength(1);
      expect(must(response.data.findTags.tags[0]).id).toBe(
        TEST_ENTITIES.tagWithEntities
      );
    });

    it("returns tag with tooltip entity data (performers, studios, groups, galleries)", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          ids: [TEST_ENTITIES.tagWithEntities],
        }
      );

      expect(response.ok).toBe(true);
      const tag = must(response.data.findTags.tags[0]);

      // Performers should exist with tooltip data
      expect(tag).toHaveProperty("performers");
      const firstPerformer = must(tag.performers?.[0], "tag.performers[0]");
      expect(firstPerformer).toHaveProperty("id");
      expect(firstPerformer).toHaveProperty("name");
      expect(firstPerformer).toHaveProperty("image_path");

      // Studios should exist with tooltip data
      expect(tag).toHaveProperty("studios");
      const firstStudio = must(tag.studios?.[0], "tag.studios[0]");
      expect(firstStudio).toHaveProperty("id");
      expect(firstStudio).toHaveProperty("name");
      expect(firstStudio).toHaveProperty("image_path");

      // Groups should exist with tooltip data
      expect(tag).toHaveProperty("groups");
      const firstGroup = must(tag.groups?.[0], "tag.groups[0]");
      expect(firstGroup).toHaveProperty("id");
      expect(firstGroup).toHaveProperty("name");
      expect(firstGroup).toHaveProperty("front_image_path");

      // Galleries should exist with tooltip data
      expect(tag).toHaveProperty("galleries");
      const firstGallery = must(tag.galleries?.[0], "tag.galleries[0]");
      expect(firstGallery).toHaveProperty("id");
      expect(firstGallery).toHaveProperty("title");
      expect(firstGallery).toHaveProperty("cover");
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

      // Set the test user to only see the test instance (same as admin)
      // This ensures apples-to-apples comparison of tag counts
      const instancesResponse = await adminClient.get<{
        instances: Array<{ id: string; priority: number }>;
      }>("/api/setup/stash-instances");
      if (instancesResponse.ok && instancesResponse.data.instances?.length) {
        const testInstance = instancesResponse.data.instances.reduce((a, b) =>
          a.priority < b.priority ? a : b
        );
        await testUserClient.put("/api/user/stash-instances", {
          instanceIds: [testInstance.id],
        });
      }

      // Recompute exclusions AFTER setting instance selection
      // so exclusions are based on the same instance as the queries
      await adminClient.post(`/api/exclusions/recompute/${testUserId}`);
    });

    afterAll(async () => {
      // Clean up: delete the test user
      if (testUserId) {
        await adminClient.delete(`/api/user/${testUserId}`);
      }
    });

    it("non-admin user with no restrictions should see most tags (parent tags preserved for folder view)", async () => {
      // Get admin tag count
      const adminResponse = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: {
            per_page: -1,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(adminResponse.ok).toBe(true);
      const adminTagCount = adminResponse.data.findTags.count;

      // Get non-admin tag count (same query as folder view uses)
      const userResponse = await testUserClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: {
            per_page: -1,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(userResponse.ok).toBe(true);
      const userTagCount = userResponse.data.findTags.count;

      // User should see a meaningful subset of tags - empty leaf tags are legitimately excluded
      // The key fix is that parent/organizational tags (used for folder navigation) are now visible
      // Note: Threshold is kept low because test instance has few tags with many exclusions
      expect(userTagCount).toBeGreaterThan(0);
      // User should see at least 30% of tags (accounts for test data variations)
      expect(userTagCount).toBeGreaterThan(adminTagCount * 0.3);
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

      // User should see a meaningful subset of tags
      expect(userTagCount).toBeGreaterThan(0);
      // User should see at least 90% of tags (minimal endpoint returns more since it doesn't filter empty)
      expect(userTagCount).toBeGreaterThan(adminTagCount * 0.9);
    });
  });
});
