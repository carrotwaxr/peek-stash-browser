/**
 * Scene tag inheritance writes each inherited tag as a SceneInheritedTag row
 * beside the scene's inheritedTagIds JSON (S3, routed L8): the tag filter,
 * the tag counts and the exclusion compute read the junction by index.
 *
 * Two made-up instances reuse the same small ids, as two Stash servers do:
 * - tags 1, 2 and 3; performer 1 carries tag 1, studio 1 tag 2, group 1
 *   tag 3
 * - scene 1: performer 1, studio 1, group 1 (inherits 1, 2 and 3)
 * - scene 2: performer 1, and tag 1 of its own (inherits nothing: a direct
 *   tag is not inherited)
 * On stij-b, performer 1 carries tag 2 instead, so the same ids inherit
 * other tags there.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneTagInheritanceService } from "../../services/SceneTagInheritanceService.js";
import { recordStatements } from "../helpers/statementRecorder.js";

const A = "stij-a";
const B = "stij-b";
const INSTANCES = [A, B];

/** The junction rows of the seeded scenes, as "scene:tag@instance", sorted */
async function junctionRows(): Promise<string[]> {
  const rows = await prisma.sceneInheritedTag.findMany({
    where: { sceneInstanceId: { in: INSTANCES } },
  });
  return rows
    .map((r) => {
      expect(r.tagInstanceId).toBe(r.sceneInstanceId);
      return `${r.sceneId}:${r.tagId}@${r.sceneInstanceId}`;
    })
    .sort();
}

/** The same pairs as the scenes' JSON column holds them, sorted */
async function jsonRows(): Promise<string[]> {
  const scenes = await prisma.stashScene.findMany({
    where: { stashInstanceId: { in: INSTANCES } },
    select: { id: true, stashInstanceId: true, inheritedTagIds: true },
  });
  return scenes
    .flatMap((s) =>
      (JSON.parse(s.inheritedTagIds ?? "[]") as string[]).map(
        (tag) => `${s.id}:${tag}@${s.stashInstanceId}`
      )
    )
    .sort();
}

async function clean(): Promise<void> {
  const where = { stashInstanceId: { in: INSTANCES } };
  // The junction rows go with their scenes (ON DELETE CASCADE)
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashGroup.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

async function seed(): Promise<void> {
  for (const instance of INSTANCES) {
    const on = { stashInstanceId: instance };
    await prisma.stashTag.createMany({
      data: ["1", "2", "3"].map((id) => ({ id, ...on, name: `STIJ ${id}` })),
    });
    await prisma.stashPerformer.create({
      data: { id: "1", ...on, name: "STIJ performer" },
    });
    await prisma.stashStudio.create({
      data: { id: "1", ...on, name: "STIJ studio" },
    });
    await prisma.stashGroup.create({
      data: { id: "1", ...on, name: "STIJ group" },
    });
    await prisma.performerTag.create({
      data: {
        performerId: "1",
        performerInstanceId: instance,
        tagId: instance === A ? "1" : "2",
        tagInstanceId: instance,
      },
    });
    await prisma.studioTag.create({
      data: {
        studioId: "1",
        studioInstanceId: instance,
        tagId: "2",
        tagInstanceId: instance,
      },
    });
    await prisma.groupTag.create({
      data: {
        groupId: "1",
        groupInstanceId: instance,
        tagId: "3",
        tagInstanceId: instance,
      },
    });
    await prisma.stashScene.createMany({
      data: [
        { id: "1", ...on, studioId: "1" },
        { id: "2", ...on },
      ],
    });
    await prisma.scenePerformer.createMany({
      data: ["1", "2"].map((sceneId) => ({
        sceneId,
        sceneInstanceId: instance,
        performerId: "1",
        performerInstanceId: instance,
      })),
    });
    await prisma.sceneGroup.create({
      data: {
        sceneId: "1",
        sceneInstanceId: instance,
        groupId: "1",
        groupInstanceId: instance,
      },
    });
    await prisma.sceneTag.create({
      data: {
        sceneId: "2",
        sceneInstanceId: instance,
        tagId: "1",
        tagInstanceId: instance,
      },
    });
  }
}

const SCENES = INSTANCES.flatMap((instanceId) =>
  ["1", "2"].map((id) => ({ id, instanceId }))
);

describe("SceneTagInheritanceService: the SceneInheritedTag junction", () => {
  beforeEach(async () => {
    await clean();
    await seed();
  });

  afterAll(clean);

  it("an inherited tag is a SceneInheritedTag row after inheritance runs, and gone after the source loses it", async () => {
    await sceneTagInheritanceService.computeInheritedTags(SCENES);

    expect(await junctionRows()).toEqual([
      "1:1@stij-a",
      "1:2@stij-a",
      "1:2@stij-b",
      "1:3@stij-a",
      "1:3@stij-b",
      // Scene 2 holds tag 1 itself on stij-a; on stij-b it inherits tag 2
      "2:2@stij-b",
    ]);
    expect(await jsonRows()).toEqual(await junctionRows());

    // The performer loses tag 1 on stij-a, the group its tag on both
    await prisma.performerTag.deleteMany({
      where: { performerId: "1", performerInstanceId: A },
    });
    await prisma.groupTag.deleteMany({
      where: { groupInstanceId: { in: INSTANCES } },
    });
    await sceneTagInheritanceService.computeInheritedTags(SCENES);

    expect(await junctionRows()).toEqual([
      "1:2@stij-a",
      "1:2@stij-b",
      "2:2@stij-b",
    ]);
    expect(await jsonRows()).toEqual(await junctionRows());
  });

  it("a whole-library run writes the same rows as a scoped one", async () => {
    await sceneTagInheritanceService.computeInheritedTags("all");

    expect(await junctionRows()).toEqual([
      "1:1@stij-a",
      "1:2@stij-a",
      "1:2@stij-b",
      "1:3@stij-a",
      "1:3@stij-b",
      "2:2@stij-b",
    ]);
    expect(await jsonRows()).toEqual(await junctionRows());
  });

  it("writes the JSON column and the junction in one transaction per batch", async () => {
    const recorder = recordStatements();
    try {
      await sceneTagInheritanceService.computeInheritedTags(SCENES);
    } finally {
      recorder.restore();
    }

    const writes = recorder.statements.filter((s) =>
      /^\s*(UPDATE|DELETE|INSERT)/i.test(s.sql)
    );
    expect(writes.map((s) => s.sql.trim().split(/\s+/, 3).join(" "))).toEqual([
      "UPDATE StashScene SET",
      "DELETE FROM SceneInheritedTag",
      "INSERT INTO SceneInheritedTag",
    ]);
    // One batch (four scenes): one transaction holds all three
    expect(recorder.transactions()).toBe(1);
    expect(writes.every((s) => s.inTransaction)).toBe(true);
  });
});
