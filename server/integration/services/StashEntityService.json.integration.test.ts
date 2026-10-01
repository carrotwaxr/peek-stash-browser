/**
 * StashEntityService's transforms against the real test SQLite database:
 * damaged cached JSON reads as empty (a collection's through its list
 * builder, which its detail page reads), a renamed studio or tag shows its new
 * name on the next read, and a scene's nested entities carry the ref shapes,
 * never Stash's favorite or rating (D11).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { loadTagTree } from "../../services/TagTreeService.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import {
  FX,
  clearAccessFixture,
  seedAccessFixture,
} from "../helpers/accessFixture.js";

const { A } = FX;
const BAD = "{bad";

const SCENE = "7710001";
const CLEAN_SCENE = "7710002";
const TAG = "7710010";
const STUDIO = "7710011";
const PERFORMER = "7710012";
const GROUP = "7710013";
const GALLERY = "7710014";
const IMAGE = "7710015";

describe("StashEntityService transforms", () => {
  beforeAll(async () => {
    await seedAccessFixture();
    const key = (id: string) => ({ id, stashInstanceId: A });
    await prisma.stashTag.create({
      data: { ...key(TAG), name: "Old tag", aliases: BAD, parentIds: BAD },
    });
    await prisma.stashStudio.create({
      data: { ...key(STUDIO), name: "Old studio" },
    });
    await prisma.stashPerformer.create({
      data: {
        ...key(PERFORMER),
        name: "Perf",
        aliasList: BAD,
        favorite: true,
        rating100: 90,
      },
    });
    await prisma.stashGroup.create({
      data: { ...key(GROUP), name: "Grp", urls: BAD },
    });
    await prisma.stashGallery.create({
      data: { ...key(GALLERY), title: "Gal", urls: BAD },
    });
    await prisma.stashImage.create({
      data: { ...key(IMAGE), title: "Img", urls: BAD },
    });
    await prisma.imageGallery.create({
      data: {
        imageId: IMAGE,
        imageInstanceId: A,
        galleryId: GALLERY,
        galleryInstanceId: A,
      },
    });
    await prisma.stashScene.create({
      data: {
        ...key(SCENE),
        title: "Damaged",
        urls: BAD,
        captions: BAD,
        inheritedTagIds: "x",
        studioId: STUDIO,
        oCounter: 7,
        playCount: 3,
        rating100: 80,
      },
    });
    await prisma.stashScene.create({
      data: {
        ...key(CLEAN_SCENE),
        title: "Clean",
        inheritedTagIds: JSON.stringify([TAG]),
        studioId: STUDIO,
      },
    });
    await prisma.scenePerformer.create({
      data: {
        sceneId: SCENE,
        sceneInstanceId: A,
        performerId: PERFORMER,
        performerInstanceId: A,
      },
    });
  });

  afterAll(async () => {
    await clearAccessFixture();
  });

  it("reads a scene with damaged JSON columns as empty", async () => {
    const [scene] = await stashEntityService.getScenesByIdsWithRelations(
      [SCENE],
      A
    );
    expect(scene?.urls).toEqual([]);
    expect(scene?.captions).toEqual([]);
    expect(scene?.inheritedTagIds).toEqual([]);
    expect(scene?.inheritedTags).toBeUndefined();
  });

  it("reads a collection with damaged JSON columns as empty, as its detail page loads it", async () => {
    const [group] = await groupQueryBuilder.getByRefs({
      userId: 0,
      allowedInstanceIds: [A],
      applyExclusions: false,
      refs: [{ id: GROUP, instanceId: A }],
    });
    expect(group?.urls).toEqual([]);
  });

  it("nests refs without Stash's favorite or rating, and no Stash counters", async () => {
    const scene = await stashEntityService.getScene(SCENE, A);
    expect(scene?.performers).toHaveLength(1);
    const performer = scene?.performers[0];
    expect(performer).toMatchObject({
      id: PERFORMER,
      instanceId: A,
      name: "Perf",
    });
    expect(performer).not.toHaveProperty("favorite");
    expect(performer).not.toHaveProperty("rating100");
    expect(scene?.rating100).toBeNull();
    expect(scene?.o_counter).toBe(0);
    expect(scene?.play_count).toBe(0);
  });

  it("shows a renamed studio and tag on the next read", async () => {
    const before = await stashEntityService.getScene(CLEAN_SCENE, A);
    expect(before?.studio?.name).toBe("Old studio");
    expect(before?.inheritedTags?.map((t) => t.name)).toEqual(["Old tag"]);

    await prisma.stashStudio.update({
      where: { id_stashInstanceId: { id: STUDIO, stashInstanceId: A } },
      data: { name: "New studio" },
    });
    await prisma.stashTag.update({
      where: { id_stashInstanceId: { id: TAG, stashInstanceId: A } },
      data: { name: "New tag" },
    });

    const after = await stashEntityService.getScenesByIdsWithRelations(
      [CLEAN_SCENE],
      A
    );
    expect(after[0]?.studio?.name).toBe("New studio");
    expect(after[0]?.inheritedTags?.map((t) => t.name)).toEqual(["New tag"]);
  });
});

/**
 * A tag whose cached `parentIds` is not JSON reads as having no parents in
 * the tag list, the tag tree and the exclusion recompute, and never fails the
 * statements that read it. Two tags on a made-up instance of their own.
 */
