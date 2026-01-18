/**
 * Unit Tests for StashSyncService Cleanup Functionality
 *
 * Tests the cleanupDeletedEntities method which soft-deletes local entities
 * that no longer exist in Stash (due to deletion or merge operations).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock prisma before any imports - define mock inline (vi.mock is hoisted)
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    stashScene: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    stashPerformer: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    stashStudio: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    stashTag: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    stashGroup: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    stashGallery: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    stashImage: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    syncState: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    syncSettings: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    stashInstance: {
      findFirst: vi.fn().mockResolvedValue({
        id: "test-instance",
        name: "Test",
        url: "http://localhost:9999",
        apiKey: "test-key",
        enabled: true,
      }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: "test-instance",
          name: "Test",
          url: "http://localhost:9999",
          apiKey: "test-key",
          enabled: true,
        },
      ]),
    },
    $queryRaw: vi.fn(),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  },
}));

// Create mock functions for stash API
const mockFindSceneIDs = vi.fn();
const mockFindPerformerIDs = vi.fn();
const mockFindStudioIDs = vi.fn();
const mockFindTagIDs = vi.fn();
const mockFindGroupIDs = vi.fn();
const mockFindGalleryIDs = vi.fn();
const mockFindImageIDs = vi.fn();

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefault: vi.fn(() => ({
      findSceneIDs: mockFindSceneIDs,
      findPerformerIDs: mockFindPerformerIDs,
      findStudioIDs: mockFindStudioIDs,
      findTagIDs: mockFindTagIDs,
      findGroupIDs: mockFindGroupIDs,
      findGalleryIDs: mockFindGalleryIDs,
      findImageIDs: mockFindImageIDs,
    })),
    initialize: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock other services that might be called during cleanup
vi.mock("../../services/EntityImageCountService.js", () => ({
  entityImageCountService: {
    recomputeAllCounts: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../services/ImageGalleryInheritanceService.js", () => ({
  imageGalleryInheritanceService: {
    recomputeAllImages: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../services/SceneTagInheritanceService.js", () => ({
  sceneTagInheritanceService: {
    recomputeAllScenes: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../services/UserStatsService.js", () => ({
  userStatsService: {
    recomputeAllUsers: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: {
    recomputeAllUsers: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../services/MergeReconciliationService.js", () => ({
  mergeReconciliationService: {
    findPhashMatches: vi.fn().mockResolvedValue([]),
    reconcileScene: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger to suppress output during tests
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocking
import { stashSyncService } from "../../services/StashSyncService.js";
import prisma from "../../services/../prisma/singleton.js";

describe("StashSyncService Cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Page size used by cleanupDeletedEntities for paginated fetching
  const CLEANUP_PAGE_SIZE = 5000;

  describe("ID-only query methods", () => {
    it("should use findSceneIDs for scene cleanup", async () => {
      mockFindSceneIDs.mockResolvedValue({
        findScenes: { scenes: [{ id: "1" }, { id: "2" }, { id: "3" }], count: 3 },
      });

      // Access private method via any cast (for testing)
      await (stashSyncService as any).cleanupDeletedEntities("scene");

      expect(mockFindSceneIDs).toHaveBeenCalledWith({
        filter: { per_page: CLEANUP_PAGE_SIZE, page: 1 },
      });
    });

    it("should use findPerformerIDs for performer cleanup", async () => {
      mockFindPerformerIDs.mockResolvedValue({
        findPerformers: { performers: [{ id: "1" }], count: 1 },
      });

      await (stashSyncService as any).cleanupDeletedEntities("performer");

      expect(mockFindPerformerIDs).toHaveBeenCalledWith({
        filter: { per_page: CLEANUP_PAGE_SIZE, page: 1 },
      });
    });

    it("should use findStudioIDs for studio cleanup", async () => {
      mockFindStudioIDs.mockResolvedValue({
        findStudios: { studios: [{ id: "1" }], count: 1 },
      });

      await (stashSyncService as any).cleanupDeletedEntities("studio");

      expect(mockFindStudioIDs).toHaveBeenCalledWith({
        filter: { per_page: CLEANUP_PAGE_SIZE, page: 1 },
      });
    });

    it("should use findTagIDs for tag cleanup", async () => {
      mockFindTagIDs.mockResolvedValue({
        findTags: { tags: [{ id: "1" }], count: 1 },
      });

      await (stashSyncService as any).cleanupDeletedEntities("tag");

      expect(mockFindTagIDs).toHaveBeenCalledWith({
        filter: { per_page: CLEANUP_PAGE_SIZE, page: 1 },
      });
    });

    it("should use findGroupIDs for group cleanup", async () => {
      mockFindGroupIDs.mockResolvedValue({
        findGroups: { groups: [{ id: "1" }], count: 1 },
      });

      await (stashSyncService as any).cleanupDeletedEntities("group");

      expect(mockFindGroupIDs).toHaveBeenCalledWith({
        filter: { per_page: CLEANUP_PAGE_SIZE, page: 1 },
      });
    });

    it("should use findGalleryIDs for gallery cleanup", async () => {
      mockFindGalleryIDs.mockResolvedValue({
        findGalleries: { galleries: [{ id: "1" }], count: 1 },
      });

      await (stashSyncService as any).cleanupDeletedEntities("gallery");

      expect(mockFindGalleryIDs).toHaveBeenCalledWith({
        filter: { per_page: CLEANUP_PAGE_SIZE, page: 1 },
      });
    });

    it("should use findImageIDs for image cleanup", async () => {
      mockFindImageIDs.mockResolvedValue({
        findImages: { images: [{ id: "1" }], count: 1 },
      });

      await (stashSyncService as any).cleanupDeletedEntities("image");

      expect(mockFindImageIDs).toHaveBeenCalledWith({
        filter: { per_page: CLEANUP_PAGE_SIZE, page: 1 },
      });
    });
  });

  describe("Soft delete behavior", () => {
    it("should soft-delete scenes not in Stash", async () => {
      // Stash only has scenes 1, 2, 3
      mockFindSceneIDs.mockResolvedValue({
        findScenes: { scenes: [{ id: "1" }, { id: "2" }, { id: "3" }], count: 3 },
      });
      // Mock $queryRawUnsafe to return scenes 4,5 that should be deleted (not in Stash)
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        { id: "4", phash: null },
        { id: "5", phash: null },
      ]);
      vi.mocked(prisma.stashScene.updateMany).mockResolvedValue({ count: 2 });

      const result = await (stashSyncService as any).cleanupDeletedEntities("scene");

      expect(result).toBe(2);
      // New implementation uses batched IN clauses for scenes to delete
      expect(prisma.stashScene.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["4", "5"] } },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it("should soft-delete performers not in Stash", async () => {
      mockFindPerformerIDs.mockResolvedValue({
        findPerformers: { performers: [{ id: "p1" }, { id: "p2" }], count: 2 },
      });
      vi.mocked(prisma.stashPerformer.updateMany).mockResolvedValue({ count: 5 });

      const result = await (stashSyncService as any).cleanupDeletedEntities("performer");

      expect(result).toBe(5);
      expect(prisma.stashPerformer.updateMany).toHaveBeenCalledWith({
        where: { deletedAt: null, stashInstanceId: null, id: { notIn: ["p1", "p2"] } },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it("should return 0 when no entities need cleanup", async () => {
      mockFindSceneIDs.mockResolvedValue({
        findScenes: { scenes: [{ id: "1" }], count: 1 },
      });
      // Mock $queryRawUnsafe to return no scenes (all local scenes exist in Stash)
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([]);
      vi.mocked(prisma.stashScene.updateMany).mockResolvedValue({ count: 0 });

      const result = await (stashSyncService as any).cleanupDeletedEntities("scene");

      expect(result).toBe(0);
      // updateMany should not be called since there are no scenes to delete
      expect(prisma.stashScene.updateMany).not.toHaveBeenCalled();
    });

    it("should only update entities where deletedAt is null", async () => {
      mockFindTagIDs.mockResolvedValue({
        findTags: { tags: [{ id: "t1" }], count: 1 },
      });
      vi.mocked(prisma.stashTag.updateMany).mockResolvedValue({ count: 3 });

      await (stashSyncService as any).cleanupDeletedEntities("tag");

      // Verify the where clause includes deletedAt: null
      expect(prisma.stashTag.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        })
      );
    });
  });

  describe("Error handling", () => {
    it("should return 0 and not throw when Stash API fails", async () => {
      mockFindSceneIDs.mockRejectedValue(new Error("API connection failed"));

      const result = await (stashSyncService as any).cleanupDeletedEntities("scene");

      expect(result).toBe(0);
    });

    it("should return 0 for unknown entity type", async () => {
      const result = await (stashSyncService as any).cleanupDeletedEntities("unknown" as any);

      expect(result).toBe(0);
    });

    it("should return 0 when count field is missing (malformed API response)", async () => {
      // Malformed response without count field
      mockFindSceneIDs.mockResolvedValue({
        findScenes: { scenes: [{ id: "1" }] },
      });

      const result = await (stashSyncService as any).cleanupDeletedEntities("scene");

      expect(result).toBe(0);
    });
  });

  describe("Empty Stash scenario", () => {
    it("should handle empty Stash (all entities deleted)", async () => {
      // Stash returns no scenes - all local scenes should be soft-deleted
      mockFindSceneIDs.mockResolvedValue({
        findScenes: { scenes: [], count: 0 },
      });
      // Mock $queryRawUnsafe to return 100 local scenes that should all be deleted
      const localScenes = Array.from({ length: 100 }, (_, i) => ({
        id: String(i + 1),
        phash: null,
      }));
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue(localScenes);
      vi.mocked(prisma.stashScene.updateMany).mockResolvedValue({ count: 100 });

      const result = await (stashSyncService as any).cleanupDeletedEntities("scene");

      expect(result).toBe(100);
      // New implementation uses batched IN clauses - first batch has IDs 1-100
      const expectedIds = Array.from({ length: 100 }, (_, i) => String(i + 1));
      expect(prisma.stashScene.updateMany).toHaveBeenCalledWith({
        where: { id: { in: expectedIds } },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
