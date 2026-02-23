import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TestClient, adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Content Restrictions Integration Tests", () => {
  let testUserId: number;
  let testUserClient: TestClient;

  beforeAll(async () => {
    // Ensure admin client is logged in
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);

    // Create a test user for restriction testing
    const createResponse = await adminClient.post<{
      success: boolean;
      user: { id: number; username: string };
    }>("/api/user/create", {
      username: "restriction_test_user",
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
        (u) => u.username === "restriction_test_user"
      );
      if (existingUser) {
        testUserId = existingUser.id;
      } else {
        throw new Error("Failed to create or find test user");
      }
    }

    // Create and login the test user client
    testUserClient = new TestClient();
    await testUserClient.login("restriction_test_user", "test_password_123");
  });

  afterAll(async () => {
    // Clean up: delete the test user
    if (testUserId) {
      await adminClient.delete(`/api/user/${testUserId}`);
    }
  });

  describe("User Content Restrictions (Admin API)", () => {
    describe("GET /api/user/:userId/restrictions", () => {
      it("should return empty restrictions for new user", async () => {
        const response = await adminClient.get<{
          restrictions: Array<{
            entityType: string;
            mode: string;
            entityIds: string;
          }>;
        }>(`/api/user/${testUserId}/restrictions`);

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.restrictions).toBeDefined();
        expect(Array.isArray(response.data.restrictions)).toBe(true);
      });

      it("should reject non-admin access", async () => {
        const response = await testUserClient.get(
          `/api/user/${testUserId}/restrictions`
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(403);
      });
    });

    describe("PUT /api/user/:userId/restrictions", () => {
      it("should create tag-based restrictions", async () => {
        const restrictions = [
          {
            entityType: "tags",
            mode: "EXCLUDE",
            entityIds: [TEST_ENTITIES.restrictableTag],
            restrictEmpty: false,
          },
        ];

        const response = await adminClient.put<{
          success: boolean;
          restrictions: Array<unknown>;
        }>(`/api/user/${testUserId}/restrictions`, { restrictions });

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.restrictions).toHaveLength(1);
      });

      it("should update existing restrictions", async () => {
        const restrictions = [
          {
            entityType: "tags",
            mode: "INCLUDE",
            entityIds: [TEST_ENTITIES.tagWithEntities],
            restrictEmpty: true,
          },
        ];

        const response = await adminClient.put<{
          success: boolean;
          restrictions: Array<unknown>;
        }>(`/api/user/${testUserId}/restrictions`, { restrictions });

        expect(response.ok).toBe(true);
        expect(response.data.success).toBe(true);
      });

      it("should validate entity type", async () => {
        const restrictions = [
          {
            entityType: "invalid_type",
            mode: "EXCLUDE",
            entityIds: ["1"],
            restrictEmpty: false,
          },
        ];

        const response = await adminClient.put<{ error: string }>(
          `/api/user/${testUserId}/restrictions`,
          { restrictions }
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
        expect(response.data.error).toContain("Invalid entity type");
      });

      it("should validate mode", async () => {
        const restrictions = [
          {
            entityType: "tags",
            mode: "INVALID_MODE",
            entityIds: ["1"],
            restrictEmpty: false,
          },
        ];

        const response = await adminClient.put<{ error: string }>(
          `/api/user/${testUserId}/restrictions`,
          { restrictions }
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
        expect(response.data.error).toContain("Invalid mode");
      });

      it("should reject non-admin access", async () => {
        const response = await testUserClient.put(
          `/api/user/${testUserId}/restrictions`,
          { restrictions: [] }
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(403);
      });
    });

    describe("DELETE /api/user/:userId/restrictions", () => {
      it("should delete all restrictions", async () => {
        // First create some restrictions
        await adminClient.put(`/api/user/${testUserId}/restrictions`, {
          restrictions: [
            {
              entityType: "tags",
              mode: "EXCLUDE",
              entityIds: ["1"],
              restrictEmpty: false,
            },
          ],
        });

        // Now delete them
        const response = await adminClient.delete<{
          success: boolean;
          message: string;
        }>(`/api/user/${testUserId}/restrictions`);

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);

        // Verify they're gone
        const getResponse = await adminClient.get<{
          restrictions: Array<unknown>;
        }>(`/api/user/${testUserId}/restrictions`);

        expect(getResponse.data.restrictions).toHaveLength(0);
      });

      it("should reject non-admin access", async () => {
        const response = await testUserClient.delete(
          `/api/user/${testUserId}/restrictions`
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(403);
      });
    });
  });

  describe("Hidden Entities (User API)", () => {
    describe("POST /api/user/hidden-entities", () => {
      it("should hide an entity", async () => {
        const response = await testUserClient.post<{
          success: boolean;
          message: string;
        }>("/api/user/hidden-entities", {
          entityType: "scene",
          entityId: TEST_ENTITIES.sceneWithRelations,
        });

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
      });

      it("should cascade exclusions when hiding performer with scenes", async () => {
        // First, clean up any existing hidden entities for this user
        await testUserClient.delete("/api/user/hidden-entities/all");

        // Hide a performer that has scenes - this should cascade to exclude those scenes
        const hideResponse = await testUserClient.post<{
          success: boolean;
          message: string;
        }>("/api/user/hidden-entities", {
          entityType: "performer",
          entityId: TEST_ENTITIES.performerWithScenes,
        });

        // If this fails with a 500 error, it means the cascade exclusion code is broken
        // (e.g., using skipDuplicates which SQLite doesn't support)
        expect(hideResponse.ok).toBe(true);
        expect(hideResponse.status).toBe(200);
        expect(hideResponse.data.success).toBe(true);

        // Verify the exclusion was created by checking the hidden entities list
        const hiddenResponse = await testUserClient.get<{
          hiddenEntities: Array<{ entityType: string; entityId: string }>;
        }>("/api/user/hidden-entities");

        expect(hiddenResponse.ok).toBe(true);
        const hiddenPerformer = hiddenResponse.data.hiddenEntities.find(
          (e) =>
            e.entityType === "performer" &&
            e.entityId === TEST_ENTITIES.performerWithScenes
        );
        expect(hiddenPerformer).toBeDefined();

        // Clean up
        await testUserClient.delete(
          `/api/user/hidden-entities/performer/${TEST_ENTITIES.performerWithScenes}`
        );
      });

      it("should require entity type and ID", async () => {
        const response = await testUserClient.post<{ error: string }>(
          "/api/user/hidden-entities",
          {}
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
        expect(response.data.error).toContain("required");
      });

      it("should validate entity type", async () => {
        const response = await testUserClient.post<{ error: string }>(
          "/api/user/hidden-entities",
          {
            entityType: "invalid",
            entityId: "1",
          }
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
        expect(response.data.error).toContain("Invalid entity type");
      });
    });

    describe("GET /api/user/hidden-entities", () => {
      it("should return hidden entities", async () => {
        const response = await testUserClient.get<{
          hiddenEntities: Array<{
            entityType: string;
            entityId: string;
          }>;
        }>("/api/user/hidden-entities");

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.hiddenEntities).toBeDefined();
        expect(Array.isArray(response.data.hiddenEntities)).toBe(true);
      });

      it("should filter by entity type", async () => {
        const response = await testUserClient.get<{
          hiddenEntities: Array<{ entityType: string }>;
        }>("/api/user/hidden-entities?entityType=scene");

        expect(response.ok).toBe(true);
        // All returned should be scenes
        for (const entity of response.data.hiddenEntities) {
          expect(entity.entityType).toBe("scene");
        }
      });
    });

    describe("GET /api/user/hidden-entities/ids", () => {
      it("should return hidden entity IDs by type", async () => {
        const response = await testUserClient.get<{
          hiddenIds: {
            scenes: string[];
            performers: string[];
            studios: string[];
            tags: string[];
            groups: string[];
            galleries: string[];
            images: string[];
          };
        }>("/api/user/hidden-entities/ids");

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.hiddenIds).toBeDefined();
        expect(Array.isArray(response.data.hiddenIds.scenes)).toBe(true);
        expect(Array.isArray(response.data.hiddenIds.performers)).toBe(true);
      });
    });

    describe("DELETE /api/user/hidden-entities/:entityType/:entityId", () => {
      it("should unhide an entity", async () => {
        // First ensure we have something hidden
        await testUserClient.post("/api/user/hidden-entities", {
          entityType: "performer",
          entityId: TEST_ENTITIES.performerWithScenes,
        });

        // Now unhide it
        const response = await testUserClient.delete<{
          success: boolean;
          message: string;
        }>(
          `/api/user/hidden-entities/performer/${TEST_ENTITIES.performerWithScenes}`
        );

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
      });
    });

    describe("DELETE /api/user/hidden-entities/all", () => {
      it("should unhide all entities", async () => {
        // Hide a few entities
        await testUserClient.post("/api/user/hidden-entities", {
          entityType: "scene",
          entityId: TEST_ENTITIES.sceneWithRelations,
        });
        await testUserClient.post("/api/user/hidden-entities", {
          entityType: "performer",
          entityId: TEST_ENTITIES.performerWithScenes,
        });

        // Unhide all
        const response = await testUserClient.delete<{
          success: boolean;
          count: number;
        }>("/api/user/hidden-entities/all");

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.count).toBeGreaterThanOrEqual(0);
      }, 60_000); // Exclusion recompute can chain if a pending recompute exists

      it("should unhide all entities of a specific type", async () => {
        // Hide some scenes
        await testUserClient.post("/api/user/hidden-entities", {
          entityType: "scene",
          entityId: TEST_ENTITIES.sceneWithRelations,
        });

        // Unhide all scenes
        const response = await testUserClient.delete<{
          success: boolean;
          count: number;
        }>("/api/user/hidden-entities/all?entityType=scene");

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
      });
    });
  });

  describe("Exclusion Management (Admin API)", () => {
    describe("POST /api/exclusions/recompute/:userId", () => {
      it("should recompute exclusions for a user", async () => {
        const response = await adminClient.post<{
          ok: boolean;
          message: string;
        }>(`/api/exclusions/recompute/${testUserId}`);

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.ok).toBe(true);
        expect(response.data.message).toContain("Recomputed");
      });

      it("should reject invalid user ID", async () => {
        const response = await adminClient.post<{ error: string }>(
          "/api/exclusions/recompute/invalid"
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
      });

      it("should reject non-existent user", async () => {
        const response = await adminClient.post<{ error: string }>(
          "/api/exclusions/recompute/999999"
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(404);
      });

      it("should reject non-admin access", async () => {
        const response = await testUserClient.post(
          `/api/exclusions/recompute/${testUserId}`
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(403);
      });
    });

    describe("POST /api/exclusions/recompute-all", () => {
      it("should recompute exclusions for all users", async () => {
        const response = await adminClient.post<{
          ok: boolean;
          success: number;
          failed: number;
        }>("/api/exclusions/recompute-all");

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.ok).toBe(true);
        expect(typeof response.data.success).toBe("number");
        expect(response.data.failed).toBe(0);
      });

      it("should reject non-admin access", async () => {
        const response = await testUserClient.post(
          "/api/exclusions/recompute-all"
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(403);
      });
    });

    describe("GET /api/exclusions/stats", () => {
      it("should return exclusion statistics", async () => {
        const response = await adminClient.get<
          Array<{
            userId: number;
            entityType: string;
            reason: string;
            _count: number;
          }>
        >("/api/exclusions/stats");

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
      });

      it("should reject non-admin access", async () => {
        const response = await testUserClient.get("/api/exclusions/stats");

        expect(response.ok).toBe(false);
        expect(response.status).toBe(403);
      });
    });
  });

  describe("Hide Confirmation Preference", () => {
    describe("PUT /api/user/hide-confirmation", () => {
      it("should update hide confirmation preference", async () => {
        const response = await testUserClient.put<{
          success: boolean;
          hideConfirmationDisabled: boolean;
        }>("/api/user/hide-confirmation", {
          hideConfirmationDisabled: true,
        });

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.hideConfirmationDisabled).toBe(true);
      });

      it("should validate boolean input", async () => {
        const response = await testUserClient.put<{ error: string }>(
          "/api/user/hide-confirmation",
          {
            hideConfirmationDisabled: "not a boolean",
          }
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
        expect(response.data.error).toContain("boolean");
      });
    });
  });
});
