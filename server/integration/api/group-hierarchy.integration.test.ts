/**
 * The collection hierarchy on collection pages and cards (item 58).
 *
 * A group's detail request carries the groups containing it (ordered by
 * name) and its sub-groups (in Stash's order), each with the link's
 * description and the other group's instance; every list row carries its
 * sub-group count; the `containing_groups` filter lists the direct sub-groups
 * of the groups it names. All three leave out a group the user cannot see:
 * hidden, restricted, deleted, or empty for a non-admin (a group with no
 * visible scene).
 *
 * The replay cases use the replay's hierarchy around groupWithScenes (G):
 * P contains G ("Box set") and G contains C ("Part 2"), from
 * stash-replay/extend.ts. The test Stash has no sub-groups, so live runs
 * skip them. The last cases seed two made-up instances that reuse the same
 * ids and delete them before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { must } from "../../tests/helpers/must.js";
import { parseListRequest } from "../../utils/listRequest.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  TestClient,
  adminClient,
  restoreInstanceSelection,
  selectAllInstancesForClient,
  selectTestInstanceForClient,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

const REPLAY = process.env.STASH_REPLAY === "1";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

interface GroupRelationRef {
  group: { id: string; name: string; instanceId: string };
  description: string | null;
}

interface GroupRow {
  id: string;
  instanceId: string;
  name: string;
  sub_group_count?: number;
  containing_groups?: GroupRelationRef[];
  sub_groups?: GroupRelationRef[];
}

interface FindGroupsResponse {
  findGroups: { count: number; groups: GroupRow[] };
}

/** A user made for this file, deleted in afterAll */
async function createUser(
  username: string,
  role: "ADMIN" | "USER"
): Promise<{ id: number; client: TestClient }> {
  const password = "group_hierarchy_pass_1";
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) await adminClient.delete(`/api/user/${existing.id}`);
  const created = await adminClient.post<{ user?: { id: number } }>(
    "/api/user/create",
    { username, password, role }
  );
  const id = must(created.data.user, `the created user ${username}`).id;
  const client = new TestClient();
  await client.login(username, password);
  return { id, client };
}

/** The detail request the collection page makes */
async function detail(
  client: TestClient,
  id: string,
  instanceId: string
): Promise<GroupRow[]> {
  const res = await client.post<FindGroupsResponse>("/api/library/groups", {
    ids: [id],
    group_filter: { instance_id: instanceId },
  });
  expect(res.status).toBe(200);
  return res.data.findGroups.groups;
}

/** A list page, as the Collections page asks for it */
async function list(
  client: TestClient,
  groupFilter: Record<string, unknown> = {}
): Promise<GroupRow[]> {
  const res = await client.post<FindGroupsResponse>("/api/library/groups", {
    filter: { page: 1, per_page: 250, sort: "name", direction: "ASC" },
    group_filter: groupFilter,
  });
  expect(res.status).toBe(200);
  return res.data.findGroups.groups;
}

const key = (row: { id: string; instanceId: string }) =>
  `${row.id}@${row.instanceId}`;

