import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { must } from "../../tests/helpers/must.js";
import { parseListRequest } from "../../utils/listRequest.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { adminClient, findTestInstanceId } from "../helpers/testClient.js";

/**
 * Tag Filters Integration Tests
 *
 * Tests tag-specific filters:
 * - favorite filter
 * - rating100 filter
 * - o_counter filter
 * - play_count filter
 * - scene_count filter
 * - name/description text search
 * - parent/child tag relationships
 */

interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      instanceId: string;
      name: string;
      description?: string | null;
      favorite?: boolean;
      rating100?: number | null;
      scene_count?: number;
      o_counter?: number;
      play_count?: number;
      parent_count?: number;
      child_count?: number;
      parents?: Array<{ id: string; name: string }>;
      children?: Array<{ id: string; name: string }>;
    }>;
    count: number;
  };
}

describe("Tag Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("favorite filter", () => {
    it("filters favorite tags", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            favorite: true,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.favorite).toBe(true);
      }
    });

    it("filters non-favorite tags", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            favorite: false,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
    });
  });

  describe("rating100 filter", () => {
    it("filters tags with rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            rating100: {
              value: 50,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        // The filter counts an unrated tag as 0
        expect(tag.rating100 ?? 0).toBeGreaterThan(50);
      }
    });

    it("filters tags with rating LESS_THAN", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            rating100: {
              value: 80,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        // The filter counts an unrated tag as 0, so unrated tags match
        expect(tag.rating100 ?? 0).toBeLessThan(80);
      }
    });

    it("filters tags with rating BETWEEN", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            rating100: {
              value: 40,
              value2: 80,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        // The filter counts an unrated tag as 0
        const rating = tag.rating100 ?? 0;
        expect(rating).toBeGreaterThanOrEqual(40);
        expect(rating).toBeLessThanOrEqual(80);
      }
    });
  });

  describe("o_counter filter", () => {
    it("filters tags with o_counter GREATER_THAN", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            o_counter: {
              value: 0,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.o_counter ?? 0).toBeGreaterThan(0);
      }
    });

    it("filters tags with o_counter EQUALS zero", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            o_counter: {
              value: 0,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.o_counter ?? 0).toBe(0);
      }
    });
  });

  describe("play_count filter", () => {
    it("filters tags with play_count GREATER_THAN", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            play_count: {
              value: 0,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.play_count ?? 0).toBeGreaterThan(0);
      }
    });
  });

  describe("scene_count filter", () => {
    it("filters tags with scene_count GREATER_THAN", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            scene_count: {
              value: 5,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.scene_count ?? 0).toBeGreaterThan(5);
      }
    });

    it("filters tags with scene_count EQUALS zero (unused tags)", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            scene_count: {
              value: 0,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.scene_count ?? 0).toBe(0);
      }
    });
  });

  describe("text search", () => {
    it("searches tags by name using q parameter", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: {
            per_page: 50,
            q: "tag", // Common substring in tag names
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
    });

    it("searches tags by name filter", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            name: {
              value: "tag",
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
    });
  });

  describe("parent and child counts", () => {
    // Applied as the viewer sees them (tag-hierarchy-filters has the seeded
    // cases)
    it.each(["child_count", "parent_count"])(
      "%s filters the list",
      async (field) => {
        const response = await adminClient.post<FindTagsResponse>(
          "/api/library/tags",
          {
            filter: { per_page: 100 },
            tag_filter: { [field]: { value: 0, modifier: "GREATER_THAN" } },
          }
        );

        expect(response.ok).toBe(true);
        expect(response.data.findTags).toBeDefined();
      }
    );
  });

  describe("sorting", () => {
    it("sorts tags by name ascending", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: {
            per_page: 20,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      const names = response.data.findTags.tags.map((t) =>
        t.name.toLowerCase()
      );
      for (let i = 1; i < names.length; i++) {
        expect(must(names[i]) >= must(names[i - 1])).toBe(true);
      }
    });

    it("sorts tags by scene_count descending", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: {
            per_page: 20,
            sort: "scene_count",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      const counts = response.data.findTags.tags.map((t) => t.scene_count ?? 0);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(must(counts[i - 1]));
      }
    });
  });

  describe("combined filters", () => {
    it("combines favorite and rating filters", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            favorite: true,
            rating100: {
              value: 60,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.favorite).toBe(true);
        // The filter counts an unrated tag as 0
        expect(tag.rating100 ?? 0).toBeGreaterThan(60);
      }
    });

    it("combines scene_count and o_counter filters", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            scene_count: {
              value: 1,
              modifier: "GREATER_THAN",
            },
            o_counter: {
              value: 0,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.scene_count ?? 0).toBeGreaterThan(1);
        expect(tag.o_counter ?? 0).toBeGreaterThan(0);
      }
    });
  });

  describe("fetch by ID", () => {
    it("fetches specific tag by ID", async () => {
      // A detail page names the entity's instance: the second library
      // reuses the test library's ids, so a bare id can match one on each
      // instance (the ambiguous-lookup 400)
      const instanceId = await findTestInstanceId();
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          ids: [`${TEST_ENTITIES.tagWithEntities}:${instanceId}`],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
      expect(response.data.findTags.tags.length).toBe(1);
      const tag = must(response.data.findTags.tags[0]);
      expect(tag.id).toBe(TEST_ENTITIES.tagWithEntities);
      expect(tag.instanceId).toBe(instanceId);
    });
  });
});

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Tag parity (F15): aliases (one at a time) and StashDB ids. Sent over the
 * wire parser into the builder for a viewer of their own, as the list route
 * does.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do:
 * - tp-a tags: 7901001 (aliases "Alpha One" and "A1", a StashDB id), 7901002
 *   (alias "Beta", `[]` StashDB ids), 7901003 (nothing set), 7901004 (aliases
 *   `[]`), 7901005 (hidden by the viewer, matching everything 7901001 does).
 * - tp-b tags: 7901001 (alias "Zulu", another StashDB id), 7901002.
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Tag parity filters (seeded)", () => {
  const A = "tp-a";
  const B = "tp-b";
  const VIEWER = "tp-viewer";
  let viewerId = 0;

  const [T1, T2, T3, T4, TH] = [
    "7901001",
    "7901002",
    "7901003",
    "7901004",
    "7901005",
  ];
  const STASHDB = "https://stashdb.org/graphql";
  const key = (id: string, instance: string) => `${id}:${instance}`;
  /** Every tag the viewer can see */
  const VISIBLE = [
    key(T1, A),
    key(T2, A),
    key(T3, A),
    key(T4, A),
    key(T1, B),
    key(T2, B),
  ].sort();
  const without = (...keys: string[]) =>
    VISIBLE.filter((k) => !keys.includes(k));

  async function removeRows(): Promise<void> {
    await prisma.stashTag.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.user.deleteMany({ where: { username: VIEWER } });
  }

  async function listed(filter: Record<string, unknown>): Promise<string[]> {
    const request = parseListRequest(
      "tag",
      { filter: { per_page: 100 }, tag_filter: filter },
      { userId: viewerId }
    );
    const { items, total } = await tagQueryBuilder.execute({
      userId: viewerId,
      allowedInstanceIds: [A, B],
      request,
    });
    expect(total).toBe(items.length);
    return items.map((t) => key(t.id, t.instanceId)).sort();
  }

  beforeAll(async () => {
    await removeRows();
    viewerId = (
      await prisma.user.create({
        data: { username: VIEWER, password: "not-a-real-hash", role: "USER" },
      })
    ).id;
    const stashIds = (id: string) =>
      JSON.stringify([{ endpoint: STASHDB, stash_id: id }]);
    const tag = (
      id: string,
      instance: string,
      extra: Record<string, unknown> = {}
    ) => ({
      id,
      stashInstanceId: instance,
      name: `TP ${id} ${instance}`,
      ...extra,
    });
    await prisma.stashTag.createMany({
      data: [
        tag(T1, A, {
          aliases: JSON.stringify(["Alpha One", "A1"]),
          stashIds: stashIds("aaaa-1111"),
        }),
        tag(T2, A, { aliases: JSON.stringify(["Beta"]), stashIds: "[]" }),
        tag(T3, A),
        tag(T4, A, { aliases: "[]" }),
        tag(TH, A, {
          aliases: JSON.stringify(["Alpha One", "A1"]),
          stashIds: stashIds("aaaa-1111"),
        }),
        tag(T1, B, {
          aliases: JSON.stringify(["Zulu"]),
          stashIds: stashIds("bbbb-2222"),
        }),
        tag(T2, B),
      ],
    });
    await prisma.userExcludedEntity.create({
      data: {
        userId: viewerId,
        entityType: "tag",
        entityId: TH,
        instanceId: A,
        reason: "hidden",
      },
    });
  });

  afterAll(removeRows);

  it("aliases match one alias at a time, and IS_NULL lists the tags with none", async () => {
    expect(
      await listed({ aliases: { value: "alpha", modifier: "INCLUDES" } })
    ).toEqual([key(T1, A)]);
    expect(
      await listed({ aliases: { value: "a1", modifier: "EQUALS" } })
    ).toEqual([key(T1, A)]);
    // The list's JSON punctuation is never matched
    expect(
      await listed({ aliases: { value: '","', modifier: "INCLUDES" } })
    ).toEqual([]);
    expect(await listed({ aliases: { modifier: "IS_NULL" } })).toEqual(
      [key(T3, A), key(T4, A), key(T2, B)].sort()
    );
    expect(await listed({ aliases: { modifier: "NOT_NULL" } })).toEqual(
      [key(T1, A), key(T2, A), key(T1, B)].sort()
    );
  });

  it("an alias on one instance never matches the other's tag of the same id", async () => {
    expect(
      await listed({ aliases: { value: "zulu", modifier: "INCLUDES" } })
    ).toEqual([key(T1, B)]);
  });

  it("a tag the viewer hid is never listed by its alias, in any form", async () => {
    expect(
      await listed({ aliases: { value: "alpha", modifier: "INCLUDES" } })
    ).not.toContain(key(TH, A));
    expect(
      await listed({ aliases: { value: "alpha", modifier: "EXCLUDES" } })
    ).toEqual(without(key(T1, A)));
    expect(await listed({ aliases: { modifier: "NOT_NULL" } })).not.toContain(
      key(TH, A)
    );
  });

  it("stash_id EQUALS a StashDB id on its own instance, IS_NULL and NOT_NULL", async () => {
    expect(
      await listed({ stash_id: { value: "AAAA-1111", modifier: "EQUALS" } })
    ).toEqual([key(T1, A)]);
    expect(
      await listed({ stash_id: { value: "bbbb-2222", modifier: "EQUALS" } })
    ).toEqual([key(T1, B)]);
    expect(await listed({ stash_id: { modifier: "NOT_NULL" } })).toEqual(
      [key(T1, A), key(T1, B)].sort()
    );
    expect(await listed({ stash_id: { modifier: "IS_NULL" } })).toEqual(
      without(key(T1, A), key(T1, B))
    );
  });
});
