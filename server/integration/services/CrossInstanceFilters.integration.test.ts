/**
 * Hierarchical ref filters across instances (item 34b), against the real
 * test SQLite database: a tag or studio picked on one server, with its
 * sub-tags or sub-studios, matches that server's content only; a bare
 * legacy id matches every allowed instance; "has all of" with sub-tags
 * matches an entity holding any descendant of each chosen tag, not every
 * descendant (QUERIES-08).
 *
 * Two made-up instances reuse the same small ids, as two Stash servers do:
 * - xi-a: tags 284 > 285 > 286, 290 > 291, and 293 under 285 and 291;
 *   studios 40 > 41; scene 1 (tag 285, studio 41), scene 2 (tags 285 and
 *   291), scene 3 (tag 291); performer 1 (tags 285 and 291), performer 2
 *   (tag 285); gallery 1, group 1 (studio 41); image 1 (tag 285)
 * - xi-b: tags 284 > 285 > 286; studios 40 > 41; scene 1 (tag 285, studio
 *   41), scene 2 (tag 284); performer 1 (tag 285); gallery 1, group 1
 *   (studio 41); image 1 (tag 285)
 *
 * Every seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import type { FilterRef, RefCriterion } from "../../types/parsedFilters.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "xi-a";
const B = "xi-b";

/** "id" or "id:instance" as the request parser hands it over, with every descendant */
const criterion = (
  modifier: RefCriterion["modifier"],
  ...values: string[]
): RefCriterion => ({
  refs: values.map((value): FilterRef => {
    const [id = "", instanceId] = value.split(":");
    return { id, instanceId };
  }),
  modifier,
  depth: -1,
});
const includes = (...values: string[]) => criterion("INCLUDES", ...values);
const all = (...values: string[]) => criterion("INCLUDES_ALL", ...values);

/** The builders' options: no user owns per-user rows here, and exclusions are off */
const BUILDER_OPTIONS = {
  userId: 0,
  applyExclusions: false,
  allowedInstanceIds: [A, B],
};

const keys = (rows: Array<{ id: string; instanceId: string }>): string[] =>
  rows.map((row) => `${row.id}:${row.instanceId}`).sort();

async function scenesBy(
  filter: Partial<{ tags: RefCriterion; studios: RefCriterion }>
): Promise<string[]> {
  const { items } = await sceneQueryBuilder.execute({
    ...BUILDER_OPTIONS,
    request: parsedListRequest("scene", { perPage: 50, filter }),
  });
  return keys(items);
}

async function performersByTags(tags: RefCriterion): Promise<string[]> {
  const { items } = await performerQueryBuilder.execute({
    ...BUILDER_OPTIONS,
    request: parsedListRequest("performer", { perPage: 50, filter: { tags } }),
  });
  return keys(items);
}

async function galleriesByStudios(studios: RefCriterion): Promise<string[]> {
  const { items } = await galleryQueryBuilder.execute({
    ...BUILDER_OPTIONS,
    request: parsedListRequest("gallery", {
      perPage: 50,
      filter: { studios },
    }),
  });
  return keys(items);
}

async function groupsByStudios(studios: RefCriterion): Promise<string[]> {
  const { items } = await groupQueryBuilder.execute({
    ...BUILDER_OPTIONS,
    request: parsedListRequest("group", { perPage: 50, filter: { studios } }),
  });
  return keys(items);
}

async function imagesByTags(tags: RefCriterion): Promise<string[]> {
  const { items } = await imageQueryBuilder.execute({
    ...BUILDER_OPTIONS,
    request: parsedListRequest("image", { perPage: 50, filter: { tags } }),
  });
  return keys(items);
}

async function tagsByParents(parents: RefCriterion): Promise<string[]> {
  const { items } = await tagQueryBuilder.execute({
    ...BUILDER_OPTIONS,
    request: parsedListRequest("tag", { perPage: 50, filter: { parents } }),
  });
  return keys(items);
}

async function seed(): Promise<void> {
  const named = (id: string, instance: string) => ({
    id,
    stashInstanceId: instance,
    name: `Cross ${id} ${instance}`,
  });
  const tag = (id: string, instance: string, ...parents: string[]) => ({
    ...named(id, instance),
    parentIds: parents.length === 0 ? null : JSON.stringify(parents),
  });
  await prisma.stashTag.createMany({
    data: [
      tag("284", A),
      tag("285", A, "284"),
      tag("286", A, "285"),
      tag("290", A),
      tag("291", A, "290"),
      tag("293", A, "285", "291"),
      tag("284", B),
      tag("285", B, "284"),
      tag("286", B, "285"),
    ],
  });
  await prisma.stashStudio.createMany({
    data: [
      named("40", A),
      { ...named("41", A), parentId: "40" },
      named("40", B),
      { ...named("41", B), parentId: "40" },
    ],
  });
  await prisma.stashScene.createMany({
    data: [
      { id: "1", stashInstanceId: A, studioId: "41" },
      { id: "2", stashInstanceId: A },
      { id: "3", stashInstanceId: A },
      { id: "1", stashInstanceId: B, studioId: "41" },
      { id: "2", stashInstanceId: B },
    ],
  });
  const sceneTag = (sceneId: string, instance: string, tagId: string) => ({
    sceneId,
    sceneInstanceId: instance,
    tagId,
    tagInstanceId: instance,
  });
  await prisma.sceneTag.createMany({
    data: [
      sceneTag("1", A, "285"),
      sceneTag("2", A, "285"),
      sceneTag("2", A, "291"),
      sceneTag("3", A, "291"),
      sceneTag("1", B, "285"),
      sceneTag("2", B, "284"),
    ],
  });
  await prisma.stashPerformer.createMany({
    data: [named("1", A), named("2", A), named("1", B)],
  });
  const performerTag = (
    performerId: string,
    instance: string,
    tagId: string
  ) => ({
    performerId,
    performerInstanceId: instance,
    tagId,
    tagInstanceId: instance,
  });
  await prisma.performerTag.createMany({
    data: [
      performerTag("1", A, "285"),
      performerTag("1", A, "291"),
      performerTag("2", A, "285"),
      performerTag("1", B, "285"),
    ],
  });
  await prisma.stashGallery.createMany({
    data: [
      { id: "1", stashInstanceId: A, studioId: "41", studioInstanceId: A },
      { id: "1", stashInstanceId: B, studioId: "41", studioInstanceId: B },
    ],
  });
  await prisma.stashGroup.createMany({
    data: [
      { ...named("1", A), studioId: "41" },
      { ...named("1", B), studioId: "41" },
    ],
  });
  await prisma.stashImage.createMany({
    data: [
      { id: "1", stashInstanceId: A },
      { id: "1", stashInstanceId: B },
    ],
  });
  await prisma.imageTag.createMany({
    data: [
      { imageId: "1", imageInstanceId: A, tagId: "285", tagInstanceId: A },
      { imageId: "1", imageInstanceId: B, tagId: "285", tagInstanceId: B },
    ],
  });
}

