/**
 * Via-scene filters across instances (item 34a), against the real test
 * SQLite database.
 *
 * Two made-up instances reuse the same small ids, as two Stash servers do:
 * - vs-a: scene 1 in group 1; performer 1 and tag 1 on scene 1; tag 2 on
 *   no scene
 * - vs-b: scene 1 in group 2, scene 2 in group 1; performer 2 and tag 2 on
 *   scene 1, performer 1 and tag 1 on scene 2
 *
 * An instance-qualified ref matches its own instance only; a bare ref
 * matches that id on every instance. Every seeded row is deleted before the
 * file ends.
 */
import {
  type InstanceAwareId,
  coerceEntityRefs,
} from "@peek/shared-types/instanceAwareId.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CriterionModifier } from "../../graphql/generated/graphql.js";
import prisma from "../../prisma/singleton.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "vs-a";
const B = "vs-b";

/** No user owns per-user rows here, and exclusions are off */
const OPTIONS = {
  userId: 0,
  applyExclusions: false,
  allowedInstanceIds: [A, B],
  sort: "name",
  sortDirection: "ASC" as const,
  page: 1,
  perPage: 50,
};

const refs = (...values: string[]): InstanceAwareId[] =>
  coerceEntityRefs(values);

const keys = (rows: Array<{ id: string; instanceId: string }>): string[] =>
  rows.map((row) => `${row.id}:${row.instanceId}`).sort();

async function groupsByScene(...scenes: string[]): Promise<string[]> {
  const { groups } = await groupQueryBuilder.execute({
    ...OPTIONS,
    filters: { scenes: { value: refs(...scenes), modifier: "INCLUDES" } },
  });
  return keys(groups);
}

async function performersByGroup(...groups: string[]): Promise<string[]> {
  const { performers } = await performerQueryBuilder.execute({
    ...OPTIONS,
    filters: {
      groups: { value: refs(...groups), modifier: CriterionModifier.Includes },
    },
  });
  return keys(performers);
}

async function tagsByGroup(...groups: string[]): Promise<string[]> {
  const { tags } = await tagQueryBuilder.execute({
    ...OPTIONS,
    filters: {
      scenes_filter: {
        groups: { value: refs(...groups), modifier: "INCLUDES" },
      },
    },
  });
  return keys(tags);
}

async function seed(): Promise<void> {
  for (const [instance, scenes] of [
    [A, ["1"]],
    [B, ["1", "2"]],
  ] as const) {
    for (const id of scenes) {
      await prisma.stashScene.create({
        data: { id, stashInstanceId: instance },
      });
    }
  }
  const named = (id: string, instance: string) => ({
    id,
    stashInstanceId: instance,
    name: `Via ${id} ${instance}`,
  });
  await prisma.stashGroup.createMany({
    data: [named("1", A), named("1", B), named("2", B)],
  });
  await prisma.stashPerformer.createMany({
    data: [named("1", A), named("1", B), named("2", B)],
  });
  await prisma.stashTag.createMany({
    data: [named("1", A), named("2", A), named("1", B), named("2", B)],
  });
  await prisma.sceneGroup.createMany({
    data: [
      { sceneId: "1", sceneInstanceId: A, groupId: "1", groupInstanceId: A },
      { sceneId: "1", sceneInstanceId: B, groupId: "2", groupInstanceId: B },
      { sceneId: "2", sceneInstanceId: B, groupId: "1", groupInstanceId: B },
    ],
  });
  await prisma.scenePerformer.createMany({
    data: [
      {
        sceneId: "1",
        sceneInstanceId: A,
        performerId: "1",
        performerInstanceId: A,
      },
      {
        sceneId: "1",
        sceneInstanceId: B,
        performerId: "2",
        performerInstanceId: B,
      },
      {
        sceneId: "2",
        sceneInstanceId: B,
        performerId: "1",
        performerInstanceId: B,
      },
    ],
  });
  await prisma.sceneTag.createMany({
    data: [
      { sceneId: "1", sceneInstanceId: A, tagId: "1", tagInstanceId: A },
      { sceneId: "1", sceneInstanceId: B, tagId: "2", tagInstanceId: B },
      { sceneId: "2", sceneInstanceId: B, tagId: "1", tagInstanceId: B },
    ],
  });
}

/** The junction rows go with their scenes and entities (ON DELETE CASCADE) */
async function removeRows(): Promise<void> {
  const where = { stashInstanceId: { in: [A, B] } };
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashGroup.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

describeWithDb("Via-scene clauses across instances (integration)", () => {
  beforeAll(async () => {
    await removeRows();
    await seed();
  });

  afterAll(async () => {
    await removeRows();
  });

  describe("groups by scene", () => {
    it("scenes [1:vs-a] returns group 1:vs-a only", async () => {
      expect(await groupsByScene(`1:${A}`)).toEqual([`1:${A}`]);
    });

    it("scenes [1] returns both instances' groups of scene 1", async () => {
      expect(await groupsByScene("1")).toEqual([`1:${A}`, `2:${B}`]);
    });

    it("scenes [2:vs-b] returns group 1:vs-b only", async () => {
      expect(await groupsByScene(`2:${B}`)).toEqual([`1:${B}`]);
    });
  });

  describe("performers by group", () => {
    it("groups [1:vs-a] returns performer 1:vs-a only", async () => {
      expect(await performersByGroup(`1:${A}`)).toEqual([`1:${A}`]);
    });

    it("groups [1] returns both instances' performers of group 1", async () => {
      expect(await performersByGroup("1")).toEqual([`1:${A}`, `1:${B}`]);
    });

    it("groups [2:vs-b] returns performer 2:vs-b only", async () => {
      expect(await performersByGroup(`2:${B}`)).toEqual([`2:${B}`]);
    });
  });

  describe("tags by group", () => {
    it("groups [1:vs-a] returns tag 1:vs-a only", async () => {
      expect(await tagsByGroup(`1:${A}`)).toEqual([`1:${A}`]);
    });

    it("groups [1] returns both instances' tags of group 1", async () => {
      expect(await tagsByGroup("1")).toEqual([`1:${A}`, `1:${B}`]);
    });

    it("groups [2:vs-b] returns tag 2:vs-b only, not vs-a's tag 2", async () => {
      expect(await tagsByGroup(`2:${B}`)).toEqual([`2:${B}`]);
    });
  });
});
