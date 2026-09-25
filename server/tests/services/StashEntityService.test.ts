/**
 * Unit Tests for StashEntityService
 *
 * Tests the cached entity query service using mocked Prisma client
 */
// Import mocked module
import type {
  Prisma,
  StashGallery,
  StashGroup,
  StashPerformer,
  StashScene,
  StashStudio,
  StashTag,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
// Import service after mocking
import { stashEntityService } from "../../services/StashEntityService.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

// Mock StashInstanceManager to provide a default config for stream URL generation
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefaultConfig: () => ({
      id: "test-instance",
      name: "Test Stash",
      url: "http://localhost:9999/graphql",
      apiKey: "test-api-key",
    }),
    getConfig: (id: string) => ({
      id,
      name: `Instance ${id}`,
      url: "http://localhost:9999/graphql",
      apiKey: "test-api-key",
    }),
    getAllConfigs: () => [],
    // The enabled instances (the manager loads only those)
    getAllEnabled: () => [
      { id: "inst-a", name: "A" },
      { id: "inst-b", name: "B" },
    ],
    loadFromDatabase: () => Promise.resolve(),
  },
}));

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const mockPrisma = vi.mocked(prisma, true);

/** The instances the mocked manager has loaded */
const INSTANCES = ["inst-a", "inst-b"];

type SyncStateRow = Awaited<
  ReturnType<typeof mockPrisma.syncState.findMany>
>[number];

// Sample test data using individual columns (matching new schema after JSON blob elimination)
// These mock the actual database row structure, not the normalized API response

// Cached database row format (individual columns)
const mockCachedScene = partialRow<StashScene>({
  id: "scene-1",
  stashInstanceId: "test-instance",
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
  captions: null,
  stashCreatedAt: new Date("2024-01-01T00:00:00Z"),
  stashUpdatedAt: new Date("2024-01-02T00:00:00Z"),
  syncedAt: new Date(),
  deletedAt: null,
});

const mockCachedPerformer = partialRow<StashPerformer>({
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
  details: null,
  deathDate: null,
  rating100: null,
  favorite: false,
  imagePath: null,
  sceneCount: 0,
  imageCount: 0,
  galleryCount: 0,
  groupCount: 0,
  stashCreatedAt: new Date("2024-01-01T00:00:00Z"),
  stashUpdatedAt: new Date("2024-01-02T00:00:00Z"),
  syncedAt: new Date(),
  deletedAt: null,
});

const mockCachedStudio = partialRow<StashStudio>({
  id: "studio-1",
  name: "Test Studio",
  url: null,
  details: null,
  rating100: null,
  favorite: false,
  imagePath: null,
  stashCreatedAt: new Date("2024-01-01T00:00:00Z"),
  stashUpdatedAt: new Date("2024-01-02T00:00:00Z"),
  syncedAt: new Date(),
  deletedAt: null,
});

const mockCachedTag = partialRow<StashTag>({
  id: "tag-1",
  name: "Test Tag",
  description: "Test tag description",
  favorite: false,
  imagePath: null,
  stashCreatedAt: new Date("2024-01-01T00:00:00Z"),
  stashUpdatedAt: new Date("2024-01-02T00:00:00Z"),
  syncedAt: new Date(),
  deletedAt: null,
});

const mockCachedGallery = partialRow<StashGallery>({
  id: "gallery-1",
  title: "Test Gallery",
  code: null,
  date: null,
  details: null,
  studioId: null,
  rating100: null,
  imageCount: 50,
  stashCreatedAt: new Date("2024-01-01T00:00:00Z"),
  stashUpdatedAt: new Date("2024-01-02T00:00:00Z"),
  syncedAt: new Date(),
  deletedAt: null,
});

const mockCachedGroup = partialRow<StashGroup>({
  id: "group-1",
  stashInstanceId: "test-instance",
  name: "Test Group",
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
});

