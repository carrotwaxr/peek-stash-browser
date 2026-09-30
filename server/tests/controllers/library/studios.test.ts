/**
 * Unit Tests for Studios Library Controller
 *
 * Tests findStudios and findStudiosMinimal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findStudios,
  findStudiosMinimal,
} from "../../../controllers/library/studios.js";
import { findMinimalEntities } from "../../../services/MinimalEntityQuery.js";
// --- Imports ---

import { studioQueryBuilder } from "../../../services/StudioQueryBuilder.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../../helpers/controllerTestUtils.js";
import { createMockStudio } from "../../helpers/mockDataGenerators.js";
import { must } from "../../helpers/must.js";

// --- Mocks (must come before module import) ---

vi.mock("../../../services/StudioQueryBuilder.js", () => ({
  studioQueryBuilder: { execute: vi.fn() },
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
      ) => (viewer?.role === "ADMIN" ? `http://stash/studios/${id}` : null)
    ),
}));

const mockStudioQueryBuilder = vi.mocked(studioQueryBuilder);
const mockFindMinimalEntities = vi.mocked(findMinimalEntities);

const defaultUser = testUser();
const adminUser = testUser({ role: "ADMIN" });

describe("Studios Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── findStudios HTTP handler ───────────────────────────────

  describe("findStudios", () => {
    it("returns studios from query builder on happy path", async () => {
      const studios = [createMockStudio({ id: "s1", name: "TestStudio" })];
      mockStudioQueryBuilder.execute.mockResolvedValue({
        items: studios,
        total: 1,
      });

      const req = reqFor(findStudios, {
        body: { filter: {}, studio_filter: {} },
        user: defaultUser,
        allowedInstanceIds: ["inst-a", "inst-b"],
      });
      const res = resFor(findStudios);

      await findStudios(req, res);

      // The builder reads the parsed request and the viewer's instances
      const call = must(mockStudioQueryBuilder.execute.mock.calls[0])[0];
      expect(call).toMatchObject({
        allowedInstanceIds: ["inst-a", "inst-b"],
        request: { page: 1, sort: { field: "name", direction: "ASC" } },
      });
      expect(res._getStatus()).toBe(200);
      const body = res._getOkBody();
      expect(body.findStudios.count).toBe(1);
      expect(body.findStudios.studios).toHaveLength(1);
    });

    it("adds stashUrl to each studio for an admin", async () => {
      mockStudioQueryBuilder.execute.mockResolvedValue({
        items: [createMockStudio({ id: "s1" })],
        total: 1,
      });

      const req = reqFor(findStudios, {
        body: { filter: {}, studio_filter: {} },
        user: adminUser,
      });
      const res = resFor(findStudios);

      await findStudios(req, res);

      expect(must(res._getOkBody().findStudios.studios[0])).toHaveProperty(
        "stashUrl",
        "http://stash/studios/s1"
      );
    });

    it("does not send stashUrl to a regular user", async () => {
      mockStudioQueryBuilder.execute.mockResolvedValue({
        items: [createMockStudio({ id: "s1" }), createMockStudio({ id: "s2" })],
        total: 2,
      });

      const req = reqFor(findStudios, {
        body: { filter: {}, studio_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findStudios);

      await findStudios(req, res);

      const studios = res._getOkBody().findStudios.studios;
      expect(studios).toHaveLength(2);
      for (const studio of studios)
        expect(studio).toHaveProperty("stashUrl", null);
    });

    it("returns 400 for ambiguous single-ID lookup", async () => {
      const studios = [
        createMockStudio({ id: "101", instanceId: "inst-a" }),
        createMockStudio({ id: "101", instanceId: "inst-b" }),
      ];
      mockStudioQueryBuilder.execute.mockResolvedValue({
        items: studios,
        total: 2,
      });

      const req = reqFor(findStudios, {
        body: { ids: ["101"], filter: {}, studio_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findStudios);

      await findStudios(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe("Ambiguous lookup");
    });

    it("a failure reaches the error handler: query builder throws", async () => {
      mockStudioQueryBuilder.execute.mockRejectedValue(new Error("DB error"));

      const req = reqFor(findStudios, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findStudios);

      await expect(findStudios(req, res)).rejects.toThrow("DB error");

      expect(res.json).not.toHaveBeenCalled();
    });

    it("a detail answers the builder's row as it is: the card's counts, the viewer's favorite, rating and stats, parent and children", async () => {
      const parent = {
        id: "100",
        instanceId: "inst-b",
        name: "Network",
        image_path: null,
        parent_studio: null,
      };
      const child = { ...parent, id: "102", name: "Imprint" };
      const studio = createMockStudio({
        id: "101",
        instanceId: "inst-b",
        favorite: false,
        rating: 20,
        rating100: 20,
        o_counter: 3,
        play_count: 4,
        scene_count: 100,
        group_count: 5,
        parent_studio: parent,
        child_studios: [child],
      });
      mockStudioQueryBuilder.execute.mockResolvedValue({
        items: [studio],
        total: 1,
      });

      const req = reqFor(findStudios, {
        body: { ids: ["101"], studio_filter: { instance_id: "inst-b" } },
        user: defaultUser,
      });
      const res = resFor(findStudios);

      await findStudios(req, res);

      expect(res._getOkBody().findStudios.studios).toEqual([
        { ...studio, stashUrl: null },
      ]);
    });
  });

  // ─── findStudiosMinimal ─────────────────────────────────────

  describe("findStudiosMinimal", () => {
    it("passes req.allowedInstanceIds to the builder or service: one page from findMinimalEntities, for the parsed request", async () => {
      const rows = [{ id: "1", instanceId: "inst-a", name: "Alpha" }];
      mockFindMinimalEntities.mockResolvedValue(rows);
      const req = reqFor(findStudiosMinimal, {
        body: {
          ids: ["1:inst-a"],
          filter: { q: " al ", per_page: 20 },
          count_filter: { min_scene_count: 1 },
        },
        user: defaultUser,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(findStudiosMinimal);

      await findStudiosMinimal(req, res);

      expect(mockFindMinimalEntities).toHaveBeenCalledWith(
        defaultUser,
        {
          entity: "studio",
          q: "al",
          perPage: 20,
          ids: [{ id: "1", instanceId: "inst-a" }],
          countFilter: { min_scene_count: 1 },
        },
        ["inst-a"]
      );
      expect(res._getOkBody()).toEqual({ studios: rows });
    });

    it("a sort field answers 400 before any query: the pickers always list by name", async () => {
      const req = reqFor(findStudiosMinimal, {
        body: malformed({ filter: { sort: "name" } }),
        user: defaultUser,
      });
      const res = resFor(findStudiosMinimal);

      await expect(findStudiosMinimal(req, res)).rejects.toMatchObject({
        statusCode: 400,
        issues: [{ path: "filter.sort" }],
      });
      expect(mockFindMinimalEntities).not.toHaveBeenCalled();
    });

    it("a query error reaches the central error handler", async () => {
      mockFindMinimalEntities.mockRejectedValue(new Error("fail"));
      const req = reqFor(findStudiosMinimal, { user: defaultUser });
      const res = resFor(findStudiosMinimal);

      await expect(findStudiosMinimal(req, res)).rejects.toThrow("fail");
    });
  });
});
