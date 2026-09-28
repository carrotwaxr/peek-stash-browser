/**
 * The bridge from the parser's criteria to the filters the query builders
 * still read (B7; slice C deletes it builder by builder): refs back to "id"
 * or "id:instanceId", depth only on hierarchical fields, a multi-valued enum
 * back to its list, the tag list's scene and collection refs under
 * `scenes_filter`, and the clip list's options.
 */
import { describe, expect, it } from "vitest";
import type { ParsedClipFilter } from "../../types/parsedFilters.js";
import {
  toLegacyClipFilter,
  toLegacyFilter,
} from "../../utils/legacyFilter.js";
import { parseListRequest } from "../../utils/listRequest.js";
import { untrusted } from "../helpers/untrusted.js";

const opts = { userId: 1, policy: "reject" } as const;

describe("toLegacyFilter", () => {
  it("spells refs as the wire did, with depth only on hierarchical fields", () => {
    const { filter } = parseListRequest(
      "scene",
      {
        ids: ["9"],
        scene_filter: {
          performers: { value: ["1", "2:inst-a"], modifier: "INCLUDES_ALL" },
          tags: { value: ["3:inst-b"], modifier: "EXCLUDES", depth: -1 },
          studios: { value: ["4"] },
        },
      },
      opts
    );

    expect(toLegacyFilter("scene", filter)).toEqual({
      ids: { value: ["9"], modifier: "INCLUDES" },
      performers: { value: ["1", "2:inst-a"], modifier: "INCLUDES_ALL" },
      tags: { value: ["3:inst-b"], modifier: "EXCLUDES", depth: -1 },
      studios: { value: ["4"], modifier: "INCLUDES", depth: 0 },
    });
  });

  it("copies number, date, text and boolean criteria; a multi-valued enum is its value list", () => {
    const { filter } = parseListRequest(
      "scene",
      {
        scene_filter: {
          rating100: { value: 20, value2: 80, modifier: "BETWEEN" },
          date: { modifier: "IS_NULL" },
          title: { value: " beach ", modifier: "INCLUDES" },
          resolution: { value: "FULL_HD", modifier: "GREATER_THAN" },
          orientation: { value: ["LANDSCAPE", "SQUARE"] },
          favorite: true,
          organized: false,
        },
      },
      opts
    );

    expect(toLegacyFilter("scene", filter)).toEqual({
      rating100: { value: 20, value2: 80, modifier: "BETWEEN" },
      date: { modifier: "IS_NULL" },
      title: { value: "beach", modifier: "INCLUDES" },
      resolution: { value: "FULL_HD", modifier: "GREATER_THAN" },
      orientation: { value: ["LANDSCAPE", "SQUARE"], modifier: "INCLUDES" },
      favorite: true,
      organized: false,
    });
  });

  it("puts the tag list's scene and collection refs back under scenes_filter", () => {
    const { filter } = parseListRequest(
      "tag",
      {
        tag_filter: {
          scenes_filter: {
            id: { value: ["5:inst-a"], modifier: "INCLUDES" },
            groups: { value: ["6"], modifier: "EXCLUDES" },
          },
          performers: { value: ["7"] },
        },
      },
      opts
    );

    expect(toLegacyFilter("tag", filter)).toEqual({
      scenes_filter: {
        id: { value: ["5:inst-a"], modifier: "INCLUDES" },
        groups: { value: ["6"], modifier: "EXCLUDES" },
      },
      performers: { value: ["7"], modifier: "INCLUDES" },
    });
  });

  it("leaves the instance field out: it is the request's specificInstanceId", () => {
    const request = parseListRequest(
      "image",
      { image_filter: { instance_id: "inst-a", favorite: true } },
      opts
    );

    expect(request.specificInstanceId).toBe("inst-a");
    expect(toLegacyFilter("image", request.filter)).toEqual({ favorite: true });
  });

  it("refuses a field the contract does not declare", () => {
    expect(() =>
      toLegacyFilter("studio", untrusted({ not_a_field: true }))
    ).toThrow("No studio filter field named not_a_field");
  });
});

describe("toLegacyClipFilter", () => {
  it("gives the clip service its ref strings; one scene and one studio", () => {
    const ref = (id: string, instanceId?: string) => ({ id, instanceId });
    const filter: ParsedClipFilter = {
      isGenerated: false,
      sceneId: {
        refs: [ref("1", "inst-a"), ref("2")],
        modifier: "INCLUDES",
        depth: 0,
      },
      tagIds: {
        refs: [ref("3"), ref("4", "inst-b")],
        modifier: "INCLUDES",
        depth: 0,
      },
      studioId: { refs: [ref("5")], modifier: "INCLUDES", depth: 0 },
    };

    expect(toLegacyClipFilter(filter)).toEqual({
      isGenerated: false,
      sceneId: "1:inst-a",
      tagIds: ["3", "4:inst-b"],
      sceneTagIds: undefined,
      performerIds: undefined,
      studioId: "5",
    });
  });
});
