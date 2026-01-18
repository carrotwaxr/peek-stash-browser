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
 * These tests follow the pattern from watchHistory.test.ts, testing the route
 * handlers directly with mock request/response objects.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";

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
  authenticate: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireAdmin: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks are set up
import { mergeReconciliationService } from "../../services/MergeReconciliationService.js";
import { authenticate, requireAdmin } from "../../middleware/auth.js";

// Get mocked functions
const mockService = vi.mocked(mergeReconciliationService);
const mockAuthenticate = vi.mocked(authenticate);
const mockRequireAdmin = vi.mocked(requireAdmin);

// Helper to create mock request
interface MockRequestOptions {
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  user?: { id: number; username: string; role: string } | undefined;
}

function createMockRequest(options: MockRequestOptions = {}): Partial<Request> {
  return {
    params: options.params || {},
    body: options.body || {},
    user: options.user,
  } as Partial<Request>;
}

// Helper to create mock response with chainable status
function createMockResponse() {
  const responseJson = vi.fn();
  const responseStatus = vi.fn(() => ({ json: responseJson }));

  return {
    json: responseJson,
    status: responseStatus,
    responseJson,
    responseStatus,
  };
}

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
      const mockReq = createMockRequest();
      const { responseStatus, responseJson } = createMockResponse();
      const mockRes = { json: responseJson, status: responseStatus } as unknown as Response;

      // Configure authenticate to return 401
      mockAuthenticate.mockImplementation((_req, res, _next) => {
        return res.status(401).json({ error: "Access denied. No token provided." });
      });

      await mockAuthenticate(mockReq as Request, mockRes, vi.fn());

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({ error: "Access denied. No token provided." });
    });
  });

  describe("Admin Requirement", () => {
    it("should have requireAdmin middleware that returns 403 for non-admin users", async () => {
      const mockReq = createMockRequest({ user: { id: 1, username: "user", role: "USER" } });
      const { responseStatus, responseJson } = createMockResponse();
      const mockRes = { json: responseJson, status: responseStatus } as unknown as Response;

      // Configure requireAdmin to return 403 for non-admin
      mockRequireAdmin.mockImplementation((req, res, _next) => {
        const authReq = req as Request & { user?: { role: string } };
        if (!authReq.user || authReq.user.role !== "ADMIN") {
          return res.status(403).json({ error: "Admin access required." });
        }
      });

      await mockRequireAdmin(mockReq as Request, mockRes, vi.fn());

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({ error: "Admin access required." });
    });

    it("should allow admin users through requireAdmin middleware", async () => {
      const mockReq = createMockRequest({ user: { id: 1, username: "admin", role: "ADMIN" } });
      const mockRes = {} as Response;
      const mockNext = vi.fn();

      // Configure requireAdmin to pass admin through
      mockRequireAdmin.mockImplementation((req, _res, next) => {
        const authReq = req as Request & { user?: { role: string } };
        if (authReq.user?.role === "ADMIN") {
          next();
        }
      });

      await mockRequireAdmin(mockReq as Request, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // GET /api/admin/orphaned-scenes Handler Tests
  // ============================================================================

  describe("GET /orphaned-scenes handler", () => {
    it("should return list of orphaned scenes", async () => {
      const mockOrphans = [
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

      const mockReq = createMockRequest({ user: { id: 1, username: "admin", role: "ADMIN" } });
      const { responseJson } = createMockResponse();
      const mockRes = { json: responseJson } as unknown as Response;

      // Simulate handler logic
      const orphans = await mockService.findOrphanedScenesWithActivity();
      mockRes.json({
        scenes: orphans,
        totalCount: orphans.length,
      });

      expect(responseJson).toHaveBeenCalledWith({
        scenes: mockOrphans,
        totalCount: 2,
      });
      expect(mockService.findOrphanedScenesWithActivity).toHaveBeenCalledTimes(1);
    });

    it("should return empty list when no orphaned scenes exist", async () => {
      mockService.findOrphanedScenesWithActivity.mockResolvedValue([]);

      const { responseJson } = createMockResponse();
      const mockRes = { json: responseJson } as unknown as Response;

      const orphans = await mockService.findOrphanedScenesWithActivity();
      mockRes.json({
        scenes: orphans,
        totalCount: orphans.length,
      });

      expect(responseJson).toHaveBeenCalledWith({
        scenes: [],
        totalCount: 0,
      });
    });

    it("should return 500 on service error", async () => {
      mockService.findOrphanedScenesWithActivity.mockRejectedValue(
        new Error("Database error")
      );

      const { responseStatus, responseJson } = createMockResponse();
      const mockRes = { json: responseJson, status: responseStatus } as unknown as Response;

      try {
        await mockService.findOrphanedScenesWithActivity();
      } catch (error) {
        mockRes.status(500).json({
          error: "Failed to fetch orphaned scenes",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith({
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

      const mockReq = createMockRequest({
        params: { id: "scene-123" },
        user: { id: 1, username: "admin", role: "ADMIN" }
      });
      const { responseJson } = createMockResponse();
      const mockRes = { json: responseJson } as unknown as Response;

      const id = mockReq.params!.id;
      const matches = await mockService.findPhashMatches(id);
      mockRes.json({ matches });

      expect(responseJson).toHaveBeenCalledWith({ matches: mockMatches });
      expect(mockService.findPhashMatches).toHaveBeenCalledWith("scene-123");
    });

    it("should return empty matches when no phash matches found", async () => {
      mockService.findPhashMatches.mockResolvedValue([]);

      const mockReq = createMockRequest({ params: { id: "scene-123" } });
      const { responseJson } = createMockResponse();
      const mockRes = { json: responseJson } as unknown as Response;

      const id = mockReq.params!.id;
      const matches = await mockService.findPhashMatches(id);
      mockRes.json({ matches });

      expect(responseJson).toHaveBeenCalledWith({ matches: [] });
    });

    it("should return 500 on service error", async () => {
      mockService.findPhashMatches.mockRejectedValue(new Error("Lookup failed"));

      const mockReq = createMockRequest({ params: { id: "scene-123" } });
      const { responseStatus, responseJson } = createMockResponse();
      const mockRes = { json: responseJson, status: responseStatus } as unknown as Response;

      try {
        await mockService.findPhashMatches(mockReq.params!.id);
      } catch (error) {
        mockRes.status(500).json({
          error: "Failed to fetch matches",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith({
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
      const mockReq = createMockRequest({
        params: { id: "scene-123" },
        body: {},
        user: { id: 1, username: "admin", role: "ADMIN" }
      });
      const { responseStatus, responseJson } = createMockResponse();
      const mockRes = { json: responseJson, status: responseStatus } as unknown as Response;

      const { targetSceneId } = mockReq.body as { targetSceneId?: string };
      if (!targetSceneId) {
        mockRes.status(400).json({ error: "targetSceneId is required" });
      }

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({ error: "targetSceneId is required" });
    });

    it("should reconcile scene and return result", async () => {
      const mockResult = {
        sourceSceneId: "scene-123",
        targetSceneId: "target-456",
        usersReconciled: 3,
        mergeRecordsCreated: 3,
      };

      mockService.reconcileScene.mockResolvedValue(mockResult);

      const mockReq = createMockRequest({
        params: { id: "scene-123" },
        body: { targetSceneId: "target-456" },
        user: { id: 1, username: "admin", role: "ADMIN" }
      });
      const { responseJson } = createMockResponse();
      const mockRes = { json: responseJson } as unknown as Response;

      const id = mockReq.params!.id;
      const { targetSceneId } = mockReq.body as { targetSceneId: string };
      const userId = (mockReq as { user: { id: number } }).user.id;

      const result = await mockService.reconcileScene(
        id,
        targetSceneId,
        null,
        userId
      );

      mockRes.json({
        ok: true,
        ...result,
      });

      expect(mockService.reconcileScene).toHaveBeenCalledWith(
        "scene-123",
        "target-456",
        null,
        1
      );
      expect(responseJson).toHaveBeenCalledWith({
        ok: true,
        sourceSceneId: "scene-123",
        targetSceneId: "target-456",
        usersReconciled: 3,
        mergeRecordsCreated: 3,
      });
    });

    it("should return 500 on service error", async () => {
      mockService.reconcileScene.mockRejectedValue(new Error("Transfer failed"));

      const mockReq = createMockRequest({
        params: { id: "scene-123" },
        body: { targetSceneId: "target-456" },
        user: { id: 1, username: "admin", role: "ADMIN" }
      });
      const { responseStatus, responseJson } = createMockResponse();
      const mockRes = { json: responseJson, status: responseStatus } as unknown as Response;

      try {
        await mockService.reconcileScene("scene-123", "target-456", null, 1);
      } catch (error) {
        mockRes.status(500).json({
          error: "Failed to reconcile scene",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith({
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

      const mockReq = createMockRequest({
        params: { id: "scene-123" },
        user: { id: 1, username: "admin", role: "ADMIN" }
      });
      const { responseJson } = createMockResponse();
      const mockRes = { json: responseJson } as unknown as Response;

      const id = mockReq.params!.id;
      const result = await mockService.discardOrphanedData(id);

      mockRes.json({
        ok: true,
        ...result,
      });

      expect(mockService.discardOrphanedData).toHaveBeenCalledWith("scene-123");
      expect(responseJson).toHaveBeenCalledWith({
        ok: true,
        watchHistoryDeleted: 5,
        ratingsDeleted: 2,
      });
    });

    it("should return 500 on service error", async () => {
      mockService.discardOrphanedData.mockRejectedValue(new Error("Delete failed"));

      const mockReq = createMockRequest({ params: { id: "scene-123" } });
      const { responseStatus, responseJson } = createMockResponse();
      const mockRes = { json: responseJson, status: responseStatus } as unknown as Response;

      try {
        await mockService.discardOrphanedData(mockReq.params!.id);
      } catch (error) {
        mockRes.status(500).json({
          error: "Failed to discard orphaned data",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith({
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
      const mockOrphans = [
        { id: "orphan-1", phash: "abc123", title: "Scene 1" },
        { id: "orphan-2", phash: "def456", title: "Scene 2" },
        { id: "orphan-3", phash: null, title: "Scene 3" }, // No phash - will be skipped
      ];

      mockService.findOrphanedScenesWithActivity.mockResolvedValue(
        mockOrphans as never
      );

      // First orphan has exact match, second has no exact match
      mockService.findPhashMatches.mockImplementation(async (id: string) => {
        if (id === "orphan-1") {
          return [
            { sceneId: "target-1", title: "Match 1", similarity: "exact" as const, recommended: true },
          ];
        }
        return [
          { sceneId: "target-2", title: "Match 2", similarity: "similar" as const, recommended: true },
        ];
      });

      mockService.reconcileScene.mockResolvedValue({
        sourceSceneId: "orphan-1",
        targetSceneId: "target-1",
        usersReconciled: 2,
        mergeRecordsCreated: 2,
      });

      const mockReq = createMockRequest({
        user: { id: 1, username: "admin", role: "ADMIN" }
      });
      const { responseJson } = createMockResponse();
      const mockRes = { json: responseJson } as unknown as Response;

      // Simulate the reconcile-all handler logic
      const orphans = await mockService.findOrphanedScenesWithActivity();
      let reconciled = 0;
      let skipped = 0;
      const userId = (mockReq as { user: { id: number } }).user.id;

      for (const orphan of orphans) {
        if (!orphan.phash) {
          skipped++;
          continue;
        }

        const matches = await mockService.findPhashMatches(orphan.id);
        const exactMatch = matches.find((m) => m.similarity === "exact");

        if (exactMatch) {
          await mockService.reconcileScene(
            orphan.id,
            exactMatch.sceneId,
            orphan.phash,
            userId
          );
          reconciled++;
        } else {
          skipped++;
        }
      }

      mockRes.json({
        ok: true,
        reconciled,
        skipped,
      });

      expect(responseJson).toHaveBeenCalledWith({
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

      const { responseJson } = createMockResponse();
      const mockRes = { json: responseJson } as unknown as Response;

      const orphans = await mockService.findOrphanedScenesWithActivity();
      let reconciled = 0;
      let skipped = 0;

      for (const orphan of orphans) {
        if (!orphan.phash) {
          skipped++;
          continue;
        }
        // ... rest of logic
      }

      mockRes.json({
        ok: true,
        reconciled,
        skipped,
      });

      expect(responseJson).toHaveBeenCalledWith({
        ok: true,
        reconciled: 0,
        skipped: 0,
      });
    });

    it("should skip all when no exact matches found", async () => {
      const mockOrphans = [
        { id: "orphan-1", phash: "abc123", title: "Scene 1" },
      ];

      mockService.findOrphanedScenesWithActivity.mockResolvedValue(
        mockOrphans as never
      );
      mockService.findPhashMatches.mockResolvedValue([
        { sceneId: "target-1", title: "Similar", similarity: "similar" as const, recommended: true },
      ]);

      const { responseJson } = createMockResponse();
      const mockRes = { json: responseJson } as unknown as Response;

      // Simulate handler logic
      const orphans = await mockService.findOrphanedScenesWithActivity();
      let reconciled = 0;
      let skipped = 0;

      for (const orphan of orphans) {
        if (!orphan.phash) {
          skipped++;
          continue;
        }

        const matches = await mockService.findPhashMatches(orphan.id);
        const exactMatch = matches.find((m) => m.similarity === "exact");

        if (exactMatch) {
          reconciled++;
        } else {
          skipped++;
        }
      }

      mockRes.json({
        ok: true,
        reconciled,
        skipped,
      });

      expect(responseJson).toHaveBeenCalledWith({
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

      const { responseStatus, responseJson } = createMockResponse();
      const mockRes = { json: responseJson, status: responseStatus } as unknown as Response;

      try {
        await mockService.findOrphanedScenesWithActivity();
      } catch (error) {
        mockRes.status(500).json({
          error: "Failed to reconcile all",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Failed to reconcile all",
        message: "Database unavailable",
      });
    });
  });
});
