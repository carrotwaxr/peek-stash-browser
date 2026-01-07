/**
 * Unit Tests for StashEntityService
 *
 * Tests the cached entity query service using mocked Prisma client
 */
import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from "vitest";

// Mock StashInstanceManager to provide a default config for stream URL generation
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefaultConfig: () => ({
      id: "test-instance",
      name: "Test Stash",
      url: "http://localhost:9999/graphql",
      apiKey: "test-api-key",
    }),
    getAllConfigs: () => [],
    loadFromDatabase: async () => undefined,
  },
}));

// Mock the prisma module with inline factory
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    stashScene: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    stashPerformer: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    stashStudio: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    stashTag: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    stashGallery: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    stashGroup: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    stashImage: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    // Junction table mocks for count queries
    scenePerformer: {
      count: vi.fn(),
    },
    sceneTag: {
      count: vi.fn(),
    },
    sceneGroup: {
      count: vi.fn(),
    },
    sceneGallery: {
      count: vi.fn(),
    },
    imageGallery: {
      count: vi.fn(),
    },
    imagePerformer: {
      count: vi.fn(),
    },
    imageTag: {
      count: vi.fn(),
    },
    galleryPerformer: {
      count: vi.fn(),
    },
    performerTag: {
      count: vi.fn(),
    },
    studioTag: {
      count: vi.fn(),
    },
    groupTag: {
      count: vi.fn(),
    },
    galleryTag: {
      count: vi.fn(),
    },
    syncState: {
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// Import mocked module
import prisma from "../../services/../prisma/singleton.js";

// Import service after mocking
import { stashEntityService } from "../../services/StashEntityService.js";

// Type-safe mock access helper
const getMock = (fn: unknown): Mock => fn as Mock;

// Sample test data using individual columns (matching new schema after JSON blob elimination)
// These mock the actual database row structure, not the normalized API response

// Cached database row format (individual columns)
const mockCachedScene = {
  id: "scene-1",
  title: "Test Scene",
  code: "TEST001",
  details: "Test details",
  date: "2024-01-15",
  duration: 3600,
  rating100: null,
  oCounter: 0,
  playCount: 0,
  playDuration: 0,
  organized: false,
  studioId: null,
  filePath: "/path/to/scene.mp4",
  fileBitRate: 5000000,
  fileFrameRate: 30,
  fileWidth: 1920,
  fileHeight: 1080,
  fileVideoCodec: "h264",
  fileAudioCodec: "aac",
  fileSize: BigInt(1000000),
  pathScreenshot: null,
  pathPreview: null,
  pathSprite: null,
  pathVtt: null,
  pathChaptersVtt: null,
  pathStream: null,
  pathCaption: null,
  streams: "[]",
  stashCreatedAt: new Date("2024-01-01T00:00:00Z"),
  stashUpdatedAt: new Date("2024-01-02T00:00:00Z"),
  syncedAt: new Date(),
  deletedAt: null,
};

const mockCachedPerformer = {
  id: "performer-1",
  name: "Test Performer",
  disambiguation: null,
  gender: "FEMALE",
  birthdate: "1990-01-01",
  ethnicity: null,
  country: null,
  eyeColor: null,
  hairColor: null,
  heightCm: null,
  weightKg: null,
  measurements: null,
  fakeTits: null,
  tattoos: null,
  piercings: null,
  careerLength: null,
  aliases: null,
  details: null,
  deathDate: null,
  circumcised: null,
  penisLength: null,
  rating100: null,
  favorite: false,
  imagePath: null,
  oCounter: 0,
  sceneCount: 0,
  imageCount: 0,
  galleryCount: 0,
  groupCount: 0,
  stashCreatedAt: new Date("2024-01-01T00:00:00Z"),
  stashUpdatedAt: new Date("2024-01-02T00:00:00Z"),
  syncedAt: new Date(),
  deletedAt: null,
};

const mockCachedStudio = {
  id: "studio-1",
  name: "Test Studio",
  url: null,
  parentStudioId: null,
  details: null,
  rating100: null,
  favorite: false,
  imagePath: null,
  stashCreatedAt: new Date("2024-01-01T00:00:00Z"),
  stashUpdatedAt: new Date("2024-01-02T00:00:00Z"),
  syncedAt: new Date(),
  deletedAt: null,
};

const mockCachedTag = {
  id: "tag-1",
  name: "Test Tag",
  description: "Test tag description",
  parentTagId: null,
  favorite: false,
  imagePath: null,
  stashCreatedAt: new Date("2024-01-01T00:00:00Z"),
  stashUpdatedAt: new Date("2024-01-02T00:00:00Z"),
  syncedAt: new Date(),
  deletedAt: null,
};

const mockCachedGallery = {
  id: "gallery-1",
  title: "Test Gallery",
  code: null,
  date: null,
  details: null,
  studioId: null,
  rating100: null,
  organized: false,
  imageCount: 50,
  pathCover: null,
  stashCreatedAt: new Date("2024-01-01T00:00:00Z"),
  stashUpdatedAt: new Date("2024-01-02T00:00:00Z"),
  syncedAt: new Date(),
  deletedAt: null,
};

const mockCachedGroup = {
  id: "group-1",
  name: "Test Group",
  aliases: null,
  duration: null,
  date: null,
  rating100: null,
  studioId: null,
  director: null,
  synopsis: null,
  frontImagePath: null,
  backImagePath: null,
  stashCreatedAt: new Date("2024-01-01T00:00:00Z"),
  stashUpdatedAt: new Date("2024-01-02T00:00:00Z"),
  syncedAt: new Date(),
  deletedAt: null,
};

describe("StashEntityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for studio name lookup (used by getAllScenes* methods)
    getMock(prisma.stashStudio.findMany).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Scene Queries", () => {
    it("should get all scenes with default user fields", async () => {
      const mockCachedScenes = [
        { ...mockCachedScene },
        { ...mockCachedScene, id: "scene-2", title: "Scene 2" },
      ];

      getMock(prisma.stashScene.findMany).mockResolvedValue(mockCachedScenes);

      const result = await stashEntityService.getAllScenes();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("scene-1");
      expect(result[0].title).toBe("Test Scene");
      // Check default user fields are applied
      expect(result[0].favorite).toBe(false);
      expect(result[0].o_counter).toBe(0);
      expect(result[0].play_count).toBe(0);
      expect(result[0].rating100).toBeNull();
    });

    it("should get a single scene by ID", async () => {
      getMock(prisma.stashScene.findFirst).mockResolvedValue({ ...mockCachedScene });

      const result = await stashEntityService.getScene("scene-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("scene-1");
      expect(result!.title).toBe("Test Scene");
    });

    it("should return null for non-existent scene", async () => {
      getMock(prisma.stashScene.findFirst).mockResolvedValue(null);

      const result = await stashEntityService.getScene("non-existent");

      expect(result).toBeNull();
    });

    it("should get scenes by multiple IDs", async () => {
      const mockCachedScenes = [
        { ...mockCachedScene },
        { ...mockCachedScene, id: "scene-3", title: "Scene 3" },
      ];

      getMock(prisma.stashScene.findMany).mockResolvedValue(mockCachedScenes);

      const result = await stashEntityService.getScenesByIds(["scene-1", "scene-3"]);

      expect(result).toHaveLength(2);
      expect(result.map((s) => s.id)).toContain("scene-1");
      expect(result.map((s) => s.id)).toContain("scene-3");
    });

    it("should get scene count", async () => {
      getMock(prisma.stashScene.count).mockResolvedValue(150);

      const count = await stashEntityService.getSceneCount();

      expect(count).toBe(150);
    });
  });

  describe("Performer Queries", () => {
    it("should get all performers with default user fields", async () => {
      const mockCachedPerformers = [{ ...mockCachedPerformer }];

      getMock(prisma.stashPerformer.findMany).mockResolvedValue(mockCachedPerformers);

      const result = await stashEntityService.getAllPerformers();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("performer-1");
      expect(result[0].name).toBe("Test Performer");
      // Check default user fields
      expect(result[0].favorite).toBe(false);
      expect(result[0].o_counter).toBe(0);
    });

    it("should get performer by ID", async () => {
      getMock(prisma.stashPerformer.findFirst).mockResolvedValue({ ...mockCachedPerformer });
      // Mock junction table counts for getPerformer
      getMock(prisma.scenePerformer.count).mockResolvedValue(10);
      getMock(prisma.imagePerformer.count).mockResolvedValue(5);
      getMock(prisma.galleryPerformer.count).mockResolvedValue(3);
      // Mock raw query for group count
      getMock(prisma.$queryRaw).mockResolvedValue([{ count: 2 }]);

      const result = await stashEntityService.getPerformer("performer-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("performer-1");
      expect(result!.scene_count).toBe(10);
    });

    it("should return null for non-existent performer", async () => {
      getMock(prisma.stashPerformer.findFirst).mockResolvedValue(null);

      const result = await stashEntityService.getPerformer("non-existent");

      expect(result).toBeNull();
    });

    it("should get performers by IDs", async () => {
      const mockCachedPerformers = [
        { ...mockCachedPerformer },
        { ...mockCachedPerformer, id: "performer-2", name: "Performer 2" },
      ];

      getMock(prisma.stashPerformer.findMany).mockResolvedValue(mockCachedPerformers);

      const result = await stashEntityService.getPerformersByIds(["performer-1", "performer-2"]);

      expect(result).toHaveLength(2);
    });

    it("should get performer count", async () => {
      getMock(prisma.stashPerformer.count).mockResolvedValue(500);

      const count = await stashEntityService.getPerformerCount();

      expect(count).toBe(500);
    });
  });

  describe("Studio Queries", () => {
    it("should get all studios with default user fields", async () => {
      const mockCachedStudios = [{ ...mockCachedStudio }];

      getMock(prisma.stashStudio.findMany).mockResolvedValue(mockCachedStudios);

      const result = await stashEntityService.getAllStudios();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("studio-1");
      expect(result[0].name).toBe("Test Studio");
      // Check default user fields
      expect(result[0].favorite).toBe(false);
      expect(result[0].o_counter).toBe(0);
    });

    it("should get studio by ID", async () => {
      getMock(prisma.stashStudio.findFirst).mockResolvedValue({ ...mockCachedStudio });
      // Mock counts for getStudio
      getMock(prisma.stashScene.count).mockResolvedValue(20);
      getMock(prisma.stashImage.count).mockResolvedValue(15);
      getMock(prisma.stashGallery.count).mockResolvedValue(5);
      // Mock raw query results for performer and group counts
      getMock(prisma.$queryRaw).mockResolvedValue([{ count: 10 }]);

      const result = await stashEntityService.getStudio("studio-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("studio-1");
      expect(result!.scene_count).toBe(20);
    });

    it("should return null for non-existent studio", async () => {
      getMock(prisma.stashStudio.findFirst).mockResolvedValue(null);

      const result = await stashEntityService.getStudio("non-existent");

      expect(result).toBeNull();
    });

    it("should get studio count", async () => {
      getMock(prisma.stashStudio.count).mockResolvedValue(75);

      const count = await stashEntityService.getStudioCount();

      expect(count).toBe(75);
    });
  });

  describe("Tag Queries", () => {
    it("should get all tags with default user fields", async () => {
      const mockCachedTags = [{ ...mockCachedTag }];

      getMock(prisma.stashTag.findMany).mockResolvedValue(mockCachedTags);

      const result = await stashEntityService.getAllTags();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("tag-1");
      expect(result[0].name).toBe("Test Tag");
      // Check default user fields
      expect(result[0].favorite).toBe(false);
      expect(result[0].rating100).toBeNull();
    });

    it("should get tag by ID", async () => {
      getMock(prisma.stashTag.findFirst).mockResolvedValue({ ...mockCachedTag });
      // Mock junction table counts for getTag
      getMock(prisma.sceneTag.count).mockResolvedValue(25);
      getMock(prisma.imageTag.count).mockResolvedValue(10);
      getMock(prisma.galleryTag.count).mockResolvedValue(5);
      getMock(prisma.performerTag.count).mockResolvedValue(8);
      getMock(prisma.studioTag.count).mockResolvedValue(3);
      getMock(prisma.groupTag.count).mockResolvedValue(2);

      const result = await stashEntityService.getTag("tag-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("tag-1");
      expect(result!.scene_count).toBe(25);
    });

    it("should return null for non-existent tag", async () => {
      getMock(prisma.stashTag.findFirst).mockResolvedValue(null);

      const result = await stashEntityService.getTag("non-existent");

      expect(result).toBeNull();
    });

    it("should get tag count", async () => {
      getMock(prisma.stashTag.count).mockResolvedValue(200);

      const count = await stashEntityService.getTagCount();

      expect(count).toBe(200);
    });
  });

  describe("Gallery Queries", () => {
    it("should get all galleries with default user fields", async () => {
      const mockCachedGalleries = [{ ...mockCachedGallery }];

      getMock(prisma.stashGallery.findMany).mockResolvedValue(mockCachedGalleries);

      const result = await stashEntityService.getAllGalleries();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("gallery-1");
      expect(result[0].title).toBe("Test Gallery");
      // Check default user fields
      expect(result[0].favorite).toBe(false);
    });

    it("should get gallery by ID", async () => {
      getMock(prisma.stashGallery.findFirst).mockResolvedValue({ ...mockCachedGallery });
      // Mock junction table counts for getGallery
      getMock(prisma.imageGallery.count).mockResolvedValue(50);

      const result = await stashEntityService.getGallery("gallery-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("gallery-1");
      expect(result!.image_count).toBe(50);
    });

    it("should return null for non-existent gallery", async () => {
      getMock(prisma.stashGallery.findFirst).mockResolvedValue(null);

      const result = await stashEntityService.getGallery("non-existent");

      expect(result).toBeNull();
    });

    it("should get gallery count", async () => {
      getMock(prisma.stashGallery.count).mockResolvedValue(50);

      const count = await stashEntityService.getGalleryCount();

      expect(count).toBe(50);
    });
  });

  describe("Group Queries", () => {
    it("should get all groups with default user fields", async () => {
      const mockCachedGroups = [{ ...mockCachedGroup }];

      getMock(prisma.stashGroup.findMany).mockResolvedValue(mockCachedGroups);

      const result = await stashEntityService.getAllGroups();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("group-1");
      expect(result[0].name).toBe("Test Group");
      // Check default user fields
      expect(result[0].favorite).toBe(false);
    });

    it("should get group by ID", async () => {
      getMock(prisma.stashGroup.findFirst).mockResolvedValue({ ...mockCachedGroup });
      // Mock junction table counts for getGroup
      getMock(prisma.sceneGroup.count).mockResolvedValue(15);
      // Mock raw query for performer count
      getMock(prisma.$queryRaw).mockResolvedValue([{ count: 8 }]);

      const result = await stashEntityService.getGroup("group-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("group-1");
      expect(result!.scene_count).toBe(15);
    });

    it("should return null for non-existent group", async () => {
      getMock(prisma.stashGroup.findFirst).mockResolvedValue(null);

      const result = await stashEntityService.getGroup("non-existent");

      expect(result).toBeNull();
    });

    it("should get group count", async () => {
      getMock(prisma.stashGroup.count).mockResolvedValue(25);

      const count = await stashEntityService.getGroupCount();

      expect(count).toBe(25);
    });
  });

  describe("Stats and Readiness", () => {
    it("should get stats for all entity types", async () => {
      getMock(prisma.stashScene.count).mockResolvedValue(1000);
      getMock(prisma.stashPerformer.count).mockResolvedValue(500);
      getMock(prisma.stashStudio.count).mockResolvedValue(100);
      getMock(prisma.stashTag.count).mockResolvedValue(300);
      getMock(prisma.stashGallery.count).mockResolvedValue(50);
      getMock(prisma.stashGroup.count).mockResolvedValue(25);
      getMock(prisma.stashImage.count).mockResolvedValue(2000);

      const stats = await stashEntityService.getStats();

      expect(stats.scenes).toBe(1000);
      expect(stats.performers).toBe(500);
      expect(stats.studios).toBe(100);
      expect(stats.tags).toBe(300);
      expect(stats.galleries).toBe(50);
      expect(stats.groups).toBe(25);
      expect(stats.images).toBe(2000);
    });

    it("should return true for isReady when sync state exists with lastFullSyncTimestamp", async () => {
      getMock(prisma.syncState.findFirst).mockResolvedValue({
        entityType: "scene",
        lastFullSyncTimestamp: "2024-01-01T00:00:00-08:00",
        lastIncrementalSyncTimestamp: null,
      });

      const ready = await stashEntityService.isReady();

      expect(ready).toBe(true);
    });

    it("should return true for isReady when sync state exists with lastIncrementalSyncTimestamp", async () => {
      getMock(prisma.syncState.findFirst).mockResolvedValue({
        entityType: "scene",
        lastFullSyncTimestamp: null,
        lastIncrementalSyncTimestamp: "2024-01-02T00:00:00-08:00",
      });

      const ready = await stashEntityService.isReady();

      expect(ready).toBe(true);
    });

    it("should return false for isReady when no sync state exists", async () => {
      getMock(prisma.syncState.findFirst).mockResolvedValue(null);

      const ready = await stashEntityService.isReady();

      expect(ready).toBe(false);
    });

    it("should return false for isReady when sync state has no timestamps", async () => {
      getMock(prisma.syncState.findFirst).mockResolvedValue({
        entityType: "scene",
        lastFullSyncTimestamp: null,
        lastIncrementalSyncTimestamp: null,
      });

      const ready = await stashEntityService.isReady();

      expect(ready).toBe(false);
    });

    it("should get last refreshed time", async () => {
      const lastSyncDate = new Date("2024-01-15T12:00:00Z");
      getMock(prisma.syncState.findFirst).mockResolvedValue({
        entityType: "scene",
        lastFullSyncActual: lastSyncDate,
        lastIncrementalSyncActual: null,
      });

      const lastRefreshed = await stashEntityService.getLastRefreshed();

      expect(lastRefreshed).toEqual(lastSyncDate);
    });

    it("should return null for last refreshed when no sync state", async () => {
      getMock(prisma.syncState.findFirst).mockResolvedValue(null);

      const lastRefreshed = await stashEntityService.getLastRefreshed();

      expect(lastRefreshed).toBeNull();
    });

    it("should get cache version as timestamp", async () => {
      const syncDate = new Date("2024-01-15T12:00:00Z");
      getMock(prisma.syncState.findFirst).mockResolvedValue({
        entityType: "scene",
        lastFullSyncActual: syncDate,
        lastIncrementalSyncActual: null,
      });

      const version = await stashEntityService.getCacheVersion();

      expect(version).toBe(syncDate.getTime());
    });

    it("should return 0 for cache version when no sync", async () => {
      getMock(prisma.syncState.findFirst).mockResolvedValue(null);

      const version = await stashEntityService.getCacheVersion();

      expect(version).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty result sets gracefully", async () => {
      getMock(prisma.stashScene.findMany).mockResolvedValue([]);

      const result = await stashEntityService.getAllScenes();

      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should handle empty ID array in getByIds", async () => {
      getMock(prisma.stashScene.findMany).mockResolvedValue([]);

      const result = await stashEntityService.getScenesByIds([]);

      expect(result).toHaveLength(0);
      expect(prisma.stashScene.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [] },
          deletedAt: null,
        },
      });
    });
  });
});
