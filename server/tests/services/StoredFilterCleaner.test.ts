/**
 * Stored filter presets and carousel rules cleaned against the filter
 * contract (item 38, data migration 009). The cleaners are pure: a bare id's
 * instance comes from a lookup, which `bareRefLookupFor` answers from one
 * query per entity type (the query itself runs against real SQLite in
 * integration/services/StoredFilterCleaner.integration.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  type BareRefLookup,
  bareRefLookupFor,
  cleanCarouselRules,
  cleanFilterPresets,
  cleanPresetState,
} from "../../services/StoredFilterCleaner.js";
import { prismaImpl } from "../helpers/prismaMock.js";
import { untrusted } from "../helpers/untrusted.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const mockPrisma = vi.mocked(prisma, true);

/** Answers the bare ids listed for each type, with that instance */
function lookupOf(
  answers: Partial<Record<string, Record<string, string>>>
): BareRefLookup {
  return (target, id) => answers[target]?.[id];
}

/** A preset as the client saves it */
function preset(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "preset-1",
    name: "My preset",
    filters: {},
    sort: "created_at",
    direction: "DESC",
    viewMode: "grid",
    zoomLevel: "medium",
    gridDensity: "medium",
    tableColumns: null,
    perPage: 40,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...fields,
  };
}

describe("cleanPresetState", () => {
  it("an unknown preset key and an invalid modifier go; the rest of the preset is byte-identical", () => {
    const stored = preset({
      filters: {
        tagIds: ["5:inst-a", "7:inst-a"],
        tagIdsModifier: "SOMETIMES",
        performerIds: ["3:inst-a"],
        performerIdsModifier: "INCLUDES_ALL",
        notAFilter: true,
        studioIds: ["9:inst-a"],
        studioIdsDepth: -1,
        rating: { min: "3" },
      },
      sort: "created_at",
      direction: "ASC",
      perPage: 120,
    });

    const { value, changed, report } = cleanPresetState("image", stored);

    const expected = preset({
      filters: {
        tagIds: ["5:inst-a", "7:inst-a"],
        performerIds: ["3:inst-a"],
        performerIdsModifier: "INCLUDES_ALL",
        studioIds: ["9:inst-a"],
        studioIdsDepth: -1,
        rating: { min: "3" },
      },
      sort: "created_at",
      direction: "ASC",
      perPage: 120,
    });
    expect(changed).toBe(true);
    // Same keys, same order, same values: the JSON written back
    expect(JSON.stringify(value)).toBe(JSON.stringify(expected));
    expect(report.droppedKeys).toEqual(["tagIdsModifier", "notAFilter"]);
    // The input is not modified
    expect(stored.filters).toHaveProperty("notAFilter", true);
  });

  it("a modifier outside its field's list goes: Has ALL on a one-studio field, an unknown resolution comparison", () => {
    const gallery = cleanPresetState(
      "gallery",
      preset({
        filters: { studioIds: ["2:a"], studioIdsModifier: "INCLUDES_ALL" },
        sort: "title",
      })
    );
    const scene = cleanPresetState(
      "scene",
      preset({
        filters: { resolution: "FULL_HD", resolutionModifier: "AROUND" },
      })
    );

    expect(gallery.report.droppedKeys).toEqual(["studioIdsModifier"]);
    expect(scene.report.droppedKeys).toEqual(["resolutionModifier"]);
    expect(scene.value).toEqual(preset({ filters: { resolution: "FULL_HD" } }));
  });

  it("a depth that is not a whole number from -1 goes; -1 and 0 stay", () => {
    const { report } = cleanPresetState(
      "scene",
      preset({
        filters: {
          tagIds: ["1:a"],
          tagIdsDepth: -2,
          studioId: "4:a",
          studioIdDepth: "all",
        },
      })
    );
    const kept = cleanPresetState(
      "performer",
      preset({ filters: { tagIds: ["1:a"], tagIdsDepth: -1 }, sort: "name" })
    );
    const zero = cleanPresetState(
      "studio",
      preset({ filters: { tagIds: ["1:a"], tagIdsDepth: 0 }, sort: "name" })
    );

    expect(report.droppedKeys).toEqual(["tagIdsDepth", "studioIdDepth"]);
    expect(kept.changed).toBe(false);
    expect(zero.changed).toBe(false);
  });

  it("a tag or collection preset's sceneId goes (the panel no longer has it); a clip preset keeps its sceneId", () => {
    const tag = cleanPresetState(
      "tag",
      preset({ filters: { sceneId: "12", favorite: true }, sort: "name" })
    );
    const group = cleanPresetState(
      "group",
      preset({ filters: { sceneId: "12" }, sort: "name" })
    );
    const clip = cleanPresetState(
      "clip",
      preset({
        filters: { sceneId: "12:a", isGenerated: "all" },
        sort: "stashCreatedAt",
      })
    );

    expect(tag.report.droppedKeys).toEqual(["sceneId"]);
    expect(tag.value).toEqual(
      preset({ filters: { favorite: true }, sort: "name" })
    );
    expect(group.report.droppedKeys).toEqual(["sceneId"]);
    expect(clip.changed).toBe(false);
  });

  it("a page's permanent criterion, saved under its contract field, stays", () => {
    const stored = preset({
      filters: {
        date: { start: "2024-01-01", end: "2024-12-31" },
        tags: { value: ["9:a"], modifier: "INCLUDES", depth: -1 },
      },
      sort: "title",
    });

    const { changed, value } = cleanPresetState("gallery", stored);

    expect(changed).toBe(false);
    expect(value).toBe(stored);
  });

  it("perPage 500 becomes 250", () => {
    const { value, changed, report } = cleanPresetState(
      "scene",
      preset({ perPage: 500 })
    );

    expect(changed).toBe(true);
    expect(report.perPageCapped).toBe(true);
    expect(value).toEqual(preset({ perPage: 250 }));
    expect(cleanPresetState("scene", preset({ perPage: 250 })).changed).toBe(
      false
    );
  });

  it("a sort outside the list becomes the entity's default sort and direction", () => {
    const performer = cleanPresetState(
      "performer",
      preset({ sort: "bogus", direction: "DESC" })
    );
    const scene = cleanPresetState(
      "scene",
      preset({ sort: "constructor", direction: "ASC" })
    );
    const clip = cleanPresetState("clip", preset({ sort: 42 }));

    expect(performer.report.sortReset).toBe(true);
    expect(performer.value).toEqual(preset({ sort: "name", direction: "ASC" }));
    expect(scene.value).toEqual(
      preset({ sort: "created_at", direction: "DESC" })
    );
    expect(clip.value).toEqual(
      preset({ sort: "stashCreatedAt", direction: "DESC" })
    );
  });

  it("a seeded random sort and a sort of the list stay; a direction is upper-cased, or else the default", () => {
    const seeded = cleanPresetState(
      "scene",
      preset({ sort: "random_12345", direction: "DESC" })
    );
    const lower = cleanPresetState(
      "gallery",
      preset({ sort: "date", direction: "desc" })
    );
    const sideways = cleanPresetState(
      "gallery",
      preset({ sort: "date", direction: "sideways" })
    );

    expect(seeded.changed).toBe(false);
    expect(lower.value).toEqual(preset({ sort: "date", direction: "DESC" }));
    expect(lower.report.directionFixed).toBe(true);
    expect(sideways.value).toEqual(preset({ sort: "date", direction: "ASC" }));
  });

  it("a preset of a type the contract does not know, or one that is not an object, is left as it is", () => {
    const unknownType = preset({ filters: { anything: 1 } });

    expect(cleanPresetState("playlist", unknownType).value).toBe(unknownType);
    expect(cleanPresetState("scene", untrusted("text")).changed).toBe(false);
    const noFilters = preset({ filters: null });
    expect(cleanPresetState("scene", noFilters).value).toBe(noFilters);
  });

  it("a bare id becomes id:instance when the lookup names its instance; otherwise it stays bare and is counted", () => {
    const lookup = lookupOf({
      tag: { "466": "default" },
      studio: { "772": "default" },
    });
    const stored = preset({
      filters: {
        studioIdsModifier: "EXCLUDES",
        studioIds: ["772", "971", "5:other"],
        tagIds: [466],
        tagIdsModifier: "EXCLUDES",
      },
    });

    const { value, report } = cleanPresetState("image", stored, lookup);

    expect(value).toEqual(
      preset({
        filters: {
          studioIdsModifier: "EXCLUDES",
          studioIds: ["772:default", "971", "5:other"],
          tagIds: ["466:default"],
          tagIdsModifier: "EXCLUDES",
        },
      })
    );
    expect(report.refsRewritten).toBe(2);
    expect(report.refsLeftBare).toBe(1);
  });

  it("each picker's ids resolve as the entity its field names: a clip's scene tags as tags, a scene's studio as a studio", () => {
    const asked: string[] = [];
    const lookup: BareRefLookup = (target, id) => {
      asked.push(`${target} ${id}`);
      return "default";
    };

    const clip = cleanPresetState(
      "clip",
      preset({ filters: { sceneTagIds: ["280"] }, sort: "duration" }),
      lookup
    );
    cleanPresetState("scene", preset({ filters: { studioId: "31" } }), lookup);
    cleanPresetState(
      "scene",
      preset({ filters: { tags: { value: ["8"], modifier: "INCLUDES" } } }),
      lookup
    );

    expect(clip.value).toEqual(
      preset({ filters: { sceneTagIds: ["280:default"] }, sort: "duration" })
    );
    expect(asked).toEqual(["tag 280", "studio 31", "tag 8"]);
  });

  it("a clean of a clean changes nothing", () => {
    const lookup = lookupOf({ tag: { "1": "a" } });
    const first = cleanPresetState(
      "scene",
      preset({
        filters: { tagIds: ["1", "2"], tagIdsModifier: "NOPE", junk: 1 },
        sort: "nope",
        perPage: 999,
      }),
      lookup
    );

    const second = cleanPresetState("scene", first.value, lookup);

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.value).toBe(first.value);
    // The one id no lookup answers is counted again, never rewritten
    expect(second.report.refsLeftBare).toBe(1);
  });
});

