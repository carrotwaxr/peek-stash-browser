/**
 * Unit Tests for Scene Filtering Logic
 *
 * Tests the scene filtering implementation in controllers/library/scenes.ts
 * Uses mock data to validate filter behavior without database dependency
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock StashInstanceManager to provide a default config for stream URL generation
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefaultConfig: vi.fn().mockReturnValue({
      id: "test-instance",
      name: "Test Stash",
      url: "http://localhost:9999/graphql",
      apiKey: "test-api-key",
    }),
    getAllConfigs: vi.fn().mockReturnValue([]),
    loadFromDatabase: vi.fn().mockResolvedValue(undefined),
  },
}));

import type { NormalizedScene, PeekSceneFilter } from "../../types/index.js";
import { applyQuickSceneFilters } from "../../controllers/library/scenes.js";
import {
  createMockScene,
  createMockScenes,
  createMockPerformers,
  createMockStudios,
  createMockTags,
  createMockGroups,
} from "../helpers/mockDataGenerators.js";

describe("Scene Filters - Quick Filters", () => {
  let mockPerformers: ReturnType<typeof createMockPerformers>;
  let mockStudios: ReturnType<typeof createMockStudios>;
  let mockTags: ReturnType<typeof createMockTags>;
  let mockGroups: ReturnType<typeof createMockGroups>;
  let mockScenes: NormalizedScene[];

  beforeEach(() => {
    // Create mock data for testing
    mockPerformers = createMockPerformers(10);
    mockStudios = createMockStudios(5);
    mockTags = createMockTags(15);
    mockGroups = createMockGroups(8);
    mockScenes = createMockScenes(
      50,
      mockPerformers,
      mockStudios,
      mockTags,
      mockGroups
    );
  });

  describe("ID Filter", () => {
    it("should filter scenes by specific IDs", async () => {
      const targetIds = ["scene_0", "scene_5", "scene_10"];
      const filter: PeekSceneFilter = {
        ids: targetIds,
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      expect(result).toHaveLength(3);
      expect(result.every((s) => targetIds.includes(s.id))).toBe(true);
    });

    it("should return empty array when no scenes match IDs", async () => {
      const filter: PeekSceneFilter = {
        ids: ["nonexistent_1", "nonexistent_2"],
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      expect(result).toHaveLength(0);
    });
  });

  describe("Performer Filter", () => {
    it("should filter scenes with INCLUDES modifier (any performer)", async () => {
      const performerIds = [mockPerformers[0].id, mockPerformers[1].id];
      const filter: PeekSceneFilter = {
        performers: { value: performerIds, modifier: "INCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      // Each scene should have at least one of the specified performers
      result.forEach((scene) => {
        const scenePerformerIds = scene.performers?.map((p) => p.id) || [];
        const hasPerformer = performerIds.some((id) =>
          scenePerformerIds.includes(id)
        );
        expect(hasPerformer).toBe(true);
      });
    });

    it("should filter scenes with INCLUDES_ALL modifier (all performers)", async () => {
      const performerIds = [mockPerformers[0].id];
      const filter: PeekSceneFilter = {
        performers: { value: performerIds, modifier: "INCLUDES_ALL" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      // Each scene should have ALL specified performers
      result.forEach((scene) => {
        const scenePerformerIds = scene.performers?.map((p) => p.id) || [];
        const hasAllPerformers = performerIds.every((id) =>
          scenePerformerIds.includes(id)
        );
        expect(hasAllPerformers).toBe(true);
      });
    });

    it("should filter scenes with EXCLUDES modifier", async () => {
      const performerIds = [mockPerformers[0].id];
      const filter: PeekSceneFilter = {
        performers: { value: performerIds, modifier: "EXCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      // No scene should have the excluded performer
      result.forEach((scene) => {
        const scenePerformerIds = scene.performers?.map((p) => p.id) || [];
        const hasExcludedPerformer = performerIds.some((id) =>
          scenePerformerIds.includes(id)
        );
        expect(hasExcludedPerformer).toBe(false);
      });
    });
  });

  describe("Tag Filter (Squashed - Scene + Performers + Studio)", () => {
    it("should filter by scene tags with INCLUDES modifier", async () => {
      const tagIds = [mockTags[0].id];
      const filter: PeekSceneFilter = {
        tags: { value: tagIds, modifier: "INCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      // Each scene should have the tag (directly or via performers/studio)
      result.forEach((scene) => {
        const allTagIds = new Set<string>();
        scene.tags?.forEach((t) => allTagIds.add(t.id));
        scene.performers?.forEach((p) => {
          p.tags?.forEach((t) => allTagIds.add(t.id));
        });
        scene.studio?.tags?.forEach((t) => allTagIds.add(t.id));

        const hasTag = tagIds.some((id) => allTagIds.has(id));
        expect(hasTag).toBe(true);
      });
    });

    it("should filter by tags with INCLUDES_ALL modifier", async () => {
      const tagIds = [mockTags[0].id, mockTags[1].id];
      const filter: PeekSceneFilter = {
        tags: { value: tagIds, modifier: "INCLUDES_ALL" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      // Each scene should have ALL specified tags (squashed)
      result.forEach((scene) => {
        const allTagIds = new Set<string>();
        scene.tags?.forEach((t) => allTagIds.add(t.id));
        scene.performers?.forEach((p) => {
          p.tags?.forEach((t) => allTagIds.add(t.id));
        });
        scene.studio?.tags?.forEach((t) => allTagIds.add(t.id));

        const hasAllTags = tagIds.every((id) => allTagIds.has(id));
        expect(hasAllTags).toBe(true);
      });
    });

    it("should filter by tags with EXCLUDES modifier", async () => {
      const tagIds = [mockTags[0].id];
      const filter: PeekSceneFilter = {
        tags: { value: tagIds, modifier: "EXCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      // No scene should have the excluded tag (anywhere)
      result.forEach((scene) => {
        const allTagIds = new Set<string>();
        scene.tags?.forEach((t) => allTagIds.add(t.id));
        scene.performers?.forEach((p) => {
          p.tags?.forEach((t) => allTagIds.add(t.id));
        });
        scene.studio?.tags?.forEach((t) => allTagIds.add(t.id));

        const hasExcludedTag = tagIds.some((id) => allTagIds.has(id));
        expect(hasExcludedTag).toBe(false);
      });
    });
  });

  describe("Studio Filter", () => {
    it("should filter scenes by studio with INCLUDES modifier", async () => {
      const studioIds = [mockStudios[0].id];
      const filter: PeekSceneFilter = {
        studios: { value: studioIds, modifier: "INCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.studio).toBeTruthy();
        expect(studioIds.includes(scene.studio!.id)).toBe(true);
      });
    });

    it("should filter scenes by studio with EXCLUDES modifier", async () => {
      const studioIds = [mockStudios[0].id];
      const filter: PeekSceneFilter = {
        studios: { value: studioIds, modifier: "EXCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        if (scene.studio) {
          expect(studioIds.includes(scene.studio.id)).toBe(false);
        }
      });
    });

    it("should include scenes without studio when EXCLUDES modifier is used", async () => {
      const studioIds = [mockStudios[0].id];
      const filter: PeekSceneFilter = {
        studios: { value: studioIds, modifier: "EXCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      // Should include scenes with no studio or different studio
      const scenesWithoutStudio = result.filter((s) => !s.studio);
      const scenesWithDifferentStudio = result.filter(
        (s) => s.studio && !studioIds.includes(s.studio.id)
      );

      expect(result.length).toBe(
        scenesWithoutStudio.length + scenesWithDifferentStudio.length
      );
    });
  });

  describe("Group Filter", () => {
    it("should filter scenes by group with INCLUDES modifier", async () => {
      const groupIds = [mockGroups[0].id];
      const filter: PeekSceneFilter = {
        groups: { value: groupIds, modifier: "INCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const sceneGroupIds = scene.groups?.map((g: any) => g.id) || [];
        const hasGroup = groupIds.some((id) => sceneGroupIds.includes(id));
        expect(hasGroup).toBe(true);
      });
    });

    it("should filter scenes by group with INCLUDES_ALL modifier", async () => {
      const groupIds = [mockGroups[0].id];
      const filter: PeekSceneFilter = {
        groups: { value: groupIds, modifier: "INCLUDES_ALL" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const sceneGroupIds = scene.groups?.map((g: any) => g.id) || [];
        const hasAllGroups = groupIds.every((id) => sceneGroupIds.includes(id));
        expect(hasAllGroups).toBe(true);
      });
    });

    it("should filter scenes by group with EXCLUDES modifier", async () => {
      const groupIds = [mockGroups[0].id];
      const filter: PeekSceneFilter = {
        groups: { value: groupIds, modifier: "EXCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const sceneGroupIds = scene.groups?.map((g: any) => g.id) || [];
        const hasExcludedGroup = groupIds.some((id) =>
          sceneGroupIds.includes(id)
        );
        expect(hasExcludedGroup).toBe(false);
      });
    });
  });

  describe("Numeric Range Filters", () => {
    it("should filter by bitrate with GREATER_THAN modifier", async () => {
      const threshold = 5000000; // 5 Mbps
      const filter: PeekSceneFilter = {
        bitrate: { value: threshold, modifier: "GREATER_THAN" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const bitrate = scene.files?.[0]?.bit_rate || 0;
        expect(bitrate).toBeGreaterThan(threshold);
      });
    });

    it("should filter by duration with BETWEEN modifier", async () => {
      const min = 600; // 10 minutes
      const max = 3600; // 60 minutes
      const filter: PeekSceneFilter = {
        duration: { value: min, value2: max, modifier: "BETWEEN" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const duration = scene.files?.[0]?.duration || 0;
        expect(duration).toBeGreaterThanOrEqual(min);
        expect(duration).toBeLessThanOrEqual(max);
      });
    });

    it("should filter by performer_count with EQUALS modifier", async () => {
      const count = 2;
      const filter: PeekSceneFilter = {
        performer_count: { value: count, modifier: "EQUALS" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.performers?.length || 0).toBe(count);
      });
    });

    it("should filter by tag_count with LESS_THAN modifier", async () => {
      const threshold = 3;
      const filter: PeekSceneFilter = {
        tag_count: { value: threshold, modifier: "LESS_THAN" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.tags?.length || 0).toBeLessThan(threshold);
      });
    });

    it("should filter by framerate with EQUALS modifier", async () => {
      const framerate = 60;
      const filter: PeekSceneFilter = {
        framerate: { value: framerate, modifier: "EQUALS" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.files?.[0]?.frame_rate || 0).toBe(framerate);
      });
    });
  });

  describe("Date Filters", () => {
    it("should filter by created_at with GREATER_THAN modifier", async () => {
      const threshold = new Date(Date.now() - 10 * 86400000); // 10 days ago
      const filter: PeekSceneFilter = {
        created_at: {
          value: threshold.toISOString(),
          modifier: "GREATER_THAN",
        },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const sceneDate = new Date(scene.created_at);
        expect(sceneDate.getTime()).toBeGreaterThan(threshold.getTime());
      });
    });

    it("should filter by created_at with BETWEEN modifier", async () => {
      const min = new Date(Date.now() - 20 * 86400000);
      const max = new Date(Date.now() - 5 * 86400000);
      const filter: PeekSceneFilter = {
        created_at: {
          value: min.toISOString(),
          value2: max.toISOString(),
          modifier: "BETWEEN",
        },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const sceneDate = new Date(scene.created_at);
        expect(sceneDate.getTime()).toBeGreaterThanOrEqual(min.getTime());
        expect(sceneDate.getTime()).toBeLessThanOrEqual(max.getTime());
      });
    });

    it("should filter by updated_at with LESS_THAN modifier", async () => {
      const threshold = new Date(Date.now() - 15 * 86400000);
      const filter: PeekSceneFilter = {
        updated_at: {
          value: threshold.toISOString(),
          modifier: "LESS_THAN",
        },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        const sceneDate = new Date(scene.updated_at);
        expect(sceneDate.getTime()).toBeLessThan(threshold.getTime());
      });
    });
  });

  describe("Orientation Filter", () => {
    it("should filter landscape orientation (width > height)", async () => {
      // Create test scenes with different orientations
      const landscapeScene = createMockScene({
        id: "landscape_1",
        files: [
          {
            id: "file_landscape",
            path: "/path/to/landscape.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1920,
            height: 1080,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const portraitScene = createMockScene({
        id: "portrait_1",
        files: [
          {
            id: "file_portrait",
            path: "/path/to/portrait.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 720,
            height: 1280,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const squareScene = createMockScene({
        id: "square_1",
        files: [
          {
            id: "file_square",
            path: "/path/to/square.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1080,
            height: 1080,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const testScenes = [landscapeScene, portraitScene, squareScene];

      const filter: PeekSceneFilter = {
        orientation: { value: ["LANDSCAPE"] },
      };

      const result = await applyQuickSceneFilters(testScenes, filter);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("landscape_1");
      result.forEach((scene) => {
        const width = scene.files?.[0]?.width || 0;
        const height = scene.files?.[0]?.height || 0;
        expect(width).toBeGreaterThan(height);
      });
    });

    it("should filter portrait orientation (width < height)", async () => {
      // Create test scenes with different orientations
      const landscapeScene = createMockScene({
        id: "landscape_1",
        files: [
          {
            id: "file_landscape",
            path: "/path/to/landscape.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1920,
            height: 1080,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const portraitScene = createMockScene({
        id: "portrait_1",
        files: [
          {
            id: "file_portrait",
            path: "/path/to/portrait.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 720,
            height: 1280,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const squareScene = createMockScene({
        id: "square_1",
        files: [
          {
            id: "file_square",
            path: "/path/to/square.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1080,
            height: 1080,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const testScenes = [landscapeScene, portraitScene, squareScene];

      const filter: PeekSceneFilter = {
        orientation: { value: ["PORTRAIT"] },
      };

      const result = await applyQuickSceneFilters(testScenes, filter);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("portrait_1");
      result.forEach((scene) => {
        const width = scene.files?.[0]?.width || 0;
        const height = scene.files?.[0]?.height || 0;
        expect(width).toBeLessThan(height);
      });
    });

    it("should filter square orientation (width === height)", async () => {
      // Create test scenes with different orientations
      const landscapeScene = createMockScene({
        id: "landscape_1",
        files: [
          {
            id: "file_landscape",
            path: "/path/to/landscape.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1920,
            height: 1080,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const portraitScene = createMockScene({
        id: "portrait_1",
        files: [
          {
            id: "file_portrait",
            path: "/path/to/portrait.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 720,
            height: 1280,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const squareScene = createMockScene({
        id: "square_1",
        files: [
          {
            id: "file_square",
            path: "/path/to/square.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1080,
            height: 1080,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const testScenes = [landscapeScene, portraitScene, squareScene];

      const filter: PeekSceneFilter = {
        orientation: { value: ["SQUARE"] },
      };

      const result = await applyQuickSceneFilters(testScenes, filter);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("square_1");
      result.forEach((scene) => {
        const width = scene.files?.[0]?.width || 0;
        const height = scene.files?.[0]?.height || 0;
        expect(width).toBe(height);
      });
    });

    it("should filter multiple orientations with OR logic", async () => {
      // Create test scenes with different orientations
      const landscapeScene = createMockScene({
        id: "landscape_1",
        files: [
          {
            id: "file_landscape",
            path: "/path/to/landscape.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1920,
            height: 1080,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const portraitScene = createMockScene({
        id: "portrait_1",
        files: [
          {
            id: "file_portrait",
            path: "/path/to/portrait.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 720,
            height: 1280,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const squareScene = createMockScene({
        id: "square_1",
        files: [
          {
            id: "file_square",
            path: "/path/to/square.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1080,
            height: 1080,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const testScenes = [landscapeScene, portraitScene, squareScene];

      const filter: PeekSceneFilter = {
        orientation: { value: ["PORTRAIT", "SQUARE"] },
      };

      const result = await applyQuickSceneFilters(testScenes, filter);

      expect(result).toHaveLength(2);
      const resultIds = result.map((s) => s.id);
      expect(resultIds).toContain("portrait_1");
      expect(resultIds).toContain("square_1");
      expect(resultIds).not.toContain("landscape_1");

      // Verify each result matches one of the requested orientations
      result.forEach((scene) => {
        const width = scene.files?.[0]?.width || 0;
        const height = scene.files?.[0]?.height || 0;
        const isPortrait = width < height;
        const isSquare = width === height;
        expect(isPortrait || isSquare).toBe(true);
      });
    });

    it("should return all scenes when orientation array is empty", async () => {
      // Create test scenes with different orientations
      const landscapeScene = createMockScene({
        id: "landscape_1",
        files: [
          {
            id: "file_landscape",
            path: "/path/to/landscape.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1920,
            height: 1080,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const portraitScene = createMockScene({
        id: "portrait_1",
        files: [
          {
            id: "file_portrait",
            path: "/path/to/portrait.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 720,
            height: 1280,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const squareScene = createMockScene({
        id: "square_1",
        files: [
          {
            id: "file_square",
            path: "/path/to/square.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1080,
            height: 1080,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const testScenes = [landscapeScene, portraitScene, squareScene];

      const filter: PeekSceneFilter = {
        orientation: { value: [] },
      };

      const result = await applyQuickSceneFilters(testScenes, filter);

      expect(result).toHaveLength(3);
      expect(result).toEqual(testScenes);
    });
  });

  describe("Text Filters", () => {
    it("should filter by title with INCLUDES modifier", async () => {
      const searchTerm = "scene 1";
      const filter: PeekSceneFilter = {
        title: { value: searchTerm, modifier: "INCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.title.toLowerCase()).toContain(searchTerm.toLowerCase());
      });
    });

    it("should filter by title with EXCLUDES modifier", async () => {
      const searchTerm = "scene 1";
      const filter: PeekSceneFilter = {
        title: { value: searchTerm, modifier: "EXCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.title.toLowerCase()).not.toContain(
          searchTerm.toLowerCase()
        );
      });
    });

    it("should filter by title with EQUALS modifier (case insensitive)", async () => {
      const exactTitle = "Scene 5";
      const filter: PeekSceneFilter = {
        title: { value: exactTitle, modifier: "EQUALS" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect(scene.title.toLowerCase()).toBe(exactTitle.toLowerCase());
      });
    });

    it("should filter by details with INCLUDES modifier", async () => {
      const searchTerm = "scene";
      const filter: PeekSceneFilter = {
        details: { value: searchTerm, modifier: "INCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        expect((scene.details || "").toLowerCase()).toContain(
          searchTerm.toLowerCase()
        );
      });
    });
  });

  describe("Resolution Filter", () => {
    it("should filter scenes with EQUALS modifier (720p)", async () => {
      // Create test scenes with different resolutions
      const scene720p = createMockScene({
        id: "scene_720p",
        files: [
          {
            id: "file_720p",
            path: "/path/to/720p.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1280,
            height: 720,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const scene1080p = createMockScene({
        id: "scene_1080p",
        files: [
          {
            id: "file_1080p",
            path: "/path/to/1080p.mp4",
            size: "2000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1920,
            height: 1080,
            frame_rate: 30,
            bit_rate: 8000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const testScenes = [scene720p, scene1080p];

      const filter: PeekSceneFilter = {
        resolution: { value: "STANDARD_HD", modifier: "EQUALS" },
      };

      const result = await applyQuickSceneFilters(testScenes, filter);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("scene_720p");
      expect(result[0].files?.[0]?.height).toBe(720);
    });

    it("should filter scenes with NOT_EQUALS modifier", async () => {
      const scene720p = createMockScene({
        id: "scene_720p",
        files: [
          {
            id: "file_720p",
            path: "/path/to/720p.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1280,
            height: 720,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const scene1080p = createMockScene({
        id: "scene_1080p",
        files: [
          {
            id: "file_1080p",
            path: "/path/to/1080p.mp4",
            size: "2000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1920,
            height: 1080,
            frame_rate: 30,
            bit_rate: 8000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const testScenes = [scene720p, scene1080p];

      const filter: PeekSceneFilter = {
        resolution: { value: "STANDARD_HD", modifier: "NOT_EQUALS" },
      };

      const result = await applyQuickSceneFilters(testScenes, filter);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("scene_1080p");
      expect(result[0].files?.[0]?.height).toBe(1080);
    });

    it("should filter scenes with GREATER_THAN modifier (> 720p)", async () => {
      const scene480p = createMockScene({
        id: "scene_480p",
        files: [
          {
            id: "file_480p",
            path: "/path/to/480p.mp4",
            size: "500000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 854,
            height: 480,
            frame_rate: 30,
            bit_rate: 2500000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const scene720p = createMockScene({
        id: "scene_720p",
        files: [
          {
            id: "file_720p",
            path: "/path/to/720p.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1280,
            height: 720,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const scene1080p = createMockScene({
        id: "scene_1080p",
        files: [
          {
            id: "file_1080p",
            path: "/path/to/1080p.mp4",
            size: "2000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1920,
            height: 1080,
            frame_rate: 30,
            bit_rate: 8000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const testScenes = [scene480p, scene720p, scene1080p];

      const filter: PeekSceneFilter = {
        resolution: { value: "STANDARD_HD", modifier: "GREATER_THAN" },
      };

      const result = await applyQuickSceneFilters(testScenes, filter);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("scene_1080p");
      result.forEach((scene) => {
        const height = scene.files?.[0]?.height || 0;
        expect(height).toBeGreaterThan(720);
      });
    });

    it("should filter scenes with LESS_THAN modifier (< 720p)", async () => {
      const scene480p = createMockScene({
        id: "scene_480p",
        files: [
          {
            id: "file_480p",
            path: "/path/to/480p.mp4",
            size: "500000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 854,
            height: 480,
            frame_rate: 30,
            bit_rate: 2500000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const scene720p = createMockScene({
        id: "scene_720p",
        files: [
          {
            id: "file_720p",
            path: "/path/to/720p.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1280,
            height: 720,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const scene1080p = createMockScene({
        id: "scene_1080p",
        files: [
          {
            id: "file_1080p",
            path: "/path/to/1080p.mp4",
            size: "2000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1920,
            height: 1080,
            frame_rate: 30,
            bit_rate: 8000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const testScenes = [scene480p, scene720p, scene1080p];

      const filter: PeekSceneFilter = {
        resolution: { value: "STANDARD_HD", modifier: "LESS_THAN" },
      };

      const result = await applyQuickSceneFilters(testScenes, filter);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("scene_480p");
      result.forEach((scene) => {
        const height = scene.files?.[0]?.height || 0;
        expect(height).toBeLessThan(720);
      });
    });

    it("should handle various resolution enums correctly", async () => {
      const scene360p = createMockScene({
        id: "scene_360p",
        files: [
          {
            id: "file_360p",
            path: "/path/to/360p.mp4",
            size: "300000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 640,
            height: 360,
            frame_rate: 30,
            bit_rate: 1500000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const scene480p = createMockScene({
        id: "scene_480p",
        files: [
          {
            id: "file_480p",
            path: "/path/to/480p.mp4",
            size: "500000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 854,
            height: 480,
            frame_rate: 30,
            bit_rate: 2500000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const scene4k = createMockScene({
        id: "scene_4k",
        files: [
          {
            id: "file_4k",
            path: "/path/to/4k.mp4",
            size: "5000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 3840,
            height: 2160,
            frame_rate: 60,
            bit_rate: 20000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const testScenes = [scene360p, scene480p, scene4k];

      // Test R360P
      const filter360p: PeekSceneFilter = {
        resolution: { value: "R360P", modifier: "EQUALS" },
      };
      const result360p = await applyQuickSceneFilters(testScenes, filter360p);
      expect(result360p).toHaveLength(1);
      expect(result360p[0].id).toBe("scene_360p");

      // Test STANDARD (480p)
      const filter480p: PeekSceneFilter = {
        resolution: { value: "STANDARD", modifier: "EQUALS" },
      };
      const result480p = await applyQuickSceneFilters(testScenes, filter480p);
      expect(result480p).toHaveLength(1);
      expect(result480p[0].id).toBe("scene_480p");

      // Test FOUR_K (2160p)
      const filter4k: PeekSceneFilter = {
        resolution: { value: "FOUR_K", modifier: "EQUALS" },
      };
      const result4k = await applyQuickSceneFilters(testScenes, filter4k);
      expect(result4k).toHaveLength(1);
      expect(result4k[0].id).toBe("scene_4k");
    });

    it("should handle scenes with missing height data", async () => {
      const sceneNoHeight = createMockScene({
        id: "scene_no_height",
        files: [
          {
            id: "file_no_height",
            path: "/path/to/noheight.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 0,
            height: 0,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const scene720p = createMockScene({
        id: "scene_720p",
        files: [
          {
            id: "file_720p",
            path: "/path/to/720p.mp4",
            size: "1000000000",
            duration: 3600,
            video_codec: "h264",
            audio_codec: "aac",
            width: 1280,
            height: 720,
            frame_rate: 30,
            bit_rate: 5000000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
      const testScenes = [sceneNoHeight, scene720p];

      const filter: PeekSceneFilter = {
        resolution: { value: "STANDARD_HD", modifier: "EQUALS" },
      };

      const result = await applyQuickSceneFilters(testScenes, filter);

      // Should only match the 720p scene, not the one with missing height
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("scene_720p");
    });
  });

  describe("Multiple Filters Combined", () => {
    it("should apply multiple filters together (AND logic)", async () => {
      const performerIds = [mockPerformers[0].id];
      const studioIds = [mockStudios[0].id];
      const minDuration = 600;

      const filter: PeekSceneFilter = {
        performers: { value: performerIds, modifier: "INCLUDES" },
        studios: { value: studioIds, modifier: "INCLUDES" },
        duration: { value: minDuration, modifier: "GREATER_THAN" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      result.forEach((scene) => {
        // Check performer
        const scenePerformerIds = scene.performers?.map((p) => p.id) || [];
        expect(
          performerIds.some((id) => scenePerformerIds.includes(id))
        ).toBe(true);

        // Check studio
        expect(scene.studio).toBeTruthy();
        expect(studioIds.includes(scene.studio!.id)).toBe(true);

        // Check duration
        const duration = scene.files?.[0]?.duration || 0;
        expect(duration).toBeGreaterThan(minDuration);
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle null/undefined filters gracefully", async () => {
      const result1 = await applyQuickSceneFilters(mockScenes, null);
      const result2 = await applyQuickSceneFilters(mockScenes, undefined);

      expect(result1).toEqual(mockScenes);
      expect(result2).toEqual(mockScenes);
    });

    it("should handle empty filter object", async () => {
      const result = await applyQuickSceneFilters(mockScenes, {});

      expect(result).toEqual(mockScenes);
    });

    it("should handle scenes with missing data (no studio)", async () => {
      const scenesWithoutStudio = mockScenes.filter((s) => !s.studio);

      const filter: PeekSceneFilter = {
        studios: { value: [mockStudios[0].id], modifier: "EXCLUDES" },
      };

      const result = await applyQuickSceneFilters(scenesWithoutStudio, filter);

      // All scenes without studio should pass EXCLUDES filter
      expect(result.length).toBe(scenesWithoutStudio.length);
    });

    it("should handle empty arrays in filter values", async () => {
      const filter: PeekSceneFilter = {
        performers: { value: [], modifier: "INCLUDES" },
      };

      const result = await applyQuickSceneFilters(mockScenes, filter);

      // Empty performer filter should be ignored
      expect(result).toEqual(mockScenes);
    });
  });
});
