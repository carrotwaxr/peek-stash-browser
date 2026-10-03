/**
 * A detail page's tab counts (B19): each tab's count is its list builder's
 * count over the request the tab's grid sends, parsed by the list parser.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { countRelations } from "../../services/RelationCounts.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { must } from "../helpers/must.js";

vi.mock("../../services/ClipQueryBuilder.js", () => ({
  clipQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../services/SceneQueryBuilder.js", () => ({
  sceneQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../services/PerformerQueryBuilder.js", () => ({
  performerQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../services/StudioQueryBuilder.js", () => ({
  studioQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../services/TagQueryBuilder.js", () => ({
  tagQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../services/GroupQueryBuilder.js", () => ({
  groupQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../services/GalleryQueryBuilder.js", () => ({
  galleryQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../services/ImageQueryBuilder.js", () => ({
  imageQueryBuilder: { count: vi.fn() },
}));

const builders = {
  scene: vi.mocked(sceneQueryBuilder),
  performer: vi.mocked(performerQueryBuilder),
  studio: vi.mocked(studioQueryBuilder),
  tag: vi.mocked(tagQueryBuilder),
  group: vi.mocked(groupQueryBuilder),
  gallery: vi.mocked(galleryQueryBuilder),
  image: vi.mocked(imageQueryBuilder),
};

const clips = vi.mocked(clipQueryBuilder);

const options = {
  userId: 4,
  allowedInstanceIds: ["inst-a"],
  timeZone: "UTC",
};
const ref = { id: "12", instanceId: "inst-a" };

/** The parsed filter each builder's count was asked for, by list */
function sentFilters(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [list, builder] of Object.entries(builders)) {
    const call = builder.count.mock.lastCall;
    if (call) out[list] = must(call)[0].request.filter;
  }
  return out;
}

describe("countRelations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let n = 0;
    for (const builder of Object.values(builders)) {
      builder.count.mockImplementation(() => Promise.resolve(++n));
    }
    clips.count.mockImplementation(() => Promise.resolve(40));
  });

  it("a tag page counts its six tabs, each list filtered by the tag, with no depth by default", async () => {
    const counts = await countRelations("tag", ref, {
      ...options,
      depth: undefined,
    });

    expect(Object.keys(counts)).toEqual([
      "scenes",
      "galleries",
      "images",
      "performers",
      "studios",
      "groups",
      "clips",
    ]);
    expect(counts.clips).toBe(40);
    const tags = { refs: [ref], modifier: "INCLUDES", depth: 0 };
    expect(sentFilters()).toEqual({
      scene: { tags },
      gallery: { tags },
      image: { tags },
      performer: { tags },
      studio: { tags },
      group: { tags },
    });
    const asked = Object.values(builders).flatMap((builder) =>
      builder.count.mock.calls.map(([sent]) => ({
        userId: sent.userId,
        allowedInstanceIds: sent.allowedInstanceIds,
        timeZone: sent.timeZone,
      }))
    );
    expect(asked).toEqual(Array.from({ length: 6 }, () => options));
  });

  it("a tag's clips are the Clips page's count for the tag: generated clips, the tag alone, no depth", async () => {
    await countRelations("tag", ref, {
      ...options,
      // The toggle's depth is the tabs'; a clip's tag filter takes none
      depth: -1,
    });

    expect(clips.count).toHaveBeenCalledTimes(1);
    const sent = must(clips.count.mock.lastCall)[0];
    expect(sent.userId).toBe(4);
    expect(sent.allowedInstanceIds).toEqual(["inst-a"]);
    expect(sent.request.filter).toEqual({
      tags: { refs: [ref], modifier: "INCLUDES", depth: 0 },
      is_generated: true,
    });
  });

  it("only a tag page counts clips", async () => {
    await countRelations("studio", ref, { ...options, depth: undefined });
    await countRelations("performer", ref, { ...options, depth: undefined });
    expect(clips.count).not.toHaveBeenCalled();
  });

  it("the counts are each builder's answer, in turn", async () => {
    const counts = await countRelations("gallery", ref, {
      ...options,
      depth: undefined,
    });
    expect(counts).toEqual({ images: 1, scenes: 2 });
    expect(builders.image.count).toHaveBeenCalledTimes(1);
    expect(builders.scene.count).toHaveBeenCalledTimes(1);
  });

  it("a studio page's sub-studios reach every tab, the performers' through their scenes", async () => {
    await countRelations("studio", ref, { ...options, depth: -1 });

    const deep = { refs: [ref], modifier: "INCLUDES", depth: -1 };
    expect(sentFilters()).toEqual({
      scene: { studios: deep },
      gallery: { studios: deep },
      image: { studios: deep },
      performer: { studios: deep },
      group: { studios: deep },
    });
  });

  it("performer and collection pages filter each tab by the page's entity", async () => {
    await countRelations("performer", ref, { ...options, depth: undefined });
    const performers = { refs: [ref], modifier: "INCLUDES", depth: 0 };
    expect(sentFilters()).toEqual({
      scene: { performers },
      gallery: { performers },
      image: { performers },
      group: { performers },
    });

    vi.clearAllMocks();
    await countRelations("group", ref, { ...options, depth: undefined });
    const groups = { refs: [ref], modifier: "INCLUDES", depth: 0 };
    expect(sentFilters()).toEqual({
      scene: { groups },
      performer: { groups },
    });
  });
});
