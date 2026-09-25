/**
 * Multi-Instance Integration Tests
 *
 * Tests for multi-Stash-instance support. The primary instance is the run's
 * Stash. The filtering tests need a second instance, STASH_SECOND_URL and
 * STASH_SECOND_API_KEY, which globalSetup sets only when the run allows one
 * (ALLOW_PROD_STASH=1 in the shell); without it they are skipped.
 *
 * These tests verify:
 * - Admin instance management endpoints
 * - User instance selection and filtering
 * - Instance-aware queries across multiple instances
 * - Composite key behavior with potential ID overlaps
 *
 * IMPORTANT: The second instance is READ-ONLY. No modifications allowed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import type { SyncStatusResponse } from "../../types/api/sync.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { adminClient, guestClient } from "../helpers/testClient.js";

// The second instance globalSetup allows for this run, if any
const SECOND_STASH_URL = process.env.STASH_SECOND_URL;
const SECOND_STASH_API_KEY = process.env.STASH_SECOND_API_KEY;

interface StashInstance {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  priority: number;
}

describe("Multi-Instance Support", () => {
  let testInstanceId: string;
  let productionInstanceId: string | null = null;
  let testInstanceSceneCount = 0;
  let productionInstanceSceneCount = 0;

  beforeAll(async () => {
    // Ensure admin is logged in
    try {
      await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    } catch {
      // Already logged in or session is valid
    }

    // Get current instances
    const instancesResponse = await adminClient.get<{
      instances: StashInstance[];
    }>("/api/setup/stash-instances");
    expect(instancesResponse.ok).toBe(true);
    expect(instancesResponse.data.instances.length).toBeGreaterThan(0);

    // Find test instance (should be first/primary)
    testInstanceId = must(instancesResponse.data.instances[0]).id;

    // Check if the second instance already exists
    const existingSecond = SECOND_STASH_URL
      ? instancesResponse.data.instances.find((i) => i.url === SECOND_STASH_URL)
      : undefined;

    if (existingSecond) {
      productionInstanceId = existingSecond.id;
      console.log("[Multi-Instance Tests] Second instance already configured");
    } else if (SECOND_STASH_URL && SECOND_STASH_API_KEY) {
      // Add the second Stash (READ ONLY - we just sync from it)
      console.log("[Multi-Instance Tests] Adding the second Stash instance...");

      const addResponse = await adminClient.post<{
        success: boolean;
        instance: StashInstance;
      }>("/api/setup/stash-instance", {
        name: "Second Stash (Read-Only)",
        description: "Second Stash - for multi-instance testing only",
        url: SECOND_STASH_URL,
        apiKey: SECOND_STASH_API_KEY,
        enabled: true,
        priority: 2, // Lower priority than test instance
      });

      if (addResponse.ok) {
        productionInstanceId = addResponse.data.instance.id;
        console.log(
          "[Multi-Instance Tests] Second instance added, waiting for sync..."
        );

        // Earlier files may have limited the admin to the test instance;
        // count every instance while waiting
        await adminClient.put("/api/user/stash-instances", { instanceIds: [] });

        // Wait for its first sync to finish (poll for up to 2 minutes): the
        // instance shows once its exclusions are computed (firstSyncedAt)
        const maxWait = 120000;
        const startTime = Date.now();
        let syncComplete = false;
        const secondId = productionInstanceId;

        while (Date.now() - startTime < maxWait && !syncComplete) {
          await new Promise((r) => setTimeout(r, 1000));

          const status =
            await adminClient.get<SyncStatusResponse>("/api/sync/status");
          syncComplete =
            status.ok &&
            status.data.instances.some(
              (i) => i.instanceId === secondId && i.firstSyncedAt !== null
            );
        }

        if (!syncComplete) {
          console.log(
            "[Multi-Instance Tests] Warning: Sync may not be complete"
          );
        }
      } else {
        console.log(
          "[Multi-Instance Tests] Could not add the second instance:",
          addResponse.data
        );
      }
    }

    // Get scene counts for each instance if we have multiple
    if (productionInstanceId) {
      // Select only test instance and count
      await adminClient.put("/api/user/stash-instances", {
        instanceIds: [testInstanceId],
      });
      const testScenesResponse = await adminClient.post<{
        findScenes: { count: number };
      }>("/api/library/scenes", { filter: { per_page: 1 } });
      testInstanceSceneCount = testScenesResponse.data?.findScenes?.count || 0;

      // Select only production instance and count
      await adminClient.put("/api/user/stash-instances", {
        instanceIds: [productionInstanceId],
      });
      const prodScenesResponse = await adminClient.post<{
        findScenes: { count: number };
      }>("/api/library/scenes", { filter: { per_page: 1 } });
      productionInstanceSceneCount =
        prodScenesResponse.data?.findScenes?.count || 0;

      // Reset to all instances
      await adminClient.put("/api/user/stash-instances", {
        instanceIds: [],
      });

      console.log(
        `[Multi-Instance Tests] Test instance: ${testInstanceSceneCount} scenes`
      );
      console.log(
        `[Multi-Instance Tests] Production instance: ${productionInstanceSceneCount} scenes`
      );
    }
    // Room for the two-minute sync wait above
  }, 180_000);

  afterAll(async () => {
    // Restore user instance selection to test-only (so subsequent tests aren't affected)
    // Other tests expect to query only the test instance for consistent results
    await adminClient.put("/api/user/stash-instances", {
      instanceIds: [testInstanceId],
    });
    // Note: We don't remove the production instance - it's useful to keep for future test runs
  });

  describe("Admin Instance Management", () => {
    it("admin can list all Stash instances", async () => {
      const response = await adminClient.get<{
        instances: StashInstance[];
      }>("/api/setup/stash-instances");

      expect(response.ok).toBe(true);
      expect(response.data.instances).toBeDefined();
      expect(Array.isArray(response.data.instances)).toBe(true);
      expect(response.data.instances.length).toBeGreaterThan(0);

      const instance = must(response.data.instances[0]);
      expect(instance.id).toBeDefined();
      expect(instance.name).toBeDefined();
      expect(instance.url).toBeDefined();
      expect(typeof instance.enabled).toBe("boolean");
      expect(typeof instance.priority).toBe("number");
    });

    it("non-admin cannot list all Stash instances", async () => {
      const response = await guestClient.get("/api/setup/stash-instances");
      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it("admin can get current instance info", async () => {
      const response = await adminClient.get<{
        instance: StashInstance | null;
        instanceCount: number;
      }>("/api/setup/stash-instance");

      expect(response.ok).toBe(true);
      expect(response.data.instance).not.toBeNull();
      expect(response.data.instanceCount).toBeGreaterThan(0);
    });

    it("instance list contains expected fields", async () => {
      const response = await adminClient.get<{
        instances: Array<
          StashInstance & { createdAt: string; updatedAt: string }
        >;
      }>("/api/setup/stash-instances");

      expect(response.ok).toBe(true);
      const instance = response.data.instances[0];

      expect(instance).toHaveProperty("id");
      expect(instance).toHaveProperty("name");
      expect(instance).toHaveProperty("url");
      expect(instance).toHaveProperty("enabled");
      expect(instance).toHaveProperty("priority");
      expect(instance).toHaveProperty("createdAt");
      expect(instance).toHaveProperty("updatedAt");
    });
  });

  describe("User Instance Selection", () => {
    it("user can get their instance selection", async () => {
      const response = await adminClient.get<{
        selectedInstanceIds: string[];
        availableInstances: Array<{ id: string; name: string }>;
      }>("/api/user/stash-instances");

      expect(response.ok).toBe(true);
      expect(response.data.selectedInstanceIds).toBeDefined();
      expect(Array.isArray(response.data.selectedInstanceIds)).toBe(true);
      expect(response.data.availableInstances).toBeDefined();
      expect(response.data.availableInstances.length).toBeGreaterThan(0);
    });

    it("user can update their instance selection", async () => {
      const getResponse = await adminClient.get<{
        availableInstances: Array<{ id: string }>;
      }>("/api/user/stash-instances");
      const instanceId = must(getResponse.data.availableInstances[0]).id;

      const updateResponse = await adminClient.put<{
        success: boolean;
        selectedInstanceIds: string[];
      }>("/api/user/stash-instances", {
        instanceIds: [instanceId],
      });

      expect(updateResponse.ok).toBe(true);
      expect(updateResponse.data.success).toBe(true);
      expect(updateResponse.data.selectedInstanceIds).toContain(instanceId);

      // Reset
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });
    });

    it("empty array means show all instances", async () => {
      const resetResponse = await adminClient.put<{
        success: boolean;
        selectedInstanceIds: string[];
      }>("/api/user/stash-instances", {
        instanceIds: [],
      });

      expect(resetResponse.ok).toBe(true);
      expect(resetResponse.data.selectedInstanceIds).toEqual([]);
    });

    it("unauthenticated user cannot access instance selection", async () => {
      expect((await guestClient.get("/api/user/stash-instances")).status).toBe(
        401
      );
      expect(
        (
          await guestClient.put("/api/user/stash-instances", {
            instanceIds: [],
          })
        ).status
      ).toBe(401);
    });
  });

  describe("Entity Queries Work With Instance Infrastructure", () => {
    it("scenes can be queried successfully", async () => {
      const response = await adminClient.post<{
        findScenes: {
          count: number;
          scenes: Array<{ id: string; title: string }>;
        };
      }>("/api/library/scenes", { filter: { per_page: 5 } });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("performers can be queried successfully", async () => {
      const response = await adminClient.post<{
        findPerformers: { count: number };
      }>("/api/library/performers", { filter: { per_page: 5 } });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers.count).toBeGreaterThan(0);
    });

    it("tags can be queried successfully", async () => {
      const response = await adminClient.post<{
        findTags: { count: number };
      }>("/api/library/tags", { filter: { per_page: 5 } });

      expect(response.ok).toBe(true);
      expect(response.data.findTags.count).toBeGreaterThan(0);
    });

    it("studios can be queried successfully", async () => {
      const response = await adminClient.post<{
        findStudios: { count: number };
      }>("/api/library/studios", { filter: { per_page: 5 } });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios.count).toBeGreaterThan(0);
    });
  });

  describe("Junction Table Queries", () => {
    it("filtering scenes by performer returns correct results", async () => {
      const response = await adminClient.post<{
        findScenes: {
          count: number;
          scenes: Array<{ id: string; performers: Array<{ id: string }> }>;
        };
      }>("/api/library/scenes", {
        filter: { per_page: 10 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      for (const scene of response.data.findScenes.scenes) {
        expect(scene.performers.map((p) => p.id)).toContain(
          TEST_ENTITIES.performerWithScenes
        );
      }
    });

    it("filtering scenes by tag returns correct results", async () => {
      const response = await adminClient.post<{
        findScenes: { count: number };
      }>("/api/library/scenes", {
        filter: { per_page: 10 },
        scene_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
    });

    it("filtering scenes by studio returns correct results", async () => {
      const response = await adminClient.post<{
        findScenes: {
          count: number;
          scenes: Array<{ id: string; studio: { id: string } | null }>;
        };
      }>("/api/library/scenes", {
        filter: { per_page: 10 },
        scene_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
      for (const scene of response.data.findScenes.scenes) {
        expect(scene.studio?.id).toBe(TEST_ENTITIES.studioWithScenes);
      }
    });
  });

  describe("Image Proxy URLs Include Instance Routing", () => {
    it("scene paths contain proxy URLs", async () => {
      const response = await adminClient.post<{
        findScenes: {
          scenes: Array<{ paths: { screenshot: string | null } }>;
        };
      }>("/api/library/scenes", { filter: { per_page: 1 } });

      expect(response.ok).toBe(true);
      const scene = must(response.data.findScenes.scenes[0]);
      expect(scene.paths.screenshot).toContain("/api/proxy/stash");
    });

    it("performer image paths are proxy URLs", async () => {
      const response = await adminClient.post<{
        findPerformers: {
          performers: Array<{ image_path: string | null }>;
        };
      }>("/api/library/performers", { filter: { per_page: 5 } });

      expect(response.ok).toBe(true);
      for (const performer of response.data.findPerformers.performers) {
        expect(performer.image_path).toContain("/api/proxy/stash");
      }
    });
  });

  /**
   * Multi-Instance Filtering Tests
   *
   * These tests require TWO Stash instances to be configured.
   * They verify that instance filtering works correctly and that
   * entities from different instances are properly isolated.
   *
   * IMPORTANT: All operations on production Stash are READ-ONLY.
   */
  describe.skipIf(!SECOND_STASH_URL)("Multi-Instance Filtering", () => {
    beforeAll(() => {
      expect(
        productionInstanceId,
        "second instance added and synced"
      ).toBeTruthy();
    });

    it("multiple instances are available when configured", async () => {
      const response = await adminClient.get<{
        instances: StashInstance[];
      }>("/api/setup/stash-instances");

      expect(response.ok).toBe(true);
      expect(response.data.instances.length).toBeGreaterThanOrEqual(2);
    });

    it("filtering to test instance shows only test instance scenes", async function () {
      // Select only test instance
      await adminClient.put("/api/user/stash-instances", {
        instanceIds: [testInstanceId],
      });

      const response = await adminClient.post<{
        findScenes: { count: number };
      }>("/api/library/scenes", { filter: { per_page: 1 } });

      expect(response.ok).toBe(true);
      // Test instance has far fewer scenes than production
      expect(response.data.findScenes.count).toBeLessThan(
        productionInstanceSceneCount
      );

      // Reset
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });
    });

    it("filtering to production instance shows only production scenes", async function () {
      // Select only production instance
      await adminClient.put("/api/user/stash-instances", {
        instanceIds: [productionInstanceId],
      });

      const response = await adminClient.post<{
        findScenes: { count: number };
      }>("/api/library/scenes", { filter: { per_page: 1 } });

      expect(response.ok).toBe(true);
      // Production has many more scenes than test instance
      // Allow some variance due to sync timing
      expect(response.data.findScenes.count).toBeGreaterThan(
        testInstanceSceneCount * 10
      );

      // Reset
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });
    });

    it("selecting all instances shows combined scene count", async function () {
      // Select all instances (empty array)
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });

      const response = await adminClient.post<{
        findScenes: { count: number };
      }>("/api/library/scenes", { filter: { per_page: 1 } });

      expect(response.ok).toBe(true);

      // Total should be greater than either individual count
      // (sync timing may cause actual counts to vary from captured values)
      expect(response.data.findScenes.count).toBeGreaterThan(
        Math.max(testInstanceSceneCount, productionInstanceSceneCount)
      );
    });

    it("switching between instances changes visible content", async function () {
      // Get scenes from test instance
      await adminClient.put("/api/user/stash-instances", {
        instanceIds: [testInstanceId],
      });
      const testResponse = await adminClient.post<{
        findScenes: { scenes: Array<{ id: string; title: string }> };
      }>("/api/library/scenes", { filter: { per_page: 5 } });

      // Get scenes from production instance
      await adminClient.put("/api/user/stash-instances", {
        instanceIds: [productionInstanceId],
      });
      const prodResponse = await adminClient.post<{
        findScenes: { scenes: Array<{ id: string; title: string }> };
      }>("/api/library/scenes", { filter: { per_page: 5 } });

      expect(testResponse.ok).toBe(true);
      expect(prodResponse.ok).toBe(true);

      // The scene lists should be different (different content in each instance)
      const testTitles = testResponse.data.findScenes.scenes.map(
        (s) => s.title
      );
      const prodTitles = prodResponse.data.findScenes.scenes.map(
        (s) => s.title
      );

      // At least one title should be different (instances have different content)
      const allSame =
        testTitles.every((t) => prodTitles.includes(t)) &&
        prodTitles.every((t) => testTitles.includes(t));

      // The instances hold different libraries, so switching changes what
      // you see
      expect(testInstanceSceneCount).not.toBe(productionInstanceSceneCount);
      expect(allSame).toBe(false);

      // Reset
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });
    });

    it("performers from different instances can coexist", async function () {
      // Select all instances
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });

      const response = await adminClient.post<{
        findPerformers: { count: number };
      }>("/api/library/performers", { filter: { per_page: 1 } });

      expect(response.ok).toBe(true);

      // Should have performers from both instances
      expect(response.data.findPerformers.count).toBeGreaterThan(0);
    });

    it("tags from different instances can coexist", async function () {
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });

      const response = await adminClient.post<{
        findTags: { count: number };
      }>("/api/library/tags", { filter: { per_page: 1 } });

      expect(response.ok).toBe(true);
      expect(response.data.findTags.count).toBeGreaterThan(0);
    });

    it("studios from different instances can coexist", async function () {
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });

      const response = await adminClient.post<{
        findStudios: { count: number };
      }>("/api/library/studios", { filter: { per_page: 1 } });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios.count).toBeGreaterThan(0);
    });

    it("user selection persists across queries", async function () {
      // Select test instance
      await adminClient.put("/api/user/stash-instances", {
        instanceIds: [testInstanceId],
      });

      // Make multiple queries
      const query1 = await adminClient.post<{ findScenes: { count: number } }>(
        "/api/library/scenes",
        { filter: { per_page: 1 } }
      );
      const query2 = await adminClient.post<{
        findPerformers: { count: number };
      }>("/api/library/performers", { filter: { per_page: 1 } });
      const query3 = await adminClient.post<{ findTags: { count: number } }>(
        "/api/library/tags",
        { filter: { per_page: 1 } }
      );

      expect(query1.ok).toBe(true);
      expect(query2.ok).toBe(true);
      expect(query3.ok).toBe(true);

      // All should reflect test instance only (small count compared to production)
      expect(query1.data.findScenes.count).toBeLessThan(
        productionInstanceSceneCount
      );

      // Reset
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });
    });
  });

  describe.skipIf(!SECOND_STASH_URL)(
    "Instance-Specific Entity Filtering",
    () => {
      beforeAll(() => {
        expect(
          productionInstanceId,
          "second instance added and synced"
        ).toBeTruthy();
      });

      it("filtering by test instance performer only returns test instance scenes", async function () {
        // Select all instances
        await adminClient.put("/api/user/stash-instances", { instanceIds: [] });

        // Filter by a performer that exists in test instance
        const response = await adminClient.post<{
          findScenes: {
            count: number;
            scenes: Array<{ id: string; performers: Array<{ id: string }> }>;
          };
        }>("/api/library/scenes", {
          filter: { per_page: 50 },
          scene_filter: {
            performers: {
              value: [TEST_ENTITIES.performerWithScenes],
              modifier: "INCLUDES",
            },
          },
        });

        expect(response.ok).toBe(true);

        // Results should only be from test instance (the performer is from test instance)
        // This verifies that junction table queries correctly match instance IDs
        for (const scene of response.data.findScenes.scenes) {
          expect(scene.performers.map((p) => p.id)).toContain(
            TEST_ENTITIES.performerWithScenes
          );
        }
      });

      it("filtering by test instance tag only returns matching scenes", async function () {
        await adminClient.put("/api/user/stash-instances", { instanceIds: [] });

        const response = await adminClient.post<{
          findScenes: { count: number };
        }>("/api/library/scenes", {
          filter: { per_page: 50 },
          scene_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        });

        expect(response.ok).toBe(true);
        // The tag is from test instance, so only test instance scenes should match
        expect(response.data.findScenes.count).toBeLessThanOrEqual(
          testInstanceSceneCount
        );
      });
    }
  );
});
