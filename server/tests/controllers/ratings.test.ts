/**
 * Unit Tests for Ratings Controller
 *
 * Tests all 7 entity rating endpoints (scene, performer, studio, tag, gallery,
 * group, image). Covers input validation, auth checks, Prisma upsert logic,
 * sync-to-Stash policy per entity type, and error handling.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  updateGalleryRating,
  updateGroupRating,
  updateImageRating,
  updatePerformerRating,
  updateSceneRating,
  updateStudioRating,
  updateTagRating,
} from "../../controllers/ratings.js";
import prisma from "../../prisma/singleton.js";
import { resolveAccessibleInstanceId } from "../../services/EntityAccessService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import type {
  ApiErrorResponse,
  TypedAuthRequest,
  TypedResponse,
  UpdateRatingRequest,
  UpdateRatingResponse,
} from "../../types/api/index.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { objectContaining } from "../helpers/matchers.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getForSync: vi.fn(),
  },
}));

// Mock the access check: the request's instance when given, else "instance-1"
vi.mock("../../services/EntityAccessService.js", () => ({
  resolveAccessibleInstanceId: vi.fn(),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockInstanceManager = vi.mocked(stashInstanceManager);
const mockResolve = vi.mocked(resolveAccessibleInstanceId);

const USER = { id: 1, username: "testuser", role: "USER" };

/** Any of the seven rating handlers; each takes its own id param. */
/**
 * Any of the rating handlers. They share a body and response and differ only
 * in the name of their one id param, which the tables below pass as data. A
 * method signature (checked bivariantly) lets each handler's own params type
 * stand in for that `Record<string, string>`.
 */
type RatingHandler = {
  handle(
    req: TypedAuthRequest<UpdateRatingRequest>,
    res: TypedResponse<UpdateRatingResponse | ApiErrorResponse>
  ): Promise<unknown>;
}["handle"];

/** The Prisma model each rating handler writes to */
type RatingModel =
  | "sceneRating"
  | "performerRating"
  | "studioRating"
  | "tagRating"
  | "galleryRating"
  | "groupRating"
  | "imageRating";

/** Standard mock for a successful upsert */
const UPSERT_RESULT = {
  id: 1,
  userId: 1,
  instanceId: "instance-1",
  rating: 85,
  favorite: false,
};

