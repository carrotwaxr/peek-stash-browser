/**
 * The clip builder on the base (item 74), against the real test SQLite
 * database.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do:
 * - cq-a and cq-b: tag 7890001, performer 7890001, studio 7890001, and
 *   scene 7890001 of that studio, with that performer and tag
 * - clip 7890101 on each, of its instance's scene 7890001, whose primary
 *   tag is its instance's tag 7890001; clip 7890102 on each, holding that
 *   tag in its tag list (ClipTag); on cq-a clip 7890101 is titled
 *   "100% ..." and 7890102 "1000 ..."
 * - cq-a only: clip 7890103 of scene 7890001 tagged 7890002; clip 7890104
 *   of the deleted scene 7890002; clip 7890105 of scene 7890003, which the
 *   user hid; clip 7890106 of scene 7890001, which the user's exclusions
 *   cover itself (its tags cascade to it); clip 7890107, deleted
 * - cq-r: 60 clips of scene 7890004, for the paging case
 *
 * A clip shows only while its scene does: both live, neither excluded for
 * the viewer, on an allowed instance (an empty allowed list matches
 * nothing). A ref with an instance matches that instance only, a bare ref
 * its id on every instance. The search binds `likeContains(q)` with
 * `ESCAPE '\'`, so a `%` matches only titles holding one.
 * Every seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { parsedClipRequest } from "../../tests/helpers/fixtures.js";
import type {
  ClipListRequest,
  FilterRef,
  RefCriterion,
} from "../../types/parsedFilters.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "cq-a";
const B = "cq-b";
const R = "cq-r";
const INSTANCES = [A, B, R];
const TAG = "7890001";
const OTHER_TAG = "7890002";
const PERFORMER = "7890001";
const STUDIO = "7890001";
const [SCENE, DELETED_SCENE, HIDDEN_SCENE, PAGING_SCENE] = [
  "7890001",
  "7890002",
  "7890003",
  "7890004",
];
const [PRIMARY, JUNCTION, OTHER, OF_DELETED, OF_HIDDEN, EXCLUDED, DELETED] = [
  "7890101",
  "7890102",
  "7890103",
  "7890104",
  "7890105",
  "7890106",
  "7890107",
];
const PAGING_COUNT = 60;
const USERNAME = "cq-clip-user";

const key = (id: string, instanceId: string) => `${id}:${instanceId}`;
const keys = (rows: Array<{ id: string; instanceId: string }>): string[] =>
  rows.map((row) => key(row.id, row.instanceId)).sort();

const includes = (...refs: FilterRef[]): RefCriterion => ({
  refs,
  modifier: "INCLUDES",
  depth: 0,
});

let userId = 0;

/** One clip page for the user */
async function clips(
  overrides: Partial<ClipListRequest> = {},
  options: { allowedInstanceIds?: string[]; applyExclusions?: boolean } = {}
) {
  return clipQueryBuilder.execute({
    userId,
    allowedInstanceIds: options.allowedInstanceIds ?? [A, B],
    applyExclusions: options.applyExclusions ?? true,
    request: parsedClipRequest({ perPage: 100, ...overrides }),
  });
}

