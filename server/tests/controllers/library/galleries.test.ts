/**
 * Unit Tests for Galleries Library Controller
 *
 * Tests findGalleries and findGalleriesMinimal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findGalleries,
  findGalleriesMinimal,
} from "../../../controllers/library/galleries.js";
// --- Imports ---

import { galleryQueryBuilder } from "../../../services/GalleryQueryBuilder.js";
import { findMinimalEntities } from "../../../services/MinimalEntityQuery.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../../helpers/controllerTestUtils.js";
import { createMockGallery } from "../../helpers/mockDataGenerators.js";
import { must } from "../../helpers/must.js";

// --- Mocks (must come before module import) ---

vi.mock("../../../services/GalleryQueryBuilder.js", () => ({
  galleryQueryBuilder: { execute: vi.fn() },
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
      ) => (viewer?.role === "ADMIN" ? `http://stash/galleries/${id}` : null)
    ),
}));

const mockGalleryQueryBuilder = vi.mocked(galleryQueryBuilder);
const mockFindMinimalEntities = vi.mocked(findMinimalEntities);

const defaultUser = testUser();
const adminUser = testUser({ role: "ADMIN" });

describe("Galleries Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── findGalleries HTTP handler ─────────────────────────────

  describe("findGalleries", () => {
    it("returns galleries from query builder on happy path", async () => {
      const galleries = [createMockGallery({ id: "g1", title: "TestGallery" })];
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        items: galleries,
        total: 1,
      });

      const req = reqFor(findGalleries, {
        body: { filter: {}, gallery_filter: {} },
        user: defaultUser,
        allowedInstanceIds: ["inst-a", "inst-b"],
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      // The builder reads the parsed request and the viewer's instances
      const call = must(mockGalleryQueryBuilder.execute.mock.calls[0])[0];
      expect(call).toMatchObject({
        allowedInstanceIds: ["inst-a", "inst-b"],
        request: { page: 1, sort: { field: "title", direction: "ASC" } },
      });
      expect(res._getStatus()).toBe(200);
      const body = res._getOkBody();
      expect(body.findGalleries.count).toBe(1);
      expect(body.findGalleries.galleries).toHaveLength(1);
    });

    it("adds stashUrl to each gallery for an admin", async () => {
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        items: [createMockGallery({ id: "g1" })],
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
        items: [
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
        createMockGallery({ id: "101", instanceId: "inst-a" }),
        createMockGallery({ id: "101", instanceId: "inst-b" }),
      ];
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        items: galleries,
        total: 2,
      });

      const req = reqFor(findGalleries, {
        body: { ids: ["101"], filter: {}, gallery_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe("Ambiguous lookup");
    });

    it("a failure reaches the error handler: query builder throws", async () => {
      mockGalleryQueryBuilder.execute.mockRejectedValue(new Error("DB error"));

      const req = reqFor(findGalleries, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await expect(findGalleries(req, res)).rejects.toThrow("DB error");

      expect(res.json).not.toHaveBeenCalled();
    });

    it("a detail answers the builder's row as it is: the card's image count", async () => {
      const gallery = createMockGallery({
        id: "101",
        instanceId: "default",
        image_count: 42,
      });
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        items: [gallery],
        total: 1,
      });

      const req = reqFor(findGalleries, {
        body: { ids: ["101"], filter: {}, gallery_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      expect(res._getOkBody().findGalleries.galleries).toEqual([
        { ...gallery, stashUrl: null },
      ]);
    });
  });

  // ─── findGalleriesMinimal ───────────────────────────────────

  describe("findGalleriesMinimal", () => {
    it("passes req.allowedInstanceIds to the builder or service: one page from findMinimalEntities, for the parsed request", async () => {
      const rows = [{ id: "1", instanceId: "inst-a", name: "Alpha" }];
      mockFindMinimalEntities.mockResolvedValue(rows);
      const req = reqFor(findGalleriesMinimal, {
        body: {
          ids: ["1:inst-a"],
          filter: { q: " al ", per_page: 20 },
          count_filter: { min_scene_count: 1 },
        },
        user: defaultUser,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      expect(mockFindMinimalEntities).toHaveBeenCalledWith(
        defaultUser,
        {
          entity: "gallery",
          q: "al",
          perPage: 20,
          ids: [{ id: "1", instanceId: "inst-a" }],
          countFilter: { min_scene_count: 1 },
        },
        ["inst-a"]
      );
      expect(res._getOkBody()).toEqual({ galleries: rows });
    });

    it("a sort field answers 400 before any query: the pickers always list by name", async () => {
      const req = reqFor(findGalleriesMinimal, {
        body: malformed({ filter: { sort: "name" } }),
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await expect(findGalleriesMinimal(req, res)).rejects.toMatchObject({
        statusCode: 400,
        issues: [{ path: "filter.sort" }],
      });
      expect(mockFindMinimalEntities).not.toHaveBeenCalled();
    });

    it("a query error reaches the central error handler", async () => {
      mockFindMinimalEntities.mockRejectedValue(new Error("fail"));
      const req = reqFor(findGalleriesMinimal, { user: defaultUser });
      const res = resFor(findGalleriesMinimal);

      await expect(findGalleriesMinimal(req, res)).rejects.toThrow("fail");
    });
  });
});
