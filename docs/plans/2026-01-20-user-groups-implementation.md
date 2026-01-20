# User Groups Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement User Groups as a first-class entity to enable group-based permissions and playlist sharing.

**Architecture:** Two new Prisma models (`UserGroup`, `UserGroupMembership`) with a permission service that resolves effective permissions using "most permissive wins" logic. Admin UI for CRUD operations on groups and managing memberships. User-level permission overrides stored on the User model.

**Tech Stack:** Prisma/SQLite, Express controllers, React components with existing Paper/Modal patterns.

---

## Task 1: Database Schema - UserGroup and UserGroupMembership

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add UserGroup model to schema**

Add after the `User` model (around line 69):

```prisma
model UserGroup {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  description String?

  // Permission defaults for group members
  canShare             Boolean @default(false)
  canDownloadFiles     Boolean @default(false)
  canDownloadPlaylists Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members UserGroupMembership[]
}

model UserGroupMembership {
  id      Int       @id @default(autoincrement())
  userId  Int
  groupId Int
  user    User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  group   UserGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([userId, groupId])
  @@index([userId])
  @@index([groupId])
}
```

**Step 2: Add permission override fields to User model**

Add these fields to the `User` model (after `hideConfirmationDisabled` around line 61):

```prisma
  // Permission overrides (null = inherit from groups, true/false = explicit override)
  canShareOverride             Boolean?
  canDownloadFilesOverride     Boolean?
  canDownloadPlaylistsOverride Boolean?

  // Group memberships relation
  groupMemberships UserGroupMembership[]
```

**Step 3: Generate and run migration**

Run: `cd server && npx prisma migrate dev --name add_user_groups`

Expected: Migration created and applied successfully.

**Step 4: Verify schema**

Run: `cd server && npx prisma generate`

Expected: Prisma client regenerated with new types.

**Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "$(cat <<'EOF'
feat(db): add UserGroup and UserGroupMembership models

Introduces user groups for permission inheritance and sharing scope.
- UserGroup: stores group name, description, and default permissions
- UserGroupMembership: many-to-many join between users and groups
- User permission overrides: canShareOverride, canDownloadFilesOverride, canDownloadPlaylistsOverride

Part of #319

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Permission Resolution Service

**Files:**
- Create: `server/services/PermissionService.ts`
- Test: `server/tests/services/PermissionService.test.ts`

**Step 1: Write the failing tests**

Create `server/tests/services/PermissionService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the service
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
    userGroup: {
      findMany: vi.fn(),
    },
    userGroupMembership: {
      findMany: vi.fn(),
    },
  },
}));

import { resolveUserPermissions, type UserPermissions } from "../../services/PermissionService.js";
import prisma from "../../prisma/singleton.js";

const mockPrisma = vi.mocked(prisma);

describe("PermissionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveUserPermissions", () => {
    it("should return all false when user has no groups and no overrides", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        canShareOverride: null,
        canDownloadFilesOverride: null,
        canDownloadPlaylistsOverride: null,
        groupMemberships: [],
      } as never);

      const result = await resolveUserPermissions(1);

      expect(result).toEqual({
        canShare: false,
        canDownloadFiles: false,
        canDownloadPlaylists: false,
        sources: {
          canShare: "default",
          canDownloadFiles: "default",
          canDownloadPlaylists: "default",
        },
      });
    });

    it("should inherit permissions from single group", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        canShareOverride: null,
        canDownloadFilesOverride: null,
        canDownloadPlaylistsOverride: null,
        groupMemberships: [
          {
            group: {
              id: 1,
              name: "Family",
              canShare: true,
              canDownloadFiles: false,
              canDownloadPlaylists: true,
            },
          },
        ],
      } as never);

      const result = await resolveUserPermissions(1);

      expect(result).toEqual({
        canShare: true,
        canDownloadFiles: false,
        canDownloadPlaylists: true,
        sources: {
          canShare: "Family",
          canDownloadFiles: "default",
          canDownloadPlaylists: "Family",
        },
      });
    });

    it("should use most permissive when user belongs to multiple groups", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        canShareOverride: null,
        canDownloadFilesOverride: null,
        canDownloadPlaylistsOverride: null,
        groupMemberships: [
          {
            group: {
              id: 1,
              name: "Family",
              canShare: true,
              canDownloadFiles: false,
              canDownloadPlaylists: false,
            },
          },
          {
            group: {
              id: 2,
              name: "Friends",
              canShare: false,
              canDownloadFiles: true,
              canDownloadPlaylists: false,
            },
          },
        ],
      } as never);

      const result = await resolveUserPermissions(1);

      expect(result).toEqual({
        canShare: true,
        canDownloadFiles: true,
        canDownloadPlaylists: false,
        sources: {
          canShare: "Family",
          canDownloadFiles: "Friends",
          canDownloadPlaylists: "default",
        },
      });
    });

    it("should let user override take precedence over group permissions", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        canShareOverride: false, // Explicit override to disable
        canDownloadFilesOverride: true, // Explicit override to enable
        canDownloadPlaylistsOverride: null, // Inherit from group
        groupMemberships: [
          {
            group: {
              id: 1,
              name: "Family",
              canShare: true,
              canDownloadFiles: false,
              canDownloadPlaylists: true,
            },
          },
        ],
      } as never);

      const result = await resolveUserPermissions(1);

      expect(result).toEqual({
        canShare: false,
        canDownloadFiles: true,
        canDownloadPlaylists: true,
        sources: {
          canShare: "override",
          canDownloadFiles: "override",
          canDownloadPlaylists: "Family",
        },
      });
    });

    it("should return null for non-existent user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await resolveUserPermissions(999);

      expect(result).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npm test -- PermissionService.test.ts`

