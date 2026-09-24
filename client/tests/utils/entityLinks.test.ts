import { describe, expect, it } from "vitest";
import { getEntityPath, getScenePathWithTime } from "@/utils/entityLinks";

describe("getEntityPath", () => {
  it("builds the path from an id string", () => {
    expect(getEntityPath("performer", "82", false)).toBe("/performer/82");
  });

  it("adds the instance when several instances are configured", () => {
    expect(getEntityPath("group", { id: 7, instanceId: "inst-1" }, true)).toBe(
      "/collection/7?instance=inst-1"
    );
  });

  it("links nowhere for an entity without an id", () => {
    expect(getEntityPath("studio", { instanceId: "inst-1" }, true)).toBe("#");
  });
});

describe("getScenePathWithTime", () => {
  it("builds the path with the whole second", () => {
    expect(getScenePathWithTime({ id: "5" }, 12.7, false)).toBe(
      "/scene/5?t=12"
    );
  });

  it("links nowhere for a scene without an id", () => {
    expect(getScenePathWithTime({}, 12.7, false)).toBe("#");
  });
});
