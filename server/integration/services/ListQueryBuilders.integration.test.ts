/**
 * The builders on the base (item 74), and the list search of scenes,
 * performers, studios, tags, galleries and groups, against the real test
 * SQLite database.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do:
 * - lq-a: performer, studio, tag, scene, gallery and group 7870001 named
 *   "100% ..." and 7870002 named "1000 ..."; performer 7870001 tagged
 *   7870001; tag 7870010 a child of 7870001; gallery 7870001 tagged 7870001;
 *   group 7870001 of studio 7870001
 * - lq-b: performer, studio, tag, gallery and group 7870001, the performer
 *   and gallery tagged with the tag, the group of the studio; tag 7870010 a
 *   child of 7870001
 * - gallery 7870001 on lq-a holds scenes 7870003 and 7870004, 7870005 (which
 *   the scene-count user hid), 7870006 (deleted) and, through a link across
 *   instances, 7870003 on lq-b; gallery 7870001 on lq-b holds 7870003 on
 *   lq-b
 *
 * The search binds `likeContains(q)` with `ESCAPE '\'`, so a `%` in it
 * matches only names holding one ("1000 ..." would match an unescaped
 * `%100%%`). A ref with an instance matches that instance only, a bare ref
 * its id on every instance; an empty allowed list matches nothing. A
 * gallery counts the live scenes the viewer can see on its own instance.
 * Every seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import type { FilterRef, RefCriterion } from "../../types/parsedFilters.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "lq-a";
const B = "lq-b";
const PCT = "7870001";
const NO_PCT = "7870002";
const CHILD = "7870010";
/** Gallery 7870001's scenes: two visible, one hidden, one deleted */
const [SEEN_1, SEEN_2, HIDDEN, DELETED] = [
  "7870003",
  "7870004",
  "7870005",
  "7870006",
];
const SCENE_COUNT_USER = "lq-scene-count";

/** No user owns per-user rows here, and exclusions are off */
const OPTIONS = {
  userId: 0,
  applyExclusions: false,
  allowedInstanceIds: [A, B],
};

const keys = (rows: Array<{ id: string; instanceId: string }>): string[] =>
  rows.map((row) => `${row.id}:${row.instanceId}`).sort();

const includes = (...refs: FilterRef[]): RefCriterion => ({
  refs,
  modifier: "INCLUDES",
  depth: 0,
});

async function seed(): Promise<void> {
  const named = (id: string, instance: string, name: string) => ({
    id,
    stashInstanceId: instance,
    name,
  });
  await prisma.stashPerformer.createMany({
    data: [
      named(PCT, A, "100% Real"),
      named(NO_PCT, A, "1000 Real"),
      named(PCT, B, "Performer B"),
    ],
  });
  await prisma.stashStudio.createMany({
    data: [
      named(PCT, A, "100% Studio"),
      named(NO_PCT, A, "1000 Studio"),
      named(PCT, B, "Studio B"),
    ],
  });
  await prisma.stashTag.createMany({
    data: [
      named(PCT, A, "100% Tag"),
      named(NO_PCT, A, "1000 Tag"),
      named(PCT, B, "Tag B"),
      { ...named(CHILD, A, "Child A"), parentIds: `["${PCT}"]` },
      { ...named(CHILD, B, "Child B"), parentIds: `["${PCT}"]` },
    ],
  });
  await prisma.stashScene.createMany({
    data: [
      { id: PCT, stashInstanceId: A, title: "100% Scene" },
      { id: NO_PCT, stashInstanceId: A, title: "1000 Scene" },
      { id: SEEN_1, stashInstanceId: A, title: "Scene 3" },
      { id: SEEN_2, stashInstanceId: A, title: "Scene 4" },
      { id: HIDDEN, stashInstanceId: A, title: "Scene 5" },
      {
        id: DELETED,
        stashInstanceId: A,
        title: "Scene 6",
        deletedAt: new Date(),
      },
      { id: SEEN_1, stashInstanceId: B, title: "Scene 3 on B" },
    ],
  });
  await prisma.stashGallery.createMany({
    data: [
      { id: PCT, stashInstanceId: A, title: "100% Gallery" },
      { id: NO_PCT, stashInstanceId: A, title: "1000 Gallery" },
      { id: PCT, stashInstanceId: B, title: "Gallery B" },
    ],
  });
  await prisma.stashGroup.createMany({
    data: [
      { ...named(PCT, A, "100% Group"), studioId: PCT },
      named(NO_PCT, A, "1000 Group"),
      { ...named(PCT, B, "Group B"), studioId: PCT },
    ],
  });
  await prisma.galleryTag.createMany({
    data: [A, B].map((instance) => ({
      galleryId: PCT,
      galleryInstanceId: instance,
      tagId: PCT,
      tagInstanceId: instance,
    })),
  });
  const link = (
    galleryInstance: string,
    sceneId: string,
    instance: string
  ) => ({
    galleryId: PCT,
    galleryInstanceId: galleryInstance,
    sceneId,
    sceneInstanceId: instance,
  });
  await prisma.sceneGallery.createMany({
    data: [
      ...[SEEN_1, SEEN_2, HIDDEN, DELETED].map((id) => link(A, id, A)),
      // Across instances: never counted
      link(A, SEEN_1, B),
      link(B, SEEN_1, B),
    ],
  });
  await prisma.performerTag.createMany({
    data: [A, B].map((instance) => ({
      performerId: PCT,
      performerInstanceId: instance,
      tagId: PCT,
      tagInstanceId: instance,
    })),
  });
}

