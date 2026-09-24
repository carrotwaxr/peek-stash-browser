/**
 * Unit Tests for Carousel Controller
 *
 * Tests the carousel endpoints including:
 * - getUserCarousels (list all user carousels)
 * - getCarousel (single carousel retrieval)
 * - createCarousel (carousel creation with validation)
 * - updateCarousel (partial update with ownership check)
 * - deleteCarousel (deletion with ownership check)
 * - previewCarousel (preview carousel query results)
 * - executeCarouselById (execute saved carousel and return scenes)
 */
import type { UserCarousel } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCarousel,
  deleteCarousel,
  executeCarouselById,
  getCarousel,
  getUserCarousels,
  previewCarousel,
  updateCarousel,
} from "../../controllers/carousel.js";
import { addStreamabilityInfo } from "../../controllers/library/scenes.js";
import { CriterionModifier } from "../../graphql/types.js";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import type { PeekSceneFilter } from "../../types/peekFilters.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { userRow } from "../helpers/fixtures.js";
import { createMockScene } from "../helpers/mockDataGenerators.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock Prisma - hoisted before imports
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock StashEntityService
vi.mock("../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getAllScenes: vi.fn(),
    getScenesPaginated: vi.fn(),
    getStats: vi.fn(),
  },
}));

// Mock EntityExclusionHelper
vi.mock("../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    getExcludedIds: vi.fn().mockResolvedValue(new Set()),
    getExclusionData: vi.fn().mockResolvedValue({ excludedIds: new Set() }),
    isExcluded: vi.fn().mockReturnValue(false),
    filterExcluded: vi.fn((scenes: unknown[]) => scenes),
  },
}));

// Mock SceneQueryBuilder
vi.mock("../../services/SceneQueryBuilder.js", () => ({
  sceneQueryBuilder: {
    execute: vi.fn(),
  },
}));