/** The junction rows go with their entities (ON DELETE CASCADE) */
async function removeRows(): Promise<void> {
  const where = { stashInstanceId: { in: [A, B] } };
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashImage.deleteMany({ where });
  await prisma.stashGallery.deleteMany({ where });
  await prisma.stashGroup.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

describeWithDb(
  "Hierarchical ref filters across instances (integration)",
  () => {
    beforeAll(async () => {
      await removeRows();
      await seed();
    });

    afterAll(async () => {
      await removeRows();
    });

    describe("scenes by tag with sub-tags", () => {
      it("tags [284:xi-a] returns xi-a's scenes under 284 only", async () => {
        expect(await scenesBy({ tags: includes(`284:${A}`) })).toEqual([
          `1:${A}`,
          `2:${A}`,
        ]);
      });

      it("tags [284] returns both instances' scenes under their own 284", async () => {
        expect(await scenesBy({ tags: includes("284") })).toEqual([
          `1:${A}`,
          `1:${B}`,
          `2:${A}`,
          `2:${B}`,
        ]);
      });

      it("tags [284:xi-b] returns xi-b's scenes only", async () => {
        expect(await scenesBy({ tags: includes(`284:${B}`) })).toEqual([
          `1:${B}`,
          `2:${B}`,
        ]);
      });

      it("has all of [284:xi-a, 290:xi-a] matches a scene holding any descendant of each, not every descendant", async () => {
        expect(await scenesBy({ tags: all(`284:${A}`, `290:${A}`) })).toEqual([
          `2:${A}`,
        ]);
      });

      it("excludes [284:xi-a] keeps xi-b's scenes and xi-a's scene 3", async () => {
        expect(
          await scenesBy({ tags: criterion("EXCLUDES", `284:${A}`) })
        ).toEqual([`1:${B}`, `2:${B}`, `3:${A}`]);
      });
    });

    describe("studios with sub-studios", () => {
      it("scenes: studios [40:xi-a] returns scene 1:xi-a only", async () => {
        expect(await scenesBy({ studios: includes(`40:${A}`) })).toEqual([
          `1:${A}`,
        ]);
      });

      it("galleries: studios [40:xi-a] returns gallery 1:xi-a only", async () => {
        expect(await galleriesByStudios(includes(`40:${A}`))).toEqual([
          `1:${A}`,
        ]);
      });

      it("galleries: studios [40] returns both instances' galleries", async () => {
        expect(await galleriesByStudios(includes("40"))).toEqual([
          `1:${A}`,
          `1:${B}`,
        ]);
      });

      it("groups: studios [40:xi-b] returns group 1:xi-b only", async () => {
        expect(await groupsByStudios(includes(`40:${B}`))).toEqual([`1:${B}`]);
      });
    });

    describe("performers by tag with sub-tags", () => {
      it("tags [284:xi-a] returns xi-a's performers only", async () => {
        expect(await performersByTags(includes(`284:${A}`))).toEqual([
          `1:${A}`,
          `2:${A}`,
        ]);
      });

      it("has all of [284:xi-a, 290:xi-a] matches a performer holding any descendant of each", async () => {
        expect(await performersByTags(all(`284:${A}`, `290:${A}`))).toEqual([
          `1:${A}`,
        ]);
      });
    });

    describe("images by tag with sub-tags", () => {
      it("tags [284:xi-b] returns image 1:xi-b only", async () => {
        expect(await imagesByTags(includes(`284:${B}`))).toEqual([`1:${B}`]);
      });
    });

    describe("tags by parent with sub-tags", () => {
      it("parents [284:xi-a] returns xi-a's tags under 284 only", async () => {
        expect(await tagsByParents(includes(`284:${A}`))).toEqual([
          `285:${A}`,
          `286:${A}`,
          `293:${A}`,
        ]);
      });

      it("parents [284] returns both instances' tags under their own 284", async () => {
        expect(await tagsByParents(includes("284"))).toEqual([
          `285:${A}`,
          `285:${B}`,
          `286:${A}`,
          `286:${B}`,
          `293:${A}`,
        ]);
      });

      it("has all of [284:xi-a, 290:xi-a] matches a tag under any descendant of each", async () => {
        expect(await tagsByParents(all(`284:${A}`, `290:${A}`))).toEqual([
          `293:${A}`,
        ]);
      });
    });
  }
);
