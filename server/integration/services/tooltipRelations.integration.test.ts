/**
 * Tooltip relations against the real test SQLite database (item 11).
 *
 * The tag, studio, performer and group builders list related entities for
 * card tooltips. A related entity the user can't see (hidden, restricted,
 * deleted, or on an instance they don't use) is left out, because its
 * exclusion doesn't cascade to the row that lists it.
 *
 * The scene, gallery and clip builders load their rows' performers, tags
 * and studios the same way, keyed in memory by (id, instance): the fixture's
 * SAME id is a scene, gallery, performer, tag and studio on both A and B,
 * named after its instance, so a key that dropped the instance would name
 * one instance's relations from the other's.
 *
 * Each card lists at most TOOLTIP_LIMIT related entities per relation, most
 * shared scenes (or, through a tag, the largest) first, then by name, and
 * says how many the user can see in relation_totals (item 41.2). Scenes that
 * sync soft-deleted never link a performer to a studio or collection.
 *
 * The fixture seeds entities on made-up instances (see
 * helpers/accessFixture.ts), plus the capped-relations fixture below. Users:
 * - u: the default hides, which include HIDDEN_A's performer and tag on A
 * - v: no hides
 * - w: hides TIP.P15 on A
 * - h1: hides TIP.HS_ONLY, R's only scene in S3 and GH
 * - h2: hides TIP.HS_Z1, one of R's two scenes in S4
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  hideFixtureDefaults,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import { recordStatements } from "../helpers/statementRecorder.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

async function createUser(username: string): Promise<number> {
  const user = await prisma.user.create({
    data: { username, password: "not-a-real-hash", role: "USER" },
  });
  return user.id;
}

/**
 * A builder's request parts for one entity on instance A: its bare
 * id, the detail page's instance.
 */
const byIdOnAParts = (id: string) => ({
  filter: {
    ids: {
      refs: [{ id, instanceId: undefined }],
      modifier: "INCLUDES" as const,
      depth: 0,
    },
  },
  specificInstanceId: FX.A,
});

/** A builder's options for one entity on instance A */
const listedOnA = (userId: number) => ({
  userId,
  allowedInstanceIds: [FX.A, FX.B],
});

const ids = (refs: Array<{ id: string }> | undefined) =>
  (refs ?? []).map((r) => r.id).sort();

async function tagPerformers(userId: number) {
  const { items: tags } = await tagQueryBuilder.execute({
    ...listedOnA(userId),
    request: parsedListRequest("tag", byIdOnAParts(FX_ID.SAME)),
  });
  expect(tags).toHaveLength(1);
  return ids(tags[0]?.performers);
}

async function studioTags(userId: number) {
  const { items: studios } = await studioQueryBuilder.execute({
    ...listedOnA(userId),
    request: parsedListRequest("studio", byIdOnAParts(FX_ID.SAME)),
  });
  expect(studios).toHaveLength(1);
  return ids(studios[0]?.tags);
}

async function performerTags(userId: number) {
  const { items: performers } = await performerQueryBuilder.execute({
    ...listedOnA(userId),
    request: parsedListRequest("performer", byIdOnAParts(FX_ID.VISIBLE_A)),
  });
  expect(performers).toHaveLength(1);
  return ids(performers[0]?.tags);
}

async function groupTags(userId: number) {
  const { items: groups } = await groupQueryBuilder.execute({
    ...listedOnA(userId),
    request: parsedListRequest("group", byIdOnAParts(FX_ID.SAME)),
  });
  expect(groups).toHaveLength(1);
  return ids(groups[0]?.tags);
}

/**
 * Links SAME's scene, gallery and a clip on each of A and B to SAME's
 * performer, tag and studio on the same instance.
 */