Expected: FAIL - module not found

**Step 3: Write the implementation**

Create `server/services/PermissionService.ts`:

```typescript
import prisma from "../prisma/singleton.js";

export interface UserPermissions {
  canShare: boolean;
  canDownloadFiles: boolean;
  canDownloadPlaylists: boolean;
  sources: {
    canShare: string; // "default", "override", or group name
    canDownloadFiles: string;
    canDownloadPlaylists: string;
  };
}

type PermissionKey = "canShare" | "canDownloadFiles" | "canDownloadPlaylists";
type OverrideKey =
  | "canShareOverride"
  | "canDownloadFilesOverride"
  | "canDownloadPlaylistsOverride";

const PERMISSION_KEYS: { permission: PermissionKey; override: OverrideKey }[] = [
  { permission: "canShare", override: "canShareOverride" },
  { permission: "canDownloadFiles", override: "canDownloadFilesOverride" },
  { permission: "canDownloadPlaylists", override: "canDownloadPlaylistsOverride" },
];

export async function resolveUserPermissions(
  userId: number
): Promise<UserPermissions | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      canShareOverride: true,
      canDownloadFilesOverride: true,
      canDownloadPlaylistsOverride: true,
      groupMemberships: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
              canShare: true,
              canDownloadFiles: true,
              canDownloadPlaylists: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const result: UserPermissions = {
    canShare: false,
    canDownloadFiles: false,
    canDownloadPlaylists: false,
    sources: {
      canShare: "default",
      canDownloadFiles: "default",
      canDownloadPlaylists: "default",
    },
  };

  const groups = user.groupMemberships.map((m) => m.group);

  for (const { permission, override } of PERMISSION_KEYS) {
    const overrideValue = user[override];

    // User override takes precedence
    if (overrideValue !== null) {
      result[permission] = overrideValue;
      result.sources[permission] = "override";
      continue;
    }

    // Find first group that grants permission (most permissive wins)
    const grantingGroup = groups.find((g) => g[permission] === true);
    if (grantingGroup) {
      result[permission] = true;
      result.sources[permission] = grantingGroup.name;
    }
    // Otherwise stays false with "default" source
  }

  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npm test -- PermissionService.test.ts`

Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add server/services/PermissionService.ts server/tests/services/PermissionService.test.ts
git commit -m "$(cat <<'EOF'
feat(server): add PermissionService for group-based permission resolution

Implements "most permissive wins" logic:
- User with no groups and no overrides gets all permissions false
- Permissions inherit from any group the user belongs to
- If multiple groups, first group granting permission wins
- User-level overrides always take precedence

Returns source information for UI display (which group granted permission).

Part of #319

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Admin API - Group CRUD Endpoints

**Files:**
- Create: `server/controllers/groups.ts`
- Create: `server/routes/groups.ts`
- Modify: `server/initializers/api.ts`
- Test: `server/tests/controllers/groups.test.ts`

**Step 1: Write the failing tests**

Create `server/tests/controllers/groups.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    userGroup: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userGroupMembership: {
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import {
  getAllGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addMember,
  removeMember,
} from "../../controllers/groups.js";
import prisma from "../../prisma/singleton.js";

const mockPrisma = vi.mocked(prisma);

describe("Groups Controller", () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let responseJson: ReturnType<typeof vi.fn>;
  let responseStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    responseJson = vi.fn();
    responseStatus = vi.fn(() => ({ json: responseJson }));
    mockResponse = { json: responseJson, status: responseStatus };
  });

  describe("getAllGroups", () => {
    it("should return 403 if user is not admin", async () => {
      mockRequest = { user: { id: 1, role: "USER" } };

      await getAllGroups(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return all groups with member counts", async () => {
      mockRequest = { user: { id: 1, role: "ADMIN" } };
      mockPrisma.userGroup.findMany.mockResolvedValue([
        {
          id: 1,
          name: "Family",
          description: "Family members",
          canShare: true,
          canDownloadFiles: false,
          canDownloadPlaylists: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { members: 3 },
        },
      ] as never);

      await getAllGroups(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseJson).toHaveBeenCalledWith({
        groups: expect.arrayContaining([
          expect.objectContaining({ name: "Family", memberCount: 3 }),
        ]),
      });
    });
  });

  describe("createGroup", () => {
    it("should return 400 if name is missing", async () => {
      mockRequest = { user: { id: 1, role: "ADMIN" }, body: {} };

      await createGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
    });

    it("should return 409 if name already exists", async () => {
      mockRequest = { user: { id: 1, role: "ADMIN" }, body: { name: "Family" } };
      mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 1 } as never);

      await createGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(409);
    });

    it("should create group with permissions", async () => {
      mockRequest = {
        user: { id: 1, role: "ADMIN" },
        body: {
          name: "Friends",
          description: "Close friends",
          canShare: true,
          canDownloadFiles: true,
        },
      };
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);
      mockPrisma.userGroup.create.mockResolvedValue({
        id: 2,
        name: "Friends",
        description: "Close friends",
        canShare: true,
        canDownloadFiles: true,
        canDownloadPlaylists: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      await createGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.userGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Friends",
          canShare: true,
          canDownloadFiles: true,
        }),
      });
      expect(responseStatus).toHaveBeenCalledWith(201);
    });
  });

  describe("deleteGroup", () => {
    it("should delete group by id", async () => {
      mockRequest = { user: { id: 1, role: "ADMIN" }, params: { id: "1" } };
      mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 1, name: "Family" } as never);
      mockPrisma.userGroup.delete.mockResolvedValue({ id: 1 } as never);

      await deleteGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.userGroup.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(responseJson).toHaveBeenCalledWith({ success: true });
    });
  });

  describe("addMember", () => {
    it("should add user to group", async () => {
      mockRequest = {
        user: { id: 1, role: "ADMIN" },
        params: { id: "1" },
        body: { userId: 2 },
      };
      mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 1 } as never);
      mockPrisma.userGroupMembership.findUnique.mockResolvedValue(null);
      mockPrisma.userGroupMembership.create.mockResolvedValue({
        id: 1,
        userId: 2,
        groupId: 1,
      } as never);

      await addMember(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.userGroupMembership.create).toHaveBeenCalledWith({
        data: { userId: 2, groupId: 1 },
      });
      expect(responseStatus).toHaveBeenCalledWith(201);
    });

    it("should return 409 if user already in group", async () => {
      mockRequest = {
        user: { id: 1, role: "ADMIN" },
        params: { id: "1" },
        body: { userId: 2 },
      };
      mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 1 } as never);
      mockPrisma.userGroupMembership.findUnique.mockResolvedValue({ id: 1 } as never);

      await addMember(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(409);
    });
  });

  describe("removeMember", () => {
    it("should remove user from group", async () => {
      mockRequest = {
        user: { id: 1, role: "ADMIN" },
        params: { id: "1", userId: "2" },
      };
      mockPrisma.userGroupMembership.findUnique.mockResolvedValue({ id: 1 } as never);
      mockPrisma.userGroupMembership.delete.mockResolvedValue({ id: 1 } as never);

      await removeMember(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.userGroupMembership.delete).toHaveBeenCalled();
      expect(responseJson).toHaveBeenCalledWith({ success: true });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npm test -- groups.test.ts`

