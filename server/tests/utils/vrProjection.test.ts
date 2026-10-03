/**
 * Unit tests for detectVrProjection (PR 11, V1).
 *
 * A VR scene's projection comes from, in order: its tag names and aliases,
 * its file name tokens, its frame shape, then 180 side by side.
 */
import { describe, expect, it } from "vitest";
import { detectVrProjection } from "../../utils/vrProjection.js";

const detect = (over: Partial<Parameters<typeof detectVrProjection>[0]> = {}) =>
  detectVrProjection({
    tagNames: [],
    filePath: null,
    width: null,
    height: null,
    ...over,
  });

describe("detectVrProjection: tags", () => {
  it("reads MKX200 as a 200 degree fisheye", () => {
    expect(detect({ tagNames: ["VR", "MKX200"] })).toEqual({
      projection: "FISHEYE_200_LR",
      source: "tag",
    });
  });

  it("reads the sbs alias with SPHERE as 360 side by side", () => {
    expect(detect({ tagNames: ["sbs", "SPHERE"] })).toEqual({
      projection: "360_LR",
      source: "tag",
    });
  });

  it("reads TB with SPHERE as 360 top-bottom", () => {
    expect(detect({ tagNames: ["TB", "SPHERE"] })).toEqual({
      projection: "360_TB",
      source: "tag",
    });
  });

  it("compares tag names without case or surrounding space", () => {
    expect(detect({ tagNames: [" mkx200 "] }).projection).toBe(
      "FISHEYE_200_LR"
    );
  });

  it("reads DOME as 180 side by side and CUBEMAP as equi-angular cubemap", () => {
    expect(detect({ tagNames: ["DOME"] }).projection).toBe("180_LR");
    expect(detect({ tagNames: ["CUBEMAP"] }).projection).toBe("EAC_LR");
    expect(detect({ tagNames: ["EAC"] }).projection).toBe("EAC_LR");
  });

  it("beats the file name", () => {
    expect(
      detect({ tagNames: ["MKX200"], filePath: "/v/scene_360_TB.mp4" })
    ).toEqual({ projection: "FISHEYE_200_LR", source: "tag" });
  });

  it("ignores tags that name no projection", () => {
    expect(
      detect({ tagNames: ["VR", "Outdoor"], filePath: "/v/a_360_TB.mp4" })
    ).toEqual({ projection: "360_TB", source: "filename" });
  });
});

describe("detectVrProjection: file name", () => {
  it.each([
    ["scene_180_LR.mp4", "180_LR"],
    ["x_MKX200.mp4", "FISHEYE_200_LR"],
    ["x_RF52.mp4", "FISHEYE_200_LR"],
    ["x_FISHEYE190.mp4", "FISHEYE_200_LR"],
    ["x_VRCA220.mp4", "FISHEYE_220_LR"],
    ["x_360_TB.mkv", "360_TB"],
    ["x_360_LR.mp4", "360_LR"],
    ["x_3dh.mp4", "180_LR"],
    ["x_2D_360.mp4", "360"],
    ["x_180_2D.mp4", "180_MONO"],
    ["x_360EAC.mp4", "EAC_LR"],
    ["x-180-sbs.mp4", "180_LR"],
    ["x 360 tb.mp4", "360_TB"],
  ])("reads %s as %s from the filename", (name, projection) => {
    expect(detect({ filePath: `/media/${name}` })).toEqual({
      projection,
      source: "filename",
    });
  });

  it("parses a Windows path on its basename", () => {
    expect(detect({ filePath: "D:\\180_LR\\vr\\library_360_TB.mp4" })).toEqual({
      projection: "360_TB",
      source: "filename",
    });
  });

  it("does not read hints from the directories", () => {
    expect(detect({ filePath: "/media/360_TB/scene.mp4" }).source).toBe(
      "default"
    );
  });

  it("matches whole tokens only", () => {
    expect(detect({ filePath: "/media/x_1800.mp4" })).toEqual({
      projection: "180_LR",
      source: "default",
    });
    expect(detect({ filePath: "/media/x_TBA.mp4" }).source).toBe("default");
  });
});

describe("detectVrProjection: shape and default", () => {
  it("reads a 2:1 frame as 180 side by side", () => {
    expect(detect({ width: 8192, height: 4096 })).toEqual({
      projection: "180_LR",
      source: "shape",
    });
  });

  it("reads a square frame as 360 top-bottom", () => {
    expect(detect({ width: 5760, height: 5760 })).toEqual({
      projection: "360_TB",
      source: "shape",
    });
  });

  it("defaults to 180 side by side without dimensions", () => {
    expect(detect()).toEqual({ projection: "180_LR", source: "default" });
    expect(detect({ width: 0, height: 0 }).source).toBe("default");
  });

  it("defaults when the shape says nothing", () => {
    expect(detect({ width: 1440, height: 1080 })).toEqual({
      projection: "180_LR",
      source: "default",
    });
  });

  it("lets a name beat the shape", () => {
    expect(
      detect({ filePath: "/v/a_180_LR.mp4", width: 5760, height: 5760 })
    ).toEqual({ projection: "180_LR", source: "filename" });
  });
});
