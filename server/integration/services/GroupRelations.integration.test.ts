/**
 * The collection hierarchy (item 58): `GroupRelation` holds one row per edge
 * of Stash's group hierarchy, from a containing group to one of its
 * sub-groups, both keyed on (id, instance) like every junction.
 *
 * Its two composite foreign keys point at `StashGroup`: a relation to a group
 * the instance does not hold is rejected, even when another instance holds a
 * group with that id, and deleting a group (as an instance purge does, by raw
 * SQL) removes its relations on both sides.
 *
 * The sync's relation pass (C21) writes them: Stash's sub-group edits
 * (AddGroupSubGroups, RemoveGroupSubGroups, a reorder, a link's
 * description) move no group's updated_at, so every sync reads the whole
 * hierarchy in one request and writes only what differs. Here a smart sync
 * with a stub Stash that reports no changed entity of any type shows it.
 *
 * The exclusion compute's empty-collection rule reads the hierarchy too: a
 * collection holding only visible, non-empty sub-collections is not empty.
 *
 * Made-up instances that real sync never touches; every row is deleted
 * before the file ends. The last case reads what the startup sync stored
 * from the replay's hierarchy.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { StashClient } from "../../graphql/StashClient.js";
import type { FindGroupRelationsQuery } from "../../graphql/generated/graphql.js";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import {
  SYNC_ORDER,
  type SyncRunContext,
  stashSyncService,
} from "../../services/StashSyncService.js";
import { SyncChangeSet } from "../../services/SyncChangeSet.js";
import {
  arrayContaining,
  objectContaining,
  stringContaining,
} from "../../tests/helpers/matchers.js";
import { must } from "../../tests/helpers/must.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";
import { logger } from "../../utils/logger.js";
import { TEST_ENTITIES } from "../fixtures/testEntities.js";
import { recordStatements } from "../helpers/statementRecorder.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "gr-a";
const B = "gr-b";

/** Every seeded type's last sync: a smart sync after it is incremental */
const UPDATED_AT = "2026-01-02T00:00:00Z";

async function createGroup(id: string, instanceId: string): Promise<void> {
  await prisma.stashGroup.create({
    data: { id, stashInstanceId: instanceId, name: `Group ${id}` },
  });
}

async function removeRows(): Promise<void> {
  // The relations go with their groups (ON DELETE CASCADE)
  await prisma.stashGroup.deleteMany({
    where: { stashInstanceId: { in: [A, B] } },
  });
  await prisma.syncState.deleteMany({
    where: { stashInstanceId: { in: [A, B] } },
  });
  await prisma.userExcludedEntity.deleteMany({
    where: { instanceId: { in: [A, B] } },
  });
}

/** One link in a containing group's list, as Stash returns it */
type SubGroupLink = [subId: string, description: string | null];

/**
 * Stash's collection hierarchy: each containing group's sub-groups, in
 * Stash's order. A group with none is left out.
 */
type Hierarchy = Record<string, SubGroupLink[]>;

/** What the stub Stash holds and what it was asked */
interface StubStash {
  hierarchy: Hierarchy;
  /** When set, the hierarchy request fails with it */
  failure?: Error | undefined;
  /** The variables of every hierarchy request */
  hierarchyRequests: unknown[];
  /** Every group page's filter: only counts, when nothing changed */
  groupPages: Array<{ perPage: number | null | undefined; since: boolean }>;
}

/**
 * Routes A's Stash client to a stub holding the groups `groupIds` and
 * `stub.hierarchy`, in which no entity of any type changed since the last
 * sync: every count and page narrowed by updated_at is empty, and the
 * cleanup's id lists hold the groups and nothing else.
 */
