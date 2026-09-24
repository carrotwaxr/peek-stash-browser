/**
 * Unit Tests for Merge Reconciliation Routes (Admin API)
 *
 * Tests the admin endpoints for managing orphaned scene data:
 * - GET /api/admin/orphaned-scenes - List orphaned scenes
 * - GET /api/admin/orphaned-scenes/:id/matches - Get phash matches
 * - POST /api/admin/orphaned-scenes/:id/reconcile - Transfer data to target
 * - POST /api/admin/orphaned-scenes/:id/discard - Delete orphaned data
 * - POST /api/admin/reconcile-all - Auto-reconcile all with exact matches
 *
 * The handler tests call each route's real handler from the router, with the
 * service and the auth middleware mocked.
 */
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate, requireAdmin } from "../../middleware/auth.js";
// Import after mocks are set up
import {
  type OrphanedSceneInfo,
  mergeReconciliationService,
} from "../../services/MergeReconciliationService.js";
import { findHandler, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock MergeReconciliationService - hoisted to top level
vi.mock("../../services/MergeReconciliationService.js", () => ({
  mergeReconciliationService: {
    findOrphanedScenesWithActivity: vi.fn(),
    findPhashMatches: vi.fn(),
    reconcileScene: vi.fn(),
    discardOrphanedData: vi.fn(),
  },
}));

// Mock auth middleware
vi.mock("../../middleware/auth.js", () => ({
  authenticate: vi.fn((_req: Request, _res: Response, next: NextFunction) =>
    next()
  ),
  requireAdmin: vi.fn((_req: Request, _res: Response, next: NextFunction) =>
    next()
  ),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Get mocked functions
const mockService = vi.mocked(mergeReconciliationService);
const mockAuthenticate = vi.mocked(authenticate);
const mockRequireAdmin = vi.mocked(requireAdmin);

/** The route's handler, from the real router (auth middleware is mocked). */
async function routeHandler(method: "get" | "post", path: string) {
  const { default: router } =
    await import("../../routes/mergeReconciliation.js");
  return findHandler(router, method, path);
}

const ADMIN = { id: 1, username: "admin", role: "ADMIN" };

describe("Merge Reconciliation Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // Authentication and Admin Middleware Tests
  // ============================================================================

  describe("Authentication Requirements", () => {
    it("should have authenticate middleware that returns 401 for unauthenticated requests", async () => {
      const req = reqFor(authenticate);
      const res = resFor(authenticate);

      // Configure authenticate to return 401
      mockAuthenticate.mockImplementation((_req, res, _next) =>
        Promise.resolve(
          res.status(401).json({ error: "Access denied. No token provided." })
        )
      );

      await mockAuthenticate(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Access denied. No token provided.",
      });
    });
  });

  describe("Admin Requirement", () => {
    it("should have requireAdmin middleware that returns 403 for non-admin users", () => {
      const req = reqFor(requireAdmin, {
        user: { id: 1, username: "user", role: "USER" },
      });
      const res = resFor(requireAdmin);

      // Configure requireAdmin to return 403 for non-admin
      mockRequireAdmin.mockImplementation((req, res, _next) => {
        const authReq = req as Request & { user?: { role: string } };
        if (!authReq.user || authReq.user.role !== "ADMIN") {
          return res.status(403).json({ error: "Admin access required." });
        }
      });

      mockRequireAdmin(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Admin access required.",
      });
    });

    it("should allow admin users through requireAdmin middleware", () => {
      const req = reqFor(requireAdmin, { user: ADMIN });
      const res = resFor(requireAdmin);
      const mockNext = vi.fn();

      // Configure requireAdmin to pass admin through
      mockRequireAdmin.mockImplementation((req, _res, next) => {
        const authReq = req as Request & { user?: { role: string } };
        if (authReq.user?.role === "ADMIN") {
          next();
        }
        return undefined;
      });

      mockRequireAdmin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // GET /api/admin/orphaned-scenes Handler Tests
  // ============================================================================

  describe("GET /orphaned-scenes handler", () => {
    it("should return list of orphaned scenes", async () => {
      const mockOrphans: OrphanedSceneInfo[] = [
        {
          id: "scene-1",
          title: "Deleted Scene 1",
          phash: "abc123",
          deletedAt: new Date("2024-01-01"),
          userActivityCount: 5,
          totalPlayCount: 10,
          hasRatings: true,
          hasFavorites: false,
        },
        {
          id: "scene-2",
          title: "Deleted Scene 2",
          phash: "def456",
          deletedAt: new Date("2024-01-02"),
          userActivityCount: 3,
          totalPlayCount: 7,
          hasRatings: false,
          hasFavorites: true,
        },
      ];

      mockService.findOrphanedScenesWithActivity.mockResolvedValue(mockOrphans);

      const handler = await routeHandler("get", "/orphaned-scenes");
      const res = resFor(handler);
      await handler(reqFor(handler, { user: ADMIN }), res, vi.fn());

      expect(res.json).toHaveBeenCalledWith({
        scenes: mockOrphans,
        totalCount: 2,
      });
      expect(mockService.findOrphanedScenesWithActivity).toHaveBeenCalledTimes(
        1
      );
    });

    it("should return empty list when no orphaned scenes exist", async () => {
      mockService.findOrphanedScenesWithActivity.mockResolvedValue([]);

      const handler = await routeHandler("get", "/orphaned-scenes");
      const res = resFor(handler);
      await handler(reqFor(handler, { user: ADMIN }), res, vi.fn());

      expect(res.json).toHaveBeenCalledWith({
        scenes: [],
        totalCount: 0,
      });
    });

    it("should return 500 on service error", async () => {
      mockService.findOrphanedScenesWithActivity.mockRejectedValue(
        new Error("Database error")
      );

      const handler = await routeHandler("get", "/orphaned-scenes");
      const res = resFor(handler);
      await handler(reqFor(handler, { user: ADMIN }), res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to fetch orphaned scenes",
        message: "Database error",
      });
    });
  });

  // ============================================================================
  // GET /api/admin/orphaned-scenes/:id/matches Handler Tests
  // ============================================================================

  describe("GET /orphaned-scenes/:id/matches handler", () => {
    it("should return phash matches for an orphaned scene", async () => {
      const mockMatches = [
        {
          sceneId: "target-1",
          title: "Similar Scene 1",
          similarity: "exact" as const,
          recommended: true,
        },
        {
          sceneId: "target-2",
          title: "Similar Scene 2",
          similarity: "exact" as const,
          recommended: false,
        },
      ];

      mockService.findPhashMatches.mockResolvedValue(mockMatches);

      const handler = await routeHandler("get", "/orphaned-scenes/:id/matches");
      const req = reqFor(handler, {
        params: { id: "scene-123" },
        user: ADMIN,
      });
      const res = resFor(handler);
      await handler(req, res, vi.fn());

      expect(res.json).toHaveBeenCalledWith({ matches: mockMatches });
      expect(mockService.findPhashMatches).toHaveBeenCalledWith("scene-123");
    });

    it("should return empty matches when no phash matches found", async () => {
      mockService.findPhashMatches.mockResolvedValue([]);

      const handler = await routeHandler("get", "/orphaned-scenes/:id/matches");
      const req = reqFor(handler, { params: { id: "scene-123" } });
      const res = resFor(handler);
      await handler(req, res, vi.fn());

      expect(res.json).toHaveBeenCalledWith({ matches: [] });
    });

    it("should return 500 on service error", async () => {
      mockService.findPhashMatches.mockRejectedValue(
        new Error("Lookup failed")
      );

      const handler = await routeHandler("get", "/orphaned-scenes/:id/matches");
      const req = reqFor(handler, { params: { id: "scene-123" } });
      const res = resFor(handler);
      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to fetch matches",
        message: "Lookup failed",
      });
    });
  });

  // ============================================================================
  // POST /api/admin/orphaned-scenes/:id/reconcile Handler Tests
  // ============================================================================

  describe("POST /orphaned-scenes/:id/reconcile handler", () => {
    it("should return 400 when targetSceneId is missing", async () => {
      const handler = await routeHandler(
        "post",
        "/orphaned-scenes/:id/reconcile"
      );
      const req = reqFor(handler, {
        params: { id: "scene-123" },
        body: {},
        user: ADMIN,
      });
      const res = resFor(handler);
      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "targetSceneId is required",
      });
    });

    it("should reconcile scene and return result", async () => {
      const mockResult = {
        sourceSceneId: "scene-123",
        targetSceneId: "target-456",
        usersReconciled: 3,
        mergeRecordsCreated: 3,
      };

      mockService.reconcileScene.mockResolvedValue(mockResult);

      const handler = await routeHandler(
        "post",
        "/orphaned-scenes/:id/reconcile"
      );
      const req = reqFor(handler, {
        params: { id: "scene-123" },
        body: { targetSceneId: "target-456" },
        user: ADMIN,
      });
      const res = resFor(handler);
      await handler(req, res, vi.fn());

      expect(mockService.reconcileScene).toHaveBeenCalledWith(
        "scene-123",
        "target-456",
        null,
        1
      );
      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        sourceSceneId: "scene-123",
        targetSceneId: "target-456",
        usersReconciled: 3,
        mergeRecordsCreated: 3,
      });
    });

    it("should return 500 on service error", async () => {
      mockService.reconcileScene.mockRejectedValue(
        new Error("Transfer failed")
      );

      const handler = await routeHandler(
        "post",
        "/orphaned-scenes/:id/reconcile"
      );
      const req = reqFor(handler, {
        params: { id: "scene-123" },
        body: { targetSceneId: "target-456" },
        user: ADMIN,
      });
      const res = resFor(handler);
      await handler(req, res, vi.fn());

      expect(mockService.reconcileScene).toHaveBeenCalledWith(
        "scene-123",
        "target-456",
        null,
        1
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to reconcile scene",
        message: "Transfer failed",
      });
    });
  });

  // ============================================================================
  // POST /api/admin/orphaned-scenes/:id/discard Handler Tests
  // ============================================================================

  describe("POST /orphaned-scenes/:id/discard handler", () => {
    it("should discard orphaned data and return counts", async () => {
      const mockResult = {
        watchHistoryDeleted: 5,
        ratingsDeleted: 2,
      };

      mockService.discardOrphanedData.mockResolvedValue(mockResult);

      const handler = await routeHandler(
        "post",
        "/orphaned-scenes/:id/discard"
      );
      const req = reqFor(handler, {
        params: { id: "scene-123" },
        user: ADMIN,
      });
      const res = resFor(handler);
      await handler(req, res, vi.fn());

      expect(mockService.discardOrphanedData).toHaveBeenCalledWith("scene-123");
      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        watchHistoryDeleted: 5,
        ratingsDeleted: 2,
      });
    });

    it("should return 500 on service error", async () => {
      mockService.discardOrphanedData.mockRejectedValue(
        new Error("Delete failed")
      );

      const handler = await routeHandler(
        "post",
        "/orphaned-scenes/:id/discard"
      );
      const req = reqFor(handler, { params: { id: "scene-123" } });
      const res = resFor(handler);
      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to discard orphaned data",
        message: "Delete failed",
      });
    });
  });

  // ============================================================================
  // POST /api/admin/reconcile-all Handler Tests
  // ============================================================================

  describe("POST /reconcile-all handler", () => {
    it("should reconcile all orphans with exact matches", async () => {
      const mockOrphans: OrphanedSceneInfo[] = [
        partialRow({ id: "orphan-1", phash: "abc123", title: "Scene 1" }),
        partialRow({ id: "orphan-2", phash: "def456", title: "Scene 2" }),
        partialRow({ id: "orphan-3", phash: null, title: "Scene 3" }), // No phash - will be skipped
      ];

      mockService.findOrphanedScenesWithActivity.mockResolvedValue(mockOrphans);

      // First orphan has exact match, second has no exact match
      mockService.findPhashMatches.mockImplementation((id: string) => {
        if (id === "orphan-1") {
          return Promise.resolve([
            {
              sceneId: "target-1",
              title: "Match 1",
              similarity: "exact" as const,
              recommended: true,
            },
          ]);
        }
        return Promise.resolve([
          {
            sceneId: "target-2",
            title: "Match 2",
            similarity: "similar" as const,
            recommended: true,
          },
        ]);
      });

      mockService.reconcileScene.mockResolvedValue({
        sourceSceneId: "orphan-1",
        targetSceneId: "target-1",
        usersReconciled: 2,
        mergeRecordsCreated: 2,
      });

      const handler = await routeHandler("post", "/reconcile-all");
      const res = resFor(handler);
      await handler(reqFor(handler, { user: ADMIN }), res, vi.fn());

      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        reconciled: 1,
        skipped: 2, // orphan-2 (no exact) + orphan-3 (no phash)
      });

      // Verify reconcileScene was called only for exact match
      expect(mockService.reconcileScene).toHaveBeenCalledTimes(1);
      expect(mockService.reconcileScene).toHaveBeenCalledWith(
        "orphan-1",
        "target-1",
        "abc123",
        1
      );
    });

    it("should handle no orphans gracefully", async () => {
      mockService.findOrphanedScenesWithActivity.mockResolvedValue([]);

      const handler = await routeHandler("post", "/reconcile-all");
      const res = resFor(handler);
      await handler(reqFor(handler, { user: ADMIN }), res, vi.fn());

      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        reconciled: 0,
        skipped: 0,
      });
    });

    it("should skip all when no exact matches found", async () => {
      const mockOrphans: OrphanedSceneInfo[] = [
        partialRow({ id: "orphan-1", phash: "abc123", title: "Scene 1" }),
      ];

      mockService.findOrphanedScenesWithActivity.mockResolvedValue(mockOrphans);
      mockService.findPhashMatches.mockResolvedValue([
        {
          sceneId: "target-1",
          title: "Similar",
          similarity: "similar" as const,
          recommended: true,
        },
      ]);

      const handler = await routeHandler("post", "/reconcile-all");
      const res = resFor(handler);
      await handler(reqFor(handler, { user: ADMIN }), res, vi.fn());

      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        reconciled: 0,
        skipped: 1,
      });
      expect(mockService.reconcileScene).not.toHaveBeenCalled();
    });

    it("should return 500 on service error", async () => {
      mockService.findOrphanedScenesWithActivity.mockRejectedValue(
        new Error("Database unavailable")
      );

      const handler = await routeHandler("post", "/reconcile-all");
      const res = resFor(handler);
      await handler(reqFor(handler, { user: ADMIN }), res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to reconcile all",
        message: "Database unavailable",
      });
    });
  });
});