describe("StashEntityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for studio name lookup (used by getAllScenes* methods)
    mockPrisma.stashStudio.findMany.mockResolvedValue([]);
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

      mockPrisma.stashScene.findMany.mockResolvedValue(mockCachedScenes);

      const result = await stashEntityService.getAllScenes();

      expect(result).toHaveLength(2);
      expect(must(result[0]).id).toBe("scene-1");
      expect(must(result[0]).title).toBe("Test Scene");
      // Check default user fields are applied
      expect(must(result[0]).favorite).toBe(false);
      expect(must(result[0]).o_counter).toBe(0);
      expect(must(result[0]).play_count).toBe(0);
      expect(must(result[0]).rating100).toBeNull();
    });

    it("should get a single scene by ID", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue({
        ...mockCachedScene,
      });

      const result = await stashEntityService.getScene(
        "scene-1",
        "test-instance"
      );

      expect(result).not.toBeNull();
      expect(must(result).id).toBe("scene-1");
      expect(must(result).title).toBe("Test Scene");
    });

    it("should return null for non-existent scene", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue(null);

      const result = await stashEntityService.getScene(
        "non-existent",
        "test-instance"
      );

      expect(result).toBeNull();
    });

    it("should get scenes by multiple IDs", async () => {
      const mockCachedScenes = [
        { ...mockCachedScene },
        { ...mockCachedScene, id: "scene-3", title: "Scene 3" },
      ];

      mockPrisma.stashScene.findMany.mockResolvedValue(mockCachedScenes);

      const result = await stashEntityService.getScenesByIds(
        ["scene-1", "scene-3"],
        "test-instance"
      );

      expect(result).toHaveLength(2);
      expect(result.map((s) => s.id)).toContain("scene-1");
      expect(result.map((s) => s.id)).toContain("scene-3");
    });

    it("should get scene count", async () => {
      mockPrisma.stashScene.count.mockResolvedValue(150);

      const count = await stashEntityService.getSceneCount();

      expect(count).toBe(150);
    });
  });

  describe("Performer Queries", () => {
    it("should get all performers with default user fields", async () => {
      const mockCachedPerformers = [{ ...mockCachedPerformer }];

      mockPrisma.stashPerformer.findMany.mockResolvedValue(
        mockCachedPerformers
      );

      const result = await stashEntityService.getAllPerformers();

      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("performer-1");
      expect(must(result[0]).name).toBe("Test Performer");
      // Check default user fields
      expect(must(result[0]).favorite).toBe(false);
      expect(must(result[0]).o_counter).toBe(0);
    });

    it("should get performer by ID", async () => {
      mockPrisma.stashPerformer.findFirst.mockResolvedValue({
        ...mockCachedPerformer,
      });
      // Mock junction table counts for getPerformer
      mockPrisma.scenePerformer.count.mockResolvedValue(10);
      mockPrisma.imagePerformer.count.mockResolvedValue(5);
      mockPrisma.galleryPerformer.count.mockResolvedValue(3);
      // Mock raw query for group count
      mockPrisma.$queryRaw.mockResolvedValue([{ count: 2 }]);

      const result = await stashEntityService.getPerformer(
        "performer-1",
        "test-instance"
      );

      expect(result).not.toBeNull();
      expect(must(result).id).toBe("performer-1");
      expect(must(result).scene_count).toBe(10);
    });

    it("should return null for non-existent performer", async () => {
      mockPrisma.stashPerformer.findFirst.mockResolvedValue(null);

      const result = await stashEntityService.getPerformer(
        "non-existent",
        "test-instance"
      );

      expect(result).toBeNull();
    });

    it("should get performers by IDs", async () => {
      const mockCachedPerformers = [
        { ...mockCachedPerformer },
        { ...mockCachedPerformer, id: "performer-2", name: "Performer 2" },
      ];

      mockPrisma.stashPerformer.findMany.mockResolvedValue(
        mockCachedPerformers
      );

      const result = await stashEntityService.getPerformersByIds(
        ["performer-1", "performer-2"],
        "test-instance"
      );

      expect(result).toHaveLength(2);
    });

    it("should get performer count", async () => {
      mockPrisma.stashPerformer.count.mockResolvedValue(500);

      const count = await stashEntityService.getPerformerCount();

      expect(count).toBe(500);
    });
  });

  describe("Studio Queries", () => {
    it("should get all studios with default user fields", async () => {
      const mockCachedStudios = [{ ...mockCachedStudio }];

      mockPrisma.stashStudio.findMany.mockResolvedValue(mockCachedStudios);

      const result = await stashEntityService.getAllStudios();

      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("studio-1");
      expect(must(result[0]).name).toBe("Test Studio");
      // Check default user fields
      expect(must(result[0]).favorite).toBe(false);
      expect(must(result[0]).o_counter).toBe(0);
    });

    it("should get studio by ID", async () => {
      mockPrisma.stashStudio.findFirst.mockResolvedValue({
        ...mockCachedStudio,
      });
      // Mock counts for getStudio
      mockPrisma.stashScene.count.mockResolvedValue(20);
      mockPrisma.stashImage.count.mockResolvedValue(15);
      mockPrisma.stashGallery.count.mockResolvedValue(5);
      // Mock raw query results for performer and group counts
      mockPrisma.$queryRaw.mockResolvedValue([{ count: 10 }]);

      const result = await stashEntityService.getStudio(
        "studio-1",
        "test-instance"
      );

      expect(result).not.toBeNull();
      expect(must(result).id).toBe("studio-1");
      expect(must(result).scene_count).toBe(20);
    });

    it("should return null for non-existent studio", async () => {
      mockPrisma.stashStudio.findFirst.mockResolvedValue(null);

      const result = await stashEntityService.getStudio(
        "non-existent",
        "test-instance"
      );

      expect(result).toBeNull();
    });

    it("should get studio count", async () => {
      mockPrisma.stashStudio.count.mockResolvedValue(75);

      const count = await stashEntityService.getStudioCount();

      expect(count).toBe(75);
    });
  });

  describe("Tag Queries", () => {
    it("should get all tags with default user fields", async () => {
      const mockCachedTags = [{ ...mockCachedTag }];

      mockPrisma.stashTag.findMany.mockResolvedValue(mockCachedTags);

      const result = await stashEntityService.getAllTags();

      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("tag-1");
      expect(must(result[0]).name).toBe("Test Tag");
      // Check default user fields
      expect(must(result[0]).favorite).toBe(false);
      expect(must(result[0]).rating100).toBeNull();
    });

    it("should get tag by ID", async () => {
      mockPrisma.stashTag.findFirst.mockResolvedValue({
        ...mockCachedTag,
      });
      // Mock junction table counts for getTag
      mockPrisma.sceneTag.count.mockResolvedValue(25);
      mockPrisma.imageTag.count.mockResolvedValue(10);
      mockPrisma.galleryTag.count.mockResolvedValue(5);
      mockPrisma.performerTag.count.mockResolvedValue(8);
      mockPrisma.studioTag.count.mockResolvedValue(3);
      mockPrisma.groupTag.count.mockResolvedValue(2);

      const result = await stashEntityService.getTag("tag-1", "test-instance");

      expect(result).not.toBeNull();
      expect(must(result).id).toBe("tag-1");
      expect(must(result).scene_count).toBe(25);
    });

    it("should return null for non-existent tag", async () => {
      mockPrisma.stashTag.findFirst.mockResolvedValue(null);

      const result = await stashEntityService.getTag(
        "non-existent",
        "test-instance"
      );

      expect(result).toBeNull();
    });

    it("should get tag count", async () => {
      mockPrisma.stashTag.count.mockResolvedValue(200);

      const count = await stashEntityService.getTagCount();

      expect(count).toBe(200);
    });
  });

  describe("Gallery Queries", () => {
    it("should get all galleries with default user fields", async () => {
      const mockCachedGalleries = [{ ...mockCachedGallery }];

      mockPrisma.stashGallery.findMany.mockResolvedValue(mockCachedGalleries);

      const result = await stashEntityService.getAllGalleries();

      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("gallery-1");
      expect(must(result[0]).title).toBe("Test Gallery");
      // Check default user fields
      expect(must(result[0]).favorite).toBe(false);
    });

    it("should get gallery by ID", async () => {
      mockPrisma.stashGallery.findFirst.mockResolvedValue({
        ...mockCachedGallery,
      });
      // Mock junction table counts for getGallery
      mockPrisma.imageGallery.count.mockResolvedValue(50);

      const result = await stashEntityService.getGallery(
        "gallery-1",
        "test-instance"
      );

      expect(result).not.toBeNull();
      expect(must(result).id).toBe("gallery-1");
      expect(must(result).image_count).toBe(50);
    });

    it("should return null for non-existent gallery", async () => {
      mockPrisma.stashGallery.findFirst.mockResolvedValue(null);

      const result = await stashEntityService.getGallery(
        "non-existent",
        "test-instance"
      );

      expect(result).toBeNull();
    });

    it("should get gallery count", async () => {
      mockPrisma.stashGallery.count.mockResolvedValue(50);

      const count = await stashEntityService.getGalleryCount();

      expect(count).toBe(50);
    });
  });

  describe("Group Queries", () => {
    it("should get all groups with default user fields", async () => {
      const mockCachedGroups = [{ ...mockCachedGroup }];

      mockPrisma.stashGroup.findMany.mockResolvedValue(mockCachedGroups);

      const result = await stashEntityService.getAllGroups();

      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("group-1");
      expect(must(result[0]).name).toBe("Test Group");
      // Check default user fields
      expect(must(result[0]).favorite).toBe(false);
    });

    it("should get group by ID", async () => {
      mockPrisma.stashGroup.findFirst.mockResolvedValue({
        ...mockCachedGroup,
      });
      // Mock junction table counts for getGroup
      mockPrisma.sceneGroup.count.mockResolvedValue(15);
      // Mock raw query for performer count
      mockPrisma.$queryRaw.mockResolvedValue([{ count: 8 }]);

      const result = await stashEntityService.getGroup(
        "group-1",
        "test-instance"
      );

      expect(result).not.toBeNull();
      expect(must(result).id).toBe("group-1");
      expect(must(result).scene_count).toBe(15);
    });

    it("should return null for non-existent group", async () => {
      mockPrisma.stashGroup.findFirst.mockResolvedValue(null);

      const result = await stashEntityService.getGroup(
        "non-existent",
        "test-instance"
      );

      expect(result).toBeNull();
    });

    it("should get group count", async () => {
      mockPrisma.stashGroup.count.mockResolvedValue(25);

      const count = await stashEntityService.getGroupCount();

      expect(count).toBe(25);
    });
  });

  describe("Stats and Readiness", () => {
    it("should get stats for all entity types", async () => {
      mockPrisma.stashScene.count.mockResolvedValue(1000);
      mockPrisma.stashPerformer.count.mockResolvedValue(500);
      mockPrisma.stashStudio.count.mockResolvedValue(100);
      mockPrisma.stashTag.count.mockResolvedValue(300);
      mockPrisma.stashGallery.count.mockResolvedValue(50);
      mockPrisma.stashGroup.count.mockResolvedValue(25);
      mockPrisma.stashImage.count.mockResolvedValue(2000);
      mockPrisma.stashClip.count.mockResolvedValue(150);

      const stats = await stashEntityService.getStats();

      expect(stats.scenes).toBe(1000);
      expect(stats.performers).toBe(500);
      expect(stats.studios).toBe(100);
      expect(stats.tags).toBe(300);
      expect(stats.galleries).toBe(50);
      expect(stats.groups).toBe(25);
      expect(stats.images).toBe(2000);
      expect(stats.clips).toBe(150);
    });

    /**
     * SyncState's rows, of which the mock answers those the query asks for:
     * its entity type, and its instances when it names them.
     */
    function storeSyncStates(rows: SyncStateRow[]): void {
      mockPrisma.syncState.findMany.mockImplementation(
        prismaImpl((args) => {
          const filter = args?.where?.stashInstanceId;
          const ids = typeof filter === "object" ? filter.in : undefined;
          return rows.filter(
            (row) =>
              row.entityType === args?.where?.entityType &&
              (!ids || ids.includes(row.stashInstanceId))
          );
        })
      );
    }

    function sceneState(
      stashInstanceId: string,
      fields: Partial<SyncStateRow>
    ): SyncStateRow {
      return partialRow<SyncStateRow>({
        stashInstanceId,
        entityType: "scene",
        lastFullSyncTimestamp: null,
        lastIncrementalSyncTimestamp: null,
        lastFullSyncActual: null,
        lastIncrementalSyncActual: null,
        ...fields,
      });
    }

    it("should return true for isReady when sync state exists with lastFullSyncTimestamp", async () => {
      storeSyncStates([
        sceneState("inst-a", {
          lastFullSyncTimestamp: "2024-01-01T00:00:00-08:00",
        }),
      ]);

      const ready = await stashEntityService.isReady();

      expect(ready).toBe(true);
    });

    it("should return true for isReady when sync state exists with lastIncrementalSyncTimestamp", async () => {
      storeSyncStates([
        sceneState("inst-a", {
          lastIncrementalSyncTimestamp: "2024-01-02T00:00:00-08:00",
        }),
      ]);

      const ready = await stashEntityService.isReady();

      expect(ready).toBe(true);
    });

    it("should return false for isReady when no sync state exists", async () => {
      storeSyncStates([]);

      const ready = await stashEntityService.isReady();

      expect(ready).toBe(false);
    });

    it("should return false for isReady when sync state has no timestamps", async () => {
      storeSyncStates([sceneState("inst-a", {})]);

      const ready = await stashEntityService.isReady();

      expect(ready).toBe(false);
    });

    it("isReady reads the scene state of each enabled instance: one synced instance is enough, another instance's row never counts", async () => {
      // inst-a has not synced its scenes; an instance that is not loaded
      // (disabled or deleted) has
      const unsynced = sceneState("inst-a", {});
      const other = sceneState("gone", {
        lastFullSyncTimestamp: "2024-01-01T00:00:00-08:00",
      });
      storeSyncStates([unsynced, other]);

      expect(await stashEntityService.isReady()).toBe(false);
      expect(mockPrisma.syncState.findMany).toHaveBeenCalledWith({
        where: { entityType: "scene", stashInstanceId: { in: INSTANCES } },
      });

      // inst-b has
      storeSyncStates([
        unsynced,
        other,
        sceneState("inst-b", {
          lastIncrementalSyncTimestamp: "2024-01-02T00:00:00-08:00",
        }),
      ]);

      expect(await stashEntityService.isReady()).toBe(true);
    });

    it("should get last refreshed time", async () => {
      const lastSyncDate = new Date("2024-01-15T12:00:00Z");
      storeSyncStates([
        sceneState("inst-a", { lastFullSyncActual: lastSyncDate }),
      ]);

      const lastRefreshed = await stashEntityService.getLastRefreshed();

      expect(lastRefreshed).toEqual(lastSyncDate);
    });

    it("getLastRefreshed is the latest scene sync of any enabled instance, never another instance's", async () => {
      storeSyncStates([
        sceneState("inst-a", {
          lastIncrementalSyncActual: new Date("2024-01-15T10:00:00Z"),
        }),
        sceneState("inst-b", {
          lastFullSyncActual: new Date("2024-01-15T12:00:00Z"),
          lastIncrementalSyncActual: new Date("2024-01-15T11:00:00Z"),
        }),
        sceneState("gone", {
          lastFullSyncActual: new Date("2024-02-01T00:00:00Z"),
        }),
      ]);

      const lastRefreshed = await stashEntityService.getLastRefreshed();

      expect(lastRefreshed).toEqual(new Date("2024-01-15T12:00:00Z"));
    });

    it("should return null for last refreshed when no sync state", async () => {
      storeSyncStates([]);

      const lastRefreshed = await stashEntityService.getLastRefreshed();

      expect(lastRefreshed).toBeNull();
    });

    it("should get cache version as timestamp", async () => {
      const syncDate = new Date("2024-01-15T12:00:00Z");
      storeSyncStates([sceneState("inst-a", { lastFullSyncActual: syncDate })]);

      const version = await stashEntityService.getCacheVersion();

      expect(version).toBe(syncDate.getTime());
    });

    it("should return 0 for cache version when no sync", async () => {
      storeSyncStates([]);

      const version = await stashEntityService.getCacheVersion();

      expect(version).toBe(0);
    });
  });

  describe("Transform instanceId inclusion (#390)", () => {
    it("transformScene includes instanceId from stashInstanceId", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValue({
        ...mockCachedScene,
        stashInstanceId: "instance-alpha",
      });

      const result = await stashEntityService.getScene(
        "scene-1",
        "instance-alpha"
      );

      expect(result).not.toBeNull();
      expect(must(result).instanceId).toBe("instance-alpha");
    });

    it("transformGroup includes instanceId from stashInstanceId", async () => {
      mockPrisma.stashGroup.findFirst.mockResolvedValue({
        ...mockCachedGroup,
        stashInstanceId: "instance-beta",
      });
      // getGroup calls $queryRaw for scene/performer counts
      mockPrisma.$queryRaw.mockResolvedValue([{ count: 0 }]);

      const result = await stashEntityService.getGroup(
        "group-1",
        "instance-beta"
      );

      expect(result).not.toBeNull();
      expect(must(result).instanceId).toBe("instance-beta");
    });

    it("scenes from different instances have distinct instanceIds", async () => {
      mockPrisma.stashScene.findFirst
        .mockResolvedValueOnce({
          ...mockCachedScene,
          id: "scene-1",
          stashInstanceId: "instance-a",
        })
        .mockResolvedValueOnce({
          ...mockCachedScene,
          id: "scene-1",
          stashInstanceId: "instance-b",
        });

      const sceneA = await stashEntityService.getScene("scene-1", "instance-a");
      const sceneB = await stashEntityService.getScene("scene-1", "instance-b");

      expect(must(sceneA).instanceId).toBe("instance-a");
      expect(must(sceneB).instanceId).toBe("instance-b");
      expect(must(sceneA).instanceId).not.toBe(must(sceneB).instanceId);
    });
  });

  describe("Image Queries", () => {
    const mockCachedImage = partialRow<
      Prisma.StashImageGetPayload<{
        include: { performers: true; tags: true; galleries: true };
      }>
    >({
      id: "image-1",
      stashInstanceId: "test-instance",
      title: "Test Image",
      code: null,
      date: null,
      details: null,
      studioId: null,
      rating100: null,
      organized: false,
      oCounter: 0,
      filePath: "/path/to/image.jpg",
      width: 1920,
      height: 1080,
      fileSize: BigInt(500000),
      pathThumbnail: null,
      pathPreview: null,
      pathImage: null,
      stashCreatedAt: new Date("2024-01-01"),
      stashUpdatedAt: new Date("2024-01-02"),
      syncedAt: new Date(),
      deletedAt: null,
      performers: [],
      tags: [],
      galleries: [],
    });

    it("getImage returns transformed image with relations", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(mockCachedImage);

      const result = await stashEntityService.getImage(
        "image-1",
        "test-instance"
      );

      expect(result).not.toBeNull();
      expect(must(result).id).toBe("image-1");
      expect(must(result).instanceId).toBe("test-instance");
    });

    it("getImage returns null for non-existent image", async () => {
      mockPrisma.stashImage.findFirst.mockResolvedValue(null);

      const result = await stashEntityService.getImage(
        "nonexistent",
        "test-instance"
      );

      expect(result).toBeNull();
    });

    it("getImageCount returns count of non-deleted images", async () => {
      mockPrisma.stashImage.count.mockResolvedValue(42);

      const count = await stashEntityService.getImageCount();

      expect(count).toBe(42);
      expect(prisma.stashImage.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });
  });

  describe("Cross-Entity Relationship Lookups", () => {
    it("getPerformerIdsByStudios returns empty set for empty input", async () => {
      const result = await stashEntityService.getPerformerIdsByStudios([]);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("getPerformerIdsByStudios returns performer IDs from studio scenes", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { performerId: "perf-1" },
        { performerId: "perf-2" },
      ]);

      const result = await stashEntityService.getPerformerIdsByStudios([
        "studio-1",
      ]);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(2);
      expect(result.has("perf-1")).toBe(true);
      expect(result.has("perf-2")).toBe(true);
    });

    it("getPerformerIdsByGroups returns empty set for empty input", async () => {
      const result = await stashEntityService.getPerformerIdsByGroups([]);

      expect(result.size).toBe(0);
    });

    it("getGroupIdsByPerformers returns empty set for empty input", async () => {
      const result = await stashEntityService.getGroupIdsByPerformers([]);

      expect(result.size).toBe(0);
    });

    it("getGroupIdsByPerformers returns group IDs from performer scenes", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { groupId: "group-1" },
        { groupId: "group-2" },
      ]);

      const result = await stashEntityService.getGroupIdsByPerformers([
        "perf-1",
      ]);

      expect(result.size).toBe(2);
      expect(result.has("group-1")).toBe(true);
      expect(result.has("group-2")).toBe(true);
    });
  });

  describe("Studio Name Cache", () => {
    beforeEach(() => {
      // Clear the in-memory singleton cache before each test
      stashEntityService.invalidateStudioNameCache();
      vi.clearAllMocks();
      // Re-set default mock after clearAllMocks
      mockPrisma.stashStudio.findMany.mockResolvedValue([]);
    });

    it("getStudioNameMap caches results across calls", async () => {
      mockPrisma.stashStudio.findMany.mockResolvedValue([
        partialRow({ id: "s1", stashInstanceId: "inst-a", name: "Studio A" }),
      ]);

      const map1 = await stashEntityService.getStudioNameMap();
      const map2 = await stashEntityService.getStudioNameMap();

      // Should only query DB once (second call uses cache)
      expect(prisma.stashStudio.findMany).toHaveBeenCalledTimes(1);
      expect(map1).toBe(map2); // Same reference
    });

    it("invalidateStudioNameCache forces fresh query", async () => {
      mockPrisma.stashStudio.findMany.mockResolvedValue([
        partialRow({ id: "s1", stashInstanceId: "inst-a", name: "Studio A" }),
      ]);

      await stashEntityService.getStudioNameMap();
      stashEntityService.invalidateStudioNameCache();
      await stashEntityService.getStudioNameMap();

      // Should query DB twice (once before invalidation, once after)
      expect(prisma.stashStudio.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty result sets gracefully", async () => {
      mockPrisma.stashScene.findMany.mockResolvedValue([]);

      const result = await stashEntityService.getAllScenes();

      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should handle empty ID array in getByIds", async () => {
      mockPrisma.stashScene.findMany.mockResolvedValue([]);

      const result = await stashEntityService.getScenesByIds(
        [],
        "test-instance"
      );

      expect(result).toHaveLength(0);
      expect(prisma.stashScene.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [] },
          deletedAt: null,
          stashInstanceId: "test-instance",
        },
      });
    });
  });

  describe("generateSceneStreams", () => {
    const avi = {
      filePath: "/v/a.avi",
      fileAudioCodec: "aac",
      fileWidth: 720,
      fileHeight: 404,
    };

    it("uses the stored Stash choices when present", () => {
      const streams = stashEntityService.generateSceneStreams("7", "inst-a", {
        streamDirect: true,
        streamMkv: false,
        streamResolutions: "ORIGINAL,LOW",
        ...avi,
      });

      // Inference alone would drop Direct for an .avi; Stash had a transcode.
      expect(streams.map((s) => s.label)).toEqual([
        "Direct stream",
        "MP4",
        "MP4 Low (240p)",
        "WEBM",
        "WEBM Low (240p)",
        "HLS",
        "HLS Low (240p)",
        "DASH",
        "DASH Low (240p)",
      ]);
    });

    it("falls back to inference when the stored columns are NULL", () => {
      const streams = stashEntityService.generateSceneStreams("7", "inst-a", {
        streamDirect: null,
        streamMkv: null,
        streamResolutions: null,
        ...avi,
      });

      expect(streams.map((s) => s.label)).toEqual([
        "MP4",
        "MP4 Low (240p)",
        "WEBM",
        "WEBM Low (240p)",
        "HLS",
        "HLS Low (240p)",
        "DASH",
        "DASH Low (240p)",
      ]);

      const mkv = stashEntityService.generateSceneStreams("8", "inst-a", {
        streamDirect: null,
        streamMkv: null,
        streamResolutions: null,
        filePath: "/v/b.mkv",
        fileAudioCodec: "ac3",
        fileWidth: 1920,
        fileHeight: 1080,
      });
      expect(mkv.map((s) => s.label).slice(0, 3)).toEqual([
        "MKV",
        "MP4",
        "MP4 Full HD (1080p)",
      ]);
    });

    it("returns Peek proxy paths with instanceId and no Stash host", () => {
      const streams = stashEntityService.generateSceneStreams("7", "inst-a", {
        streamDirect: true,
        streamMkv: false,
        streamResolutions: "ORIGINAL,LOW",
        ...avi,
      });

      expect(streams.length).toBeGreaterThan(0);
      for (const s of streams) {
        expect(s.url).toMatch(/^\/api\/scene\/7\/proxy-stream\/stream/);
        expect(
          new URL(s.url, "http://peek.test").searchParams.get("instanceId")
        ).toBe("inst-a");
      }
      const json = JSON.stringify(streams);
      expect(json).not.toContain("http");
      expect(json).not.toContain("localhost:9999");
      expect(json).not.toContain("apikey");
      expect(must(streams[0]).url).toBe(
        "/api/scene/7/proxy-stream/stream?instanceId=inst-a"
      );
      expect(must(streams[2]).url).toBe(
        "/api/scene/7/proxy-stream/stream.mp4?resolution=LOW&instanceId=inst-a"
      );
    });

    it("getPlaybackStreams reads the seven columns for (id, instance) and builds the list", async () => {
      mockPrisma.stashScene.findFirst.mockResolvedValueOnce(
        partialRow({
          streamDirect: false,
          streamMkv: true,
          streamResolutions: "ORIGINAL",
          filePath: "/v/c.mkv",
          fileAudioCodec: "ac3",
          fileWidth: 1920,
          fileHeight: 1080,
        })
      );

      const streams = await stashEntityService.getPlaybackStreams(
        "42",
        "inst-a"
      );

      expect(prisma.stashScene.findFirst).toHaveBeenCalledWith({
        where: { id: "42", stashInstanceId: "inst-a", deletedAt: null },
        select: {
          streamDirect: true,
          streamMkv: true,
          streamResolutions: true,
          filePath: true,
          fileAudioCodec: true,
          fileWidth: true,
          fileHeight: true,
        },
      });
      expect(streams.map((s) => s.label)).toEqual([
        "MKV",
        "MP4",
        "WEBM",
        "HLS",
        "DASH",
      ]);
      expect(must(streams[0]).url).toBe(
        "/api/scene/42/proxy-stream/stream.mkv?instanceId=inst-a"
      );

      mockPrisma.stashScene.findFirst.mockResolvedValueOnce(null);
      await expect(
        stashEntityService.getPlaybackStreams("43", "inst-a")
      ).resolves.toEqual([]);
    });
  });
});
