import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { must } from "../../tests/helpers/must.js";
import { parseListRequest } from "../../utils/listRequest.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { adminClient, findTestInstanceId } from "../helpers/testClient.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Group Filters Integration Tests
 *
 * Tests group/collection-specific filters:
 * - favorite filter
 * - tags filter (INCLUDES, INCLUDES_ALL, EXCLUDES)
 * - performers filter (groups containing scenes with performer)
 * - studios filter
 * - rating100 filter
 * - scene_count filter
 * - name text search
 * - synopsis and director text filters
 * - the viewer's O count and plays, favourite performers, the tag count
 *   (seeded)
 */

interface FindGroupsResponse {
  findGroups: {
    groups: Array<{
      id: string;
      instanceId: string;
      name: string;
      synopsis?: string | null;
      director?: string | null;
      favorite?: boolean;
      rating100?: number | null;
      scene_count?: number;
      o_counter?: number;
      play_count?: number;
      studio?: { id: string; name: string } | null;
      tags?: Array<{ id: string; name?: string }>;
    }>;
    count: number;
  };
}

describe("Group Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("favorite filter", () => {
    it("filters favorite groups", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            favorite: true,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      for (const group of response.data.findGroups.groups) {
        expect(group.favorite).toBe(true);
      }
    });

    it("filters non-favorite groups", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            favorite: false,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("tags filter", () => {
    it("filters groups by tag with INCLUDES", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters groups by tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters groups by multiple tags with INCLUDES_ALL", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
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
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("scenes filter", () => {
    it("filters groups containing specific scene with INCLUDES", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            scenes: {
              value: [TEST_ENTITIES.sceneInGroup],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      // The group should be in the results
      const groupIds = response.data.findGroups.groups.map((g) => g.id);
      expect(groupIds).toContain(TEST_ENTITIES.groupWithScenes);
    });

    it("filters groups excluding specific scene with EXCLUDES", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            scenes: {
              value: [TEST_ENTITIES.sceneInGroup],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      // The group should NOT be in the results
      const groupIds = response.data.findGroups.groups.map((g) => g.id);
      expect(groupIds).not.toContain(TEST_ENTITIES.groupWithScenes);
    });
  });

  describe("performers filter", () => {
    it("filters groups containing scenes with performer", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            performers: {
              value: [TEST_ENTITIES.performerWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("studios filter", () => {
    it("filters groups by studio", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            studios: {
              value: [TEST_ENTITIES.studioWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            rating100: {
              value: 70,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            rating100: {
              value: 50,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            rating100: {
              value: 50,
              value2: 80,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("synopsis and director filters", () => {
    type Group = FindGroupsResponse["findGroups"]["groups"][number];

    const listed = async (groupFilter: Record<string, unknown>) => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        { filter: { per_page: 250 }, group_filter: groupFilter }
      );
      expect(response.ok).toBe(true);
      return response.data.findGroups;
    };
    const keys = (groups: readonly Group[]) =>
      groups.map((g) => `${g.id}:${g.instanceId}`).sort();

    /** A group holding the field, and the library's groups without it */
    async function subjects(field: "synopsis" | "director") {
      const all = await listed({});
      const holder = must(
        all.groups.find((g) => (g[field] ?? "") !== ""),
        `a group with a ${field}`
      );
      const without = all.groups.filter((g) => (g[field] ?? "") === "");
      expect(without.length, `a group without a ${field}`).toBeGreaterThan(0);
      return { all, text: must(holder[field]), holder, without };
    }

    it("synopsis INCLUDES lists only groups whose synopsis holds the text", async () => {
      const { text, holder, without } = await subjects("synopsis");
      const needle = text.slice(0, -2).toUpperCase();

      const { groups, count } = await listed({
        synopsis: { value: needle, modifier: "INCLUDES" },
      });

      expect(count).toBe(groups.length);
      expect(keys(groups)).toContain(`${holder.id}:${holder.instanceId}`);
      expect(
        groups.filter((g) => !(g.synopsis ?? "").toUpperCase().includes(needle))
      ).toEqual([]);
      const listedKeys = keys(groups);
      expect(keys(without).filter((key) => listedKeys.includes(key))).toEqual(
        []
      );
    });

    it("director EQUALS lists only groups with that director", async () => {
      const { text } = await subjects("director");

      const { groups } = await listed({
        director: { value: text.toLowerCase(), modifier: "EQUALS" },
      });

      expect(groups.length).toBeGreaterThan(0);
      expect(
        groups.filter(
          (g) => (g.director ?? "").toLowerCase() !== text.toLowerCase()
        )
      ).toEqual([]);
    });

    it("director IS_NULL lists the groups without one, and NOT_NULL the rest", async () => {
      const { all, without } = await subjects("director");

      const missing = await listed({ director: { modifier: "IS_NULL" } });
      const present = await listed({ director: { modifier: "NOT_NULL" } });

      expect(keys(missing.groups)).toEqual(keys(without));
      expect(missing.count + present.count).toBe(all.count);
    });
  });

  describe("scene_count filter", () => {
    it("filters groups with many scenes", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            scene_count: {
              value: 10,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters groups with few scenes", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            scene_count: {
              value: 5,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters groups with scene_count BETWEEN", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            scene_count: {
              value: 5,
              value2: 50,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("text search (q parameter)", () => {
    it("searches groups by name", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 50,
            q: "a",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("combined filters", () => {
    it("combines favorite and scene_count filters", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            favorite: true,
            scene_count: {
              value: 5,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      for (const group of response.data.findGroups.groups) {
        expect(group.favorite).toBe(true);
      }
    });

    it("combines rating and tags filters", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
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
      expect(response.data.findGroups).toBeDefined();
    });

    it("combines studio and performer filters", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            studios: {
              value: [TEST_ENTITIES.studioWithScenes],
              modifier: "INCLUDES",
            },
            performers: {
              value: [TEST_ENTITIES.performerWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("sorting", () => {
    it("sorts groups by name ASC", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 50,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("sorts groups by scene_count DESC", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 50,
            sort: "scene_count",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("sorts groups by rating100 DESC", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 50,
            sort: "rating100",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("group by ID", () => {
    it("returns group by ID with details", async () => {
      // A detail page names the entity's instance: the second library
      // reuses the test library's ids, so a bare id can match one on each
      // instance (the ambiguous-lookup 400)
      const instanceId = await findTestInstanceId();
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          ids: [`${TEST_ENTITIES.groupWithScenes}:${instanceId}`],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups.groups).toHaveLength(1);
      const group = must(response.data.findGroups.groups[0]);
      expect(group.id).toBe(TEST_ENTITIES.groupWithScenes);
      expect(group.instanceId).toBe(instanceId);
    });
  });
});

/**
 * The collection's O count and plays (the viewer's, over its visible
 * scenes), favourite performers and tag count, on seeded rows under two
 * made-up instances reusing the same ids (invariant 7). The viewer hid GH,
 * scene S2, performer P2 and tag T2 (invariant 3, lead decision 4); another
 * user hid nothing and has their own plays and favourites (invariant 6).
 *
 * gf2-a: G1 (7741001) holds S1 (7742001) and S3 (7742003, deleted); G2
 *   (7741002) holds S1; G3 (7741003) holds S4 (7742004); G4 (7741004)
 *   holds S2 (7742002, hidden); GH (7741005, hidden) holds S1. S1 has P1
 *   (7743001), S2 has P3 (7743003), S3 has P1, S4 has P2 (7743002,
 *   hidden). G1 holds tags T1 (7744001), T2 (7744002, hidden) and T3
 *   (7744003, deleted); G2 holds T2.
 * gf2-b: G1 holds S1, which has P1; G1 holds T1.
 */
describeWithDb(
  "Collection O count, plays, favourites and tags (seeded)",
  () => {
    const A = "gf2-a";
    const B = "gf2-b";
    const VIEWER = "gf2-viewer";
    const OTHER = "gf2-other";
    let viewerId = 0;
    let otherId = 0;

    const [G1, G2, G3, G4, GH] = [
      "7741001",
      "7741002",
      "7741003",
      "7741004",
      "7741005",
    ];
    const [S1, S2, S3, S4] = ["7742001", "7742002", "7742003", "7742004"];
    const [P1, P2, P3] = ["7743001", "7743002", "7743003"];
    const [T1, T2, T3] = ["7744001", "7744002", "7744003"];
    const k = (id: string, instance = A) => `${id}:${instance}`;

    async function removeRows(): Promise<void> {
      const where = { stashInstanceId: { in: [A, B] } };
      // Junction rows cascade from their entities; the users' rows from them
      await prisma.stashGroup.deleteMany({ where });
      await prisma.stashScene.deleteMany({ where });
      await prisma.stashPerformer.deleteMany({ where });
      await prisma.stashTag.deleteMany({ where });
      await prisma.user.deleteMany({
        where: { username: { in: [VIEWER, OTHER] } },
      });
    }

    /** The collections a wire `group_filter` lists, as sorted keys */
    async function listed(
      filter: Record<string, unknown>,
      userId = viewerId
    ): Promise<string[]> {
      const request = parseListRequest(
        "group",
        { filter: { per_page: 100 }, group_filter: filter },
        { userId }
      );
      const { items, total } = await groupQueryBuilder.execute({
        userId,
        allowedInstanceIds: [A, B],
        request,
      });
      expect(total).toBe(items.length);
      return items.map((g) => k(g.id, g.instanceId)).sort();
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

      const named =
        (prefix: string) =>
        (id: string, instance = A) => ({
          id,
          stashInstanceId: instance,
          name: `GF2 ${prefix} ${id} ${instance}`,
        });
      const group = named("group");
      const performer = named("performer");
      const tag = named("tag");
      const deleted = { deletedAt: new Date() };
      await prisma.stashGroup.createMany({
        data: [G1, G2, G3, G4, GH].map((id) => group(id)).concat(group(G1, B)),
      });
      await prisma.stashScene.createMany({
        data: [
          { id: S1, stashInstanceId: A },
          { id: S2, stashInstanceId: A },
          { id: S3, stashInstanceId: A, ...deleted },
          { id: S4, stashInstanceId: A },
          { id: S1, stashInstanceId: B },
        ],
      });
      await prisma.stashPerformer.createMany({
        data: [performer(P1), performer(P2), performer(P3), performer(P1, B)],
      });
      await prisma.stashTag.createMany({
        data: [tag(T1), tag(T2), { ...tag(T3), ...deleted }, tag(T1, B)],
      });
      const sceneGroup = (groupId: string, sceneId: string, inst = A) => ({
        sceneId,
        sceneInstanceId: inst,
        groupId,
        groupInstanceId: inst,
      });
      await prisma.sceneGroup.createMany({
        data: [
          sceneGroup(G1, S1),
          sceneGroup(G1, S3),
          sceneGroup(G2, S1),
          sceneGroup(G3, S4),
          sceneGroup(G4, S2),
          sceneGroup(GH, S1),
          sceneGroup(G1, S1, B),
        ],
      });
      const scenePerformer = (
        sceneId: string,
        performerId: string,
        inst = A
      ) => ({
        sceneId,
        sceneInstanceId: inst,
        performerId,
        performerInstanceId: inst,
      });
      await prisma.scenePerformer.createMany({
        data: [
          scenePerformer(S1, P1),
          scenePerformer(S2, P3),
          scenePerformer(S3, P1),
          scenePerformer(S4, P2),
          scenePerformer(S1, P1, B),
        ],
      });
      const groupTag = (groupId: string, tagId: string, inst = A) => ({
        groupId,
        groupInstanceId: inst,
        tagId,
        tagInstanceId: inst,
      });
      await prisma.groupTag.createMany({
        data: [
          groupTag(G1, T1),
          groupTag(G1, T2),
          groupTag(G1, T3),
          groupTag(G2, T2),
          groupTag(G1, T1, B),
        ],
      });
      const played = (
        userId: number,
        sceneId: string,
        oCount: number,
        playCount: number,
        instanceId = A
      ) => ({ userId, instanceId, sceneId, oCount, playCount });
      await prisma.watchHistory.createMany({
        data: [
          played(viewerId, S1, 2, 3),
          played(viewerId, S2, 5, 7),
          played(viewerId, S3, 11, 13),
          played(viewerId, S1, 1, 1, B),
          played(otherId, S1, 100, 100),
          played(otherId, S4, 9, 9),
        ],
      });
      const favourite = (
        userId: number,
        performerId: string,
        instanceId = A
      ) => ({
        userId,
        instanceId,
        performerId,
        favorite: true,
      });
      await prisma.performerRating.createMany({
        data: [
          favourite(viewerId, P1),
          favourite(viewerId, P2),
          favourite(viewerId, P3),
          favourite(otherId, P1, B),
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
        data: [
          hidden("group", GH),
          hidden("scene", S2),
          hidden("performer", P2),
          hidden("tag", T2),
        ],
      });
    });

    afterAll(removeRows);

    it("o_counter sums only the viewer's rows, over the collection's live scenes they can see", async () => {
      expect(
        await listed({ o_counter: { value: 2, modifier: "EQUALS" } })
      ).toEqual([k(G1), k(G2)].sort());
      expect(
        await listed({ o_counter: { value: 0, modifier: "GREATER_THAN" } })
      ).toEqual([k(G1), k(G2), k(G1, B)].sort());
      // G4's only scene is hidden, G3's unplayed by the viewer
      expect(
        await listed({ o_counter: { value: 0, modifier: "EQUALS" } })
      ).toEqual([k(G3), k(G4)].sort());
      // A second user's O count is not added
      expect(
        await listed({ o_counter: { value: 50, modifier: "GREATER_THAN" } })
      ).toEqual([]);
      expect(
        await listed({ o_counter: { value: 100, modifier: "EQUALS" } }, otherId)
      ).toEqual([k(G1), k(G2), k(GH)].sort());
    });

    it("play_count sums only the viewer's rows", async () => {
      expect(
        await listed({ play_count: { value: 3, modifier: "EQUALS" } })
      ).toEqual([k(G1), k(G2)].sort());
      expect(
        await listed({
          play_count: { value: 1, value2: 3, modifier: "BETWEEN" },
        })
      ).toEqual([k(G1), k(G2), k(G1, B)].sort());
      expect(
        await listed({ play_count: { value: 3, modifier: "GREATER_THAN" } })
      ).toEqual([]);
      expect(
        await listed({ play_count: { value: 9, modifier: "EQUALS" } }, otherId)
      ).toEqual([k(G3)]);
    });

    it("performer_favorite: a favourite performer in a visible scene, the favourite on the scene's own instance", async () => {
      // P2 is hidden and S2 is hidden; P1 on gf2-b is not the viewer's
      expect(await listed({ performer_favorite: true })).toEqual(
        [k(G1), k(G2)].sort()
      );
      expect(await listed({ performer_favorite: false })).toEqual(
        [k(G3), k(G4), k(G1, B)].sort()
      );
      expect(await listed({ performer_favorite: true }, otherId)).toEqual([
        k(G1, B),
      ]);
      expect(await listed({ performer_favorite: false }, otherId)).toEqual(
        [k(G1), k(G2), k(G3), k(G4), k(GH)].sort()
      );
    });

    it("tag_count counts the live tags the viewer can see", async () => {
      expect(
        await listed({ tag_count: { value: 1, modifier: "EQUALS" } })
      ).toEqual([k(G1), k(G1, B)].sort());
      expect(
        await listed({ tag_count: { value: 0, modifier: "EQUALS" } })
      ).toEqual([k(G2), k(G3), k(G4)].sort());
      expect(
        await listed({ tag_count: { value: 2, modifier: "EQUALS" } }, otherId)
      ).toEqual([k(G1)]);
    });
  }
);

/**
 * Collection parity (F15): Stash's aliases text (one phrase) and the links
 * (one at a time). Sent over the wire parser into the builder for a viewer
 * of their own, as the list route does.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do:
 * - gp-a collections: 7902001 (aliases "Old Name, Other", two links),
 *   7902002 (nothing set, links `[]`), 7902003 (aliases ""), 7902004 (hidden
 *   by the viewer, matching everything 7902001 matches).
 * - gp-b collection 7902001 (aliases "Zulu", a link).
 * - Studios: gp-a 7902002's is live, gp-a 7902003's is hidden by the viewer
 *   (a studio hide does not cascade to collections), gp-b 7902001's is
 *   deleted.
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Collection parity filters (seeded)", () => {
  const A = "gp-a";
  const B = "gp-b";
  const VIEWER = "gp-viewer";
  let viewerId = 0;

  const [G1, G2, G3, GH] = ["7902001", "7902002", "7902003", "7902004"];
  const [S_LIVE, S_HIDDEN, S_DELETED] = ["7902101", "7902102", "7902103"];
  const k = (id: string, instance: string) => `${id}:${instance}`;
  /** Every collection the viewer can see */
  const VISIBLE = [k(G1, A), k(G2, A), k(G3, A), k(G1, B)].sort();
  const without = (...keys: string[]) =>
    VISIBLE.filter((key) => !keys.includes(key));

  async function removeRows(): Promise<void> {
    await prisma.stashGroup.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.stashStudio.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.user.deleteMany({ where: { username: VIEWER } });
  }

  async function listed(filter: Record<string, unknown>): Promise<string[]> {
    const request = parseListRequest(
      "group",
      { filter: { per_page: 100 }, group_filter: filter },
      { userId: viewerId }
    );
    const { items, total } = await groupQueryBuilder.execute({
      userId: viewerId,
      allowedInstanceIds: [A, B],
      request,
    });
    expect(total).toBe(items.length);
    return items.map((g) => k(g.id, g.instanceId)).sort();
  }

  beforeAll(async () => {
    await removeRows();
    viewerId = (
      await prisma.user.create({
        data: { username: VIEWER, password: "not-a-real-hash", role: "USER" },
      })
    ).id;
    const group = (
      id: string,
      instance: string,
      extra: Record<string, unknown> = {}
    ) => ({
      id,
      stashInstanceId: instance,
      name: `GP ${id} ${instance}`,
      ...extra,
    });
    const links = JSON.stringify([
      "https://example.com/gp-one",
      "https://social.example/gp",
    ]);
    await prisma.stashGroup.createMany({
      data: [
        group(G1, A, { aliases: "Old Name, Other", urls: links }),
        group(G2, A, { urls: "[]", studioId: S_LIVE }),
        group(G3, A, { aliases: "", studioId: S_HIDDEN }),
        group(GH, A, { aliases: "Old Name, Other", urls: links }),
        group(G1, B, {
          aliases: "Zulu",
          urls: JSON.stringify(["https://zulu.example/gp"]),
          studioId: S_DELETED,
        }),
      ],
    });
    await prisma.stashStudio.createMany({
      data: [
        { id: S_LIVE, stashInstanceId: A, name: "GP live studio" },
        { id: S_HIDDEN, stashInstanceId: A, name: "GP hidden studio" },
        {
          id: S_DELETED,
          stashInstanceId: B,
          name: "GP deleted studio",
          deletedAt: new Date(),
        },
      ],
    });
    await prisma.userExcludedEntity.createMany({
      data: [
        {
          userId: viewerId,
          entityType: "group",
          entityId: GH,
          instanceId: A,
          reason: "hidden",
        },
        {
          userId: viewerId,
          entityType: "studio",
          entityId: S_HIDDEN,
          instanceId: A,
          reason: "hidden",
        },
      ],
    });
  });

  afterAll(removeRows);

  it("aliases match Stash's text as one phrase, IS_NULL lists the collections with none", async () => {
    expect(
      await listed({ aliases: { value: "name, oth", modifier: "INCLUDES" } })
    ).toEqual([k(G1, A)]);
    // One phrase: the words are not split
    expect(
      await listed({ aliases: { value: "other old", modifier: "INCLUDES" } })
    ).toEqual([]);
    expect(
      await listed({
        aliases: { value: "old name, other", modifier: "EQUALS" },
      })
    ).toEqual([k(G1, A)]);
    expect(await listed({ aliases: { modifier: "IS_NULL" } })).toEqual(
      [k(G2, A), k(G3, A)].sort()
    );
    expect(await listed({ aliases: { modifier: "NOT_NULL" } })).toEqual(
      [k(G1, A), k(G1, B)].sort()
    );
  });

  it("an alias on one instance never matches the other's collection of the same id", async () => {
    expect(
      await listed({ aliases: { value: "zulu", modifier: "INCLUDES" } })
    ).toEqual([k(G1, B)]);
  });

  it("a collection the viewer hid is never listed by its alias or link, in any form", async () => {
    expect(
      await listed({ aliases: { value: "other", modifier: "INCLUDES" } })
    ).not.toContain(k(GH, A));
    expect(
      await listed({ aliases: { value: "other", modifier: "EXCLUDES" } })
    ).toEqual(without(k(G1, A)));
    expect(await listed({ url: { modifier: "NOT_NULL" } })).not.toContain(
      k(GH, A)
    );
  });

  it("url matches any one of the collection's links", async () => {
    expect(
      await listed({ url: { value: "social.example", modifier: "INCLUDES" } })
    ).toEqual([k(G1, A)]);
    // A link's JSON punctuation is never matched
    expect(
      await listed({ url: { value: '","', modifier: "INCLUDES" } })
    ).toEqual([]);
    expect(
      await listed({ url: { value: "example.com", modifier: "EXCLUDES" } })
    ).toEqual(without(k(G1, A)));
    expect(await listed({ url: { modifier: "NOT_NULL" } })).toEqual(
      [k(G1, A), k(G1, B)].sort()
    );
    expect(await listed({ url: { modifier: "IS_NULL" } })).toEqual(
      [k(G2, A), k(G3, A)].sort()
    );
  });

  it("Studio has any counts only a live studio the viewer can see; has none the rest", async () => {
    expect(await listed({ studios: { modifier: "NOT_NULL" } })).toEqual([
      k(G2, A),
    ]);
    expect(await listed({ studios: { modifier: "IS_NULL" } })).toEqual(
      without(k(G2, A))
    );
  });
});
