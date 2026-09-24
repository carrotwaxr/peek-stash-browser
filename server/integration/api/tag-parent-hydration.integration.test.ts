import { beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { adminClient } from "../helpers/testClient.js";

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
    const response = await adminClient.post<FindTagsResponse>(
      "/api/library/tags",
      {
        filter: { per_page: 100 },
        tag_filter: {
          parent_count: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      }
    );

    expect(response.ok).toBe(true);
    expect(response.data.findTags.count).toBeGreaterThan(0);

    // Find a tag that actually has parents in the response
    const tagWithParents = must(
      response.data.findTags.tags.find(
        (t) => t.parents && t.parents.length > 0
      ),
      "a tag with parents"
    );
    const parents = must(tagWithParents.parents, "parents");
    expect(parents.length).toBeGreaterThan(0);

    // Each parent should have a non-empty name
    for (const parent of parents) {
      expect(parent.id).toBeDefined();
      expect(parent.name).toBeDefined();
      expect(parent.name.length).toBeGreaterThan(0);
      expect(parent.name).not.toBe("");
      expect(parent.name).not.toBe("Unknown");
    }
  });

  it("hydrates parent tag names on single-tag detail request", async () => {
    // First find a tag that has parents
    const listResponse = await adminClient.post<FindTagsResponse>(
      "/api/library/tags",
      {
        filter: { per_page: 100 },
        tag_filter: {
          parent_count: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      }
    );

    expect(listResponse.ok).toBe(true);
    const tagWithParents = must(
      listResponse.data.findTags.tags.find(
        (t) => t.parents && t.parents.length > 0
      ),
      "a tag with parents"
    );

    // Now request this specific tag by ID (single-tag detail request path)
    const detailResponse = await adminClient.post<FindTagsResponse>(
      "/api/library/tags",
      {
        ids: [tagWithParents.id],
      }
    );

    expect(detailResponse.ok).toBe(true);
    expect(detailResponse.data.findTags.tags).toHaveLength(1);

    const tag = must(detailResponse.data.findTags.tags[0]);
    const parents = must(tag.parents, "parents");
    expect(parents.length).toBeGreaterThan(0);

    // Each parent should have a non-empty name
    for (const parent of parents) {
      expect(parent.id).toBeDefined();
      expect(parent.name).toBeDefined();
      expect(parent.name.length).toBeGreaterThan(0);
      expect(parent.name).not.toBe("");
      expect(parent.name).not.toBe("Unknown");
    }
  });
});