describe("Collection hierarchy (integration)", () => {
  const G = TEST_ENTITIES.groupWithScenes;
  let instanceId: string;
  /** P, which contains G, and C, inside G; set in replay runs */
  let P = "";
  let C = "";
  let hider: { id: number; client: TestClient } | undefined;
  let restricted: { id: number; client: TestClient } | undefined;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    instanceId = await selectTestInstanceOnly();
    if (REPLAY) {
      const [containing] = await prisma.groupRelation.findMany({
        where: { subId: G, subInstanceId: instanceId },
      });
      const [sub] = await prisma.groupRelation.findMany({
        where: { containingId: G, containingInstanceId: instanceId },
      });
      P = must(containing, "the replay's group containing G").containingId;
      C = must(sub, "the replay's group inside G").subId;
    }
  });

  afterAll(async () => {
    for (const user of [hider, restricted]) {
      if (user) await adminClient.delete(`/api/user/${user.id}`);
    }
    await restoreInstanceSelection();
  });

  it.skipIf(!REPLAY)(
    "the detail request for G returns containing_groups [P] and sub_groups [C] with descriptions and instance ids",
    async () => {
      const [p, c] = await Promise.all(
        [P, C].map((id) =>
          prisma.stashGroup.findUniqueOrThrow({
            where: { id_stashInstanceId: { id, stashInstanceId: instanceId } },
          })
        )
      );

      const [group, ...rest] = await detail(adminClient, G, instanceId);

      expect(rest).toEqual([]);
      expect(must(group, "G").containing_groups).toEqual([
        {
          group: { id: P, name: must(p).name, instanceId },
          description: "Box set",
        },
      ]);
      expect(must(group, "G").sub_groups).toEqual([
        {
          group: { id: C, name: must(c).name, instanceId },
          description: "Part 2",
        },
      ]);
    }
  );

  it.skipIf(!REPLAY)("G's list row has sub_group_count 1", async () => {
    const rows = new Map(
      (await list(adminClient)).map((row) => [key(row), row])
    );

    expect(rows.get(key({ id: G, instanceId }))?.sub_group_count).toBe(1);
    expect(rows.get(key({ id: P, instanceId }))?.sub_group_count).toBe(1);
    expect(rows.get(key({ id: C, instanceId }))?.sub_group_count).toBe(0);
  });

  it.skipIf(!REPLAY)(
    "the containing_groups filter with G's composite id lists exactly C",
    async () => {
      const rows = await list(adminClient, {
        containing_groups: { value: [`${G}:${instanceId}`] },
      });

      expect(rows.map(key)).toEqual([key({ id: C, instanceId })]);
    }
  );

  it.skipIf(!REPLAY)(
    "a user who hid C sees sub_groups [] and sub_group_count 0 for G",
    async () => {
      // An admin: a non-admin's empty phase already excludes C, which holds
      // no scene; the hide is what an admin's rows hold
      hider = await createUser("group_hierarchy_hider", "ADMIN");
      await selectTestInstanceForClient(hider.client);
      const countFor = async (client: TestClient) =>
        (await list(client)).find(
          (row) => key(row) === key({ id: G, instanceId })
        )?.sub_group_count;
      expect(await countFor(hider.client)).toBe(1);

      const hide = await hider.client.post("/api/user/hidden-entities", {
        entityType: "group",
        entityId: C,
        instanceId,
      });
      expect(hide.status).toBe(200);

      const [group] = await detail(hider.client, G, instanceId);
      expect(must(group, "G").sub_groups).toEqual([]);
      expect(must(group, "G").sub_group_count).toBe(0);
      expect(await countFor(hider.client)).toBe(0);
    },
    30_000
  );

  it.skipIf(!REPLAY)(
    "a restricted user who cannot see P does not get P in containing_groups",
    async () => {
      restricted = await createUser("group_hierarchy_restricted", "USER");
      await selectTestInstanceForClient(restricted.client);
      const saved = await adminClient.put(
        `/api/user/${restricted.id}/restrictions`,
        {
          restrictions: [
            {
              entityType: "groups",
              mode: "EXCLUDE",
              entityIds: [`${P}:${instanceId}`],
              restrictEmpty: false,
            },
          ],
        }
      );
      expect(saved.status).toBe(200);

      expect(await detail(restricted.client, P, instanceId)).toEqual([]);
      const [group, ...rest] = await detail(restricted.client, G, instanceId);
      expect(rest).toEqual([]);
      expect(must(group, "G").containing_groups).toEqual([]);
    },
    30_000
  );

  describe("the containing_groups filter across instances", () => {
    const A = "group-hier-a";
    const B = "group-hier-b";
    const PARENT = "7720001";
    const CHILD = "7720002";
    let viewer: { id: number; client: TestClient } | undefined;

    const clear = async () => {
      // Relations cascade from their groups
      await prisma.stashGroup.deleteMany({
        where: { stashInstanceId: { in: [A, B] } },
      });
      await prisma.stashInstance.deleteMany({ where: { id: { in: [A, B] } } });
    };

    beforeAll(async () => {
      await clear();
      for (const [index, id] of [A, B].entries()) {
        await prisma.stashInstance.create({
          data: {
            id,
            name: id,
            url: "http://127.0.0.1:9/graphql",
            apiKey: "fixture-key",
            enabled: true,
            priority: 950 + index,
            firstSyncedAt: new Date(),
          },
        });
        await prisma.stashGroup.createMany({
          data: [
            { id: PARENT, stashInstanceId: id, name: `Parent ${id}` },
            { id: CHILD, stashInstanceId: id, name: `Child ${id}` },
          ],
        });
        await prisma.groupRelation.create({
          data: {
            containingId: PARENT,
            containingInstanceId: id,
            subId: CHILD,
            subInstanceId: id,
            orderIndex: 0,
          },
        });
      }
      // An admin with no selection sees every enabled instance, these too
      viewer = await createUser("group_hierarchy_viewer", "ADMIN");
      await selectAllInstancesForClient(viewer.client);
    }, 30_000);

    afterAll(async () => {
      if (viewer) await adminClient.delete(`/api/user/${viewer.id}`);
      await clear();
    });

    it("a bare id in the filter matches on every instance, an id:instance only that instance", async () => {
      const client = must(viewer, "the viewer").client;

      const bare = await list(client, {
        containing_groups: { value: [PARENT] },
      });
      expect(bare.map(key).sort()).toEqual([`${CHILD}@${A}`, `${CHILD}@${B}`]);

      const onA = await list(client, {
        containing_groups: { value: [`${PARENT}:${A}`] },
      });
      expect(onA.map(key)).toEqual([`${CHILD}@${A}`]);
    });
  });
});

