/**
 * Integration Tests for StashSyncService
 *
 * These tests connect to a real Stash instance to verify the sync functionality.
 * Requires STASH_URL and STASH_API_KEY environment variables.
 *
 * Note: These tests are SKIPPED by default to prevent unintended database modifications.
 * Run with: npm test -- --run services/__tests__/StashSyncService.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from project root
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Check if we have the required environment variables
const hasStashConfig = !!(process.env.STASH_URL && process.env.STASH_API_KEY);

// Mock prisma to avoid database operations during tests
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    stashScene: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    stashPerformer: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    stashStudio: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    stashTag: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    stashGallery: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    stashGroup: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    stashImage: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    syncState: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    syncSettings: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    scenePerformer: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    sceneTag: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    sceneGroup: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    sceneGallery: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    imagePerformer: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    imageTag: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    imageGallery: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    stashInstance: {
      findFirst: vi.fn().mockResolvedValue({
        id: "test-instance",
        name: "Test",
        url: process.env.STASH_URL,
        apiKey: process.env.STASH_API_KEY,
        enabled: true,
      }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: "test-instance",
          name: "Test",
          url: process.env.STASH_URL,
          apiKey: process.env.STASH_API_KEY,
          enabled: true,
        },
      ]),
    },
    $queryRaw: vi.fn(),
  },
}));

// Import after mocking
import { StashApp } from "stashapp-api";

describe.skipIf(!hasStashConfig)("StashSyncService Integration Tests", () => {
  let stash: ReturnType<typeof StashApp.init>;

  beforeAll(() => {
    // Initialize Stash client directly for testing
    stash = StashApp.init({
      url: process.env.STASH_URL!,
      apiKey: process.env.STASH_API_KEY!,
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("Stash Connection", () => {
    it("should connect to Stash and retrieve configuration", async () => {
      const result = await stash.configuration();

      expect(result).toBeDefined();
      expect(result.configuration).toBeDefined();
    });

    it("should retrieve scenes from Stash", async () => {
      const result = await stash.findScenesCompact({
        filter: { page: 1, per_page: 5 },
      });

      expect(result.findScenes).toBeDefined();
      expect(result.findScenes.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.findScenes.scenes)).toBe(true);
    });

    it("should retrieve performers from Stash", async () => {
      const result = await stash.findPerformers({
        filter: { page: 1, per_page: 5 },
      });

      expect(result.findPerformers).toBeDefined();
      expect(result.findPerformers.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.findPerformers.performers)).toBe(true);
    });

    it("should retrieve studios from Stash", async () => {
      const result = await stash.findStudios({
        filter: { page: 1, per_page: 5 },
      });

      expect(result.findStudios).toBeDefined();
      expect(result.findStudios.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.findStudios.studios)).toBe(true);
    });

    it("should retrieve tags from Stash", async () => {
      const result = await stash.findTags({
        filter: { page: 1, per_page: 5 },
      });

      expect(result.findTags).toBeDefined();
      expect(result.findTags.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.findTags.tags)).toBe(true);
    });

    it("should retrieve groups from Stash", async () => {
      const result = await stash.findGroups({
        filter: { page: 1, per_page: 5 },
      });

      expect(result.findGroups).toBeDefined();
      expect(result.findGroups.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.findGroups.groups)).toBe(true);
    });

    it("should retrieve galleries from Stash", async () => {
      const result = await stash.findGalleries({
        filter: { page: 1, per_page: 5 },
      });

      expect(result.findGalleries).toBeDefined();
      expect(result.findGalleries.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.findGalleries.galleries)).toBe(true);
    });

    it("should retrieve images from Stash", async () => {
      const result = await stash.findImages({
        filter: { page: 1, per_page: 5 },
      });

      expect(result.findImages).toBeDefined();
      expect(result.findImages.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.findImages.images)).toBe(true);
    });
  });

  describe("Data Structure Validation", () => {
    it("should return scene data with expected structure", async () => {
      const result = await stash.findScenesCompact({
        filter: { page: 1, per_page: 1 },
      });

      if (result.findScenes.scenes.length > 0) {
        const scene = result.findScenes.scenes[0];
        expect(scene).toHaveProperty("id");
        expect(scene).toHaveProperty("title");
        expect(scene).toHaveProperty("created_at");
        expect(scene).toHaveProperty("updated_at");
      }
    });

    it("should return performer data with expected structure", async () => {
      const result = await stash.findPerformers({
        filter: { page: 1, per_page: 1 },
      });

      if (result.findPerformers.performers.length > 0) {
        const performer = result.findPerformers.performers[0];
        expect(performer).toHaveProperty("id");
        expect(performer).toHaveProperty("name");
      }
    });

    it("should return studio data with expected structure", async () => {
      const result = await stash.findStudios({
        filter: { page: 1, per_page: 1 },
      });

      if (result.findStudios.studios.length > 0) {
        const studio = result.findStudios.studios[0];
        expect(studio).toHaveProperty("id");
        expect(studio).toHaveProperty("name");
      }
    });

    it("should return tag data with expected structure", async () => {
      const result = await stash.findTags({
        filter: { page: 1, per_page: 1 },
      });

      if (result.findTags.tags.length > 0) {
        const tag = result.findTags.tags[0];
        expect(tag).toHaveProperty("id");
        expect(tag).toHaveProperty("name");
      }
    });
  });

  describe("Incremental Sync Filtering", () => {
    it("should support filtering scenes by updated_at", async () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const result = await stash.findScenesCompact({
        filter: { page: 1, per_page: 10 },
        scene_filter: {
          updated_at: {
            modifier: "GREATER_THAN",
            value: oneYearAgo.toISOString(),
          },
        } as any,
      });

      // The query should succeed - we just verify it doesn't throw
      expect(result.findScenes).toBeDefined();
      expect(result.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("should support filtering performers by updated_at", async () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const result = await stash.findPerformers({
        filter: { page: 1, per_page: 10 },
        performer_filter: {
          updated_at: {
            modifier: "GREATER_THAN",
            value: oneYearAgo.toISOString(),
          },
        } as any,
      });

      expect(result.findPerformers).toBeDefined();
      expect(result.findPerformers.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Single Entity Lookup", () => {
    it("should be able to find a single scene by ID", async () => {
      // First get any scene ID
      const allScenes = await stash.findScenesCompact({
        filter: { page: 1, per_page: 1 },
      });

      if (allScenes.findScenes.scenes.length > 0) {
        const sceneId = allScenes.findScenes.scenes[0].id;

        const result = await stash.findScenes({
          ids: [sceneId],
        });

        expect(result.findScenes.scenes.length).toBe(1);
        expect(result.findScenes.scenes[0].id).toBe(sceneId);
      }
    });

    it("should be able to find a single performer by ID", async () => {
      // First get any performer ID
      const allPerformers = await stash.findPerformers({
        filter: { page: 1, per_page: 1 },
      });

      if (allPerformers.findPerformers.performers.length > 0) {
        const performerId = allPerformers.findPerformers.performers[0].id;

        const result = await stash.findPerformers({
          ids: [performerId],
        });

        expect(result.findPerformers.performers.length).toBe(1);
        expect(result.findPerformers.performers[0].id).toBe(performerId);
      }
    });

    it("should be able to find a single tag by ID", async () => {
      // First get any tag ID
      const allTags = await stash.findTags({
        filter: { page: 1, per_page: 1 },
      });

      if (allTags.findTags.tags.length > 0) {
        const tagId = allTags.findTags.tags[0].id;

        const result = await stash.findTags({
          ids: [tagId],
        });

        expect(result.findTags.tags.length).toBe(1);
        expect(result.findTags.tags[0].id).toBe(tagId);
      }
    });
  });

  describe("Pagination", () => {
    it("should correctly paginate scenes", async () => {
      // Get first page
      const page1 = await stash.findScenesCompact({
        filter: { page: 1, per_page: 5 },
      });

      // Get second page
      const page2 = await stash.findScenesCompact({
        filter: { page: 2, per_page: 5 },
      });

      // Total count should be consistent
      expect(page1.findScenes.count).toBe(page2.findScenes.count);

      // If there are enough scenes, pages should have different content
      if (page1.findScenes.count > 5 && page2.findScenes.scenes.length > 0) {
        const page1Ids = page1.findScenes.scenes.map((s) => s.id);
        const page2Ids = page2.findScenes.scenes.map((s) => s.id);

        // No overlap between pages
        const overlap = page1Ids.filter((id) => page2Ids.includes(id));
        expect(overlap.length).toBe(0);
      }
    });

    it("should handle pagination past available data gracefully", async () => {
      const result = await stash.findScenesCompact({
        filter: { page: 99999, per_page: 5 },
      });

      // Should return empty array, not error
      expect(result.findScenes.scenes.length).toBe(0);
    });
  });
});

// Skip message for CI/environments without Stash config
describe("StashSyncService Integration Tests - Configuration Check", () => {
  it("should report if Stash configuration is available", () => {
    if (!hasStashConfig) {
      console.log("Stash integration tests SKIPPED - STASH_URL or STASH_API_KEY not configured");
      console.log("To run integration tests, set STASH_URL and STASH_API_KEY in .env");
    } else {
      console.log("Stash integration tests RUNNING with configured Stash instance");
    }
    expect(true).toBe(true);
  });
});
