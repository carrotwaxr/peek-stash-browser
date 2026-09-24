import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import prisma from "../../services/../prisma/singleton.js";
import { sceneTagInheritanceService } from "../../services/SceneTagInheritanceService.js";

/** A scene's inherited tag ids, stored as a JSON array of ids. */
function inheritedTagIdsOf(
  scene: { inheritedTagIds: string | null } | null
): string[] {
  return z.array(z.string()).parse(JSON.parse(scene?.inheritedTagIds || "[]"));
}

describe("SceneTagInheritanceService", () => {
  // Clean up test data
  beforeEach(async () => {
    await prisma.sceneTag.deleteMany({});
    await prisma.scenePerformer.deleteMany({});
    await prisma.sceneGroup.deleteMany({});
    await prisma.performerTag.deleteMany({});
    await prisma.studioTag.deleteMany({});
    await prisma.groupTag.deleteMany({});
    await prisma.stashScene.deleteMany({});
    await prisma.stashPerformer.deleteMany({});
    await prisma.stashStudio.deleteMany({});
    await prisma.stashGroup.deleteMany({});
    await prisma.stashTag.deleteMany({});
  });

  afterEach(async () => {
    await prisma.sceneTag.deleteMany({});
    await prisma.scenePerformer.deleteMany({});
    await prisma.sceneGroup.deleteMany({});
    await prisma.performerTag.deleteMany({});
    await prisma.studioTag.deleteMany({});
    await prisma.groupTag.deleteMany({});
    await prisma.stashScene.deleteMany({});
    await prisma.stashPerformer.deleteMany({});
    await prisma.stashStudio.deleteMany({});
    await prisma.stashGroup.deleteMany({});
    await prisma.stashTag.deleteMany({});
  });

  // Use unique prefixes to avoid collisions with other test files
  const PREFIX = "sti-"; // Scene Tag Inheritance
  const INSTANCE_ID = "test-instance-sti";

  describe("computeInheritedTags", () => {
    it("should inherit tags from performer", async () => {
      await prisma.stashTag.create({
        data: {
          id: `${PREFIX}tag-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Performer Tag",
        },
      });
      await prisma.stashPerformer.create({
        data: {
          id: `${PREFIX}performer-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Test Performer",
        },
      });
      await prisma.performerTag.create({
        data: {
          performerId: `${PREFIX}performer-1`,
          performerInstanceId: INSTANCE_ID,
          tagId: `${PREFIX}tag-1`,
          tagInstanceId: INSTANCE_ID,
        },
      });
      await prisma.stashScene.create({
        data: {
          id: `${PREFIX}scene-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Scene",
        },
      });
      await prisma.scenePerformer.create({
        data: {
          sceneId: `${PREFIX}scene-1`,
          sceneInstanceId: INSTANCE_ID,
          performerId: `${PREFIX}performer-1`,
          performerInstanceId: INSTANCE_ID,
        },
      });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findFirst({
        where: { id: `${PREFIX}scene-1` },
      });
      const inheritedTagIds = inheritedTagIdsOf(scene);
      expect(inheritedTagIds).toContain(`${PREFIX}tag-1`);
    });

    it("should inherit tags from studio", async () => {
      await prisma.stashTag.create({
        data: {
          id: `${PREFIX}tag-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Studio Tag",
        },
      });
      await prisma.stashStudio.create({
        data: {
          id: `${PREFIX}studio-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Test Studio",
        },
      });
      await prisma.studioTag.create({
        data: {
          studioId: `${PREFIX}studio-1`,
          studioInstanceId: INSTANCE_ID,
          tagId: `${PREFIX}tag-1`,
          tagInstanceId: INSTANCE_ID,
        },
      });
      await prisma.stashScene.create({
        data: {
          id: `${PREFIX}scene-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Scene",
          studioId: `${PREFIX}studio-1`,
        },
      });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findFirst({
        where: { id: `${PREFIX}scene-1` },
      });
      const inheritedTagIds = inheritedTagIdsOf(scene);
      expect(inheritedTagIds).toContain(`${PREFIX}tag-1`);
    });

    it("should inherit tags from group", async () => {
      await prisma.stashTag.create({
        data: {
          id: `${PREFIX}tag-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Group Tag",
        },
      });
      await prisma.stashGroup.create({
        data: {
          id: `${PREFIX}group-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Test Group",
        },
      });
      await prisma.groupTag.create({
        data: {
          groupId: `${PREFIX}group-1`,
          groupInstanceId: INSTANCE_ID,
          tagId: `${PREFIX}tag-1`,
          tagInstanceId: INSTANCE_ID,
        },
      });
      await prisma.stashScene.create({
        data: {
          id: `${PREFIX}scene-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Scene",
        },
      });
      await prisma.sceneGroup.create({
        data: {
          sceneId: `${PREFIX}scene-1`,
          sceneInstanceId: INSTANCE_ID,
          groupId: `${PREFIX}group-1`,
          groupInstanceId: INSTANCE_ID,
        },
      });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findFirst({
        where: { id: `${PREFIX}scene-1` },
      });
      const inheritedTagIds = inheritedTagIdsOf(scene);
      expect(inheritedTagIds).toContain(`${PREFIX}tag-1`);
    });

    it("should NOT include direct scene tags in inheritedTagIds", async () => {
      await prisma.stashTag.create({
        data: {
          id: `${PREFIX}tag-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Direct Tag",
        },
      });
      await prisma.stashScene.create({
        data: {
          id: `${PREFIX}scene-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Scene",
        },
      });
      await prisma.sceneTag.create({
        data: {
          sceneId: `${PREFIX}scene-1`,
          sceneInstanceId: INSTANCE_ID,
          tagId: `${PREFIX}tag-1`,
          tagInstanceId: INSTANCE_ID,
        },
      });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findFirst({
        where: { id: `${PREFIX}scene-1` },
      });
      const inheritedTagIds = inheritedTagIdsOf(scene);
      expect(inheritedTagIds).not.toContain(`${PREFIX}tag-1`);
    });

    it("should deduplicate tags from multiple sources", async () => {
      await prisma.stashTag.create({
        data: {
          id: `${PREFIX}tag-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Shared Tag",
        },
      });
      await prisma.stashPerformer.create({
        data: {
          id: `${PREFIX}performer-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Test Performer",
        },
      });
      await prisma.performerTag.create({
        data: {
          performerId: `${PREFIX}performer-1`,
          performerInstanceId: INSTANCE_ID,
          tagId: `${PREFIX}tag-1`,
          tagInstanceId: INSTANCE_ID,
        },
      });
      await prisma.stashStudio.create({
        data: {
          id: `${PREFIX}studio-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Test Studio",
        },
      });
      await prisma.studioTag.create({
        data: {
          studioId: `${PREFIX}studio-1`,
          studioInstanceId: INSTANCE_ID,
          tagId: `${PREFIX}tag-1`,
          tagInstanceId: INSTANCE_ID,
        },
      });
      await prisma.stashScene.create({
        data: {
          id: `${PREFIX}scene-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Scene",
          studioId: `${PREFIX}studio-1`,
        },
      });
      await prisma.scenePerformer.create({
        data: {
          sceneId: `${PREFIX}scene-1`,
          sceneInstanceId: INSTANCE_ID,
          performerId: `${PREFIX}performer-1`,
          performerInstanceId: INSTANCE_ID,
        },
      });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findFirst({
        where: { id: `${PREFIX}scene-1` },
      });
      const inheritedTagIds = inheritedTagIdsOf(scene);
      const tagCount = inheritedTagIds.filter(
        (id: string) => id === `${PREFIX}tag-1`
      ).length;
      expect(tagCount).toBe(1);
    });

    it("should handle scene with no related entities", async () => {
      await prisma.stashScene.create({
        data: {
          id: `${PREFIX}scene-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Standalone Scene",
        },
      });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findFirst({
        where: { id: `${PREFIX}scene-1` },
      });
      const inheritedTagIds = inheritedTagIdsOf(scene);
      expect(inheritedTagIds).toEqual([]);
    });

    it("should collect tags from multiple performers", async () => {
      await prisma.stashTag.createMany({
        data: [
          { id: `${PREFIX}tag-1`, stashInstanceId: INSTANCE_ID, name: "Tag 1" },
          { id: `${PREFIX}tag-2`, stashInstanceId: INSTANCE_ID, name: "Tag 2" },
        ],
      });
      await prisma.stashPerformer.createMany({
        data: [
          {
            id: `${PREFIX}performer-1`,
            stashInstanceId: INSTANCE_ID,
            name: "P1",
          },
          {
            id: `${PREFIX}performer-2`,
            stashInstanceId: INSTANCE_ID,
            name: "P2",
          },
        ],
      });
      await prisma.performerTag.create({
        data: {
          performerId: `${PREFIX}performer-1`,
          performerInstanceId: INSTANCE_ID,
          tagId: `${PREFIX}tag-1`,
          tagInstanceId: INSTANCE_ID,
        },
      });
      await prisma.performerTag.create({
        data: {
          performerId: `${PREFIX}performer-2`,
          performerInstanceId: INSTANCE_ID,
          tagId: `${PREFIX}tag-2`,
          tagInstanceId: INSTANCE_ID,
        },
      });
      await prisma.stashScene.create({
        data: {
          id: `${PREFIX}scene-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Scene",
        },
      });
      await prisma.scenePerformer.createMany({
        data: [
          {
            sceneId: `${PREFIX}scene-1`,
            sceneInstanceId: INSTANCE_ID,
            performerId: `${PREFIX}performer-1`,
            performerInstanceId: INSTANCE_ID,
          },
          {
            sceneId: `${PREFIX}scene-1`,
            sceneInstanceId: INSTANCE_ID,
            performerId: `${PREFIX}performer-2`,
            performerInstanceId: INSTANCE_ID,
          },
        ],
      });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findFirst({
        where: { id: `${PREFIX}scene-1` },
      });
      const inheritedTagIds = inheritedTagIdsOf(scene);
      expect(inheritedTagIds).toContain(`${PREFIX}tag-1`);
      expect(inheritedTagIds).toContain(`${PREFIX}tag-2`);
    });

    it("keeps each instance's inherited tags when two instances share a scene id", async () => {
      const INSTANCE_B = "test-instance-sti-b";
      const copies = [
        { instanceId: INSTANCE_ID, tagId: `${PREFIX}tag-a` },
        { instanceId: INSTANCE_B, tagId: `${PREFIX}tag-b` },
      ];

      for (const { instanceId, tagId } of copies) {
        await prisma.stashTag.create({
          data: { id: tagId, stashInstanceId: instanceId, name: tagId },
        });
        await prisma.stashPerformer.create({
          data: {
            id: `${PREFIX}performer-1`,
            stashInstanceId: instanceId,
            name: "Shared-id Performer",
          },
        });
        await prisma.performerTag.create({
          data: {
            performerId: `${PREFIX}performer-1`,
            performerInstanceId: instanceId,
            tagId,
            tagInstanceId: instanceId,
          },
        });
        await prisma.stashScene.create({
          data: {
            id: `${PREFIX}scene-1`,
            stashInstanceId: instanceId,
            title: "Shared-id Scene",
          },
        });
        await prisma.scenePerformer.create({
          data: {
            sceneId: `${PREFIX}scene-1`,
            sceneInstanceId: instanceId,
            performerId: `${PREFIX}performer-1`,
            performerInstanceId: instanceId,
          },
        });
      }

      await sceneTagInheritanceService.computeInheritedTags();

      const sceneA = await prisma.stashScene.findFirst({
        where: { id: `${PREFIX}scene-1`, stashInstanceId: INSTANCE_ID },
      });
      const sceneB = await prisma.stashScene.findFirst({
        where: { id: `${PREFIX}scene-1`, stashInstanceId: INSTANCE_B },
      });
      expect(inheritedTagIdsOf(sceneA)).toEqual([`${PREFIX}tag-a`]);
      expect(inheritedTagIdsOf(sceneB)).toEqual([`${PREFIX}tag-b`]);
    });

    it("writes inherited tags for a scene whose id contains a quote", async () => {
      const sceneId = `${PREFIX}scene-o'1`;
      await prisma.stashTag.create({
        data: {
          id: `${PREFIX}tag-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Performer Tag",
        },
      });
      await prisma.stashPerformer.create({
        data: {
          id: `${PREFIX}performer-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Test Performer",
        },
      });
      await prisma.performerTag.create({
        data: {
          performerId: `${PREFIX}performer-1`,
          performerInstanceId: INSTANCE_ID,
          tagId: `${PREFIX}tag-1`,
          tagInstanceId: INSTANCE_ID,
        },
      });
      await prisma.stashScene.create({
        data: { id: sceneId, stashInstanceId: INSTANCE_ID, title: "Quoted" },
      });
      await prisma.scenePerformer.create({
        data: {
          sceneId,
          sceneInstanceId: INSTANCE_ID,
          performerId: `${PREFIX}performer-1`,
          performerInstanceId: INSTANCE_ID,
        },
      });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findFirst({
        where: { id: sceneId, stashInstanceId: INSTANCE_ID },
      });
      expect(inheritedTagIdsOf(scene)).toEqual([`${PREFIX}tag-1`]);
    });
  });
});
