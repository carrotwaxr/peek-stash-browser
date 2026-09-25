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
 * skip them. The last case seeds two made-up instances that reuse the same
 * ids and deletes them before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  TestClient,
  adminClient,
  selectAllInstancesForClient,
  selectTestInstanceForClient,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

const REPLAY = process.env.STASH_REPLAY === "1";

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
    filter: { page: 1, per_page: 500, sort: "name", direction: "ASC" },
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
