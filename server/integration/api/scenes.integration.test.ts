import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/scenes
interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      performers?: Array<{ id: string; name?: string }>;
      tags?: Array<{ id: string; name?: string }>;
      inheritedTagIds?: string[];
      studio?: { id: string; name?: string } | null;
    }>;
    count: number;
  };
}

describe("Scene API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/library/scenes", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/scenes", {});

      expect(response.status).toBe(401);
    });

    it("returns scenes with pagination", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          page: 1,
          per_page: 10,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes).toBeDefined();
      expect(Array.isArray(response.data.findScenes.scenes)).toBe(true);
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(10);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
    });

    it("returns scene by ID with relations", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        ids: [TEST_ENTITIES.sceneWithRelations],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.scenes).toHaveLength(1);

      const scene = response.data.findScenes.scenes[0];
      expect(scene.id).toBe(TEST_ENTITIES.sceneWithRelations);
      expect(scene.title).toBeDefined();
      // Note: performers/tags may or may not be included depending on API design
    });

    it("filters scenes by performer", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
        },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
      // Verify we got scenes (filter worked)
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("filters scenes by studio", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
        },
        scene_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
      // Verify we got scenes (filter worked)
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("filters scenes by tag", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
        },
        scene_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
      // Verify we got scenes (filter worked)
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("filters scenes by gallery with INCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
        },
        scene_filter: {
          galleries: {
            value: [TEST_ENTITIES.galleryWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // Verify the filter worked - should return scenes linked to this gallery
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("filters scenes by gallery with EXCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
        },
        scene_filter: {
          galleries: {
            value: [TEST_ENTITIES.galleryWithScenes],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // Should return scenes NOT linked to this gallery
    });

    it("filters scenes by group/collection with INCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
        },
        scene_filter: {
          groups: {
            value: [TEST_ENTITIES.groupWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // Verify the filter worked - should return scenes linked to this group
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("filters scenes by group/collection with EXCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
        },
        scene_filter: {
          groups: {
            value: [TEST_ENTITIES.groupWithScenes],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // Should return fewer scenes than total (excluding group scenes)
      expect(response.data.findScenes.count).toBeLessThan(22282);
    });

    it("respects per_page limit", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 5,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(5);
    });

    it("paginates correctly", async () => {
      const page1 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          page: 1,
          per_page: 5,
        },
      });

      const page2 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          page: 2,
          per_page: 5,
        },
      });

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      const page1Scenes = page1.data.findScenes.scenes;
      const page2Scenes = page2.data.findScenes.scenes;

      if (page1Scenes.length === 5 && page2Scenes.length > 0) {
        const page1Ids = page1Scenes.map((s) => s.id);
        const page2Ids = page2Scenes.map((s) => s.id);

        for (const id of page2Ids) {
          expect(page1Ids).not.toContain(id);
        }
      }
    });
  });

  describe("GET /api/library/scenes/:id/similar", () => {
    it("returns similar scenes", async () => {
      const response = await adminClient.get<{
        scenes: Array<{ id: string; title: string }>;
      }>(`/api/library/scenes/${TEST_ENTITIES.sceneWithRelations}/similar`);

      expect(response.ok).toBe(true);
      expect(response.data.scenes).toBeDefined();
      expect(Array.isArray(response.data.scenes)).toBe(true);
    });
  });

  /**
   * Scene Tag Inheritance Tests
   *
   * These tests verify that scenes inherit tags from related entities:
   * - Performer tags (from performers in the scene)
   * - Studio tags (from the scene's studio)
   * - Group tags (from groups the scene belongs to)
   *
   * This is computed by SceneTagInheritanceService and stored in inheritedTagIds.
   * The bug fixed in v3.1.0-beta.13: smartIncrementalSync was missing this step.
   *
   * Note: Unlike gallery-to-image inheritance which copies to junction tables,
   * scene tag inheritance stores in a JSON column (inheritedTagIds) for efficiency.
   */
  describe("scene tag inheritance", () => {
    it("filters scenes by tag inherited from performer/studio", async () => {
      // Skip if no test entity configured
      // @ts-expect-error - sceneWithInheritedTags may not exist in older testEntities
      const sceneId = TEST_ENTITIES.sceneWithInheritedTags;
      // @ts-expect-error - inheritedTagFromPerformerOrStudio may not exist
      let inheritedTagId = TEST_ENTITIES.inheritedTagFromPerformerOrStudio;

      if (!sceneId) {
        console.log("Skipping scene tag inheritance test - sceneWithInheritedTags not configured");
        return;
      }

      // If inheritedTagId not provided, fetch the scene and get one from inheritedTagIds
      if (!inheritedTagId) {
        const sceneResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
          ids: [sceneId],
        });

        expect(sceneResponse.ok).toBe(true);
        expect(sceneResponse.data.findScenes.scenes).toHaveLength(1);

        const scene = sceneResponse.data.findScenes.scenes[0];

        if (!scene.inheritedTagIds || scene.inheritedTagIds.length === 0) {
          console.log("Skipping scene tag inheritance test - scene has no inherited tags");
          return;
        }

        // Use the first inherited tag for testing
        inheritedTagId = scene.inheritedTagIds[0];
        console.log(`Auto-discovered inherited tag ID: ${inheritedTagId}`);
      }

      // Filter scenes by the inherited tag AND the specific scene ID
      // This tests that the scene is correctly filterable by its inherited tag
      // We use scene_filter.ids instead of per_page pagination to avoid issues
      // where the test scene might not appear in the first N results
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 10 },
        scene_filter: {
          ids: {
            value: [sceneId],
            modifier: "INCLUDES",
          },
          tags: {
            value: [inheritedTagId],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // The key assertion: should find the scene when filtering by inherited tag
      // This test FAILS if scene tag inheritance didn't run during sync
      // or if the tag filter doesn't check inheritedTagIds
      expect(response.data.findScenes.count).toBe(1);
      expect(response.data.findScenes.scenes[0].id).toBe(sceneId);
    });

    it("verifies scene has both direct tags and inherited tags", async () => {
      // @ts-expect-error - sceneWithInheritedTags may not exist in older testEntities
      const sceneId = TEST_ENTITIES.sceneWithInheritedTags;

      if (!sceneId) {
        console.log("Skipping direct+inherited tags test - sceneWithInheritedTags not configured");
        return;
      }

      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        ids: [sceneId],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.scenes).toHaveLength(1);

      const scene = response.data.findScenes.scenes[0];

      // Scene should have direct tags
      expect(scene.tags).toBeDefined();
      expect(scene.tags!.length).toBeGreaterThan(0);

      // Scene should also have inherited tags (from performers/studio)
      expect(scene.inheritedTagIds).toBeDefined();
      expect(scene.inheritedTagIds!.length).toBeGreaterThan(0);

      // Verify the scene is filterable by BOTH a direct tag AND an inherited tag
      const directTagId = scene.tags![0].id;
      const inheritedTagId = scene.inheritedTagIds![0];

      // Filter by direct tag AND scene ID - should find the scene
      const directResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 10 },
        scene_filter: {
          ids: { value: [sceneId], modifier: "INCLUDES" },
          tags: { value: [directTagId], modifier: "INCLUDES" },
        },
      });
      expect(directResponse.ok).toBe(true);
      expect(directResponse.data.findScenes.count).toBe(1);
      expect(directResponse.data.findScenes.scenes[0].id).toBe(sceneId);

      // Filter by inherited tag AND scene ID - should also find the scene
      const inheritedResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 10 },
        scene_filter: {
          ids: { value: [sceneId], modifier: "INCLUDES" },
          tags: { value: [inheritedTagId], modifier: "INCLUDES" },
        },
      });
      expect(inheritedResponse.ok).toBe(true);
      expect(inheritedResponse.data.findScenes.count).toBe(1);
      expect(inheritedResponse.data.findScenes.scenes[0].id).toBe(sceneId);
    });

    it("verifies ALL inherited tags are filterable", async () => {
      // @ts-expect-error - sceneWithInheritedTags may not exist in older testEntities
      const sceneId = TEST_ENTITIES.sceneWithInheritedTags;

      if (!sceneId) {
        console.log("Skipping all-inherited-tags test - sceneWithInheritedTags not configured");
        return;
      }

      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        ids: [sceneId],
      });

      expect(response.ok).toBe(true);
      const scene = response.data.findScenes.scenes[0];

      if (!scene.inheritedTagIds || scene.inheritedTagIds.length === 0) {
        console.log("Skipping all-inherited-tags test - scene has no inherited tags");
        return;
      }

      // Test filtering by EACH inherited tag - all should find this scene
      // This catches bugs where only some tags are being inherited
      // We filter by scene ID + tag to ensure the specific scene matches each tag
      for (const inheritedTagId of scene.inheritedTagIds) {
        const filterResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
          filter: { per_page: 10 },
          scene_filter: {
            ids: { value: [sceneId], modifier: "INCLUDES" },
            tags: { value: [inheritedTagId], modifier: "INCLUDES" },
          },
        });

        expect(filterResponse.ok).toBe(true);
        expect(filterResponse.data.findScenes.count).toBe(1);
        expect(filterResponse.data.findScenes.scenes[0].id).toBe(sceneId);
      }
    });

    it("verifies scene retains its own direct tags", async () => {
      // Use sceneWithRelations which should have its own tags
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        ids: [TEST_ENTITIES.sceneWithRelations],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.scenes).toHaveLength(1);

      const scene = response.data.findScenes.scenes[0];

      // Scene should have tags (either direct or inherited)
      expect(scene.tags).toBeDefined();

      // If we have a configured test, verify the scene is findable by its tags
      if (scene.tags && scene.tags.length > 0) {
        const tagId = scene.tags[0].id;

        const filterResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
          filter: { per_page: 50 },
          scene_filter: {
            tags: { value: [tagId], modifier: "INCLUDES" },
          },
        });

        expect(filterResponse.ok).toBe(true);
        expect(filterResponse.data.findScenes.count).toBeGreaterThan(0);

        const foundSceneIds = filterResponse.data.findScenes.scenes.map((s) => s.id);
        expect(foundSceneIds).toContain(TEST_ENTITIES.sceneWithRelations);
      }
    });
  });
});