function stubStash(groupIds: string[], hierarchy: Hierarchy): StubStash {
  const stub: StubStash = {
    hierarchy,
    hierarchyRequests: [],
    groupPages: [],
  };
  const none = { count: 0 };
  const client: StashClient = partialRow<StashClient>({
    findTags: () => Promise.resolve({ findTags: { ...none, tags: [] } }),
    findStudios: () =>
      Promise.resolve({ findStudios: { ...none, studios: [] } }),
    findPerformers: () =>
      Promise.resolve({ findPerformers: { ...none, performers: [] } }),
    findGroups: (vars) => {
      stub.groupPages.push({
        perPage: vars?.filter?.per_page,
        since: vars?.group_filter?.updated_at != null,
      });
      return Promise.resolve({ findGroups: { ...none, groups: [] } });
    },
    findGalleries: () =>
      Promise.resolve({ findGalleries: { ...none, galleries: [] } }),
    findScenesCompact: () =>
      Promise.resolve({
        findScenes: { ...none, duration: 0, filesize: 0, scenes: [] },
      }),
    // Clips count and list their ids through the same operation
    findSceneMarkers: () =>
      Promise.resolve({ findSceneMarkers: { ...none, scene_markers: [] } }),
    findImages: () => Promise.resolve({ findImages: { ...none, images: [] } }),
    findTagIDs: () => Promise.resolve({ findTags: { ...none, tags: [] } }),
    findStudioIDs: () =>
      Promise.resolve({ findStudios: { ...none, studios: [] } }),
    findPerformerIDs: () =>
      Promise.resolve({ findPerformers: { ...none, performers: [] } }),
    findGroupIDs: () =>
      Promise.resolve({
        findGroups: {
          count: groupIds.length,
          groups: groupIds.map((id) => ({ id })),
        },
      }),
    findGalleryIDs: () =>
      Promise.resolve({ findGalleries: { ...none, galleries: [] } }),
    findSceneIDs: () =>
      Promise.resolve({ findScenes: { ...none, scenes: [] } }),
    findImageIDs: () =>
      Promise.resolve({ findImages: { ...none, images: [] } }),
    // Stash's UI settings, read at the start of each instance's sync: none
    configurationUi: () => Promise.resolve({ configuration: { ui: {} } }),
    findGroupRelations: (vars) => {
      stub.hierarchyRequests.push(vars);
      if (stub.failure) return Promise.reject(stub.failure);
      const answer: FindGroupRelationsQuery = {
        findGroups: {
          count: groupIds.length,
          groups: groupIds.map((id) => ({
            id,
            sub_groups: (stub.hierarchy[id] ?? []).map(
              ([subId, description]) => ({ group: { id: subId }, description })
            ),
          })),
        },
      };
      // Groups Peek does not hold yet can contain others too
      for (const [id, links] of Object.entries(stub.hierarchy)) {
        if (groupIds.includes(id)) continue;
        answer.findGroups.groups.push({
          id,
          sub_groups: links.map(([subId, description]) => ({
            group: { id: subId },
            description,
          })),
        });
      }
      return Promise.resolve(answer);
    },
    // The sync scopes its client to its abort signal
    withSignal: () => client,
  });
  const realGet = stashInstanceManager.get.bind(stashInstanceManager);
  vi.spyOn(stashInstanceManager, "get").mockImplementation((id) =>
    id === A ? client : realGet(id)
  );
  return stub;
}

/** Every type of `instanceId` synced up to UPDATED_AT */
async function markSynced(instanceId: string): Promise<void> {
  await prisma.syncState.createMany({
    data: SYNC_ORDER.map((entityType) => ({
      stashInstanceId: instanceId,
      entityType,
      lastIncrementalSyncTimestamp: UPDATED_AT,
      lastIncrementalSyncActual: new Date(),
    })),
  });
}

/** An instance's relations, ordered, as `containing>sub@order:description` */
async function relationsOf(instanceId: string): Promise<string[]> {
  const rows = await prisma.groupRelation.findMany({
    where: { containingInstanceId: instanceId },
    orderBy: [{ containingId: "asc" }, { orderIndex: "asc" }],
  });
  return rows.map(
    (row) =>
      `${row.containingId}>${row.subId}@${row.orderIndex}:${row.description ?? "null"}`
  );
}

