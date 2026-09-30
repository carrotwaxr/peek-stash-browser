/**
 * Unit Tests for Groups Library Controller
 *
 * Tests findGroups and findGroupsMinimal.
 */
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findGroups,
  findGroupsMinimal,
} from "../../../controllers/library/groups.js";
// --- Imports ---

import { groupQueryBuilder } from "../../../services/GroupQueryBuilder.js";
import { findMinimalEntities } from "../../../services/MinimalEntityQuery.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../../helpers/controllerTestUtils.js";
import { createMockGroup } from "../../helpers/mockDataGenerators.js";
import { must } from "../../helpers/must.js";

// --- Mocks (must come before module import) ---

vi.mock("../../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getGroup: vi.fn(),
  },
}));

vi.mock("../../../services/GroupQueryBuilder.js", () => ({
  groupQueryBuilder: {
    execute: vi.fn(),
    getHierarchy: vi
      .fn()
      .mockResolvedValue({ containing_groups: [], sub_groups: [] }),
  },
}));

vi.mock("../../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    get: vi.fn(),
  },
}));

vi.mock("../../../services/MinimalEntityQuery.js", () => ({
  findMinimalEntities: vi.fn(),
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../utils/stashUrl.js", () => ({
  buildStashEntityUrl: vi
    .fn()
    .mockImplementation(
      (
        _type: string,
        id: string | number,
        _inst: string | undefined,
        viewer: { role: string } | undefined
      ) => (viewer?.role === "ADMIN" ? `http://stash/groups/${id}` : null)
    ),
}));

const mockStashEntityService = vi.mocked(stashEntityService);
const mockGroupQueryBuilder = vi.mocked(groupQueryBuilder);
const mockFindMinimalEntities = vi.mocked(findMinimalEntities);

const defaultUser = testUser();
const adminUser = testUser({ role: "ADMIN" });

