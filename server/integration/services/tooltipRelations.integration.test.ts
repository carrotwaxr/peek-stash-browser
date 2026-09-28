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
 * The fixture seeds entities on made-up instances (see
 * helpers/accessFixture.ts). Users:
 * - u: the default hides, which include HIDDEN_A's performer and tag on A
 * - v: no hides
 */
import { coerceEntityRefs } from "@peek/shared-types/instanceAwareId.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  hideFixtureDefaults,
  seedAccessFixture,
} from "../helpers/accessFixture.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

async function createUser(username: string): Promise<number> {
  const user = await prisma.user.create({
    data: { username, password: "not-a-real-hash", role: "USER" },
  });
  return user.id;
}

/** The builder options for one entity on instance A. */
function byIdOnA(userId: number, id: string) {
  return {
    userId,
    filters: { ids: { value: coerceEntityRefs([id]), modifier: "INCLUDES" } },
    specificInstanceId: FX.A,
    sort: "name",
    sortDirection: "ASC" as const,
    page: 1,
    perPage: 10,
  };
}

const ids = (refs: Array<{ id: string }> | undefined) =>
  (refs ?? []).map((r) => r.id).sort();

async function tagPerformers(userId: number) {
  const { tags } = await tagQueryBuilder.execute(byIdOnA(userId, FX_ID.SAME));
  expect(tags).toHaveLength(1);
  return ids(tags[0]?.performers);
}

async function studioTags(userId: number) {
  const { studios } = await studioQueryBuilder.execute(
    byIdOnA(userId, FX_ID.SAME)
  );
  expect(studios).toHaveLength(1);
  return ids(studios[0]?.tags);
}

async function performerTags(userId: number) {
  const { performers } = await performerQueryBuilder.execute(
    byIdOnA(userId, FX_ID.VISIBLE_A)
  );
  expect(performers).toHaveLength(1);
  return ids(performers[0]?.tags);
}

async function groupTags(userId: number) {
  const { groups } = await groupQueryBuilder.execute(
    byIdOnA(userId, FX_ID.SAME)
  );
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

describeWithDb("Tooltip relations (integration)", () => {
  let u: number;
  let v: number;

  beforeAll(async () => {
    await seedAccessFixture();
    u = await createUser("access-it-tip-u");
    v = await createUser("access-it-tip-v");
    await hideFixtureDefaults(u);
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

  it("scene, gallery and clip rows take relations from their own instance", async () => {
    await linkSameOnBothInstances();
    const both = [FX.A, FX.B];
    const sameOnBoth = {
      ids: { value: coerceEntityRefs([FX_ID.SAME]), modifier: "INCLUDES" },
    };

    const { scenes } = await sceneQueryBuilder.execute({
      userId: v,
      filters: sameOnBoth,
      allowedInstanceIds: both,
      sort: "title",
      sortDirection: "ASC",
      page: 1,
      perPage: 10,
    });
    expect(scenes.map((s) => s.instanceId).sort()).toEqual(both);
    for (const scene of scenes) {
      const name = sameName(scene.instanceId);
      expect(names(scene.performers), scene.instanceId).toEqual([name]);
      expect(names(scene.tags), scene.instanceId).toEqual([name]);
      expect(scene.studio?.name, scene.instanceId).toBe(name);
    }

    const { galleries } = await galleryQueryBuilder.execute({
      userId: v,
      filters: sameOnBoth,
      allowedInstanceIds: both,
      sort: "title",
      sortDirection: "ASC",
      page: 1,
      perPage: 10,
    });
    expect(galleries.map((g) => g.instanceId).sort()).toEqual(both);
    for (const gallery of galleries) {
      const name = sameName(gallery.instanceId);
      expect(names(gallery.performers), gallery.instanceId).toEqual([name]);
      expect(names(gallery.tags), gallery.instanceId).toEqual([name]);
      expect(gallery.studio?.name, gallery.instanceId).toBe(name);
    }

    const clips = await clipQueryBuilder.getClipsForScene(
      FX_ID.SAME,
      v,
      true,
      both
    );
    expect(clips.map((c) => c.scene.stashInstanceId).sort()).toEqual(both);
    for (const clip of clips) {
      const inst = clip.scene.stashInstanceId;
      const name = sameName(inst);
      expect(names(clip.tags), inst ?? "").toEqual([name]);
      expect(clip.primaryTag?.name, inst ?? "").toBe(name);
    }
  });
});