describe("cleanFilterPresets", () => {
  it("cleans each preset under its type and keeps the others as they are", () => {
    const performer = preset({
      id: "p",
      filters: { gender: "FEMALE" },
      sort: "rating",
    });
    const stored = {
      performer: [performer],
      tag: [preset({ id: "t", filters: { sceneId: "1" }, sort: "name" })],
    };

    const { value, changed, results } = cleanFilterPresets(stored);

    expect(changed).toBe(true);
    expect(value).toEqual({
      performer: [performer],
      tag: [preset({ id: "t", filters: {}, sort: "name" })],
    });
    expect(
      results.map(({ entity, presetId, changed: c }) => [entity, presetId, c])
    ).toEqual([
      ["performer", "p", false],
      ["tag", "t", true],
    ]);
  });

  it("leaves presets with nothing to clean as the same object", () => {
    const stored = { scene: [preset({})] };

    const cleaned = cleanFilterPresets(stored);

    expect(cleaned.changed).toBe(false);
    expect(cleaned.value).toBe(stored);
  });
});

describe("cleanCarouselRules", () => {
  it("a carousel rule with an unknown key loses it and a bogus sort becomes random", () => {
    const rules = {
      tags: { value: ["284:default"], modifier: "INCLUDES_ALL" },
      not_a_field: { value: 1 },
    };

    const { value, changed, report } = cleanCarouselRules(
      rules,
      "bogus",
      "ASC"
    );

    expect(changed).toBe(true);
    expect(value).toEqual({
      rules: { tags: { value: ["284:default"], modifier: "INCLUDES_ALL" } },
      sort: "random",
      direction: "DESC",
    });
    expect(report.droppedKeys).toEqual(["not_a_field"]);
    expect(report.sortReset).toBe(true);
  });

  it("a criterion the parser refuses goes whole, as the query ignores it", () => {
    const { value, report } = cleanCarouselRules(
      {
        performers: { value: ["3:a"], modifier: "SOMETIMES" },
        rating100: { value: 60, modifier: "GREATER_THAN" },
        studios: { value: ["x y"], modifier: "INCLUDES" },
      },
      "rating",
      "DESC"
    );

    expect(value.rules).toEqual({
      rating100: { value: 60, modifier: "GREATER_THAN" },
    });
    expect(report.droppedKeys).toEqual(["performers", "studios"]);
  });

  it("Scene Number without a collection criterion becomes random; with one it stays", () => {
    const without = cleanCarouselRules({}, "scene_index", "ASC");
    const withGroup = cleanCarouselRules(
      { groups: { value: ["5:a"], modifier: "INCLUDES" } },
      "scene_index",
      "ASC"
    );

    expect(without.value).toEqual({
      rules: {},
      sort: "random",
      direction: "DESC",
    });
    expect(withGroup.changed).toBe(false);
  });

  it("a lower-case direction is upper-cased; an unknown one becomes DESC", () => {
    expect(cleanCarouselRules({}, "date", "asc").value.direction).toBe("ASC");
    expect(cleanCarouselRules({}, "date", "up").value).toEqual({
      rules: {},
      sort: "date",
      direction: "DESC",
    });
  });

  it("valid rules, sort and direction are left as they are", () => {
    const rules = {
      tags: { value: ["284"], modifier: "INCLUDES_ALL" },
      favorite: true,
      o_counter: { value: 0, modifier: "GREATER_THAN" },
    };

    const cleaned = cleanCarouselRules(rules, "random_77", "DESC");

    expect(cleaned.changed).toBe(false);
    expect(cleaned.value.rules).toBe(rules);
    expect(cleaned.report.refsLeftBare).toBe(1);
  });

  it("rules that are not an object are left as they are; the sort is still fixed", () => {
    const cleaned = cleanCarouselRules(untrusted(["x"]), "bogus", "DESC");

    expect(cleaned.value).toEqual({
      rules: ["x"],
      sort: "random",
      direction: "DESC",
    });
  });

  it("a bare id becomes id:instance when the lookup names its instance; a clean of a clean changes nothing", () => {
    const lookup = lookupOf({ tag: { "284": "default" } });
    const rules = {
      tags: { value: ["284", "999"], modifier: "INCLUDES_ALL", depth: 0 },
    };

    const first = cleanCarouselRules(rules, "random", "DESC", lookup);
    const second = cleanCarouselRules(
      first.value.rules,
      first.value.sort,
      first.value.direction,
      lookup
    );

    expect(first.value.rules).toEqual({
      tags: {
        value: ["284:default", "999"],
        modifier: "INCLUDES_ALL",
        depth: 0,
      },
    });
    expect(first.report.refsRewritten).toBe(1);
    expect(first.report.refsLeftBare).toBe(1);
    expect(second.changed).toBe(false);
  });
});