/** The junction and exclusion rows go with their entities and user (ON DELETE CASCADE) */
async function removeRows(): Promise<void> {
  const where = { stashInstanceId: { in: [A, B] } };
  await prisma.user.deleteMany({ where: { username: SCENE_COUNT_USER } });
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashGallery.deleteMany({ where });
  await prisma.stashGroup.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

describeWithDb(
  "Builders on the base: search, instances and gallery scene counts (integration)",
  () => {
    beforeAll(async () => {
      await removeRows();
      await seed();
    });

    afterAll(async () => {
      await removeRows();
    });

    describe("a % in the search matches only names holding %", () => {
      it("performers", async () => {
        const { items } = await performerQueryBuilder.execute({
          ...OPTIONS,
          request: parsedListRequest("performer", { q: "100%" }),
        });
        expect(keys(items)).toEqual([`${PCT}:${A}`]);
      });

      it("studios", async () => {
        const { items } = await studioQueryBuilder.execute({
          ...OPTIONS,
          request: parsedListRequest("studio", { q: "100%" }),
        });
        expect(keys(items)).toEqual([`${PCT}:${A}`]);
      });

      it("tags", async () => {
        const { items } = await tagQueryBuilder.execute({
          ...OPTIONS,
          request: parsedListRequest("tag", { q: "100%" }),
        });
        expect(keys(items)).toEqual([`${PCT}:${A}`]);
      });

      it("scenes", async () => {
        const { items } = await sceneQueryBuilder.execute({
          ...OPTIONS,
          request: parsedListRequest("scene", { q: "100%" }),
        });
        expect(keys(items)).toEqual([`${PCT}:${A}`]);
      });

      it("galleries", async () => {
        const { items } = await galleryQueryBuilder.execute({
          ...OPTIONS,
          request: parsedListRequest("gallery", { q: "100%" }),
        });
        expect(keys(items)).toEqual([`${PCT}:${A}`]);
      });

      it("groups", async () => {
        const { items } = await groupQueryBuilder.execute({
          ...OPTIONS,
          request: parsedListRequest("group", { q: "100%" }),
        });
        expect(keys(items)).toEqual([`${PCT}:${A}`]);
      });
    });

    describe("an empty allowed list returns no rows and count 0", () => {
      const none = { ...OPTIONS, allowedInstanceIds: [] };

      it("performers", async () => {
        const result = await performerQueryBuilder.execute({
          ...none,
          request: parsedListRequest("performer"),
        });
        expect(result).toEqual({ items: [], total: 0 });
      });

      it("studios", async () => {
        const result = await studioQueryBuilder.execute({
          ...none,
          request: parsedListRequest("studio"),
        });
        expect(result).toEqual({ items: [], total: 0 });
      });

      it("tags", async () => {
        const result = await tagQueryBuilder.execute({
          ...none,
          request: parsedListRequest("tag"),
        });
        expect(result).toEqual({ items: [], total: 0 });
      });

      it("galleries", async () => {
        const result = await galleryQueryBuilder.execute({
          ...none,
          request: parsedListRequest("gallery"),
        });
        expect(result).toEqual({ items: [], total: 0 });
      });

      it("groups", async () => {
        const result = await groupQueryBuilder.execute({
          ...none,
          request: parsedListRequest("group"),
        });
        expect(result).toEqual({ items: [], total: 0 });
      });
    });

    describe("refs keep their instance", () => {
      it("a performer's tag on lq-a lists lq-a's performer only; the bare id both", async () => {
        const byTag = async (ref: FilterRef) =>
          keys(
            (
              await performerQueryBuilder.execute({
                ...OPTIONS,
                request: parsedListRequest("performer", {
                  filter: { tags: includes(ref) },
                }),
              })
            ).items
          );

        expect(await byTag({ id: PCT, instanceId: A })).toEqual([
          `${PCT}:${A}`,
        ]);
        expect(await byTag({ id: PCT, instanceId: undefined })).toEqual([
          `${PCT}:${A}`,
          `${PCT}:${B}`,
        ]);
      });

      it("the parent 7870001 on lq-b lists lq-b's child only; the bare id both", async () => {
        const byParent = async (ref: FilterRef) =>
          keys(
            (
              await tagQueryBuilder.execute({
                ...OPTIONS,
                request: parsedListRequest("tag", {
                  filter: { parents: includes(ref) },
                }),
              })
            ).items
          );

        expect(await byParent({ id: PCT, instanceId: B })).toEqual([
          `${CHILD}:${B}`,
        ]);
        expect(await byParent({ id: PCT, instanceId: undefined })).toEqual([
          `${CHILD}:${A}`,
          `${CHILD}:${B}`,
        ]);
      });

      it("ids with an instance read that instance's row, and the count agrees", async () => {
        const result = await tagQueryBuilder.execute({
          ...OPTIONS,
          request: parsedListRequest("tag", {
            filter: { ids: includes({ id: PCT, instanceId: B }) },
          }),
        });
        expect(keys(result.items)).toEqual([`${PCT}:${B}`]);
        expect(result.total).toBe(1);
      });

      it("a gallery's tag on lq-b lists lq-b's gallery only; the bare id both", async () => {
        const byTag = async (ref: FilterRef) =>
          keys(
            (
              await galleryQueryBuilder.execute({
                ...OPTIONS,
                request: parsedListRequest("gallery", {
                  filter: { tags: includes(ref) },
                }),
              })
            ).items
          );

        expect(await byTag({ id: PCT, instanceId: B })).toEqual([
          `${PCT}:${B}`,
        ]);
        expect(await byTag({ id: PCT, instanceId: undefined })).toEqual([
          `${PCT}:${A}`,
          `${PCT}:${B}`,
        ]);
      });

      it("a group's studio on lq-a lists lq-a's group only; the bare id both", async () => {
        const byStudio = async (ref: FilterRef) =>
          keys(
            (
              await groupQueryBuilder.execute({
                ...OPTIONS,
                request: parsedListRequest("group", {
                  filter: { studios: includes(ref) },
                }),
              })
            ).items
          );

        expect(await byStudio({ id: PCT, instanceId: A })).toEqual([
          `${PCT}:${A}`,
        ]);
        expect(await byStudio({ id: PCT, instanceId: undefined })).toEqual([
          `${PCT}:${A}`,
          `${PCT}:${B}`,
        ]);
      });
    });

    describe("a gallery's scene count", () => {
      let userId = 0;

      beforeAll(async () => {
        const user = await prisma.user.create({
          data: {
            username: SCENE_COUNT_USER,
            password: "not-a-real-hash",
            role: "USER",
          },
        });
        userId = user.id;
        await prisma.userExcludedEntity.create({
          data: {
            userId,
            entityType: "scene",
            entityId: HIDDEN,
            instanceId: A,
            reason: "hidden",
          },
        });
      });

      const sceneTotals = async (applyExclusions: boolean) => {
        const { items } = await galleryQueryBuilder.execute({
          userId,
          applyExclusions,
          allowedInstanceIds: [A, B],
          request: parsedListRequest("gallery", {
            filter: { ids: includes({ id: PCT, instanceId: undefined }) },
          }),
        });
        return Object.fromEntries(
          items.map((g) => [
            `${g.id}:${g.instanceId}`,
            g.relation_totals?.scenes,
          ])
        );
      };

      it("counts two visible scenes, not the hidden or deleted one, nor another instance's", async () => {
        expect(await sceneTotals(true)).toEqual({
          [`${PCT}:${A}`]: 2,
          [`${PCT}:${B}`]: 1,
        });
      });

      it("without exclusions counts the hidden scene too, never the deleted one", async () => {
        expect(await sceneTotals(false)).toEqual({
          [`${PCT}:${A}`]: 3,
          [`${PCT}:${B}`]: 1,
        });
      });

      it("a gallery without scenes counts 0", async () => {
        const { items } = await galleryQueryBuilder.execute({
          userId,
          allowedInstanceIds: [A],
          request: parsedListRequest("gallery", {
            filter: { ids: includes({ id: NO_PCT, instanceId: A }) },
          }),
        });
        expect(items.map((g) => g.relation_totals)).toEqual([{ scenes: 0 }]);
      });
    });
  }
);
