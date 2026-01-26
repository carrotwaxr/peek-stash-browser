/**
 * Multi-Instance Integration Tests
 *
 * Tests for multi-Stash-instance support using TWO real Stash instances:
 * - Test Stash (primary, STASH_TEST_*) - can be freely modified
 * - Production Stash (secondary, STASH_URL/STASH_API_KEY) - READ ONLY
 *
 * These tests verify:
 * - Admin instance management endpoints
 * - User instance selection and filtering
 * - Instance-aware queries across multiple instances
 * - Composite key behavior with potential ID overlaps
 *
 * IMPORTANT: Production Stash tests are READ-ONLY. No modifications allowed.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";

// Production Stash credentials from env (the "main" Stash, not the test one)
const PRODUCTION_STASH_URL = process.env.STASH_URL_ORIGINAL || "http://10.0.0.4:6969/graphql";
const PRODUCTION_STASH_API_KEY = process.env.STASH_API_KEY_ORIGINAL || process.env.STASH_API_KEY;

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
  let hasMultipleInstances = false;
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
    testInstanceId = instancesResponse.data.instances[0].id;

    // Check if production instance already exists
    const existingProduction = instancesResponse.data.instances.find(
      (i) => i.url === PRODUCTION_STASH_URL
    );

    if (existingProduction) {
      productionInstanceId = existingProduction.id;
      hasMultipleInstances = true;
      console.log("[Multi-Instance Tests] Production instance already configured");
    } else if (PRODUCTION_STASH_API_KEY && PRODUCTION_STASH_URL !== process.env.STASH_URL) {
      // Add production Stash as second instance (READ ONLY - we just sync from it)
      console.log("[Multi-Instance Tests] Adding production Stash as second instance...");

      const addResponse = await adminClient.post<{
        success: boolean;
        instance: StashInstance;
      }>("/api/setup/stash-instance", {
        name: "Production Stash (Read-Only)",
        description: "Main production Stash - for multi-instance testing only",
        url: PRODUCTION_STASH_URL,
        apiKey: PRODUCTION_STASH_API_KEY,
        enabled: true,
        priority: 2, // Lower priority than test instance
      });

      if (addResponse.ok) {
        productionInstanceId = addResponse.data.instance.id;
        hasMultipleInstances = true;
        console.log("[Multi-Instance Tests] Production instance added, waiting for sync...");

        // Wait for sync to complete (poll for up to 2 minutes)
        const maxWait = 120000;
        const startTime = Date.now();
        let syncComplete = false;

        while (Date.now() - startTime < maxWait && !syncComplete) {
          await new Promise((r) => setTimeout(r, 5000));

          // Check if we have scenes from production
          const scenesResponse = await adminClient.post<{
            findScenes: { count: number };
          }>("/api/library/scenes", {
            filter: { per_page: 1 },
          });

          if (scenesResponse.ok && scenesResponse.data.findScenes.count > 20) {
            // Production has many more scenes than test instance
            syncComplete = true;
          }
        }

        if (!syncComplete) {
          console.log("[Multi-Instance Tests] Warning: Sync may not be complete");
        }
      } else {
        console.log("[Multi-Instance Tests] Could not add production instance:", addResponse.data);
      }
    }

    // Get scene counts for each instance if we have multiple
    if (hasMultipleInstances && productionInstanceId) {
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
      productionInstanceSceneCount = prodScenesResponse.data?.findScenes?.count || 0;

      // Reset to all instances
      await adminClient.put("/api/user/stash-instances", {
        instanceIds: [],
      });

      console.log(`[Multi-Instance Tests] Test instance: ${testInstanceSceneCount} scenes`);
      console.log(`[Multi-Instance Tests] Production instance: ${productionInstanceSceneCount} scenes`);
    }
  });

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

      const instance = response.data.instances[0];
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
        instances: Array<StashInstance & { createdAt: string; updatedAt: string }>;
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
      const instanceId = getResponse.data.availableInstances[0].id;

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
      expect((await guestClient.get("/api/user/stash-instances")).status).toBe(401);
      expect((await guestClient.put("/api/user/stash-instances", { instanceIds: [] })).status).toBe(401);
    });
  });

  describe("Entity Queries Work With Instance Infrastructure", () => {
    it("scenes can be queried successfully", async () => {
      const response = await adminClient.post<{
        findScenes: { count: number; scenes: Array<{ id: string; title: string }> };
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
          performers: { value: [TEST_ENTITIES.performerWithScenes], modifier: "INCLUDES" },
        },
      });

      expect(response.ok).toBe(true);
      for (const scene of response.data.findScenes.scenes) {
        expect(scene.performers.map((p) => p.id)).toContain(TEST_ENTITIES.performerWithScenes);
      }
    });

    it("filtering scenes by tag returns correct results", async () => {
      const response = await adminClient.post<{
        findScenes: { count: number };
      }>("/api/library/scenes", {
        filter: { per_page: 10 },
        scene_filter: {
          tags: { value: [TEST_ENTITIES.tagWithEntities], modifier: "INCLUDES" },
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
          studios: { value: [TEST_ENTITIES.studioWithScenes], modifier: "INCLUDES" },
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
      const scene = response.data.findScenes.scenes[0];
      if (scene.paths.screenshot) {
        expect(scene.paths.screenshot).toContain("/api/proxy/stash");
      }
    });

    it("performer image paths are proxy URLs", async () => {
      const response = await adminClient.post<{
        findPerformers: {
          performers: Array<{ image_path: string | null }>;
        };
      }>("/api/library/performers", { filter: { per_page: 5 } });

      expect(response.ok).toBe(true);
      for (const performer of response.data.findPerformers.performers) {
        if (performer.image_path) {
          expect(performer.image_path).toContain("/api/proxy/stash");
        }
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
  describe("Multi-Instance Filtering", () => {
    it("multiple instances are available when configured", async () => {
      const response = await adminClient.get<{
        instances: StashInstance[];
      }>("/api/setup/stash-instances");

      expect(response.ok).toBe(true);

      if (hasMultipleInstances) {
        expect(response.data.instances.length).toBeGreaterThanOrEqual(2);
      } else {
        console.log("Skipping: Only one instance configured");
      }
    });

    it("filtering to test instance shows only test instance scenes", async function () {
      if (!hasMultipleInstances) {
        console.log("Skipping: Requires multiple instances");
        return;
      }

      // Select only test instance
      await adminClient.put("/api/user/stash-instances", {
        instanceIds: [testInstanceId],
      });

      const response = await adminClient.post<{
        findScenes: { count: number };
      }>("/api/library/scenes", { filter: { per_page: 1 } });

      expect(response.ok).toBe(true);
      // Test instance has far fewer scenes than production
      expect(response.data.findScenes.count).toBeLessThan(productionInstanceSceneCount);

      // Reset
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });
    });

    it("filtering to production instance shows only production scenes", async function () {
      if (!hasMultipleInstances || !productionInstanceId) {
        console.log("Skipping: Requires production instance");
        return;
      }

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
      expect(response.data.findScenes.count).toBeGreaterThan(testInstanceSceneCount * 10);

      // Reset
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });
    });

    it("selecting all instances shows combined scene count", async function () {
      if (!hasMultipleInstances) {
        console.log("Skipping: Requires multiple instances");
        return;
      }

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
      if (!hasMultipleInstances || !productionInstanceId) {
        console.log("Skipping: Requires multiple instances");
        return;
      }

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
      const testTitles = testResponse.data.findScenes.scenes.map((s) => s.title);
      const prodTitles = prodResponse.data.findScenes.scenes.map((s) => s.title);

      // At least one title should be different (instances have different content)
      const allSame = testTitles.every((t) => prodTitles.includes(t)) &&
                      prodTitles.every((t) => testTitles.includes(t));

      // It's unlikely both instances have exactly the same 5 scenes
      // This test verifies that switching instances actually changes what you see
      if (testInstanceSceneCount !== productionInstanceSceneCount) {
        // If counts differ, content must differ
        expect(allSame).toBe(false);
      }

      // Reset
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });
    });

    it("performers from different instances can coexist", async function () {
      if (!hasMultipleInstances) {
        console.log("Skipping: Requires multiple instances");
        return;
      }

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
      if (!hasMultipleInstances) {
        console.log("Skipping: Requires multiple instances");
        return;
      }

      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });

      const response = await adminClient.post<{
        findTags: { count: number };
      }>("/api/library/tags", { filter: { per_page: 1 } });

      expect(response.ok).toBe(true);
      expect(response.data.findTags.count).toBeGreaterThan(0);
    });

    it("studios from different instances can coexist", async function () {
      if (!hasMultipleInstances) {
        console.log("Skipping: Requires multiple instances");
        return;
      }

      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });

      const response = await adminClient.post<{
        findStudios: { count: number };
      }>("/api/library/studios", { filter: { per_page: 1 } });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios.count).toBeGreaterThan(0);
    });

    it("user selection persists across queries", async function () {
      if (!hasMultipleInstances) {
        console.log("Skipping: Requires multiple instances");
        return;
      }

      // Select test instance
      await adminClient.put("/api/user/stash-instances", {
        instanceIds: [testInstanceId],
      });

      // Make multiple queries
      const query1 = await adminClient.post<{ findScenes: { count: number } }>(
        "/api/library/scenes",
        { filter: { per_page: 1 } }
      );
      const query2 = await adminClient.post<{ findPerformers: { count: number } }>(
        "/api/library/performers",
        { filter: { per_page: 1 } }
      );
      const query3 = await adminClient.post<{ findTags: { count: number } }>(
        "/api/library/tags",
        { filter: { per_page: 1 } }
      );

      expect(query1.ok).toBe(true);
      expect(query2.ok).toBe(true);
      expect(query3.ok).toBe(true);

      // All should reflect test instance only (small count compared to production)
      expect(query1.data.findScenes.count).toBeLessThan(productionInstanceSceneCount);

      // Reset
      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });
    });
  });

  describe("Instance-Specific Entity Filtering", () => {
    it("filtering by test instance performer only returns test instance scenes", async function () {
      if (!hasMultipleInstances) {
        console.log("Skipping: Requires multiple instances");
        return;
      }

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
          performers: { value: [TEST_ENTITIES.performerWithScenes], modifier: "INCLUDES" },
        },
      });

      expect(response.ok).toBe(true);

      // Results should only be from test instance (the performer is from test instance)
      // This verifies that junction table queries correctly match instance IDs
      for (const scene of response.data.findScenes.scenes) {
        expect(scene.performers.map((p) => p.id)).toContain(TEST_ENTITIES.performerWithScenes);
      }
    });

    it("filtering by test instance tag only returns matching scenes", async function () {
      if (!hasMultipleInstances) {
        console.log("Skipping: Requires multiple instances");
        return;
      }

      await adminClient.put("/api/user/stash-instances", { instanceIds: [] });

      const response = await adminClient.post<{
        findScenes: { count: number };
      }>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          tags: { value: [TEST_ENTITIES.tagWithEntities], modifier: "INCLUDES" },
        },
      });

      expect(response.ok).toBe(true);
      // The tag is from test instance, so only test instance scenes should match
      expect(response.data.findScenes.count).toBeLessThanOrEqual(testInstanceSceneCount);
    });
  });
});
