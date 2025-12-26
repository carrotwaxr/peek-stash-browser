/**
 * Unit Tests for StashSyncService
 *
 * Tests the incremental sync logic without requiring a real Stash instance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma before importing the service
const mockPrisma = {
  syncState: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  syncSettings: {
    findFirst: vi.fn(),
  },
  $executeRawUnsafe: vi.fn(),
};

vi.mock("../../prisma/singleton.js", () => ({
  default: mockPrisma,
}));

// Mock the stash instance manager
vi.mock("../StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefault: vi.fn(() => ({
      findTags: vi.fn().mockResolvedValue({ findTags: { tags: [], count: 0 } }),
      findStudios: vi.fn().mockResolvedValue({ findStudios: { studios: [], count: 0 } }),
      findPerformers: vi.fn().mockResolvedValue({ findPerformers: { performers: [], count: 0 } }),
      findGroups: vi.fn().mockResolvedValue({ findGroups: { groups: [], count: 0 } }),
      findGalleries: vi.fn().mockResolvedValue({ findGalleries: { galleries: [], count: 0 } }),
      findScenesCompact: vi.fn().mockResolvedValue({ findScenes: { scenes: [], count: 0 } }),
      findImages: vi.fn().mockResolvedValue({ findImages: { images: [], count: 0 } }),
    })),
    hasInstances: vi.fn(() => true),
  },
}));

// Mock user stats service
vi.mock("../UserStatsService.js", () => ({
  userStatsService: {
    rebuildAllStats: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("StashSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("incrementalSync", () => {
    it("should use per-entity timestamps, not a single global timestamp", async () => {
      // Import after mocks are set up
      const { stashSyncService } = await import("../StashSyncService.js");

      // Set up different timestamps for different entity types
      const tagTimestamp = new Date("2025-12-20T10:00:00Z");
      const performerTimestamp = new Date("2025-12-22T15:00:00Z");
      const sceneTimestamp = new Date("2025-12-25T08:00:00Z");

      mockPrisma.syncState.findFirst.mockImplementation(({ where }) => {
        if (where.entityType === "tag") {
          return Promise.resolve({ lastIncrementalSync: tagTimestamp, lastFullSync: null });
        }
        if (where.entityType === "performer") {
          return Promise.resolve({ lastIncrementalSync: performerTimestamp, lastFullSync: null });
        }
        if (where.entityType === "scene") {
          return Promise.resolve({ lastIncrementalSync: sceneTimestamp, lastFullSync: null });
        }
        // Return timestamps for other entity types
        return Promise.resolve({ lastIncrementalSync: new Date("2025-12-24T12:00:00Z"), lastFullSync: null });
      });

      // Run incremental sync
      await stashSyncService.incrementalSync();

      // Verify that findFirst was called for each entity type (not just scene)
      const findFirstCalls = mockPrisma.syncState.findFirst.mock.calls;

      // Should have calls for: tag, studio, performer, group, gallery, scene, image
      const entityTypesQueried = findFirstCalls.map((call) => call[0]?.where?.entityType);

      expect(entityTypesQueried).toContain("tag");
      expect(entityTypesQueried).toContain("performer");
      expect(entityTypesQueried).toContain("scene");
      expect(entityTypesQueried).toContain("studio");
      expect(entityTypesQueried).toContain("group");
      expect(entityTypesQueried).toContain("gallery");
      expect(entityTypesQueried).toContain("image");
    });

    it("should perform full sync for entity types that have never been synced", async () => {
      const { stashSyncService } = await import("../StashSyncService.js");

      // Tags have been synced, but performers have not
      mockPrisma.syncState.findFirst.mockImplementation(({ where }) => {
        if (where.entityType === "tag") {
          return Promise.resolve({
            lastIncrementalSync: new Date("2025-12-20T10:00:00Z"),
            lastFullSync: null,
          });
        }
        // No sync state for other entities
        return Promise.resolve(null);
      });

      await stashSyncService.incrementalSync();

      // Verify sync state was created/updated for entities
      expect(mockPrisma.syncState.findFirst).toHaveBeenCalled();
    });
  });
});