Expected: FAIL - module not found

**Step 3: Write the controller implementation**

Create `server/controllers/groups.ts`:

```typescript
import { Response } from "express";
import prisma from "../prisma/singleton.js";
import { AuthenticatedRequest } from "../middleware/auth.js";

export const getAllGroups = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const groups = await prisma.userGroup.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        canShare: true,
        canDownloadFiles: true,
        canDownloadPlaylists: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    });

    res.json({
      groups: groups.map((g) => ({
        ...g,
        memberCount: g._count.members,
        _count: undefined,
      })),
    });
  } catch (error) {
    console.error("Error getting groups:", error);
    res.status(500).json({ error: "Failed to get groups" });
  }
};

export const getGroup = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    const group = await prisma.userGroup.findUnique({
      where: { id: groupId },
      include: {
        members: {
          select: {
            user: {
              select: { id: true, username: true, role: true },
            },
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json({
      group: {
        ...group,
        members: group.members.map((m) => m.user),
      },
    });
  } catch (error) {
    console.error("Error getting group:", error);
    res.status(500).json({ error: "Failed to get group" });
  }
};

export const createGroup = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const { name, description, canShare, canDownloadFiles, canDownloadPlaylists } =
      req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Group name is required" });
    }

    const existing = await prisma.userGroup.findUnique({
      where: { name: name.trim() },
    });

    if (existing) {
      return res.status(409).json({ error: "Group name already exists" });
    }

    const group = await prisma.userGroup.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        canShare: canShare === true,
        canDownloadFiles: canDownloadFiles === true,
        canDownloadPlaylists: canDownloadPlaylists === true,
      },
    });

    res.status(201).json({ success: true, group });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ error: "Failed to create group" });
  }
};

export const updateGroup = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    const existing = await prisma.userGroup.findUnique({
      where: { id: groupId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Group not found" });
    }

    const { name, description, canShare, canDownloadFiles, canDownloadPlaylists } =
      req.body;

    // Check for name collision if name is being changed
    if (name && name.trim() !== existing.name) {
      const nameExists = await prisma.userGroup.findUnique({
        where: { name: name.trim() },
      });
      if (nameExists) {
        return res.status(409).json({ error: "Group name already exists" });
      }
    }

    const group = await prisma.userGroup.update({
      where: { id: groupId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(canShare !== undefined && { canShare }),
        ...(canDownloadFiles !== undefined && { canDownloadFiles }),
        ...(canDownloadPlaylists !== undefined && { canDownloadPlaylists }),
      },
    });

    res.json({ success: true, group });
  } catch (error) {
    console.error("Error updating group:", error);
    res.status(500).json({ error: "Failed to update group" });
  }
};

export const deleteGroup = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    const existing = await prisma.userGroup.findUnique({
      where: { id: groupId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Group not found" });
    }

    await prisma.userGroup.delete({ where: { id: groupId } });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting group:", error);
    res.status(500).json({ error: "Failed to delete group" });
  }
};

export const addMember = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const groupId = parseInt(req.params.id);
    const { userId } = req.body;

    if (isNaN(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    if (!userId || typeof userId !== "number") {
      return res.status(400).json({ error: "User ID is required" });
    }

    const group = await prisma.userGroup.findUnique({ where: { id: groupId } });
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const existingMembership = await prisma.userGroupMembership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (existingMembership) {
      return res.status(409).json({ error: "User is already a member of this group" });
    }

    const membership = await prisma.userGroupMembership.create({
      data: { userId, groupId },
    });

    res.status(201).json({ success: true, membership });
  } catch (error) {
    console.error("Error adding member:", error);
    res.status(500).json({ error: "Failed to add member" });
  }
};

export const removeMember = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const groupId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    if (isNaN(groupId) || isNaN(userId)) {
      return res.status(400).json({ error: "Invalid group or user ID" });
    }

    const membership = await prisma.userGroupMembership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!membership) {
      return res.status(404).json({ error: "Membership not found" });
    }

    await prisma.userGroupMembership.delete({
      where: { userId_groupId: { userId, groupId } },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ error: "Failed to remove member" });
  }
};

// User-facing: get groups the current user belongs to
export const getUserGroups = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const memberships = await prisma.userGroupMembership.findMany({
      where: { userId: req.user.id },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    res.json({
      groups: memberships.map((m) => m.group),
    });
  } catch (error) {
    console.error("Error getting user groups:", error);
    res.status(500).json({ error: "Failed to get user groups" });
  }
};
```

