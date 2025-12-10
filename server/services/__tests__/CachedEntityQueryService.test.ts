/**
 * Unit Tests for StashEntityService
 *
 * Tests the cached entity query service using mocked Prisma client
 */
import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from "vitest";

// Mock the prisma module with inline factory
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    cachedScene: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    cachedPerformer: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    cachedStudio: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    cachedTag: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    cachedGallery: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    cachedGroup: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    cachedImage: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    syncState: {
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// Import mocked module
import prisma from "../../prisma/singleton.js";

// Import service after mocking
import { stashEntityService } from "../StashEntityService.js";

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
  data: "{}",
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
  data: "{}",
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
  data: "{}",
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
  data: "{}",
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
  data: "{}",
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
  data: "{}",
};

describe("StashEntityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      getMock(prisma.cachedScene.findMany).mockResolvedValue(mockCachedScenes);

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
      getMock(prisma.cachedScene.findFirst).mockResolvedValue({ ...mockCachedScene });

      const result = await stashEntityService.getScene("scene-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("scene-1");
      expect(result!.title).toBe("Test Scene");
    });

    it("should return null for non-existent scene", async () => {
      getMock(prisma.cachedScene.findFirst).mockResolvedValue(null);

      const result = await stashEntityService.getScene("non-existent");

      expect(result).toBeNull();
    });

    it("should get scenes by multiple IDs", async () => {
      const mockCachedScenes = [
        { ...mockCachedScene },
        { ...mockCachedScene, id: "scene-3", title: "Scene 3" },
      ];

      getMock(prisma.cachedScene.findMany).mockResolvedValue(mockCachedScenes);

      const result = await stashEntityService.getScenesByIds(["scene-1", "scene-3"]);

      expect(result).toHaveLength(2);
      expect(result.map((s) => s.id)).toContain("scene-1");
      expect(result.map((s) => s.id)).toContain("scene-3");
    });

    it("should get scene count", async () => {
      getMock(prisma.cachedScene.count).mockResolvedValue(150);

      const count = await stashEntityService.getSceneCount();

      expect(count).toBe(150);
    });
  });

  describe("Performer Queries", () => {
    it("should get all performers with default user fields", async () => {
      const mockCachedPerformers = [{ ...mockCachedPerformer }];

      getMock(prisma.cachedPerformer.findMany).mockResolvedValue(mockCachedPerformers);

      const result = await stashEntityService.getAllPerformers();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("performer-1");
      expect(result[0].name).toBe("Test Performer");
      // Check default user fields
      expect(result[0].favorite).toBe(false);
      expect(result[0].o_counter).toBe(0);
    });

    it("should get performer by ID", async () => {
      getMock(prisma.cachedPerformer.findFirst).mockResolvedValue({ ...mockCachedPerformer });

      const result = await stashEntityService.getPerformer("performer-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("performer-1");
    });

    it("should return null for non-existent performer", async () => {
      getMock(prisma.cachedPerformer.findFirst).mockResolvedValue(null);

      const result = await stashEntityService.getPerformer("non-existent");

      expect(result).toBeNull();
    });

    it("should get performers by IDs", async () => {
      const mockCachedPerformers = [
        { ...mockCachedPerformer },
        { ...mockCachedPerformer, id: "performer-2", name: "Performer 2" },
      ];

      getMock(prisma.cachedPerformer.findMany).mockResolvedValue(mockCachedPerformers);

      const result = await stashEntityService.getPerformersByIds(["performer-1", "performer-2"]);

      expect(result).toHaveLength(2);
    });

    it("should get performer count", async () => {
      getMock(prisma.cachedPerformer.count).mockResolvedValue(500);

      const count = await stashEntityService.getPerformerCount();

      expect(count).toBe(500);
    });
  });

  describe("Studio Queries", () => {
    it("should get all studios with default user fields", async () => {
      const mockCachedStudios = [{ ...mockCachedStudio }];

      getMock(prisma.cachedStudio.findMany).mockResolvedValue(mockCachedStudios);

      const result = await stashEntityService.getAllStudios();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("studio-1");
      expect(result[0].name).toBe("Test Studio");
      // Check default user fields
      expect(result[0].favorite).toBe(false);
      expect(result[0].o_counter).toBe(0);
    });

    it("should get studio by ID", async () => {
      getMock(prisma.cachedStudio.findFirst).mockResolvedValue({ ...mockCachedStudio });

      const result = await stashEntityService.getStudio("studio-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("studio-1");
    });

    it("should return null for non-existent studio", async () => {
      getMock(prisma.cachedStudio.findFirst).mockResolvedValue(null);

      const result = await stashEntityService.getStudio("non-existent");

      expect(result).toBeNull();
    });

    it("should get studio count", async () => {
      getMock(prisma.cachedStudio.count).mockResolvedValue(75);

      const count = await stashEntityService.getStudioCount();

      expect(count).toBe(75);
    });
  });

  describe("Tag Queries", () => {
    it("should get all tags with default user fields", async () => {
      const mockCachedTags = [{ ...mockCachedTag }];

      getMock(prisma.cachedTag.findMany).mockResolvedValue(mockCachedTags);

      const result = await stashEntityService.getAllTags();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("tag-1");
      expect(result[0].name).toBe("Test Tag");
      // Check default user fields
      expect(result[0].favorite).toBe(false);
      expect(result[0].rating100).toBeNull();
    });

    it("should get tag by ID", async () => {
      getMock(prisma.cachedTag.findFirst).mockResolvedValue({ ...mockCachedTag });

      const result = await stashEntityService.getTag("tag-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("tag-1");
    });

    it("should return null for non-existent tag", async () => {
      getMock(prisma.cachedTag.findFirst).mockResolvedValue(null);

      const result = await stashEntityService.getTag("non-existent");

      expect(result).toBeNull();
    });

    it("should get tag count", async () => {
      getMock(prisma.cachedTag.count).mockResolvedValue(200);

      const count = await stashEntityService.getTagCount();

      expect(count).toBe(200);
    });
  });

  describe("Gallery Queries", () => {
    it("should get all galleries with default user fields", async () => {
      const mockCachedGalleries = [{ ...mockCachedGallery }];

      getMock(prisma.cachedGallery.findMany).mockResolvedValue(mockCachedGalleries);

      const result = await stashEntityService.getAllGalleries();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("gallery-1");
      expect(result[0].title).toBe("Test Gallery");
      // Check default user fields
      expect(result[0].favorite).toBe(false);
    });

    it("should get gallery by ID", async () => {
      getMock(prisma.cachedGallery.findFirst).mockResolvedValue({ ...mockCachedGallery });

      const result = await stashEntityService.getGallery("gallery-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("gallery-1");
    });

    it("should return null for non-existent gallery", async () => {
      getMock(prisma.cachedGallery.findFirst).mockResolvedValue(null);

      const result = await stashEntityService.getGallery("non-existent");

      expect(result).toBeNull();
    });

    it("should get gallery count", async () => {
      getMock(prisma.cachedGallery.count).mockResolvedValue(50);

      const count = await stashEntityService.getGalleryCount();

      expect(count).toBe(50);
    });
  });

  describe("Group Queries", () => {
    it("should get all groups with default user fields", async () => {
      const mockCachedGroups = [{ ...mockCachedGroup }];

      getMock(prisma.cachedGroup.findMany).mockResolvedValue(mockCachedGroups);

      const result = await stashEntityService.getAllGroups();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("group-1");
      expect(result[0].name).toBe("Test Group");
      // Check default user fields
      expect(result[0].favorite).toBe(false);
    });

    it("should get group by ID", async () => {
      getMock(prisma.cachedGroup.findFirst).mockResolvedValue({ ...mockCachedGroup });

      const result = await stashEntityService.getGroup("group-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("group-1");
    });

    it("should return null for non-existent group", async () => {
      getMock(prisma.cachedGroup.findFirst).mockResolvedValue(null);

      const result = await stashEntityService.getGroup("non-existent");

      expect(result).toBeNull();
    });

    it("should get group count", async () => {
      getMock(prisma.cachedGroup.count).mockResolvedValue(25);

      const count = await stashEntityService.getGroupCount();

      expect(count).toBe(25);
    });
  });

  describe("Stats and Readiness", () => {
    it("should get stats for all entity types", async () => {
      getMock(prisma.cachedScene.count).mockResolvedValue(1000);
      getMock(prisma.cachedPerformer.count).mockResolvedValue(500);
      getMock(prisma.cachedStudio.count).mockResolvedValue(100);
      getMock(prisma.cachedTag.count).mockResolvedValue(300);
      getMock(prisma.cachedGallery.count).mockResolvedValue(50);
      getMock(prisma.cachedGroup.count).mockResolvedValue(25);
      getMock(prisma.cachedImage.count).mockResolvedValue(2000);

      const stats = await stashEntityService.getStats();

      expect(stats.scenes).toBe(1000);
      expect(stats.performers).toBe(500);
      expect(stats.studios).toBe(100);
      expect(stats.tags).toBe(300);
      expect(stats.galleries).toBe(50);
      expect(stats.groups).toBe(25);
      expect(stats.images).toBe(2000);
    });

    it("should return true for isReady when sync state exists with lastFullSync", async () => {
      getMock(prisma.syncState.findFirst).mockResolvedValue({
        entityType: "scene",
        lastFullSync: new Date("2024-01-01T00:00:00Z"),
        lastIncrementalSync: null,
      });

      const ready = await stashEntityService.isReady();

      expect(ready).toBe(true);
    });

    it("should return true for isReady when sync state exists with lastIncrementalSync", async () => {
      getMock(prisma.syncState.findFirst).mockResolvedValue({
        entityType: "scene",
        lastFullSync: null,
        lastIncrementalSync: new Date("2024-01-02T00:00:00Z"),
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
        lastFullSync: null,
        lastIncrementalSync: null,
      });

      const ready = await stashEntityService.isReady();

      expect(ready).toBe(false);
    });

    it("should get last refreshed time", async () => {
      const lastSyncDate = new Date("2024-01-15T12:00:00Z");
      getMock(prisma.syncState.findFirst).mockResolvedValue({
        entityType: "scene",
        lastFullSync: lastSyncDate,
        lastIncrementalSync: null,
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
        lastFullSync: syncDate,
        lastIncrementalSync: null,
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
      getMock(prisma.cachedScene.findMany).mockResolvedValue([]);

      const result = await stashEntityService.getAllScenes();

      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should handle empty ID array in getByIds", async () => {
      getMock(prisma.cachedScene.findMany).mockResolvedValue([]);

      const result = await stashEntityService.getScenesByIds([]);

      expect(result).toHaveLength(0);
      expect(prisma.cachedScene.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [] },
          deletedAt: null,
        },
      });
    });
  });
});
