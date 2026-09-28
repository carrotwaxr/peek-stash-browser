import { describe, expect, it } from "vitest";
import {
  getEntityPath,
  getFilteredListPath,
  getScenePathWithTime,
} from "@/utils/entityLinks";

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

describe("getFilteredListPath", () => {
  const tag = { id: "5", instanceId: "inst-a" };

  it("filters the page through its option for the entity, in the singular, with the instance", () => {
    // The Scenes page's tag filter is tagIds; the plural would drop the instance
    expect(getFilteredListPath("/scenes", "tags", tag, true)).toBe(
      "/scenes?tagId=5&instance=inst-a"
    );
  });

  it("uses the key the page declares: studioIds on Images, studioId on Scenes", () => {
    const studio = { id: "3", instanceId: "inst-a" };
    expect(getFilteredListPath("/images", "studios", studio, true)).toBe(
      "/images?studioId=3&instance=inst-a"
    );
    expect(getFilteredListPath("/scenes", "studios", studio, true)).toBe(
      "/scenes?studioId=3&instance=inst-a"
    );
  });

  it("leaves the instance out with one server", () => {
    expect(getFilteredListPath("/images", "tags", tag, false)).toBe(
      "/images?tagId=5"
    );
  });

  it.each([
    ["/scenes", "galleries"],
    ["/performers", "galleries"],
    ["/tags", "galleries"],
    ["/performers", "scenes"],
    ["/galleries", "scenes"],
  ] as const)(
    "no link to %s for %s: the page has no such filter",
    (page, type) => {
      expect(getFilteredListPath(page, type, tag, true)).toBeUndefined();
    }
  );

  it("no link for an entity without an id", () => {
    expect(
      getFilteredListPath("/scenes", "tags", { instanceId: "inst-a" }, true)
    ).toBeUndefined();
  });
});
