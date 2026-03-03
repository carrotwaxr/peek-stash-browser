/**
 * Unit Tests for Clips Controller
 *
 * Tests all 3 clip endpoints: getClips (list with filtering/pagination),
 * getClipById (single clip lookup), getClipsForScene (scene-scoped listing).
 * Covers query param parsing, comma-split arrays, random sort integration,
 * pagination math, not-found handling, and error cases.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock dependencies BEFORE imports
vi.mock("../../services/ClipService.js", () => ({
  clipService: {
    getClips: vi.fn(),
    getClipById: vi.fn(),
    getClipsForScene: vi.fn(),
  },
}));

vi.mock("../../utils/seededRandom.js", () => ({
  parseRandomSort: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { clipService } from "../../services/ClipService.js";
import { parseRandomSort } from "../../utils/seededRandom.js";
import { getClips, getClipById, getClipsForScene } from "../../controllers/clips.js";
import { mockReq, mockRes } from "../helpers/controllerTestUtils.js";

const mockClipService = vi.mocked(clipService);
const mockParseRandomSort = vi.mocked(parseRandomSort);

const USER = { id: 1, username: "testuser", role: "USER" };

describe("Clips Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRandomSort.mockReturnValue({ sortField: "stashCreatedAt", randomSeed: undefined });
  });

  // ─── getClips ─────────────────────────────────────────────────────────────

  describe("getClips", () => {
    it("returns paginated clips with default query params", async () => {
      const clips = [{ id: "c1" }, { id: "c2" }];
      mockClipService.getClips.mockResolvedValue({ clips, total: 2 });

      const req = mockReq({}, {}, USER, {});
      const res = mockRes();

      await getClips(req, res);

      expect(mockParseRandomSort).toHaveBeenCalledWith("stashCreatedAt", 1);
      expect(mockClipService.getClips).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          page: 1,
          perPage: 24,
          sortBy: "stashCreatedAt",
          sortDir: "desc",
          isGenerated: true,
        })
      );
      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toMatchObject({
        clips,
        total: 2,
        page: 1,
        perPage: 24,
        totalPages: 1,
      });
    });

    it("passes all query params through to the service", async () => {
      mockParseRandomSort.mockReturnValue({ sortField: "title", randomSeed: undefined });
      mockClipService.getClips.mockResolvedValue({ clips: [], total: 0 });

      const req = mockReq({}, {}, USER, {
        page: "3",
        perPage: "10",
        sortBy: "title",
        sortDir: "asc",
        isGenerated: "false",
        sceneId: "scene-42",
        tagIds: "t1",
        sceneTagIds: "st1",
        performerIds: "p1",
        studioId: "studio-7",
        q: "search term",
        instanceId: "inst-1",
      });
      const res = mockRes();

      await getClips(req, res);

      expect(mockParseRandomSort).toHaveBeenCalledWith("title", 1);
      expect(mockClipService.getClips).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          page: 3,
          perPage: 10,
          sortBy: "title",
          sortDir: "asc",
          isGenerated: false,
          sceneId: "scene-42",
          tagIds: ["t1"],
          sceneTagIds: ["st1"],
          performerIds: ["p1"],
          studioId: "studio-7",
          q: "search term",
          allowedInstanceIds: ["inst-1"],
        })
      );
    });

    it("splits comma-separated tagIds, sceneTagIds, and performerIds", async () => {
      mockClipService.getClips.mockResolvedValue({ clips: [], total: 0 });

      const req = mockReq({}, {}, USER, {
        tagIds: "t1,t2,t3",
        sceneTagIds: "st1,st2",
        performerIds: "p1,p2,p3,p4",
      });
      const res = mockRes();

      await getClips(req, res);

      expect(mockClipService.getClips).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          tagIds: ["t1", "t2", "t3"],
          sceneTagIds: ["st1", "st2"],
          performerIds: ["p1", "p2", "p3", "p4"],
        })
      );
    });

    it("passes randomSeed from parseRandomSort to the service", async () => {
      mockParseRandomSort.mockReturnValue({ sortField: "random", randomSeed: 42 });
      mockClipService.getClips.mockResolvedValue({ clips: [], total: 0 });

      const req = mockReq({}, {}, USER, { sortBy: "random" });
      const res = mockRes();

      await getClips(req, res);

      expect(mockParseRandomSort).toHaveBeenCalledWith("random", 1);
      expect(mockClipService.getClips).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          sortBy: "random",
          randomSeed: 42,
        })
      );
    });

    it("calculates totalPages correctly", async () => {
      mockClipService.getClips.mockResolvedValue({ clips: [], total: 50 });

      const req = mockReq({}, {}, USER, { perPage: "24" });
      const res = mockRes();

      await getClips(req, res);

      expect(res._getBody()).toMatchObject({ totalPages: 3 }); // ceil(50/24) = 3
    });

    it("returns totalPages 0 when there are no results", async () => {
      mockClipService.getClips.mockResolvedValue({ clips: [], total: 0 });

      const req = mockReq({}, {}, USER, {});
      const res = mockRes();

      await getClips(req, res);

      expect(res._getBody()).toMatchObject({ totalPages: 0, total: 0 });
    });

    it("returns 500 when the service throws", async () => {
      mockClipService.getClips.mockRejectedValue(new Error("DB down"));

      const req = mockReq({}, {}, USER, {});
      const res = mockRes();

      await getClips(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ─── getClipById ──────────────────────────────────────────────────────────

  describe("getClipById", () => {
    it("returns the clip when found", async () => {
      const clip = { id: "c1", title: "Test Clip" };
      mockClipService.getClipById.mockResolvedValue(clip);

      const req = mockReq({}, { id: "c1" }, USER);
      const res = mockRes();

      await getClipById(req, res);

      expect(mockClipService.getClipById).toHaveBeenCalledWith("c1", 1);
      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toEqual(clip);
    });

    it("returns 404 when clip is not found", async () => {
      mockClipService.getClipById.mockResolvedValue(null);

      const req = mockReq({}, { id: "nonexistent" }, USER);
      const res = mockRes();

      await getClipById(req, res);

      expect(res._getStatus()).toBe(404);
      expect(res._getBody()).toMatchObject({ error: "Clip not found" });
    });

    it("returns 500 when the service throws", async () => {
      mockClipService.getClipById.mockRejectedValue(new Error("Unexpected"));

      const req = mockReq({}, { id: "c1" }, USER);
      const res = mockRes();

      await getClipById(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ─── getClipsForScene ─────────────────────────────────────────────────────

  describe("getClipsForScene", () => {
    it("returns clips for a scene with default options", async () => {
      const clips = [{ id: "c1" }, { id: "c2" }];
      mockClipService.getClipsForScene.mockResolvedValue(clips);

      const req = mockReq({}, { id: "scene-1" }, USER, {});
      const res = mockRes();

      await getClipsForScene(req, res);

      expect(mockClipService.getClipsForScene).toHaveBeenCalledWith(
        "scene-1",
        1,
        false,
        undefined
      );
      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toMatchObject({ clips });
    });

    it("passes includeUngenerated=true when query param is set", async () => {
      mockClipService.getClipsForScene.mockResolvedValue([]);

      const req = mockReq({}, { id: "scene-1" }, USER, { includeUngenerated: "true" });
      const res = mockRes();

      await getClipsForScene(req, res);

      expect(mockClipService.getClipsForScene).toHaveBeenCalledWith(
        "scene-1",
        1,
        true,
        undefined
      );
    });

    it("wraps instanceId in an array when provided", async () => {
      mockClipService.getClipsForScene.mockResolvedValue([]);

      const req = mockReq({}, { id: "scene-1" }, USER, { instanceId: "inst-1" });
      const res = mockRes();

      await getClipsForScene(req, res);

      expect(mockClipService.getClipsForScene).toHaveBeenCalledWith(
        "scene-1",
        1,
        false,
        ["inst-1"]
      );
    });

    it("returns 500 when the service throws", async () => {
      mockClipService.getClipsForScene.mockRejectedValue(new Error("Failed"));

      const req = mockReq({}, { id: "scene-1" }, USER, {});
      const res = mockRes();

      await getClipsForScene(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });
});
