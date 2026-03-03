import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchAndParseVTT,
  getEvenlySpacedSprites,
} from "../../src/utils/spriteSheet";

describe("spriteSheet utilities", () => {
  describe("fetchAndParseVTT", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("parses valid VTT with sprite positions", async () => {
      const vttContent = [
        "WEBVTT",
        "",
        "00:00:00.000 --> 00:00:05.000",
        "sprite.jpg#xywh=0,0,160,90",
        "",
        "00:00:05.000 --> 00:00:10.000",
        "sprite.jpg#xywh=160,0,160,90",
        "",
        "00:00:10.000 --> 00:00:15.000",
        "sprite.jpg#xywh=320,0,160,90",
      ].join("\n");

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(vttContent),
        })
      );

      const cues = await fetchAndParseVTT("http://example.com/sprites.vtt");
      expect(cues).toHaveLength(3);
      expect(cues[0]).toEqual({
        startTime: 0,
        endTime: 5,
        x: 0,
        y: 0,
        width: 160,
        height: 90,
      });
      expect(cues[1]).toEqual({
        startTime: 5,
        endTime: 10,
        x: 160,
        y: 0,
        width: 160,
        height: 90,
      });
      expect(cues[2]).toEqual({
        startTime: 10,
        endTime: 15,
        x: 320,
        y: 0,
        width: 160,
        height: 90,
      });
    });

    it("returns empty array for empty VTT content", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve("WEBVTT\n"),
        })
      );

      const cues = await fetchAndParseVTT("http://example.com/empty.vtt");
      expect(cues).toEqual([]);
    });

    it("returns empty array on fetch failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          statusText: "Not Found",
        })
      );

      const cues = await fetchAndParseVTT("http://example.com/missing.vtt");
      expect(cues).toEqual([]);
    });

    it("returns empty array on network error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error"))
      );

      const cues = await fetchAndParseVTT("http://example.com/error.vtt");
      expect(cues).toEqual([]);
    });

    it("parses VTT with HH:MM:SS.mmm timestamps", async () => {
      const vttContent = [
        "WEBVTT",
        "",
        "01:30:00.000 --> 01:30:05.000",
        "sprite.jpg#xywh=0,0,160,90",
      ].join("\n");

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(vttContent),
        })
      );

      const cues = await fetchAndParseVTT("http://example.com/long.vtt");
      expect(cues).toHaveLength(1);
      expect(cues[0].startTime).toBe(5400); // 1h 30m = 5400s
      expect(cues[0].endTime).toBe(5405);
    });
  });

  describe("getEvenlySpacedSprites", () => {
    const makeCues = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        startTime: i * 5,
        endTime: (i + 1) * 5,
        x: i * 160,
        y: 0,
        width: 160,
        height: 90,
      }));

    it("returns empty array for empty cues", () => {
      expect(getEvenlySpacedSprites([])).toEqual([]);
    });

    it("returns empty array for null/undefined cues", () => {
      expect(getEvenlySpacedSprites(null as any)).toEqual([]);
    });

    it("returns single sprite when count is 1", () => {
      const cues = makeCues(10);
      const result = getEvenlySpacedSprites(cues, 1);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ x: 0, y: 0, width: 160, height: 90 });
    });

    it("returns all sprites when count >= cues.length", () => {
      const cues = makeCues(3);
      const result = getEvenlySpacedSprites(cues, 10);
      expect(result).toHaveLength(3);
    });

    it("returns default 5 sprites for large cue set", () => {
      const cues = makeCues(20);
      const result = getEvenlySpacedSprites(cues);
      expect(result).toHaveLength(5);
    });

    it("returns correct x/y/width/height for each sprite", () => {
      const cues = makeCues(10);
      const result = getEvenlySpacedSprites(cues, 2);
      expect(result).toHaveLength(2);
      // With 10 cues and count=2, step=5, indices are 0 and 5
      expect(result[0]).toEqual({ x: 0, y: 0, width: 160, height: 90 });
      expect(result[1]).toEqual({ x: 800, y: 0, width: 160, height: 90 });
    });

    it("returns evenly distributed sprites across the timeline", () => {
      const cues = makeCues(15);
      const result = getEvenlySpacedSprites(cues, 3);
      expect(result).toHaveLength(3);
      // step = floor(15/3) = 5, indices 0, 5, 10
      expect(result[0].x).toBe(0);
      expect(result[1].x).toBe(800); // index 5 * 160
      expect(result[2].x).toBe(1600); // index 10 * 160
    });

    it("returns exactly count sprites when cues are divisible", () => {
      const cues = makeCues(10);
      const result = getEvenlySpacedSprites(cues, 5);
      expect(result).toHaveLength(5);
    });
  });
});
