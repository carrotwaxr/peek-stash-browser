/**
 * A detail page's tab counts (B19): each tab's count is its list builder's
 * count over the request the tab's grid sends, parsed by the list parser.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { countRelations } from "../../services/RelationCounts.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { must } from "../helpers/must.js";

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

const options = { userId: 4, allowedInstanceIds: ["inst-a"] };
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
    ]);
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
      }))
    );
    expect(asked).toEqual(Array.from({ length: 6 }, () => options));
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

  it("a studio page's sub-studios reach the tabs whose field takes a depth, not the performers'", async () => {
    await countRelations("studio", ref, { ...options, depth: -1 });

    const deep = { refs: [ref], modifier: "INCLUDES", depth: -1 };
    expect(sentFilters()).toEqual({
      scene: { studios: deep },
      gallery: { studios: deep },
      image: { studios: deep },
      performer: { studios: { ...deep, depth: 0 } },
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
