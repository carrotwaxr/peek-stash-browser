import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TestClient, adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Hidden Entities Bulk API Integration Tests", () => {
  let testUserId: number;
  let testUserClient: TestClient;

  beforeAll(async () => {
    // Ensure admin client is logged in
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);

    // Create a test user for bulk hide testing
    const createResponse = await adminClient.post<{
      success: boolean;
      user: { id: number; username: string };
    }>("/api/user/create", {
      username: "bulk_hide_test_user",
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
        (u) => u.username === "bulk_hide_test_user"
      );
      if (existingUser) {
        testUserId = existingUser.id;
      } else {
        throw new Error("Failed to create or find test user");
      }
    }

    // Create and login the test user client
    testUserClient = new TestClient();
    await testUserClient.login("bulk_hide_test_user", "test_password_123");
  });

  afterAll(async () => {
    // Clean up: delete the test user
    if (testUserId) {
      await adminClient.delete(`/api/user/${testUserId}`);
    }
  });

  describe("POST /api/user/hidden-entities/bulk", () => {
    it("should hide multiple entities at once", async () => {
      const entities = [
        { entityType: "scene", entityId: "test-scene-1" },
        { entityType: "scene", entityId: "test-scene-2" },
        { entityType: "scene", entityId: "test-scene-3" },
      ];

      const response = await testUserClient.post<{
        success: boolean;
        successCount: number;
        failCount: number;
        message: string;
      }>("/api/user/hidden-entities/bulk", { entities });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.successCount).toBe(3);
      expect(response.data.failCount).toBe(0);
    });

    it("should validate that entities array is provided", async () => {
      const response = await testUserClient.post<{ error: string }>(
        "/api/user/hidden-entities/bulk",
        {}
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(response.data.error).toContain("entities must be a non-empty array");
    });

    it("should validate that entities array is not empty", async () => {
      const response = await testUserClient.post<{ error: string }>(
        "/api/user/hidden-entities/bulk",
        { entities: [] }
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(response.data.error).toContain("entities must be a non-empty array");
    });

    it("should validate entity type", async () => {
      const entities = [
        { entityType: "invalid_type", entityId: "test-1" },
      ];

      const response = await testUserClient.post<{ error: string }>(
        "/api/user/hidden-entities/bulk",
        { entities }
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(response.data.error).toContain("Invalid entity type");
    });

    it("should validate each entity has entityType and entityId", async () => {
      const entities = [
        { entityType: "scene" }, // missing entityId
      ];

      const response = await testUserClient.post<{ error: string }>(
        "/api/user/hidden-entities/bulk",
        { entities }
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(response.data.error).toContain("entityType and entityId");
    });

    it("should handle mixed entity types", async () => {
      const entities = [
        { entityType: "scene", entityId: "mixed-test-scene" },
        { entityType: "performer", entityId: "mixed-test-performer" },
        { entityType: "studio", entityId: "mixed-test-studio" },
      ];

      const response = await testUserClient.post<{
        success: boolean;
        successCount: number;
        failCount: number;
      }>("/api/user/hidden-entities/bulk", { entities });

      expect(response.ok).toBe(true);
      expect(response.data.success).toBe(true);
      expect(response.data.successCount).toBe(3);
    });

    it("should require authentication", async () => {
      const unauthClient = new TestClient();
      const entities = [
        { entityType: "scene", entityId: "test-scene-unauth" },
      ];

      const response = await unauthClient.post(
        "/api/user/hidden-entities/bulk",
        { entities }
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it("should verify entities appear in hidden entities list after bulk hide", async () => {
      // Use real scene IDs from test fixtures so they exist in cache
      const sceneId1 = TEST_ENTITIES.sceneWithRelations;
      const sceneId2 = TEST_ENTITIES.sceneInGroup;
      const entities = [
        { entityType: "scene", entityId: sceneId1 },
        { entityType: "scene", entityId: sceneId2 },
      ];

      // First, hide the entities
      await testUserClient.post("/api/user/hidden-entities/bulk", { entities });

      // Then, fetch hidden entities
      const response = await testUserClient.get<{
        hiddenEntities: Array<{ entityType: string; entityId: string }>;
      }>("/api/user/hidden-entities?entityType=scene");

      expect(response.ok).toBe(true);

      const hiddenIds = response.data.hiddenEntities.map((e) => e.entityId);
      expect(hiddenIds).toContain(sceneId1);
      expect(hiddenIds).toContain(sceneId2);
    });
  });
});
