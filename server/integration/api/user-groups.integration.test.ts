import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, guestClient, TestClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Integration tests for User Groups API
 *
 * Tests the full CRUD lifecycle for user groups, which is an admin-only feature
 * for managing user permissions and access controls.
 */

interface UserGroup {
  id: number;
  name: string;
  description: string | null;
  canShare: boolean;
  canDownloadFiles: boolean;
  canDownloadPlaylists: boolean;
  memberCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface GroupsListResponse {
  groups: UserGroup[];
}

interface GroupResponse {
  group: UserGroup & {
    members?: Array<{
      id: number;
      userId: number;
      username: string;
      role: string;
      joinedAt: string;
    }>;
  };
}

interface SuccessResponse {
  success: boolean;
}

interface ErrorResponse {
  error: string;
}

describe("User Groups API", () => {
  // Track groups created during tests for cleanup
  const createdGroupIds: number[] = [];

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  afterAll(async () => {
    // Clean up any groups created during tests
    for (const groupId of createdGroupIds) {
      try {
        await adminClient.delete(`/api/groups/${groupId}`);
      } catch {
        // Ignore cleanup errors - group may already be deleted
      }
    }
  });

  describe("Authentication and Authorization", () => {
    it("rejects unauthenticated requests to list groups", async () => {
      const response = await guestClient.get<ErrorResponse>("/api/groups");
      expect(response.status).toBe(401);
    });

    it("rejects unauthenticated requests to create groups", async () => {
      const response = await guestClient.post<ErrorResponse>("/api/groups", {
        name: "Unauthorized Group",
      });
      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/groups - Create Group", () => {
    it("creates a group with minimal fields", async () => {
      const groupName = `Test Group ${Date.now()}`;
      const response = await adminClient.post<GroupResponse>("/api/groups", {
        name: groupName,
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(201);
      expect(response.data.group).toBeDefined();
      expect(response.data.group.name).toBe(groupName);
      expect(response.data.group.description).toBeNull();
      expect(response.data.group.canShare).toBe(false);
      expect(response.data.group.canDownloadFiles).toBe(false);
      expect(response.data.group.canDownloadPlaylists).toBe(false);

      // Track for cleanup
      createdGroupIds.push(response.data.group.id);
    });

    it("creates a group with all fields", async () => {
      const groupName = `Full Group ${Date.now()}`;
      const response = await adminClient.post<GroupResponse>("/api/groups", {
        name: groupName,
        description: "A group with all permissions enabled",
        canShare: true,
        canDownloadFiles: true,
        canDownloadPlaylists: true,
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(201);
      expect(response.data.group.name).toBe(groupName);
      expect(response.data.group.description).toBe("A group with all permissions enabled");
      expect(response.data.group.canShare).toBe(true);
      expect(response.data.group.canDownloadFiles).toBe(true);
      expect(response.data.group.canDownloadPlaylists).toBe(true);

      createdGroupIds.push(response.data.group.id);
    });

    it("rejects creating a group without a name", async () => {
      const response = await adminClient.post<ErrorResponse>("/api/groups", {
        description: "No name provided",
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(response.data.error).toContain("name");
    });

    it("rejects creating a group with an empty name", async () => {
      const response = await adminClient.post<ErrorResponse>("/api/groups", {
        name: "   ",
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(response.data.error).toContain("name");
    });

    it("rejects creating a group with a duplicate name", async () => {
      const groupName = `Duplicate Group ${Date.now()}`;

      // Create first group
      const firstResponse = await adminClient.post<GroupResponse>("/api/groups", {
        name: groupName,
      });
      expect(firstResponse.ok).toBe(true);
      createdGroupIds.push(firstResponse.data.group.id);

      // Try to create a second group with the same name
      const duplicateResponse = await adminClient.post<ErrorResponse>("/api/groups", {
        name: groupName,
      });

      expect(duplicateResponse.ok).toBe(false);
      expect(duplicateResponse.status).toBe(409);
      expect(duplicateResponse.data.error).toContain("already exists");
    });
  });

  describe("GET /api/groups - List Groups", () => {
    it("returns a list of groups with member counts", async () => {
      const response = await adminClient.get<GroupsListResponse>("/api/groups");

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data.groups).toBeDefined();
      expect(Array.isArray(response.data.groups)).toBe(true);

      // If there are groups, check the structure
      if (response.data.groups.length > 0) {
        const group = response.data.groups[0];
        expect(group).toHaveProperty("id");
        expect(group).toHaveProperty("name");
        expect(group).toHaveProperty("description");
        expect(group).toHaveProperty("canShare");
        expect(group).toHaveProperty("canDownloadFiles");
        expect(group).toHaveProperty("canDownloadPlaylists");
        expect(group).toHaveProperty("memberCount");
      }
    });

    it("includes newly created groups in the list", async () => {
      const groupName = `List Test Group ${Date.now()}`;

      // Create a group
      const createResponse = await adminClient.post<GroupResponse>("/api/groups", {
        name: groupName,
      });
      expect(createResponse.ok).toBe(true);
      createdGroupIds.push(createResponse.data.group.id);

      // List groups and find the created one
      const listResponse = await adminClient.get<GroupsListResponse>("/api/groups");
      expect(listResponse.ok).toBe(true);

      const foundGroup = listResponse.data.groups.find(
        (g) => g.id === createResponse.data.group.id
      );
      expect(foundGroup).toBeDefined();
      expect(foundGroup?.name).toBe(groupName);
    });
  });

  describe("GET /api/groups/:id - Get Single Group", () => {
    it("returns a group by ID with member details", async () => {
      // First create a group
      const groupName = `Get By ID Group ${Date.now()}`;
      const createResponse = await adminClient.post<GroupResponse>("/api/groups", {
        name: groupName,
        description: "Test group for get by ID",
      });
      expect(createResponse.ok).toBe(true);
      createdGroupIds.push(createResponse.data.group.id);

      // Get the group by ID
      const getResponse = await adminClient.get<GroupResponse>(
        `/api/groups/${createResponse.data.group.id}`
      );

      expect(getResponse.ok).toBe(true);
      expect(getResponse.status).toBe(200);
      expect(getResponse.data.group).toBeDefined();
      expect(getResponse.data.group.name).toBe(groupName);
      expect(getResponse.data.group.description).toBe("Test group for get by ID");
      expect(getResponse.data.group.members).toBeDefined();
      expect(Array.isArray(getResponse.data.group.members)).toBe(true);
    });

    it("returns 404 for non-existent group", async () => {
      const response = await adminClient.get<ErrorResponse>("/api/groups/999999");

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
      expect(response.data.error).toContain("not found");
    });

    it("returns 400 for invalid group ID", async () => {
      const response = await adminClient.get<ErrorResponse>("/api/groups/invalid");

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(response.data.error).toContain("Invalid");
    });
  });

  describe("PUT /api/groups/:id - Update Group", () => {
    it("updates group name", async () => {
      // Create a group
      const originalName = `Update Name Group ${Date.now()}`;
      const createResponse = await adminClient.post<GroupResponse>("/api/groups", {
        name: originalName,
      });
      expect(createResponse.ok).toBe(true);
      createdGroupIds.push(createResponse.data.group.id);

      // Update the name
      const newName = `Updated Name ${Date.now()}`;
      const updateResponse = await adminClient.put<GroupResponse>(
        `/api/groups/${createResponse.data.group.id}`,
        { name: newName }
      );

      expect(updateResponse.ok).toBe(true);
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.data.group.name).toBe(newName);
    });

    it("updates group description", async () => {
      // Create a group
      const createResponse = await adminClient.post<GroupResponse>("/api/groups", {
        name: `Update Desc Group ${Date.now()}`,
        description: "Original description",
      });
      expect(createResponse.ok).toBe(true);
      createdGroupIds.push(createResponse.data.group.id);

      // Update the description
      const updateResponse = await adminClient.put<GroupResponse>(
        `/api/groups/${createResponse.data.group.id}`,
        { description: "Updated description" }
      );

      expect(updateResponse.ok).toBe(true);
      expect(updateResponse.data.group.description).toBe("Updated description");
    });

    it("updates group permissions", async () => {
      // Create a group with no permissions
      const createResponse = await adminClient.post<GroupResponse>("/api/groups", {
        name: `Update Perms Group ${Date.now()}`,
        canShare: false,
        canDownloadFiles: false,
        canDownloadPlaylists: false,
      });
      expect(createResponse.ok).toBe(true);
      createdGroupIds.push(createResponse.data.group.id);

      // Update to enable all permissions
      const updateResponse = await adminClient.put<GroupResponse>(
        `/api/groups/${createResponse.data.group.id}`,
        {
          canShare: true,
          canDownloadFiles: true,
          canDownloadPlaylists: true,
        }
      );

      expect(updateResponse.ok).toBe(true);
      expect(updateResponse.data.group.canShare).toBe(true);
      expect(updateResponse.data.group.canDownloadFiles).toBe(true);
      expect(updateResponse.data.group.canDownloadPlaylists).toBe(true);
    });

    it("returns 404 when updating non-existent group", async () => {
      const response = await adminClient.put<ErrorResponse>("/api/groups/999999", {
        name: "New Name",
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    it("rejects empty name in update", async () => {
      // Create a group
      const createResponse = await adminClient.post<GroupResponse>("/api/groups", {
        name: `Empty Name Update Group ${Date.now()}`,
      });
      expect(createResponse.ok).toBe(true);
      createdGroupIds.push(createResponse.data.group.id);

      // Try to update with empty name
      const updateResponse = await adminClient.put<ErrorResponse>(
        `/api/groups/${createResponse.data.group.id}`,
        { name: "" }
      );

      expect(updateResponse.ok).toBe(false);
      expect(updateResponse.status).toBe(400);
    });
  });

  describe("DELETE /api/groups/:id - Delete Group", () => {
    it("deletes a group", async () => {
      // Create a group to delete
      const createResponse = await adminClient.post<GroupResponse>("/api/groups", {
        name: `Delete Group ${Date.now()}`,
      });
      expect(createResponse.ok).toBe(true);
      const groupId = createResponse.data.group.id;

      // Delete the group
      const deleteResponse = await adminClient.delete<SuccessResponse>(
        `/api/groups/${groupId}`
      );

      expect(deleteResponse.ok).toBe(true);
      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.data.success).toBe(true);

      // Verify it's deleted
      const getResponse = await adminClient.get<ErrorResponse>(`/api/groups/${groupId}`);
      expect(getResponse.status).toBe(404);
    });

    it("returns 404 when deleting non-existent group", async () => {
      const response = await adminClient.delete<ErrorResponse>("/api/groups/999999");

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/groups/user/mine - User's Own Groups", () => {
    it("returns groups for authenticated user", async () => {
      const response = await adminClient.get<GroupsListResponse>("/api/groups/user/mine");

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data.groups).toBeDefined();
      expect(Array.isArray(response.data.groups)).toBe(true);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.get<ErrorResponse>("/api/groups/user/mine");
      expect(response.status).toBe(401);
    });
  });

  describe("Full CRUD Lifecycle", () => {
    it("completes a full create-read-update-delete cycle", async () => {
      const groupName = `Lifecycle Group ${Date.now()}`;

      // CREATE
      const createResponse = await adminClient.post<GroupResponse>("/api/groups", {
        name: groupName,
        description: "Initial description",
        canShare: false,
      });
      expect(createResponse.ok).toBe(true);
      expect(createResponse.status).toBe(201);
      const groupId = createResponse.data.group.id;

      // READ (verify in list)
      const listResponse = await adminClient.get<GroupsListResponse>("/api/groups");
      expect(listResponse.ok).toBe(true);
      const foundInList = listResponse.data.groups.find((g) => g.id === groupId);
      expect(foundInList).toBeDefined();
      expect(foundInList?.name).toBe(groupName);

      // READ (single)
      const getResponse = await adminClient.get<GroupResponse>(`/api/groups/${groupId}`);
      expect(getResponse.ok).toBe(true);
      expect(getResponse.data.group.name).toBe(groupName);
      expect(getResponse.data.group.description).toBe("Initial description");

      // UPDATE
      const updateResponse = await adminClient.put<GroupResponse>(
        `/api/groups/${groupId}`,
        {
          description: "Updated description",
          canShare: true,
        }
      );
      expect(updateResponse.ok).toBe(true);
      expect(updateResponse.data.group.description).toBe("Updated description");
      expect(updateResponse.data.group.canShare).toBe(true);

      // DELETE
      const deleteResponse = await adminClient.delete<SuccessResponse>(
        `/api/groups/${groupId}`
      );
      expect(deleteResponse.ok).toBe(true);
      expect(deleteResponse.data.success).toBe(true);

      // VERIFY DELETED
      const verifyDeletedResponse = await adminClient.get<ErrorResponse>(
        `/api/groups/${groupId}`
      );
      expect(verifyDeletedResponse.status).toBe(404);
    });
  });
});
