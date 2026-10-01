import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import { TestClient, adminClient, guestClient } from "../helpers/testClient.js";

/**
 * Integration tests for Playlist Sharing API
 *
 * Tests the playlist sharing feature which allows users to share playlists
 * with groups they belong to. Tests cover authentication, authorization,
 * and the full sharing workflow.
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface UserGroup {
  id: number;
  name: string;
  description: string | null;
  canShare: boolean;
  canDownloadFiles: boolean;
  canDownloadPlaylists: boolean;
}

interface GroupResponse {
  group: UserGroup & {
    members?: Array<{
      id: number;
      userId: number;
      username: string;
      role: string;
    }>;
  };
}

interface PlaylistData {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  shuffle: boolean;
  repeat: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    items: number;
  };
}

interface PlaylistResponse {
  playlist: PlaylistData;
}

interface SharedPlaylistData {
  id: number;
  name: string;
  description: string | null;
  sceneCount: number;
  owner: { id: number; username: string };
  sharedViaGroups: string[];
  sharedAt: string;
}

interface GetSharedPlaylistsResponse {
  playlists: SharedPlaylistData[];
}

interface PlaylistShareInfo {
  groupId: number;
  groupName: string;
  sharedAt: string;
}

interface GetPlaylistSharesResponse {
  shares: PlaylistShareInfo[];
}

interface UpdatePlaylistSharesResponse {
  shares: PlaylistShareInfo[];
}

interface ErrorResponse {
  error: string;
}

interface UserResponse {
  user: {
    id: number;
    username: string;
    role: string;
  };
}

describe("Playlist Sharing API", () => {
  // Track resources for cleanup
  const createdGroupIds: number[] = [];
  const createdPlaylistIds: number[] = [];
  const createdUsernames: string[] = [];

  // Test group IDs (set in beforeAll)
  let groupWithSharePermission: number;
  let groupWithoutSharePermission: number;

  // Test user for shared access testing
  let secondUserClient: TestClient;
  const secondUsername = `test_share_user_${Date.now()}`;
  const secondPassword = "TestPassword123!";

  beforeAll(async () => {
    // Login admin client
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);

    // Create a group WITH canShare permission
    const groupWithShareResponse = await adminClient.post<GroupResponse>(
      "/api/groups",
      {
        name: `Share Enabled Group ${Date.now()}`,
        description: "Group with sharing enabled",
        canShare: true,
      }
    );
    expect(groupWithShareResponse.ok).toBe(true);
    groupWithSharePermission = groupWithShareResponse.data.group.id;
    createdGroupIds.push(groupWithSharePermission);

    // Create a group WITHOUT canShare permission
    const groupWithoutShareResponse = await adminClient.post<GroupResponse>(
      "/api/groups",
      {
        name: `Share Disabled Group ${Date.now()}`,
        description: "Group without sharing enabled",
        canShare: false,
      }
    );
    expect(groupWithoutShareResponse.ok).toBe(true);
    groupWithoutSharePermission = groupWithoutShareResponse.data.group.id;
    createdGroupIds.push(groupWithoutSharePermission);

    // Add admin user to both groups
    const adminMeResponse = await adminClient.get<UserResponse>("/api/auth/me");
    const adminUserId = adminMeResponse.data.user.id;

    await adminClient.post(`/api/groups/${groupWithSharePermission}/members`, {
      userId: adminUserId,
    });
    await adminClient.post(
      `/api/groups/${groupWithoutSharePermission}/members`,
      {
        userId: adminUserId,
      }
    );

    // Create a second test user for testing shared access
    const createUserResponse = await adminClient.post<UserResponse>(
      "/api/user/create",
      {
        username: secondUsername,
        password: secondPassword,
        role: "USER",
      }
    );
    expect(createUserResponse.ok).toBe(true);
    createdUsernames.push(secondUsername);

    // Get the second user's ID and add to groups
    const secondUserId = createUserResponse.data.user.id;
    await adminClient.post(`/api/groups/${groupWithSharePermission}/members`, {
      userId: secondUserId,
    });
    await adminClient.post(
      `/api/groups/${groupWithoutSharePermission}/members`,
      {
        userId: secondUserId,
      }
    );

    // Login as second user
    secondUserClient = new TestClient();
    await secondUserClient.login(secondUsername, secondPassword);
  });

  afterAll(async () => {
    // Clean up playlists
    for (const playlistId of createdPlaylistIds) {
      try {
        await adminClient.delete(`/api/playlists/${playlistId}`);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Clean up groups
    for (const groupId of createdGroupIds) {
      try {
        await adminClient.delete(`/api/groups/${groupId}`);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Clean up test users
    for (const username of createdUsernames) {
      try {
        // Find user by username and delete
        const usersResponse = await adminClient.get<{
          users?: Array<{ id: number; username: string }>;
        }>("/api/user/all");
        const user = usersResponse.data.users?.find(
          (u) => u.username === username
        );
        if (user) {
          await adminClient.delete(`/api/user/${user.id}`);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ===========================================================================
  // AUTHENTICATION TESTS
  // ===========================================================================

  describe("Authentication", () => {
    it("rejects unauthenticated requests to GET /api/playlists/shared", async () => {
      const response = await guestClient.get<ErrorResponse>(
        "/api/playlists/shared"
      );
      expect(response.status).toBe(401);
    });

    it("rejects unauthenticated requests to GET /api/playlists/:id/shares", async () => {
      const response = await guestClient.get<ErrorResponse>(
        "/api/playlists/1/shares"
      );
      expect(response.status).toBe(401);
    });

    it("rejects unauthenticated requests to PUT /api/playlists/:id/shares", async () => {
      const response = await guestClient.put<ErrorResponse>(
        "/api/playlists/1/shares",
        {
          groupIds: [],
        }
      );
      expect(response.status).toBe(401);
    });

    it("rejects unauthenticated requests to POST /api/playlists/:id/duplicate", async () => {
      const response = await guestClient.post<ErrorResponse>(
        "/api/playlists/1/duplicate"
      );
      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // GET /api/playlists/shared
  // ===========================================================================

  describe("GET /api/playlists/shared", () => {
    it("returns empty array when no playlists are shared with user", async () => {
      const response = await secondUserClient.get<GetSharedPlaylistsResponse>(
        "/api/playlists/shared"
      );

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data.playlists).toBeDefined();
      expect(Array.isArray(response.data.playlists)).toBe(true);
      // Initially no shared playlists (any existing ones from previous runs)
    });

    it("returns playlists shared via user's groups", async () => {
      // Create a playlist as admin
      const playlistName = `Shared Test Playlist ${Date.now()}`;
      const createResponse = await adminClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: playlistName,
          description: "Playlist to test sharing",
        }
      );
      expect(createResponse.ok).toBe(true);
      const playlistId = createResponse.data.playlist.id;
      createdPlaylistIds.push(playlistId);

      // Share with the group that has share permission
      const shareResponse = await adminClient.put<UpdatePlaylistSharesResponse>(
        `/api/playlists/${playlistId}/shares`,
        { groupIds: [groupWithSharePermission] }
      );
      expect(shareResponse.ok).toBe(true);

      // Check that second user can see the shared playlist
      const sharedResponse =
        await secondUserClient.get<GetSharedPlaylistsResponse>(
          "/api/playlists/shared"
        );
      expect(sharedResponse.ok).toBe(true);

      const sharedPlaylist = sharedResponse.data.playlists.find(
        (p) => p.id === playlistId
      );
      expect(sharedPlaylist).toBeDefined();
      expect(sharedPlaylist?.name).toBe(playlistName);
      expect(sharedPlaylist?.owner.username).toBe(TEST_ADMIN.username);
    });

    it("excludes user's own playlists from shared list", async () => {
      // Create a playlist as second user
      const playlistName = `Own Playlist ${Date.now()}`;
      const createResponse = await secondUserClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: playlistName,
        }
      );
      expect(createResponse.ok).toBe(true);
      createdPlaylistIds.push(createResponse.data.playlist.id);

      // Get shared playlists (should not include own playlist)
      const sharedResponse =
        await secondUserClient.get<GetSharedPlaylistsResponse>(
          "/api/playlists/shared"
        );
      expect(sharedResponse.ok).toBe(true);

      const ownPlaylist = sharedResponse.data.playlists.find(
        (p) => p.id === createResponse.data.playlist.id
      );
      expect(ownPlaylist).toBeUndefined();
    });

    it("shows correct group names for shared playlists", async () => {
      // Create and share a playlist
      const createResponse = await adminClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: `Group Name Test Playlist ${Date.now()}`,
        }
      );
      expect(createResponse.ok).toBe(true);
      const playlistId = createResponse.data.playlist.id;
      createdPlaylistIds.push(playlistId);

      // Share with the group
      await adminClient.put<UpdatePlaylistSharesResponse>(
        `/api/playlists/${playlistId}/shares`,
        {
          groupIds: [groupWithSharePermission],
        }
      );

      // Check shared playlists as second user
      const sharedResponse =
        await secondUserClient.get<GetSharedPlaylistsResponse>(
          "/api/playlists/shared"
        );
      expect(sharedResponse.ok).toBe(true);

      const sharedPlaylist = sharedResponse.data.playlists.find(
        (p) => p.id === playlistId
      );
      expect(sharedPlaylist).toBeDefined();
      expect(sharedPlaylist?.sharedViaGroups).toBeDefined();
      expect(Array.isArray(sharedPlaylist?.sharedViaGroups)).toBe(true);
      expect(sharedPlaylist?.sharedViaGroups.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // GET /api/playlists/:id/shares
  // ===========================================================================

  describe("GET /api/playlists/:id/shares", () => {
    it("returns shares for playlist owner", async () => {
      // Create a playlist
      const createResponse = await adminClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: `Get Shares Test ${Date.now()}`,
        }
      );
      expect(createResponse.ok).toBe(true);
      const playlistId = createResponse.data.playlist.id;
      createdPlaylistIds.push(playlistId);

      // Share with a group
      await adminClient.put<UpdatePlaylistSharesResponse>(
        `/api/playlists/${playlistId}/shares`,
        {
          groupIds: [groupWithSharePermission],
        }
      );

      // Get shares as owner
      const sharesResponse = await adminClient.get<GetPlaylistSharesResponse>(
        `/api/playlists/${playlistId}/shares`
      );
      expect(sharesResponse.ok).toBe(true);
      expect(sharesResponse.status).toBe(200);
      expect(sharesResponse.data.shares).toBeDefined();
      expect(Array.isArray(sharesResponse.data.shares)).toBe(true);
      expect(sharesResponse.data.shares.length).toBe(1);
      expect(must(sharesResponse.data.shares[0]).groupId).toBe(
        groupWithSharePermission
      );
    });

    it("returns 404 for non-owner", async () => {
      // Create a playlist as admin
      const createResponse = await adminClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: `Non-Owner Shares Test ${Date.now()}`,
        }
      );
      expect(createResponse.ok).toBe(true);
      const playlistId = createResponse.data.playlist.id;
      createdPlaylistIds.push(playlistId);

      // Try to get shares as second user (not owner)
      const sharesResponse = await secondUserClient.get<ErrorResponse>(
        `/api/playlists/${playlistId}/shares`
      );
      expect(sharesResponse.ok).toBe(false);
      expect(sharesResponse.status).toBe(404);
    });
  });

  // ===========================================================================
  // PUT /api/playlists/:id/shares
  // ===========================================================================

  describe("PUT /api/playlists/:id/shares", () => {
    it("requires canShare permission", async () => {
      // First, we need the admin to NOT be in a group with canShare
      // Create a new admin user in only the no-share group
      const noShareUsername = `no_share_user_${Date.now()}`;
      const noSharePassword = "TestPassword123!";

      // Create user
      const createUserResponse = await adminClient.post<UserResponse>(
        "/api/user/create",
        {
          username: noShareUsername,
          password: noSharePassword,
          role: "USER",
        }
      );
      expect(createUserResponse.ok).toBe(true);
      createdUsernames.push(noShareUsername);
      const noShareUserId = createUserResponse.data.user.id;

      // Add only to group without share permission
      await adminClient.post(
        `/api/groups/${groupWithoutSharePermission}/members`,
        {
          userId: noShareUserId,
        }
      );

      // Login as the no-share user
      const noShareClient = new TestClient();
      await noShareClient.login(noShareUsername, noSharePassword);

      // Create a playlist as this user
      const createPlaylistResponse = await noShareClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: `No Share Permission Test ${Date.now()}`,
        }
      );
      expect(createPlaylistResponse.ok).toBe(true);
      const playlistId = createPlaylistResponse.data.playlist.id;
      createdPlaylistIds.push(playlistId);

      // Try to share - should fail due to no canShare permission
      const shareResponse = await noShareClient.put<ErrorResponse>(
        `/api/playlists/${playlistId}/shares`,
        { groupIds: [groupWithoutSharePermission] }
      );
      expect(shareResponse.ok).toBe(false);
      expect(shareResponse.status).toBe(403);
      expect(shareResponse.data.error).toContain("permission");
    });

    it("only allows sharing with groups user belongs to", async () => {
      // Create a new group that admin doesn't belong to
      const exclusiveGroupResponse = await adminClient.post<GroupResponse>(
        "/api/groups",
        {
          name: `Exclusive Group ${Date.now()}`,
          canShare: true,
        }
      );
      expect(exclusiveGroupResponse.ok).toBe(true);
      const exclusiveGroupId = exclusiveGroupResponse.data.group.id;
      createdGroupIds.push(exclusiveGroupId);

      // Admin is NOT a member of this group (we didn't add them)

      // Create a playlist
      const createResponse = await adminClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: `Exclusive Share Test ${Date.now()}`,
        }
      );
      expect(createResponse.ok).toBe(true);
      const playlistId = createResponse.data.playlist.id;
      createdPlaylistIds.push(playlistId);

      // Try to share with the exclusive group - should fail
      const shareResponse = await adminClient.put<ErrorResponse>(
        `/api/playlists/${playlistId}/shares`,
        { groupIds: [exclusiveGroupId] }
      );
      expect(shareResponse.ok).toBe(false);
      expect(shareResponse.status).toBe(403);
      expect(shareResponse.data.error).toContain("groups you belong to");
    });

    it("replaces existing shares when updating", async () => {
      // Create a second group for this test that admin belongs to
      const secondGroupResponse = await adminClient.post<GroupResponse>(
        "/api/groups",
        {
          name: `Second Share Group ${Date.now()}`,
          canShare: true,
        }
      );
      expect(secondGroupResponse.ok).toBe(true);
      const secondGroupId = secondGroupResponse.data.group.id;
      createdGroupIds.push(secondGroupId);

      // Add admin to this group
      const adminMeResponse =
        await adminClient.get<UserResponse>("/api/auth/me");
      const adminUserId = adminMeResponse.data.user.id;
      await adminClient.post(`/api/groups/${secondGroupId}/members`, {
        userId: adminUserId,
      });

      // Create a playlist
      const createResponse = await adminClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: `Replace Shares Test ${Date.now()}`,
        }
      );
      expect(createResponse.ok).toBe(true);
      const playlistId = createResponse.data.playlist.id;
      createdPlaylistIds.push(playlistId);

      // Share with first group
      const firstShareResponse =
        await adminClient.put<UpdatePlaylistSharesResponse>(
          `/api/playlists/${playlistId}/shares`,
          { groupIds: [groupWithSharePermission] }
        );
      expect(firstShareResponse.ok).toBe(true);
      expect(firstShareResponse.data.shares.length).toBe(1);
      expect(must(firstShareResponse.data.shares[0]).groupId).toBe(
        groupWithSharePermission
      );

      // Now share with second group only (should replace)
      const secondShareResponse =
        await adminClient.put<UpdatePlaylistSharesResponse>(
          `/api/playlists/${playlistId}/shares`,
          { groupIds: [secondGroupId] }
        );
      expect(secondShareResponse.ok).toBe(true);
      expect(secondShareResponse.data.shares.length).toBe(1);
      expect(must(secondShareResponse.data.shares[0]).groupId).toBe(
        secondGroupId
      );

      // Verify first group share is gone
      const sharesResponse = await adminClient.get<GetPlaylistSharesResponse>(
        `/api/playlists/${playlistId}/shares`
      );
      expect(sharesResponse.ok).toBe(true);
      expect(sharesResponse.data.shares.length).toBe(1);
      expect(must(sharesResponse.data.shares[0]).groupId).toBe(secondGroupId);
    });

    it("empty groupIds array clears all shares", async () => {
      // Create and share a playlist
      const createResponse = await adminClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: `Clear Shares Test ${Date.now()}`,
        }
      );
      expect(createResponse.ok).toBe(true);
      const playlistId = createResponse.data.playlist.id;
      createdPlaylistIds.push(playlistId);

      // Share with a group
      await adminClient.put<UpdatePlaylistSharesResponse>(
        `/api/playlists/${playlistId}/shares`,
        {
          groupIds: [groupWithSharePermission],
        }
      );

      // Verify it's shared
      const sharesBefore = await adminClient.get<GetPlaylistSharesResponse>(
        `/api/playlists/${playlistId}/shares`
      );
      expect(sharesBefore.data.shares.length).toBe(1);

      // Clear shares with empty array
      const clearResponse = await adminClient.put<UpdatePlaylistSharesResponse>(
        `/api/playlists/${playlistId}/shares`,
        { groupIds: [] }
      );
      expect(clearResponse.ok).toBe(true);
      expect(clearResponse.data.shares.length).toBe(0);

      // Verify shares are cleared
      const sharesAfter = await adminClient.get<GetPlaylistSharesResponse>(
        `/api/playlists/${playlistId}/shares`
      );
      expect(sharesAfter.data.shares.length).toBe(0);
    });
  });

  // ===========================================================================
  // POST /api/playlists/:id/duplicate
  // ===========================================================================

  describe("POST /api/playlists/:id/duplicate", () => {
    it("allows owner to duplicate their own playlist", async () => {
      // Create a playlist
      const originalName = `Original Playlist ${Date.now()}`;
      const createResponse = await adminClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: originalName,
          description: "Original description",
        }
      );
      expect(createResponse.ok).toBe(true);
      const playlistId = createResponse.data.playlist.id;
      createdPlaylistIds.push(playlistId);

      // Duplicate it
      const duplicateResponse = await adminClient.post<PlaylistResponse>(
        `/api/playlists/${playlistId}/duplicate`
      );
      expect(duplicateResponse.ok).toBe(true);
      expect(duplicateResponse.status).toBe(201);

      const duplicate = duplicateResponse.data.playlist;
      createdPlaylistIds.push(duplicate.id);

      // Verify duplicate properties
      expect(duplicate.id).not.toBe(playlistId);
      expect(duplicate.name).toBe(`${originalName} (Copy)`);
      expect(duplicate.description).toBe("Original description");
    });

    it("allows shared user to duplicate a shared playlist", async () => {
      // Create a playlist as admin
      const originalName = `Shared to Duplicate ${Date.now()}`;
      const createResponse = await adminClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: originalName,
        }
      );
      expect(createResponse.ok).toBe(true);
      const playlistId = createResponse.data.playlist.id;
      createdPlaylistIds.push(playlistId);

      // Share with the group
      await adminClient.put<UpdatePlaylistSharesResponse>(
        `/api/playlists/${playlistId}/shares`,
        {
          groupIds: [groupWithSharePermission],
        }
      );

      // Duplicate as second user (who has shared access)
      const duplicateResponse = await secondUserClient.post<PlaylistResponse>(
        `/api/playlists/${playlistId}/duplicate`
      );
      expect(duplicateResponse.ok).toBe(true);
      expect(duplicateResponse.status).toBe(201);

      const duplicate = duplicateResponse.data.playlist;
      createdPlaylistIds.push(duplicate.id);

      // Verify duplicate properties
      expect(duplicate.id).not.toBe(playlistId);
      expect(duplicate.name).toBe(`${originalName} (Copy)`);
    });

    it("denies user without access", async () => {
      // Create a user with no group membership
      const noAccessUsername = `no_access_user_${Date.now()}`;
      const noAccessPassword = "TestPassword123!";

      const createUserResponse = await adminClient.post<UserResponse>(
        "/api/user/create",
        {
          username: noAccessUsername,
          password: noAccessPassword,
          role: "USER",
        }
      );
      expect(createUserResponse.ok).toBe(true);
      createdUsernames.push(noAccessUsername);

      // Login as no-access user
      const noAccessClient = new TestClient();
      await noAccessClient.login(noAccessUsername, noAccessPassword);

      // Create a playlist as admin (not shared)
      const createResponse = await adminClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: `No Access Duplicate Test ${Date.now()}`,
        }
      );
      expect(createResponse.ok).toBe(true);
      const playlistId = createResponse.data.playlist.id;
      createdPlaylistIds.push(playlistId);

      // Try to duplicate (should fail with 404 - not found/no access)
      const duplicateResponse = await noAccessClient.post<ErrorResponse>(
        `/api/playlists/${playlistId}/duplicate`
      );
      expect(duplicateResponse.ok).toBe(false);
      expect(duplicateResponse.status).toBe(404);
    });

    it("duplicated playlist has new ID and owner is the duplicator", async () => {
      // Create a playlist as admin
      const createResponse = await adminClient.post<PlaylistResponse>(
        "/api/playlists",
        {
          name: `Ownership Test ${Date.now()}`,
        }
      );
      expect(createResponse.ok).toBe(true);
      const originalPlaylistId = createResponse.data.playlist.id;
      const originalOwnerId = createResponse.data.playlist.userId;
      createdPlaylistIds.push(originalPlaylistId);

      // Share with the group
      await adminClient.put<UpdatePlaylistSharesResponse>(
        `/api/playlists/${originalPlaylistId}/shares`,
        { groupIds: [groupWithSharePermission] }
      );

      // Duplicate as second user
      const duplicateResponse = await secondUserClient.post<PlaylistResponse>(
        `/api/playlists/${originalPlaylistId}/duplicate`
      );
      expect(duplicateResponse.ok).toBe(true);

      const duplicate = duplicateResponse.data.playlist;
      createdPlaylistIds.push(duplicate.id);

      // Verify new ID
      expect(duplicate.id).not.toBe(originalPlaylistId);

      // Verify owner is the duplicator (second user), not the original owner
      expect(duplicate.userId).not.toBe(originalOwnerId);

      // Verify second user can see it in their playlists
      const userPlaylistsResponse = await secondUserClient.get<{
        playlists: PlaylistData[];
      }>("/api/playlists");
      expect(userPlaylistsResponse.ok).toBe(true);

      const foundDuplicate = userPlaylistsResponse.data.playlists.find(
        (p) => p.id === duplicate.id
      );
      expect(foundDuplicate).toBeDefined();
    });
  });
});

describe("Playlist duplicate visibility", () => {
  const GROUP_NAME = "access-it-playlist-duplicate";
  const PASSWORD = "access_it_pass_1";
  let ownerPlaylistId: number;
  let recipient: Awaited<ReturnType<typeof createApiUser>>;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedAccessFixture();
    const owner = await createApiUser("access_it_dup_owner", PASSWORD);
    // A share counts only while its owner may share
    await prisma.user.update({
      where: { id: owner.id },
      data: { canShareOverride: true },
    });
    recipient = await createApiUser("access_it_dup_recipient", PASSWORD);

    // GLOBAL@A is hidden by the recipient; DELETED is soft-deleted and
    // ON_OFF sits on a disabled instance
    await hideFor(recipient.id, "scene", FX_ID.GLOBAL, FX.A);
    const items = [
      [FX_ID.SAME, FX.A],
      [FX_ID.GLOBAL, FX.A],
      [FX_ID.DELETED, FX.A],
      [FX_ID.ON_OFF, FX.OFF],
      [FX_ID.SAME, FX.B],
    ] as const;
    const playlist = await prisma.playlist.create({
      data: {
        userId: owner.id,
        name: "access-it duplicate",
        items: {
          create: items.map(([sceneId, instanceId], position) => ({
            sceneId,
            instanceId,
            position,
          })),
        },
      },
    });
    ownerPlaylistId = playlist.id;
    const group = await prisma.userGroup.create({
      data: {
        name: GROUP_NAME,
        members: { create: [{ userId: owner.id }, { userId: recipient.id }] },
      },
    });
    await prisma.playlistShare.create({
      data: { playlistId: ownerPlaylistId, groupId: group.id },
    });
  }, 60000);

  afterAll(async () => {
    await prisma.userGroup.deleteMany({ where: { name: GROUP_NAME } });
    await clearAccessFixture();
  }, 60000);

  it("a recipient's duplicate leaves out what they cannot see", async () => {
    const response = await recipient.client.post<PlaylistResponse>(
      `/api/playlists/${ownerPlaylistId}/duplicate`
    );
    expect(response.status).toBe(201);
    const copy = response.data.playlist;
    expect(copy._count?.items).toBe(2);

    const stored = await prisma.playlistItem.findMany({
      where: { playlistId: copy.id },
      orderBy: { position: "asc" },
    });
    expect(stored.map((i) => [i.sceneId, i.instanceId, i.position])).toEqual([
      [FX_ID.SAME, FX.A, 0],
      [FX_ID.SAME, FX.B, 1],
    ]);
  });
});

describe("Playlist shares follow the owner", () => {
  const PASSWORD = "access_it_pass_1";
  const GROUP_A = "share-follow-group-a";
  const GROUP_B = "share-follow-group-b";
  let owner: Awaited<ReturnType<typeof createApiUser>>;
  let recipient: Awaited<ReturnType<typeof createApiUser>>;
  let groupA: number;
  let groupB: number;

  interface SharedList {
    playlists: Array<{ id: number }>;
  }

  async function createSharedPlaylist(groupIds: number[]): Promise<number> {
    const created = await owner.client.post<PlaylistResponse>(
      "/api/playlists",
      { name: `share-follow ${Date.now()}` }
    );
    expect(created.status).toBe(201);
    const shared = await owner.client.put<UpdatePlaylistSharesResponse>(
      `/api/playlists/${created.data.playlist.id}/shares`,
      { groupIds }
    );
    expect(shared.ok).toBe(true);
    return created.data.playlist.id;
  }

  async function recipientSees(playlistId: number): Promise<boolean> {
    const shared = await recipient.client.get<SharedList>(
      "/api/playlists/shared"
    );
    const listed = shared.data.playlists.some((p) => p.id === playlistId);
    const detail = await recipient.client.get<ErrorResponse>(
      `/api/playlists/${playlistId}`
    );
    // The list and the page agree
    expect(detail.ok).toBe(listed);
    return listed;
  }

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedAccessFixture();
    owner = await createApiUser("access_it_share_owner", PASSWORD);
    recipient = await createApiUser("access_it_share_recipient", PASSWORD);
    groupA = (
      await prisma.userGroup.create({
        data: {
          name: GROUP_A,
          canShare: true,
          members: { create: [{ userId: owner.id }, { userId: recipient.id }] },
        },
      })
    ).id;
    groupB = (
      await prisma.userGroup.create({
        data: {
          name: GROUP_B,
          canShare: true,
          members: { create: [{ userId: owner.id }] },
        },
      })
    ).id;
  }, 60000);

  afterAll(async () => {
    await prisma.userGroup.deleteMany({
      where: { name: { in: [GROUP_A, GROUP_B] } },
    });
    await clearAccessFixture();
  }, 60000);

  it("a recipient's GET /api/playlists/:id names the owner", async () => {
    const playlistId = await createSharedPlaylist([groupA]);

    const detail = await recipient.client.get<{
      owner?: { id: number; username: string };
    }>(`/api/playlists/${playlistId}`);
    expect(detail.status).toBe(200);
    expect(detail.data.owner).toEqual({
      id: owner.id,
      username: "access_it_share_owner",
    });
  });

  it("after the owner leaves group G, G's members no longer see the playlist and the owner can still edit the other shares", async () => {
    const playlistId = await createSharedPlaylist([groupA, groupB]);
    expect(await recipientSees(playlistId)).toBe(true);

    const left = await adminClient.delete(
      `/api/groups/${groupA}/members/${owner.id}`
    );
    expect(left.ok).toBe(true);

    expect(await recipientSees(playlistId)).toBe(false);
    const shares = await owner.client.get<GetPlaylistSharesResponse>(
      `/api/playlists/${playlistId}/shares`
    );
    expect(shares.data.shares.map((s) => s.groupId)).toEqual([groupB]);

    // Editing the shares no longer fails on the group the owner left
    const edited = await owner.client.put<UpdatePlaylistSharesResponse>(
      `/api/playlists/${playlistId}/shares`,
      { groupIds: [groupB] }
    );
    expect(edited.status).toBe(200);

    // Put the owner back for the next case
    await prisma.userGroupMembership.create({
      data: { userId: owner.id, groupId: groupA },
    });
  });

  it("after the owner loses Can Share, recipients no longer see the playlist, and it comes back when Can Share does", async () => {
    const playlistId = await createSharedPlaylist([groupA]);
    expect(await recipientSees(playlistId)).toBe(true);

    await prisma.user.update({
      where: { id: owner.id },
      data: { canShareOverride: false },
    });
    expect(await recipientSees(playlistId)).toBe(false);

    await prisma.user.update({
      where: { id: owner.id },
      data: { canShareOverride: null },
    });
    expect(await recipientSees(playlistId)).toBe(true);
  });
});