async function seed(): Promise<void> {
  const user = await prisma.user.create({
    data: { username: USERNAME, password: "not-a-real-hash", role: "USER" },
  });
  userId = user.id;

  const named = (id: string, instance: string, name: string) => ({
    id,
    stashInstanceId: instance,
    name,
  });
  await prisma.stashTag.createMany({
    data: [
      named(TAG, A, "Tag A"),
      named(TAG, B, "Tag B"),
      named(OTHER_TAG, A, "Other tag A"),
    ],
  });
  await prisma.stashPerformer.createMany({
    data: [named(PERFORMER, A, "Performer A"), named(PERFORMER, B, "B")],
  });
  await prisma.stashStudio.createMany({
    data: [named(STUDIO, A, "Studio A"), named(STUDIO, B, "Studio B")],
  });
  await prisma.stashScene.createMany({
    data: [
      { id: SCENE, stashInstanceId: A, title: "Scene A", studioId: STUDIO },
      { id: SCENE, stashInstanceId: B, title: "Scene B", studioId: STUDIO },
      {
        id: DELETED_SCENE,
        stashInstanceId: A,
        title: "Deleted scene",
        deletedAt: new Date(),
      },
      { id: HIDDEN_SCENE, stashInstanceId: A, title: "Hidden scene" },
      { id: PAGING_SCENE, stashInstanceId: R, title: "Paging scene" },
    ],
  });
  await prisma.scenePerformer.createMany({
    data: [A, B].map((instance) => ({
      sceneId: SCENE,
      sceneInstanceId: instance,
      performerId: PERFORMER,
      performerInstanceId: instance,
    })),
  });
  await prisma.sceneTag.createMany({
    data: [A, B].map((instance) => ({
      sceneId: SCENE,
      sceneInstanceId: instance,
      tagId: TAG,
      tagInstanceId: instance,
    })),
  });

  const clip = (
    id: string,
    instance: string,
    sceneId: string,
    extra: {
      title?: string;
      seconds?: number;
      primaryTagId?: string;
      deletedAt?: Date;
    } = {}
  ) => ({
    id,
    stashInstanceId: instance,
    sceneId,
    sceneInstanceId: instance,
    title: extra.title ?? `Clip ${id} on ${instance}`,
    seconds: extra.seconds ?? 0,
    ...(extra.primaryTagId === undefined
      ? {}
      : {
          primaryTagId: extra.primaryTagId,
          primaryTagInstanceId: instance,
        }),
    ...(extra.deletedAt ? { deletedAt: extra.deletedAt } : {}),
  });
  await prisma.stashClip.createMany({
    data: [
      clip(PRIMARY, A, SCENE, {
        title: "100% Clip",
        seconds: 10,
        primaryTagId: TAG,
      }),
      clip(JUNCTION, A, SCENE, { title: "1000 Clip", seconds: 20 }),
      clip(OTHER, A, SCENE, { seconds: 30, primaryTagId: OTHER_TAG }),
      clip(PRIMARY, B, SCENE, { seconds: 10, primaryTagId: TAG }),
      clip(JUNCTION, B, SCENE, { seconds: 20 }),
      clip(OF_DELETED, A, DELETED_SCENE),
      clip(OF_HIDDEN, A, HIDDEN_SCENE),
      clip(EXCLUDED, A, SCENE, { seconds: 40 }),
      clip(DELETED, A, SCENE, { deletedAt: new Date() }),
      ...Array.from({ length: PAGING_COUNT }, (_, i) =>
        clip(String(7890200 + i), R, PAGING_SCENE, { seconds: i })
      ),
    ],
  });
  await prisma.clipTag.createMany({
    data: [A, B].map((instance) => ({
      clipId: JUNCTION,
      clipInstanceId: instance,
      tagId: TAG,
      tagInstanceId: instance,
    })),
  });
  const excluded = (entityType: string, entityId: string) => ({
    userId,
    entityType,
    entityId,
    instanceId: A,
    reason: "hidden",
  });
  await prisma.userExcludedEntity.createMany({
    data: [excluded("scene", HIDDEN_SCENE), excluded("clip", EXCLUDED)],
  });
}

