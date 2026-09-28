/**
 * Unit Tests for Galleries Library Controller
 *
 * Tests findGalleries and findGalleriesMinimal.
 * Note: mergeGalleriesWithUserData is private and tested indirectly through
 * the handlers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findGalleries,
  findGalleriesMinimal,
} from "../../../controllers/library/galleries.js";
// --- Imports ---

import prisma from "../../../prisma/singleton.js";
import { galleryQueryBuilder } from "../../../services/GalleryQueryBuilder.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import { reqFor, resFor, testUser } from "../../helpers/controllerTestUtils.js";
import { createMockGallery } from "../../helpers/mockDataGenerators.js";
import { must } from "../../helpers/must.js";

// --- Mocks (must come before module import) ---

vi.mock(
  "../../../prisma/singleton.js",
  () => import("../../helpers/prismaSingletonMock.js")
);

vi.mock("../../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getAllGalleries: vi.fn(),
    getGallery: vi.fn(),
    getStudio: vi.fn(),
  },
}));

vi.mock("../../../services/GalleryQueryBuilder.js", () => ({
  galleryQueryBuilder: { execute: vi.fn() },
}));

vi.mock("../../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    filterExcluded: vi.fn().mockImplementation((items: unknown[]) => items),
  },
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("@peek/shared-types/instanceAwareId.js", () => ({
  coerceEntityRefs: vi.fn().mockImplementation((ids: string[]) => ids),
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../utils/seededRandom.js", () => ({
  parseRandomSort: vi.fn().mockImplementation((field: string) => ({
    sortField: field,
    randomSeed: undefined,
  })),
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
      ) => (viewer?.role === "ADMIN" ? `http://stash/galleries/${id}` : null)
    ),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockStashEntityService = vi.mocked(stashEntityService);
const mockGalleryQueryBuilder = vi.mocked(galleryQueryBuilder);

const defaultUser = testUser();
const adminUser = testUser({ role: "ADMIN" });

describe("Galleries Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no ratings
    mockPrisma.galleryRating.findMany.mockResolvedValue([]);
    mockPrisma.imageRating.findMany.mockResolvedValue([]);
  });

  // ─── findGalleries HTTP handler ─────────────────────────────

  describe("findGalleries", () => {
    it("returns galleries from query builder on happy path", async () => {
      const galleries = [createMockGallery({ id: "g1", title: "TestGallery" })];
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        galleries,
        total: 1,
      });

      const req = reqFor(findGalleries, {
        body: { filter: {}, gallery_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getOkBody();
      expect(body.findGalleries.count).toBe(1);
      expect(body.findGalleries.galleries).toHaveLength(1);
    });

    it("adds stashUrl to each gallery for an admin", async () => {
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        galleries: [createMockGallery({ id: "g1" })],
        total: 1,
      });

      const req = reqFor(findGalleries, {
        body: { filter: {}, gallery_filter: {} },
        user: adminUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      expect(must(res._getOkBody().findGalleries.galleries[0])).toHaveProperty(
        "stashUrl",
        "http://stash/galleries/g1"
      );
    });

    it("does not send stashUrl to a regular user", async () => {
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        galleries: [
          createMockGallery({ id: "g1" }),
          createMockGallery({ id: "g2" }),
        ],
        total: 2,
      });

      const req = reqFor(findGalleries, {
        body: { filter: {}, gallery_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      const galleries = res._getOkBody().findGalleries.galleries;
      expect(galleries).toHaveLength(2);
      for (const gallery of galleries)
        expect(gallery).toHaveProperty("stashUrl", null);
    });

    it("returns 400 for ambiguous single-ID lookup", async () => {
      const galleries = [
        createMockGallery({ id: "g1", instanceId: "inst-a" }),
        createMockGallery({ id: "g1", instanceId: "inst-b" }),
      ];
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        galleries,
        total: 2,
      });

      const req = reqFor(findGalleries, {
        body: { ids: ["g1"], filter: {}, gallery_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe("Ambiguous lookup");
    });

    it("returns 500 when query builder throws", async () => {
      mockGalleryQueryBuilder.execute.mockRejectedValue(new Error("DB error"));

      const req = reqFor(findGalleries, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getErrorBody().error).toBe("Failed to find galleries");
    });

    it("fetches detail counts for single-ID lookup", async () => {
      const gallery = createMockGallery({
        id: "g1",
        instanceId: "default",
      });
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        galleries: [gallery],
        total: 1,
      });
      mockStashEntityService.getGallery.mockResolvedValue({
        ...gallery,
        image_count: 42,
      });

      const req = reqFor(findGalleries, {
        body: { ids: ["g1"], filter: {}, gallery_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockStashEntityService.getGallery).toHaveBeenCalledWith(
        "g1",
        "default"
      );
    });
  });

  // ─── findGalleriesMinimal ───────────────────────────────────

  describe("findGalleriesMinimal", () => {
    it("returns minimal galleries on happy path", async () => {
      const galleries = [
        createMockGallery({ id: "g1", title: "Alpha" }),
        createMockGallery({ id: "g2", title: "Beta" }),
      ];
      mockStashEntityService.getAllGalleries.mockResolvedValue(galleries);

      const req = reqFor(findGalleriesMinimal, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().galleries).toHaveLength(2);
    });

    it("returns empty when cache is not initialized", async () => {
      mockStashEntityService.getAllGalleries.mockResolvedValue([]);

      const req = reqFor(findGalleriesMinimal, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().galleries).toEqual([]);
    });

    it("applies search query filtering", async () => {
      const galleries = [
        createMockGallery({ id: "g1", title: "Beach Photos" }),
        createMockGallery({ id: "g2", title: "Urban Shots" }),
      ];
      mockStashEntityService.getAllGalleries.mockResolvedValue(galleries);

      const req = reqFor(findGalleriesMinimal, {
        body: { filter: { q: "beach" } },
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      expect(res._getOkBody().galleries).toHaveLength(1);
    });

    it("applies count_filter with min_image_count", async () => {
      const galleries = [
        createMockGallery({ id: "g1", image_count: 100 }),
        createMockGallery({ id: "g2", image_count: 2 }),
      ];
      mockStashEntityService.getAllGalleries.mockResolvedValue(galleries);

      const req = reqFor(findGalleriesMinimal, {
        body: { filter: {}, count_filter: { min_image_count: 10 } },
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      expect(res._getOkBody().galleries).toHaveLength(1);
    });

    it("sorts by title", async () => {
      const galleries = [
        createMockGallery({ id: "g1", title: "Zebra" }),
        createMockGallery({ id: "g2", title: "Alpha" }),
      ];
      mockStashEntityService.getAllGalleries.mockResolvedValue(galleries);

      const req = reqFor(findGalleriesMinimal, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      const result = res._getOkBody().galleries;
      expect(must(result[0]).title).toBe("Alpha");
      expect(must(result[1]).title).toBe("Zebra");
    });

    it("returns 500 on error", async () => {
      mockStashEntityService.getAllGalleries.mockRejectedValue(
        new Error("fail")
      );

      const req = reqFor(findGalleriesMinimal, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });
});