**Step 4: Create the routes file**

Create `server/routes/groups.ts`:

```typescript
import { Router } from "express";
import { authenticate, requireAdmin, authenticated } from "../middleware/auth.js";
import {
  getAllGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addMember,
  removeMember,
  getUserGroups,
} from "../controllers/groups.js";

const router = Router();

router.use(authenticate);

// Admin routes
router.get("/", requireAdmin, authenticated(getAllGroups));
router.get("/:id", requireAdmin, authenticated(getGroup));
router.post("/", requireAdmin, authenticated(createGroup));
router.put("/:id", requireAdmin, authenticated(updateGroup));
router.delete("/:id", requireAdmin, authenticated(deleteGroup));

// Membership management
router.post("/:id/members", requireAdmin, authenticated(addMember));
router.delete("/:id/members/:userId", requireAdmin, authenticated(removeMember));

// User-facing route
router.get("/user/mine", authenticated(getUserGroups));

export default router;
```

**Step 5: Register the routes**

Modify `server/initializers/api.ts` - add after the user routes import:

```typescript
import groupRoutes from "../routes/groups.js";
```

And add in the route registration section:

```typescript
app.use("/api/groups", groupRoutes);
```

**Step 6: Run tests to verify they pass**

Run: `cd server && npm test -- groups.test.ts`

Expected: All tests PASS

**Step 7: Commit**

```bash
git add server/controllers/groups.ts server/routes/groups.ts server/initializers/api.ts server/tests/controllers/groups.test.ts
git commit -m "$(cat <<'EOF'
feat(api): add group CRUD endpoints

Admin endpoints:
- GET /api/groups - list all groups with member counts
- GET /api/groups/:id - get group with members
- POST /api/groups - create group
- PUT /api/groups/:id - update group
- DELETE /api/groups/:id - delete group
- POST /api/groups/:id/members - add user to group
- DELETE /api/groups/:id/members/:userId - remove user from group

User endpoint:
- GET /api/groups/user/mine - get current user's groups (for sharing UI)

Part of #319

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add User Permissions Endpoint

**Files:**
- Modify: `server/controllers/user.ts`
- Modify: `server/routes/user.ts`

**Step 1: Add permissions endpoint to user controller**

Add to `server/controllers/user.ts`:

```typescript
import { resolveUserPermissions } from "../services/PermissionService.js";

export const getUserPermissions = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const permissions = await resolveUserPermissions(req.user.id);

    if (!permissions) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ permissions });
  } catch (error) {
    console.error("Error getting user permissions:", error);
    res.status(500).json({ error: "Failed to get permissions" });
  }
};

// Admin endpoint to get any user's permissions
export const getAnyUserPermissions = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const permissions = await resolveUserPermissions(userId);

    if (!permissions) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ permissions });
  } catch (error) {
    console.error("Error getting user permissions:", error);
    res.status(500).json({ error: "Failed to get permissions" });
  }
};

// Admin endpoint to update user permission overrides
export const updateUserPermissionOverrides = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const { canShareOverride, canDownloadFilesOverride, canDownloadPlaylistsOverride } =
      req.body;

    // Validate values (must be boolean or null)
    const validateOverride = (value: unknown): boolean | null | undefined => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      if (typeof value === "boolean") return value;
      throw new Error("Invalid override value");
    };

    try {
      const updates: Record<string, boolean | null> = {};

      const shareOverride = validateOverride(canShareOverride);
      if (shareOverride !== undefined) updates.canShareOverride = shareOverride;

      const filesOverride = validateOverride(canDownloadFilesOverride);
      if (filesOverride !== undefined) updates.canDownloadFilesOverride = filesOverride;

      const playlistsOverride = validateOverride(canDownloadPlaylistsOverride);
      if (playlistsOverride !== undefined) updates.canDownloadPlaylistsOverride = playlistsOverride;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid updates provided" });
      }

      await prisma.user.update({
        where: { id: userId },
        data: updates,
      });

      // Return updated permissions
      const permissions = await resolveUserPermissions(userId);
      res.json({ success: true, permissions });
    } catch {
      return res.status(400).json({ error: "Invalid override value - must be true, false, or null" });
    }
  } catch (error) {
    console.error("Error updating permission overrides:", error);
    res.status(500).json({ error: "Failed to update permission overrides" });
  }
};
```

**Step 2: Add routes**

Add to `server/routes/user.ts`:

```typescript
import { getUserPermissions, getAnyUserPermissions, updateUserPermissionOverrides } from "../controllers/user.js";

