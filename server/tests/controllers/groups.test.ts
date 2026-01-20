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
      findMany: vi.fn(),
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
  getUserGroups,
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

  describe("getGroup", () => {
    it("should return 403 if user is not admin", async () => {
      mockRequest = { user: { id: 1, role: "USER" }, params: { id: "1" } };

      await getGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return 404 if group not found", async () => {
      mockRequest = { user: { id: 1, role: "ADMIN" }, params: { id: "999" } };
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);

      await getGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(404);
    });

    it("should return group with members", async () => {
      mockRequest = { user: { id: 1, role: "ADMIN" }, params: { id: "1" } };
      mockPrisma.userGroup.findUnique.mockResolvedValue({
        id: 1,
        name: "Family",
        description: "Family members",
        canShare: true,
        canDownloadFiles: false,
        canDownloadPlaylists: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [
          { id: 1, userId: 2, groupId: 1, user: { id: 2, username: "user1" } },
        ],
      } as never);

      await getGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseJson).toHaveBeenCalledWith({
        group: expect.objectContaining({
          name: "Family",
          members: expect.arrayContaining([
            expect.objectContaining({ userId: 2, username: "user1" }),
          ]),
        }),
      });
    });
  });

  describe("createGroup", () => {
    it("should return 403 if user is not admin", async () => {
      mockRequest = { user: { id: 1, role: "USER" }, body: { name: "Test" } };

      await createGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

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

  describe("updateGroup", () => {
    it("should return 403 if user is not admin", async () => {
      mockRequest = { user: { id: 1, role: "USER" }, params: { id: "1" }, body: { name: "Updated" } };

      await updateGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return 404 if group not found", async () => {
      mockRequest = { user: { id: 1, role: "ADMIN" }, params: { id: "999" }, body: { name: "Updated" } };
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);

      await updateGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(404);
    });

    it("should update group", async () => {
      mockRequest = {
        user: { id: 1, role: "ADMIN" },
        params: { id: "1" },
        body: { name: "Updated Family", canShare: true },
      };
      mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 1, name: "Family" } as never);
      mockPrisma.userGroup.update.mockResolvedValue({
        id: 1,
        name: "Updated Family",
        description: null,
        canShare: true,
        canDownloadFiles: false,
        canDownloadPlaylists: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      await updateGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.userGroup.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          name: "Updated Family",
          canShare: true,
        }),
      });
      expect(responseJson).toHaveBeenCalledWith({
        group: expect.objectContaining({ name: "Updated Family" }),
      });
    });
  });

  describe("deleteGroup", () => {
    it("should return 403 if user is not admin", async () => {
      mockRequest = { user: { id: 1, role: "USER" }, params: { id: "1" } };

      await deleteGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return 404 if group not found", async () => {
      mockRequest = { user: { id: 1, role: "ADMIN" }, params: { id: "999" } };
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);

      await deleteGroup(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(404);
    });

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
    it("should return 403 if user is not admin", async () => {
      mockRequest = {
        user: { id: 1, role: "USER" },
        params: { id: "1" },
        body: { userId: 2 },
      };

      await addMember(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return 404 if group not found", async () => {
      mockRequest = {
        user: { id: 1, role: "ADMIN" },
        params: { id: "999" },
        body: { userId: 2 },
      };
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);

      await addMember(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(404);
    });

    it("should return 400 if userId is missing", async () => {
      mockRequest = {
        user: { id: 1, role: "ADMIN" },
        params: { id: "1" },
        body: {},
      };
      mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 1 } as never);

      await addMember(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
    });

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
    it("should return 403 if user is not admin", async () => {
      mockRequest = {
        user: { id: 1, role: "USER" },
        params: { id: "1", userId: "2" },
      };

      await removeMember(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return 404 if membership not found", async () => {
      mockRequest = {
        user: { id: 1, role: "ADMIN" },
        params: { id: "1", userId: "2" },
      };
      mockPrisma.userGroupMembership.findUnique.mockResolvedValue(null);

      await removeMember(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(404);
    });

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

  describe("getUserGroups", () => {
    it("should return 401 if user is not authenticated", async () => {
      mockRequest = { user: undefined };

      await getUserGroups(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({ error: "User not found" });
    });

    it("should return user's groups when authenticated", async () => {
      mockRequest = { user: { id: 2, role: "USER" } };
      mockPrisma.userGroupMembership.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 2,
          groupId: 1,
          createdAt: new Date(),
          group: {
            id: 1,
            name: "Family",
            description: "Family members",
            canShare: true,
            canDownloadFiles: false,
            canDownloadPlaylists: false,
          },
        },
        {
          id: 2,
          userId: 2,
          groupId: 2,
          createdAt: new Date(),
          group: {
            id: 2,
            name: "Friends",
            description: null,
            canShare: false,
            canDownloadFiles: true,
            canDownloadPlaylists: true,
          },
        },
      ] as never);

      await getUserGroups(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.userGroupMembership.findMany).toHaveBeenCalledWith({
        where: { userId: 2 },
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
      expect(responseJson).toHaveBeenCalledWith({
        groups: [
          {
            id: 1,
            name: "Family",
            description: "Family members",
            canShare: true,
            canDownloadFiles: false,
            canDownloadPlaylists: false,
          },
          {
            id: 2,
            name: "Friends",
            description: null,
            canShare: false,
            canDownloadFiles: true,
            canDownloadPlaylists: true,
          },
        ],
      });
    });
  });
});
