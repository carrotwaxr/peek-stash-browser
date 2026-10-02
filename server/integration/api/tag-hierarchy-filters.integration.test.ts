import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { must } from "../../tests/helpers/must.js";
import { parseListRequest } from "../../utils/listRequest.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { adminClient, findTestInstanceId } from "../helpers/testClient.js";

/**
 * Tag Hierarchy Filters Integration Tests
 *
 * Tests tag filtering with hierarchical relationships:
 * - Tag depth filtering
 * - Parent tags include children (INCLUDES_ALL behavior)
 * - Tag exclusions
 * - Inherited tag behavior
 * - Tag parents and children with depth, and the tag counts (seeded)
 */

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      tags?: Array<{ id: string; name?: string }>;
    }>;
    count: number;
  };
}

interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      instanceId: string;
      name: string;
      parent_count?: number;
      child_count?: number;
      parents?: Array<{ id: string; name: string }>;
      children?: Array<{ id: string; name: string }>;
    }>;
    count: number;
  };
}

describe("Tag Hierarchy Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("basic tag filtering", () => {
    it("filters scenes by tag with INCLUDES modifier", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBeGreaterThan(0);
    });

    it("filters scenes by tag with EXCLUDES modifier", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // Results should not include the excluded tag
    });

    it("filters scenes by multiple tags with INCLUDES_ALL modifier", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            tags: {
              value: [
                TEST_ENTITIES.tagWithEntities,
                TEST_ENTITIES.restrictableTag,
              ],
              modifier: "INCLUDES_ALL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // Result should include scenes with ALL specified tags
    });
  });

  describe("tag depth filtering", () => {
    it("filters tags by tag_count (scenes using the tag)", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            scene_count: {
              value: 1,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
      expect(response.data.findTags.count).toBeGreaterThan(0);
    });
  });

  describe("tag relationship filtering", () => {
    it("filters tags by parents", async () => {
      // First get a tag that has children
      const parentResponse = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        { filter: { per_page: 250 } }
      );

      // The library has a tag with children
      const parentTagId = must(
        parentResponse.data.findTags.tags.find(
          (tag) => (tag.children ?? []).length > 0
        ),
        "a tag with children"
      ).id;

      // Now filter scenes by this parent tag
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            tags: {
              value: [parentTagId],
              modifier: "INCLUDES",
              depth: 1, // Include child tags
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("returns tag by ID with relationships", async () => {
      // A detail page names the tag's instance: the second library of a
      // multi-instance run reuses the test library's ids, so a bare id can
      // match a tag on each instance (the ambiguous-lookup 400)
      const instanceId = await findTestInstanceId();
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          ids: [`${TEST_ENTITIES.tagWithEntities}:${instanceId}`],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags.tags).toHaveLength(1);
      const tag = must(response.data.findTags.tags[0]);
      expect(tag.id).toBe(TEST_ENTITIES.tagWithEntities);
      expect(tag.instanceId).toBe(instanceId);
    });
  });

  describe("combined tag filters", () => {
    it("combines tag filter with other scene filters", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
            favorite: false,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("combines tag INCLUDES with tag EXCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("tag count filter on scenes", () => {
    it("filters scenes by tag_count", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            tag_count: {
              value: 1,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes with IS_NULL for tags", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            tag_count: {
              value: 0,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });
});

/**
 * Tag parents and children with depth, and the tag counts, on seeded tags
 * under two made-up instances reusing the same ids (invariant 7). The
 * viewer hid some tags, scenes and clips (invariant 3, lead decision 4);
 * another user hid nothing (invariant 6).
 *
 * th-a: R (7898001) > C1 (7898002) > G1 (7898003) > GG (7898004); R's other
 *   children H (7898005, hidden) and D (7898008, deleted); L (7898006),
 *   whose only child HC (7898007) is hidden; X (7898009), whose only parent
 *   HP (7898010) is hidden.
 * th-b: R (7898001) > C1 (7898002).
 * Clips (markers) on th-a scene 7898301: K1 (C1 primary), K2 (R primary,
 *   C1 in its tags), K3 (C1 primary and in its tags), K6 (C1, hidden),
 *   K5 (C1, deleted); on the hidden scene 7898302 K4 (C1). On th-b scene
 *   7898301: K1 (C1 primary).
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Tag parents, children and counts (seeded)", () => {
  const A = "th-a";
  const B = "th-b";
  const VIEWER = "th-viewer";
  const OTHER = "th-other";
  let viewerId = 0;
  let otherId = 0;

  const [R, C1, G1, GG, H, L, HC, D, X, HP] = [
    "7898001",
    "7898002",
    "7898003",
    "7898004",
    "7898005",
    "7898006",
    "7898007",
    "7898008",
    "7898009",
    "7898010",
  ];
  const [S1, S2] = ["7898301", "7898302"];
  const key = (id: string, instance: string) => `${id}:${instance}`;
  /** Every tag the viewer can see */
  const VISIBLE = [
    key(R, A),
    key(C1, A),
    key(G1, A),
    key(GG, A),
    key(L, A),
    key(X, A),
    key(R, B),
    key(C1, B),
  ].sort();
  const without = (...keys: string[]) =>
    VISIBLE.filter((k) => !keys.includes(k));

  async function removeRows(): Promise<void> {
    const where = { stashInstanceId: { in: [A, B] } };
    await prisma.stashScene.deleteMany({ where });
    await prisma.stashTag.deleteMany({ where });
    await prisma.user.deleteMany({
      where: { username: { in: [VIEWER, OTHER] } },
    });
  }

  /** The tags a wire `tag_filter` lists, as sorted keys */
  async function listed(
    filter: Record<string, unknown>,
    userId = viewerId
  ): Promise<string[]> {
    const request = parseListRequest(
      "tag",
      { filter: { per_page: 100 }, tag_filter: filter },
      { userId }
    );
    const { items, total } = await tagQueryBuilder.execute({
      userId,
      allowedInstanceIds: [A, B],
      request,
    });
    expect(total).toBe(items.length);
    return items.map((t) => key(t.id, t.instanceId)).sort();
  }

  beforeAll(async () => {
    await removeRows();
    const user = async (username: string) =>
      (
        await prisma.user.create({
          data: { username, password: "not-a-real-hash", role: "USER" },
        })
      ).id;
    viewerId = await user(VIEWER);
    otherId = await user(OTHER);

    const tag = (
      id: string,
      instance: string,
      parents: string[] = [],
      extra: {
        deletedAt?: Date;
        imageCount?: number;
        galleryCount?: number;
      } = {}
    ) => ({
      id,
      stashInstanceId: instance,
      name: `TH tag ${id} ${instance}`,
      parentIds: JSON.stringify(parents),
      ...extra,
    });
    await prisma.stashTag.createMany({
      data: [
        tag(R, A, [], { imageCount: 5, galleryCount: 2 }),
        tag(C1, A, [R]),
        tag(G1, A, [C1]),
        tag(GG, A, [G1]),
        tag(H, A, [R]),
        tag(L, A),
        tag(HC, A, [L]),
        tag(D, A, [R], { deletedAt: new Date() }),
        tag(X, A, [HP]),
        tag(HP, A),
        tag(R, B, [], { imageCount: 5 }),
        tag(C1, B, [R]),
      ],
    });
    await prisma.stashScene.createMany({
      data: [
        { id: S1, stashInstanceId: A },
        { id: S2, stashInstanceId: A },
        { id: S1, stashInstanceId: B },
      ],
    });
    const clip = (
      id: string,
      sceneId: string,
      primaryTagId: string,
      inst = A,
      deletedAt: Date | null = null
    ) => ({
      id,
      stashInstanceId: inst,
      sceneId,
      sceneInstanceId: inst,
      seconds: 1,
      primaryTagId,
      primaryTagInstanceId: inst,
      deletedAt,
    });
    await prisma.stashClip.createMany({
      data: [
        clip("7898401", S1, C1),
        clip("7898402", S1, R),
        clip("7898403", S1, C1),
        clip("7898404", S2, C1),
        clip("7898405", S1, C1, A, new Date()),
        clip("7898406", S1, C1),
        clip("7898401", S1, C1, B),
      ],
    });
    const clipTag = (clipId: string, tagId: string) => ({
      clipId,
      clipInstanceId: A,
      tagId,
      tagInstanceId: A,
    });
    await prisma.clipTag.createMany({
      data: [clipTag("7898402", C1), clipTag("7898403", C1)],
    });
    const hidden = (entityType: string, entityId: string, instanceId = A) => ({
      userId: viewerId,
      entityType,
      entityId,
      instanceId,
      reason: "hidden",
    });
    await prisma.userExcludedEntity.createMany({
      data: [
        hidden("tag", H),
        hidden("tag", HC),
        // A legacy every-instance row: HP on th-a and on th-b
        hidden("tag", HP, ""),
        hidden("scene", S2),
        hidden("clip", "7898406"),
      ],
    });
    await prisma.userExcludedContentCount.create({
      data: {
        userId: viewerId,
        entityType: "tag",
        entityId: R,
        instanceId: A,
        images: 2,
      },
    });
  });

  afterAll(removeRows);

  it("tag parents at depth n: the tags under a parent within n+1 levels, a parent on one instance never matching the other's", async () => {
    const r = `${R}:${A}`;
    expect(
      await listed({ parents: { value: [r], modifier: "INCLUDES" } })
    ).toEqual([key(C1, A)]);
    expect(
      await listed({ parents: { value: [r], modifier: "INCLUDES", depth: 1 } })
    ).toEqual([key(C1, A), key(G1, A)].sort());
    expect(
      await listed({ parents: { value: [r], modifier: "INCLUDES", depth: -1 } })
    ).toEqual([key(C1, A), key(G1, A), key(GG, A)].sort());
    // A parent ref 7898001@th-b never matches a th-a tag whose parentIds
    // hold 7898001
    expect(
      await listed({ parents: { value: [`${R}:${B}`], modifier: "INCLUDES" } })
    ).toEqual([key(C1, B)]);
    // A bare id is the tag on every instance
    expect(
      await listed({ parents: { value: [R], modifier: "INCLUDES" } })
    ).toEqual([key(C1, A), key(C1, B)].sort());
    // EXCLUDES keeps the tags with no parents
    expect(
      await listed({ parents: { value: [r], modifier: "EXCLUDES" } })
    ).toEqual(without(key(C1, A)));
    expect(
      await listed({
        parents: {
          value: [`${C1}:${A}`, `${G1}:${A}`],
          modifier: "INCLUDES_ALL",
          depth: -1,
        },
      })
    ).toEqual([key(GG, A)]);
  });

  it("tag children with depth: the tags having the child within depth+1 levels", async () => {
    const gg = `${GG}:${A}`;
    expect(
      await listed({ children: { value: [gg], modifier: "INCLUDES" } })
    ).toEqual([key(G1, A)]);
    expect(
      await listed({
        children: { value: [gg], modifier: "INCLUDES", depth: 1 },
      })
    ).toEqual([key(C1, A), key(G1, A)].sort());
    expect(
      await listed({
        children: { value: [gg], modifier: "INCLUDES", depth: -1 },
      })
    ).toEqual([key(R, A), key(C1, A), key(G1, A)].sort());
    expect(
      await listed({
        children: { value: [`${C1}:${B}`], modifier: "INCLUDES" },
      })
    ).toEqual([key(R, B)]);
    expect(
      await listed({ children: { value: [C1], modifier: "INCLUDES" } })
    ).toEqual([key(R, A), key(R, B)].sort());
    expect(
      await listed({
        children: { value: [`${G1}:${A}`], modifier: "EXCLUDES" },
      })
    ).toEqual(without(key(C1, A)));
    expect(
      await listed({
        children: {
          value: [gg, `${C1}:${A}`],
          modifier: "INCLUDES_ALL",
          depth: -1,
        },
      })
    ).toEqual([key(R, A)]);
  });

  it("a hidden child or parent does not count", async () => {
    // L's only child is hidden; R's child H is hidden and D deleted
    expect(
      await listed({
        children: { value: [`${HC}:${A}`], modifier: "INCLUDES" },
      })
    ).toEqual([]);
    expect(
      await listed({ children: { value: [`${H}:${A}`], modifier: "INCLUDES" } })
    ).toEqual([]);
    expect(
      await listed({ children: { value: [`${D}:${A}`], modifier: "INCLUDES" } })
    ).toEqual([]);
    // Under EXCLUDES a hidden child links nothing either
    expect(
      await listed({
        children: { value: [`${HC}:${A}`], modifier: "EXCLUDES" },
      })
    ).toEqual(VISIBLE);
    // X's only parent is hidden
    expect(
      await listed({ parents: { value: [`${HP}:${A}`], modifier: "INCLUDES" } })
    ).toEqual([]);
    expect(
      await listed({ parents: { value: [`${HP}:${A}`], modifier: "EXCLUDES" } })
    ).toEqual(VISIBLE);
    // Another user hid nothing: H is R's child for them
    expect(
      await listed(
        { children: { value: [`${H}:${A}`], modifier: "INCLUDES" } },
        otherId
      )
    ).toEqual([key(R, A)]);
  });

  it("parent_count and child_count count live, visible tags", async () => {
    expect(
      await listed({ parent_count: { value: 1, modifier: "EQUALS" } })
    ).toEqual([key(C1, A), key(G1, A), key(GG, A), key(C1, B)].sort());
    // X's only parent is hidden
    expect(
      await listed({ parent_count: { value: 0, modifier: "EQUALS" } })
    ).toEqual([key(R, A), key(L, A), key(X, A), key(R, B)].sort());
    // R: C1 (H hidden, D deleted); L: none (HC hidden)
    expect(
      await listed({ child_count: { value: 0, modifier: "EQUALS" } })
    ).toEqual([key(GG, A), key(L, A), key(X, A), key(C1, B)].sort());
    expect(
      await listed({ child_count: { value: 1, modifier: "EQUALS" } })
    ).toEqual([key(R, A), key(C1, A), key(G1, A), key(R, B)].sort());
    expect(
      await listed({ child_count: { value: 1, modifier: "GREATER_THAN" } })
    ).toEqual([]);
    // The other user sees H: R has two children
    expect(
      await listed({ child_count: { value: 2, modifier: "EQUALS" } }, otherId)
    ).toEqual([key(R, A)]);
  });

  it("the stored counts read as the viewer sees them", async () => {
    expect(
      await listed({ image_count: { value: 3, modifier: "EQUALS" } })
    ).toEqual([key(R, A)]);
    expect(
      await listed({ image_count: { value: 5, modifier: "EQUALS" } })
    ).toEqual([key(R, B)]);
    expect(
      await listed({ image_count: { value: 5, modifier: "EQUALS" } }, otherId)
    ).toEqual([key(R, A), key(R, B)].sort());
    expect(
      await listed({ gallery_count: { value: 2, modifier: "EQUALS" } })
    ).toEqual([key(R, A)]);
    for (const field of [
      "performer_count",
      "studio_count",
      "group_count",
    ] as const) {
      expect(
        await listed({ [field]: { value: 0, modifier: "EQUALS" } })
      ).toEqual(VISIBLE);
    }
  });

  it("marker_count counts the live clips the viewer can see, as primary tag or in the clip's tags, each once", async () => {
    // C1 on th-a: K1, K2 and K3 (K3 once); K4's scene, K5 and K6 do not count
    expect(
      await listed({ marker_count: { value: 3, modifier: "EQUALS" } })
    ).toEqual([key(C1, A)]);
    expect(
      await listed({ marker_count: { value: 1, modifier: "EQUALS" } })
    ).toEqual([key(R, A), key(C1, B)].sort());
    // The other user sees K4 and K6 too
    expect(
      await listed({ marker_count: { value: 5, modifier: "EQUALS" } }, otherId)
    ).toEqual([key(C1, A)]);
  });
});

/**
 * The large shape of the parents and children filters: a parent with 2,000
 * children on a made-up instance, so the depth expansion yields 2,001 refs
 * and a children filter names 1,000. Every seeded row is deleted before the
 * file ends.
 */
describeWithDb("Tag parents and children, the large shape (seeded)", () => {
  const C = "th-c";
  const VIEWER = "th-large-viewer";
  const BIG = "7894000";
  const CHILDREN = Array.from({ length: 2000 }, (_, i) => String(7895000 + i));
  let viewerId = 0;

  async function removeRows(): Promise<void> {
    await prisma.stashTag.deleteMany({ where: { stashInstanceId: C } });
    await prisma.user.deleteMany({ where: { username: VIEWER } });
  }

  /** How many tags a wire `tag_filter` matches */
  async function total(filter: Record<string, unknown>): Promise<number> {
    const request = parseListRequest(
      "tag",
      { filter: { per_page: 10 }, tag_filter: filter },
      { userId: viewerId }
    );
    const result = await tagQueryBuilder.execute({
      userId: viewerId,
      allowedInstanceIds: [C],
      request,
    });
    return must(result.total, "the count");
  }

  beforeAll(async () => {
    await removeRows();
    viewerId = (
      await prisma.user.create({
        data: { username: VIEWER, password: "not-a-real-hash", role: "USER" },
      })
    ).id;
    await prisma.stashTag.createMany({
      data: [
        { id: BIG, stashInstanceId: C, name: "TH big", parentIds: "[]" },
        ...CHILDREN.map((id) => ({
          id,
          stashInstanceId: C,
          name: `TH child ${id}`,
          parentIds: JSON.stringify([BIG]),
        })),
      ],
    });
  });

  afterAll(removeRows);

  it("a 2,000-ref expansion runs", async () => {
    const big = `${BIG}:${C}`;
    expect(
      await total({
        parents: { value: [big], modifier: "INCLUDES", depth: -1 },
      })
    ).toBe(2000);
    expect(
      await total({
        parents: { value: [big], modifier: "EXCLUDES", depth: -1 },
      })
    ).toBe(1);
    expect(
      await total({
        parents: { value: [big], modifier: "INCLUDES_ALL", depth: -1 },
      })
    ).toBe(2000);
  });

  it("a children filter naming 1,000 tags runs", async () => {
    expect(
      await total({
        children: {
          value: CHILDREN.slice(0, 1000).map((id) => `${id}:${C}`),
          modifier: "INCLUDES",
        },
      })
    ).toBe(1);
  });
});
