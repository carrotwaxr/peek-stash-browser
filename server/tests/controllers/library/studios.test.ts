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

import { stashEntityService } from "../../../services/StashEntityService.js";
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

vi.mock("../../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getAllStudios: vi.fn(),
    getStudio: vi.fn(),
  },
}));

vi.mock("../../../services/StudioQueryBuilder.js", () => ({
  studioQueryBuilder: { execute: vi.fn() },
}));

vi.mock("../../../services/MinimalEntityQuery.js", () => ({
  findMinimalEntities: vi.fn(),
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("../../../utils/hierarchyUtils.js", () => ({
  hydrateStudioRelationships: vi
    .fn()
    .mockImplementation((studios) => Promise.resolve(studios)),
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

const mockStashEntityService = vi.mocked(stashEntityService);
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
        studios,
        total: 1,
      });

      const req = reqFor(findStudios, {
        body: { filter: {}, studio_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findStudios);

      await findStudios(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getOkBody();
      expect(body.findStudios.count).toBe(1);
      expect(body.findStudios.studios).toHaveLength(1);
    });

    it("adds stashUrl to each studio for an admin", async () => {
      mockStudioQueryBuilder.execute.mockResolvedValue({
        studios: [createMockStudio({ id: "s1" })],
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
        studios: [
          createMockStudio({ id: "s1" }),
          createMockStudio({ id: "s2" }),
        ],
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
        studios,
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

    it("returns 500 when query builder throws", async () => {
      mockStudioQueryBuilder.execute.mockRejectedValue(new Error("DB error"));

      const req = reqFor(findStudios, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findStudios);

      await findStudios(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getErrorBody().error).toBe("Failed to find studios");
    });

    it("fetches detail counts for single-ID lookup", async () => {
      const studio = createMockStudio({ id: "101", instanceId: "default" });
      mockStudioQueryBuilder.execute.mockResolvedValue({
        studios: [studio],
        total: 1,
      });
      mockStashEntityService.getStudio.mockResolvedValue({
        ...studio,
        scene_count: 100,
        image_count: 50,
        gallery_count: 10,
        performer_count: 25,
        group_count: 5,
      });
      mockStashEntityService.getAllStudios.mockResolvedValue([studio]);

      const req = reqFor(findStudios, {
        body: { ids: ["101"], filter: {}, studio_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findStudios);

      await findStudios(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockStashEntityService.getStudio).toHaveBeenCalledWith(
        "101",
        "default"
      );
    });
  });

  // ─── findStudiosMinimal ─────────────────────────────────────

  describe("findStudiosMinimal", () => {
    it("answers one page from findMinimalEntities, for the parsed request", async () => {
      const rows = [{ id: "1", instanceId: "inst-a", name: "Alpha" }];
      mockFindMinimalEntities.mockResolvedValue(rows);
      const req = reqFor(findStudiosMinimal, {
        body: {
          ids: ["1:inst-a"],
          filter: { q: " al ", per_page: 20 },
          count_filter: { min_scene_count: 1 },
        },
        user: defaultUser,
      });
      const res = resFor(findStudiosMinimal);

      await findStudiosMinimal(req, res);

      expect(mockFindMinimalEntities).toHaveBeenCalledWith(defaultUser, {
        entity: "studio",
        q: "al",
        perPage: 20,
        ids: [{ id: "1", instanceId: "inst-a" }],
        countFilter: { min_scene_count: 1 },
        dropped: [],
      });
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
