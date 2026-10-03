/**
 * A View's filters checked on save (9b, W6): the flat prefixed state of
 * Contract 3, its keys read through `parseRowKey`, at most 20 rows and 5
 * groups, 64 KB. A bare id is tied to its one instance through the lookup and
 * kept as sent when it cannot be; a multi row's lone value becomes a list.
 */
import {
  LIST_KINDS,
  type ListKind,
  UI_KEYS,
} from "@peek/shared-types/filters/index.js";
import { describe, expect, it } from "vitest";
import type { BareRefLookup } from "../../services/StoredFilterCleaner.js";
import {
  VIEW_FILTERS_MAX_BYTES,
  isViewSort,
  validateViewFilters,
} from "../../utils/viewFilters.js";
import { must } from "../helpers/must.js";

/** Every bare id lives on one instance */
const ONE_INSTANCE: BareRefLookup = () => "inst-a";

/** The filters a check kept, failing the test on a refusal */
function accepted(
  kind: ListKind,
  filters: unknown,
  lookup: BareRefLookup = ONE_INSTANCE
) {
  const result = validateViewFilters(kind, filters, { lookup });
  if ("issues" in result) {
    throw new Error(`refused: ${JSON.stringify(result.issues)}`);
  }
  return result;
}

/** The paths a check refused */
function refusedPaths(kind: ListKind, filters: unknown): string[] {
  const result = validateViewFilters(kind, filters, { lookup: ONE_INSTANCE });
  return "issues" in result ? result.issues.map((issue) => issue.path) : [];
}

// ── client/tests/utils/filterGolden.test.ts: PERMANENT and PROD_PRESETS ──

const ref = (id: string, modifier = "INCLUDES", depth?: number) => ({
  value: [`${id}:inst-a`],
  modifier,
  ...(depth === undefined ? {} : { depth }),
});

const DATES = [
  { date: { start: "2020-01-01", end: "2024-12-31" } },
  { date: { start: "2020-01-01" } },
  { date: { end: "2024-12-31" } },
];

const GOLDEN_STATES: Partial<Record<ListKind, Record<string, unknown>[]>> = {
  scene: [
    { performers: ref("10") },
    {
      performers: ref("10"),
      performerIds: ["1:inst-a", "10:inst-a"],
      performerIdsModifier: "EXCLUDES",
    },
    { studios: ref("11", "INCLUDES", -1) },
    { studios: ref("11"), studioId: "2:inst-b", studioIdDepth: -1 },
    { tags: ref("12", "INCLUDES", -1) },
    {
      tags: ref("12", "INCLUDES_ALL", 0),
      tagIds: ["3:inst-a"],
      tagIdsModifier: "EXCLUDES",
      tagIdsDepth: -1,
    },
    { groups: ref("13") },
    {
      groups: ref("13"),
      groupIds: ["4:inst-a"],
      groupIdsModifier: "EXCLUDES",
    },
    { galleries: ref("14") },
    { tagged: false },
    { tagged: true },
    ...DATES,
  ],
  gallery: [
    { tag_count: { modifier: "EQUALS", value: 0 } },
    { tag_count: { modifier: "EQUALS", value: 0 }, tagCount: { min: "2" } },
    { tags: ref("12", "INCLUDES", -1) },
    { tags: ref("12"), tagIds: ["3:inst-a"], tagIdsModifier: "EXCLUDES" },
    ...DATES,
  ],
  image: [
    { tag_count: { modifier: "EQUALS", value: 0 } },
    { tag_count: { modifier: "EQUALS", value: 0 }, tagCount: { min: "2" } },
    { performers: ref("10") },
    { studios: ref("11", "INCLUDES", -1) },
    { tags: ref("12", "INCLUDES", -1) },
    { galleries: ref("14") },
    { galleries: ref("14"), galleryIds: ["5:inst-a"] },
    ...DATES,
  ],
};

