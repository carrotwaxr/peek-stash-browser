import { describe, it, expect } from "vitest";
import { ClipService } from "../../services/ClipService.js";

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
});