// User's own permissions
router.get("/permissions", authenticated(getUserPermissions));

// Admin: get/update any user's permissions
router.get("/:userId/permissions", requireAdmin, authenticated(getAnyUserPermissions));
router.put("/:userId/permissions", requireAdmin, authenticated(updateUserPermissionOverrides));
```

**Step 3: Run the linter**

Run: `cd server && npm run lint`

Expected: No errors

**Step 4: Commit**

```bash
git add server/controllers/user.ts server/routes/user.ts
git commit -m "$(cat <<'EOF'
feat(api): add user permission endpoints

- GET /api/user/permissions - get current user's resolved permissions
- GET /api/user/:userId/permissions - admin get any user's permissions
- PUT /api/user/:userId/permissions - admin update permission overrides

Overrides can be true (force enable), false (force disable), or null (inherit from groups).

Part of #319

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend API Service

**Files:**
- Modify: `client/src/services/api.js`

**Step 1: Add group and permission API methods**

Add to `client/src/services/api.js` in the appropriate section:

```javascript
// ============================================================================
// Groups API
// ============================================================================

// Admin: Get all groups
export const getGroups = () => api.get("/groups");

// Admin: Get single group with members
export const getGroup = (groupId) => api.get(`/groups/${groupId}`);

// Admin: Create group
export const createGroup = (data) => api.post("/groups", data);

// Admin: Update group
export const updateGroup = (groupId, data) => api.put(`/groups/${groupId}`, data);

// Admin: Delete group
export const deleteGroup = (groupId) => api.delete(`/groups/${groupId}`);

// Admin: Add user to group
export const addGroupMember = (groupId, userId) =>
  api.post(`/groups/${groupId}/members`, { userId });

// Admin: Remove user from group
export const removeGroupMember = (groupId, userId) =>
  api.delete(`/groups/${groupId}/members/${userId}`);

// User: Get my groups (for sharing UI)
export const getMyGroups = () => api.get("/groups/user/mine");

// ============================================================================
// Permissions API
// ============================================================================

// User: Get my resolved permissions
export const getMyPermissions = () => api.get("/user/permissions");

// Admin: Get any user's resolved permissions
export const getUserPermissions = (userId) => api.get(`/user/${userId}/permissions`);

// Admin: Update user permission overrides
export const updateUserPermissionOverrides = (userId, overrides) =>
  api.put(`/user/${userId}/permissions`, overrides);
```

**Step 2: Run the linter**

Run: `cd client && npm run lint`

Expected: No errors

**Step 3: Commit**

```bash
git add client/src/services/api.js
git commit -m "$(cat <<'EOF'
feat(client): add group and permission API methods

Group methods for admin:
- getGroups, getGroup, createGroup, updateGroup, deleteGroup
- addGroupMember, removeGroupMember

User methods:
- getMyGroups (for sharing UI)
- getMyPermissions, getUserPermissions, updateUserPermissionOverrides

Part of #319

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Admin UI - Groups List Tab

**Files:**
- Create: `client/src/components/settings/tabs/GroupsTab.jsx`
- Modify: `client/src/components/pages/SettingsPage.jsx`

**Step 1: Create the GroupsTab component**

Create `client/src/components/settings/tabs/GroupsTab.jsx`:

```jsx
import { useState, useEffect } from "react";
import Paper from "../../ui/Paper";
import Button from "../../ui/Button";
import { getGroups, deleteGroup } from "../../../services/api";
import GroupModal from "../GroupModal";
import { Users, Edit2, Trash2, Shield, Download, Share2 } from "lucide-react";

