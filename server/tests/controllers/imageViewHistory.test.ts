/**
 * Unit Tests for Image View History Controller
 *
 * Tests the image view history endpoints including:
 * - incrementImageOCounter (O counter for images)
 * - recordImageView (lightbox view tracking)
 * - getImageViewHistory (single image history retrieval)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Prisma - hoisted before imports
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: { findUnique: vi.fn() },
    imageViewHistory: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock entityInstanceId
vi.mock("../../utils/entityInstanceId.js", () => ({
  getEntityInstanceId: vi.fn().mockResolvedValue("instance-1"),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import prisma from "../../prisma/singleton.js";
import { getEntityInstanceId } from "../../utils/entityInstanceId.js";
import {
  incrementImageOCounter,
  recordImageView,
  getImageViewHistory,
} from "../../controllers/imageViewHistory.js";
import { mockReq, mockRes } from "../helpers/controllerTestUtils.js";

const mockPrisma = vi.mocked(prisma);
const mockGetEntityInstanceId = vi.mocked(getEntityInstanceId);

const USER = { id: 1, username: "testuser", role: "USER" };

describe("Image View History Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // incrementImageOCounter Tests
  // ==========================================================================

  describe("incrementImageOCounter", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = mockReq({ imageId: "img-1" });
      const res = mockRes();
      await incrementImageOCounter(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getBody()).toEqual({ error: "User not found" });
    });

    it("returns 400 when imageId is missing", async () => {
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await incrementImageOCounter(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({ error: "Missing required field: imageId" });
    });

    it("returns 401 when user is not found in database", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = mockReq({ imageId: "img-1" }, {}, USER);
      const res = mockRes();
      await incrementImageOCounter(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("creates new record with oCount=1 when no history exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as any);
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);
      mockPrisma.imageViewHistory.create.mockResolvedValue({
        id: 1,
        userId: 1,
        imageId: "img-1",
        instanceId: "instance-1",
        viewCount: 0,
        oCount: 1,
        oHistory: [new Date().toISOString()],
      } as any);

      const req = mockReq({ imageId: "img-1" }, {}, USER);
      const res = mockRes();
      await incrementImageOCounter(req, res);

      expect(mockPrisma.imageViewHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 1,
            imageId: "img-1",
            instanceId: "instance-1",
            viewCount: 0,
            oCount: 1,
          }),
        })
      );
      const body = res._getBody();
      expect(body.success).toBe(true);
      expect(body.oCount).toBe(1);
      expect(body.timestamp).toBeDefined();
    });

    it("increments oCount on existing record", async () => {
      const existingHistory = ["2024-01-01T00:00:00.000Z"];
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as any);
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        imageId: "img-1",
        instanceId: "instance-1",
        oCount: 3,
        oHistory: existingHistory,
      } as any);
      mockPrisma.imageViewHistory.update.mockResolvedValue({
        id: 1,
        oCount: 4,
        oHistory: [...existingHistory, new Date().toISOString()],
      } as any);

      const req = mockReq({ imageId: "img-1" }, {}, USER);
      const res = mockRes();
      await incrementImageOCounter(req, res);

      expect(mockPrisma.imageViewHistory.update).toHaveBeenCalled();
      const body = res._getBody();
      expect(body.success).toBe(true);
      expect(body.oCount).toBe(4);
    });

    it("uses instanceId from request body when provided", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as any);
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);
      mockPrisma.imageViewHistory.create.mockResolvedValue({
        id: 1,
        oCount: 1,
        oHistory: [],
      } as any);

      const req = mockReq({ imageId: "img-1", instanceId: "custom-instance" }, {}, USER);
      const res = mockRes();
      await incrementImageOCounter(req, res);

      expect(mockGetEntityInstanceId).not.toHaveBeenCalled();
      expect(mockPrisma.imageViewHistory.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_instanceId_imageId: expect.objectContaining({
              instanceId: "custom-instance",
            }),
          }),
        })
      );
    });

    it("falls back to getEntityInstanceId when instanceId not in body", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as any);
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);
      mockPrisma.imageViewHistory.create.mockResolvedValue({
        id: 1,
        oCount: 1,
        oHistory: [],
      } as any);

      const req = mockReq({ imageId: "img-1" }, {}, USER);
      const res = mockRes();
      await incrementImageOCounter(req, res);

      expect(mockGetEntityInstanceId).toHaveBeenCalledWith("image", "img-1");
    });

    it("logs warning when user has syncToStash enabled", async () => {
      const { logger } = await import("../../utils/logger.js");
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: true } as any);
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);
      mockPrisma.imageViewHistory.create.mockResolvedValue({
        id: 1,
        oCount: 1,
        oHistory: [],
      } as any);

      const req = mockReq({ imageId: "img-1" }, {}, USER);
      const res = mockRes();
      await incrementImageOCounter(req, res);

      expect(logger.warn).toHaveBeenCalled();
      expect(res._getBody().success).toBe(true);
    });

    it("handles oHistory stored as JSON string", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as any);
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue({
        id: 1,
        oCount: 2,
        oHistory: JSON.stringify(["2024-01-01T00:00:00.000Z", "2024-01-02T00:00:00.000Z"]),
      } as any);
      mockPrisma.imageViewHistory.update.mockResolvedValue({
        id: 1,
        oCount: 3,
        oHistory: [],
      } as any);

      const req = mockReq({ imageId: "img-1" }, {}, USER);
      const res = mockRes();
      await incrementImageOCounter(req, res);

      expect(mockPrisma.imageViewHistory.update).toHaveBeenCalled();
      expect(res._getBody().success).toBe(true);
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error("DB connection lost"));

      const req = mockReq({ imageId: "img-1" }, {}, USER);
      const res = mockRes();
      await incrementImageOCounter(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // recordImageView Tests
  // ==========================================================================

  describe("recordImageView", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = mockReq({ imageId: "img-1" });
      const res = mockRes();
      await recordImageView(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getBody()).toEqual({ error: "User not found" });
    });

    it("returns 400 when imageId is missing", async () => {
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await recordImageView(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({ error: "Missing required field: imageId" });
    });

    it("creates new view record with viewCount=1 when no history exists", async () => {
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);
      mockPrisma.imageViewHistory.create.mockResolvedValue({
        id: 1,
        userId: 1,
        imageId: "img-1",
        instanceId: "instance-1",
        viewCount: 1,
        viewHistory: [new Date().toISOString()],
        oCount: 0,
        lastViewedAt: new Date(),
      } as any);

      const req = mockReq({ imageId: "img-1" }, {}, USER);
      const res = mockRes();
      await recordImageView(req, res);

      expect(mockPrisma.imageViewHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 1,
            imageId: "img-1",
            viewCount: 1,
            oCount: 0,
          }),
        })
      );
      const body = res._getBody();
      expect(body.success).toBe(true);
      expect(body.viewCount).toBe(1);
      expect(body.lastViewedAt).toBeDefined();
    });

    it("increments viewCount on existing record", async () => {
      const existingHistory = ["2024-01-01T00:00:00.000Z"];
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        imageId: "img-1",
        viewCount: 5,
        viewHistory: existingHistory,
        lastViewedAt: new Date("2024-01-01"),
      } as any);
      mockPrisma.imageViewHistory.update.mockResolvedValue({
        id: 1,
        viewCount: 6,
        viewHistory: [...existingHistory, new Date().toISOString()],
        lastViewedAt: new Date(),
      } as any);

      const req = mockReq({ imageId: "img-1" }, {}, USER);
      const res = mockRes();
      await recordImageView(req, res);

      expect(mockPrisma.imageViewHistory.update).toHaveBeenCalled();
      const body = res._getBody();
      expect(body.success).toBe(true);
      expect(body.viewCount).toBe(6);
    });

    it("returns 500 on unexpected error", async () => {
      mockPrisma.imageViewHistory.findUnique.mockRejectedValue(
        new Error("Query failed")
      );

      const req = mockReq({ imageId: "img-1" }, {}, USER);
      const res = mockRes();
      await recordImageView(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ==========================================================================
  // getImageViewHistory Tests
  // ==========================================================================

  describe("getImageViewHistory", () => {
    it("returns 401 when user is not authenticated", async () => {
      const req = mockReq({}, { imageId: "img-1" });
      const res = mockRes();
      await getImageViewHistory(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getBody()).toEqual({ error: "User not authenticated" });
    });

    it("returns 400 when imageId is missing", async () => {
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getImageViewHistory(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({ error: "Missing required parameter: imageId" });
    });

    it("returns exists:false when no history found", async () => {
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);

      const req = mockReq({}, { imageId: "img-1" }, USER);
      const res = mockRes();
      await getImageViewHistory(req, res);

      expect(res._getBody()).toEqual({
        exists: false,
        viewCount: 0,
        oCount: 0,
      });
    });

    it("returns full history when record exists", async () => {
      const lastViewed = new Date("2024-06-15T12:00:00.000Z");
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        imageId: "img-1",
        instanceId: "instance-1",
        viewCount: 10,
        viewHistory: ["2024-06-15T12:00:00.000Z"],
        oCount: 3,
        oHistory: ["2024-06-10T08:00:00.000Z", "2024-06-12T08:00:00.000Z", "2024-06-14T08:00:00.000Z"],
        lastViewedAt: lastViewed,
      } as any);

      const req = mockReq({}, { imageId: "img-1" }, USER);
      const res = mockRes();
      await getImageViewHistory(req, res);

      const body = res._getBody();
      expect(body.exists).toBe(true);
      expect(body.viewCount).toBe(10);
      expect(body.oCount).toBe(3);
      expect(body.lastViewedAt).toEqual(lastViewed);
      expect(Array.isArray(body.viewHistory)).toBe(true);
      expect(Array.isArray(body.oHistory)).toBe(true);
    });

    it("parses JSON strings in viewHistory and oHistory", async () => {
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue({
        id: 1,
        viewCount: 2,
        viewHistory: JSON.stringify(["2024-01-01T00:00:00.000Z", "2024-01-02T00:00:00.000Z"]),
        oCount: 1,
        oHistory: JSON.stringify(["2024-01-01T12:00:00.000Z"]),
        lastViewedAt: new Date("2024-01-02"),
      } as any);

      const req = mockReq({}, { imageId: "img-1" }, USER);
      const res = mockRes();
      await getImageViewHistory(req, res);

      const body = res._getBody();
      expect(body.exists).toBe(true);
      expect(Array.isArray(body.viewHistory)).toBe(true);
      expect(body.viewHistory).toHaveLength(2);
      expect(Array.isArray(body.oHistory)).toBe(true);
      expect(body.oHistory).toHaveLength(1);
    });

    it("uses instanceId from query param when provided", async () => {
      mockPrisma.imageViewHistory.findUnique.mockResolvedValue(null);

      const req = mockReq({}, { imageId: "img-1" }, USER, { instanceId: "query-instance" });
      const res = mockRes();
      await getImageViewHistory(req, res);

      expect(mockGetEntityInstanceId).not.toHaveBeenCalled();
      expect(mockPrisma.imageViewHistory.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_instanceId_imageId: expect.objectContaining({
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

      const req = mockReq({}, { imageId: "img-1" }, USER);
      const res = mockRes();
      await getImageViewHistory(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });
});