async function lastErrorOf(entityType: string): Promise<string | null> {
  const state = await prisma.syncState.findFirst({
    where: { stashInstanceId: A, entityType },
  });
  return must(state, `${entityType} SyncState`).lastError;
}

describeWithDb("GroupRelation", () => {
  afterEach(removeRows);
  afterAll(removeRows);

  it("rejects a relation whose sub group the instance does not hold", async () => {
    await createGroup("1", A);
    // Group 2 exists, but on the other instance
    await createGroup("2", B);

    await expect(
      prisma.groupRelation.create({
        data: {
          containingId: "1",
          containingInstanceId: A,
          subId: "2",
          subInstanceId: A,
          orderIndex: 0,
        },
      })
    ).rejects.toThrow(/Foreign key constraint/);
    expect(
      await prisma.groupRelation.count({ where: { containingInstanceId: A } })
    ).toBe(0);
  });

  it("rejects a relation whose containing group is missing", async () => {
    await createGroup("2", A);

    await expect(
      prisma.groupRelation.create({
        data: {
          containingId: "1",
          containingInstanceId: A,
          subId: "2",
          subInstanceId: A,
          orderIndex: 0,
        },
      })
    ).rejects.toThrow(/Foreign key constraint/);
    expect(
      await prisma.groupRelation.count({ where: { subInstanceId: A } })
    ).toBe(0);
  });

  it("deleting a group removes its relations on both sides", async () => {
    // P contains G, G contains C
    await createGroup("1", A);
    await createGroup("2", A);
    await createGroup("3", A);
    await prisma.groupRelation.createMany({
      data: [
        {
          containingId: "1",
          containingInstanceId: A,
          subId: "2",
          subInstanceId: A,
          orderIndex: 0,
          description: "Box set",
        },
        {
          containingId: "2",
          containingInstanceId: A,
          subId: "3",
          subInstanceId: A,
          orderIndex: 0,
          description: "Part 2",
        },
      ],
    });
    expect(
      await prisma.groupRelation.count({ where: { containingInstanceId: A } })
    ).toBe(2);

    await prisma.$executeRawUnsafe(
      `DELETE FROM "StashGroup" WHERE "id" = ? AND "stashInstanceId" = ?`,
      "2",
      A
    );

    expect(
      await prisma.groupRelation.count({ where: { containingInstanceId: A } })
    ).toBe(0);
    expect(
      await prisma.stashGroup.count({ where: { stashInstanceId: A } })
    ).toBe(2);
  });
});

