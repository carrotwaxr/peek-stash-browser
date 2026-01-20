/**
 * Groups Controller
 *
 * Handles CRUD operations for user groups and group membership.
 * Admin-only for management operations, with a user-facing endpoint
 * to get their own group memberships.
 */
import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";
import prisma from "../prisma/singleton.js";

/**
 * Get all groups with member counts (admin only)
 */
export const getAllGroups = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const groups = await prisma.userGroup.findMany({
    include: {
      _count: {
        select: { members: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return res.json({
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      canShare: group.canShare,
      canDownloadFiles: group.canDownloadFiles,
      canDownloadPlaylists: group.canDownloadPlaylists,
      memberCount: group._count.members,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    })),
  });
};

/**
 * Get single group with members (admin only)
 */
export const getGroup = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const groupId = parseInt(req.params.id, 10);
  if (isNaN(groupId)) {
    return res.status(400).json({ error: "Invalid group ID" });
  }

  const group = await prisma.userGroup.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              role: true,
            },
          },
        },
      },
    },
  });

  if (!group) {
    return res.status(404).json({ error: "Group not found" });
  }

  return res.json({
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      canShare: group.canShare,
      canDownloadFiles: group.canDownloadFiles,
      canDownloadPlaylists: group.canDownloadPlaylists,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      members: group.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        username: m.user.username,
        role: m.user.role,
        joinedAt: m.createdAt,
      })),
    },
  });
};

/**
 * Create a new group (admin only)
 */
export const createGroup = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const { name, description, canShare, canDownloadFiles, canDownloadPlaylists } =
    req.body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ error: "Group name is required" });
  }

  // Check if name already exists
  const existing = await prisma.userGroup.findUnique({
    where: { name: name.trim() },
  });

  if (existing) {
    return res.status(409).json({ error: "A group with this name already exists" });
  }

  const group = await prisma.userGroup.create({
    data: {
      name: name.trim(),
      description: description || null,
      canShare: canShare === true,
      canDownloadFiles: canDownloadFiles === true,
      canDownloadPlaylists: canDownloadPlaylists === true,
    },
  });

  return res.status(201).json({ group });
};

/**
 * Update a group (admin only)
 */
export const updateGroup = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const groupId = parseInt(req.params.id, 10);
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

  // Build update data, only including provided fields
  const updateData: {
    name?: string;
    description?: string | null;
    canShare?: boolean;
    canDownloadFiles?: boolean;
    canDownloadPlaylists?: boolean;
  } = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ error: "Group name cannot be empty" });
    }
    updateData.name = name.trim();
  }

  if (description !== undefined) {
    updateData.description = description || null;
  }

  if (canShare !== undefined) {
    updateData.canShare = canShare === true;
  }

  if (canDownloadFiles !== undefined) {
    updateData.canDownloadFiles = canDownloadFiles === true;
  }

  if (canDownloadPlaylists !== undefined) {
    updateData.canDownloadPlaylists = canDownloadPlaylists === true;
  }

  const group = await prisma.userGroup.update({
    where: { id: groupId },
    data: updateData,
  });

  return res.json({ group });
};

/**
 * Delete a group (admin only)
 */
export const deleteGroup = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const groupId = parseInt(req.params.id, 10);
  if (isNaN(groupId)) {
    return res.status(400).json({ error: "Invalid group ID" });
  }

  const existing = await prisma.userGroup.findUnique({
    where: { id: groupId },
  });

  if (!existing) {
    return res.status(404).json({ error: "Group not found" });
  }

  await prisma.userGroup.delete({
    where: { id: groupId },
  });

  return res.json({ success: true });
};

/**
 * Add a user to a group (admin only)
 */
export const addMember = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const groupId = parseInt(req.params.id, 10);
  if (isNaN(groupId)) {
    return res.status(400).json({ error: "Invalid group ID" });
  }

  const group = await prisma.userGroup.findUnique({
    where: { id: groupId },
  });

  if (!group) {
    return res.status(404).json({ error: "Group not found" });
  }

  const { userId } = req.body;
  if (!userId || typeof userId !== "number") {
    return res.status(400).json({ error: "User ID is required" });
  }

  // Check if membership already exists
  const existing = await prisma.userGroupMembership.findUnique({
    where: {
      userId_groupId: {
        userId,
        groupId,
      },
    },
  });

  if (existing) {
    return res.status(409).json({ error: "User is already a member of this group" });
  }

  const membership = await prisma.userGroupMembership.create({
    data: {
      userId,
      groupId,
    },
  });

  return res.status(201).json({ membership });
};

/**
 * Remove a user from a group (admin only)
 */
export const removeMember = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const groupId = parseInt(req.params.id, 10);
  const userId = parseInt(req.params.userId, 10);

  if (isNaN(groupId) || isNaN(userId)) {
    return res.status(400).json({ error: "Invalid group ID or user ID" });
  }

  const existing = await prisma.userGroupMembership.findUnique({
    where: {
      userId_groupId: {
        userId,
        groupId,
      },
    },
  });

  if (!existing) {
    return res.status(404).json({ error: "Membership not found" });
  }

  await prisma.userGroupMembership.delete({
    where: {
      userId_groupId: {
        userId,
        groupId,
      },
    },
  });

  return res.json({ success: true });
};

/**
 * Get the current user's groups (any authenticated user)
 * Used for sharing UI to show which groups the user belongs to.
 */
export const getUserGroups = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: "User not found" });
  }

  const memberships = await prisma.userGroupMembership.findMany({
    where: { userId: req.user.id },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          description: true,
          canShare: true,
          canDownloadFiles: true,
          canDownloadPlaylists: true,
        },
      },
    },
  });

  return res.json({
    groups: memberships.map((m) => m.group),
  });
};