/** `User.filterPresets` of the prod snapshot (2026-09-23), as stored: bare ids */
const PROD_PRESETS: Partial<Record<ListKind, string>> = {
  performer: `{"id":"6a1cdecf-5228-4e23-9205-d235bc8df240","name":"Fave Ladies","filters":{"gender":"FEMALE"},"sort":"rating","direction":"DESC","createdAt":"2025-11-08T02:04:38.675Z"}`,
  tag: `{"id":"3abe5163-e661-4853-8009-f161758e9efe","name":"Hierarchy","filters":{},"sort":"name","direction":"ASC","viewMode":"hierarchy","zoomLevel":"medium","tableColumns":null,"createdAt":"2026-01-23T19:04:44.835Z"}`,
  clip: `{"id":"5f300887-40f6-438a-adf1-9eb072e8352c","name":"test","filters":{"sceneTagIds":["280"]},"sort":"duration","direction":"DESC","viewMode":"grid","zoomLevel":"medium","tableColumns":null,"createdAt":"2026-01-29T02:00:59.279Z"}`,
  image: `{"id":"afe187ab-6a14-4b06-85b3-5ea689dece32","name":"To Review","filters":{"studioIdsModifier":"EXCLUDES","studioIds":["772","971"],"tagIds":["466"],"tagIdsModifier":"EXCLUDES"},"sort":"created_at","direction":"ASC","viewMode":"wall","zoomLevel":"medium","gridDensity":"small","tableColumns":null,"perPage":120,"createdAt":"2026-02-19T06:33:49.853Z"}`,
};

/** The prod presets' filters and sorts, as saved after the check */
const PROD_SAVED: Partial<Record<ListKind, Record<string, unknown>>> = {
  performer: { gender: ["FEMALE"] },
  tag: {},
  clip: { sceneTagIds: ["280:inst-a"] },
  image: {
    studioIdsModifier: "EXCLUDES",
    studioIds: ["772:inst-a", "971:inst-a"],
    tagIds: ["466:inst-a"],
    tagIdsModifier: "EXCLUDES",
  },
};