describeWithDb("the relation pass (integration)", () => {
  beforeAll(async () => {
    // The instances the server knows (the test Stash), as in production
    await stashInstanceManager.reload();
  });

  beforeEach(async () => {
    await removeRows();
    for (const id of ["1", "2", "3"]) {
      await createGroup(id, A);
      await createGroup(id, B);
    }
    await markSynced(A);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await removeRows();
  });

  afterAll(removeRows);

  it("a sub-group added with AddGroupSubGroups appears on the next sync though neither group's updated_at moved", async () => {
    const stash = stubStash(["1", "2", "3"], { "1": [["2", null]] });
    await stashSyncService.smartIncrementalSync(A);
    expect(await relationsOf(A)).toEqual(["1>2@0:null"]);

    stash.hierarchy = {
      "1": [
        ["2", null],
        ["3", null],
      ],
    };
    await stashSyncService.smartIncrementalSync(A);

    expect(await relationsOf(A)).toEqual(["1>2@0:null", "1>3@1:null"]);
    // One request a sync, for every group at once
    expect(stash.hierarchyRequests).toEqual([
      { filter: { per_page: -1 } },
      { filter: { per_page: -1 } },
    ]);
    // Stash counted no changed group, so no group page was fetched
    expect(stash.groupPages).toEqual([
      { perPage: 0, since: true },
      { perPage: 0, since: true },
    ]);
    expect(await lastErrorOf("group")).toBeNull();
  }, 60_000);

  it("a removed one disappears", async () => {
    const stash = stubStash(["1", "2", "3"], {
      "1": [
        ["2", null],
        ["3", null],
      ],
      "2": [["3", null]],
    });
    await stashSyncService.smartIncrementalSync(A);
    expect(await relationsOf(A)).toEqual([
      "1>2@0:null",
      "1>3@1:null",
      "2>3@0:null",
    ]);

    // RemoveGroupSubGroups: 2 leaves 1, and 2 no longer contains anything
    stash.hierarchy = { "1": [["3", null]] };
    await stashSyncService.incrementalSync(A);

    expect(await relationsOf(A)).toEqual(["1>3@0:null"]);
    expect(
      await prisma.stashGroup.count({ where: { stashInstanceId: A } })
    ).toBe(3);
  }, 60_000);

  it("order and description follow Stash", async () => {
    const stash = stubStash(["1", "2", "3"], {
      "1": [
        ["3", "Part 1"],
        ["2", "Part 2"],
      ],
    });
    await stashSyncService.smartIncrementalSync(A);
    expect(await relationsOf(A)).toEqual(["1>3@0:Part 1", "1>2@1:Part 2"]);

    // Reordered, one description edited and one cleared
    stash.hierarchy = {
      "1": [
        ["2", "Box set"],
        ["3", null],
      ],
    };
    await stashSyncService.smartIncrementalSync(A);

    expect(await relationsOf(A)).toEqual(["1>2@0:Box set", "1>3@1:null"]);
  }, 60_000);

  it("gr-b's edges for the same ids are untouched", async () => {
    await prisma.groupRelation.createMany({
      data: [
        {
          containingId: "1",
          containingInstanceId: B,
          subId: "2",
          subInstanceId: B,
          orderIndex: 0,
          description: "On B",
        },
        {
          containingId: "2",
          containingInstanceId: B,
          subId: "3",
          subInstanceId: B,
          orderIndex: 0,
          description: null,
        },
      ],
    });
    const stash = stubStash(["1", "2", "3"], {
      "1": [["2", "On A"]],
      "2": [["3", null]],
    });
    await stashSyncService.smartIncrementalSync(A);

    // A loses both of B's edges and gains one B lacks
    stash.hierarchy = { "1": [["3", "On A"]] };
    await stashSyncService.smartIncrementalSync(A);

    expect(await relationsOf(A)).toEqual(["1>3@0:On A"]);
    expect(await relationsOf(B)).toEqual(["1>2@0:On B", "2>3@0:null"]);
  }, 60_000);

  it("an edge to a group missing locally is skipped and logged", async () => {
    // Group 9 exists, but only on gr-b; group 8 nowhere
    await createGroup("9", B);
    const warn = vi.spyOn(logger, "warn");
    stubStash(["1", "2", "3"], {
      "1": [
        ["9", "Only on B"],
        ["2", null],
      ],
      "8": [["1", null]],
    });

    await stashSyncService.smartIncrementalSync(A);

    // The edges between held groups keep Stash's positions
    expect(await relationsOf(A)).toEqual(["1>2@1:null"]);
    expect(warn).toHaveBeenCalledWith(
      stringContaining("collection hierarchy"),
      objectContaining({
        instanceId: A,
        groupIds: arrayContaining(["8", "9"]),
      })
    );
    // Not a failure: the next sync adds them once the groups are synced
    expect(await lastErrorOf("group")).toBeNull();
    expect(await relationsOf(B)).toEqual([]);
  }, 60_000);

  it("a sync with no relation change writes nothing and leaves the change set empty", async () => {
    stubStash(["1", "2", "3"], {
      "1": [
        ["2", "Box set"],
        ["3", null],
      ],
    });
    await stashSyncService.smartIncrementalSync(A);
    const before = await relationsOf(A);
    expect(before).toEqual(["1>2@0:Box set", "1>3@1:null"]);

    const run: SyncRunContext = {
      signal: new AbortController().signal,
      changes: new SyncChangeSet(),
    };
    const recorder = recordStatements();
    try {
      await stashSyncService["syncGroupRelations"](A, run);
    } finally {
      recorder.restore();
    }

    expect(recorder.transactions()).toBe(0);
    expect(
      recorder.statements.filter(({ sql }) =>
        /\b(INSERT|UPDATE|DELETE)\b/i.test(sql)
      )
    ).toEqual([]);
    expect(run.changes.isEmpty()).toBe(true);
    expect(await relationsOf(A)).toEqual(before);
  }, 60_000);

  it("a failed hierarchy request is recorded in the collections' lastError, and the sync goes on", async () => {
    const stash = stubStash(["1", "2", "3"], { "1": [["2", null]] });
    await stashSyncService.smartIncrementalSync(A);

    stash.hierarchy = { "1": [["3", null]] };
    stash.failure = new Error("Stash is down");
    await expect(
      stashSyncService.smartIncrementalSync(A)
    ).resolves.toBeDefined();

    // The stored edges stay until a sync reads the hierarchy again
    expect(await relationsOf(A)).toEqual(["1>2@0:null"]);
    expect(await lastErrorOf("group")).toBe(
      "Could not sync the collection hierarchy: Stash is down"
    );
    expect(await lastErrorOf("tag")).toBeNull();

    stash.failure = undefined;
    await stashSyncService.smartIncrementalSync(A);
    expect(await relationsOf(A)).toEqual(["1>3@0:null"]);
    expect(await lastErrorOf("group")).toBeNull();
  }, 60_000);
});