const GroupsTab = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getGroups();
      setGroups(response.data.groups || []);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load groups");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCreate = () => {
    setEditingGroup(null);
    setShowModal(true);
  };

  const handleEdit = (group) => {
    setEditingGroup(group);
    setShowModal(true);
  };

  const handleDelete = async (group) => {
    if (
      !confirm(
        `Delete group "${group.name}"? Members will lose permissions granted by this group.`
      )
    ) {
      return;
    }

    try {
      await deleteGroup(group.id);
      showMessage(`Group "${group.name}" deleted`);
      loadGroups();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete group");
    }
  };

  const handleModalClose = (saved) => {
    setShowModal(false);
    setEditingGroup(null);
    if (saved) {
      loadGroups();
      showMessage(editingGroup ? "Group updated" : "Group created");
    }
  };

  const PermissionBadge = ({ enabled, icon: Icon, label }) => (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
      style={{
        backgroundColor: enabled
          ? "rgba(34, 197, 94, 0.15)"
          : "rgba(100, 100, 100, 0.15)",
        color: enabled ? "rgb(34, 197, 94)" : "var(--text-secondary)",
      }}
      title={label}
    >
      <Icon size={12} />
    </span>
  );

  if (loading) {
    return (
      <Paper>
        <Paper.Body>
          <p className="text-center py-8" style={{ color: "var(--text-secondary)" }}>
            Loading groups...
          </p>
        </Paper.Body>
      </Paper>
    );
  }

  return (
    <div>
      {message && (
        <div
          className="mb-6 p-4 rounded-lg"
          style={{ backgroundColor: "rgba(34, 197, 94, 0.1)", color: "rgb(34, 197, 94)" }}
        >
          {message}
        </div>
      )}

      {error && (
        <div
          className="mb-6 p-4 rounded-lg"
          style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "rgb(239, 68, 68)" }}
        >
          {error}
        </div>
      )}

      <Paper>
        <Paper.Header>
          <div className="flex justify-between items-center">
            <div>
              <Paper.Title>User Groups</Paper.Title>
              <Paper.Subtitle>
                Manage groups for permission inheritance and playlist sharing
              </Paper.Subtitle>
            </div>
            <Button onClick={handleCreate} variant="primary">
              + Create Group
            </Button>
          </div>
        </Paper.Header>

        <Paper.Body padding="none">
          {groups.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Users size={48} className="mx-auto mb-4" style={{ color: "var(--text-secondary)" }} />
              <p style={{ color: "var(--text-secondary)" }}>
                No groups yet. Create a group to enable sharing and permission inheritance.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: "700px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <th className="text-left px-6 py-4 font-medium">Name</th>
                    <th className="text-left px-6 py-4 font-medium">Description</th>
                    <th className="text-center px-6 py-4 font-medium">Members</th>
                    <th className="text-center px-6 py-4 font-medium">Permissions</th>
                    <th className="text-right px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr
                      key={group.id}
                      style={{ borderBottom: "1px solid var(--border-color)" }}
                    >
                      <td className="px-6 py-4 font-medium">{group.name}</td>
                      <td
                        className="px-6 py-4"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {group.description || "—"}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm"
                          style={{ backgroundColor: "var(--bg-tertiary)" }}
                        >
                          <Users size={14} />
                          {group.memberCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-1.5">
                          <PermissionBadge
                            enabled={group.canShare}
                            icon={Share2}
                            label="Can share playlists"
                          />
                          <PermissionBadge
                            enabled={group.canDownloadFiles}
                            icon={Download}
                            label="Can download files"
                          />
                          <PermissionBadge
                            enabled={group.canDownloadPlaylists}
                            icon={Shield}
                            label="Can download playlists"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(group)}
                            className="p-2 rounded hover:bg-white/10 transition-colors"
                            title="Edit group"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(group)}
                            className="p-2 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                            title="Delete group"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Paper.Body>
      </Paper>

      {showModal && (
        <GroupModal group={editingGroup} onClose={handleModalClose} />
      )}
    </div>
  );
};

export default GroupsTab;
```

**Step 2: Add to SettingsPage**

Modify `client/src/components/pages/SettingsPage.jsx` - add to SERVER_TABS:

```javascript
{ id: "groups", label: "Groups" },
```

And add the tab content rendering (in the switch or conditional):

```jsx
import GroupsTab from "../settings/tabs/GroupsTab";

// In the render section where tabs are conditionally shown:
{activeTab === "groups" && <GroupsTab />}
```

**Step 3: Run the linter**

Run: `cd client && npm run lint`

Expected: No errors (or only the expected missing GroupModal warning)

**Step 4: Commit**

```bash
git add client/src/components/settings/tabs/GroupsTab.jsx client/src/components/pages/SettingsPage.jsx
git commit -m "$(cat <<'EOF'
feat(ui): add Groups tab to server settings

- Lists all groups with member counts
- Shows permission badges (share, download files, download playlists)
- Create/edit/delete buttons
- Empty state with helpful message

Part of #319

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Admin UI - Group Modal (Create/Edit)

**Files:**
- Create: `client/src/components/settings/GroupModal.jsx`

**Step 1: Create the GroupModal component**

Create `client/src/components/settings/GroupModal.jsx`:

```jsx
import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { createGroup, updateGroup, getGroup, addGroupMember, removeGroupMember } from "../../services/api";
import { Users, X } from "lucide-react";

const GroupModal = ({ group, onClose }) => {
  const [name, setName] = useState(group?.name || "");
  const [description, setDescription] = useState(group?.description || "");
  const [canShare, setCanShare] = useState(group?.canShare || false);
  const [canDownloadFiles, setCanDownloadFiles] = useState(group?.canDownloadFiles || false);
  const [canDownloadPlaylists, setCanDownloadPlaylists] = useState(group?.canDownloadPlaylists || false);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(!!group);
  const [error, setError] = useState(null);

  const isEditing = !!group;

  useEffect(() => {
    if (group) {
      loadGroupDetails();
    }
  }, [group]);

  const loadGroupDetails = async () => {
    try {
      setLoadingMembers(true);
      const response = await getGroup(group.id);
      setMembers(response.data.group.members || []);
    } catch (err) {
      console.error("Failed to load group members:", err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Group name is required");
      return;
    }

    setLoading(true);

    try {
      const data = {
        name: name.trim(),
        description: description.trim() || null,
        canShare,
        canDownloadFiles,
        canDownloadPlaylists,
      };

      if (isEditing) {
        await updateGroup(group.id, data);
      } else {
        await createGroup(data);
      }

      onClose(true);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save group");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId, username) => {
    if (!confirm(`Remove ${username} from this group?`)) return;

    try {
      await removeGroupMember(group.id, userId);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch (err) {
      setError(err.response?.data?.error || "Failed to remove member");
    }
  };

  const PermissionToggle = ({ label, description, checked, onChange }) => (
    <label className="flex items-start gap-3 cursor-pointer py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-4 h-4 rounded"
      />
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {description}
        </div>
      </div>
    </label>
  );

  return (
    <Modal onClose={() => onClose(false)}>
      <Modal.Header>
        <Modal.Title>{isEditing ? `Edit Group: ${group.name}` : "Create Group"}</Modal.Title>
      </Modal.Header>

      <form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && (
            <div
              className="mb-4 p-3 rounded-lg text-sm"
              style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "rgb(239, 68, 68)" }}
            >
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
                placeholder="e.g., Family, Friends"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
                placeholder="Optional description"
              />
            </div>

            {/* Permissions */}
            <div>
              <label className="block text-sm font-medium mb-2">Default Permissions</label>
              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <PermissionToggle
                  label="Can share playlists"
                  description="Members can share their playlists with other groups"
                  checked={canShare}
                  onChange={setCanShare}
                />
                <PermissionToggle
                  label="Can download files"
                  description="Members can download individual scenes and images"
                  checked={canDownloadFiles}
                  onChange={setCanDownloadFiles}
                />
                <PermissionToggle
                  label="Can download playlists"
                  description="Members can download entire playlists as zip files"
                  checked={canDownloadPlaylists}
                  onChange={setCanDownloadPlaylists}
                />
              </div>
            </div>

            {/* Members (only when editing) */}
            {isEditing && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Members ({members.length})
                </label>
                <div
                  className="rounded-lg p-3 max-h-48 overflow-y-auto"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  {loadingMembers ? (
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Loading members...
                    </p>
                  ) : members.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      No members yet. Add members from the User Management tab.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/5"
                        >
                          <div className="flex items-center gap-2">
                            <Users size={14} style={{ color: "var(--text-secondary)" }} />
                            <span>{member.username}</span>
                            {member.role === "ADMIN" && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: "rgba(59, 130, 246, 0.2)", color: "rgb(59, 130, 246)" }}
                              >
                                Admin
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.id, member.username)}
                            className="p-1 rounded hover:bg-red-500/20 text-red-400"
                            title="Remove from group"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Modal.Body>

        <Modal.Footer>
          <Button type="button" variant="secondary" onClick={() => onClose(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? "Saving..." : isEditing ? "Save Changes" : "Create Group"}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
};

export default GroupModal;
```

