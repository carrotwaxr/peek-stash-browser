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
// --- Imports ---

import { stashEntityService } from "../../../services/StashEntityService.js";
import { studioQueryBuilder } from "../../../services/StudioQueryBuilder.js";
import { reqFor, resFor, testUser } from "../../helpers/controllerTestUtils.js";
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

vi.mock("../../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    filterExcluded: vi.fn().mockImplementation((items: unknown[]) => items),
  },
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("../../../utils/entityInstanceId.js", () => ({
  disambiguateEntityNames: vi
    .fn()
    .mockImplementation((entities: unknown[]) => entities),
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
    it("returns minimal studios on happy path", async () => {
      const studios = [
        createMockStudio({ id: "s1", name: "Alpha Studio" }),
        createMockStudio({ id: "s2", name: "Beta Studio" }),
      ];
      mockStashEntityService.getAllStudios.mockResolvedValue(studios);

      const req = reqFor(findStudiosMinimal, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findStudiosMinimal);

      await findStudiosMinimal(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().studios).toHaveLength(2);
    });

    it("applies search query filtering", async () => {
      const studios = [
        createMockStudio({ id: "s1", name: "Alpha" }),
        createMockStudio({ id: "s2", name: "Beta" }),
      ];
      mockStashEntityService.getAllStudios.mockResolvedValue(studios);

      const req = reqFor(findStudiosMinimal, {
        body: { filter: { q: "alpha" } },
        user: defaultUser,
      });
      const res = resFor(findStudiosMinimal);

      await findStudiosMinimal(req, res);

      expect(res._getOkBody().studios).toHaveLength(1);
    });

    it("applies count_filter with min_scene_count", async () => {
      const studios = [
        createMockStudio({ id: "s1", scene_count: 50 }),
        createMockStudio({ id: "s2", scene_count: 2 }),
      ];
      mockStashEntityService.getAllStudios.mockResolvedValue(studios);

      const req = reqFor(findStudiosMinimal, {
        body: { filter: {}, count_filter: { min_scene_count: 10 } },
        user: defaultUser,
      });
      const res = resFor(findStudiosMinimal);

      await findStudiosMinimal(req, res);

      expect(res._getOkBody().studios).toHaveLength(1);
    });

    it("applies pagination via per_page", async () => {
      const studios = [
        createMockStudio({ id: "s1", name: "A" }),
        createMockStudio({ id: "s2", name: "B" }),
        createMockStudio({ id: "s3", name: "C" }),
      ];
      mockStashEntityService.getAllStudios.mockResolvedValue(studios);

      const req = reqFor(findStudiosMinimal, {
        body: { filter: { per_page: 2 } },
        user: defaultUser,
      });
      const res = resFor(findStudiosMinimal);

      await findStudiosMinimal(req, res);

      expect(res._getOkBody().studios).toHaveLength(2);
    });

    it("returns 500 on error", async () => {
      mockStashEntityService.getAllStudios.mockRejectedValue(
        new Error("cache failure")
      );

      const req = reqFor(findStudiosMinimal, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findStudiosMinimal);

      await findStudiosMinimal(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });
});
