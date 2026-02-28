/**
 * Unit Tests for Ratings Controller
 *
 * Tests all 7 entity rating endpoints (scene, performer, studio, tag, gallery,
 * group, image). Covers input validation, auth checks, Prisma upsert logic,
 * sync-to-Stash policy per entity type, and error handling.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: { findUnique: vi.fn() },
    sceneRating: { upsert: vi.fn() },
    performerRating: { upsert: vi.fn() },
    studioRating: { upsert: vi.fn() },
    tagRating: { upsert: vi.fn() },
    galleryRating: { upsert: vi.fn() },
    groupRating: { upsert: vi.fn() },
    imageRating: { upsert: vi.fn() },
  },
}));

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

// Mock entityInstanceId
vi.mock("../../utils/entityInstanceId.js", () => ({
  getEntityInstanceId: vi.fn().mockResolvedValue("instance-1"),
}));

import prisma from "../../prisma/singleton.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { getEntityInstanceId } from "../../utils/entityInstanceId.js";
import {
  updateSceneRating,
  updatePerformerRating,
  updateStudioRating,
  updateTagRating,
  updateGalleryRating,
  updateGroupRating,
  updateImageRating,
} from "../../controllers/ratings.js";
import { mockReq, mockRes } from "../helpers/controllerTestUtils.js";

const mockPrisma = vi.mocked(prisma);
const mockInstanceManager = vi.mocked(stashInstanceManager);
const mockGetEntityInstanceId = vi.mocked(getEntityInstanceId);

const USER = { id: 1, username: "testuser", role: "USER" };

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
    mockPrisma.user.findUnique.mockResolvedValue({ syncToStash: false } as any);
  });

  // ─── Shared validation tests (tested via updateSceneRating, applies to all) ───

  describe("shared validation (via updateSceneRating)", () => {
    it("returns 401 when user has no id", async () => {
      const req = mockReq({}, { sceneId: "1" }, {} as any);
      const res = mockRes();
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getBody().error).toBe("Unauthorized");
    });

    it("returns 401 when user is missing entirely", async () => {
      const req = { body: {}, params: { sceneId: "1" } } as any;
      const res = mockRes();
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getBody().error).toBe("Unauthorized");
    });

    it("returns 400 when entity ID is missing", async () => {
      const req = mockReq({ rating: 50 }, {}, USER);
      const res = mockRes();
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toBe("Missing sceneId");
    });

    it("returns 400 when rating is not a number", async () => {
      const req = mockReq({ rating: "high" }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Rating must be a number/);
    });

    it("returns 400 when rating is below 0", async () => {
      const req = mockReq({ rating: -1 }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Rating must be a number/);
    });

    it("returns 400 when rating is above 100", async () => {
      const req = mockReq({ rating: 101 }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Rating must be a number/);
    });

    it("accepts rating of 0 (boundary)", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      const req = mockReq({ rating: 0 }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);
      expect(res._getBody().success).toBe(true);
    });

    it("accepts rating of 100 (boundary)", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      const req = mockReq({ rating: 100 }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);
      expect(res._getBody().success).toBe(true);
    });

    it("accepts null rating (clearing a rating)", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      const req = mockReq({ rating: null }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);
      expect(res._getBody().success).toBe(true);
    });

    it("returns 400 when favorite is not a boolean", async () => {
      const req = mockReq({ favorite: "yes" }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toBe("Favorite must be a boolean");
    });

    it("accepts favorite as true/false", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      const req = mockReq({ favorite: true }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);
      expect(res._getBody().success).toBe(true);
    });

    it("returns 500 when database throws", async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error("DB down"));
      const req = mockReq({ rating: 50 }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);
      expect(res._getStatus()).toBe(500);
      expect(res._getBody().error).toMatch(/Failed to update/);
    });
  });

  // ─── Instance ID handling ───

  describe("instance ID resolution", () => {
    it("uses instanceId from request body when provided", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      const req = mockReq(
        { rating: 50, instanceId: "custom-instance" },
        { sceneId: "1" },
        USER
      );
      const res = mockRes();
      await updateSceneRating(req, res);

      expect(mockGetEntityInstanceId).not.toHaveBeenCalled();
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

    it("looks up instanceId from DB when not provided in request", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      const req = mockReq({ rating: 50 }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);

      expect(mockGetEntityInstanceId).toHaveBeenCalledWith("scene", "1");
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

  // ─── Upsert behavior ───

  describe("upsert behavior", () => {
    it("creates with rating and default favorite when rating provided", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      const req = mockReq({ rating: 75 }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);

      expect(mockPrisma.sceneRating.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            userId: 1,
            instanceId: "instance-1",
            sceneId: "1",
            rating: 75,
            favorite: false,
          }),
          update: expect.objectContaining({ rating: 75 }),
        })
      );
    });

    it("creates with favorite and null rating when only favorite provided", async () => {
      mockPrisma.sceneRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      const req = mockReq({ favorite: true }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);

      expect(mockPrisma.sceneRating.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            rating: null,
            favorite: true,
          }),
          update: expect.objectContaining({ favorite: true }),
        })
      );
    });

    it("returns success with upserted record", async () => {
      const upsertResult = { id: 1, instanceId: "instance-1", rating: 85, favorite: true };
      mockPrisma.sceneRating.upsert.mockResolvedValue(upsertResult as any);
      const req = mockReq({ rating: 85, favorite: true }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);

      const body = res._getBody();
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
      mockPrisma.user.findUnique.mockResolvedValue({ syncToStash: true } as any);
      mockInstanceManager.getForSync.mockReturnValue(mockStash as any);
    });

    it("does not sync when syncToStash is disabled", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ syncToStash: false } as any);
      mockPrisma.sceneRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      const req = mockReq({ rating: 50 }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);

      expect(mockInstanceManager.getForSync).not.toHaveBeenCalled();
      expect(res._getBody().success).toBe(true);
    });

    it("does not sync when getForSync returns null (no stash client)", async () => {
      mockInstanceManager.getForSync.mockReturnValue(null as any);
      mockPrisma.sceneRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      const req = mockReq({ rating: 50 }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);

      expect(mockStash.sceneUpdate).not.toHaveBeenCalled();
      expect(res._getBody().success).toBe(true);
    });

    it("succeeds even when Stash sync throws (non-blocking)", async () => {
      mockStash.sceneUpdate.mockRejectedValue(new Error("Stash down"));
      mockPrisma.sceneRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      const req = mockReq({ rating: 50 }, { sceneId: "1" }, USER);
      const res = mockRes();
      await updateSceneRating(req, res);

      expect(res._getBody().success).toBe(true);
    });

    // Scene: syncs rating only, NOT favorite
    describe("scene sync policy", () => {
      beforeEach(() => {
        mockPrisma.sceneRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      });

      it("syncs rating to Stash as rating100", async () => {
        const req = mockReq({ rating: 85 }, { sceneId: "42" }, USER);
        const res = mockRes();
        await updateSceneRating(req, res);

        expect(mockStash.sceneUpdate).toHaveBeenCalledWith({
          input: { id: "42", rating100: 85 },
        });
      });

      it("does NOT sync favorite to Stash (scene policy)", async () => {
        const req = mockReq({ favorite: true }, { sceneId: "42" }, USER);
        const res = mockRes();
        await updateSceneRating(req, res);

        expect(mockStash.sceneUpdate).not.toHaveBeenCalled();
      });
    });

    // Performer: syncs both rating AND favorite
    describe("performer sync policy", () => {
      beforeEach(() => {
        mockPrisma.performerRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      });

      it("syncs rating to Stash", async () => {
        const req = mockReq({ rating: 90 }, { performerId: "10" }, USER);
        const res = mockRes();
        await updatePerformerRating(req, res);

        expect(mockStash.performerUpdate).toHaveBeenCalledWith({
          input: { id: "10", rating100: 90 },
        });
      });

      it("syncs favorite to Stash", async () => {
        const req = mockReq({ favorite: true }, { performerId: "10" }, USER);
        const res = mockRes();
        await updatePerformerRating(req, res);

        expect(mockStash.performerUpdate).toHaveBeenCalledWith({
          input: { id: "10", favorite: true },
        });
      });

      it("syncs both rating and favorite together", async () => {
        const req = mockReq({ rating: 95, favorite: true }, { performerId: "10" }, USER);
        const res = mockRes();
        await updatePerformerRating(req, res);

        expect(mockStash.performerUpdate).toHaveBeenCalledWith({
          input: { id: "10", rating100: 95, favorite: true },
        });
      });
    });

    // Studio: syncs both rating AND favorite
    describe("studio sync policy", () => {
      beforeEach(() => {
        mockPrisma.studioRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      });

      it("syncs both rating and favorite", async () => {
        const req = mockReq({ rating: 80, favorite: true }, { studioId: "5" }, USER);
        const res = mockRes();
        await updateStudioRating(req, res);

        expect(mockStash.studioUpdate).toHaveBeenCalledWith({
          input: { id: "5", rating100: 80, favorite: true },
        });
      });
    });

    // Tag: syncs favorite ONLY (no rating in Stash)
    describe("tag sync policy", () => {
      beforeEach(() => {
        mockPrisma.tagRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      });

      it("syncs favorite to Stash", async () => {
        const req = mockReq({ favorite: true }, { tagId: "7" }, USER);
        const res = mockRes();
        await updateTagRating(req, res);

        expect(mockStash.tagUpdate).toHaveBeenCalledWith({
          input: { id: "7", favorite: true },
        });
      });

      it("does NOT sync rating to Stash (tag policy)", async () => {
        const req = mockReq({ rating: 60 }, { tagId: "7" }, USER);
        const res = mockRes();
        await updateTagRating(req, res);

        expect(mockStash.tagUpdate).not.toHaveBeenCalled();
      });
    });

    // Gallery: syncs rating ONLY (no favorite in Stash)
    describe("gallery sync policy", () => {
      beforeEach(() => {
        mockPrisma.galleryRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      });

      it("syncs rating to Stash", async () => {
        const req = mockReq({ rating: 70 }, { galleryId: "3" }, USER);
        const res = mockRes();
        await updateGalleryRating(req, res);

        expect(mockStash.galleryUpdate).toHaveBeenCalledWith({
          input: { id: "3", rating100: 70 },
        });
      });

      it("does NOT sync favorite to Stash (gallery policy)", async () => {
        const req = mockReq({ favorite: true }, { galleryId: "3" }, USER);
        const res = mockRes();
        await updateGalleryRating(req, res);

        expect(mockStash.galleryUpdate).not.toHaveBeenCalled();
      });
    });

    // Group: syncs rating ONLY
    describe("group sync policy", () => {
      beforeEach(() => {
        mockPrisma.groupRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      });

      it("syncs rating to Stash", async () => {
        const req = mockReq({ rating: 55 }, { groupId: "8" }, USER);
        const res = mockRes();
        await updateGroupRating(req, res);

        expect(mockStash.groupUpdate).toHaveBeenCalledWith({
          input: { id: "8", rating100: 55 },
        });
      });

      it("does NOT sync favorite to Stash (group policy)", async () => {
        const req = mockReq({ favorite: true }, { groupId: "8" }, USER);
        const res = mockRes();
        await updateGroupRating(req, res);

        expect(mockStash.groupUpdate).not.toHaveBeenCalled();
      });
    });

    // Image: syncs rating ONLY
    describe("image sync policy", () => {
      beforeEach(() => {
        mockPrisma.imageRating.upsert.mockResolvedValue(UPSERT_RESULT as any);
      });

      it("syncs rating to Stash", async () => {
        const req = mockReq({ rating: 40 }, { imageId: "99" }, USER);
        const res = mockRes();
        await updateImageRating(req, res);

        expect(mockStash.imageUpdate).toHaveBeenCalledWith({
          input: { id: "99", rating100: 40 },
        });
      });

      it("does NOT sync favorite to Stash (image policy)", async () => {
        const req = mockReq({ favorite: true }, { imageId: "99" }, USER);
        const res = mockRes();
        await updateImageRating(req, res);

        expect(mockStash.imageUpdate).not.toHaveBeenCalled();
      });
    });
  });

  // ─── All entity endpoints: missing ID validation ───

  describe("per-entity missing ID validation", () => {
    const cases: [string, typeof updateSceneRating, string][] = [
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
        const req = mockReq({ rating: 50 }, {}, USER);
        const res = mockRes();
        await handler(req as any, res);
        expect(res._getStatus()).toBe(400);
        expect(res._getBody().error).toBe(expectedError);
      }
    );
  });

  // ─── All entity endpoints: successful upsert ───

  describe("per-entity successful operations", () => {
    const cases: [
      string,
      typeof updateSceneRating,
      string,
      keyof typeof mockPrisma,
    ][] = [
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
        const model = mockPrisma[modelKey] as any;
        model.upsert.mockResolvedValue(UPSERT_RESULT);
        const req = mockReq({ rating: 50 }, { [paramKey]: "1" }, USER);
        const res = mockRes();
        await handler(req as any, res);
        expect(res._getBody().success).toBe(true);
        expect(model.upsert).toHaveBeenCalledTimes(1);
      }
    );
  });
});