describe("a tag whose parentIds is not JSON", () => {
  const TAG_INSTANCE = "json-tag-it";
  const HEALTHY = "7720001";
  const DAMAGED = "7720002";
  const TAG_SCENE = "7720003";
  const TAG_PERFORMER = "7720004";
  let userId: number;

  beforeAll(async () => {
    await prisma.stashInstance.create({
      data: {
        id: TAG_INSTANCE,
        name: TAG_INSTANCE,
        url: `http://${TAG_INSTANCE}.invalid/graphql`,
        apiKey: "x",
        enabled: true,
        firstSyncedAt: new Date(),
      },
    });
    await prisma.stashTag.createMany({
      data: [
        { id: HEALTHY, stashInstanceId: TAG_INSTANCE, name: "Healthy" },
        {
          id: DAMAGED,
          stashInstanceId: TAG_INSTANCE,
          name: "Damaged",
          parentIds: "oops",
        },
      ],
    });
    const key = (id: string) => ({ id, stashInstanceId: TAG_INSTANCE });
    await prisma.stashPerformer.create({
      data: { ...key(TAG_PERFORMER), name: "Tagged performer" },
    });
    await prisma.stashScene.create({
      data: { ...key(TAG_SCENE), title: "Tagged scene" },
    });
    await prisma.scenePerformer.create({
      data: {
        sceneId: TAG_SCENE,
        sceneInstanceId: TAG_INSTANCE,
        performerId: TAG_PERFORMER,
        performerInstanceId: TAG_INSTANCE,
      },
    });
    await prisma.sceneTag.create({
      data: {
        sceneId: TAG_SCENE,
        sceneInstanceId: TAG_INSTANCE,
        tagId: DAMAGED,
        tagInstanceId: TAG_INSTANCE,
      },
    });
    const user = await prisma.user.create({
      data: { username: `json-tag-it-${Date.now()}`, password: "unused" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    const where = { stashInstanceId: TAG_INSTANCE };
    await prisma.sceneTag.deleteMany({
      where: { sceneInstanceId: TAG_INSTANCE },
    });
    await prisma.scenePerformer.deleteMany({
      where: { sceneInstanceId: TAG_INSTANCE },
    });
    await prisma.stashScene.deleteMany({ where });
    await prisma.stashPerformer.deleteMany({ where });
    await prisma.stashTag.deleteMany({ where });
    await prisma.stashInstance.deleteMany({ where: { id: TAG_INSTANCE } });
  });

  it("lists both tags, the damaged one with no parents", async () => {
    const { items } = await tagQueryBuilder.execute({
      userId,
      applyExclusions: false,
      allowedInstanceIds: [TAG_INSTANCE],
      request: parsedListRequest("tag", { perPage: 50 }),
    });
    expect(items.map((tag) => tag.id).sort()).toEqual([HEALTHY, DAMAGED]);
    expect(must(items.find((tag) => tag.id === DAMAGED)).parents).toEqual([]);
  });

  it("puts both tags in the tag tree", async () => {
    const rows = await loadTagTree({
      userId,
      allowedInstanceIds: [TAG_INSTANCE],
    });
    expect(rows.map((tag) => tag.id).sort()).toEqual([HEALTHY, DAMAGED]);
  });

  it("walks a scoped tag tree up from the damaged tag and stops there", async () => {
    const rows = await loadTagTree({
      userId,
      allowedInstanceIds: [TAG_INSTANCE],
      scope: { performer: { id: TAG_PERFORMER, instanceId: TAG_INSTANCE } },
    });
    const damaged = must(rows.find((tag) => tag.id === DAMAGED));
    expect(damaged.parents).toEqual([]);
    expect(rows.map((tag) => tag.id)).toEqual([DAMAGED]);
  });

  it("recomputes a user's exclusions and hides the healthy tag they always-hide", async () => {
    await prisma.userContentRestriction.create({
      data: {
        userId,
        entityType: "tags",
        mode: "EXCLUDE",
        entityIds: JSON.stringify([HEALTHY]),
        restrictEmpty: false,
      },
    });
    await exclusionComputationService.recomputeForUser(userId);
    const hidden = await prisma.userExcludedEntity.findMany({
      where: { userId, entityType: "tag", instanceId: TAG_INSTANCE },
      select: { entityId: true },
    });
    expect(hidden.map((row) => row.entityId)).toEqual([HEALTHY]);
  }, 60_000);
});
