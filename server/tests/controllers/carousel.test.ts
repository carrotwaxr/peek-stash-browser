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
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Prisma - hoisted before imports
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    userCarousel: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

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
    filterExcluded: vi.fn((scenes: any[]) => scenes),
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
  mergeScenesWithUserData: vi.fn((scenes: any[]) => scenes),
  applyQuickSceneFilters: vi.fn((scenes: any[]) => scenes),
  applyExpensiveSceneFilters: vi.fn((scenes: any[]) => scenes),
  sortScenes: vi.fn((scenes: any[]) => scenes),
  addStreamabilityInfo: vi.fn((scenes: any[]) => scenes),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { addStreamabilityInfo } from "../../controllers/library/scenes.js";
import {
  getUserCarousels,
  getCarousel,
  createCarousel,
  updateCarousel,
  deleteCarousel,
  previewCarousel,
  executeCarouselById,
} from "../../controllers/carousel.js";
import { mockReq, mockRes } from "../helpers/controllerTestUtils.js";

const mockPrisma = vi.mocked(prisma);
const mockQueryBuilder = vi.mocked(sceneQueryBuilder);
const mockAddStreamability = vi.mocked(addStreamabilityInfo);

const USER = { id: 1, username: "testuser", role: "USER" };

/** Sample carousel record from the database */
const SAMPLE_CAROUSEL = {
  id: 1,
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
const SAMPLE_SCENE = {
  id: "scene-1",
  title: "Test Scene",
  rating100: 90,
  stashInstanceId: "instance-1",
};

describe("Carousel Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // getUserCarousels Tests
  // ==========================================================================

  describe("getUserCarousels", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = mockReq();
      const res = mockRes();
      await getUserCarousels(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns array of user carousels on success", async () => {
      const carousels = [SAMPLE_CAROUSEL, { ...SAMPLE_CAROUSEL, id: 2, title: "Recent" }];
      mockPrisma.userCarousel.findMany.mockResolvedValue(carousels as any);

      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getUserCarousels(req, res);

      expect(mockPrisma.userCarousel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
        })
      );
      const body = res._getBody();
      expect(Array.isArray(body.carousels || body)).toBe(true);
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.userCarousel.findMany.mockRejectedValue(new Error("DB error"));

      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getUserCarousels(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // getCarousel Tests
  // ==========================================================================

  describe("getCarousel", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = mockReq({}, { id: "1" });
      const res = mockRes();
      await getCarousel(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when carousel is not found", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(null);

      const req = mockReq({}, { id: "999" }, USER);
      const res = mockRes();
      await getCarousel(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("returns carousel on success", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL as any);

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();
      await getCarousel(req, res);

      const body = res._getBody();
      expect(body.id || body.carousel?.id).toBeDefined();
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.userCarousel.findFirst.mockRejectedValue(new Error("DB error"));

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();
      await getCarousel(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // createCarousel Tests
  // ==========================================================================

  describe("createCarousel", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = mockReq({ title: "New", rules: [{ field: "rating" }] });
      const res = mockRes();
      await createCarousel(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 when title is empty", async () => {
      const req = mockReq({ title: "", rules: [{ field: "rating" }] }, {}, USER);
      const res = mockRes();
      await createCarousel(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Title is required/i);
    });

    it("returns 400 when title is missing", async () => {
      const req = mockReq({ rules: [{ field: "rating" }] }, {}, USER);
      const res = mockRes();
      await createCarousel(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when rules are missing", async () => {
      const req = mockReq({ title: "New Carousel" }, {}, USER);
      const res = mockRes();
      await createCarousel(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Rules are required/i);
    });

    it("returns 400 when user is at maximum carousel limit (15)", async () => {
      mockPrisma.userCarousel.count.mockResolvedValue(15);

      const req = mockReq(
        { title: "One Too Many", rules: [{ field: "rating" }] },
        {},
        USER
      );
      const res = mockRes();
      await createCarousel(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Maximum 15/i);
    });

    it("creates carousel with defaults on happy path", async () => {
      mockPrisma.userCarousel.count.mockResolvedValue(3);
      mockPrisma.userCarousel.create.mockResolvedValue({
        ...SAMPLE_CAROUSEL,
        id: 10,
        title: "New Carousel",
        icon: "Film",
        sort: "random",
        direction: "DESC",
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        carouselPreferences: [],
      } as any);
      mockPrisma.user.update.mockResolvedValue({} as any);

      const req = mockReq(
        { title: "New Carousel", rules: [{ field: "rating", operator: "gte", value: 50 }] },
        {},
        USER
      );
      const res = mockRes();
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
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        carouselPreferences: null as any,
      } as any);
      mockPrisma.user.update.mockResolvedValue({} as any);

      const req = mockReq(
        { title: "Defaults Test", rules: [{ field: "tag", value: "action" }] },
        {},
        USER
      );
      const res = mockRes();
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
        id: 42,
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        carouselPreferences: [
          { id: "builtin-1", enabled: true, order: 0 },
          { id: "builtin-2", enabled: true, order: 1 },
        ],
      } as any);
      mockPrisma.user.update.mockResolvedValue({} as any);

      const req = mockReq(
        { title: "Prefs Test", rules: [{ field: "rating" }] },
        {},
        USER
      );
      const res = mockRes();
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

      const req = mockReq(
        { title: "Error Test", rules: [{ field: "rating" }] },
        {},
        USER
      );
      const res = mockRes();
      await createCarousel(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // updateCarousel Tests
  // ==========================================================================

  describe("updateCarousel", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = mockReq({ title: "Updated" }, { id: "1" });
      const res = mockRes();
      await updateCarousel(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when carousel is not found", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(null);

      const req = mockReq({ title: "Updated" }, { id: "999" }, USER);
      const res = mockRes();
      await updateCarousel(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("returns 400 when title is set to empty string", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL as any);

      const req = mockReq({ title: "" }, { id: "1" }, USER);
      const res = mockRes();
      await updateCarousel(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Title/i);
    });

    it("allows partial update (only title)", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL as any);
      mockPrisma.userCarousel.update.mockResolvedValue({
        ...SAMPLE_CAROUSEL,
        title: "Updated Title",
      } as any);

      const req = mockReq({ title: "Updated Title" }, { id: "1" }, USER);
      const res = mockRes();
      await updateCarousel(req, res);

      expect(mockPrisma.userCarousel.update).toHaveBeenCalled();
      const body = res._getBody();
      expect(body.title || body.carousel?.title).toBe("Updated Title");
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.userCarousel.findFirst.mockRejectedValue(new Error("DB error"));

      const req = mockReq({ title: "Updated" }, { id: "1" }, USER);
      const res = mockRes();
      await updateCarousel(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // deleteCarousel Tests
  // ==========================================================================

  describe("deleteCarousel", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = mockReq({}, { id: "1" });
      const res = mockRes();
      await deleteCarousel(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when carousel is not found", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(null);

      const req = mockReq({}, { id: "999" }, USER);
      const res = mockRes();
      await deleteCarousel(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("deletes carousel on happy path", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL as any);
      mockPrisma.userCarousel.delete.mockResolvedValue(SAMPLE_CAROUSEL as any);

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();
      await deleteCarousel(req, res);

      expect(mockPrisma.userCarousel.delete).toHaveBeenCalled();
      expect(res._getBody().success).toBe(true);
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.userCarousel.findFirst.mockRejectedValue(new Error("DB error"));

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();
      await deleteCarousel(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // previewCarousel Tests
  // ==========================================================================

  describe("previewCarousel", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = mockReq({ rules: [{ field: "rating" }] });
      const res = mockRes();
      await previewCarousel(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 when rules are missing", async () => {
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await previewCarousel(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns scenes from executeCarouselQuery on success", async () => {
      const scenes = [SAMPLE_SCENE, { ...SAMPLE_SCENE, id: "scene-2" }];
      mockQueryBuilder.execute.mockResolvedValue({ scenes } as any);
      mockAddStreamability.mockReturnValue(scenes as any);

      const req = mockReq(
        {
          rules: [{ field: "rating", operator: "gte", value: 80 }],
          sort: "rating",
          direction: "DESC",
        },
        {},
        USER
      );
      const res = mockRes();
      await previewCarousel(req, res);

      const body = res._getBody();
      expect(body.scenes || body).toBeDefined();
    });

    it("returns 500 on unexpected error", async () => {
      mockQueryBuilder.execute.mockRejectedValue(new Error("Query failed"));

      const req = mockReq(
        { rules: [{ field: "rating" }], sort: "rating" },
        {},
        USER
      );
      const res = mockRes();
      await previewCarousel(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // executeCarouselById Tests
  // ==========================================================================

  describe("executeCarouselById", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = mockReq({}, { id: "1" });
      const res = mockRes();
      await executeCarouselById(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when carousel is not found", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(null);

      const req = mockReq({}, { id: "999" }, USER);
      const res = mockRes();
      await executeCarouselById(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("executes carousel query and returns scenes on success", async () => {
      const scenes = [SAMPLE_SCENE];
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL as any);
      mockQueryBuilder.execute.mockResolvedValue({ scenes } as any);
      mockAddStreamability.mockReturnValue(scenes as any);

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();
      await executeCarouselById(req, res);

      const body = res._getBody();
      expect(body.scenes || body.carousel).toBeDefined();
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL as any);
      mockQueryBuilder.execute.mockRejectedValue(new Error("Execution failed"));

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();
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
      mockQueryBuilder.execute.mockResolvedValue({ scenes } as any);
      mockAddStreamability.mockReturnValue(scenes as any);

      const req = mockReq(
        {
          rules: [{ field: "rating", operator: "gte", value: 70 }],
          sort: "rating",
          direction: "DESC",
        },
        {},
        USER
      );
      const res = mockRes();
      await previewCarousel(req, res);

      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it("applies addStreamabilityInfo to results", async () => {
      const rawScenes = [SAMPLE_SCENE];
      const streamableScenes = [{ ...SAMPLE_SCENE, streamable: true }];
      mockQueryBuilder.execute.mockResolvedValue({ scenes: rawScenes } as any);
      mockAddStreamability.mockReturnValue(streamableScenes as any);

      const req = mockReq(
        {
          rules: [{ field: "tag", value: "action" }],
          sort: "random",
        },
        {},
        USER
      );
      const res = mockRes();
      await previewCarousel(req, res);

      expect(mockAddStreamability).toHaveBeenCalled();
    });

    it("passes CAROUSEL_SCENE_LIMIT (12) as perPage to query builder", async () => {
      const scenes = [SAMPLE_SCENE];
      mockQueryBuilder.execute.mockResolvedValue({ scenes } as any);
      mockAddStreamability.mockReturnValue(scenes as any);

      const req = mockReq(
        {
          rules: [{ field: "rating", operator: "gte", value: 0 }],
          sort: "title",
          direction: "ASC",
        },
        {},
        USER
      );
      const res = mockRes();
      await previewCarousel(req, res);

      expect(mockQueryBuilder.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          perPage: 12,
        })
      );
    });
  });
});