describe("Ratings Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(
      partialRow({ syncToStash: false })
    );
    mockResolve.mockImplementation((_userId, _type, _id, requested) =>
      Promise.resolve(requested ?? "instance-1")
    );
  });

  // ─── Shared validation tests (tested via updateSceneRating, applies to all) ───

  describe("shared validation (via updateSceneRating)", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(updateSceneRating, {
        params: { sceneId: "1" },
        user: malformed({}),
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getErrorBody().error).toBe("Unauthorized");
    });

    it("returns 401 when user is missing entirely", async () => {
      const req = reqFor(updateSceneRating, { params: { sceneId: "1" } });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getErrorBody().error).toBe("Unauthorized");
    });

    it("returns 400 when entity ID is missing", async () => {
      const req = reqFor(updateSceneRating, {
        body: { rating: 50 },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe("Missing sceneId");
    });

    it("returns 400 when rating is not a number", async () => {
      const req = reqFor(updateSceneRating, {
        body: malformed({ rating: "high" }),
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Rating must be a number/);
    });

    it("returns 400 when rating is below 0", async () => {
      const req = reqFor(updateSceneRating, {
        body: { rating: -1 },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Rating must be a number/);
    });

    it("returns 400 when rating is above 100", async () => {
      const req = reqFor(updateSceneRating, {
        body: { rating: 101 },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Rating must be a number/);
    });

    it("accepts rating of 0 (boundary)", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(
        partialRow(UPSERT_RESULT)
      );
      const req = reqFor(updateSceneRating, {
        body: { rating: 0 },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);
      expect(res._getOkBody().success).toBe(true);
    });

    it("accepts rating of 100 (boundary)", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(
        partialRow(UPSERT_RESULT)
      );
      const req = reqFor(updateSceneRating, {
        body: { rating: 100 },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);
      expect(res._getOkBody().success).toBe(true);
    });

    it("accepts null rating (clearing a rating)", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(
        partialRow(UPSERT_RESULT)
      );
      const req = reqFor(updateSceneRating, {
        body: { rating: null },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);
      expect(res._getOkBody().success).toBe(true);
    });

    it("returns 400 when favorite is not a boolean", async () => {
      const req = reqFor(updateSceneRating, {
        body: malformed({ favorite: "yes" }),
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe("Favorite must be a boolean");
    });

    it("accepts favorite as true/false", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(
        partialRow(UPSERT_RESULT)
      );
      const req = reqFor(updateSceneRating, {
        body: { favorite: true },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);
      expect(res._getOkBody().success).toBe(true);
    });

    it("returns 500 when database throws", async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error("DB down"));
      const req = reqFor(updateSceneRating, {
        body: { rating: 50 },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(500);
      expect(res._getErrorBody().error).toMatch(/Failed to update/);
    });
  });

  // ─── Instance ID handling ───

  describe("instance ID resolution", () => {
    it("uses instanceId from request body when provided", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(
        partialRow(UPSERT_RESULT)
      );
      const req = reqFor(updateSceneRating, {
        body: { rating: 50, instanceId: "custom-instance" },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);

      expect(mockResolve).toHaveBeenCalledWith(
        1,
        "scene",
        "1",
        "custom-instance"
      );
      expect(mockPrisma.sceneRating.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_instanceId_sceneId: {
              userId: 1,
              instanceId: "custom-instance",
              sceneId: "1",
            },
          },
        })
      );
    });

    it("lets the resolver pick the instance when the request has none", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(
        partialRow(UPSERT_RESULT)
      );
      const req = reqFor(updateSceneRating, {
        body: { rating: 50 },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);

      expect(mockResolve).toHaveBeenCalledWith(1, "scene", "1", undefined);
      expect(mockPrisma.sceneRating.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_instanceId_sceneId: {
              userId: 1,
              instanceId: "instance-1",
              sceneId: "1",
            },
          },
        })
      );
    });
  });

  // ─── Entity access ───

  describe("entity access", () => {
    const handlers: [string, RatingHandler, string, RatingModel][] = [
      ["scene", updateSceneRating, "sceneId", "sceneRating"],
      ["performer", updatePerformerRating, "performerId", "performerRating"],
      ["studio", updateStudioRating, "studioId", "studioRating"],
      ["tag", updateTagRating, "tagId", "tagRating"],
      ["gallery", updateGalleryRating, "galleryId", "galleryRating"],
      ["group", updateGroupRating, "groupId", "groupRating"],
      ["image", updateImageRating, "imageId", "imageRating"],
    ];

    it.each(handlers)(
      "%s returns 404 and writes nothing when the user cannot see the entity",
      async (entityType, handler, paramKey, modelKey) => {
        mockPrisma.user.findUnique.mockResolvedValue(
          partialRow({
            syncToStash: true,
          })
        );
        mockResolve.mockResolvedValueOnce(null);
        const model = mockPrisma[modelKey];
        const req = reqFor(handler, {
          body: { rating: 50, favorite: true, instanceId: "inst-b" },
          params: { [paramKey]: "77" },
          user: USER,
        });
        const res = resFor(handler);
        await handler(req, res);

        expect(mockResolve).toHaveBeenCalledWith(1, entityType, "77", "inst-b");
        expect(res._getStatus()).toBe(404);
        expect(res._getErrorBody().error).toMatch(/not found/);
        expect(model.upsert).not.toHaveBeenCalled();
        expect(mockInstanceManager.getForSync).not.toHaveBeenCalled();
      }
    );

    it("passes the request's instance to the resolver", async () => {
      mockPrisma.performerRating.upsert.mockResolvedValue(
        partialRow(UPSERT_RESULT)
      );
      const req = reqFor(updatePerformerRating, {
        body: { rating: 5, instanceId: "inst-b" },
        params: { performerId: "77" },
        user: USER,
      });
      const res = resFor(updatePerformerRating);
      await updatePerformerRating(req, res);

      expect(mockResolve).toHaveBeenCalledWith(1, "performer", "77", "inst-b");
      expect(mockPrisma.performerRating.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_instanceId_performerId: {
              userId: 1,
              instanceId: "inst-b",
              performerId: "77",
            },
          },
        })
      );
    });

    it.each([[{ instanceId: 5 }], [{ instanceId: "" }]])(
      "returns 400 when instanceId is not a non-empty string (%j)",
      async (body) => {
        const req = reqFor(updateSceneRating, {
          body: malformed({ rating: 50, ...body }),
          params: { sceneId: "1" },
          user: USER,
        });
        const res = resFor(updateSceneRating);
        await updateSceneRating(req, res);

        expect(res._getStatus()).toBe(400);
        expect(res._getErrorBody().error).toBe(
          "instanceId must be a non-empty string"
        );
        expect(mockResolve).not.toHaveBeenCalled();
        expect(mockPrisma.sceneRating.upsert).not.toHaveBeenCalled();
      }
    );
  });

  // ─── Upsert behavior ───

  describe("upsert behavior", () => {
    it("creates with rating and default favorite when rating provided", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(
        partialRow(UPSERT_RESULT)
      );
      const req = reqFor(updateSceneRating, {
        body: { rating: 75 },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);

      expect(mockPrisma.sceneRating.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: objectContaining({
            userId: 1,
            instanceId: "instance-1",
            sceneId: "1",
            rating: 75,
            favorite: false,
          }),
          update: objectContaining({ rating: 75 }),
        })
      );
    });

    it("creates with favorite and null rating when only favorite provided", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(
        partialRow(UPSERT_RESULT)
      );
      const req = reqFor(updateSceneRating, {
        body: { favorite: true },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);

      expect(mockPrisma.sceneRating.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: objectContaining({
            rating: null,
            favorite: true,
          }),
          update: objectContaining({ favorite: true }),
        })
      );
    });

    it("returns success with upserted record", async () => {
      const upsertResult = {
        id: 1,
        instanceId: "instance-1",
        rating: 85,
        favorite: true,
      };
      mockPrisma.sceneRating.upsert.mockResolvedValue(partialRow(upsertResult));
      const req = reqFor(updateSceneRating, {
        body: { rating: 85, favorite: true },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);

      const body = res._getOkBody();
      expect(body.success).toBe(true);
      expect(body.rating).toEqual(upsertResult);
    });
  });

  // ─── Sync-to-Stash policy ───

  describe("sync-to-Stash policy", () => {
    const mockStash = {
      sceneUpdate: vi.fn().mockResolvedValue({}),
      performerUpdate: vi.fn().mockResolvedValue({}),
      studioUpdate: vi.fn().mockResolvedValue({}),
      tagUpdate: vi.fn().mockResolvedValue({}),
      galleryUpdate: vi.fn().mockResolvedValue({}),
      groupUpdate: vi.fn().mockResolvedValue({}),
      imageUpdate: vi.fn().mockResolvedValue({}),
    };

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          syncToStash: true,
        })
      );
      mockInstanceManager.getForSync.mockReturnValue(partialRow(mockStash));
    });

    it("does not sync when syncToStash is disabled", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          syncToStash: false,
        })
      );
      mockPrisma.sceneRating.upsert.mockResolvedValue(
        partialRow(UPSERT_RESULT)
      );
      const req = reqFor(updateSceneRating, {
        body: { rating: 50 },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);

      expect(mockInstanceManager.getForSync).not.toHaveBeenCalled();
      expect(res._getOkBody().success).toBe(true);
    });

    it("does not sync when getForSync returns null (no stash client)", async () => {
      mockInstanceManager.getForSync.mockReturnValue(null);
      mockPrisma.sceneRating.upsert.mockResolvedValue(
        partialRow(UPSERT_RESULT)
      );
      const req = reqFor(updateSceneRating, {
        body: { rating: 50 },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);

      expect(mockStash.sceneUpdate).not.toHaveBeenCalled();
      expect(res._getOkBody().success).toBe(true);
    });

    it("succeeds even when Stash sync throws (non-blocking)", async () => {
      mockStash.sceneUpdate.mockRejectedValue(new Error("Stash down"));
      mockPrisma.sceneRating.upsert.mockResolvedValue(
        partialRow(UPSERT_RESULT)
      );
      const req = reqFor(updateSceneRating, {
        body: { rating: 50 },
        params: { sceneId: "1" },
        user: USER,
      });
      const res = resFor(updateSceneRating);
      await updateSceneRating(req, res);

      expect(res._getOkBody().success).toBe(true);
    });

    // Scene: syncs rating only, NOT favorite
    describe("scene sync policy", () => {
      beforeEach(() => {
        mockPrisma.sceneRating.upsert.mockResolvedValue(
          partialRow(UPSERT_RESULT)
        );
      });

      it("syncs rating to Stash as rating100", async () => {
        const req = reqFor(updateSceneRating, {
          body: { rating: 85 },
          params: { sceneId: "42" },
          user: USER,
        });
        const res = resFor(updateSceneRating);
        await updateSceneRating(req, res);

        expect(mockStash.sceneUpdate).toHaveBeenCalledWith({
          input: { id: "42", rating100: 85 },
        });
      });

      it("does NOT sync favorite to Stash (scene policy)", async () => {
        const req = reqFor(updateSceneRating, {
          body: { favorite: true },
          params: { sceneId: "42" },
          user: USER,
        });
        const res = resFor(updateSceneRating);
        await updateSceneRating(req, res);

        expect(mockStash.sceneUpdate).not.toHaveBeenCalled();
      });
    });

    // Performer: syncs both rating AND favorite
    describe("performer sync policy", () => {
      beforeEach(() => {
        mockPrisma.performerRating.upsert.mockResolvedValue(
          partialRow(UPSERT_RESULT)
        );
      });

      it("syncs rating to Stash", async () => {
        const req = reqFor(updatePerformerRating, {
          body: { rating: 90 },
          params: { performerId: "10" },
          user: USER,
        });
        const res = resFor(updatePerformerRating);
        await updatePerformerRating(req, res);

        expect(mockStash.performerUpdate).toHaveBeenCalledWith({
          input: { id: "10", rating100: 90 },
        });
      });

      it("syncs favorite to Stash", async () => {
        const req = reqFor(updatePerformerRating, {
          body: { favorite: true },
          params: { performerId: "10" },
          user: USER,
        });
        const res = resFor(updatePerformerRating);
        await updatePerformerRating(req, res);

        expect(mockStash.performerUpdate).toHaveBeenCalledWith({
          input: { id: "10", favorite: true },
        });
      });

      it("syncs both rating and favorite together", async () => {
        const req = reqFor(updatePerformerRating, {
          body: { rating: 95, favorite: true },
          params: { performerId: "10" },
          user: USER,
        });
        const res = resFor(updatePerformerRating);
        await updatePerformerRating(req, res);

        expect(mockStash.performerUpdate).toHaveBeenCalledWith({
          input: { id: "10", rating100: 95, favorite: true },
        });
      });
    });

    // Studio: syncs both rating AND favorite
    describe("studio sync policy", () => {
      beforeEach(() => {
        mockPrisma.studioRating.upsert.mockResolvedValue(
          partialRow(UPSERT_RESULT)
        );
      });

      it("syncs both rating and favorite", async () => {
        const req = reqFor(updateStudioRating, {
          body: { rating: 80, favorite: true },
          params: { studioId: "5" },
          user: USER,
        });
        const res = resFor(updateStudioRating);
        await updateStudioRating(req, res);

        expect(mockStash.studioUpdate).toHaveBeenCalledWith({
          input: { id: "5", rating100: 80, favorite: true },
        });
      });
    });

    // Tag: syncs favorite ONLY (no rating in Stash)
    describe("tag sync policy", () => {
      beforeEach(() => {
        mockPrisma.tagRating.upsert.mockResolvedValue(
          partialRow(UPSERT_RESULT)
        );
      });

      it("syncs favorite to Stash", async () => {
        const req = reqFor(updateTagRating, {
          body: { favorite: true },
          params: { tagId: "7" },
          user: USER,
        });
        const res = resFor(updateTagRating);
        await updateTagRating(req, res);

        expect(mockStash.tagUpdate).toHaveBeenCalledWith({
          input: { id: "7", favorite: true },
        });
      });

      it("does NOT sync rating to Stash (tag policy)", async () => {
        const req = reqFor(updateTagRating, {
          body: { rating: 60 },
          params: { tagId: "7" },
          user: USER,
        });
        const res = resFor(updateTagRating);
        await updateTagRating(req, res);

        expect(mockStash.tagUpdate).not.toHaveBeenCalled();
      });
    });

    // Gallery: syncs rating ONLY (no favorite in Stash)
    describe("gallery sync policy", () => {
      beforeEach(() => {
        mockPrisma.galleryRating.upsert.mockResolvedValue(
          partialRow(UPSERT_RESULT)
        );
      });

      it("syncs rating to Stash", async () => {
        const req = reqFor(updateGalleryRating, {
          body: { rating: 70 },
          params: { galleryId: "3" },
          user: USER,
        });
        const res = resFor(updateGalleryRating);
        await updateGalleryRating(req, res);

        expect(mockStash.galleryUpdate).toHaveBeenCalledWith({
          input: { id: "3", rating100: 70 },
        });
      });

      it("does NOT sync favorite to Stash (gallery policy)", async () => {
        const req = reqFor(updateGalleryRating, {
          body: { favorite: true },
          params: { galleryId: "3" },
          user: USER,
        });
        const res = resFor(updateGalleryRating);
        await updateGalleryRating(req, res);

        expect(mockStash.galleryUpdate).not.toHaveBeenCalled();
      });
    });

    // Group: syncs rating ONLY
    describe("group sync policy", () => {
      beforeEach(() => {
        mockPrisma.groupRating.upsert.mockResolvedValue(
          partialRow(UPSERT_RESULT)
        );
      });

      it("syncs rating to Stash", async () => {
        const req = reqFor(updateGroupRating, {
          body: { rating: 55 },
          params: { groupId: "8" },
          user: USER,
        });
        const res = resFor(updateGroupRating);
        await updateGroupRating(req, res);

        expect(mockStash.groupUpdate).toHaveBeenCalledWith({
          input: { id: "8", rating100: 55 },
        });
      });

      it("does NOT sync favorite to Stash (group policy)", async () => {
        const req = reqFor(updateGroupRating, {
          body: { favorite: true },
          params: { groupId: "8" },
          user: USER,
        });
        const res = resFor(updateGroupRating);
        await updateGroupRating(req, res);

        expect(mockStash.groupUpdate).not.toHaveBeenCalled();
      });
    });

    // Image: syncs rating ONLY
    describe("image sync policy", () => {
      beforeEach(() => {
        mockPrisma.imageRating.upsert.mockResolvedValue(
          partialRow(UPSERT_RESULT)
        );
      });

      it("syncs rating to Stash", async () => {
        const req = reqFor(updateImageRating, {
          body: { rating: 40 },
          params: { imageId: "99" },
          user: USER,
        });
        const res = resFor(updateImageRating);
        await updateImageRating(req, res);

        expect(mockStash.imageUpdate).toHaveBeenCalledWith({
          input: { id: "99", rating100: 40 },
        });
      });

      it("does NOT sync favorite to Stash (image policy)", async () => {
        const req = reqFor(updateImageRating, {
          body: { favorite: true },
          params: { imageId: "99" },
          user: USER,
        });
        const res = resFor(updateImageRating);
        await updateImageRating(req, res);

        expect(mockStash.imageUpdate).not.toHaveBeenCalled();
      });
    });
  });

  // ─── All entity endpoints: missing ID validation ───

  describe("per-entity missing ID validation", () => {
    const cases: [string, RatingHandler, string][] = [
      ["performer", updatePerformerRating, "Missing performerId"],
      ["studio", updateStudioRating, "Missing studioId"],
      ["tag", updateTagRating, "Missing tagId"],
      ["gallery", updateGalleryRating, "Missing galleryId"],
      ["group", updateGroupRating, "Missing groupId"],
      ["image", updateImageRating, "Missing imageId"],
    ];

    it.each(cases)(
      "returns 400 for missing %sId",
      async (_entity, handler, expectedError) => {
        const req = reqFor(handler, { body: { rating: 50 }, user: USER });
        const res = resFor(handler);
        await handler(req, res);
        expect(res._getStatus()).toBe(400);
        expect(res._getErrorBody().error).toBe(expectedError);
      }
    );
  });

  // ─── All entity endpoints: successful upsert ───

  describe("per-entity successful operations", () => {
    const cases: [string, RatingHandler, string, RatingModel][] = [
      ["performer", updatePerformerRating, "performerId", "performerRating"],
      ["studio", updateStudioRating, "studioId", "studioRating"],
      ["tag", updateTagRating, "tagId", "tagRating"],
      ["gallery", updateGalleryRating, "galleryId", "galleryRating"],
      ["group", updateGroupRating, "groupId", "groupRating"],
      ["image", updateImageRating, "imageId", "imageRating"],
    ];

    it.each(cases)(
      "successfully upserts %s rating",
      async (_entity, handler, paramKey, modelKey) => {
        const model = mockPrisma[modelKey];
        model.upsert.mockResolvedValue(partialRow(UPSERT_RESULT));
        const req = reqFor(handler, {
          body: { rating: 50 },
          params: { [paramKey]: "1" },
          user: USER,
        });
        const res = resFor(handler);
        await handler(req, res);
        expect(res._getOkBody().success).toBe(true);
        expect(model.upsert).toHaveBeenCalledTimes(1);
      }
    );
  });
});
