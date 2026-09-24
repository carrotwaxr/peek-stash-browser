import type { Prisma } from "@prisma/client";
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
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../helpers/controllerTestUtils.js";
import { type MembershipWithGroup } from "../helpers/fixtures.js";
import { arrayContaining, objectContaining } from "../helpers/matchers.js";
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllGroups", () => {
    it("should return 403 if user is not admin", async () => {
      const res = resFor(getAllGroups);
      await getAllGroups(
        reqFor(getAllGroups, { user: testUser({ id: 1, role: "USER" }) }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
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

      const res = resFor(getAllGroups);
      await getAllGroups(
        reqFor(getAllGroups, { user: testUser({ id: 1, role: "ADMIN" }) }),
        res
      );

      expect(res.json).toHaveBeenCalledWith({
        groups: arrayContaining([
          expect.objectContaining({ name: "Family", memberCount: 3 }),
        ]),
      });
    });
  });

  describe("getGroup", () => {
    it("should return 403 if user is not admin", async () => {
      const res = resFor(getGroup);
      await getGroup(
        reqFor(getGroup, {
          user: testUser({ id: 1, role: "USER" }),
          params: { id: "1" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 if group not found", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);

      const res = resFor(getGroup);
      await getGroup(
        reqFor(getGroup, {
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "999" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(404);
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

      const res = resFor(getGroup);
      await getGroup(
        reqFor(getGroup, {
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1" },
        }),
        res
      );

      expect(res.json).toHaveBeenCalledWith({
        group: objectContaining({
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
      const res = resFor(createGroup);
      await createGroup(
        reqFor(createGroup, {
          user: testUser({ id: 1, role: "USER" }),
          body: { name: "Test" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 if name is missing", async () => {
      const res = resFor(createGroup);
      await createGroup(
        reqFor(createGroup, {
          user: testUser({ id: 1, role: "ADMIN" }),
          body: malformed({}),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 409 if name already exists", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(partialRow({ id: 1 }));

      const res = resFor(createGroup);
      await createGroup(
        reqFor(createGroup, {
          user: testUser({ id: 1, role: "ADMIN" }),
          body: { name: "Family" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(409);
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

      const res = resFor(createGroup);
      await createGroup(
        reqFor(createGroup, {
          user: testUser({ id: 1, role: "ADMIN" }),
          body: {
            name: "Friends",
            description: "Close friends",
            canShare: true,
            canDownloadFiles: true,
          },
        }),
        res
      );

      expect(mockPrisma.userGroup.create).toHaveBeenCalledWith({
        data: objectContaining({
          name: "Friends",
          canShare: true,
          canDownloadFiles: true,
        }),
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe("updateGroup", () => {
    it("should return 403 if user is not admin", async () => {
      const res = resFor(updateGroup);
      await updateGroup(
        reqFor(updateGroup, {
          user: testUser({ id: 1, role: "USER" }),
          params: { id: "1" },
          body: { name: "Updated" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 if group not found", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);

      const res = resFor(updateGroup);
      await updateGroup(
        reqFor(updateGroup, {
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "999" },
          body: { name: "Updated" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(404);
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

      const res = resFor(updateGroup);
      await updateGroup(
        reqFor(updateGroup, {
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1" },
          body: { name: "Updated Family", canShare: true },
        }),
        res
      );

      expect(mockPrisma.userGroup.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: objectContaining({
          name: "Updated Family",
          canShare: true,
        }),
      });
      expect(res.json).toHaveBeenCalledWith({
        group: objectContaining({ name: "Updated Family" }),
      });
    });
  });

  describe("deleteGroup", () => {
    it("should return 403 if user is not admin", async () => {
      const res = resFor(deleteGroup);
      await deleteGroup(
        reqFor(deleteGroup, {
          user: testUser({ id: 1, role: "USER" }),
          params: { id: "1" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 if group not found", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);

      const res = resFor(deleteGroup);
      await deleteGroup(
        reqFor(deleteGroup, {
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "999" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should delete group by id", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          name: "Family",
        })
      );
      mockPrisma.userGroup.delete.mockResolvedValue(partialRow({ id: 1 }));

      const res = resFor(deleteGroup);
      await deleteGroup(
        reqFor(deleteGroup, {
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1" },
        }),
        res
      );

      expect(mockPrisma.userGroup.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe("addMember", () => {
    it("should return 403 if user is not admin", async () => {
      const res = resFor(addMember);
      await addMember(
        reqFor(addMember, {
          user: testUser({ id: 1, role: "USER" }),
          params: { id: "1" },
          body: { userId: 2 },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 if group not found", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);

      const res = resFor(addMember);
      await addMember(
        reqFor(addMember, {
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "999" },
          body: { userId: 2 },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 400 if userId is missing", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(partialRow({ id: 1 }));

      const res = resFor(addMember);
      await addMember(
        reqFor(addMember, {
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1" },
          body: malformed({}),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
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

      const res = resFor(addMember);
      await addMember(
        reqFor(addMember, {
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1" },
          body: { userId: 2 },
        }),
        res
      );

      expect(mockPrisma.userGroupMembership.create).toHaveBeenCalledWith({
        data: { userId: 2, groupId: 1 },
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 409 if user already in group", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(partialRow({ id: 1 }));
      mockPrisma.userGroupMembership.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
        })
      );

      const res = resFor(addMember);
      await addMember(
        reqFor(addMember, {
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1" },
          body: { userId: 2 },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe("removeMember", () => {
    it("should return 403 if user is not admin", async () => {
      const res = resFor(removeMember);
      await removeMember(
        reqFor(removeMember, {
          user: testUser({ id: 1, role: "USER" }),
          params: { id: "1", userId: "2" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 if membership not found", async () => {
      mockPrisma.userGroupMembership.findUnique.mockResolvedValue(null);

      const res = resFor(removeMember);
      await removeMember(
        reqFor(removeMember, {
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1", userId: "2" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(404);
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

      const res = resFor(removeMember);
      await removeMember(
        reqFor(removeMember, {
          user: testUser({ id: 1, role: "ADMIN" }),
          params: { id: "1", userId: "2" },
        }),
        res
      );

      expect(mockPrisma.userGroupMembership.delete).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe("getUserGroups", () => {
    it("should return 401 if user is not authenticated", async () => {
      const res = resFor(getUserGroups);
      await getUserGroups(reqFor(getUserGroups, { user: undefined }), res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
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

      const res = resFor(getUserGroups);
      await getUserGroups(
        reqFor(getUserGroups, { user: testUser({ id: 2, role: "USER" }) }),
        res
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
      expect(res.json).toHaveBeenCalledWith({
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
