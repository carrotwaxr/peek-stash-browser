/**
 * StashEntityService's transforms against the real test SQLite database:
 * damaged cached JSON reads as empty, a renamed studio or tag shows its new
 * name on the next read, and a scene's nested entities carry the ref shapes,
 * never Stash's favorite or rating (D11).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
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

  it("reads the other entities with damaged JSON columns as empty", async () => {
    const tag = await stashEntityService.getTag(TAG, A);
    expect(tag?.aliases).toEqual([]);
    expect(tag?.parents).toEqual([]);
    const group = await stashEntityService.getGroup(GROUP, A);
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
