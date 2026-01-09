import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Tag Parent Name Hydration Integration Tests
 *
 * Tests that parent tag names are properly hydrated (not empty strings).
 * Bug: TagQueryBuilder was setting parent names to empty string "",
 * and the controller merge was overwriting hydrated names.
 */

interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
      parents?: Array<{ id: string; name: string }>;
      children?: Array<{ id: string; name: string }>;
    }>;
    count: number;
  };
}

describe("Tag Parent Name Hydration", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  it("hydrates parent tag names (not empty strings) in list view", async () => {
    // Find tags that have parents
    const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
      filter: { per_page: 100 },
      tag_filter: {
        parent_count: {
          value: 0,
          modifier: "GREATER_THAN",
        },
      },
    });

    expect(response.ok).toBe(true);
    expect(response.data.findTags.count).toBeGreaterThan(0);

    // Find a tag that actually has parents in the response
    const tagWithParents = response.data.findTags.tags.find(
      (t) => t.parents && t.parents.length > 0
    );
    expect(tagWithParents).toBeDefined();
    expect(tagWithParents!.parents).toBeDefined();
    expect(tagWithParents!.parents!.length).toBeGreaterThan(0);

    // Each parent should have a non-empty name
    for (const parent of tagWithParents!.parents!) {
      expect(parent.id).toBeDefined();
      expect(parent.name).toBeDefined();
      expect(parent.name.length).toBeGreaterThan(0);
      expect(parent.name).not.toBe("");
      expect(parent.name).not.toBe("Unknown");
    }
  });

  it("hydrates parent tag names on single-tag detail request", async () => {
    // First find a tag that has parents
    const listResponse = await adminClient.post<FindTagsResponse>("/api/library/tags", {
      filter: { per_page: 100 },
      tag_filter: {
        parent_count: {
          value: 0,
          modifier: "GREATER_THAN",
        },
      },
    });

    expect(listResponse.ok).toBe(true);
    const tagWithParents = listResponse.data.findTags.tags.find(
      (t) => t.parents && t.parents.length > 0
    );
    expect(tagWithParents).toBeDefined();

    // Now request this specific tag by ID (single-tag detail request path)
    const detailResponse = await adminClient.post<FindTagsResponse>("/api/library/tags", {
      ids: [tagWithParents!.id],
    });

    expect(detailResponse.ok).toBe(true);
    expect(detailResponse.data.findTags.tags).toHaveLength(1);

    const tag = detailResponse.data.findTags.tags[0];
    expect(tag.parents).toBeDefined();
    expect(tag.parents!.length).toBeGreaterThan(0);

    // Each parent should have a non-empty name
    for (const parent of tag.parents!) {
      expect(parent.id).toBeDefined();
      expect(parent.name).toBeDefined();
      expect(parent.name.length).toBeGreaterThan(0);
      expect(parent.name).not.toBe("");
      expect(parent.name).not.toBe("Unknown");
    }
  });
});