async function linkSameOnBothInstances(): Promise<void> {
  const { SAME } = FX_ID;
  for (const inst of [FX.A, FX.B]) {
    await prisma.stashScene.update({
      where: { id_stashInstanceId: { id: SAME, stashInstanceId: inst } },
      data: { studioId: SAME },
    });
    await prisma.stashGallery.update({
      where: { id_stashInstanceId: { id: SAME, stashInstanceId: inst } },
      data: { studioId: SAME },
    });
  }
  const scene = { sceneId: SAME };
  await prisma.scenePerformer.createMany({
    data: [FX.A, FX.B].map((inst) => ({
      ...scene,
      sceneInstanceId: inst,
      performerId: SAME,
      performerInstanceId: inst,
    })),
  });
  await prisma.sceneTag.createMany({
    data: [FX.A, FX.B].map((inst) => ({
      ...scene,
      sceneInstanceId: inst,
      tagId: SAME,
      tagInstanceId: inst,
    })),
  });
  await prisma.galleryPerformer.createMany({
    data: [FX.A, FX.B].map((inst) => ({
      galleryId: SAME,
      galleryInstanceId: inst,
      performerId: SAME,
      performerInstanceId: inst,
    })),
  });
  await prisma.galleryTag.createMany({
    data: [FX.A, FX.B].map((inst) => ({
      galleryId: SAME,
      galleryInstanceId: inst,
      tagId: SAME,
      tagInstanceId: inst,
    })),
  });
  // The fixture's clip SAME is on A only; add its twin on B
  await prisma.stashClip.create({
    data: {
      id: SAME,
      stashInstanceId: FX.B,
      sceneId: SAME,
      sceneInstanceId: FX.B,
      seconds: 1,
    },
  });
  for (const inst of [FX.A, FX.B]) {
    await prisma.stashClip.update({
      where: { id_stashInstanceId: { id: SAME, stashInstanceId: inst } },
      data: { primaryTagId: SAME, primaryTagInstanceId: inst },
    });
  }
  await prisma.clipTag.createMany({
    data: [FX.A, FX.B].map((inst) => ({
      clipId: SAME,
      clipInstanceId: inst,
      tagId: SAME,
      tagInstanceId: inst,
    })),
  });
}

/** The name the fixture gives SAME on an instance */
const sameName = (instanceId: string | null | undefined) =>
  `${instanceId === FX.A ? "A" : "B"}-${FX_ID.SAME}`;

const names = (refs: Array<{ name: string }> | undefined) =>
  (refs ?? []).map((r) => r.name);

/**
 * The capped-relations fixture, on A unless named otherwise:
 * - studio S with 15 live scenes, scene i having performer P<i> and group
 *   G<i>, and one soft-deleted scene with performer X and group Y
 * - tag T on P01..P15; P01..P13 have 1..13 scenes, P14 and P15 20 each
 * - performer Q with 20 tags of its own
 * - 100 more studios, for a full page
 * - on B, rows with A's ids: S and S2, scene 1 in S (with Q@B), scene 2 in
 *   S2 (with P01@B and G02@B), and T on Q@B. Every one would appear under
 *   A's S, T or P01 if a join dropped the instance.
 * - performer R with scenes HS_Z1 and HS_Z2 in studio S4 and HS_ONLY in
 *   studio S3 and group GH: S4 comes first by shared scenes, S3 by name
 */
const pad = (i: number) => String(i).padStart(2, "0");
const TIP = {
  S: "7710100",
  S2: "7710101",
  T: "7710400",
  X: "7710216",
  Y: "7710316",
  Q: "7710217",
  DELETED_SCENE: "7710016",
  P: (i: number) => `77102${pad(i)}`,
  G: (i: number) => `77103${pad(i)}`,
  SCENE: (i: number) => `77100${pad(i)}`,
  OWN_TAG: (i: number) => `77105${pad(i)}`,
  PAGE_STUDIO: (i: number) => `7711${String(i).padStart(3, "0")}`,
  R: "7710218",
  S3: "7710102",
  S4: "7710103",
  GH: "7710317",
  HS_Z1: "7710017",
  HS_Z2: "7710018",
  HS_ONLY: "7710019",
} as const;
const ONE_TO_15 = Array.from({ length: 15 }, (_, i) => i + 1);