// Mock library/scenes helpers
vi.mock("../../controllers/library/scenes.js", () => ({
  mergeScenesWithUserData: vi.fn((scenes: unknown[]) => scenes),
  applyQuickSceneFilters: vi.fn((scenes: unknown[]) => scenes),
  applyExpensiveSceneFilters: vi.fn((scenes: unknown[]) => scenes),
  sortScenes: vi.fn((scenes: unknown[]) => scenes),
  addStreamabilityInfo: vi.fn((scenes: unknown[]) => scenes),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockQueryBuilder = vi.mocked(sceneQueryBuilder);
const mockAddStreamability = vi.mocked(addStreamabilityInfo);

const USER = { id: 1, username: "testuser", role: "USER" };

/** A carousel's rules: the scene filter the client saves with it */
const RULES: PeekSceneFilter = {
  rating100: { value: 80, modifier: CriterionModifier.GreaterThan },
};

/** Sample carousel record from the database */
const SAMPLE_CAROUSEL: UserCarousel = {
  id: "1",
  userId: 1,
  title: "Top Rated",
  icon: "Star",
  rules: JSON.stringify([{ field: "rating", operator: "gte", value: 80 }]),
  sort: "rating",
  direction: "DESC",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

/** Sample scene for carousel results */
const SAMPLE_SCENE = createMockScene({
  id: "scene-1",
  title: "Test Scene",
  rating100: 90,
  instanceId: "instance-1",
});

describe("Carousel Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // getUserCarousels Tests
  // ==========================================================================

  describe("getUserCarousels", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(getUserCarousels);
      const res = resFor(getUserCarousels);
      await getUserCarousels(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns array of user carousels on success", async () => {
      const carousels = [
        SAMPLE_CAROUSEL,
        { ...SAMPLE_CAROUSEL, id: "2", title: "Recent" },
      ];
      mockPrisma.userCarousel.findMany.mockResolvedValue(carousels);

      const req = reqFor(getUserCarousels, { user: USER });
      const res = resFor(getUserCarousels);
      await getUserCarousels(req, res);

      expect(mockPrisma.userCarousel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
        })
      );
      const body = res._getOkBody();
      expect(Array.isArray(body.carousels || body)).toBe(true);
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.userCarousel.findMany.mockRejectedValue(new Error("DB error"));

      const req = reqFor(getUserCarousels, { user: USER });
      const res = resFor(getUserCarousels);
      await getUserCarousels(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // getCarousel Tests
  // ==========================================================================

  describe("getCarousel", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(getCarousel, { params: { id: "1" } });
      const res = resFor(getCarousel);
      await getCarousel(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when carousel is not found", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(null);

      const req = reqFor(getCarousel, { params: { id: "999" }, user: USER });
      const res = resFor(getCarousel);
      await getCarousel(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("returns carousel on success", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL);

      const req = reqFor(getCarousel, { params: { id: "1" }, user: USER });
      const res = resFor(getCarousel);
      await getCarousel(req, res);

      const body = res._getOkBody();
      expect(body.carousel.id).toBe(SAMPLE_CAROUSEL.id);
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.userCarousel.findFirst.mockRejectedValue(
        new Error("DB error")
      );

      const req = reqFor(getCarousel, { params: { id: "1" }, user: USER });
      const res = resFor(getCarousel);
      await getCarousel(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // createCarousel Tests
  // ==========================================================================

  describe("createCarousel", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(createCarousel, {
        body: { title: "New", rules: RULES },
      });
      const res = resFor(createCarousel);
      await createCarousel(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 when title is empty", async () => {
      const req = reqFor(createCarousel, {
        body: { title: "", rules: RULES },
        user: USER,
      });
      const res = resFor(createCarousel);
      await createCarousel(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Title is required/i);
    });

    it("returns 400 when title is missing", async () => {
      const req = reqFor(createCarousel, {
        body: malformed({ rules: RULES }),
        user: USER,
      });
      const res = resFor(createCarousel);
      await createCarousel(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when rules are missing", async () => {
      const req = reqFor(createCarousel, {
        body: malformed({ title: "New Carousel" }),
        user: USER,
      });
      const res = resFor(createCarousel);
      await createCarousel(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Rules are required/i);
    });

    it("returns 400 when user is at maximum carousel limit (15)", async () => {
      mockPrisma.userCarousel.count.mockResolvedValue(15);

      const req = reqFor(createCarousel, {
        body: { title: "One Too Many", rules: RULES },
        user: USER,
      });
      const res = resFor(createCarousel);
      await createCarousel(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Maximum 15/i);
    });

    it("creates carousel with defaults on happy path", async () => {
      mockPrisma.userCarousel.count.mockResolvedValue(3);
      mockPrisma.userCarousel.create.mockResolvedValue({
        ...SAMPLE_CAROUSEL,
        id: "10",
        title: "New Carousel",
        icon: "Film",
        sort: "random",
        direction: "DESC",
      });
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          carouselPreferences: [],
        })
      );
      mockPrisma.user.update.mockResolvedValue(userRow());

      const req = reqFor(createCarousel, {
        body: {
          title: "New Carousel",
          rules: RULES,
        },
        user: USER,
      });
      const res = resFor(createCarousel);
      await createCarousel(req, res);

      expect(res._getStatus()).toBe(201);
      expect(mockPrisma.userCarousel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 1,
            title: "New Carousel",
          }),
        })
      );
    });

    it("applies default icon, sort, and direction when not specified", async () => {
      mockPrisma.userCarousel.count.mockResolvedValue(0);
      mockPrisma.userCarousel.create.mockResolvedValue({
        ...SAMPLE_CAROUSEL,
        icon: "Film",
        sort: "random",
        direction: "DESC",
      });
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          carouselPreferences: null,
        })
      );
      mockPrisma.user.update.mockResolvedValue(userRow());

      const req = reqFor(createCarousel, {
        body: {
          title: "Defaults Test",
          rules: RULES,
        },
        user: USER,
      });
      const res = resFor(createCarousel);
      await createCarousel(req, res);

      expect(mockPrisma.userCarousel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            icon: "Film",
            sort: "random",
            direction: "DESC",
          }),
        })
      );
    });

    it("auto-adds new carousel to user carouselPreferences", async () => {
      mockPrisma.userCarousel.count.mockResolvedValue(2);
      mockPrisma.userCarousel.create.mockResolvedValue({
        ...SAMPLE_CAROUSEL,
        id: "42",
      });
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          carouselPreferences: [
            { id: "builtin-1", enabled: true, order: 0 },
            { id: "builtin-2", enabled: true, order: 1 },
          ],
        })
      );
      mockPrisma.user.update.mockResolvedValue(userRow());

      const req = reqFor(createCarousel, {
        body: { title: "Prefs Test", rules: RULES },
        user: USER,
      });
      const res = resFor(createCarousel);
      await createCarousel(req, res);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            carouselPreferences: expect.arrayContaining([
              expect.objectContaining({ id: "custom-42" }),
            ]),
          }),
        })
      );
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.userCarousel.count.mockRejectedValue(new Error("DB error"));

      const req = reqFor(createCarousel, {
        body: { title: "Error Test", rules: RULES },
        user: USER,
      });
      const res = resFor(createCarousel);
      await createCarousel(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // updateCarousel Tests
  // ==========================================================================

  describe("updateCarousel", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(updateCarousel, {
        body: { title: "Updated" },
        params: { id: "1" },
      });
      const res = resFor(updateCarousel);
      await updateCarousel(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when carousel is not found", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(null);

      const req = reqFor(updateCarousel, {
        body: { title: "Updated" },
        params: { id: "999" },
        user: USER,
      });
      const res = resFor(updateCarousel);
      await updateCarousel(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("returns 400 when title is set to empty string", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL);

      const req = reqFor(updateCarousel, {
        body: { title: "" },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCarousel);
      await updateCarousel(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Title/i);
    });

    it("allows partial update (only title)", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL);
      mockPrisma.userCarousel.update.mockResolvedValue({
        ...SAMPLE_CAROUSEL,
        title: "Updated Title",
      });

      const req = reqFor(updateCarousel, {
        body: { title: "Updated Title" },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCarousel);
      await updateCarousel(req, res);

      expect(mockPrisma.userCarousel.update).toHaveBeenCalled();
      const body = res._getOkBody();
      expect(body.carousel.title).toBe("Updated Title");
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.userCarousel.findFirst.mockRejectedValue(
        new Error("DB error")
      );

      const req = reqFor(updateCarousel, {
        body: { title: "Updated" },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCarousel);
      await updateCarousel(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // deleteCarousel Tests
  // ==========================================================================

  describe("deleteCarousel", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(deleteCarousel, { params: { id: "1" } });
      const res = resFor(deleteCarousel);
      await deleteCarousel(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when carousel is not found", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(null);

      const req = reqFor(deleteCarousel, { params: { id: "999" }, user: USER });
      const res = resFor(deleteCarousel);
      await deleteCarousel(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("deletes carousel on happy path", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL);
      mockPrisma.userCarousel.delete.mockResolvedValue(SAMPLE_CAROUSEL);

      const req = reqFor(deleteCarousel, { params: { id: "1" }, user: USER });
      const res = resFor(deleteCarousel);
      await deleteCarousel(req, res);

      expect(mockPrisma.userCarousel.delete).toHaveBeenCalled();
      expect(res._getOkBody().success).toBe(true);
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.userCarousel.findFirst.mockRejectedValue(
        new Error("DB error")
      );

      const req = reqFor(deleteCarousel, { params: { id: "1" }, user: USER });
      const res = resFor(deleteCarousel);
      await deleteCarousel(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // previewCarousel Tests
  // ==========================================================================

  describe("previewCarousel", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(previewCarousel, {
        body: { rules: RULES },
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 when rules are missing", async () => {
      const req = reqFor(previewCarousel, { user: USER });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns scenes from executeCarouselQuery on success", async () => {
      const scenes = [SAMPLE_SCENE, { ...SAMPLE_SCENE, id: "scene-2" }];
      mockQueryBuilder.execute.mockResolvedValue({
        scenes,
        total: scenes.length,
      });
      mockAddStreamability.mockReturnValue(scenes);

      const req = reqFor(previewCarousel, {
        body: {
          rules: RULES,
          sort: "rating",
          direction: "DESC",
        },
        user: USER,
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);

      const body = res._getOkBody();
      expect(body.scenes || body).toBeDefined();
    });

    it("returns 500 on unexpected error", async () => {
      mockQueryBuilder.execute.mockRejectedValue(new Error("Query failed"));

      const req = reqFor(previewCarousel, {
        body: { rules: RULES, sort: "rating" },
        user: USER,
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // executeCarouselById Tests
  // ==========================================================================

  describe("executeCarouselById", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(executeCarouselById, { params: { id: "1" } });
      const res = resFor(executeCarouselById);
      await executeCarouselById(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when carousel is not found", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(null);

      const req = reqFor(executeCarouselById, {
        params: { id: "999" },
        user: USER,
      });
      const res = resFor(executeCarouselById);
      await executeCarouselById(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("executes carousel query and returns scenes on success", async () => {
      const scenes = [SAMPLE_SCENE];
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL);
      mockQueryBuilder.execute.mockResolvedValue({
        scenes,
        total: scenes.length,
      });
      mockAddStreamability.mockReturnValue(scenes);

      const req = reqFor(executeCarouselById, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(executeCarouselById);
      await executeCarouselById(req, res);

      const body = res._getOkBody();
      expect(body.scenes || body.carousel).toBeDefined();
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL);
      mockQueryBuilder.execute.mockRejectedValue(new Error("Execution failed"));

      const req = reqFor(executeCarouselById, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(executeCarouselById);
      await executeCarouselById(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // executeCarouselQuery integration (via previewCarousel)
  // ==========================================================================

  describe("executeCarouselQuery (via previewCarousel)", () => {
    it("uses SceneQueryBuilder SQL path by default", async () => {
      const scenes = [SAMPLE_SCENE];
      mockQueryBuilder.execute.mockResolvedValue({
        scenes,
        total: scenes.length,
      });
      mockAddStreamability.mockReturnValue(scenes);

      const req = reqFor(previewCarousel, {
        body: {
          rules: RULES,
          sort: "rating",
          direction: "DESC",
        },
        user: USER,
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);

      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it("applies addStreamabilityInfo to results", async () => {
      const rawScenes = [SAMPLE_SCENE];
      const streamableScenes = [{ ...SAMPLE_SCENE, streamable: true }];
      mockQueryBuilder.execute.mockResolvedValue({
        scenes: rawScenes,
        total: rawScenes.length,
      });
      mockAddStreamability.mockReturnValue(streamableScenes);

      const req = reqFor(previewCarousel, {
        body: {
          rules: RULES,
          sort: "random",
        },
        user: USER,
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);

      // The viewer decides whether scenes carry the admin-only stashUrl
      expect(mockAddStreamability).toHaveBeenCalledWith(rawScenes, USER);
    });

    it("passes the request user to addStreamabilityInfo for a saved carousel", async () => {
      const scenes = [SAMPLE_SCENE];
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL);
      mockQueryBuilder.execute.mockResolvedValue({
        scenes,
        total: scenes.length,
      });
      mockAddStreamability.mockReturnValue(scenes);

      const req = reqFor(executeCarouselById, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(executeCarouselById);
      await executeCarouselById(req, res);

      expect(mockAddStreamability).toHaveBeenCalledWith(scenes, USER);
    });

    it("passes CAROUSEL_SCENE_LIMIT (12) as perPage to query builder", async () => {
      const scenes = [SAMPLE_SCENE];
      mockQueryBuilder.execute.mockResolvedValue({
        scenes,
        total: scenes.length,
      });
      mockAddStreamability.mockReturnValue(scenes);

      const req = reqFor(previewCarousel, {
        body: {
          rules: RULES,
          sort: "title",
          direction: "ASC",
        },
        user: USER,
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);

      expect(mockQueryBuilder.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          perPage: 12,
        })
      );
    });
  });
});
