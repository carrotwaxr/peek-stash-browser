import { describe, it, expect, vi } from "vitest";
import { ClipService } from "../../services/ClipService.js";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";

describe("ClipService", () => {
  const clipService = new ClipService();

  describe("getClipsForScene", () => {
    it("should return empty array for scene with no clips", async () => {
      const clips = await clipService.getClipsForScene("nonexistent-scene", 1);
      expect(clips).toEqual([]);
    });
  });

  describe("getClips", () => {
    it("should return empty result when no clips exist", async () => {
      const result = await clipService.getClips(1, { isGenerated: true });
      expect(result.clips).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("should respect pagination options", async () => {
      const result = await clipService.getClips(1, { page: 1, perPage: 10 });
      expect(result.clips.length).toBeLessThanOrEqual(10);
    });
  });

  describe("getClipById", () => {
    it("should return null for non-existent clip", async () => {
      const clip = await clipService.getClipById("nonexistent-clip", 1);
      expect(clip).toBeNull();
    });
  });

  describe("screenshot URL transformation", () => {
    it("should transform screenshotPath to proxy URL", async () => {
      const rawClip = {
        id: "marker-1",
        sceneId: "scene-1",
        title: "Test Marker",
        seconds: 30,
        endSeconds: 60,
        primaryTagId: "tag-1",
        screenshotPath: "/scene/1/marker/42/screenshot",
        isGenerated: true,
        stashCreatedAt: new Date(),
        stashUpdatedAt: new Date(),
        primaryTag: { id: "tag-1", name: "Action", color: "#ff0000" },
        tags: [],
        scene: {
          id: "scene-1",
          title: "Test Scene",
          pathScreenshot: "/scene/1/screenshot",
          studioId: null,
          stashInstanceId: "default",
        },
      };

      vi.spyOn(clipQueryBuilder, "getClipById").mockResolvedValueOnce(rawClip);

      const clip = await clipService.getClipById("marker-1", 1);

      expect(clip).not.toBeNull();
      expect(clip!.screenshotUrl).toBe(
        `/api/proxy/stash?path=${encodeURIComponent("/scene/1/marker/42/screenshot")}`
      );
      // Raw screenshotPath should not be exposed
      expect((clip as Record<string, unknown>).screenshotPath).toBeUndefined();
    });

    it("should return null screenshotUrl when screenshotPath is null", async () => {
      const rawClip = {
        id: "marker-2",
        sceneId: "scene-1",
        title: "No Screenshot Marker",
        seconds: 10,
        endSeconds: null,
        primaryTagId: null,
        screenshotPath: null,
        isGenerated: false,
        stashCreatedAt: null,
        stashUpdatedAt: null,
        primaryTag: null,
        tags: [],
        scene: {
          id: "scene-1",
          title: "Test Scene",
          pathScreenshot: "/scene/1/screenshot",
          studioId: null,
          stashInstanceId: "default",
        },
      };

      vi.spyOn(clipQueryBuilder, "getClipById").mockResolvedValueOnce(rawClip);

      const clip = await clipService.getClipById("marker-2", 1);

      expect(clip).not.toBeNull();
      expect(clip!.screenshotUrl).toBeNull();
    });

    it("should include instanceId in screenshot proxy URL for non-default instances", async () => {
      const rawClip = {
        id: "marker-3",
        sceneId: "scene-1",
        title: "Multi-Instance Marker",
        seconds: 0,
        endSeconds: null,
        primaryTagId: null,
        screenshotPath: "/scene/1/marker/99/screenshot",
        isGenerated: true,
        stashCreatedAt: null,
        stashUpdatedAt: null,
        primaryTag: null,
        tags: [],
        scene: {
          id: "scene-1",
          title: "Test Scene",
          pathScreenshot: null,
          studioId: null,
          stashInstanceId: "instance-2",
        },
      };

      vi.spyOn(clipQueryBuilder, "getClipById").mockResolvedValueOnce(rawClip);

      const clip = await clipService.getClipById("marker-3", 1);

      expect(clip).not.toBeNull();
      expect(clip!.screenshotUrl).toBe(
        `/api/proxy/stash?path=${encodeURIComponent("/scene/1/marker/99/screenshot")}&instanceId=${encodeURIComponent("instance-2")}`
      );
    });
  });
});