async function seedCappedFixture(): Promise<void> {
  const { A, B } = FX;
  await prisma.stashStudio.createMany({
    data: [
      { id: TIP.S, stashInstanceId: A, name: "tip-S" },
      { id: TIP.S2, stashInstanceId: A, name: "tip-S2" },
      { id: TIP.S, stashInstanceId: B, name: "tip-S@B" },
      { id: TIP.S2, stashInstanceId: B, name: "tip-S2@B" },
      ...Array.from({ length: 100 }, (_, i) => ({
        id: TIP.PAGE_STUDIO(i + 1),
        stashInstanceId: A,
        name: `tip-z-page-${String(i + 1).padStart(3, "0")}`,
      })),
    ],
  });
  await prisma.stashScene.createMany({
    data: [
      ...ONE_TO_15.map((i) => ({
        id: TIP.SCENE(i),
        stashInstanceId: A,
        studioId: TIP.S,
      })),
      {
        id: TIP.DELETED_SCENE,
        stashInstanceId: A,
        studioId: TIP.S,
        deletedAt: new Date(),
      },
      { id: TIP.SCENE(1), stashInstanceId: B, studioId: TIP.S },
      { id: TIP.SCENE(2), stashInstanceId: B, studioId: TIP.S2 },
    ],
  });
  await prisma.stashPerformer.createMany({
    data: [
      ...ONE_TO_15.map((i) => ({
        id: TIP.P(i),
        stashInstanceId: A,
        name: `tip-P${pad(i)}`,
        sceneCount: i >= 14 ? 20 : i,
      })),
      { id: TIP.X, stashInstanceId: A, name: "tip-X" },
      { id: TIP.Q, stashInstanceId: A, name: "tip-Q", sceneCount: 99 },
      { id: TIP.Q, stashInstanceId: B, name: "tip-Q@B", sceneCount: 99 },
      { id: TIP.P(1), stashInstanceId: B, name: "tip-P01@B" },
    ],
  });
  await prisma.stashGroup.createMany({
    data: [
      ...ONE_TO_15.map((i) => ({
        id: TIP.G(i),
        stashInstanceId: A,
        name: `tip-G${pad(i)}`,
      })),
      { id: TIP.Y, stashInstanceId: A, name: "tip-Y" },
      { id: TIP.G(2), stashInstanceId: B, name: "tip-G02@B" },
    ],
  });
  await prisma.stashTag.createMany({
    data: [
      { id: TIP.T, stashInstanceId: A, name: "tip-T" },
      { id: TIP.T, stashInstanceId: B, name: "tip-T@B" },
      ...Array.from({ length: 20 }, (_, i) => ({
        id: TIP.OWN_TAG(i + 1),
        stashInstanceId: A,
        name: `tip-own-${pad(i + 1)}`,
      })),
    ],
  });

  const onScene = (sceneId: string, inst: string) => ({
    sceneId,
    sceneInstanceId: inst,
  });
  await prisma.scenePerformer.createMany({
    data: [
      ...ONE_TO_15.map((i) => ({
        ...onScene(TIP.SCENE(i), A),
        performerId: TIP.P(i),
        performerInstanceId: A,
      })),
      {
        ...onScene(TIP.DELETED_SCENE, A),
        performerId: TIP.X,
        performerInstanceId: A,
      },
      {
        ...onScene(TIP.SCENE(1), B),
        performerId: TIP.Q,
        performerInstanceId: B,
      },
      {
        ...onScene(TIP.SCENE(2), B),
        performerId: TIP.P(1),
        performerInstanceId: B,
      },
    ],
  });
  await prisma.sceneGroup.createMany({
    data: [
      ...ONE_TO_15.map((i) => ({
        ...onScene(TIP.SCENE(i), A),
        groupId: TIP.G(i),
        groupInstanceId: A,
      })),
      { ...onScene(TIP.DELETED_SCENE, A), groupId: TIP.Y, groupInstanceId: A },
      { ...onScene(TIP.SCENE(2), B), groupId: TIP.G(2), groupInstanceId: B },
    ],
  });
  await prisma.performerTag.createMany({
    data: [
      ...ONE_TO_15.map((i) => ({
        performerId: TIP.P(i),
        performerInstanceId: A,
        tagId: TIP.T,
        tagInstanceId: A,
      })),
      {
        performerId: TIP.Q,
        performerInstanceId: B,
        tagId: TIP.T,
        tagInstanceId: B,
      },
      ...Array.from({ length: 20 }, (_, i) => ({
        performerId: TIP.Q,
        performerInstanceId: A,
        tagId: TIP.OWN_TAG(i + 1),
        tagInstanceId: A,
      })),
    ],
  });

  await prisma.stashStudio.createMany({
    data: [
      { id: TIP.S3, stashInstanceId: A, name: "tip-S3" },
      { id: TIP.S4, stashInstanceId: A, name: "tip-S4" },
    ],
  });
  await prisma.stashPerformer.create({
    data: { id: TIP.R, stashInstanceId: A, name: "tip-R" },
  });
  await prisma.stashGroup.create({
    data: { id: TIP.GH, stashInstanceId: A, name: "tip-GH" },
  });
  await prisma.stashScene.createMany({
    data: [
      { id: TIP.HS_Z1, stashInstanceId: A, studioId: TIP.S4 },
      { id: TIP.HS_Z2, stashInstanceId: A, studioId: TIP.S4 },
      { id: TIP.HS_ONLY, stashInstanceId: A, studioId: TIP.S3 },
    ],
  });
  await prisma.scenePerformer.createMany({
    data: [TIP.HS_Z1, TIP.HS_Z2, TIP.HS_ONLY].map((sceneId) => ({
      ...onScene(sceneId, A),
      performerId: TIP.R,
      performerInstanceId: A,
    })),
  });
  await prisma.sceneGroup.create({
    data: { ...onScene(TIP.HS_ONLY, A), groupId: TIP.GH, groupInstanceId: A },
  });
}

