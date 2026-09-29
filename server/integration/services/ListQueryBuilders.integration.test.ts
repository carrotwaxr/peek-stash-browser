/**
 * The performer, studio and tag builders on the base (item 74), and the
 * list search of those and of scenes, against the real test SQLite
 * database.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do:
 * - lq-a: performer, studio, tag and scene 7870001 named "100% ..." and
 *   7870002 named "1000 ..."; performer 7870001 tagged 7870001; tag 7870010
 *   a child of 7870001
 * - lq-b: performer and tag 7870001, the performer tagged with it; tag
 *   7870010 a child of 7870001
 *
 * The search binds `likeContains(q)` with `ESCAPE '\'`, so a `%` in it
 * matches only names holding one ("1000 ..." would match an unescaped
 * `%100%%`). A ref with an instance matches that instance only, a bare ref
 * its id on every instance; an empty allowed list matches nothing. Every
 * seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
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
    data: [named(PCT, A, "100% Studio"), named(NO_PCT, A, "1000 Studio")],
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

/** The junction rows go with their entities (ON DELETE CASCADE) */
async function removeRows(): Promise<void> {
  const where = { stashInstanceId: { in: [A, B] } };
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

describeWithDb(
  "Performer, studio and tag builders on the base (integration)",
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
    });
  }
);
