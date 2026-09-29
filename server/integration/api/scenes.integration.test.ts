import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { expectRefused } from "../helpers/refused.js";
import {
  adminClient,
  guestClient,
  restoreInstanceSelection,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

// Response type for /api/library/scenes
interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      instanceId?: string;
      title?: string;
      organized?: boolean;
      created_at?: string | null;
      performers?: Array<{ id: string; name?: string }>;
      tags?: Array<{ id: string; name?: string }>;
      inheritedTagIds?: string[];
      studio?: { id: string; name?: string } | null;
    }>;
    count: number;
  };
}

describe("Scene API", () => {
  let testInstanceId: string;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // Select only test instance to avoid ID collisions with other instances
    testInstanceId = await selectTestInstanceOnly();
  });

  afterAll(restoreInstanceSelection);

  describe("POST /api/library/scenes", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/scenes", {});

      expect(response.status).toBe(401);
    });

    it("returns scenes with pagination", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            page: 1,
            per_page: 10,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes).toBeDefined();
      expect(Array.isArray(response.data.findScenes.scenes)).toBe(true);
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(10);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
    });

    it("returns scene by ID with relations", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          ids: [TEST_ENTITIES.sceneWithRelations],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.scenes).toHaveLength(1);

      const scene = must(response.data.findScenes.scenes[0]);
      expect(scene.id).toBe(TEST_ENTITIES.sceneWithRelations);
      expect(scene.title).toBeDefined();
      // Note: performers/tags may or may not be included depending on API design
    });

    it("ids with `id:instanceId` values returns those scenes", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          ids: [
            `${TEST_ENTITIES.sceneWithRelations}:${testInstanceId}`,
            `${TEST_ENTITIES.sceneInGroup}:${testInstanceId}`,
          ],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBe(2);
      expect(response.data.findScenes.scenes.map((s) => s.id).sort()).toEqual(
        [TEST_ENTITIES.sceneWithRelations, TEST_ENTITIES.sceneInGroup].sort()
      );
    });

    it("an id on another instance matches nothing", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        { ids: [`${TEST_ENTITIES.sceneWithRelations}:no-such-instance`] }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBe(0);
      expect(response.data.findScenes.scenes).toEqual([]);
    });

    it("a random sort with a seed that contains SQL characters is rejected by validation, not interpolated", async () => {
      const response = await adminClient.post("/api/library/scenes", {
        filter: { sort: "random_12345;DROP TABLE StashScene", per_page: 1 },
      });

      expectRefused(response, ["filter.sort"]);
    });

    it("filters scenes by performer", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 50,
          },
          scene_filter: {
            performers: {
              value: [TEST_ENTITIES.performerWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
      // Verify we got scenes (filter worked)
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("filters scenes by studio", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 50,
          },
          scene_filter: {
            studios: {
              value: [TEST_ENTITIES.studioWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
      // Verify we got scenes (filter worked)
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("filters scenes by tag", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 50,
          },
          scene_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
      // Verify we got scenes (filter worked)
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("filters scenes by gallery with INCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 50,
          },
          scene_filter: {
            galleries: {
              value: [TEST_ENTITIES.galleryWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // Verify the filter worked - should return scenes linked to this gallery
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("filters scenes by gallery with EXCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 50,
          },
          scene_filter: {
            galleries: {
              value: [TEST_ENTITIES.galleryWithScenes],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // Should return scenes NOT linked to this gallery
    });

    it("filters scenes by group/collection with INCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 50,
          },
          scene_filter: {
            groups: {
              value: [TEST_ENTITIES.groupWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // Verify the filter worked - should return scenes linked to this group
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("filters scenes by group/collection with EXCLUDES", async () => {
      // First get total count without filter
      const totalResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 1 },
        }
      );
      const totalCount = totalResponse.data.findScenes.count;

      // Now filter with EXCLUDES
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 50,
          },
          scene_filter: {
            groups: {
              value: [TEST_ENTITIES.groupWithScenes],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // Should return fewer scenes than total (excluding group scenes)
      expect(response.data.findScenes.count).toBeLessThan(totalCount);
    });

    it("respects per_page limit", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 5,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(5);
    });

    it("paginates correctly", async () => {
      const page1 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            page: 1,
            per_page: 5,
          },
        }
      );

      const page2 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            page: 2,
            per_page: 5,
          },
        }
      );

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      const page1Scenes = page1.data.findScenes.scenes;
      const page2Scenes = page2.data.findScenes.scenes;

      // The library fills page 1 and reaches page 2
      expect(page1Scenes).toHaveLength(5);
      expect(page2Scenes).not.toHaveLength(0);
      const page1Ids = page1Scenes.map((s) => s.id);
      const page2Ids = page2Scenes.map((s) => s.id);

      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }
    });

    it("carries each scene's organized flag and created date as the cache holds them", async () => {
      // The replay library marks about half its scenes organized
      const cached = await prisma.stashScene.findMany({
        where: { stashInstanceId: testInstanceId, deletedAt: null },
        select: { id: true, organized: true, stashCreatedAt: true },
        orderBy: { id: "asc" },
        take: 50,
      });

      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        { filter: { per_page: 50 }, ids: cached.map((s) => s.id) }
      );

      expect(response.ok).toBe(true);
      const scenes = response.data.findScenes.scenes;
      expect(scenes.length).toBeGreaterThan(0);
      // Compared for the scenes the admin sees (another file may leave one hidden)
      const expected = new Map(
        cached.map((s) => [
          s.id,
          {
            organized: s.organized,
            created_at: s.stashCreatedAt?.toISOString() ?? null,
          },
        ])
      );
      expect(
        scenes.map((s) => ({
          id: s.id,
          organized: s.organized,
          created_at: s.created_at,
        }))
      ).toEqual(scenes.map((s) => ({ id: s.id, ...expected.get(s.id) })));
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
    it.skipIf(!TEST_ENTITIES.sceneWithInheritedTags)(
      "filters scenes by tag inherited from performer/studio",
      async () => {
        const sceneId = TEST_ENTITIES.sceneWithInheritedTags;
        // The configured tag, or the first one the scene inherits
        const inheritedTagId =
          TEST_ENTITIES.inheritedTagFromPerformerOrStudio ||
          (await firstInheritedTagId(sceneId));

        // Filter scenes by the inherited tag AND the specific scene ID
        // This tests that the scene is correctly filterable by its inherited tag
        // We use scene_filter.ids instead of per_page pagination to avoid issues
        // where the test scene might not appear in the first N results
        const response = await adminClient.post<FindScenesResponse>(
          "/api/library/scenes",
          {
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
          }
        );

        expect(response.ok).toBe(true);
        expect(response.data.findScenes).toBeDefined();

        // The key assertion: should find the scene when filtering by inherited tag
        // This test FAILS if scene tag inheritance didn't run during sync
        // or if the tag filter doesn't check inheritedTagIds
        expect(response.data.findScenes.count).toBe(1);
        expect(must(response.data.findScenes.scenes[0]).id).toBe(sceneId);
      }
    );

    it("verifies scene has both direct tags and inherited tags", async () => {
      const sceneId = TEST_ENTITIES.sceneWithInheritedTags;

      if (!sceneId) {
        console.log(
          "Skipping direct+inherited tags test - sceneWithInheritedTags not configured"
        );
        return;
      }

      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          ids: [sceneId],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.scenes).toHaveLength(1);

      const scene = must(response.data.findScenes.scenes[0]);

      // Scene should have direct tags
      const tags = must(scene.tags, "scene.tags");
      expect(tags.length).toBeGreaterThan(0);

      // Scene should also have inherited tags (from performers/studio)
      const inheritedTagIds = must(
        scene.inheritedTagIds,
        "scene.inheritedTagIds"
      );
      expect(inheritedTagIds.length).toBeGreaterThan(0);

      // Verify the scene is filterable by BOTH a direct tag AND an inherited tag
      const directTagId = must(tags[0]).id;
      const inheritedTagId = inheritedTagIds[0];

      // Filter by direct tag AND scene ID - should find the scene
      const directResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 10 },
          scene_filter: {
            ids: { value: [sceneId], modifier: "INCLUDES" },
            tags: { value: [directTagId], modifier: "INCLUDES" },
          },
        }
      );
      expect(directResponse.ok).toBe(true);
      expect(directResponse.data.findScenes.count).toBe(1);
      expect(must(directResponse.data.findScenes.scenes[0]).id).toBe(sceneId);

      // Filter by inherited tag AND scene ID - should also find the scene
      const inheritedResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 10 },
          scene_filter: {
            ids: { value: [sceneId], modifier: "INCLUDES" },
            tags: { value: [inheritedTagId], modifier: "INCLUDES" },
          },
        }
      );
      expect(inheritedResponse.ok).toBe(true);
      expect(inheritedResponse.data.findScenes.count).toBe(1);
      expect(must(inheritedResponse.data.findScenes.scenes[0]).id).toBe(
        sceneId
      );
    });

    it("verifies inherited tags from same instance are filterable", async () => {
      const sceneId = TEST_ENTITIES.sceneWithInheritedTags;

      if (!sceneId) {
        console.log(
          "Skipping inherited-tags test - sceneWithInheritedTags not configured"
        );
        return;
      }

      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          ids: [sceneId],
        }
      );

      expect(response.ok).toBe(true);
      const scene = must(response.data.findScenes.scenes[0]);

      if (!scene.inheritedTagIds || scene.inheritedTagIds.length === 0) {
        console.log(
          "Skipping inherited-tags test - scene has no inherited tags"
        );
        return;
      }

      // Test filtering by EACH inherited tag
      // Note: Only tags that exist in the scene's instance will be filterable
      // Cross-instance inherited tags (data inconsistency) won't match, which is correct behavior
      let filterableTagCount = 0;
      for (const inheritedTagId of scene.inheritedTagIds) {
        const filterResponse = await adminClient.post<FindScenesResponse>(
          "/api/library/scenes",
          {
            filter: { per_page: 10 },
            scene_filter: {
              ids: { value: [sceneId], modifier: "INCLUDES" },
              tags: { value: [inheritedTagId], modifier: "INCLUDES" },
            },
          }
        );

        expect(filterResponse.ok).toBe(true);
        if (
          filterResponse.data.findScenes.count === 1 &&
          must(filterResponse.data.findScenes.scenes[0]).id === sceneId
        ) {
          filterableTagCount++;
        }
      }

      // At least one inherited tag should be filterable (from the scene's instance)
      expect(filterableTagCount).toBeGreaterThan(0);
    });

    it("verifies scene retains its own direct tags", async () => {
      // Use sceneWithRelations which should have its own tags
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          ids: [TEST_ENTITIES.sceneWithRelations],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.scenes).toHaveLength(1);

      const scene = must(response.data.findScenes.scenes[0]);

      // Scene should have tags (either direct or inherited)
      expect(scene.tags).toBeDefined();

      // sceneWithRelations has tags; it is findable by the first one
      const tagId = must(scene.tags?.[0], "scene.tags[0]").id;

      const filterResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            tags: { value: [tagId], modifier: "INCLUDES" },
          },
        }
      );

      expect(filterResponse.ok).toBe(true);
      expect(filterResponse.data.findScenes.count).toBeGreaterThan(0);

      const foundSceneIds = filterResponse.data.findScenes.scenes.map(
        (s) => s.id
      );
      expect(foundSceneIds).toContain(TEST_ENTITIES.sceneWithRelations);
    });
  });
});

/** The first tag a scene inherits from its performers, studio or groups. */
async function firstInheritedTagId(sceneId: string): Promise<string> {
  const response = await adminClient.post<FindScenesResponse>(
    "/api/library/scenes",
    { ids: [sceneId] }
  );
  const scene = must(response.data.findScenes.scenes[0], "the scene");
  return must(scene.inheritedTagIds?.[0], "an inherited tag on the scene");
}