async function studioOnA(userId: number, id: string) {
  const { items: studios } = await studioQueryBuilder.execute({
    ...listedOnA(userId),
    request: parsedListRequest("studio", byIdOnAParts(id)),
  });
  return must(studios[0], `studio ${id} on A`);
}

async function tagOnA(userId: number, id: string) {
  const { items: tags } = await tagQueryBuilder.execute({
    ...listedOnA(userId),
    request: parsedListRequest("tag", byIdOnAParts(id)),
  });
  return must(tags[0], `tag ${id} on A`);
}

async function performerOnA(userId: number, id: string) {
  const { items: performers } = await performerQueryBuilder.execute({
    ...listedOnA(userId),
    request: parsedListRequest("performer", byIdOnAParts(id)),
  });
  return must(performers[0], `performer ${id} on A`);
}

async function groupOnA(userId: number, id: string) {
  const { items: groups } = await groupQueryBuilder.execute({
    ...listedOnA(userId),
    request: parsedListRequest("group", byIdOnAParts(id)),
  });
  return must(groups[0], `group ${id} on A`);
}

/** Ids in the order the response lists them */
const inOrder = (refs: Array<{ id: string }> | undefined) =>
  (refs ?? []).map((r) => r.id);

describeWithDb("Tooltip relations (integration)", () => {
  let u: number;
  let v: number;

  let w: number;
  let h1: number;
  let h2: number;

  beforeAll(async () => {
    await seedAccessFixture();
    await seedCappedFixture();
    u = await createUser("access-it-tip-u");
    v = await createUser("access-it-tip-v");
    w = await createUser("access-it-tip-w");
    await hideFixtureDefaults(u);
    await hideFor(w, "performer", TIP.P(15), FX.A);
    h1 = await createUser("access-it-tip-h1");
    h2 = await createUser("access-it-tip-h2");
    await hideFor(h1, "scene", TIP.HS_ONLY, FX.A);
    await hideFor(h2, "scene", TIP.HS_Z1, FX.A);
  }, 60000);

  afterAll(async () => {
    await clearAccessFixture();
  }, 60000);

  it("tag tooltips drop hidden performers", async () => {
    expect(await tagPerformers(u)).toEqual([FX_ID.VISIBLE_A]);
  });

  it("studio tooltips drop hidden tags", async () => {
    expect(await studioTags(u)).toEqual([FX_ID.VISIBLE_A]);
  });

  it("performer tooltips drop hidden tags", async () => {
    expect(await performerTags(u)).toEqual([FX_ID.SAME, FX_ID.VISIBLE_A]);
  });

  it("group tooltips drop hidden tags", async () => {
    expect(await groupTags(u)).toEqual([FX_ID.VISIBLE_A]);
  });

  it("an unrestricted user still sees every relation", async () => {
    expect(await tagPerformers(v)).toEqual([FX_ID.HIDDEN_A, FX_ID.VISIBLE_A]);
    expect(await studioTags(v)).toEqual([FX_ID.HIDDEN_A, FX_ID.VISIBLE_A]);
    expect(await performerTags(v)).toEqual([
      FX_ID.SAME,
      FX_ID.HIDDEN_A,
      FX_ID.VISIBLE_A,
    ]);
    expect(await groupTags(v)).toEqual([FX_ID.HIDDEN_A, FX_ID.VISIBLE_A]);
  });

  it("a studio's performers total counts 15 visible performers and lists none", async () => {
    const studio = await studioOnA(v, TIP.S);

    // X is only in the deleted scene
    expect(studio.relation_totals?.performers).toBe(15);
    expect(studio.performers).toBeUndefined();
  });

  it("a tag lists 12 of its 15 performers, most scenes first, with total 15", async () => {
    const tag = await tagOnA(v, TIP.T);

    expect(inOrder(tag.performers)).toEqual([
      TIP.P(14),
      TIP.P(15),
      ...[13, 12, 11, 10, 9, 8, 7, 6, 5, 4].map(TIP.P),
    ]);
    expect(tag.relation_totals?.performers).toBe(15);
  });

  it("a performer's studios and groups leave out those reached only through a deleted scene", async () => {
    const x = await performerOnA(v, TIP.X);
    expect(inOrder(x.studios)).toEqual([]);
    expect(inOrder(x.groups)).toEqual([]);
    expect(x.relation_totals).toMatchObject({ studios: 0, groups: 0 });

    const y = await groupOnA(v, TIP.Y);
    expect(inOrder(y.performers)).toEqual([]);
    expect(y.relation_totals?.performers).toBe(0);

    const p01 = await performerOnA(v, TIP.P(1));
    expect(inOrder(p01.studios)).toEqual([TIP.S]);
    expect(inOrder(p01.groups)).toEqual([TIP.G(1)]);
    const g01 = await groupOnA(v, TIP.G(1));
    expect(inOrder(g01.performers)).toEqual([TIP.P(1)]);
  });

  it("a hidden performer is neither listed nor counted", async () => {
    const studio = await studioOnA(w, TIP.S);
    expect(studio.relation_totals?.performers).toBe(14);

    const tag = await tagOnA(w, TIP.T);
    expect(inOrder(tag.performers)).toEqual(
      [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map(TIP.P)
    );
    expect(tag.relation_totals?.performers).toBe(14);
  });

  it("a performer's card does not name a studio it shares only a scene the viewer hid", async () => {
    const seen = await performerOnA(v, TIP.R);
    expect(inOrder(seen.studios)).toEqual([TIP.S4, TIP.S3]);
    expect(inOrder(seen.groups)).toEqual([TIP.GH]);

    const r = await performerOnA(h1, TIP.R);
    expect(inOrder(r.studios)).toEqual([TIP.S4]);
    expect(inOrder(r.groups)).toEqual([]);
    expect(r.relation_totals).toMatchObject({ studios: 1, groups: 0 });

    // The other two paths through scenes: a studio's and a group's
    const s3 = await studioOnA(h1, TIP.S3);
    expect(s3.relation_totals?.performers).toBe(0);
    expect((await studioOnA(v, TIP.S3)).relation_totals?.performers).toBe(1);
    const gh = await groupOnA(h1, TIP.GH);
    expect(inOrder(gh.performers)).toEqual([]);
    expect(gh.relation_totals?.performers).toBe(0);
    expect(inOrder((await groupOnA(v, TIP.GH)).performers)).toEqual([TIP.R]);
  });

  it("a shared scene the viewer hid does not count toward the order weight", async () => {
    // Two shared scenes put S4 first; with one hidden the two tie on one
    // and go by name
    const r = await performerOnA(h2, TIP.R);
    expect(inOrder(r.studios)).toEqual([TIP.S3, TIP.S4]);
    expect(r.relation_totals?.studios).toBe(2);
  });

  it("B's same-id rows never appear under A's parents", async () => {
    const studio = await studioOnA(v, TIP.S);
    expect(studio.relation_totals?.performers).toBe(15);

    const tag = await tagOnA(v, TIP.T);
    expect(inOrder(tag.performers)).not.toContain(TIP.Q);
    expect(tag.relation_totals?.performers).toBe(15);
    expect(names(tag.performers).every((n) => !n.endsWith("@B"))).toBe(true);

    const p01 = await performerOnA(v, TIP.P(1));
    expect(inOrder(p01.studios)).toEqual([TIP.S]);
    expect(inOrder(p01.groups)).toEqual([TIP.G(1)]);
    expect(p01.relation_totals).toMatchObject({ studios: 1, groups: 1 });
  });

  it("own tags are not capped", async () => {
    const q = await performerOnA(v, TIP.Q);

    expect(inOrder(q.tags)).toEqual(
      Array.from({ length: 20 }, (_, i) => TIP.OWN_TAG(i + 1))
    );
  });

  it("a page of 100 studios sends one statement per relation", async () => {
    const ctx = {
      userId: v,
      applyExclusions: true,
      allowedInstanceIds: [FX.A, FX.B],
      specificInstanceId: FX.A,
      sortField: "name",
      timeZone: "UTC",
    };
    const { items: studios } = await studioQueryBuilder.execute({
      userId: v,
      allowedInstanceIds: ctx.allowedInstanceIds,
      request: parsedListRequest("studio", {
        perPage: 100,
        specificInstanceId: FX.A,
      }),
    });
    expect(studios).toHaveLength(100);

    const recorder = recordStatements({
      studioTag: ["findMany"],
      stashScene: ["findMany"],
      stashGallery: ["findMany"],
      scenePerformer: ["findMany"],
      sceneGroup: ["findMany"],
      stashTag: ["findMany"],
      stashPerformer: ["findMany"],
      stashGroup: ["findMany"],
    });
    try {
      await studioQueryBuilder["populateRelations"](studios, ctx);
    } finally {
      recorder.restore();
    }

    // Tags, the performers total, groups and galleries, and the children
    // (none of these studios has a parent to name): each one statement for
    // the whole page, driven from one JSON parameter
    expect(
      recorder.statements.map(({ sql }) => sql.includes("json_each(?)"))
    ).toEqual([true, true, true, true, true]);
  });

  it("scene, gallery and clip rows take relations from their own instance", async () => {
    await linkSameOnBothInstances();
    const both = [FX.A, FX.B];
    // The bare id: the same gallery on both instances
    const sameOnBoth = {
      ids: {
        refs: [{ id: FX_ID.SAME, instanceId: undefined }],
        modifier: "INCLUDES" as const,
        depth: 0,
      },
    };

    const { items: scenes } = await sceneQueryBuilder.execute({
      userId: v,
      allowedInstanceIds: both,
      request: {
        page: 1,
        perPage: 10,
        q: undefined,
        sort: { field: "title", direction: "ASC", seed: undefined },
        // The bare id: the same scene on both instances
        filter: {
          ids: {
            refs: [{ id: FX_ID.SAME, instanceId: undefined }],
            modifier: "INCLUDES",
            depth: 0,
          },
        },
        specificInstanceId: undefined,
      },
    });
    expect(scenes.map((s) => s.instanceId).sort()).toEqual(both);
    for (const scene of scenes) {
      const name = sameName(scene.instanceId);
      expect(names(scene.performers), scene.instanceId).toEqual([name]);
      expect(names(scene.tags), scene.instanceId).toEqual([name]);
      expect(scene.studio?.name, scene.instanceId).toBe(name);
    }

    const { items: galleries } = await galleryQueryBuilder.execute({
      userId: v,
      allowedInstanceIds: both,
      request: parsedListRequest("gallery", { filter: sameOnBoth }),
    });
    expect(galleries.map((g) => g.instanceId).sort()).toEqual(both);
    for (const gallery of galleries) {
      const name = sameName(gallery.instanceId);
      expect(names(gallery.performers), gallery.instanceId).toEqual([name]);
      expect(names(gallery.tags), gallery.instanceId).toEqual([name]);
      expect(gallery.studio?.name, gallery.instanceId).toBe(name);
    }

    const clips = await clipQueryBuilder.getClipsForScene({
      userId: v,
      allowedInstanceIds: both,
      scene: { id: FX_ID.SAME, instanceId: undefined },
      includeUngenerated: true,
    });
    expect(clips.map((c) => c.scene.stashInstanceId).sort()).toEqual(both);
    for (const clip of clips) {
      const inst = clip.scene.stashInstanceId;
      const name = sameName(inst);
      expect(names(clip.tags), inst).toEqual([name]);
      expect(clip.primaryTag?.name, inst).toBe(name);
    }
  });
});
