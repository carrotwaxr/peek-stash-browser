/**
 * A tag page's Markers statistic (B3): `countRelations("tag", ...)` answers a
 * `clips` count that equals the Clips page's default list for the tag, with
 * the viewer's exclusions and instances applied (invariant 3), not Stash's
 * `sceneMarkerCount`. In process against the real test SQLite database, under
 * two made-up instances that reuse ids:
 * - tag 7892001 (T) on both; scenes 7892001 (visible), 7892002 (hidden by the
 *   viewer) and 7892003 (visible); the same ids on rc-clip-b
 * - clips on rc-clip-a: 7892101 (scene 1, primary tag T), 7892102 (scene 2,
 *   tag list T), 7892103 (scene 1, tag list T, not generated), 7892104
 *   (scene 3, no tag), 7892105 (scene 1, primary tag T, deleted)
 * - clip 7892101 on rc-clip-b (the same ids name another tag there)
 * - the tag's stored Stash count is 2 on rc-clip-a
 * Every seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { countRelations } from "../../services/RelationCounts.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "rc-clip-a";
const B = "rc-clip-b";
const INSTANCES = [A, B];
const TAG = "7892001";
const [S_SEEN, S_HIDDEN, S_OTHER] = ["7892001", "7892002", "7892003"];
const [C_PRIMARY, C_LIST_HIDDEN, C_UNGENERATED, C_UNTAGGED, C_DELETED] = [
  "7892101",
  "7892102",
  "7892103",
  "7892104",
  "7892105",
];
const USER = "rc_clip_viewer";

let userId = 0;

async function clipsOf(
  instanceId: string,
  allowed: string[],
  user = userId
): Promise<number> {
  const counts = await countRelations(
    "tag",
    { id: TAG, instanceId },
    { userId: user, allowedInstanceIds: allowed, depth: undefined }
  );
  return counts.clips;
}

async function removeRows(): Promise<void> {
  await prisma.user.deleteMany({ where: { username: USER } });
  const where = { stashInstanceId: { in: INSTANCES } };
  await prisma.stashClip.deleteMany({ where });
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

async function seed(): Promise<void> {
  await prisma.stashTag.createMany({
    data: [
      {
        id: TAG,
        stashInstanceId: A,
        name: "RC clip tag A",
        sceneMarkerCount: 2,
      },
      {
        id: TAG,
        stashInstanceId: B,
        name: "RC clip tag B",
        sceneMarkerCount: 1,
      },
    ],
  });
  await prisma.stashScene.createMany({
    data: INSTANCES.flatMap((i) =>
      [S_SEEN, S_HIDDEN, S_OTHER].map((id) => ({
        id,
        stashInstanceId: i,
        title: `Scene ${id} ${i}`,
      }))
    ),
  });
  const clip = (
    id: string,
    instance: string,
    sceneId: string,
    extra: Record<string, unknown> = {}
  ) => ({
    id,
    stashInstanceId: instance,
    sceneId,
    sceneInstanceId: instance,
    title: `Clip ${id} ${instance}`,
    seconds: 1,
    isGenerated: true,
    ...extra,
  });
  await prisma.stashClip.createMany({
    data: [
      clip(C_PRIMARY, A, S_SEEN, {
        primaryTagId: TAG,
        primaryTagInstanceId: A,
      }),
      clip(C_LIST_HIDDEN, A, S_HIDDEN),
      clip(C_UNGENERATED, A, S_SEEN, { isGenerated: false }),
      clip(C_UNTAGGED, A, S_OTHER),
      clip(C_DELETED, A, S_SEEN, {
        primaryTagId: TAG,
        primaryTagInstanceId: A,
        deletedAt: new Date(),
      }),
      clip(C_PRIMARY, B, S_SEEN, {
        primaryTagId: TAG,
        primaryTagInstanceId: B,
      }),
    ],
  });
  await prisma.clipTag.createMany({
    data: [C_LIST_HIDDEN, C_UNGENERATED].map((clipId) => ({
      clipId,
      clipInstanceId: A,
      tagId: TAG,
      tagInstanceId: A,
    })),
  });
  const user = await prisma.user.create({
    data: { username: USER, password: "not-a-real-hash", role: "USER" },
  });
  userId = user.id;
  await prisma.userExcludedEntity.create({
    data: {
      userId,
      entityType: "scene",
      entityId: S_HIDDEN,
      instanceId: A,
      reason: "hidden",
    },
  });
}

describeWithDb("A tag's clips count (integration)", () => {
  beforeAll(async () => {
    await removeRows();
    await seed();
  });

  afterAll(async () => {
    await removeRows();
  });

  it("a tag's clips count only the clips the viewer can see", async () => {
    // Two generated clips carry the tag (and Stash counts 2), but one sits on
    // the scene the viewer hid
    expect(await clipsOf(A, [A, B])).toBe(1);
  });

  it("an ungenerated clip with the tag is not counted", async () => {
    // C_UNGENERATED holds the tag on a visible scene; the Clips page's
    // default list leaves it out, so the statistic does
    const everyone = await prisma.user.create({
      data: { username: `${USER}_2`, password: "x", role: "USER" },
    });
    try {
      // With no exclusions: C_PRIMARY and C_LIST_HIDDEN count, C_UNGENERATED
      // and the deleted clip do not
      expect(await clipsOf(A, [A, B], everyone.id)).toBe(2);
    } finally {
      await prisma.user.delete({ where: { id: everyone.id } });
    }
  });

  it("another instance's same-id clips and a disallowed instance are not counted", async () => {
    expect(await clipsOf(B, [A, B])).toBe(1);
    expect(await clipsOf(A, [B])).toBe(0);
  });
});
