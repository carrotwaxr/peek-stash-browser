/**
 * "Scenes like this" against the real test SQLite database (item 26).
 *
 * Two made-up instances reuse the same scene id, as two Stash servers do.
 * The seed scene SEED lives on both:
 * - sim-it-a: SEED shares performer P with C_PERF, studio S with C_STUDIO
 *   and tag T with C_TAG; DELETED shares P but is soft-deleted; C_PERF also
 *   exists on B
 * - sim-it-b: SEED shares performer Q with C_PERF and B_ONLY
 *
 * User U has 40,000 scene exclusion rows on A, one of them C_TAG. Every
 * seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { stashEntityService } from "../../services/StashEntityService.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "sim-it-a";
const B = "sim-it-b";
const USERNAME = "sim-it-u";
const EXCLUSIONS = 40_000;

const SEED = "7820001";
const C_PERF = "7820002";
const C_STUDIO = "7820003";
const C_TAG = "7820004";
const B_ONLY = "7820005";
const DELETED = "7820006";
const P = "7820101";
const Q = "7820102";
const S = "7820201";
const T = "7820301";

let u: number;
let v: number;

const keys = (rows: Array<{ sceneId: string; instanceId: string }>) =>
  rows.map((row) => `${row.sceneId}:${row.instanceId}`);

async function removeRows(): Promise<void> {
  await prisma.user.deleteMany({
    where: { username: { in: [USERNAME, `${USERNAME}-v`] } },
  });
  const where = { stashInstanceId: { in: [A, B] } };
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

async function seed(): Promise<void> {
  const named = (id: string, instance: string) => ({
    id,
    stashInstanceId: instance,
    name: `Sim ${id} ${instance}`,
  });
  await prisma.stashPerformer.createMany({ data: [named(P, A), named(Q, B)] });
  await prisma.stashStudio.createMany({ data: [named(S, A)] });
  await prisma.stashTag.createMany({ data: [named(T, A)] });

  const scene = (
    id: string,
    instance: string,
    extra: { studioId?: string; date?: string; deletedAt?: Date } = {}
  ) => ({ id, stashInstanceId: instance, title: `Sim ${id}`, ...extra });
  await prisma.stashScene.createMany({
    data: [
      scene(SEED, A, { studioId: S, date: "2024-01-01" }),
      scene(C_PERF, A, { date: "2024-01-02" }),
      scene(C_STUDIO, A, { studioId: S, date: "2024-01-03" }),
      scene(C_TAG, A, { date: "2024-01-04" }),
      scene(DELETED, A, { deletedAt: new Date() }),
      scene(SEED, B),
      scene(C_PERF, B),
      scene(B_ONLY, B),
    ],
  });

  const perf = (sceneId: string, instance: string, performerId: string) => ({
    sceneId,
    sceneInstanceId: instance,
    performerId,
    performerInstanceId: instance,
  });
  await prisma.scenePerformer.createMany({
    data: [
      perf(SEED, A, P),
      perf(C_PERF, A, P),
      perf(DELETED, A, P),
      perf(SEED, B, Q),
      perf(C_PERF, B, Q),
      perf(B_ONLY, B, Q),
    ],
  });
  await prisma.sceneTag.createMany({
    data: [
      { sceneId: SEED, sceneInstanceId: A, tagId: T, tagInstanceId: A },
      { sceneId: C_TAG, sceneInstanceId: A, tagId: T, tagInstanceId: A },
    ],
  });

  u = (
    await prisma.user.create({
      data: { username: USERNAME, password: "not-a-real-hash", role: "USER" },
    })
  ).id;
  v = (
    await prisma.user.create({
      data: {
        username: `${USERNAME}-v`,
        password: "not-a-real-hash",
        role: "USER",
      },
    })
  ).id;

  // 39,999 made-up scene ids plus one real candidate, all on A
  await prisma.$executeRawUnsafe(
    `INSERT INTO UserExcludedEntity (userId, entityType, entityId, instanceId, reason, computedAt)
     WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
     SELECT ?, 'scene', 'sim-x-' || i, ?, 'restricted', CURRENT_TIMESTAMP FROM n`,
    EXCLUSIONS - 1,
    u,
    A
  );
  await prisma.userExcludedEntity.create({
    data: {
      userId: u,
      entityType: "scene",
      entityId: C_TAG,
      instanceId: A,
      reason: "restricted",
    },
  });
}

describeWithDb("Similar scenes (integration)", () => {
  beforeAll(async () => {
    await removeRows();
    await seed();
  }, 60000);

  afterAll(async () => {
    await removeRows();
  }, 60000);

  it("a user with 40,000 excluded scenes gets candidates, not an error", async () => {
    const count = await prisma.userExcludedEntity.count({
      where: { userId: u, entityType: "scene" },
    });
    expect(count).toBe(EXCLUSIONS);

    const candidates = await stashEntityService.getSimilarSceneCandidates(
      { id: SEED, instanceId: A },
      u,
      500
    );
    expect(keys(candidates)).toEqual([`${C_PERF}:${A}`, `${C_STUDIO}:${A}`]);
  });

  it("candidates come from the seed's instance only", async () => {
    const fromA = await stashEntityService.getSimilarSceneCandidates(
      { id: SEED, instanceId: A },
      v,
      500
    );
    expect(keys(fromA)).toEqual([
      `${C_PERF}:${A}`,
      `${C_STUDIO}:${A}`,
      `${C_TAG}:${A}`,
    ]);
    expect(fromA.map((c) => c.weight)).toEqual([3, 2, 1]);

    const fromB = await stashEntityService.getSimilarSceneCandidates(
      { id: SEED, instanceId: B },
      v,
      500
    );
    expect(keys(fromB).sort()).toEqual([`${C_PERF}:${B}`, `${B_ONLY}:${B}`]);
  });

  it("an excluded candidate is neither listed nor counted", async () => {
    const candidates = await stashEntityService.getSimilarSceneCandidates(
      { id: SEED, instanceId: A },
      u,
      500
    );
    expect(candidates).toHaveLength(2);
    expect(keys(candidates)).not.toContain(`${C_TAG}:${A}`);
  });

  it("an excluded ref is not returned", async () => {
    // The page fetch honours the exclusion too, whatever refs it is given
    const { scenes } = await sceneQueryBuilder.getByRefs({
      userId: u,
      refs: [C_PERF, C_STUDIO, C_TAG].map((id) => ({ id, instanceId: A })),
      allowedInstanceIds: [A, B],
    });
    expect(scenes.map((s) => s.id).sort()).toEqual([C_PERF, C_STUDIO]);

    const { scenes: forV } = await sceneQueryBuilder.getByRefs({
      userId: v,
      refs: [C_PERF, C_STUDIO, C_TAG].map((id) => ({ id, instanceId: A })),
      allowedInstanceIds: [A, B],
    });
    expect(forV.map((s) => s.id).sort()).toEqual([C_PERF, C_STUDIO, C_TAG]);
  });

  it("the seed is never its own candidate", async () => {
    for (const instanceId of [A, B]) {
      const candidates = await stashEntityService.getSimilarSceneCandidates(
        { id: SEED, instanceId },
        v,
        500
      );
      expect(candidates.map((c) => c.sceneId)).not.toContain(SEED);
    }
  });

  it("a deleted scene is not a candidate", async () => {
    const candidates = await stashEntityService.getSimilarSceneCandidates(
      { id: SEED, instanceId: A },
      v,
      500
    );
    expect(candidates.map((c) => c.sceneId)).not.toContain(DELETED);
  });

  it("a candidate id present on both instances is listed once, for the seed's instance", async () => {
    const candidates = await stashEntityService.getSimilarSceneCandidates(
      { id: SEED, instanceId: A },
      v,
      500
    );
    const copies = candidates.filter((c) => c.sceneId === C_PERF);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.instanceId).toBe(A);

    const { scenes } = await sceneQueryBuilder.getByRefs({
      userId: v,
      refs: [{ id: C_PERF, instanceId: A }],
      allowedInstanceIds: [A, B],
    });
    expect(scenes.map((s) => `${s.id}:${s.instanceId}`)).toEqual([
      `${C_PERF}:${A}`,
    ]);
  });
});