describe("Groups Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── findGroups HTTP handler ────────────────────────────────

  describe("findGroups", () => {
    it("returns groups from query builder on happy path", async () => {
      const groups = [createMockGroup({ id: "g1", name: "TestGroup" })];
      mockGroupQueryBuilder.execute.mockResolvedValue({
        items: groups,
        total: 1,
      });

      const req = reqFor(findGroups, {
        body: { filter: {}, group_filter: {} },
        user: defaultUser,
        allowedInstanceIds: ["inst-a", "inst-b"],
      });
      const res = resFor(findGroups);

      await findGroups(req, res);

      // The builder reads the parsed request and the viewer's instances
      const call = must(mockGroupQueryBuilder.execute.mock.calls[0])[0];
      expect(call).toMatchObject({
        allowedInstanceIds: ["inst-a", "inst-b"],
        request: { page: 1, sort: { field: "name", direction: "ASC" } },
      });
      expect(res._getStatus()).toBe(200);
      const body = res._getOkBody();
      expect(body.findGroups.count).toBe(1);
      expect(body.findGroups.groups).toHaveLength(1);
    });

    it("returns 400 for ambiguous single-ID lookup", async () => {
      const groups = [
        createMockGroup({ id: "101", instanceId: "inst-a" }),
        createMockGroup({ id: "101", instanceId: "inst-b" }),
      ];
      mockGroupQueryBuilder.execute.mockResolvedValue({
        items: groups,
        total: 2,
      });

      const req = reqFor(findGroups, {
        body: { ids: ["101"], filter: {}, group_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGroups);

      await findGroups(req, res);

      expect(res._getStatus()).toBe(400);
      const body = res._getBody();
      assert("matches" in body, "expected an ambiguous-lookup body");
      expect(body.error).toBe("Ambiguous lookup");
      expect(body.matches).toHaveLength(2);
    });

    it("a failure reaches the error handler: query builder throws", async () => {
      mockGroupQueryBuilder.execute.mockRejectedValue(new Error("DB error"));

      const req = reqFor(findGroups, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGroups);

      await expect(findGroups(req, res)).rejects.toThrow("DB error");

      expect(res.json).not.toHaveBeenCalled();
    });

    it("fetches detail counts for single-ID lookup, keeping the builder's tags", async () => {
      const tags = [
        { id: "7", instanceId: "default", name: "Beach", image_path: null },
      ];
      const group = createMockGroup({ id: "101", instanceId: "default", tags });
      mockGroupQueryBuilder.execute.mockResolvedValue({
        items: [group],
        total: 1,
      });
      mockStashEntityService.getGroup.mockResolvedValue({
        ...group,
        tags: [{ id: "7", name: "Unknown", image_path: null }],
        scene_count: 15,
        performer_count: 8,
      });

      const req = reqFor(findGroups, {
        body: { ids: ["101"], filter: {}, group_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGroups);

      await findGroups(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockStashEntityService.getGroup).toHaveBeenCalledWith(
        "101",
        "default"
      );
      expect(res._getOkBody().findGroups.groups[0]).toMatchObject({
        scene_count: 15,
        performer_count: 8,
        tags,
      });
    });

    it("attaches the user's view of the hierarchy to a single-ID lookup", async () => {
      const group = createMockGroup({ id: "101", instanceId: "inst-a" });
      mockGroupQueryBuilder.execute.mockResolvedValue({
        items: [group],
        total: 1,
      });
      mockStashEntityService.getGroup.mockResolvedValue(group);
      const hierarchy = {
        containing_groups: [
          {
            group: { id: "p", name: "Box", instanceId: "inst-a" },
            description: "Box set",
          },
        ],
        sub_groups: [],
      };
      mockGroupQueryBuilder.getHierarchy.mockResolvedValueOnce(hierarchy);

      const req = reqFor(findGroups, {
        body: { ids: ["101"], group_filter: { instance_id: "inst-a" } },
        user: defaultUser,
      });
      const res = resFor(findGroups);

      await findGroups(req, res);

      expect(mockGroupQueryBuilder.getHierarchy).toHaveBeenCalledWith(
        "101",
        "inst-a",
        defaultUser.id
      );
      expect(must(res._getOkBody().findGroups.groups[0])).toMatchObject(
        hierarchy
      );
    });

    it("does not look up the hierarchy for a list", async () => {
      mockGroupQueryBuilder.execute.mockResolvedValue({
        items: [createMockGroup({ id: "g1" })],
        total: 1,
      });

      const req = reqFor(findGroups, {
        body: { filter: {}, group_filter: {} },
        user: defaultUser,
      });
      await findGroups(req, resFor(findGroups));

      expect(mockGroupQueryBuilder.getHierarchy).not.toHaveBeenCalled();
    });

    it("adds stashUrl to each group for an admin", async () => {
      const groups = [createMockGroup({ id: "g1" })];
      mockGroupQueryBuilder.execute.mockResolvedValue({
        items: groups,
        total: 1,
      });

      const req = reqFor(findGroups, {
        body: { filter: {}, group_filter: {} },
        user: adminUser,
      });
      const res = resFor(findGroups);

      await findGroups(req, res);

      const body = res._getOkBody();
      expect(must(body.findGroups.groups[0])).toHaveProperty(
        "stashUrl",
        "http://stash/groups/g1"
      );
    });

    it("does not send stashUrl to a regular user", async () => {
      mockGroupQueryBuilder.execute.mockResolvedValue({
        items: [createMockGroup({ id: "g1" }), createMockGroup({ id: "g2" })],
        total: 2,
      });

      const req = reqFor(findGroups, {
        body: { filter: {}, group_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGroups);

      await findGroups(req, res);

      const groups = res._getOkBody().findGroups.groups;
      expect(groups).toHaveLength(2);
      for (const group of groups)
        expect(group).toHaveProperty("stashUrl", null);
    });
  });

  // ─── findGroupsMinimal ─────────────────────────────────────

  describe("findGroupsMinimal", () => {
    it("passes req.allowedInstanceIds to the builder or service: one page from findMinimalEntities, for the parsed request", async () => {
      const rows = [{ id: "1", instanceId: "inst-a", name: "Alpha" }];
      mockFindMinimalEntities.mockResolvedValue(rows);
      const req = reqFor(findGroupsMinimal, {
        body: {
          ids: ["1:inst-a"],
          filter: { q: " al ", per_page: 20 },
          count_filter: { min_scene_count: 1 },
        },
        user: defaultUser,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(findGroupsMinimal);

      await findGroupsMinimal(req, res);

      expect(mockFindMinimalEntities).toHaveBeenCalledWith(
        defaultUser,
        {
          entity: "group",
          q: "al",
          perPage: 20,
          ids: [{ id: "1", instanceId: "inst-a" }],
          countFilter: { min_scene_count: 1 },
        },
        ["inst-a"]
      );
      expect(res._getOkBody()).toEqual({ groups: rows });
    });

    it("a sort field answers 400 before any query: the pickers always list by name", async () => {
      const req = reqFor(findGroupsMinimal, {
        body: malformed({ filter: { sort: "name" } }),
        user: defaultUser,
      });
      const res = resFor(findGroupsMinimal);

      await expect(findGroupsMinimal(req, res)).rejects.toMatchObject({
        statusCode: 400,
        issues: [{ path: "filter.sort" }],
      });
      expect(mockFindMinimalEntities).not.toHaveBeenCalled();
    });

    it("a query error reaches the central error handler", async () => {
      mockFindMinimalEntities.mockRejectedValue(new Error("fail"));
      const req = reqFor(findGroupsMinimal, { user: defaultUser });
      const res = resFor(findGroupsMinimal);

      await expect(findGroupsMinimal(req, res)).rejects.toThrow("fail");
    });
  });
});