/** Clips first (their tags cascade), then the rest; the user's rows cascade */
async function removeRows(): Promise<void> {
  const where = { stashInstanceId: { in: INSTANCES } };
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  await prisma.stashClip.deleteMany({ where });
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

describeWithDb("Clip builder on the base (integration)", () => {
  beforeAll(async () => {
    await removeRows();
    await seed();
  });

  afterAll(async () => {
    await removeRows();
  });

  it("two pages of 24 at a seeded random sort never share a clip", async () => {
    const page = async (n: number) =>
      clips(
        {
          page: n,
          perPage: 24,
          sort: { field: "random", direction: "DESC", seed: 20260929 },
        },
        { allowedInstanceIds: [R] }
      );

    const [first, second, third] = await Promise.all([
      page(1),
      page(2),
      page(3),
    ]);
    const firstIds = first.items.map((c) => c.id);
    const secondIds = second.items.map((c) => c.id);

    expect(first.total).toBe(PAGING_COUNT);
    expect(firstIds).toHaveLength(24);
    expect(secondIds).toHaveLength(24);
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
    // The three pages hold every clip once
    const all = [...firstIds, ...secondIds, ...third.items.map((c) => c.id)];
    expect(new Set(all).size).toBe(PAGING_COUNT);
  });

  it("the tag filter matches the primary tag or a junction tag by (id, instance)", async () => {
    const onA = await clips({
      filter: { tagIds: includes({ id: TAG, instanceId: A }) },
    });
    expect(keys(onA.items)).toEqual([key(PRIMARY, A), key(JUNCTION, A)]);
    expect(onA.total).toBe(2);

    const onB = await clips({
      filter: { tagIds: includes({ id: TAG, instanceId: B }) },
    });
    expect(keys(onB.items)).toEqual([key(PRIMARY, B), key(JUNCTION, B)]);

    const bare = await clips({
      filter: { tagIds: includes({ id: TAG, instanceId: undefined }) },
    });
    expect(keys(bare.items)).toEqual([
      key(PRIMARY, A),
      key(PRIMARY, B),
      key(JUNCTION, A),
      key(JUNCTION, B),
    ]);
  });

  it("a % in the search matches only titles holding %", async () => {
    const { items, total } = await clips({ q: "100%" });

    expect(keys(items)).toEqual([key(PRIMARY, A)]);
    expect(total).toBe(1);
  });

  it("an empty allowed list returns no rows and count 0", async () => {
    expect(await clips({}, { allowedInstanceIds: [] })).toEqual({
      items: [],
      total: 0,
    });
  });

  it("leaves out a deleted clip, a deleted or hidden scene's clip and an excluded clip; without exclusions only the deleted ones", async () => {
    const visible = await clips({}, { allowedInstanceIds: [A] });
    expect(keys(visible.items)).toEqual(
      [PRIMARY, JUNCTION, OTHER].map((id) => key(id, A)).sort()
    );
    expect(visible.total).toBe(3);

    const all = await clips(
      {},
      { allowedInstanceIds: [A], applyExclusions: false }
    );
    expect(keys(all.items)).toEqual(
      [PRIMARY, JUNCTION, OTHER, OF_HIDDEN, EXCLUDED]
        .map((id) => key(id, A))
        .sort()
    );
  });

  it("scene tags, performers and the studio keep their instance", async () => {
    const sceneTag = await clips({
      filter: { sceneTagIds: includes({ id: TAG, instanceId: B }) },
    });
    expect(keys(sceneTag.items)).toEqual([key(PRIMARY, B), key(JUNCTION, B)]);

    const performer = await clips({
      filter: { performerIds: includes({ id: PERFORMER, instanceId: A }) },
    });
    expect(keys(performer.items)).toEqual(
      [PRIMARY, JUNCTION, OTHER].map((id) => key(id, A)).sort()
    );

    const studio = await clips({
      filter: { studioId: includes({ id: STUDIO, instanceId: B }) },
    });
    expect(keys(studio.items)).toEqual([key(PRIMARY, B), key(JUNCTION, B)]);

    const scene = await clips({
      filter: { sceneId: includes({ id: SCENE, instanceId: A }) },
    });
    expect(scene.total).toBe(3);
  });

  it("a scene's clips are the visible clips of that (id, instance), by time", async () => {
    const onA = await clipQueryBuilder.getClipsForScene({
      userId,
      allowedInstanceIds: [A, B],
      scene: { id: SCENE, instanceId: A },
      includeUngenerated: true,
    });
    expect(onA.map((c) => key(c.id, c.instanceId))).toEqual([
      key(PRIMARY, A),
      key(JUNCTION, A),
      key(OTHER, A),
    ]);
    expect(onA.map((c) => c.primaryTag?.name ?? null)).toEqual([
      "Tag A",
      null,
      "Other tag A",
    ]);
    expect(onA.map((c) => c.tags.map((t) => t.name))).toEqual([
      [],
      ["Tag A"],
      [],
    ]);

    const bare = await clipQueryBuilder.getClipsForScene({
      userId,
      allowedInstanceIds: [A, B],
      scene: { id: SCENE, instanceId: undefined },
      includeUngenerated: true,
    });
    expect(keys(bare)).toEqual(
      [key(PRIMARY, A), key(JUNCTION, A), key(OTHER, A)]
        .concat([key(PRIMARY, B), key(JUNCTION, B)])
        .sort()
    );

    // Generated only: none of these is
    const generated = await clipQueryBuilder.getClipsForScene({
      userId,
      allowedInstanceIds: [A, B],
      scene: { id: SCENE, instanceId: A },
      includeUngenerated: false,
    });
    expect(generated).toEqual([]);
  });

  it("a clip by id applies the viewer's exclusions and allowed instances", async () => {
    const byId = (id: string, allowedInstanceIds: string[]) =>
      clipQueryBuilder.getClipById({ userId, allowedInstanceIds, id });

    expect((await byId(OTHER, [A, B]))?.instanceId).toBe(A);
    expect((await byId(PRIMARY, [B]))?.instanceId).toBe(B);
    expect(await byId(EXCLUDED, [A, B])).toBeNull();
    expect(await byId(OF_HIDDEN, [A, B])).toBeNull();
    expect(await byId(OF_DELETED, [A, B])).toBeNull();
    expect(await byId(DELETED, [A, B])).toBeNull();
    expect(await byId(OTHER, [B])).toBeNull();
    expect(await byId(OTHER, [])).toBeNull();
  });
});
