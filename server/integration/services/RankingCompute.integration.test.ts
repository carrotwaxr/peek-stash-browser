/**
 * Rankings count live entities only (item 41.4, UD-13), against the real test
 * SQLite database.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do:
 * - rank-it-a: performer P, studio S and tag T are on scenes 1 to 3 (live)
 *   and 4 and 5 (soft-deleted, each 50,000,000 s long); performer X, studio
 *   SX and tag TX are soft-deleted, and on live scene 6
 * - rank-it-a: performer Y on live scenes 7 and 8, which U opened and
 *   abandoned (no play, no O); performer D on live scenes 9 (played today)
 *   and 10 (last played 800 days ago); performer K on live scene 11, which
 *   U watched 150 s of without a play
 * - rank-it-b: performer P, under another name, on scene 1
 *
 * User U has stats rows for P, X, S, SX, T and TX, and watch history on A's
 * scenes 1, 4 and 6 to 11 and B's scene 1; the rankings are computed from
 * the history. Every seeded row is deleted before the file ends.
 *
 * Scenes are ranked when the stats page reads them, from the watch history;
 * only performers, studios and tags are stored.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { rankingComputeService } from "../../services/RankingComputeService.js";
import { userStatsAggregationService } from "../../services/UserStatsAggregationService.js";
import { must } from "../../tests/helpers/must.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "rank-it-a";
const B = "rank-it-b";
const USERNAME = "rank-it-u";

const P = "7830001";
const X = "7830002";
const S = "7830101";
const SX = "7830102";
const T = "7830201";
const TX = "7830202";
const Y = "7830003";
const D = "7830004";
const K = "7830005";
const SCENE = (n: number) => `783030${n}`;
const DAY_MS = 24 * 60 * 60 * 1000;

const LIVE_DURATION = 600;
const DELETED_DURATION = 50_000_000;

let u: number;

async function removeRows(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { username: USERNAME } });
  if (user) {
    // No relation to User on these four: they are deleted by hand
    const own = { where: { userId: user.id } };
    await prisma.userPerformerStats.deleteMany(own);
    await prisma.userStudioStats.deleteMany(own);
    await prisma.userTagStats.deleteMany(own);
    await prisma.userEntityRanking.deleteMany(own);
    await prisma.user.delete({ where: { id: user.id } });
  }
  const where = { stashInstanceId: { in: [A, B] } };
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

async function seed(): Promise<void> {
  const deletedAt = new Date();
  const named = (id: string, instance: string, name: string, gone = false) => ({
    id,
    stashInstanceId: instance,
    name,
    ...(gone ? { deletedAt } : {}),
  });
  await prisma.stashPerformer.createMany({
    data: [
      named(P, A, "Rank A performer"),
      named(P, B, "Rank B performer"),
      named(X, A, "Rank deleted performer", true),
      named(Y, A, "Rank abandoned performer"),
      named(D, A, "Rank decayed performer"),
      named(K, A, "Rank partly watched performer"),
    ],
  });
  await prisma.stashStudio.createMany({
    data: [named(S, A, "Rank studio"), named(SX, A, "Rank gone studio", true)],
  });
  await prisma.stashTag.createMany({
    data: [named(T, A, "Rank tag"), named(TX, A, "Rank gone tag", true)],
  });

  const scene = (n: number, instance: string, studioId: string | null) => ({
    id: SCENE(n),
    stashInstanceId: instance,
    title: `Rank scene ${n}`,
    studioId,
    duration: n === 4 || n === 5 ? DELETED_DURATION : LIVE_DURATION,
    ...(n === 4 || n === 5 ? { deletedAt } : {}),
  });
  await prisma.stashScene.createMany({
    data: [
      ...[1, 2, 3, 4, 5].map((n) => scene(n, A, S)),
      scene(6, A, SX),
      ...[7, 8, 9, 10, 11].map((n) => scene(n, A, null)),
      scene(1, B, null),
    ],
  });
  await prisma.scenePerformer.createMany({
    data: [
      ...[1, 2, 3, 4, 5].map((n) => ({
        sceneId: SCENE(n),
        sceneInstanceId: A,
        performerId: P,
        performerInstanceId: A,
      })),
      {
        sceneId: SCENE(6),
        sceneInstanceId: A,
        performerId: X,
        performerInstanceId: A,
      },
      {
        sceneId: SCENE(1),
        sceneInstanceId: B,
        performerId: P,
        performerInstanceId: B,
      },
      ...[
        [7, Y],
        [8, Y],
        [9, D],
        [10, D],
        [11, K],
      ].map(([n, performerId]) => ({
        sceneId: SCENE(Number(n)),
        sceneInstanceId: A,
        performerId: String(performerId),
        performerInstanceId: A,
      })),
    ],
  });
  await prisma.sceneTag.createMany({
    data: [
      ...[1, 2, 3, 4, 5].map((n) => ({
        sceneId: SCENE(n),
        sceneInstanceId: A,
        tagId: T,
        tagInstanceId: A,
      })),
      { sceneId: SCENE(6), sceneInstanceId: A, tagId: TX, tagInstanceId: A },
    ],
  });

  u = (
    await prisma.user.create({
      data: { username: USERNAME, password: "not-a-real-hash", role: "USER" },
    })
  ).id;

  // The deleted entities are the most engaged, so a top list that counted
  // them would lead with them
  const live = { playCount: 3, oCounter: 1 };
  const gone = { playCount: 5, oCounter: 2 };
  await prisma.userPerformerStats.createMany({
    data: [
      { userId: u, instanceId: A, performerId: P, ...live },
      { userId: u, instanceId: B, performerId: P, playCount: 1 },
      { userId: u, instanceId: A, performerId: X, ...gone },
    ],
  });
  await prisma.userStudioStats.createMany({
    data: [
      { userId: u, instanceId: A, studioId: S, ...live },
      { userId: u, instanceId: A, studioId: SX, ...gone },
    ],
  });
  await prisma.userTagStats.createMany({
    data: [
      { userId: u, instanceId: A, tagId: T, ...live },
      { userId: u, instanceId: A, tagId: TX, ...gone },
    ],
  });
  await prisma.watchHistory.createMany({
    data: [
      {
        userId: u,
        instanceId: A,
        sceneId: SCENE(1),
        playCount: 1,
        playDuration: 300,
      },
      {
        userId: u,
        instanceId: A,
        sceneId: SCENE(4),
        playCount: 2,
        oCount: 1,
        playDuration: 600,
      },
      {
        userId: u,
        instanceId: A,
        sceneId: SCENE(6),
        playCount: 1,
        playDuration: 100,
      },
      { userId: u, instanceId: B, sceneId: SCENE(1), playCount: 1 },
      // Opened and abandoned: no play, no O
      ...[7, 8].map((n) => ({
        userId: u,
        instanceId: A,
        sceneId: SCENE(n),
        playDuration: 30,
      })),
      {
        userId: u,
        instanceId: A,
        sceneId: SCENE(9),
        playCount: 1,
        lastPlayedAt: new Date(),
      },
      {
        userId: u,
        instanceId: A,
        sceneId: SCENE(10),
        playCount: 2,
        lastPlayedAt: new Date(Date.now() - 800 * DAY_MS),
      },
      // Two and a half minutes watched, short of a play
      { userId: u, instanceId: A, sceneId: SCENE(11), playDuration: 150 },
    ],
  });
}

const statsOf = (userId: number) =>
  userStatsAggregationService.getUserStats(userId, {
    allowedInstanceIds: [A, B],
  });

async function rankingsOf(entityType: string) {
  const rows = await prisma.userEntityRanking.findMany({
    where: { userId: u, entityType },
  });
  return new Map(rows.map((r) => [`${r.entityId}:${r.instanceId}`, r]));
}

describeWithDb("Ranking compute (integration)", () => {
  beforeAll(async () => {
    await removeRows();
    await seed();
    await rankingComputeService.recomputeAllRankings(u);
  }, 60000);

  afterAll(async () => {
    await removeRows();
  }, 60000);

  it("a soft-deleted performer gets no ranking and never shows in top performers", async () => {
    const performers = await rankingsOf("performer");
    expect([...performers.keys()].sort()).toEqual(
      [`${D}:${A}`, `${K}:${A}`, `${P}:${A}`, `${P}:${B}`, `${Y}:${A}`].sort()
    );

    const stats = await statsOf(u);
    expect(stats.topPerformers.map((p) => p.id)).not.toContain(X);
    expect(stats.topPerformers).toHaveLength(5);
  });

  it("the top list names A's performer, not B's same id", async () => {
    const stats = await statsOf(u);

    // A's P is the more engaged: a play and 300 s against B's one play
    expect(
      stats.topPerformers
        .filter((p) => p.id === P)
        .map((p) => [p.name, p.instanceId])
    ).toEqual([
      ["Rank A performer", A],
      ["Rank B performer", B],
    ]);
  });

  it("a performer whose scenes were only opened and abandoned is ranked, with a negative affinity", async () => {
    const abandoned = must((await rankingsOf("performer")).get(`${Y}:${A}`));

    expect(abandoned.playCount).toBe(0);
    expect(abandoned.oCount).toBe(0);
    expect(abandoned.openedCount).toBe(2);
    expect(abandoned.keptCount).toBe(0);
    expect(abandoned.affinity).toBeLessThan(0);

    // P on A, opened once and kept, likes rather than dislikes
    const kept = must((await rankingsOf("performer")).get(`${P}:${A}`));
    expect(kept.openedCount).toBe(1);
    expect(kept.keptCount).toBe(1);
    expect(kept.affinity).toBeGreaterThan(abandoned.affinity);
  });

  it("a 150 s watch without a play counts as kept; a 30 s one does not", async () => {
    const performers = await rankingsOf("performer");
    const partly = must(performers.get(`${K}:${A}`));

    expect(partly.playCount).toBe(0);
    expect(partly.openedCount).toBe(1);
    expect(partly.keptCount).toBe(1);
    expect(must(performers.get(`${Y}:${A}`)).keptCount).toBe(0);
    expect(partly.affinity).toBeGreaterThan(
      must(performers.get(`${Y}:${A}`)).affinity
    );
  });

  it("a play last made 800 days ago, or never dated, counts a quarter in the decayed sums", async () => {
    const rows = await rankingComputeService["performerStats"](u, Date.now());
    const of = (id: string) =>
      must(rows.find((r) => r.entityId === id && r.instanceId === A));

    // Scene 9's play today counts whole, scene 10's two plays a quarter each
    expect(Number(of(D).playCount)).toBe(3);
    expect(Number(of(D).decayedPlayCount)).toBeCloseTo(1 + 0.25 * 2, 9);
    // Scene 1's play has no lastPlayedAt
    expect(Number(of(P).decayedPlayCount)).toBeCloseTo(0.25, 9);
    expect(Number(of(P).decayedPlayDuration)).toBeCloseTo(0.25 * 300, 9);
  });

  it("soft-deleted studios and tags get no ranking, and no scene ranking is stored", async () => {
    expect([...(await rankingsOf("studio")).keys()]).toEqual([`${S}:${A}`]);
    expect([...(await rankingsOf("tag")).keys()]).toEqual([`${T}:${A}`]);
    expect([...(await rankingsOf("scene")).keys()]).toEqual([]);
  });

  it("top scenes leave out the soft-deleted scene", async () => {
    const stats = await statsOf(u);

    // Scene 4 has the most plays and an O, but is deleted
    const top = stats.topScenes.map((s) => [s.id, s.instanceId]);
    expect(top).not.toContainEqual([SCENE(4), A]);
    expect(top).toContainEqual([SCENE(1), A]);
    expect(top).toContainEqual([SCENE(6), A]);
  });

  it("libraryPresence and the average duration count live scenes only", async () => {
    const [live] = await prisma.$queryRaw<Array<{ avg: number }>>`
      SELECT AVG(duration) AS avg FROM StashScene
      WHERE duration > 0 AND deletedAt IS NULL
    `;
    const average = await rankingComputeService["getAverageSceneDuration"]();
    expect(average).toBeCloseTo(must(live).avg, 6);

    // P, S and T are each on three live scenes of A and two deleted ones;
    // only live scene 1's play and 300 s of watching count, not deleted
    // scene 4's (nor the stats rows, which the rankings no longer read)
    const onA = [
      must((await rankingsOf("performer")).get(`${P}:${A}`)),
      must((await rankingsOf("studio")).get(`${S}:${A}`)),
      must((await rankingsOf("tag")).get(`${T}:${A}`)),
    ];
    for (const ranking of onA) {
      expect(ranking.libraryPresence).toBe(3);
      expect(ranking.playDuration).toBe(300);
      expect(ranking.playCount).toBe(1);
      expect(ranking.oCount).toBe(0);
      expect(ranking.engagementScore).toBeCloseTo(0 * 5 + 300 / average + 1);
    }

    // B's performer with the same id counts B's one scene
    const onB = must((await rankingsOf("performer")).get(`${P}:${B}`));
    expect(onB.libraryPresence).toBe(1);
    expect(onB.playDuration).toBe(0);
  });
});
