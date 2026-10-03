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
import type { InstanceAwareId } from "@peek/shared-types/instanceAwareId.js";
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
import { addStashUrl } from "../../controllers/library/scenes.js";
import { CriterionModifier } from "../../graphql/types.js";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import type { NormalizedScene } from "../../types/index.js";
import type { ParsedListRequest } from "../../types/parsedFilters.js";
import type { PeekSceneFilter } from "../../types/peekFilters.js";
import { logger } from "../../utils/logger.js";
import { authenticated, libraryHandler } from "../../utils/routeHelpers.js";
import { whereOfFlatFilter } from "../../utils/whereTree.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { userRow } from "../helpers/fixtures.js";
import { arrayContaining, objectContaining } from "../helpers/matchers.js";
import { createMockScene } from "../helpers/mockDataGenerators.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock Prisma - hoisted before imports
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock SceneQueryBuilder
vi.mock("../../services/SceneQueryBuilder.js", () => ({
  sceneQueryBuilder: {
    execute: vi.fn(),
  },
}));

// The user's instances: enabled, selected and past their first sync
// Mock library/scenes helpers
vi.mock("../../controllers/library/scenes.js", () => ({
  addStashUrl: vi.fn((scenes: unknown[]) => scenes),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockQueryBuilder = vi.mocked(sceneQueryBuilder);
const mockAddStashUrl = vi.mocked(addStashUrl);
const mockLogger = vi.mocked(logger, true);

const USER = { id: 1, username: "testuser", role: "USER" };

/** A carousel's rules: the scene filter the client saves with it */
const RULES: PeekSceneFilter = {
  rating100: { value: 80, modifier: CriterionModifier.GreaterThan },
};

/** RULES as the tree a carousel stores */
const RULES_TREE = {
  match: "all",
  rules: [
    { field: "rating100", criterion: { value: 80, modifier: "GREATER_THAN" } },
  ],
};

/** A tree with a group: a favourite performer or a favourite tag */
const ANY_TREE = {
  match: "all",
  rules: [
    {
      match: "any",
      rules: [
        { field: "performer_favorite", criterion: true },
        { field: "tag_favorite", criterion: true },
      ],
    },
  ],
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

/** Scenes as addStashUrl returns them to a regular user */
const withStashUrl = (scenes: NormalizedScene[]) =>
  scenes.map((scene) => ({ ...scene, stashUrl: null }));

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
      await authenticated(getUserCarousels)(req, res, vi.fn());
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
      expect(Array.isArray(body.carousels)).toBe(true);
    });

    it("a failure reaches the error handler: unexpected error", async () => {
      mockPrisma.userCarousel.findMany.mockRejectedValue(new Error("DB error"));

      const req = reqFor(getUserCarousels, { user: USER });
      const res = resFor(getUserCarousels);
      await expect(getUserCarousels(req, res)).rejects.toThrow("DB error");

      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getCarousel Tests
  // ==========================================================================

  describe("getCarousel", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(getCarousel, { params: { id: "1" } });
      const res = resFor(getCarousel);
      await authenticated(getCarousel)(req, res, vi.fn());
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

    it("GET serves a flat stored row as a tree, and a stored tree as it is", async () => {
      // RULES as the JSON column holds it
      const flat = { rating100: { value: 80, modifier: "GREATER_THAN" } };
      for (const [stored, served] of [
        [flat, RULES_TREE],
        [ANY_TREE, ANY_TREE],
      ] as const) {
        mockPrisma.userCarousel.findFirst.mockResolvedValue({
          ...SAMPLE_CAROUSEL,
          rules: stored,
        });
        const req = reqFor(getCarousel, { params: { id: "1" }, user: USER });
        const res = resFor(getCarousel);
        await getCarousel(req, res);

        expect(res._getOkBody().carousel.rules).toEqual(served);
      }
    });

    it('GET serves stored rules of neither shape as { match: "all", rules: [] }', async () => {
      for (const stored of [SAMPLE_CAROUSEL.rules, null, ["x"], 7]) {
        mockPrisma.userCarousel.findMany.mockResolvedValue([
          { ...SAMPLE_CAROUSEL, rules: stored },
        ]);
        const req = reqFor(getUserCarousels, { user: USER });
        const res = resFor(getUserCarousels);
        await getUserCarousels(req, res);

        expect(
          must(res._getOkBody().carousels[0]).rules,
          JSON.stringify(stored)
        ).toEqual({ match: "all", rules: [] });
      }
    });

    it("a failure reaches the error handler: unexpected error", async () => {
      mockPrisma.userCarousel.findFirst.mockRejectedValue(
        new Error("DB error")
      );

      const req = reqFor(getCarousel, { params: { id: "1" }, user: USER });
      const res = resFor(getCarousel);
      await expect(getCarousel(req, res)).rejects.toThrow("DB error");

      expect(res.json).not.toHaveBeenCalled();
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
      await authenticated(createCarousel)(req, res, vi.fn());
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
          data: objectContaining({
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
          data: objectContaining({
            icon: "Film",
            sort: "random",
            direction: "DESC",
          }),
        })
      );
    });

    it("stores the sort and direction as the parser read them", async () => {
      mockPrisma.userCarousel.count.mockResolvedValue(0);
      mockPrisma.userCarousel.create.mockResolvedValue(SAMPLE_CAROUSEL);
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({ id: 1, carouselPreferences: null })
      );
      mockPrisma.user.update.mockResolvedValue(userRow());

      const req = reqFor(createCarousel, {
        body: { title: "Lower", rules: RULES, sort: "title", direction: "asc" },
        user: USER,
      });
      const res = resFor(createCarousel);
      await createCarousel(req, res);

      expect(res._getStatus()).toBe(201);
      expect(mockPrisma.userCarousel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            rules: RULES_TREE,
            sort: "title",
            direction: "ASC",
          }),
        })
      );
    });

    it.each([
      ["rules.not_a_field", { not_a_field: { value: 1 } }, "random"],
      ["sort", RULES, "bogus"],
    ])(
      "a bad %s answers 400 and stores nothing",
      async (path, rules: object, sort: string) => {
        const req = reqFor(createCarousel, {
          body: malformed({ title: "Bad", rules, sort }),
          user: USER,
        });
        const res = resFor(createCarousel);

        await expect(createCarousel(req, res)).rejects.toMatchObject({
          statusCode: 400,
          issues: [{ path }],
        });
        expect(mockPrisma.userCarousel.create).not.toHaveBeenCalled();
      }
    );

    it("create stores the tree, from either shape", async () => {
      for (const [body, stored] of [
        [RULES, whereOfFlatFilter(RULES)],
        [ANY_TREE, ANY_TREE],
      ] as const) {
        vi.clearAllMocks();
        mockPrisma.userCarousel.count.mockResolvedValue(0);
        mockPrisma.userCarousel.create.mockResolvedValue(SAMPLE_CAROUSEL);
        mockPrisma.user.findUnique.mockResolvedValue(
          partialRow({ id: 1, carouselPreferences: null })
        );
        mockPrisma.user.update.mockResolvedValue(userRow());

        const req = reqFor(createCarousel, {
          body: { title: "Tree", rules: body },
          user: USER,
        });
        const res = resFor(createCarousel);
        await createCarousel(req, res);

        expect(res._getStatus()).toBe(201);
        expect(
          must(mockPrisma.userCarousel.create.mock.calls[0])[0].data.rules
        ).toEqual(stored);
      }
    });

    it("a flat body naming ids or instance_id answers 400 and stores nothing: a tree cannot hold them", async () => {
      for (const [rules, path] of [
        [{ ...RULES, ids: { value: ["1:a"] } }, "rules.ids"],
        [{ ...RULES, instance_id: "a" }, "rules.instance_id"],
      ] as const) {
        const req = reqFor(createCarousel, {
          body: malformed({ title: "Ids", rules }),
          user: USER,
        });
        await expect(
          createCarousel(req, resFor(createCarousel))
        ).rejects.toMatchObject({ statusCode: 400, issues: [{ path }] });
      }
      expect(mockPrisma.userCarousel.create).not.toHaveBeenCalled();
    });

    it("a tree over the limits is a 400", async () => {
      const rules = {
        match: "any",
        rules: Array.from({ length: 21 }, () => ({
          field: "favorite",
          criterion: true,
        })),
      };
      const req = reqFor(createCarousel, {
        body: malformed({ title: "Big", rules }),
        user: USER,
      });

      await expect(
        createCarousel(req, resFor(createCarousel))
      ).rejects.toMatchObject({
        statusCode: 400,
        issues: [{ path: "rules", message: "At most 20 rows" }],
      });
      expect(mockPrisma.userCarousel.create).not.toHaveBeenCalled();
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
          data: objectContaining({
            carouselPreferences: arrayContaining([
              expect.objectContaining({ id: "custom-42" }),
            ]),
          }),
        })
      );
    });

    it("a failure reaches the error handler: unexpected error", async () => {
      mockPrisma.userCarousel.count.mockRejectedValue(new Error("DB error"));

      const req = reqFor(createCarousel, {
        body: { title: "Error Test", rules: RULES },
        user: USER,
      });
      const res = resFor(createCarousel);
      await expect(createCarousel(req, res)).rejects.toThrow("DB error");

      expect(res.json).not.toHaveBeenCalled();
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
      await authenticated(updateCarousel)(req, res, vi.fn());
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

    it("updates only the parts sent, sort and direction as the parser read them", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL);
      mockPrisma.userCarousel.update.mockResolvedValue(SAMPLE_CAROUSEL);

      const req = reqFor(updateCarousel, {
        body: { direction: "asc" },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCarousel);
      await updateCarousel(req, res);

      expect(mockPrisma.userCarousel.update).toHaveBeenCalledWith({
        where: { id: "1" },
        data: { direction: "ASC" },
      });
    });

    it("a full update saves the icon, the rules, the sort field and the direction", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL);
      mockPrisma.userCarousel.update.mockResolvedValue(SAMPLE_CAROUSEL);

      const req = reqFor(updateCarousel, {
        body: {
          title: "  New  ",
          icon: "star",
          rules: RULES,
          sort: "rating",
          direction: "DESC",
        },
        params: { id: "1" },
        user: USER,
      });
      await updateCarousel(req, resFor(updateCarousel));

      const data = mockPrisma.userCarousel.update.mock.calls[0]?.[0].data;
      expect(data).toMatchObject({
        title: "New",
        icon: "star",
        rules: RULES_TREE,
        direction: "DESC",
      });
      expect(data).toHaveProperty("sort");
    });

    it("direction sideways answers 400 and updates nothing", async () => {
      const req = reqFor(updateCarousel, {
        body: { direction: "sideways" },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCarousel);

      await expect(updateCarousel(req, res)).rejects.toMatchObject({
        statusCode: 400,
        issues: [{ path: "direction" }],
      });
      expect(mockPrisma.userCarousel.update).not.toHaveBeenCalled();
    });

    it("a failure reaches the error handler: unexpected error", async () => {
      mockPrisma.userCarousel.findFirst.mockRejectedValue(
        new Error("DB error")
      );

      const req = reqFor(updateCarousel, {
        body: { title: "Updated" },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updateCarousel);
      await expect(updateCarousel(req, res)).rejects.toThrow("DB error");

      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // deleteCarousel Tests
  // ==========================================================================

  describe("deleteCarousel", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(deleteCarousel, { params: { id: "1" } });
      const res = resFor(deleteCarousel);
      await authenticated(deleteCarousel)(req, res, vi.fn());
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

    it("a failure reaches the error handler: unexpected error", async () => {
      mockPrisma.userCarousel.findFirst.mockRejectedValue(
        new Error("DB error")
      );

      const req = reqFor(deleteCarousel, { params: { id: "1" }, user: USER });
      const res = resFor(deleteCarousel);
      await expect(deleteCarousel(req, res)).rejects.toThrow("DB error");

      expect(res.json).not.toHaveBeenCalled();
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
      await libraryHandler(previewCarousel)(req, res, vi.fn());
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 when rules are missing", async () => {
      const req = reqFor(previewCarousel, {
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns scenes from executeCarouselQuery on success", async () => {
      const scenes = [SAMPLE_SCENE, { ...SAMPLE_SCENE, id: "scene-2" }];
      mockQueryBuilder.execute.mockResolvedValue({
        items: scenes,
        total: scenes.length,
      });
      mockAddStashUrl.mockReturnValue(withStashUrl(scenes));

      const req = reqFor(previewCarousel, {
        body: {
          rules: RULES,
          sort: "rating",
          direction: "DESC",
        },
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);

      const body = res._getOkBody();
      expect(body.scenes).toBeDefined();
    });

    it("a failure reaches the error handler: unexpected error", async () => {
      mockQueryBuilder.execute.mockRejectedValue(new Error("Query failed"));

      const req = reqFor(previewCarousel, {
        body: { rules: RULES, sort: "rating" },
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(previewCarousel);
      await expect(previewCarousel(req, res)).rejects.toThrow("Query failed");

      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // executeCarouselById Tests
  // ==========================================================================

  describe("executeCarouselById", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(executeCarouselById, { params: { id: "1" } });
      const res = resFor(executeCarouselById);
      await libraryHandler(executeCarouselById)(req, res, vi.fn());
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when carousel is not found", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(null);

      const req = reqFor(executeCarouselById, {
        params: { id: "999" },
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(executeCarouselById);
      await executeCarouselById(req, res);

      expect(res._getStatus()).toBe(404);
    });

    it("executes carousel query and returns scenes on success", async () => {
      const scenes = [SAMPLE_SCENE];
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL);
      mockQueryBuilder.execute.mockResolvedValue({
        items: scenes,
        total: scenes.length,
      });
      mockAddStashUrl.mockReturnValue(withStashUrl(scenes));

      const req = reqFor(executeCarouselById, {
        params: { id: "1" },
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(executeCarouselById);
      await executeCarouselById(req, res);

      const body = res._getOkBody();
      expect(body.scenes).toBeDefined();
    });

    it("executing a carousel whose stored rule has an unknown key lists the scenes and logs the ignored path once", async () => {
      const scenes = [SAMPLE_SCENE];
      mockPrisma.userCarousel.findFirst.mockResolvedValue({
        ...SAMPLE_CAROUSEL,
        id: "stale-rule",
        rules: { a1_not_a_field: { value: 1 } },
      });
      mockQueryBuilder.execute.mockResolvedValue({
        items: scenes,
        total: scenes.length,
      });
      mockAddStashUrl.mockReturnValue(withStashUrl(scenes));
      mockLogger.warn.mockClear();

      for (const attempt of [1, 2]) {
        const req = reqFor(executeCarouselById, {
          params: { id: "stale-rule" },
          user: USER,
          allowedInstanceIds: ["inst-a"],
        });
        const res = resFor(executeCarouselById);
        await executeCarouselById(req, res);
        expect(res._getStatus(), `request ${attempt}`).toBe(200);
        expect(res._getOkBody().scenes).toHaveLength(1);
      }

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Stored carousel rule ignored",
        objectContaining({
          carouselId: "stale-rule",
          path: "rules.a1_not_a_field",
        })
      );
    });

    it("a failure reaches the error handler: unexpected error", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL);
      mockQueryBuilder.execute.mockRejectedValue(new Error("Execution failed"));

      const req = reqFor(executeCarouselById, {
        params: { id: "1" },
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(executeCarouselById);
      await expect(executeCarouselById(req, res)).rejects.toThrow(
        "Execution failed"
      );

      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // executeCarouselQuery integration (via previewCarousel)
  // ==========================================================================

  describe("executeCarouselQuery (via previewCarousel)", () => {
    it("runs the carousel query through SceneQueryBuilder", async () => {
      const scenes = [SAMPLE_SCENE];
      mockQueryBuilder.execute.mockResolvedValue({
        items: scenes,
        total: scenes.length,
      });
      mockAddStashUrl.mockReturnValue(withStashUrl(scenes));

      const req = reqFor(previewCarousel, {
        body: {
          rules: RULES,
          sort: "rating",
          direction: "DESC",
        },
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);

      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it("runs the carousel query in the viewer's time zone", async () => {
      mockQueryBuilder.execute.mockResolvedValue({ items: [], total: 0 });
      mockAddStashUrl.mockReturnValue([]);

      const req = reqFor(previewCarousel, {
        body: { rules: RULES, sort: "rating", direction: "DESC" },
        user: USER,
        allowedInstanceIds: ["inst-a"],
        timeZone: "Asia/Kolkata",
      });
      await previewCarousel(req, resFor(previewCarousel));

      expect(must(mockQueryBuilder.execute.mock.lastCall)[0].timeZone).toBe(
        "Asia/Kolkata"
      );
    });

    it("applies addStashUrl to results", async () => {
      const rawScenes = [SAMPLE_SCENE];
      const scenesWithUrl = [{ ...SAMPLE_SCENE, stashUrl: null }];
      mockQueryBuilder.execute.mockResolvedValue({
        items: rawScenes,
        total: rawScenes.length,
      });
      mockAddStashUrl.mockReturnValue(scenesWithUrl);

      const req = reqFor(previewCarousel, {
        body: {
          rules: RULES,
          sort: "random",
        },
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);

      // The viewer decides whether scenes carry the admin-only stashUrl
      expect(mockAddStashUrl).toHaveBeenCalledWith(rawScenes, USER);
    });

    it("passes the request user to addStashUrl for a saved carousel", async () => {
      const scenes = [SAMPLE_SCENE];
      mockPrisma.userCarousel.findFirst.mockResolvedValue(SAMPLE_CAROUSEL);
      mockQueryBuilder.execute.mockResolvedValue({
        items: scenes,
        total: scenes.length,
      });
      mockAddStashUrl.mockReturnValue(withStashUrl(scenes));

      const req = reqFor(executeCarouselById, {
        params: { id: "1" },
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(executeCarouselById);
      await executeCarouselById(req, res);

      expect(mockAddStashUrl).toHaveBeenCalledWith(scenes, USER);
    });

    it("passes req.allowedInstanceIds to the builder or service, with the parsed filter and sort", async () => {
      mockQueryBuilder.execute.mockResolvedValue({ items: [], total: 0 });
      mockAddStashUrl.mockReturnValue([]);

      const req = reqFor(previewCarousel, {
        body: {
          rules: {
            ...RULES,
            performers: {
              value: ["7:inst-a"] as InstanceAwareId[],
              modifier: CriterionModifier.Includes,
            },
          },
          sort: "title",
          direction: "asc",
        },
        user: USER,
        allowedInstanceIds: ["inst-a", "inst-b"],
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);

      expect(mockQueryBuilder.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          allowedInstanceIds: ["inst-a", "inst-b"],
          request: objectContaining<ParsedListRequest<"scene">>({
            filter: {},
            where: {
              match: "all",
              rules: [
                {
                  field: "rating100",
                  criterion: { value: 80, modifier: "GREATER_THAN" },
                },
                {
                  field: "performers",
                  criterion: {
                    refs: [{ id: "7", instanceId: "inst-a" }],
                    modifier: "INCLUDES",
                    depth: 0,
                  },
                },
              ],
            },
            sort: { field: "title", direction: "ASC", seed: undefined },
            page: 1,
          }),
        })
      );
    });

    it("preview runs a group", async () => {
      mockQueryBuilder.execute.mockResolvedValue({ items: [], total: 0 });
      mockAddStashUrl.mockReturnValue([]);

      const req = reqFor(previewCarousel, {
        body: { rules: ANY_TREE, sort: "title", direction: "ASC" },
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      await previewCarousel(req, resFor(previewCarousel));

      const { request } = must(mockQueryBuilder.execute.mock.lastCall)[0];
      expect(request.filter).toEqual({});
      expect(request.where).toEqual(ANY_TREE);
    });

    it("a random carousel gets a new seed each load", async () => {
      mockQueryBuilder.execute.mockResolvedValue({ items: [], total: 0 });
      mockAddStashUrl.mockReturnValue([]);
      const before = Date.now();

      const req = reqFor(previewCarousel, {
        body: { rules: RULES },
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);

      const { sort } = must(mockQueryBuilder.execute.mock.calls[0])[0].request;
      expect(sort.field).toBe("random");
      expect(sort.direction).toBe("DESC");
      expect(sort.seed).toBeGreaterThanOrEqual(1 + before);
    });

    it("a stored carousel's unknown rule key and sort are left out, not refused", async () => {
      mockPrisma.userCarousel.findFirst.mockResolvedValue({
        ...SAMPLE_CAROUSEL,
        rules: { not_a_field: { value: 1 }, favorite: true },
        sort: "constructor",
        direction: "DESC",
      });
      mockQueryBuilder.execute.mockResolvedValue({ items: [], total: 0 });
      mockAddStashUrl.mockReturnValue([]);

      const req = reqFor(executeCarouselById, {
        params: { id: "1" },
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(executeCarouselById);
      await executeCarouselById(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockQueryBuilder.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedInstanceIds: ["inst-a"],
          request: objectContaining<ParsedListRequest<"scene">>({
            filter: {},
            where: {
              match: "all",
              rules: [{ field: "favorite", criterion: true }],
            },
            sort: { field: "created_at", direction: "DESC", seed: undefined },
            perPage: 12,
          }),
        })
      );
    });

    it("a preview with an unknown rule key answers 400 before any query", async () => {
      const req = reqFor(previewCarousel, {
        body: malformed({ rules: { not_a_field: { value: 1 } } }),
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(previewCarousel);

      await expect(previewCarousel(req, res)).rejects.toMatchObject({
        statusCode: 400,
        issues: [{ path: "rules.not_a_field" }],
      });
      expect(mockQueryBuilder.execute).not.toHaveBeenCalled();
    });

    it("passes CAROUSEL_SCENE_LIMIT (12) as perPage to query builder", async () => {
      const scenes = [SAMPLE_SCENE];
      mockQueryBuilder.execute.mockResolvedValue({
        items: scenes,
        total: scenes.length,
      });
      mockAddStashUrl.mockReturnValue(withStashUrl(scenes));

      const req = reqFor(previewCarousel, {
        body: {
          rules: RULES,
          sort: "title",
          direction: "ASC",
        },
        user: USER,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(previewCarousel);
      await previewCarousel(req, res);

      expect(mockQueryBuilder.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          request: objectContaining<ParsedListRequest<"scene">>({
            perPage: 12,
          }),
        })
      );
    });
  });
});
