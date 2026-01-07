import { describe, it, expect, beforeEach, afterEach } from "vitest";
import prisma from "../../services/../prisma/singleton.js";
import { sceneTagInheritanceService } from "../../services/SceneTagInheritanceService.js";

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

  describe("computeInheritedTags", () => {
    it("should inherit tags from performer", async () => {
      await prisma.stashTag.create({ data: { id: `${PREFIX}tag-1`, name: "Performer Tag" } });
      await prisma.stashPerformer.create({ data: { id: `${PREFIX}performer-1`, name: "Test Performer" } });
      await prisma.performerTag.create({ data: { performerId: `${PREFIX}performer-1`, tagId: `${PREFIX}tag-1` } });
      await prisma.stashScene.create({ data: { id: `${PREFIX}scene-1`, title: "Test Scene" } });
      await prisma.scenePerformer.create({ data: { sceneId: `${PREFIX}scene-1`, performerId: `${PREFIX}performer-1` } });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: `${PREFIX}scene-1` } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toContain(`${PREFIX}tag-1`);
    });

    it("should inherit tags from studio", async () => {
      await prisma.stashTag.create({ data: { id: `${PREFIX}tag-1`, name: "Studio Tag" } });
      await prisma.stashStudio.create({ data: { id: `${PREFIX}studio-1`, name: "Test Studio" } });
      await prisma.studioTag.create({ data: { studioId: `${PREFIX}studio-1`, tagId: `${PREFIX}tag-1` } });
      await prisma.stashScene.create({ data: { id: `${PREFIX}scene-1`, title: "Test Scene", studioId: `${PREFIX}studio-1` } });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: `${PREFIX}scene-1` } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toContain(`${PREFIX}tag-1`);
    });

    it("should inherit tags from group", async () => {
      await prisma.stashTag.create({ data: { id: `${PREFIX}tag-1`, name: "Group Tag" } });
      await prisma.stashGroup.create({ data: { id: `${PREFIX}group-1`, name: "Test Group" } });
      await prisma.groupTag.create({ data: { groupId: `${PREFIX}group-1`, tagId: `${PREFIX}tag-1` } });
      await prisma.stashScene.create({ data: { id: `${PREFIX}scene-1`, title: "Test Scene" } });
      await prisma.sceneGroup.create({ data: { sceneId: `${PREFIX}scene-1`, groupId: `${PREFIX}group-1` } });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: `${PREFIX}scene-1` } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toContain(`${PREFIX}tag-1`);
    });

    it("should NOT include direct scene tags in inheritedTagIds", async () => {
      await prisma.stashTag.create({ data: { id: `${PREFIX}tag-1`, name: "Direct Tag" } });
      await prisma.stashScene.create({ data: { id: `${PREFIX}scene-1`, title: "Test Scene" } });
      await prisma.sceneTag.create({ data: { sceneId: `${PREFIX}scene-1`, tagId: `${PREFIX}tag-1` } });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: `${PREFIX}scene-1` } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).not.toContain(`${PREFIX}tag-1`);
    });

    it("should deduplicate tags from multiple sources", async () => {
      await prisma.stashTag.create({ data: { id: `${PREFIX}tag-1`, name: "Shared Tag" } });
      await prisma.stashPerformer.create({ data: { id: `${PREFIX}performer-1`, name: "Test Performer" } });
      await prisma.performerTag.create({ data: { performerId: `${PREFIX}performer-1`, tagId: `${PREFIX}tag-1` } });
      await prisma.stashStudio.create({ data: { id: `${PREFIX}studio-1`, name: "Test Studio" } });
      await prisma.studioTag.create({ data: { studioId: `${PREFIX}studio-1`, tagId: `${PREFIX}tag-1` } });
      await prisma.stashScene.create({ data: { id: `${PREFIX}scene-1`, title: "Test Scene", studioId: `${PREFIX}studio-1` } });
      await prisma.scenePerformer.create({ data: { sceneId: `${PREFIX}scene-1`, performerId: `${PREFIX}performer-1` } });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: `${PREFIX}scene-1` } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      const tagCount = inheritedTagIds.filter((id: string) => id === `${PREFIX}tag-1`).length;
      expect(tagCount).toBe(1);
    });

    it("should handle scene with no related entities", async () => {
      await prisma.stashScene.create({ data: { id: `${PREFIX}scene-1`, title: "Standalone Scene" } });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: `${PREFIX}scene-1` } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toEqual([]);
    });

    it("should collect tags from multiple performers", async () => {
      await prisma.stashTag.createMany({ data: [{ id: `${PREFIX}tag-1`, name: "Tag 1" }, { id: `${PREFIX}tag-2`, name: "Tag 2" }] });
      await prisma.stashPerformer.createMany({ data: [{ id: `${PREFIX}performer-1`, name: "P1" }, { id: `${PREFIX}performer-2`, name: "P2" }] });
      await prisma.performerTag.create({ data: { performerId: `${PREFIX}performer-1`, tagId: `${PREFIX}tag-1` } });
      await prisma.performerTag.create({ data: { performerId: `${PREFIX}performer-2`, tagId: `${PREFIX}tag-2` } });
      await prisma.stashScene.create({ data: { id: `${PREFIX}scene-1`, title: "Test Scene" } });
      await prisma.scenePerformer.createMany({ data: [{ sceneId: `${PREFIX}scene-1`, performerId: `${PREFIX}performer-1` }, { sceneId: `${PREFIX}scene-1`, performerId: `${PREFIX}performer-2` }] });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: `${PREFIX}scene-1` } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toContain(`${PREFIX}tag-1`);
      expect(inheritedTagIds).toContain(`${PREFIX}tag-2`);
    });
  });
});