describe("validateViewFilters", () => {
  it("accepts every golden preset state and the prod presets, and ties their bare ids", () => {
    for (const [kind, states] of Object.entries(GOLDEN_STATES)) {
      const list = must(
        LIST_KINDS.find((each) => each === kind),
        kind
      );
      for (const state of states) {
        // the multi Studios picker's lone id is saved as a list
        const saved =
          typeof state.studioId === "string"
            ? { ...state, studioId: [state.studioId] }
            : state;
        expect(accepted(list, state).filters, JSON.stringify(state)).toEqual(
          saved
        );
      }
    }
    for (const [kind, stored] of Object.entries(PROD_PRESETS)) {
      const list = must(
        LIST_KINDS.find((each) => each === kind),
        kind
      );
      const preset = JSON.parse(stored) as {
        filters: unknown;
        sort: unknown;
      };
      expect(accepted(list, preset.filters).filters, kind).toEqual(
        PROD_SAVED[list]
      );
      expect(isViewSort(list, preset.sort), kind).toBe(true);
    }
  });

  it("accepts every panel key and companion of every list, at the root and under a prefix", () => {
    for (const kind of LIST_KINDS) {
      for (const uiKey of UI_KEYS[kind]) {
        const keys = [
          uiKey.key,
          uiKey.modifierKey,
          uiKey.hierarchyKey,
          uiKey.excludeKey,
        ].filter((key) => key !== undefined);
        for (const key of keys) {
          for (const prefixed of [
            key,
            `2.${key}`,
            `g3.${key}`,
            `g5.4.${key}`,
          ]) {
            expect(refusedPaths(kind, { [prefixed]: null }), prefixed).toEqual(
              []
            );
          }
        }
      }
    }
  });

  it("a bare id is tied to its one instance; one held by two instances (or none) is kept bare and counted", () => {
    const lookup: BareRefLookup = (target, id) =>
      target === "tag" && id === "1" ? "inst-a" : undefined;

    const result = accepted(
      "scene",
      { tagIds: ["1", "2", "3:inst-b"], "g1.tagIds": ["2"] },
      lookup
    );

    expect(result.filters).toEqual({
      tagIds: ["1:inst-a", "2", "3:inst-b"],
      "g1.tagIds": ["2"],
    });
    expect(result.refsRewritten).toBe(1);
    expect(result.refsLeftBare).toBe(2);
  });

  it('a multi row\'s lone value becomes a list: {"gender":"FEMALE"} is saved as {"gender":["FEMALE"]}', () => {
    expect(
      accepted("performer", { gender: "FEMALE", "g1.gender": "MALE" }).filters
    ).toEqual({ gender: ["FEMALE"], "g1.gender": ["MALE"] });
  });

  it("accepts prefixed rows and group declarations", () => {
    const filters = {
      tagIds: ["1:a"],
      g1: "any",
      "g1.tagFavorite": "true",
      "g1.performerFavorite": "true",
      "2.tagIds": ["5:a"],
    };

    expect(accepted("scene", filters).filters).toEqual(filters);
    expect(accepted("scene", { match: "any", ...filters }).filters).toEqual({
      match: "any",
      ...filters,
    });
  });

  it("counts a row's companions as that row, and twenty rows across the tree", () => {
    // 20 rows: tagIds and 2..19.tagIds at the root, one group row; companions add none
    const filters: Record<string, unknown> = {
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES",
      tagIdsDepth: -1,
      tagIdsExclude: ["9:a"],
      "g1.rating": { min: "3" },
    };
    for (let n = 2; n <= 19; n++) filters[`${n}.tagIds`] = [`${n}:a`];

    expect(refusedPaths("scene", filters)).toEqual([]);
  });

  describe("refuses with a path", () => {
    it("an unknown base key, at the root and under a prefix", () => {
      expect(
        refusedPaths("scene", { notAFilter: 1, "g1.nope": 2, "2.nope": 3 })
      ).toEqual(["filters.notAFilter", "filters.g1.nope", "filters.2.nope"]);
    });

    it("a group or root match that is not all or any", () => {
      expect(
        refusedPaths("scene", { g1: "some", match: "none", "g1.rating": 1 })
      ).toEqual(["filters.g1", "filters.match"]);
    });

    it("a contract-field key under a prefix: permanent criteria are root only", () => {
      expect(
        refusedPaths("gallery", {
          tag_count: { modifier: "EQUALS", value: 0 },
          "g1.tag_count": { modifier: "EQUALS", value: 0 },
          "2.tags": ref("12"),
        })
      ).toEqual(["filters.g1.tag_count", "filters.2.tags"]);
    });

    it("21 rows", () => {
      const filters: Record<string, unknown> = { rating: { min: "1" } };
      for (let n = 1; n <= 20; n++) {
        filters[n === 1 ? "tagIds" : `${n}.tagIds`] = [`${n}:a`];
      }
      expect(refusedPaths("scene", filters)).toEqual(["filters"]);
    });

    it("6 groups", () => {
      const filters: Record<string, unknown> = {};
      for (let g = 1; g <= 5; g++) filters[`g${g}.rating`] = { min: "1" };
      expect(refusedPaths("scene", filters)).toEqual([]);

      expect(
        refusedPaths("scene", { ...filters, g6: "any", "g6.rating": 1 })
      ).toEqual(["filters.g6", "filters.g6.rating"]);
    });

    it("a body over 64 KB", () => {
      const ids = Array.from({ length: 6000 }, (_, i) => `${i + 1}:inst-a`);
      expect(
        JSON.stringify({ tagIds: ids }).length > VIEW_FILTERS_MAX_BYTES
      ).toBe(true);
      expect(refusedPaths("scene", { tagIds: ids })).toEqual(["filters"]);
    });

    it("filters that are not an object", () => {
      expect(refusedPaths("scene", ["tagIds"])).toEqual(["filters"]);
      expect(refusedPaths("scene", "tagIds")).toEqual(["filters"]);
    });
  });
});

describe("isViewSort", () => {
  it("takes a list's sorts and a seeded random; a scene View may sort by recommended", () => {
    expect(isViewSort("scene", "created_at")).toBe(true);
    expect(isViewSort("scene", "random_42")).toBe(true);
    expect(isViewSort("scene", "recommended")).toBe(true);
    expect(isViewSort("performer", "recommended")).toBe(false);
    expect(isViewSort("scene", "bogus")).toBe(false);
  });
});
