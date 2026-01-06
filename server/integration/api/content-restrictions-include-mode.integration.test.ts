import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TestClient, adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Integration test for INCLUDE mode content restrictions.
 *
 * This test verifies that when an admin sets INCLUDE mode restrictions,
 * only the specified entities are allowed and all others are excluded.
 *
 * The bug: getAllEntityIds() was calling stashCacheManager which was never
 * initialized, so it always returned empty arrays. This meant INCLUDE mode
 * restrictions silently did nothing.
 */

interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
    }>;
    count: number;
  };
}

describe("Content Restrictions INCLUDE Mode Integration Tests", () => {
  let testUserId: number;
  let testUserClient: TestClient;
  let tag1Id: string;
  let tag2Id: string;
  let tag3Id: string;

  beforeAll(async () => {
    // Ensure admin client is logged in
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);

    // Create a test user for restriction testing
    const createResponse = await adminClient.post<{
      success: boolean;
      user: { id: number; username: string };
    }>("/api/user/create", {
      username: "include_mode_test_user",
      password: "test_password_123",
      role: "USER",
    });

    if (createResponse.ok && createResponse.data.user) {
      testUserId = createResponse.data.user.id;
    } else {
      // User might already exist from previous test run - fetch them
      const usersResponse = await adminClient.get<{
        users: Array<{ id: number; username: string }>;
      }>("/api/user/all");

      const existingUser = usersResponse.data.users?.find(
        (u) => u.username === "include_mode_test_user"
      );
      if (existingUser) {
        testUserId = existingUser.id;
      } else {
        throw new Error("Failed to create or find test user");
      }
    }

    // Create and login the test user client
    testUserClient = new TestClient();
    await testUserClient.login("include_mode_test_user", "test_password_123");

    // Get 3 existing tag IDs from the database using the correct POST endpoint
    const tagsResponse = await adminClient.post<FindTagsResponse>("/api/library/tags", {
      filter: { per_page: 10 },
    });

    if (!tagsResponse.ok || !tagsResponse.data.findTags?.tags || tagsResponse.data.findTags.tags.length < 3) {
      throw new Error(
        `Need at least 3 tags in database for this test. Found: ${tagsResponse.data.findTags?.tags?.length || 0}`
      );
    }

    // Use first 3 tags
    tag1Id = tagsResponse.data.findTags.tags[0].id;
    tag2Id = tagsResponse.data.findTags.tags[1].id;
    tag3Id = tagsResponse.data.findTags.tags[2].id;

    // Clean up any existing restrictions for this user
    await adminClient.delete(`/api/user/${testUserId}/restrictions`);
  });

  afterAll(async () => {
    // Clean up restrictions
    if (testUserId) {
      await adminClient.delete(`/api/user/${testUserId}/restrictions`);
    }
    // Delete the test user
    if (testUserId) {
      await adminClient.delete(`/api/user/${testUserId}`);
    }
  });

  describe("INCLUDE mode tag restrictions", () => {
    it("should exclude tags not in the INCLUDE list", async () => {
      // Set INCLUDE mode restriction allowing only tag1 and tag2
      const restrictions = [
        {
          entityType: "tags",
          mode: "INCLUDE",
          entityIds: [tag1Id, tag2Id],
          restrictEmpty: false,
        },
      ];

      const setResponse = await adminClient.put<{
        success: boolean;
        restrictions: Array<unknown>;
      }>(`/api/user/${testUserId}/restrictions`, { restrictions });

      expect(setResponse.ok).toBe(true);
      expect(setResponse.data.success).toBe(true);

      // Trigger exclusion recomputation
      const recomputeResponse = await adminClient.post<{
        ok: boolean;
        message: string;
      }>(`/api/exclusions/recompute/${testUserId}`);

      expect(recomputeResponse.ok).toBe(true);
      expect(recomputeResponse.data.ok).toBe(true);

      // Check the exclusion stats to see if tags are excluded with reason "restricted"
      // The stats endpoint shows counts by entityType and reason
      const statsResponse = await adminClient.get<
        Array<{
          userId: number;
          entityType: string;
          reason: string;
          _count: number;
        }>
      >("/api/exclusions/stats");

      expect(statsResponse.ok).toBe(true);

      // Find the stats for our test user's tag exclusions with reason "restricted"
      const tagExclusions = statsResponse.data.filter(
        (stat) =>
          stat.userId === testUserId &&
          stat.entityType === "tag" &&
          stat.reason === "restricted"
      );

      // There should be exclusions for tags (all tags except tag1 and tag2)
      // If the bug exists (getAllEntityIds returns []), there would be 0 exclusions
      const totalTagExclusions = tagExclusions.reduce(
        (sum, stat) => sum + stat._count,
        0
      );

      // We should have approximately (totalTags - 2) restricted tags
      // The key assertion: with the bug fixed, we now have tag exclusions
      // Before the fix, this was 0 because getAllEntityIds returned []
      expect(totalTagExclusions).toBeGreaterThan(0);

      // Verify that tag3 is excluded by querying as the test user
      const userTagsResponse = await testUserClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 1000 },
      });

      expect(userTagsResponse.ok).toBe(true);

      const visibleTagIds = userTagsResponse.data.findTags.tags.map((t) => t.id);

      // tag3 should NOT be in the visible tags (it's restricted)
      expect(visibleTagIds).not.toContain(tag3Id);

      // The user should see fewer tags than the total (restrictions are working)
      // Note: Some included tags may also be excluded due to cascade/empty rules
      // The important thing is that the INCLUDE list works as a filter
      expect(userTagsResponse.data.findTags.count).toBeLessThan(255); // Assuming ~255 total tags
    });

    it("should handle INCLUDE mode with empty list (exclude all)", async () => {
      // Set INCLUDE mode with empty list - this should exclude ALL tags
      const restrictions = [
        {
          entityType: "tags",
          mode: "INCLUDE",
          entityIds: [],
          restrictEmpty: false,
        },
      ];

      const setResponse = await adminClient.put<{
        success: boolean;
        restrictions: Array<unknown>;
      }>(`/api/user/${testUserId}/restrictions`, { restrictions });

      expect(setResponse.ok).toBe(true);

      // Trigger exclusion recomputation
      await adminClient.post(`/api/exclusions/recompute/${testUserId}`);

      // Query tags as test user - should see no tags
      const userTagsResponse = await testUserClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 1000 },
      });

      expect(userTagsResponse.ok).toBe(true);

      // With INCLUDE mode and empty list, ALL tags should be excluded
      // If the bug exists, NO tags would be excluded (getAllEntityIds returns [])
      expect(userTagsResponse.data.findTags.tags.length).toBe(0);
      expect(userTagsResponse.data.findTags.count).toBe(0);
    });
  });
});
