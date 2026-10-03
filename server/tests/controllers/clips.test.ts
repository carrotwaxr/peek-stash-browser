/**
 * Unit Tests for Clips Controller
 *
 * Tests all 3 clip endpoints: getClips (list with filtering/pagination),
 * getClipById (single clip lookup), getClipsForScene (scene-scoped listing).
 * Covers query param parsing through the request parser (reject mode, from
 * vitest.config), comma-split arrays, random sort seeds, pagination math and
 * its clamp, the user's allowed instances reaching every read, not-found
 * handling, and error cases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getClipById,
  getClips,
  getClipsForScene,
} from "../../controllers/clips.js";
import {
  type ClipWithRelations,
  clipService,
} from "../../services/ClipService.js";
import { reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock dependencies BEFORE imports
vi.mock("../../services/ClipService.js", () => ({
  clipService: {
    getClips: vi.fn(),
    getClipById: vi.fn(),
    getClipsForScene: vi.fn(),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockClipService = vi.mocked(clipService);
const ALLOWED = ["inst-1", "inst-2"];

const USER = { id: 1, username: "testuser", role: "USER" };

describe("Clips Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getClips ─────────────────────────────────────────────────────────────

  describe("getClips", () => {
    it("passes req.allowedInstanceIds to the builder or service: paginated clips with default query params", async () => {
      const clips: ClipWithRelations[] = [
        partialRow({ id: "c1" }),
        partialRow({ id: "c2" }),
      ];
      mockClipService.getClips.mockResolvedValue({ clips, total: 2 });

      const req = reqFor(getClips, { user: USER, allowedInstanceIds: ALLOWED });
      const res = resFor(getClips);

      await getClips(req, res);

      expect(mockClipService.getClips).toHaveBeenCalledWith({
        userId: 1,
        allowedInstanceIds: ALLOWED,
        request: objectContaining({
          page: 1,
          perPage: 24,
          sort: { field: "stashCreatedAt", direction: "DESC", seed: undefined },
          // No isGenerated: every clip (the Clips page sends true by default)
          filter: {},
          specificInstanceId: undefined,
        }),
      });
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
      mockClipService.getClips.mockResolvedValue({ clips: [], total: 0 });

      const req = reqFor(getClips, {
        user: USER,
        allowedInstanceIds: ALLOWED,
        query: {
          page: "3",
          perPage: "10",
          sortBy: "title",
          sortDir: "asc",
          isGenerated: "false",
          sceneId: "42",
          tagIds: "5",
          sceneTagIds: "6:inst-1",
          performerIds: "7",
          studioId: "8",
          q: " search term ",
          instanceId: "inst-1",
        },
      });
      const res = resFor(getClips);

      await getClips(req, res);

      const refs = (...values: Array<[string, string | undefined]>) => ({
        refs: values.map(([id, instanceId]) => ({ id, instanceId })),
        modifier: "INCLUDES",
        depth: 0,
      });
      // The instance narrows the list inside the user's instances
      expect(mockClipService.getClips).toHaveBeenCalledWith({
        userId: 1,
        allowedInstanceIds: ALLOWED,
        request: {
          page: 3,
          perPage: 10,
          q: "search term",
          sort: { field: "title", direction: "ASC", seed: undefined },
          // Each parameter read onto its clip filter field
          filter: {
            is_generated: false,
            scenes: refs(["42", undefined]),
            tags: refs(["5", undefined]),
            scene_tags: refs(["6", "inst-1"]),
            performers: refs(["7", undefined]),
            studios: refs(["8", undefined]),
          },
          specificInstanceId: "inst-1",
        },
      });
    });

    it("splits comma-separated tagIds, sceneTagIds, and performerIds", async () => {
      mockClipService.getClips.mockResolvedValue({ clips: [], total: 0 });

      const req = reqFor(getClips, {
        user: USER,
        allowedInstanceIds: ALLOWED,
        query: {
          tagIds: "1,2,3",
          sceneTagIds: "4,5:inst-1",
          performerIds: "6,7,8,9",
        },
      });
      const res = resFor(getClips);

      await getClips(req, res);

      const ids = (criterion?: {
        refs: readonly { id: string; instanceId?: string | undefined }[];
      }) =>
        criterion?.refs.map((r) =>
          r.instanceId ? `${r.id}:${r.instanceId}` : r.id
        );
      const { filter } = must(mockClipService.getClips.mock.calls[0])[0]
        .request;
      expect(ids(filter.tags)).toEqual(["1", "2", "3"]);
      expect(ids(filter.scene_tags)).toEqual(["4", "5:inst-1"]);
      expect(ids(filter.performers)).toEqual(["6", "7", "8", "9"]);
    });

    it("passes the seed of random_<seed> to the service", async () => {
      mockClipService.getClips.mockResolvedValue({ clips: [], total: 0 });

      const req = reqFor(getClips, {
        user: USER,
        allowedInstanceIds: ALLOWED,
        query: { sortBy: "random_42" },
      });
      const res = resFor(getClips);

      await getClips(req, res);

      expect(
        must(mockClipService.getClips.mock.calls[0])[0].request.sort
      ).toEqual({ field: "random", direction: "DESC", seed: 42 });
    });

    it("holds perPage to 250 and answers with the held value", async () => {
      mockClipService.getClips.mockResolvedValue({ clips: [], total: 600 });

      const req = reqFor(getClips, {
        user: USER,
        allowedInstanceIds: ALLOWED,
        query: { perPage: "1000", page: "0" },
      });
      const res = resFor(getClips);

      await getClips(req, res);

      expect(must(mockClipService.getClips.mock.calls[0])[0].request).toEqual(
        objectContaining({ page: 1, perPage: 250 })
      );
      expect(res._getBody()).toMatchObject({
        page: 1,
        perPage: 250,
        totalPages: 3,
      });
    });

    it.each([
      ["perPage", { perPage: "abc" }],
      ["sortDir", { sortDir: "sideways" }],
      ["sortBy", { sortBy: "constructor" }],
      ["tagIds.0", { tagIds: "t1" }],
      ["instanceId", { instanceId: "../etc" }],
      ["isGenerated", { isGenerated: "yes" }],
      ["notAParam", { notAParam: "1" }],
    ])(
      "a bad %s answers 400 before any query",
      async (path, query: Record<string, string>) => {
        const req = reqFor(getClips, {
          user: USER,
          query,
          allowedInstanceIds: ALLOWED,
        });
        const res = resFor(getClips);

        await expect(getClips(req, res)).rejects.toMatchObject({
          statusCode: 400,
          issues: [{ path }],
        });
        expect(mockClipService.getClips).not.toHaveBeenCalled();
      }
    );

    describe("PEEK_FILTER_POLICY=drop no longer drops", () => {
      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it("an unknown key answers 400", async () => {
        vi.stubEnv("PEEK_FILTER_POLICY", "drop");

        const req = reqFor(getClips, {
          user: USER,
          allowedInstanceIds: ALLOWED,
          query: { clipsB7Unknown: "1" },
        });
        const res = resFor(getClips);

        await expect(getClips(req, res)).rejects.toMatchObject({
          statusCode: 400,
          issues: [{ path: "clipsB7Unknown" }],
        });
        expect(mockClipService.getClips).not.toHaveBeenCalled();
      });
    });

    it("calculates totalPages correctly", async () => {
      mockClipService.getClips.mockResolvedValue({ clips: [], total: 50 });

      const req = reqFor(getClips, {
        user: USER,
        query: { perPage: "24" },
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(getClips);

      await getClips(req, res);

      expect(res._getBody()).toMatchObject({ totalPages: 3 }); // ceil(50/24) = 3
    });

    it("count=false asks the service for the page alone and answers total and totalPages null", async () => {
      mockClipService.getClips.mockResolvedValue({ clips: [], total: null });

      const req = reqFor(getClips, {
        user: USER,
        allowedInstanceIds: ALLOWED,
        query: { page: "2", count: "false" },
      });
      const res = resFor(getClips);

      await getClips(req, res);

      expect(must(mockClipService.getClips.mock.calls[0])[0].request).toEqual(
        objectContaining({ page: 2, count: false })
      );
      expect(res._getBody()).toMatchObject({
        page: 2,
        total: null,
        totalPages: null,
      });
    });

    it("returns totalPages 0 when there are no results", async () => {
      mockClipService.getClips.mockResolvedValue({ clips: [], total: 0 });

      const req = reqFor(getClips, { user: USER, allowedInstanceIds: ALLOWED });
      const res = resFor(getClips);

      await getClips(req, res);

      expect(res._getBody()).toMatchObject({ totalPages: 0, total: 0 });
    });

    it("a failure reaches the error handler: the service throws", async () => {
      mockClipService.getClips.mockRejectedValue(new Error("DB down"));

      const req = reqFor(getClips, { user: USER, allowedInstanceIds: ALLOWED });
      const res = resFor(getClips);

      await expect(getClips(req, res)).rejects.toThrow("DB down");

      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ─── getClipById ──────────────────────────────────────────────────────────

  describe("getClipById", () => {
    it("returns the clip when found", async () => {
      const clip: ClipWithRelations = partialRow({
        id: "101",
        title: "Test Clip",
      });
      mockClipService.getClipById.mockResolvedValue([clip]);

      const req = reqFor(getClipById, {
        params: { id: "101" },
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(getClipById);

      await getClipById(req, res);

      expect(mockClipService.getClipById).toHaveBeenCalledWith({
        userId: 1,
        allowedInstanceIds: ALLOWED,
        ref: { id: "101", instanceId: undefined },
      });
      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toEqual(clip);
    });

    it("reads id:instanceId as the clip on that instance", async () => {
      const clip: ClipWithRelations = partialRow({ id: "101" });
      mockClipService.getClipById.mockResolvedValue([clip]);

      const req = reqFor(getClipById, {
        params: { id: "101:inst-2" },
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(getClipById);

      await getClipById(req, res);

      expect(mockClipService.getClipById).toHaveBeenCalledWith({
        userId: 1,
        allowedInstanceIds: ALLOWED,
        ref: { id: "101", instanceId: "inst-2" },
      });
      expect(res._getStatus()).toBe(200);
    });

    it("a bare id held by two instances answers the ambiguous 400 with matches", async () => {
      mockClipService.getClipById.mockResolvedValue([
        partialRow({ id: "101", title: "One", instanceId: "inst-1" }),
        partialRow({ id: "101", title: "Two", instanceId: "inst-2" }),
      ]);

      const req = reqFor(getClipById, {
        params: { id: "101" },
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(getClipById);

      await getClipById(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toMatchObject({
        error: "Ambiguous lookup",
        matches: [
          { id: "101", title: "One", instanceId: "inst-1" },
          { id: "101", title: "Two", instanceId: "inst-2" },
        ],
      });
    });

    it("returns 404 when clip is not found", async () => {
      mockClipService.getClipById.mockResolvedValue([]);

      const req = reqFor(getClipById, {
        params: { id: "999999" },
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(getClipById);

      await getClipById(req, res);

      expect(res._getStatus()).toBe(404);
      expect(res._getBody()).toMatchObject({ error: "Clip not found" });
    });

    it.each(["nonexistent", "101:inst 1", "101:"])(
      "an id that is not a Stash ref (%s) answers 400 before any query",
      async (id) => {
        const req = reqFor(getClipById, {
          params: { id },
          user: USER,
          allowedInstanceIds: ALLOWED,
        });
        const res = resFor(getClipById);

        await expect(getClipById(req, res)).rejects.toMatchObject({
          statusCode: 400,
          issues: [{ path: "id" }],
        });
        expect(mockClipService.getClipById).not.toHaveBeenCalled();
      }
    );

    it("a failure reaches the error handler: the service throws", async () => {
      mockClipService.getClipById.mockRejectedValue(new Error("Unexpected"));

      const req = reqFor(getClipById, {
        params: { id: "101" },
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(getClipById);

      await expect(getClipById(req, res)).rejects.toThrow("Unexpected");

      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ─── getClipsForScene ─────────────────────────────────────────────────────

  describe("getClipsForScene", () => {
    it("returns clips for a scene with default options", async () => {
      const clips: ClipWithRelations[] = [
        partialRow({ id: "c1" }),
        partialRow({ id: "c2" }),
      ];
      mockClipService.getClipsForScene.mockResolvedValue(clips);

      const req = reqFor(getClipsForScene, {
        params: { id: "42" },
        user: USER,
        allowedInstanceIds: ALLOWED,
        query: { instanceId: "inst-1" },
      });
      const res = resFor(getClipsForScene);

      await getClipsForScene(req, res);

      expect(mockClipService.getClipsForScene).toHaveBeenCalledWith({
        userId: 1,
        allowedInstanceIds: ALLOWED,
        scene: { id: "42", instanceId: "inst-1" },
        includeUngenerated: false,
      });
      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toMatchObject({ clips });
    });

    it("passes includeUngenerated=true when query param is set", async () => {
      mockClipService.getClipsForScene.mockResolvedValue([]);

      const req = reqFor(getClipsForScene, {
        params: { id: "42" },
        user: USER,
        allowedInstanceIds: ALLOWED,
        query: {
          includeUngenerated: "true",
          instanceId: "inst-1",
        },
      });
      const res = resFor(getClipsForScene);

      await getClipsForScene(req, res);

      expect(mockClipService.getClipsForScene).toHaveBeenCalledWith({
        userId: 1,
        allowedInstanceIds: ALLOWED,
        scene: { id: "42", instanceId: "inst-1" },
        includeUngenerated: true,
      });
    });

    it("names the scene on the instanceId parameter's instance", async () => {
      mockClipService.getClipsForScene.mockResolvedValue([]);

      const req = reqFor(getClipsForScene, {
        params: { id: "42" },
        user: USER,
        allowedInstanceIds: ALLOWED,
        query: {
          instanceId: "inst-1",
        },
      });
      const res = resFor(getClipsForScene);

      await getClipsForScene(req, res);

      expect(mockClipService.getClipsForScene).toHaveBeenCalledWith({
        userId: 1,
        allowedInstanceIds: ALLOWED,
        scene: { id: "42", instanceId: "inst-1" },
        includeUngenerated: false,
      });
    });

    it.each([
      ["id", { id: "scene-1" }, { instanceId: "inst-1" }],
      [
        "includeUngenerated",
        { id: "42" },
        { includeUngenerated: "yes", instanceId: "inst-1" },
      ],
      ["instanceId", { id: "42" }, { instanceId: "inst 1" }],
      ["instanceId", { id: "42" }, {}],
      ["sort", { id: "42" }, { sort: "title", instanceId: "inst-1" }],
    ])(
      "a bad %s answers 400 before any query",
      async (path, params: { id: string }, query: Record<string, string>) => {
        const req = reqFor(getClipsForScene, {
          params,
          user: USER,
          query,
          allowedInstanceIds: ALLOWED,
        });
        const res = resFor(getClipsForScene);

        await expect(getClipsForScene(req, res)).rejects.toMatchObject({
          statusCode: 400,
          issues: [{ path }],
        });
        expect(mockClipService.getClipsForScene).not.toHaveBeenCalled();
      }
    );

    it("a failure reaches the error handler: the service throws", async () => {
      mockClipService.getClipsForScene.mockRejectedValue(new Error("Failed"));

      const req = reqFor(getClipsForScene, {
        params: { id: "42" },
        user: USER,
        query: { instanceId: "inst-1" },
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(getClipsForScene);

      await expect(getClipsForScene(req, res)).rejects.toThrow("Failed");

      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
