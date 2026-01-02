import { describe, it, expect, beforeEach, afterEach } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneTagInheritanceService } from "../SceneTagInheritanceService.js";

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

  describe("computeInheritedTags", () => {
    it("should inherit tags from performer", async () => {
      await prisma.stashTag.create({ data: { id: "tag-1", name: "Performer Tag" } });
      await prisma.stashPerformer.create({ data: { id: "performer-1", name: "Test Performer" } });
      await prisma.performerTag.create({ data: { performerId: "performer-1", tagId: "tag-1" } });
      await prisma.stashScene.create({ data: { id: "scene-1", title: "Test Scene" } });
      await prisma.scenePerformer.create({ data: { sceneId: "scene-1", performerId: "performer-1" } });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: "scene-1" } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toContain("tag-1");
    });

    it("should inherit tags from studio", async () => {
      await prisma.stashTag.create({ data: { id: "tag-1", name: "Studio Tag" } });
      await prisma.stashStudio.create({ data: { id: "studio-1", name: "Test Studio" } });
      await prisma.studioTag.create({ data: { studioId: "studio-1", tagId: "tag-1" } });
      await prisma.stashScene.create({ data: { id: "scene-1", title: "Test Scene", studioId: "studio-1" } });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: "scene-1" } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toContain("tag-1");
    });

    it("should inherit tags from group", async () => {
      await prisma.stashTag.create({ data: { id: "tag-1", name: "Group Tag" } });
      await prisma.stashGroup.create({ data: { id: "group-1", name: "Test Group" } });
      await prisma.groupTag.create({ data: { groupId: "group-1", tagId: "tag-1" } });
      await prisma.stashScene.create({ data: { id: "scene-1", title: "Test Scene" } });
      await prisma.sceneGroup.create({ data: { sceneId: "scene-1", groupId: "group-1" } });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: "scene-1" } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toContain("tag-1");
    });

    it("should NOT include direct scene tags in inheritedTagIds", async () => {
      await prisma.stashTag.create({ data: { id: "tag-1", name: "Direct Tag" } });
      await prisma.stashScene.create({ data: { id: "scene-1", title: "Test Scene" } });
      await prisma.sceneTag.create({ data: { sceneId: "scene-1", tagId: "tag-1" } });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: "scene-1" } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).not.toContain("tag-1");
    });

    it("should deduplicate tags from multiple sources", async () => {
      await prisma.stashTag.create({ data: { id: "tag-1", name: "Shared Tag" } });
      await prisma.stashPerformer.create({ data: { id: "performer-1", name: "Test Performer" } });
      await prisma.performerTag.create({ data: { performerId: "performer-1", tagId: "tag-1" } });
      await prisma.stashStudio.create({ data: { id: "studio-1", name: "Test Studio" } });
      await prisma.studioTag.create({ data: { studioId: "studio-1", tagId: "tag-1" } });
      await prisma.stashScene.create({ data: { id: "scene-1", title: "Test Scene", studioId: "studio-1" } });
      await prisma.scenePerformer.create({ data: { sceneId: "scene-1", performerId: "performer-1" } });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: "scene-1" } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      const tagCount = inheritedTagIds.filter((id: string) => id === "tag-1").length;
      expect(tagCount).toBe(1);
    });

    it("should handle scene with no related entities", async () => {
      await prisma.stashScene.create({ data: { id: "scene-1", title: "Standalone Scene" } });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: "scene-1" } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toEqual([]);
    });

    it("should collect tags from multiple performers", async () => {
      await prisma.stashTag.createMany({ data: [{ id: "tag-1", name: "Tag 1" }, { id: "tag-2", name: "Tag 2" }] });
      await prisma.stashPerformer.createMany({ data: [{ id: "performer-1", name: "P1" }, { id: "performer-2", name: "P2" }] });
      await prisma.performerTag.create({ data: { performerId: "performer-1", tagId: "tag-1" } });
      await prisma.performerTag.create({ data: { performerId: "performer-2", tagId: "tag-2" } });
      await prisma.stashScene.create({ data: { id: "scene-1", title: "Test Scene" } });
      await prisma.scenePerformer.createMany({ data: [{ sceneId: "scene-1", performerId: "performer-1" }, { sceneId: "scene-1", performerId: "performer-2" }] });

      await sceneTagInheritanceService.computeInheritedTags();

      const scene = await prisma.stashScene.findUnique({ where: { id: "scene-1" } });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toContain("tag-1");
      expect(inheritedTagIds).toContain("tag-2");
    });
  });
});