describe("bareRefLookupFor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks once per entity type for the distinct bare ids a clean looks up, and answers from the result", async () => {
    mockPrisma.$queryRawUnsafe.mockImplementation(
      prismaImpl((sql: string) =>
        sql.includes('"StashTag"') ? [{ id: "1", instanceId: "a" }] : []
      )
    );
    const clean = (lookup: BareRefLookup) => {
      cleanPresetState(
        "scene",
        preset({ filters: { tagIds: ["1", "2", "1"], studioId: "3" } }),
        lookup
      );
      cleanCarouselRules(
        { tags: { value: ["2", "4:x"], modifier: "INCLUDES" } },
        "random",
        "DESC",
        lookup
      );
    };

    const lookup = await bareRefLookupFor(clean);

    const calls = mockPrisma.$queryRawUnsafe.mock.calls.map(
      ([sql, ...params]) => ({
        table: /"(Stash\w+)"/.exec(sql)?.[1],
        params,
      })
    );
    expect(calls).toEqual([
      { table: "StashTag", params: [JSON.stringify(["1", "2"])] },
      { table: "StashStudio", params: [JSON.stringify(["3"])] },
    ]);
    expect(lookup("tag", "1")).toBe("a");
    expect(lookup("tag", "2")).toBeUndefined();
    expect(lookup("studio", "3")).toBeUndefined();
  });

  it("asks nothing when no bare id is looked up", async () => {
    const lookup = await bareRefLookupFor((l) =>
      cleanPresetState("scene", preset({ filters: { tagIds: ["1:a"] } }), l)
    );

    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(lookup("tag", "1")).toBeUndefined();
  });
});