**Step 2: Run the linter**

Run: `cd client && npm run lint`

Expected: No errors

**Step 3: Test manually**

Run: `docker-compose up --build -d && docker-compose logs -f peek-client`

Navigate to Settings > Server > Groups tab and verify:
- Create group button opens modal
- Can fill in name, description, permissions
- Save creates group and shows in list
- Edit opens modal with existing values
- Delete prompts and removes group

**Step 4: Commit**

```bash
git add client/src/components/settings/GroupModal.jsx
git commit -m "$(cat <<'EOF'
feat(ui): add GroupModal for create/edit groups

- Name and description fields
- Permission toggles with descriptions
- Member list when editing (with remove button)
- Validation and error handling

Part of #319

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: User Management - Add Group Membership UI

**Files:**
- Modify: `client/src/components/settings/UserManagementSection.jsx`

**Step 1: Add group membership to user row**

Modify `client/src/components/settings/UserManagementSection.jsx` to:

1. Fetch groups on mount
2. Show group tags on each user row
3. Add "Manage Groups" button that opens a modal to toggle group memberships

This involves adding:

```jsx
// Add imports
import { getGroups, addGroupMember, removeGroupMember } from "../../services/api";

// Add state
const [groups, setGroups] = useState([]);
const [groupModalUser, setGroupModalUser] = useState(null);

// Load groups on mount
useEffect(() => {
  loadGroups();
}, []);

const loadGroups = async () => {
  try {
    const response = await getGroups();
    setGroups(response.data.groups || []);
  } catch (err) {
    console.error("Failed to load groups:", err);
  }
};

// Add column header for Groups
<th className="text-left px-6 py-4">Groups</th>

// Add cell showing user's groups
<td className="px-6 py-4">
  <div className="flex flex-wrap gap-1">
    {user.groups?.map((g) => (
      <span
        key={g.id}
        className="text-xs px-2 py-0.5 rounded-full"
        style={{ backgroundColor: "var(--bg-tertiary)" }}
      >
        {g.name}
      </span>
    )) || "—"}
  </div>
</td>

// Add button in actions
<button onClick={() => setGroupModalUser(user)} title="Manage groups">
  <Users size={16} />
</button>

// Add modal for group management
{groupModalUser && (
  <UserGroupsModal
    user={groupModalUser}
    groups={groups}
    onClose={() => {
      setGroupModalUser(null);
      loadUsers(); // Refresh to show updated groups
    }}
  />
)}
```

**Step 2: Update the user fetch to include groups**

Modify the backend `getAllUsers` in `server/controllers/user.ts` to include group memberships:

```typescript
const users = await prisma.user.findMany({
  select: {
    id: true,
    username: true,
    role: true,
    syncToStash: true,
    createdAt: true,
    updatedAt: true,
    groupMemberships: {
      select: {
        group: {
          select: { id: true, name: true },
        },
      },
    },
  },
  orderBy: { createdAt: "desc" },
});