/**
 * Sub-collections with depth, the collections containing them, and their
 * counts, on seeded collections under two made-up instances reusing the
 * same ids (invariant 7). The viewer hid GH (invariant 3, lead decision 4);
 * another user hid nothing (invariant 6).
 *
 * gh2-a: G1 (7731001) > G2 (7731002) > G3 (7731003) > G4 (7731004); G1's
 *   other sub-collections GH (7731005, hidden) and GD (7731007, deleted);
 *   GH > G6 (7731006). A cycle: GC1 (7731008) > GC2 (7731009) > GC1, and
 *   GX (7731010) inside both.
 * gh2-b: G1 (7731001) > G2 (7731002).
 */
describeWithDb("Collection hierarchy filters and counts (seeded)", () => {
  const A = "gh2-a";
  const B = "gh2-b";
  const VIEWER = "gh2-viewer";
  const OTHER = "gh2-other";
  let viewerId = 0;
  let otherId = 0;

  const [G1, G2, G3, G4, GH, G6, GD, GC1, GC2, GX] = [
    "7731001",
    "7731002",
    "7731003",
    "7731004",
    "7731005",
    "7731006",
    "7731007",
    "7731008",
    "7731009",
    "7731010",
  ];
  const k = (id: string, instance = A) => `${id}:${instance}`;
  /** Every collection the viewer can see */
  const VISIBLE = [
    k(G1),
    k(G2),
    k(G3),
    k(G4),
    k(G6),
    k(GC1),
    k(GC2),
    k(GX),
    k(G1, B),
    k(G2, B),
  ].sort();
  const without = (...keys: string[]) =>
    VISIBLE.filter((v) => !keys.includes(v));

  async function removeRows(): Promise<void> {
    // Relations cascade from their groups
    await prisma.stashGroup.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
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

    const group = (id: string, instance = A, deletedAt?: Date) => ({
      id,
      stashInstanceId: instance,
      name: `GH2 group ${id} ${instance}`,
      ...(deletedAt ? { deletedAt } : {}),
    });
    await prisma.stashGroup.createMany({
      data: [
        ...[G1, G2, G3, G4, GH, G6, GC1, GC2, GX].map((id) => group(id)),
        group(GD, A, new Date()),
        group(G1, B),
        group(G2, B),
      ],
    });
    const link = (containing: string, sub: string, instance = A) => ({
      containingId: containing,
      containingInstanceId: instance,
      subId: sub,
      subInstanceId: instance,
      orderIndex: 0,
    });
    await prisma.groupRelation.createMany({
      data: [
        link(G1, G2),
        link(G2, G3),
        link(G3, G4),
        link(G1, GH),
        link(G1, GD),
        link(GH, G6),
        link(GC1, GC2),
        link(GC2, GC1),
        link(GC1, GX),
        link(GC2, GX),
        link(G1, G2, B),
      ],
    });
    await prisma.userExcludedEntity.create({
      data: {
        userId: viewerId,
        entityType: "group",
        entityId: GH,
        instanceId: A,
        reason: "hidden",
      },
    });
  });

  afterAll(removeRows);

  it("containing_groups X at depth -1 lists every sub-collection under X; one instance's X never matches the other's", async () => {
    const g1 = k(G1);
    expect(
      await listed({
        containing_groups: { value: [g1], modifier: "INCLUDES", depth: -1 },
      })
    ).toEqual([k(G2), k(G3), k(G4)].sort());
    expect(
      await listed({
        containing_groups: { value: [g1], modifier: "INCLUDES", depth: 1 },
      })
    ).toEqual([k(G2), k(G3)].sort());
    expect(
      await listed({ containing_groups: { value: [g1], modifier: "INCLUDES" } })
    ).toEqual([k(G2)]);
    expect(
      await listed({
        containing_groups: { value: [k(G1, B)], modifier: "INCLUDES" },
      })
    ).toEqual([k(G2, B)]);
    expect(
      await listed({
        containing_groups: { value: [G1], modifier: "INCLUDES", depth: -1 },
      })
    ).toEqual([k(G2), k(G3), k(G4), k(G2, B)].sort());
    // EXCLUDES keeps the collections no collection holds
    expect(
      await listed({
        containing_groups: { value: [g1], modifier: "EXCLUDES", depth: -1 },
      })
    ).toEqual(without(k(G2), k(G3), k(G4)));
    expect(
      await listed({
        containing_groups: {
          value: [k(G2), k(G3)],
          modifier: "INCLUDES_ALL",
          depth: -1,
        },
      })
    ).toEqual([k(G4)]);
  });

  it("sub_groups Y at depth -1 lists every collection holding Y at any depth", async () => {
    const g4 = k(G4);
    expect(
      await listed({
        sub_groups: { value: [g4], modifier: "INCLUDES", depth: -1 },
      })
    ).toEqual([k(G1), k(G2), k(G3)].sort());
    expect(
      await listed({
        sub_groups: { value: [g4], modifier: "INCLUDES", depth: 1 },
      })
    ).toEqual([k(G2), k(G3)].sort());
    expect(
      await listed({ sub_groups: { value: [g4], modifier: "INCLUDES" } })
    ).toEqual([k(G3)]);
    expect(
      await listed({ sub_groups: { value: [k(G2, B)], modifier: "INCLUDES" } })
    ).toEqual([k(G1, B)]);
    expect(
      await listed({ sub_groups: { value: [G2], modifier: "INCLUDES" } })
    ).toEqual([k(G1), k(G1, B)].sort());
    expect(
      await listed({
        sub_groups: { value: [g4], modifier: "EXCLUDES", depth: -1 },
      })
    ).toEqual(without(k(G1), k(G2), k(G3)));
    expect(
      await listed({
        sub_groups: {
          value: [k(G4), k(G3)],
          modifier: "INCLUDES_ALL",
          depth: -1,
        },
      })
    ).toEqual([k(G1), k(G2)].sort());
  });

  it("a cycle in GroupRelation ends", async () => {
    expect(
      await listed({
        containing_groups: { value: [k(GC1)], modifier: "INCLUDES", depth: -1 },
      })
    ).toEqual([k(GC1), k(GC2), k(GX)].sort());
    expect(
      await listed({
        sub_groups: { value: [k(GC1)], modifier: "INCLUDES", depth: -1 },
      })
    ).toEqual([k(GC1), k(GC2)].sort());
  });

  it("a hidden sub-collection does not make its parent match sub_groups", async () => {
    expect(
      await listed({ sub_groups: { value: [k(GH)], modifier: "INCLUDES" } })
    ).toEqual([]);
    // G6 is reached only through GH
    expect(
      await listed({
        sub_groups: { value: [k(G6)], modifier: "INCLUDES", depth: -1 },
      })
    ).toEqual([]);
    expect(
      await listed({
        containing_groups: { value: [k(G1)], modifier: "INCLUDES", depth: -1 },
      })
    ).not.toContain(k(G6));
    expect(
      await listed({ sub_groups: { value: [k(GH)], modifier: "EXCLUDES" } })
    ).toEqual(VISIBLE);
    // Another user hid nothing: G1 holds GH, and GH holds G6, for them
    expect(
      await listed(
        { sub_groups: { value: [k(G6)], modifier: "INCLUDES", depth: -1 } },
        otherId
      )
    ).toEqual([k(G1), k(GH)].sort());
  });

  it("sub_group_count and containing_group_count count live, visible collections", async () => {
    expect(
      await listed({ sub_group_count: { value: 0, modifier: "EQUALS" } })
    ).toEqual([k(G4), k(G6), k(GX), k(G2, B)].sort());
    // G1 on gh2-a counts G2 alone for the viewer (GH hidden, GD deleted)
    expect(
      await listed({ sub_group_count: { value: 2, modifier: "EQUALS" } })
    ).toEqual([k(GC1), k(GC2)].sort());
    expect(
      await listed(
        { sub_group_count: { value: 2, modifier: "GREATER_THAN" } },
        otherId
      )
    ).toEqual([]);
    expect(
      await listed(
        { sub_group_count: { value: 2, modifier: "EQUALS" } },
        otherId
      )
    ).toEqual([k(G1), k(GC1), k(GC2)].sort());

    expect(
      await listed({ containing_group_count: { value: 0, modifier: "EQUALS" } })
    ).toEqual([k(G1), k(G6), k(G1, B)].sort());
    expect(
      await listed({ containing_group_count: { value: 2, modifier: "EQUALS" } })
    ).toEqual([k(GX)]);
    expect(
      await listed(
        { containing_group_count: { value: 0, modifier: "EQUALS" } },
        otherId
      )
    ).toEqual([k(G1), k(G1, B)].sort());
  });
});
