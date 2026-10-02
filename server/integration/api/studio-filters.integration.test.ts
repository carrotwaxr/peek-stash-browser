import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { parseListRequest } from "../../utils/listRequest.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  adminClient,
  restoreInstanceSelection,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

/**
 * Studio Filters Integration Tests
 *
 * Tests studio-specific filters:
 * - favorite filter
 * - tags filter (INCLUDES, INCLUDES_ALL, EXCLUDES)
 * - rating100 filter
 * - o_counter filter
 * - play_count filter
 * - scene_count filter
 * - name text search
 * - parent/child studio relationships
 * - parents with depth, child and tag counts, stored counts (seeded)
 */

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

interface FindStudiosResponse {
  findStudios: {
    studios: Array<{
      id: string;
      name: string;
      favorite?: boolean;
      rating100?: number | null;
      scene_count?: number;
      o_counter?: number;
      play_count?: number;
      parent_studio?: { id: string; name: string } | null;
      child_studios?: Array<{ id: string; name: string }>;
      tags?: Array<{ id: string; name?: string }>;
    }>;
    count: number;
  };
}

describe("Studio Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // Select only test instance to avoid ID collisions with other instances
    await selectTestInstanceOnly();
  });

  afterAll(restoreInstanceSelection);

  describe("favorite filter", () => {
    it("filters favorite studios", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            favorite: true,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();

      for (const studio of response.data.findStudios.studios) {
        expect(studio.favorite).toBe(true);
      }
    });

    it("filters non-favorite studios", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            favorite: false,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("tags filter", () => {
    it("filters studios by tag with INCLUDES", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters studios by tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            rating100: {
              value: 70,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            rating100: {
              value: 50,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            rating100: {
              value: 50,
              value2: 80,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("o_counter filter", () => {
    it("filters by o_counter GREATER_THAN", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            o_counter: {
              value: 0,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters by o_counter EQUALS zero", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            o_counter: {
              value: 0,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("play_count filter", () => {
    it("filters by play_count GREATER_THAN (watched studios)", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            play_count: {
              value: 0,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters by play_count EQUALS zero (unwatched studios)", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            play_count: {
              value: 0,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("scene_count filter", () => {
    it("filters studios with many scenes", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            scene_count: {
              value: 10,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters studios with few scenes", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            scene_count: {
              value: 5,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters studios with scene_count BETWEEN", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            scene_count: {
              value: 5,
              value2: 50,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("name filter", () => {
    it("filters studios by name text search", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            name: {
              value: "a",
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("text search (q parameter)", () => {
    it("searches studios by name", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: {
            per_page: 50,
            q: "a",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("combined filters", () => {
    it("combines favorite and scene_count filters", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            favorite: true,
            scene_count: {
              value: 5,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();

      for (const studio of response.data.findStudios.studios) {
        expect(studio.favorite).toBe(true);
      }
    });

    it("combines rating and tags filters", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            rating100: {
              value: 60,
              modifier: "GREATER_THAN",
            },
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("sorting", () => {
    it("sorts studios by name ASC", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: {
            per_page: 50,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("sorts studios by scene_count DESC", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: {
            per_page: 50,
            sort: "scene_count",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("sorts studios by rating100 DESC", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: {
            per_page: 50,
            sort: "rating100",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("studio by ID", () => {
    it("returns studio by ID with details", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          ids: [TEST_ENTITIES.studioWithScenes],
        }
      );

      expect(response.ok).toBe(true);
      // With multi-instance, same ID can exist in multiple instances
      expect(response.data.findStudios.studios.length).toBeGreaterThanOrEqual(
        1
      );
      // Verify at least one result has the expected ID
      const matchingStudio = response.data.findStudios.studios.find(
        (s) => s.id === TEST_ENTITIES.studioWithScenes
      );
      expect(matchingStudio).toBeDefined();
    });
  });
});

/**
 * Studio parents with depth and the studio counts, on seeded studios under
 * two made-up instances reusing the same ids (invariant 7). The viewer hid
 * some studios and a tag (invariant 3, lead decision 4); another user hid
 * nothing (invariant 6).
 *
 * sh-a: S0 (7897001) > S1 (7897002) > S2 (7897003) > S3 (7897004); S0's
 *   other children SH (7897005, hidden) and SD (7897006, deleted); SX
 *   (7897007), whose parent SHP (7897008) is hidden. S0 holds tags T1
 *   (7897101), T2 (7897102, hidden) and T3 (7897103, deleted); S1 holds T2.
 * sh-b: S0 (7897001) > S1 (7897002), S1 holding T1.
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Studio parents and counts (seeded)", () => {
  const A = "sh-a";
  const B = "sh-b";
  const VIEWER = "sh-viewer";
  const OTHER = "sh-other";
  let viewerId = 0;
  let otherId = 0;

  const [S0, S1, S2, S3, SH, SD, SX, SHP] = [
    "7897001",
    "7897002",
    "7897003",
    "7897004",
    "7897005",
    "7897006",
    "7897007",
    "7897008",
  ];
  const [T1, T2, T3] = ["7897101", "7897102", "7897103"];
  const key = (id: string, instance: string) => `${id}:${instance}`;
  /** Every studio the viewer can see */
  const VISIBLE = [
    key(S0, A),
    key(S1, A),
    key(S2, A),
    key(S3, A),
    key(SX, A),
    key(S0, B),
    key(S1, B),
  ].sort();
  const without = (...keys: string[]) =>
    VISIBLE.filter((k) => !keys.includes(k));

  async function removeRows(): Promise<void> {
    const where = { stashInstanceId: { in: [A, B] } };
    await prisma.stashStudio.deleteMany({ where });
    await prisma.stashTag.deleteMany({ where });
    await prisma.user.deleteMany({
      where: { username: { in: [VIEWER, OTHER] } },
    });
  }

  /** The studios a wire `studio_filter` lists, as sorted keys */
  async function listed(
    filter: Record<string, unknown>,
    userId = viewerId
  ): Promise<string[]> {
    const request = parseListRequest(
      "studio",
      { filter: { per_page: 100 }, studio_filter: filter },
      { userId }
    );
    const { items, total } = await studioQueryBuilder.execute({
      userId,
      allowedInstanceIds: [A, B],
      request,
    });
    expect(total).toBe(items.length);
    return items.map((s) => key(s.id, s.instanceId)).sort();
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

    const studio = (
      id: string,
      instance: string,
      parentId: string | null = null,
      extra: { deletedAt?: Date; imageCount?: number; groupCount?: number } = {}
    ) => ({
      id,
      stashInstanceId: instance,
      name: `SH studio ${id} ${instance}`,
      parentId,
      ...extra,
    });
    await prisma.stashStudio.createMany({
      data: [
        studio(S0, A, null, { imageCount: 4, groupCount: 1 }),
        studio(S1, A, S0),
        studio(S2, A, S1),
        studio(S3, A, S2),
        studio(SH, A, S0),
        studio(SD, A, S0, { deletedAt: new Date() }),
        studio(SX, A, SHP),
        studio(SHP, A),
        studio(S0, B),
        studio(S1, B, S0, { imageCount: 4 }),
      ],
    });
    await prisma.stashTag.createMany({
      data: [
        { id: T1, stashInstanceId: A, name: "SH tag 1" },
        { id: T2, stashInstanceId: A, name: "SH tag 2" },
        { id: T3, stashInstanceId: A, name: "SH tag 3", deletedAt: new Date() },
        { id: T1, stashInstanceId: B, name: "SH tag 1 b" },
      ],
    });
    const studioTag = (studioId: string, tagId: string, inst = A) => ({
      studioId,
      studioInstanceId: inst,
      tagId,
      tagInstanceId: inst,
    });
    await prisma.studioTag.createMany({
      data: [
        studioTag(S0, T1),
        studioTag(S0, T2),
        studioTag(S0, T3),
        studioTag(S1, T2),
        studioTag(S1, T1, B),
      ],
    });
    const hidden = (entityType: string, entityId: string) => ({
      userId: viewerId,
      entityType,
      entityId,
      instanceId: A,
      reason: "hidden",
    });
    await prisma.userExcludedEntity.createMany({
      data: [hidden("studio", SH), hidden("studio", SHP), hidden("tag", T2)],
    });
    await prisma.userExcludedContentCount.create({
      data: {
        userId: viewerId,
        entityType: "studio",
        entityId: S0,
        instanceId: A,
        images: 1,
      },
    });
  });

  afterAll(removeRows);

  it("parents X at depth -1 lists every studio under X; a parent on one instance never matches the other's", async () => {
    const s0 = `${S0}:${A}`;
    expect(
      await listed({
        parents: { value: [s0], modifier: "INCLUDES", depth: -1 },
      })
    ).toEqual([key(S1, A), key(S2, A), key(S3, A)].sort());
    expect(
      await listed({ parents: { value: [s0], modifier: "INCLUDES" } })
    ).toEqual([key(S1, A)]);
    expect(
      await listed({ parents: { value: [`${S0}:${B}`], modifier: "INCLUDES" } })
    ).toEqual([key(S1, B)]);
    expect(
      await listed({ parents: { value: [S0], modifier: "INCLUDES" } })
    ).toEqual([key(S1, A), key(S1, B)].sort());
    // EXCLUDES keeps the studios with no parent
    expect(
      await listed({
        parents: { value: [s0], modifier: "EXCLUDES", depth: -1 },
      })
    ).toEqual(without(key(S1, A), key(S2, A), key(S3, A)));
    expect(
      await listed({
        parents: {
          value: [`${S1}:${A}`, `${S2}:${A}`],
          modifier: "INCLUDES_ALL",
          depth: -1,
        },
      })
    ).toEqual([key(S3, A)]);
  });

  it("a hidden parent links nothing, in every form", async () => {
    expect(
      await listed({
        parents: { value: [`${SHP}:${A}`], modifier: "INCLUDES" },
      })
    ).toEqual([]);
    expect(
      await listed({
        parents: { value: [`${SHP}:${A}`], modifier: "EXCLUDES" },
      })
    ).toEqual(VISIBLE);
    expect(await listed({ parents: { modifier: "IS_NULL" } })).toEqual(
      [key(S0, A), key(SX, A), key(S0, B)].sort()
    );
    expect(await listed({ parents: { modifier: "NOT_NULL" } })).toEqual(
      [key(S1, A), key(S2, A), key(S3, A), key(S1, B)].sort()
    );
    // Another user hid nothing: SX has a parent for them
    expect(
      await listed({ parents: { modifier: "NOT_NULL" } }, otherId)
    ).toEqual(
      [
        key(S1, A),
        key(S2, A),
        key(S3, A),
        key(SH, A),
        key(SX, A),
        key(S1, B),
      ].sort()
    );
  });

  it("child_count 0 lists the studios with no visible children", async () => {
    expect(
      await listed({ child_count: { value: 0, modifier: "EQUALS" } })
    ).toEqual([key(S3, A), key(SX, A), key(S1, B)].sort());
    // S0 on sh-a: S1 (SH hidden, SD deleted)
    expect(
      await listed({ child_count: { value: 1, modifier: "EQUALS" } })
    ).toEqual([key(S0, A), key(S1, A), key(S2, A), key(S0, B)].sort());
    expect(
      await listed({ child_count: { value: 2, modifier: "EQUALS" } }, otherId)
    ).toEqual([key(S0, A)]);
  });

  it("tag_count counts the live tags the viewer can see", async () => {
    expect(
      await listed({ tag_count: { value: 1, modifier: "EQUALS" } })
    ).toEqual([key(S0, A), key(S1, B)].sort());
    expect(
      await listed({ tag_count: { value: 0, modifier: "EQUALS" } })
    ).toEqual(without(key(S0, A), key(S1, B)));
    expect(
      await listed({ tag_count: { value: 2, modifier: "EQUALS" } }, otherId)
    ).toEqual([key(S0, A)]);
  });

  it("count filters read the visible counts the sorts use", async () => {
    expect(
      await listed({ image_count: { value: 3, modifier: "EQUALS" } })
    ).toEqual([key(S0, A)]);
    expect(
      await listed({ image_count: { value: 4, modifier: "EQUALS" } })
    ).toEqual([key(S1, B)]);
    expect(
      await listed({ image_count: { value: 4, modifier: "EQUALS" } }, otherId)
    ).toEqual([key(S0, A), key(S1, B)].sort());
    expect(
      await listed({ group_count: { value: 1, modifier: "EQUALS" } })
    ).toEqual([key(S0, A)]);
    for (const field of ["gallery_count", "performer_count"] as const) {
      expect(
        await listed({ [field]: { value: 0, modifier: "EQUALS" } })
      ).toEqual(VISIBLE);
    }
  });
});

/**
 * Studio parity (F15): aliases (one at a time), the website and StashDB ids.
 * Sent over the wire parser into the builder for a viewer of their own, as
 * the list route does.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do:
 * - sp-a studios: 7900001 (aliases "Alpha One" and "A1", a website, a StashDB
 *   id), 7900002 (alias "Beta", `[]` StashDB ids, no website), 7900003
 *   (nothing set), 7900004 (aliases `[]`), 7900005 (hidden by the viewer,
 *   matching everything 7900001 matches).
 * - sp-b studios: 7900001 (alias "Zulu", another StashDB id), 7900002.
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Studio parity filters (seeded)", () => {
  const A = "sp-a";
  const B = "sp-b";
  const VIEWER = "sp-viewer";
  let viewerId = 0;

  const [S1, S2, S3, S4, SH] = [
    "7900001",
    "7900002",
    "7900003",
    "7900004",
    "7900005",
  ];
  const STASHDB = "https://stashdb.org/graphql";
  const key = (id: string, instance: string) => `${id}:${instance}`;
  /** Every studio the viewer can see */
  const VISIBLE = [
    key(S1, A),
    key(S2, A),
    key(S3, A),
    key(S4, A),
    key(S1, B),
    key(S2, B),
  ].sort();
  const without = (...keys: string[]) =>
    VISIBLE.filter((k) => !keys.includes(k));

  async function removeRows(): Promise<void> {
    await prisma.stashStudio.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.user.deleteMany({ where: { username: VIEWER } });
  }

  async function listed(filter: Record<string, unknown>): Promise<string[]> {
    const request = parseListRequest(
      "studio",
      { filter: { per_page: 100 }, studio_filter: filter },
      { userId: viewerId }
    );
    const { items, total } = await studioQueryBuilder.execute({
      userId: viewerId,
      allowedInstanceIds: [A, B],
      request,
    });
    expect(total).toBe(items.length);
    return items.map((s) => key(s.id, s.instanceId)).sort();
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
    const studio = (
      id: string,
      instance: string,
      extra: Record<string, unknown> = {}
    ) => ({
      id,
      stashInstanceId: instance,
      name: `SP ${id} ${instance}`,
      ...extra,
    });
    await prisma.stashStudio.createMany({
      data: [
        studio(S1, A, {
          aliases: JSON.stringify(["Alpha One", "A1"]),
          url: "https://example.com/sp-one",
          stashIds: stashIds("aaaa-1111"),
        }),
        studio(S2, A, { aliases: JSON.stringify(["Beta"]), stashIds: "[]" }),
        studio(S3, A),
        studio(S4, A, { aliases: "[]" }),
        studio(SH, A, {
          aliases: JSON.stringify(["Alpha One", "A1"]),
          url: "https://example.com/sp-one",
          stashIds: stashIds("aaaa-1111"),
        }),
        studio(S1, B, {
          aliases: JSON.stringify(["Zulu"]),
          stashIds: stashIds("bbbb-2222"),
        }),
        studio(S2, B),
      ],
    });
    await prisma.userExcludedEntity.create({
      data: {
        userId: viewerId,
        entityType: "studio",
        entityId: SH,
        instanceId: A,
        reason: "hidden",
      },
    });
  });

  afterAll(removeRows);

  it("aliases match one alias at a time, and IS_NULL lists the studios with none", async () => {
    expect(
      await listed({ aliases: { value: "alpha", modifier: "INCLUDES" } })
    ).toEqual([key(S1, A)]);
    expect(
      await listed({ aliases: { value: "a1", modifier: "EQUALS" } })
    ).toEqual([key(S1, A)]);
    // The list's JSON punctuation is never matched
    expect(
      await listed({ aliases: { value: '","', modifier: "INCLUDES" } })
    ).toEqual([]);
    expect(await listed({ aliases: { modifier: "IS_NULL" } })).toEqual(
      [key(S3, A), key(S4, A), key(S2, B)].sort()
    );
    expect(await listed({ aliases: { modifier: "NOT_NULL" } })).toEqual(
      [key(S1, A), key(S2, A), key(S1, B)].sort()
    );
  });

  it("an alias on one instance never matches the other's studio of the same id", async () => {
    expect(
      await listed({ aliases: { value: "zulu", modifier: "INCLUDES" } })
    ).toEqual([key(S1, B)]);
  });

  it("a studio the viewer hid is never listed by its alias, in any form", async () => {
    expect(
      await listed({ aliases: { value: "alpha", modifier: "INCLUDES" } })
    ).not.toContain(key(SH, A));
    expect(
      await listed({ aliases: { value: "alpha", modifier: "EXCLUDES" } })
    ).toEqual(without(key(S1, A)));
    expect(await listed({ aliases: { modifier: "NOT_NULL" } })).not.toContain(
      key(SH, A)
    );
  });

  it("url matches the studio's website", async () => {
    expect(
      await listed({ url: { value: "example.com/sp", modifier: "INCLUDES" } })
    ).toEqual([key(S1, A)]);
    expect(await listed({ url: { modifier: "NOT_NULL" } })).toEqual([
      key(S1, A),
    ]);
    expect(
      await listed({ url: { value: "example.com", modifier: "EXCLUDES" } })
    ).toEqual(without(key(S1, A)));
  });

  it("stash_id EQUALS a StashDB id on its own instance, IS_NULL and NOT_NULL", async () => {
    expect(
      await listed({ stash_id: { value: "AAAA-1111", modifier: "EQUALS" } })
    ).toEqual([key(S1, A)]);
    expect(
      await listed({ stash_id: { value: "bbbb-2222", modifier: "EQUALS" } })
    ).toEqual([key(S1, B)]);
    expect(await listed({ stash_id: { modifier: "NOT_NULL" } })).toEqual(
      [key(S1, A), key(S1, B)].sort()
    );
    expect(await listed({ stash_id: { modifier: "IS_NULL" } })).toEqual(
      without(key(S1, A), key(S1, B))
    );
  });
});