res.json({
  users: users.map((u) => ({
    ...u,
    groups: u.groupMemberships.map((m) => m.group),
    groupMemberships: undefined,
  })),
});
```

**Step 3: Create UserGroupsModal**

Create `client/src/components/settings/UserGroupsModal.jsx`:

```jsx
import { useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { addGroupMember, removeGroupMember } from "../../services/api";

const UserGroupsModal = ({ user, groups, onClose }) => {
  const [userGroups, setUserGroups] = useState(
    new Set(user.groups?.map((g) => g.id) || [])
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleToggle = async (groupId, groupName) => {
    setLoading(true);
    setError(null);

    try {
      if (userGroups.has(groupId)) {
        await removeGroupMember(groupId, user.id);
        setUserGroups((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
      } else {
        await addGroupMember(groupId, user.id);
        setUserGroups((prev) => new Set([...prev, groupId]));
      }
    } catch (err) {
      setError(err.response?.data?.error || `Failed to update ${groupName} membership`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <Modal.Header>
        <Modal.Title>Manage Groups: {user.username}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {error && (
          <div
            className="mb-4 p-3 rounded-lg text-sm"
            style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "rgb(239, 68, 68)" }}
          >
            {error}
          </div>
        )}

        {groups.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>
            No groups exist. Create groups in the Groups tab first.
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <label
                key={group.id}
                className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-white/5"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <input
                  type="checkbox"
                  checked={userGroups.has(group.id)}
                  onChange={() => handleToggle(group.id, group.name)}
                  disabled={loading}
                  className="w-4 h-4 rounded"
                />
                <div className="flex-1">
                  <div className="font-medium">{group.name}</div>
                  {group.description && (
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      {group.description}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default UserGroupsModal;
```

**Step 4: Run the linter**

Run: `cd client && npm run lint && cd ../server && npm run lint`

Expected: No errors

**Step 5: Commit**

```bash
git add client/src/components/settings/UserManagementSection.jsx client/src/components/settings/UserGroupsModal.jsx server/controllers/user.ts
git commit -m "$(cat <<'EOF'
feat(ui): add group membership management to user list

- User list now shows group tags for each user
- "Manage groups" button opens modal to toggle memberships
- Checkboxes update membership immediately via API
- Backend getAllUsers now includes group memberships

Part of #319

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Integration Test

**Files:**
- Modify: `server/integration/groups.integration.test.ts` (create if needed)

**Step 1: Write integration test**

Create `server/integration/groups.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../initializers/api.js";
import prisma from "../prisma/singleton.js";

describe("Groups Integration", () => {
  let adminToken: string;
  let testGroupId: number;

  beforeAll(async () => {
    // Login as admin
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: process.env.TEST_ADMIN_PASSWORD });

    adminToken = loginRes.headers["set-cookie"]?.[0] || "";
  });

  afterAll(async () => {
    // Cleanup test group
    if (testGroupId) {
      await prisma.userGroup.delete({ where: { id: testGroupId } }).catch(() => {});
    }
  });

  it("should create a group", async () => {
    const res = await request(app)
      .post("/api/groups")
      .set("Cookie", adminToken)
      .send({
        name: "Test Group",
        description: "Integration test group",
        canShare: true,
        canDownloadFiles: false,
        canDownloadPlaylists: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.group.name).toBe("Test Group");
    expect(res.body.group.canShare).toBe(true);
    testGroupId = res.body.group.id;
  });

  it("should list groups", async () => {
    const res = await request(app)
      .get("/api/groups")
      .set("Cookie", adminToken);

    expect(res.status).toBe(200);
    expect(res.body.groups).toBeInstanceOf(Array);
    expect(res.body.groups.some((g: { name: string }) => g.name === "Test Group")).toBe(true);
  });

  it("should update a group", async () => {
    const res = await request(app)
      .put(`/api/groups/${testGroupId}`)
      .set("Cookie", adminToken)
      .send({ canDownloadFiles: true });

    expect(res.status).toBe(200);
    expect(res.body.group.canDownloadFiles).toBe(true);
  });

  it("should delete a group", async () => {
    const res = await request(app)
      .delete(`/api/groups/${testGroupId}`)
      .set("Cookie", adminToken);

    expect(res.status).toBe(200);
    testGroupId = 0; // Mark as deleted
  });
});
```

**Step 2: Run integration tests**

Run: `cd server && npm run test:integration`

Expected: All tests PASS

**Step 3: Commit**

```bash
git add server/integration/groups.integration.test.ts
git commit -m "$(cat <<'EOF'
test: add groups integration tests

Tests CRUD operations for user groups:
- Create group with permissions
- List groups
- Update group permissions
- Delete group

Part of #319

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Final Verification and Cleanup

**Step 1: Run all tests**

Run: `cd server && npm test && npm run lint`

Expected: All tests pass, no lint errors

**Step 2: Run client linter**

Run: `cd client && npm run lint`

Expected: No lint errors

**Step 3: Manual testing checklist**

- [ ] Create a new group with all permissions enabled
- [ ] Edit the group to change permissions
- [ ] Add a user to the group via User Management
- [ ] Verify user's group shows in user list
- [ ] Remove user from group
- [ ] Delete the group
- [ ] Verify no orphan memberships remain

**Step 4: Create feature branch and final commit**

```bash
git checkout -b feature/319-user-groups
git push -u origin feature/319-user-groups
```

---

## Summary

This plan implements User Groups (#319) as the foundation for v3.3's sharing and permission features:

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Database schema | `schema.prisma` |
| 2 | Permission service | `PermissionService.ts` |
| 3 | Group CRUD API | `groups.ts` controller + routes |
| 4 | User permissions API | `user.ts` endpoints |
| 5 | Frontend API service | `api.js` |
| 6 | Groups list UI | `GroupsTab.jsx` |
| 7 | Group modal | `GroupModal.jsx` |
| 8 | User membership UI | `UserGroupsModal.jsx` |
| 9 | Integration tests | `groups.integration.test.ts` |
| 10 | Verification | Manual testing |

The implementation follows existing patterns found in the codebase and sets up the permission inheritance system that Downloads (#295) and Playlist Sharing (#294) will build upon.
