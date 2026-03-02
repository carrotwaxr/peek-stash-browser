// shared/types/api/groups.ts
/**
 * Groups API Types
 *
 * Request and response types for /api/groups/* endpoints (user groups, not Stash groups).
 */

// =============================================================================
// SHARED
// =============================================================================

export interface GroupData {
  id: number;
  name: string;
  description: string | null;
  canShare: boolean;
  canDownloadFiles: boolean;
  canDownloadPlaylists: boolean;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMember {
  id: number;
  user: {
    id: number;
    username: string;
    role: string;
  };
  joinedAt: Date;
}

export interface GroupWithMembers {
  id: number;
  name: string;
  description: string | null;
  canShare: boolean;
  canDownloadFiles: boolean;
  canDownloadPlaylists: boolean;
  createdAt: Date;
  updatedAt: Date;
  members: GroupMember[];
}

// =============================================================================
// GET ALL GROUPS
// =============================================================================

/** GET /api/groups */
export interface GetAllUserGroupsResponse {
  groups: GroupData[];
}

// =============================================================================
// GET GROUP
// =============================================================================

/** GET /api/groups/:id */
export interface GetUserGroupParams extends Record<string, string> {
  id: string;
}

export interface GetUserGroupResponse {
  group: GroupWithMembers;
}

// =============================================================================
// CREATE GROUP
// =============================================================================

/** POST /api/groups */
export interface CreateUserGroupBody {
  name: string;
  description?: string;
  canShare?: boolean;
  canDownloadFiles?: boolean;
  canDownloadPlaylists?: boolean;
}

export interface CreateUserGroupResponse {
  group: {
    id: number;
    name: string;
    description: string | null;
    canShare: boolean;
    canDownloadFiles: boolean;
    canDownloadPlaylists: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

// =============================================================================
// UPDATE GROUP
// =============================================================================

/** PUT /api/groups/:id */
export interface UpdateUserGroupParams extends Record<string, string> {
  id: string;
}

export interface UpdateUserGroupBody {
  name?: string;
  description?: string;
  canShare?: boolean;
  canDownloadFiles?: boolean;
  canDownloadPlaylists?: boolean;
}

export interface UpdateUserGroupResponse {
  group: {
    id: number;
    name: string;
    description: string | null;
    canShare: boolean;
    canDownloadFiles: boolean;
    canDownloadPlaylists: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

// =============================================================================
// DELETE GROUP
// =============================================================================

/** DELETE /api/groups/:id */
export interface DeleteUserGroupParams extends Record<string, string> {
  id: string;
}

export interface DeleteUserGroupResponse {
  success: true;
}

// =============================================================================
// ADD MEMBER
// =============================================================================

/** POST /api/groups/:id/members */
export interface AddMemberParams extends Record<string, string> {
  id: string;
}

export interface AddMemberBody {
  userId: number;
}

export interface AddMemberResponse {
  membership: {
    id: number;
    userId: number;
    groupId: number;
    createdAt: Date;
  };
}

// =============================================================================
// REMOVE MEMBER
// =============================================================================

/** DELETE /api/groups/:id/members/:userId */
export interface RemoveMemberParams extends Record<string, string> {
  id: string;
  userId: string;
}

export interface RemoveMemberResponse {
  success: true;
}

// =============================================================================
// GET USER GROUPS (current user)
// =============================================================================

/** GET /api/user/groups */
export interface GetCurrentUserGroupsResponse {
  groups: Array<{
    id: number;
    name: string;
    description: string | null;
    canShare: boolean;
    canDownloadFiles: boolean;
    canDownloadPlaylists: boolean;
  }>;
}