describeWithDb("the test Stash's collection hierarchy", () => {
  // The test Stash has no sub-groups; the replay's extension adds a group
  // containing groupWithScenes (G) and one inside it (stash-replay/extend.ts)
  it.skipIf(process.env.STASH_REPLAY !== "1")(
    "the startup sync stored the replay's links around groupWithScenes",
    async () => {
      const instance = must(
        await prisma.stashInstance.findFirst({ orderBy: { priority: "asc" } }),
        "the test instance"
      );
      const group = TEST_ENTITIES.groupWithScenes;
      const rows = await prisma.groupRelation.findMany({
        where: {
          containingInstanceId: instance.id,
          OR: [{ containingId: group }, { subId: group }],
        },
        include: { containing: true, sub: true },
        orderBy: { description: "asc" },
      });

      expect(
        rows.map((row) => ({
          link:
            row.subId === group ? "a group contains G" : "G contains a group",
          other: row.subId === group ? row.containing.name : row.sub.name,
          orderIndex: row.orderIndex,
          description: row.description,
          sameInstance: row.subInstanceId === instance.id,
        }))
      ).toEqual([
        {
          link: "a group contains G",
          other: stringContaining("Group "),
          orderIndex: 0,
          description: "Box set",
          sameInstance: true,
        },
        {
          link: "G contains a group",
          other: stringContaining("Group "),
          orderIndex: 0,
          description: "Part 2",
          sameInstance: true,
        },
      ]);
    }
  );
});

