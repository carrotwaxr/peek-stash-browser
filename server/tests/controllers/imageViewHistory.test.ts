/**
 * Unit Tests for Image View History Controller
 *
 * Tests the image view history endpoints including:
 * - incrementImageOCounter (O counter for images)
 * - recordImageView (lightbox view tracking)
 * - getImageViewHistory (single image history retrieval)
 * - the entity access check on both writes
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getImageViewHistory,
  incrementImageOCounter,
  recordImageView,
} from "../../controllers/imageViewHistory.js";
import prisma from "../../prisma/singleton.js";
import { resolveAccessibleInstanceId } from "../../services/EntityAccessService.js";
import { getEntityInstanceId } from "../../utils/entityInstanceId.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { anyOf, objectContaining } from "../helpers/matchers.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock Prisma - hoisted before imports. Interactive transactions run their
// callback on this same mock client.
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock entityInstanceId (getImageViewHistory keeps its own lookup)
vi.mock("../../utils/entityInstanceId.js", () => ({
  getEntityInstanceId: vi.fn().mockResolvedValue("instance-1"),
}));

// Mock the access check: the request's instance when given, else "instance-1"
vi.mock("../../services/EntityAccessService.js", () => ({
  resolveAccessibleInstanceId: vi.fn(),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockGetEntityInstanceId = vi.mocked(getEntityInstanceId);
const mockResolve = vi.mocked(resolveAccessibleInstanceId);

const USER = { id: 1, username: "testuser", role: "USER" };

describe("Image View History Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve.mockImplementation((_userId, _type, _id, requested) =>
      Promise.resolve(requested ?? "instance-1")
    );
  });

  // ==========================================================================
  // Entity access (item 6)
  // ==========================================================================

  describe("entity access", () => {
    const writes: [string, typeof recordImageView][] = [
      ["incrementImageOCounter", incrementImageOCounter as never],
      ["recordImageView", recordImageView],
    ];

    it.each(writes)(
      "%s returns 404 and writes nothing when the image is not visible",
      async (_name, handler) => {
        mockPrisma.user.findUnique.mockResolvedValue(
          partialRow({
            id: 1,
            syncToStash: true,
          })
        );
        mockResolve.mockResolvedValueOnce(null);
        const req = reqFor(handler, {
          body: { imageId: "img-1", instanceId: "inst-b" },
          user: USER,
        });
        const res = resFor(handler);
        await handler(req, res);

        expect(mockResolve).toHaveBeenCalledWith(1, "image", "img-1", "inst-b");
        expect(res._getStatus()).toBe(404);
        expect(res._getBody()).toEqual({ error: "Image not found" });
        expect(mockPrisma.imageViewHistory.create).not.toHaveBeenCalled();
        expect(mockPrisma.imageViewHistory.update).not.toHaveBeenCalled();
      }
    );

    it.each(writes)(
      "%s returns 400 when instanceId is not a non-empty string",
      async (_name, handler) => {
        for (const instanceId of [5, ""]) {
          const req = reqFor(handler, {
            body: malformed({ imageId: "img-1", instanceId }),
            user: USER,
          });
          const res = resFor(handler);
          await handler(req, res);

          expect(res._getStatus()).toBe(400);
          expect(res._getBody()).toEqual({
            error: "instanceId must be a non-empty string",
          });
        }
        expect(mockResolve).not.toHaveBeenCalled();
      }
    );
  });

  // ==========================================================================
  // incrementImageOCounter Tests
  // ==========================================================================

  describe("incrementImageOCounter", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(incrementImageOCounter, {
        body: { imageId: "img-1" },
      });
      const res = resFor(incrementImageOCounter);
      await incrementImageOCounter(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getBody()).toEqual({ error: "User not found" });
    });

    it("returns 400 when imageId is missing", async () => {
      const req = reqFor(incrementImageOCounter, { user: USER });
      const res = resFor(incrementImageOCounter);
      await incrementImageOCounter(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({
        error: "Missing required field: imageId",
      });
    });

    it("returns 401 when user is not found in database", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = reqFor(incrementImageOCounter, {
        body: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(incrementImageOCounter);
      await incrementImageOCounter(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("creates new record with oCount=1 when no history exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);
      mockPrisma.imageViewHistory.create.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
          imageId: "img-1",
          instanceId: "instance-1",
          viewCount: 0,
          oCount: 1,
          oHistory: [new Date().toISOString()],
        })
      );

      const req = reqFor(incrementImageOCounter, {
        body: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(incrementImageOCounter);
      await incrementImageOCounter(req, res);

      expect(mockPrisma.imageViewHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            userId: 1,
            imageId: "img-1",
            instanceId: "instance-1",
            viewCount: 0,
            oCount: 1,
          }),
        })
      );
      const body = res._getOkBody();
      expect(body.success).toBe(true);
      expect(body.oCount).toBe(1);
      expect(body.timestamp).toBeDefined();
    });

    it("increments oCount on existing record", async () => {
      const existingHistory = ["2024-01-01T00:00:00.000Z"];
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
          imageId: "img-1",
          instanceId: "instance-1",
          oCount: 3,
          oHistory: existingHistory,
        })
      );
      mockPrisma.imageViewHistory.update.mockResolvedValue(
        partialRow({
          id: 1,
          oCount: 4,
          oHistory: [...existingHistory, new Date().toISOString()],
        })
      );

      const req = reqFor(incrementImageOCounter, {
        body: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(incrementImageOCounter);
      await incrementImageOCounter(req, res);

      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { maxWait: 10_000, timeout: 10_000 }
      );
      expect(mockPrisma.imageViewHistory.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          oCount: { increment: 1 },
          oHistory: [...existingHistory, expect.any(String)],
        },
      });
      const body = res._getOkBody();
      expect(body.success).toBe(true);
      expect(body.oCount).toBe(4);
    });

    it("uses instanceId from request body when provided", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);
      mockPrisma.imageViewHistory.create.mockResolvedValue(
        partialRow({
          id: 1,
          oCount: 1,
          oHistory: [],
        })
      );

      const req = reqFor(incrementImageOCounter, {
        body: { imageId: "img-1", instanceId: "custom-instance" },
        user: USER,
      });
      const res = resFor(incrementImageOCounter);
      await incrementImageOCounter(req, res);

      expect(mockResolve).toHaveBeenCalledWith(
        1,
        "image",
        "img-1",
        "custom-instance"
      );
      expect(mockPrisma.imageViewHistory.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: objectContaining({
            userId_instanceId_imageId: objectContaining({
              instanceId: "custom-instance",
            }),
          }),
        })
      );
    });

    it("lets the resolver pick the instance when instanceId is not in body", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);
      mockPrisma.imageViewHistory.create.mockResolvedValue(
        partialRow({
          id: 1,
          oCount: 1,
          oHistory: [],
        })
      );

      const req = reqFor(incrementImageOCounter, {
        body: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(incrementImageOCounter);
      await incrementImageOCounter(req, res);

      expect(mockResolve).toHaveBeenCalledWith(1, "image", "img-1", undefined);
      expect(mockGetEntityInstanceId).not.toHaveBeenCalled();
    });

    it("logs warning when user has syncToStash enabled", async () => {
      const { logger } = await import("../../utils/logger.js");
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: true,
        })
      );
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);
      mockPrisma.imageViewHistory.create.mockResolvedValue(
        partialRow({
          id: 1,
          oCount: 1,
          oHistory: [],
        })
      );

      const req = reqFor(incrementImageOCounter, {
        body: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(incrementImageOCounter);
      await incrementImageOCounter(req, res);

      expect(logger.warn).toHaveBeenCalled();
      expect(res._getOkBody().success).toBe(true);
    });

    it("handles oHistory stored as JSON string", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          oCount: 2,
          oHistory: JSON.stringify([
            "2024-01-01T00:00:00.000Z",
            "2024-01-02T00:00:00.000Z",
          ]),
        })
      );
      mockPrisma.imageViewHistory.update.mockResolvedValue(
        partialRow({
          id: 1,
          oCount: 3,
          oHistory: [],
        })
      );

      const req = reqFor(incrementImageOCounter, {
        body: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(incrementImageOCounter);
      await incrementImageOCounter(req, res);

      // Read through readHistory, written back as an array
      expect(mockPrisma.imageViewHistory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            oHistory: [
              "2024-01-01T00:00:00.000Z",
              "2024-01-02T00:00:00.000Z",
              expect.any(String),
            ],
          }),
        })
      );
      expect(res._getOkBody().success).toBe(true);
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.user.findUnique.mockRejectedValue(
        new Error("DB connection lost")
      );

      const req = reqFor(incrementImageOCounter, {
        body: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(incrementImageOCounter);
      await incrementImageOCounter(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // recordImageView Tests
  // ==========================================================================

  describe("recordImageView", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(recordImageView, { body: { imageId: "img-1" } });
      const res = resFor(recordImageView);
      await recordImageView(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getBody()).toEqual({ error: "User not found" });
    });

    it("returns 400 when imageId is missing", async () => {
      const req = reqFor(recordImageView, { user: USER });
      const res = resFor(recordImageView);
      await recordImageView(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({
        error: "Missing required field: imageId",
      });
    });

    it("creates new view record with viewCount=1 when no history exists", async () => {
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);
      mockPrisma.imageViewHistory.create.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
          imageId: "img-1",
          instanceId: "instance-1",
          viewCount: 1,
          viewHistory: [new Date().toISOString()],
          oCount: 0,
          lastViewedAt: new Date(),
        })
      );

      const req = reqFor(recordImageView, {
        body: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(recordImageView);
      await recordImageView(req, res);

      expect(mockPrisma.imageViewHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            userId: 1,
            imageId: "img-1",
            viewCount: 1,
            oCount: 0,
          }),
        })
      );
      const body = res._getOkBody();
      expect(body.success).toBe(true);
      expect(body.viewCount).toBe(1);
      expect(body.lastViewedAt).toBeDefined();
    });

    it("increments viewCount on existing record", async () => {
      const existingHistory = ["2024-01-01T00:00:00.000Z"];
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
          imageId: "img-1",
          viewCount: 5,
          viewHistory: existingHistory,
          lastViewedAt: new Date("2024-01-01"),
        })
      );
      mockPrisma.imageViewHistory.update.mockResolvedValue(
        partialRow({
          id: 1,
          viewCount: 6,
          viewHistory: [...existingHistory, new Date().toISOString()],
          lastViewedAt: new Date(),
        })
      );

      const req = reqFor(recordImageView, {
        body: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(recordImageView);
      await recordImageView(req, res);

      expect(mockPrisma.imageViewHistory.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          viewCount: { increment: 1 },
          viewHistory: [...existingHistory, expect.any(String)],
          lastViewedAt: anyOf(Date),
        },
      });
      const body = res._getOkBody();
      expect(body.success).toBe(true);
      expect(body.viewCount).toBe(6);
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.imageViewHistory.findUnique.mockRejectedValue(
        new Error("Query failed")
      );

      const req = reqFor(recordImageView, {
        body: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(recordImageView);
      await recordImageView(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // getImageViewHistory Tests
  // ==========================================================================

  describe("getImageViewHistory", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(getImageViewHistory, { params: { imageId: "img-1" } });
      const res = resFor(getImageViewHistory);
      await getImageViewHistory(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getBody()).toEqual({ error: "User not authenticated" });
    });

    it("returns 400 when imageId is missing", async () => {
      const req = reqFor(getImageViewHistory, { user: USER });
      const res = resFor(getImageViewHistory);
      await getImageViewHistory(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({
        error: "Missing required parameter: imageId",
      });
    });

    it("returns exists:false when no history found", async () => {
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);

      const req = reqFor(getImageViewHistory, {
        params: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(getImageViewHistory);
      await getImageViewHistory(req, res);

      expect(res._getBody()).toEqual({
        exists: false,
        viewCount: 0,
        oCount: 0,
      });
    });

    it("returns full history when record exists", async () => {
      const lastViewed = new Date("2024-06-15T12:00:00.000Z");
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
          imageId: "img-1",
          instanceId: "instance-1",
          viewCount: 10,
          viewHistory: ["2024-06-15T12:00:00.000Z"],
          oCount: 3,
          oHistory: [
            "2024-06-10T08:00:00.000Z",
            "2024-06-12T08:00:00.000Z",
            "2024-06-14T08:00:00.000Z",
          ],
          lastViewedAt: lastViewed,
        })
      );

      const req = reqFor(getImageViewHistory, {
        params: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(getImageViewHistory);
      await getImageViewHistory(req, res);

      const body = res._getOkBody();
      expect(body.exists).toBe(true);
      expect(body.viewCount).toBe(10);
      expect(body.oCount).toBe(3);
      expect(body.lastViewedAt).toEqual(lastViewed);
      expect(Array.isArray(body.viewHistory)).toBe(true);
      expect(Array.isArray(body.oHistory)).toBe(true);
    });

    it("parses JSON strings in viewHistory and oHistory", async () => {
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          viewCount: 2,
          viewHistory: JSON.stringify([
            "2024-01-01T00:00:00.000Z",
            "2024-01-02T00:00:00.000Z",
          ]),
          oCount: 1,
          oHistory: JSON.stringify(["2024-01-01T12:00:00.000Z"]),
          lastViewedAt: new Date("2024-01-02"),
        })
      );

      const req = reqFor(getImageViewHistory, {
        params: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(getImageViewHistory);
      await getImageViewHistory(req, res);

      const body = res._getOkBody();
      expect(body.exists).toBe(true);
      expect(Array.isArray(body.viewHistory)).toBe(true);
      expect(body.viewHistory).toHaveLength(2);
      expect(Array.isArray(body.oHistory)).toBe(true);
      expect(body.oHistory).toHaveLength(1);
    });

    it("uses instanceId from query param when provided", async () => {
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);

      const req = reqFor(getImageViewHistory, {
        params: { imageId: "img-1" },
        user: USER,
        query: {
          instanceId: "query-instance",
        },
      });
      const res = resFor(getImageViewHistory);
      await getImageViewHistory(req, res);

      expect(mockGetEntityInstanceId).not.toHaveBeenCalled();
      expect(mockPrisma.imageViewHistory.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: objectContaining({
            userId_instanceId_imageId: objectContaining({
              instanceId: "query-instance",
            }),
          }),
        })
      );
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.imageViewHistory.findUnique.mockRejectedValue(
        new Error("DB timeout")
      );

      const req = reqFor(getImageViewHistory, {
        params: { imageId: "img-1" },
        user: USER,
      });
      const res = resFor(getImageViewHistory);
      await getImageViewHistory(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });
});
