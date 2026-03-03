/**
 * Unit Tests for Groups Library Controller
 *
 * Tests applyGroupFilters, findGroups, and findGroupsMinimal.
 * Note: mergeGroupsWithUserData is private and tested indirectly
 * through findGroupsMinimal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (must come before module import) ---

vi.mock("../../../prisma/singleton.js", () => ({
  default: {
    groupRating: { findMany: vi.fn() },
  },
}));

vi.mock("../../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getAllGroups: vi.fn(),
    getGroup: vi.fn(),
    getGroupIdsByPerformers: vi.fn().mockResolvedValue(new Set()),
  },
}));

vi.mock("../../../services/GroupQueryBuilder.js", () => ({
  groupQueryBuilder: { execute: vi.fn() },
}));

vi.mock("../../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    get: vi.fn(),
    getDefaultConfig: vi.fn().mockReturnValue({ id: "default" }),
  },
}));

vi.mock("../../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    filterExcluded: vi.fn().mockImplementation((items) => items),
  },
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("@peek/shared-types/instanceAwareId.js", () => ({
  coerceEntityRefs: vi.fn().mockImplementation((ids) => ids),
}));

vi.mock("../../../utils/hierarchyUtils.js", () => ({
  hydrateEntityTags: vi
    .fn()
    .mockImplementation((items) => Promise.resolve(items)),
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../utils/seededRandom.js", () => ({
  parseRandomSort: vi
    .fn()
    .mockImplementation((field) => ({ sortField: field, randomSeed: undefined })),
}));

vi.mock("../../../utils/stashUrl.js", () => ({
  buildStashEntityUrl: vi
    .fn()
    .mockImplementation((_type, id) => `http://stash/groups/${id}`),
}));

// --- Imports ---

import prisma from "../../../prisma/singleton.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import { groupQueryBuilder } from "../../../services/GroupQueryBuilder.js";
import {
  applyGroupFilters,
  findGroups,
  findGroupsMinimal,
} from "../../../controllers/library/groups.js";
import { mockReq, mockRes } from "../../helpers/controllerTestUtils.js";
import { createMockGroup } from "../../helpers/mockDataGenerators.js";

const mockPrisma = vi.mocked(prisma);
const mockStashEntityService = vi.mocked(stashEntityService);
const mockGroupQueryBuilder = vi.mocked(groupQueryBuilder);

const defaultUser = { id: 1, role: "USER" };
const adminUser = { id: 1, role: "ADMIN" };

describe("Groups Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.groupRating.findMany.mockResolvedValue([]);
  });

  // ─── applyGroupFilters ──────────────────────────────────────

  describe("applyGroupFilters", () => {
    it("returns all groups when filters is null", async () => {
      const groups = [createMockGroup(), createMockGroup()];
      const result = await applyGroupFilters(groups, null);
      expect(result).toHaveLength(2);
    });

    it("returns all groups when filters is undefined", async () => {
      const groups = [createMockGroup()];
      const result = await applyGroupFilters(groups, undefined);
      expect(result).toHaveLength(1);
    });

    it("filters by ids", async () => {
      const groups = [
        createMockGroup({ id: "g1" }),
        createMockGroup({ id: "g2" }),
        createMockGroup({ id: "g3" }),
      ];
      const result = await applyGroupFilters(groups, {
        ids: { value: ["g1", "g3"], modifier: "INCLUDES" },
      });
      expect(result).toHaveLength(2);
      expect(result.map((g) => g.id)).toEqual(["g1", "g3"]);
    });

    it("filters by favorite", async () => {
      const groups = [
        createMockGroup({ id: "g1", favorite: true }),
        createMockGroup({ id: "g2", favorite: false }),
      ];
      const result = await applyGroupFilters(groups, { favorite: true });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by tags INCLUDES", async () => {
      const groups = [
        createMockGroup({
          id: "g1",
          tags: [{ id: "t1", name: "A" }] as any,
        }),
        createMockGroup({
          id: "g2",
          tags: [{ id: "t2", name: "B" }] as any,
        }),
      ];
      const result = await applyGroupFilters(groups, {
        tags: { value: ["t1"], modifier: "INCLUDES" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by tags INCLUDES_ALL", async () => {
      const groups = [
        createMockGroup({
          id: "g1",
          tags: [
            { id: "t1", name: "A" },
            { id: "t2", name: "B" },
          ] as any,
        }),
        createMockGroup({
          id: "g2",
          tags: [{ id: "t1", name: "A" }] as any,
        }),
      ];
      const result = await applyGroupFilters(groups, {
        tags: { value: ["t1", "t2"], modifier: "INCLUDES_ALL" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by tags EXCLUDES", async () => {
      const groups = [
        createMockGroup({
          id: "g1",
          tags: [{ id: "t1", name: "A" }] as any,
        }),
        createMockGroup({
          id: "g2",
          tags: [{ id: "t2", name: "B" }] as any,
        }),
      ];
      const result = await applyGroupFilters(groups, {
        tags: { value: ["t1"], modifier: "EXCLUDES" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g2");
    });

    it("filters by performers via getGroupIdsByPerformers", async () => {
      mockStashEntityService.getGroupIdsByPerformers.mockResolvedValue(
        new Set(["g1"])
      );

      const groups = [
        createMockGroup({ id: "g1" }),
        createMockGroup({ id: "g2" }),
      ];
      const result = await applyGroupFilters(groups, {
        performers: { value: ["p1", "p2"], modifier: "INCLUDES" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
      expect(
        mockStashEntityService.getGroupIdsByPerformers
      ).toHaveBeenCalledWith(["p1", "p2"]);
    });

    it("filters by studios", async () => {
      const groups = [
        createMockGroup({
          id: "g1",
          studio: { id: "s1", name: "Studio1" } as any,
        }),
        createMockGroup({
          id: "g2",
          studio: { id: "s2", name: "Studio2" } as any,
        }),
        createMockGroup({ id: "g3", studio: null }),
      ];
      const result = await applyGroupFilters(groups, {
        studios: { value: ["s1"], modifier: "INCLUDES" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by rating100 GREATER_THAN", async () => {
      const groups = [
        createMockGroup({ id: "g1", rating100: 80 }),
        createMockGroup({ id: "g2", rating100: 30 }),
      ];
      const result = await applyGroupFilters(groups, {
        rating100: { modifier: "GREATER_THAN", value: 50 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by rating100 BETWEEN", async () => {
      const groups = [
        createMockGroup({ id: "g1", rating100: 50 }),
        createMockGroup({ id: "g2", rating100: 80 }),
        createMockGroup({ id: "g3", rating100: 20 }),
      ];
      const result = await applyGroupFilters(groups, {
        rating100: { modifier: "BETWEEN", value: 40, value2: 60 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by rating100 EQUALS", async () => {
      const groups = [
        createMockGroup({ id: "g1", rating100: 50 }),
        createMockGroup({ id: "g2", rating100: 80 }),
      ];
      const result = await applyGroupFilters(groups, {
        rating100: { modifier: "EQUALS", value: 80 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g2");
    });
  });

  // ─── findGroups HTTP handler ────────────────────────────────

  describe("findGroups", () => {
    it("returns groups from query builder on happy path", async () => {
      const groups = [createMockGroup({ id: "g1", name: "TestGroup" })];
      mockGroupQueryBuilder.execute.mockResolvedValue({
        groups,
        total: 1,
      });

      const req = mockReq(
        { filter: {}, group_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findGroups(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getBody();
      expect(body.findGroups.count).toBe(1);
      expect(body.findGroups.groups).toHaveLength(1);
    });

    it("returns 400 for ambiguous single-ID lookup", async () => {
      const groups = [
        createMockGroup({ id: "g1", instanceId: "inst-a" }),
        createMockGroup({ id: "g1", instanceId: "inst-b" }),
      ];
      mockGroupQueryBuilder.execute.mockResolvedValue({
        groups,
        total: 2,
      });

      const req = mockReq(
        { ids: ["g1"], filter: {}, group_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findGroups(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toBe("Ambiguous lookup");
      expect(res._getBody().matches).toHaveLength(2);
    });

    it("returns 500 when query builder throws", async () => {
      mockGroupQueryBuilder.execute.mockRejectedValue(
        new Error("DB error")
      );

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findGroups(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getBody().error).toBe("Failed to find groups");
    });

    it("fetches detail counts and hydrates tags for single-ID lookup", async () => {
      const group = createMockGroup({ id: "g1", instanceId: "default" });
      mockGroupQueryBuilder.execute.mockResolvedValue({
        groups: [group],
        total: 1,
      });
      mockStashEntityService.getGroup.mockResolvedValue({
        ...group,
        scene_count: 15,
        performer_count: 8,
      } as any);

      const req = mockReq(
        { ids: ["g1"], filter: {}, group_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findGroups(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockStashEntityService.getGroup).toHaveBeenCalledWith(
        "g1",
        "default"
      );
    });

    it("adds stashUrl to each group", async () => {
      const groups = [createMockGroup({ id: "g1" })];
      mockGroupQueryBuilder.execute.mockResolvedValue({
        groups,
        total: 1,
      });

      const req = mockReq(
        { filter: {}, group_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findGroups(req, res);

      const body = res._getBody();
      expect(body.findGroups.groups[0].stashUrl).toBe(
        "http://stash/groups/g1"
      );
    });
  });

  // ─── findGroupsMinimal ─────────────────────────────────────

  describe("findGroupsMinimal", () => {
    it("returns minimal groups on happy path", async () => {
      const groups = [
        createMockGroup({ id: "g1", name: "Alpha" }),
        createMockGroup({ id: "g2", name: "Beta" }),
      ];
      mockStashEntityService.getAllGroups.mockResolvedValue(groups);

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findGroupsMinimal(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody().groups).toHaveLength(2);
    });

    it("returns empty when cache is not initialized", async () => {
      mockStashEntityService.getAllGroups.mockResolvedValue([]);

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findGroupsMinimal(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody().groups).toEqual([]);
    });

    it("applies search query filtering", async () => {
      const groups = [
        createMockGroup({ id: "g1", name: "Action Movie" }),
        createMockGroup({ id: "g2", name: "Comedy Special" }),
      ];
      mockStashEntityService.getAllGroups.mockResolvedValue(groups);

      const req = mockReq({ filter: { q: "action" } }, {}, defaultUser);
      const res = mockRes();

      await findGroupsMinimal(req, res);

      expect(res._getBody().groups).toHaveLength(1);
    });

    it("applies count_filter with min_scene_count", async () => {
      const groups = [
        createMockGroup({ id: "g1", scene_count: 20 }),
        createMockGroup({ id: "g2", scene_count: 1 }),
      ];
      mockStashEntityService.getAllGroups.mockResolvedValue(groups);

      const req = mockReq(
        { filter: {}, count_filter: { min_scene_count: 5 } },
        {},
        defaultUser
      );
      const res = mockRes();

      await findGroupsMinimal(req, res);

      expect(res._getBody().groups).toHaveLength(1);
    });

    it("applies count_filter with min_performer_count", async () => {
      const groups = [
        createMockGroup({ id: "g1", performer_count: 10 }),
        createMockGroup({ id: "g2", performer_count: 0 }),
      ];
      mockStashEntityService.getAllGroups.mockResolvedValue(groups);

      const req = mockReq(
        { filter: {}, count_filter: { min_performer_count: 5 } },
        {},
        defaultUser
      );
      const res = mockRes();

      await findGroupsMinimal(req, res);

      expect(res._getBody().groups).toHaveLength(1);
    });

    it("sorts by name", async () => {
      const groups = [
        createMockGroup({ id: "g1", name: "Zebra" }),
        createMockGroup({ id: "g2", name: "Alpha" }),
      ];
      mockStashEntityService.getAllGroups.mockResolvedValue(groups);

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findGroupsMinimal(req, res);

      const result = res._getBody().groups;
      expect(result[0].name).toBe("Alpha");
      expect(result[1].name).toBe("Zebra");
    });

    it("merges user data (ratings/favorites) indirectly", async () => {
      const groups = [createMockGroup({ id: "g1" })];
      mockStashEntityService.getAllGroups.mockResolvedValue(groups);
      mockPrisma.groupRating.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 1,
          groupId: "g1",
          instanceId: "default",
          rating: 75,
          favorite: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any);

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findGroupsMinimal(req, res);

      expect(res._getStatus()).toBe(200);
      const result = res._getBody().groups;
      expect(result[0].favorite).toBe(true);
    });

    it("returns 500 on error", async () => {
      mockStashEntityService.getAllGroups.mockRejectedValue(
        new Error("cache failure")
      );

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findGroupsMinimal(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getBody().error).toBe("Failed to find groups");
    });
  });
});