describeWithDb("the empty-collection rule (integration)", () => {
  // A restricted user (C22): a collection is empty when it holds no visible
  // scene and no visible, non-empty sub-collection at any depth. The two
  // made-up instances become real, enabled and synced instances here, so the
  // user's compute covers them; gr-b holds the same ids with no scenes.
  const USER_NAME = "gr_empty_user";
  let userId = 0;

  async function removeEmptyRuleRows(): Promise<void> {
    await prisma.user.deleteMany({ where: { username: USER_NAME } });
    await prisma.stashScene.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await removeRows();
    await prisma.stashInstance.deleteMany({ where: { id: { in: [A, B] } } });
  }

  /** `containing>sub` on one instance */
  async function relate(
    instanceId: string,
    ...edges: Array<[string, string]>
  ): Promise<void> {
    await prisma.groupRelation.createMany({
      data: edges.map(([containingId, subId], orderIndex) => ({
        containingId,
        containingInstanceId: instanceId,
        subId,
        subInstanceId: instanceId,
        orderIndex,
      })),
    });
  }

  /** A scene in `groupId` on gr-a */
  async function sceneIn(sceneId: string, groupId: string): Promise<void> {
    await prisma.stashScene.create({
      data: { id: sceneId, stashInstanceId: A },
    });
    await prisma.sceneGroup.create({
      data: {
        sceneId,
        sceneInstanceId: A,
        groupId,
        groupInstanceId: A,
      },
    });
  }

  /** The user's group rows on both instances, as `id@instance:reason` */
  async function groupRows(): Promise<string[]> {
    const found = await prisma.userExcludedEntity.findMany({
      where: { userId, entityType: "group", instanceId: { in: [A, B] } },
      select: { entityId: true, instanceId: true, reason: true },
    });
    return found.map((r) => `${r.entityId}@${r.instanceId}:${r.reason}`).sort();
  }

  beforeAll(async () => {
    await removeEmptyRuleRows();
    await prisma.stashInstance.createMany({
      data: [A, B].map((id) => ({
        id,
        name: id,
        url: `http://${id}.invalid/graphql`,
        apiKey: "x",
        enabled: true,
        firstSyncedAt: new Date(),
      })),
    });
    const user = await prisma.user.create({
      data: { username: USER_NAME, password: "x", role: "USER" },
    });
    userId = user.id;
    await prisma.userStashInstance.createMany({
      data: [A, B].map((instanceId) => ({ userId, instanceId })),
    });
  });

  beforeEach(async () => {
    await prisma.userContentRestriction.deleteMany({ where: { userId } });
    await prisma.stashScene.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await removeRows();
  });

  afterAll(removeEmptyRuleRows);

  it("a collection holding only a visible sub-collection with a visible scene is not empty for a restricted user", async () => {
    // 1 > 2 > 3, and only 3 holds a scene; the user is restricted from an
    // unrelated collection. On gr-b the same ids hold no scene.
    for (const id of ["1", "2", "3", "9"]) {
      await createGroup(id, A);
      await createGroup(id, B);
    }
    await relate(A, ["1", "2"], ["2", "3"]);
    await relate(B, ["1", "2"], ["2", "3"]);
    await sceneIn("s3", "3");
    await sceneIn("s9", "9");
    await prisma.userContentRestriction.create({
      data: {
        userId,
        entityType: "groups",
        mode: "EXCLUDE",
        entityIds: JSON.stringify([`9:${A}`]),
        restrictEmpty: false,
      },
    });

    await exclusionComputationService.recomputeForUser(userId);

    expect(await groupRows()).toEqual([
      `1@${B}:empty`,
      `2@${B}:empty`,
      `3@${B}:empty`,
      `9@${A}:restricted`,
      `9@${B}:empty`,
    ]);
  }, 60_000);

  it("a collection whose only sub-collection is empty or hidden is empty", async () => {
    // 1 > 2, 2 holds nothing; 3 > 4, 4 holds a scene but is restricted
    for (const id of ["1", "2", "3", "4"]) await createGroup(id, A);
    await relate(A, ["1", "2"], ["3", "4"]);
    await sceneIn("s4", "4");
    await prisma.userContentRestriction.create({
      data: {
        userId,
        entityType: "groups",
        mode: "EXCLUDE",
        entityIds: JSON.stringify([`4:${A}`]),
        restrictEmpty: false,
      },
    });

    await exclusionComputationService.recomputeForUser(userId);

    expect(await groupRows()).toEqual([
      `1@${A}:empty`,
      `2@${A}:empty`,
      `3@${A}:empty`,
      `4@${A}:restricted`,
    ]);
  }, 60_000);

  it("a containment cycle with no scenes leaves both collections empty and the compute terminates", async () => {
    await createGroup("1", A);
    await createGroup("2", A);
    await relate(A, ["1", "2"], ["2", "1"]);

    await exclusionComputationService.recomputeForUser(userId);

    expect(await groupRows()).toEqual([`1@${A}:empty`, `2@${A}:empty`]);
  }, 60_000);
});
