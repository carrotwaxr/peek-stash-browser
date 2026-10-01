import { describe, expect, it, vi } from "vitest";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { ClipService } from "../../services/ClipService.js";
import { parsedClipRequest } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";

const VIEWER = { userId: 1, allowedInstanceIds: ["default"] };

describe("ClipService", () => {
  const clipService = new ClipService();

  describe("getClipsForScene", () => {
    it("should return empty array for scene with no clips", async () => {
      const clips = await clipService.getClipsForScene({
        ...VIEWER,
        scene: { id: "999999999", instanceId: undefined },
        includeUngenerated: true,
      });
      expect(clips).toEqual([]);
    });
  });

  describe("getClips", () => {
    it("should return empty result when no clips exist", async () => {
      const result = await clipService.getClips({
        ...VIEWER,
        request: parsedClipRequest({ filter: { isGenerated: true } }),
      });
      expect(result.clips).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("should respect pagination options", async () => {
      const result = await clipService.getClips({
        ...VIEWER,
        request: parsedClipRequest({ page: 1, perPage: 10 }),
      });
      expect(result.clips.length).toBeLessThanOrEqual(10);
    });
  });

  describe("getClipById", () => {
    it("should return no clip for a non-existent clip", async () => {
      const clips = await clipService.getClipById({
        ...VIEWER,
        ref: { id: "999999999", instanceId: undefined },
      });
      expect(clips).toEqual([]);
    });
  });

  describe("screenshot URL transformation", () => {
    it("should transform screenshotPath to proxy URL", async () => {
      const rawClip = {
        id: "marker-1",
        instanceId: "default",
        sceneId: "scene-1",
        title: "Test Marker",
        seconds: 30,
        endSeconds: 60,
        primaryTagId: "tag-1",
        screenshotPath: "/scene/1/marker/42/screenshot",
        isGenerated: true,
        stashCreatedAt: new Date("2026-01-02T03:04:05.000Z"),
        stashUpdatedAt: new Date("2026-02-03T04:05:06.000Z"),
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

      vi.spyOn(clipQueryBuilder, "getClipById").mockResolvedValueOnce([
        rawClip,
      ]);

      const [clip] = await clipService.getClipById({
        ...VIEWER,
        ref: { id: "marker-1", instanceId: undefined },
      });

      expect(clip).toBeDefined();
      expect(must(clip).screenshotUrl).toBe(
        `/api/proxy/stash?path=${encodeURIComponent("/scene/1/marker/42/screenshot")}&instanceId=default`
      );
      // Raw screenshotPath should not be exposed
      expect(clip).not.toHaveProperty("screenshotPath");
      // Dates are sent as the ISO strings JSON carries
      expect(must(clip).stashCreatedAt).toBe("2026-01-02T03:04:05.000Z");
      expect(must(clip).stashUpdatedAt).toBe("2026-02-03T04:05:06.000Z");
      // The clip and its scene carry their instance
      expect(must(clip).instanceId).toBe("default");
      expect(must(clip).scene).toEqual({
        id: "scene-1",
        instanceId: "default",
        title: "Test Scene",
        pathScreenshot: `/api/proxy/stash?path=${encodeURIComponent("/scene/1/screenshot")}&instanceId=default`,
        studioId: null,
      });
    });

    it("should return null screenshotUrl when screenshotPath is null", async () => {
      const rawClip = {
        id: "marker-2",
        instanceId: "default",
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

      vi.spyOn(clipQueryBuilder, "getClipById").mockResolvedValueOnce([
        rawClip,
      ]);

      const [clip] = await clipService.getClipById({
        ...VIEWER,
        ref: { id: "marker-2", instanceId: undefined },
      });

      expect(clip).toBeDefined();
      expect(must(clip).screenshotUrl).toBeNull();
    });

    it("should include the scene's instanceId in the screenshot proxy URL", async () => {
      const rawClip = {
        id: "marker-3",
        instanceId: "instance-2",
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

      vi.spyOn(clipQueryBuilder, "getClipById").mockResolvedValueOnce([
        rawClip,
      ]);

      const [clip] = await clipService.getClipById({
        ...VIEWER,
        ref: { id: "marker-3", instanceId: undefined },
      });

      expect(clip).toBeDefined();
      expect(must(clip).screenshotUrl).toBe(
        `/api/proxy/stash?path=${encodeURIComponent("/scene/1/marker/99/screenshot")}&instanceId=${encodeURIComponent("instance-2")}`
      );
    });
  });
});
