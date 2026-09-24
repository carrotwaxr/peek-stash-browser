import type { Prisma } from "@prisma/client";
import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addMember,
  createGroup,
  deleteGroup,
  getAllGroups,
  getGroup,
  getUserGroups,
  removeMember,
  updateGroup,
} from "../../controllers/groups.js";
import prisma from "../../prisma/singleton.js";
import {
  authReq,
  malformed,
  testUser,
} from "../helpers/controllerTestUtils.js";
import { type MembershipWithGroup } from "../helpers/fixtures.js";
import { partialRow } from "../helpers/prismaMock.js";

type GroupWithMemberCount = Prisma.UserGroupGetPayload<{
  include: { _count: { select: { members: true } } };
}>;
type GroupWithMembers = Prisma.UserGroupGetPayload<{
  include: { members: { include: { user: true } } };
}>;

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const mockPrisma = vi.mocked(prisma, true);

describe("Groups Controller", () => {
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
      await getAllGroups(
        authReq({ user: testUser({ id: 1, role: "USER" }) }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return all groups with member counts", async () => {
      mockPrisma.userGroup.findMany.mockResolvedValue([
        partialRow<GroupWithMemberCount>({
          id: 1,
          name: "Family",
          description: "Family members",
          canShare: true,
          canDownloadFiles: false,
          canDownloadPlaylists: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { members: 3 },
        }),
      ]);

      await getAllGroups(
        authReq({ user: testUser({ id: 1, role: "ADMIN" }) }),
        mockResponse as Response
      );

      expect(responseJson).toHaveBeenCalledWith({
        groups: expect.arrayContaining([
          expect.objectContaining({ name: "Family", memberCount: 3 }),
        ]),
      });
    });
  });

  describe("getGroup", () => {
    it("should return 403 if user is not admin", async () => {
      await getGroup(
        authReq({
          user: testUser({ id: 1, role: "USER" }),
          params: { id: "1" },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return 404 if group not found", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);

      await getGroup(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "999" },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(404);
    });

    it("should return group with members containing nested user objects", async () => {
      const createdAt = new Date();
      mockPrisma.userGroup.findUnique.mockResolvedValue(
        partialRow<GroupWithMembers>({
          id: 1,
          name: "Family",
          description: "Family members",
          canShare: true,
          canDownloadFiles: false,
          canDownloadPlaylists: false,
          createdAt,
          updatedAt: createdAt,
          members: [
            partialRow({
              id: 1,
              userId: 2,
              groupId: 1,
              createdAt,
              user: partialRow({ id: 2, username: "user1", role: "USER" }),
            }),
          ],
        })
      );

      await getGroup(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1" },
        }),
        mockResponse as Response
      );

      expect(responseJson).toHaveBeenCalledWith({
        group: expect.objectContaining({
          name: "Family",
          members: [
            expect.objectContaining({
              id: 1,
              user: { id: 2, username: "user1", role: "USER" },
              joinedAt: createdAt,
            }),
          ],
        }),
      });
    });
  });

  describe("createGroup", () => {
    it("should return 403 if user is not admin", async () => {
      await createGroup(
        authReq({
          user: testUser({ id: 1, role: "USER" }),
          body: { name: "Test" },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return 400 if name is missing", async () => {
      await createGroup(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          body: malformed({}),
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
    });

    it("should return 409 if name already exists", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(partialRow({ id: 1 }));

      await createGroup(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          body: { name: "Family" },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(409);
    });

    it("should create group with permissions", async () => {
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
      });

      await createGroup(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          body: {
            name: "Friends",
            description: "Close friends",
            canShare: true,
            canDownloadFiles: true,
          },
        }),
        mockResponse as Response
      );

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
      await updateGroup(
        authReq({
          user: testUser({ id: 1, role: "USER" }),
          params: { id: "1" },
          body: { name: "Updated" },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return 404 if group not found", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);

      await updateGroup(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "999" },
          body: { name: "Updated" },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(404);
    });

    it("should update group", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          name: "Family",
        })
      );
      mockPrisma.userGroup.update.mockResolvedValue({
        id: 1,
        name: "Updated Family",
        description: null,
        canShare: true,
        canDownloadFiles: false,
        canDownloadPlaylists: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await updateGroup(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1" },
          body: { name: "Updated Family", canShare: true },
        }),
        mockResponse as Response
      );

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
      await deleteGroup(
        authReq({
          user: testUser({ id: 1, role: "USER" }),
          params: { id: "1" },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return 404 if group not found", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);

      await deleteGroup(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "999" },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(404);
    });

    it("should delete group by id", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          name: "Family",
        })
      );
      mockPrisma.userGroup.delete.mockResolvedValue(partialRow({ id: 1 }));

      await deleteGroup(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1" },
        }),
        mockResponse as Response
      );

      expect(mockPrisma.userGroup.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(responseJson).toHaveBeenCalledWith({ success: true });
    });
  });

  describe("addMember", () => {
    it("should return 403 if user is not admin", async () => {
      await addMember(
        authReq({
          user: testUser({ id: 1, role: "USER" }),
          params: { id: "1" },
          body: { userId: 2 },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return 404 if group not found", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);

      await addMember(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "999" },
          body: { userId: 2 },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(404);
    });

    it("should return 400 if userId is missing", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(partialRow({ id: 1 }));

      await addMember(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1" },
          body: malformed({}),
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
    });

    it("should add user to group", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(partialRow({ id: 1 }));
      mockPrisma.userGroupMembership.findUnique.mockResolvedValue(null);
      mockPrisma.userGroupMembership.create.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 2,
          groupId: 1,
        })
      );

      await addMember(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1" },
          body: { userId: 2 },
        }),
        mockResponse as Response
      );

      expect(mockPrisma.userGroupMembership.create).toHaveBeenCalledWith({
        data: { userId: 2, groupId: 1 },
      });
      expect(responseStatus).toHaveBeenCalledWith(201);
    });

    it("should return 409 if user already in group", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(partialRow({ id: 1 }));
      mockPrisma.userGroupMembership.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
        })
      );

      await addMember(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1" },
          body: { userId: 2 },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(409);
    });
  });

  describe("removeMember", () => {
    it("should return 403 if user is not admin", async () => {
      await removeMember(
        authReq({
          user: testUser({ id: 1, role: "USER" }),
          params: { id: "1", userId: "2" },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
    });

    it("should return 404 if membership not found", async () => {
      mockPrisma.userGroupMembership.findUnique.mockResolvedValue(null);

      await removeMember(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1", userId: "2" },
        }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(404);
    });

    it("should remove user from group", async () => {
      mockPrisma.userGroupMembership.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
        })
      );
      mockPrisma.userGroupMembership.delete.mockResolvedValue(
        partialRow({
          id: 1,
        })
      );

      await removeMember(
        authReq({
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1", userId: "2" },
        }),
        mockResponse as Response
      );

      expect(mockPrisma.userGroupMembership.delete).toHaveBeenCalled();
      expect(responseJson).toHaveBeenCalledWith({ success: true });
    });
  });

  describe("getUserGroups", () => {
    it("should return 401 if user is not authenticated", async () => {
      await getUserGroups(
        authReq({ user: undefined }),
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({ error: "User not found" });
    });

    it("should return user's groups when authenticated", async () => {
      mockPrisma.userGroupMembership.findMany.mockResolvedValue([
        partialRow<MembershipWithGroup>({
          id: 1,
          userId: 2,
          groupId: 1,
          createdAt: new Date(),
          group: partialRow({
            id: 1,
            name: "Family",
            description: "Family members",
            canShare: true,
            canDownloadFiles: false,
            canDownloadPlaylists: false,
          }),
        }),
        partialRow<MembershipWithGroup>({
          id: 2,
          userId: 2,
          groupId: 2,
          createdAt: new Date(),
          group: partialRow({
            id: 2,
            name: "Friends",
            description: null,
            canShare: false,
            canDownloadFiles: true,
            canDownloadPlaylists: true,
          }),
        }),
      ]);

      await getUserGroups(
        authReq({ user: testUser({ id: 2, role: "USER" }) }),
        mockResponse as Response
      );

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
