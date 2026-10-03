/**
 * The performer, studio, tag and collection panels' rows for the metadata
 * filters the server added (hierarchy with depth, links, StashDB ids,
 * counts, three-state favourites): each row's state builds the request its
 * field takes and goes through the URL and back, and the old stored values
 * of the fields that stay single, and beta.7's one Gender (a preset's
 * `gender: "FEMALE"`), read as before.
 */
import {
  type ListKind,
  PANEL_FIELDS,
  type PanelField,
} from "@peek/shared-types";
import { describe, expect, it } from "vitest";
import { getFilteredListPath } from "@/utils/entityLinks";
import {
  activeFieldCount,
  buildPanelFilter,
  chipsOf,
  filterOptionsOf,
  normalizePanelState,
} from "@/utils/filterFields";
import { readListParams, writeListParams } from "@/utils/urlParams";

type State = Record<string, unknown>;

interface Case {
  readonly list: ListKind;
  readonly label: string;
  readonly state: State;
  readonly request: Record<string, unknown>;
}

const A = "5:inst-a";
const B = "6:inst-a";

const between = (min: number, max: number) => ({
  modifier: "BETWEEN",
  value: min,
  value2: max,
});

const CASES: readonly Case[] = [
  // ── Performers ──────────────────────────────────────────────────────────
  {
    list: "performer",
    label: "performer Studios at any depth",
    state: {
      studioIds: [A],
      studioIdsModifier: "INCLUDES",
      studioIdsDepth: -1,
    },
    request: { studios: { value: [A], modifier: "INCLUDES", depth: -1 } },
  },
  {
    list: "performer",
    label: "performer Studios include one and exclude another",
    state: { studioIds: [A], studioIdsExclude: [B] },
    request: { studios: { value: [A], excludes: [B], modifier: "INCLUDES" } },
  },
  {
    list: "performer",
    label: "performer Collections under Has NONE",
    state: { groupIds: [A], groupIdsModifier: "EXCLUDES" },
    request: { groups: { value: [A], modifier: "EXCLUDES" } },
  },
  {
    list: "performer",
    label: "performer Appears with all of two performers",
    state: { performerIds: [A, B], performerIdsModifier: "INCLUDES_ALL" },
    request: { performers: { value: [A, B], modifier: "INCLUDES_ALL" } },
  },
  {
    list: "performer",
    label: "performer Gender any of two",
    state: { gender: ["FEMALE", "TRANSGENDER_FEMALE"] },
    request: {
      gender: { value: ["FEMALE", "TRANSGENDER_FEMALE"], modifier: "INCLUDES" },
    },
  },
  {
    list: "performer",
    label: "performer Gender none of one",
    state: { gender: ["MALE"], genderModifier: "EXCLUDES" },
    request: { gender: { value: ["MALE"], modifier: "EXCLUDES" } },
  },
  {
    list: "performer",
    label: "performer Gender Has none",
    state: { genderModifier: "IS_NULL" },
    request: { gender: { modifier: "IS_NULL" } },
  },
  {
    list: "performer",
    label: "performer Gender Has any",
    state: { genderModifier: "NOT_NULL" },
    request: { gender: { modifier: "NOT_NULL" } },
  },
  {
    list: "performer",
    label: "performer Tags Has none",
    state: { tagIdsModifier: "IS_NULL" },
    request: { tags: { modifier: "IS_NULL" } },
  },
  {
    list: "performer",
    label: "performer favourite tag Yes",
    state: { tagFavorite: "true" },
    request: { tag_favorite: true },
  },
  {
    list: "performer",
    label: "performer favourite tag No",
    state: { tagFavorite: "false" },
    request: { tag_favorite: false },
  },
  {
    list: "performer",
    label: "performer Tag Count",
    state: { tagCount: { min: "2", max: "5" } },
    request: { tag_count: between(2, 5) },
  },
  {
    list: "performer",
    label: "performer Image, Gallery and Marker Counts",
    state: {
      imageCount: { min: "1" },
      galleryCount: { max: "3" },
      markerCount: { min: "4", max: "9" },
    },
    request: {
      image_count: { modifier: "BETWEEN", value: 1 },
      gallery_count: { modifier: "BETWEEN", value2: 3 },
      marker_count: between(4, 9),
    },
  },
  {
    list: "performer",
    label: "performer Disambiguation and Country",
    state: { disambiguation: "II", country: "US" },
    request: {
      disambiguation: { value: "II", modifier: "INCLUDES" },
      country: { value: "US", modifier: "INCLUDES" },
    },
  },
  {
    list: "performer",
    label: "performer Aliases contain",
    state: { aliases: "Mimi" },
    request: { aliases: { value: "Mimi", modifier: "INCLUDES" } },
  },
  {
    list: "performer",
    label: "performer Aliases Has none",
    state: { aliasesModifier: "IS_NULL" },
    request: { aliases: { modifier: "IS_NULL" } },
  },
  {
    list: "performer",
    label: "performer Links contain",
    state: { url: "example.com" },
    request: { url: { value: "example.com", modifier: "INCLUDES" } },
  },
  {
    list: "performer",
    label: "performer StashDB ID equals",
    state: { stashId: "abc-123" },
    request: { stash_id: { value: "abc-123", modifier: "EQUALS" } },
  },
  {
    list: "performer",
    label: "performer StashDB ID Has any",
    state: { stashIdModifier: "NOT_NULL" },
    request: { stash_id: { modifier: "NOT_NULL" } },
  },
  {
    list: "performer",
    label: "performer Circumcised",
    state: { circumcised: "CUT" },
    request: { circumcised: { value: ["CUT"] } },
  },
  {
    list: "performer",
    label: "performer Height not set",
    state: { heightModifier: "IS_NULL" },
    request: { height: { modifier: "IS_NULL" } },
  },
  {
    list: "performer",
    label: "performer Weight set",
    state: { weightModifier: "NOT_NULL" },
    request: { weight: { modifier: "NOT_NULL" } },
  },
  {
    list: "performer",
    label: "performer Penis Length not set",
    state: { penisLengthModifier: "IS_NULL" },
    request: { penis_length: { modifier: "IS_NULL" } },
  },

  // ── Studios ─────────────────────────────────────────────────────────────
  {
    list: "studio",
    label: "studio Parent studio with sub-studios",
    state: {
      parentIds: [A],
      parentIdsModifier: "INCLUDES",
      parentIdsDepth: -1,
    },
    request: { parents: { value: [A], modifier: "INCLUDES", depth: -1 } },
  },
  {
    list: "studio",
    label: "studio Parent studio Has none (a top-level studio)",
    state: { parentIdsModifier: "IS_NULL" },
    request: { parents: { modifier: "IS_NULL" } },
  },
  {
    list: "studio",
    label: "studio Tags with sub-tags",
    state: { tagIds: [A], tagIdsDepth: -1 },
    request: { tags: { value: [A], modifier: "INCLUDES_ALL", depth: -1 } },
  },
  {
    list: "studio",
    label: "studio Tags Has any",
    state: { tagIdsModifier: "NOT_NULL" },
    request: { tags: { modifier: "NOT_NULL" } },
  },
  {
    list: "studio",
    label: "studio counts",
    state: {
      childCount: { max: "0" },
      tagCount: { min: "1" },
      imageCount: { min: "2" },
      galleryCount: { min: "3" },
      performerCount: { min: "4" },
      groupCount: { min: "5" },
    },
    request: {
      child_count: { modifier: "BETWEEN", value2: 0 },
      tag_count: { modifier: "BETWEEN", value: 1 },
      image_count: { modifier: "BETWEEN", value: 2 },
      gallery_count: { modifier: "BETWEEN", value: 3 },
      performer_count: { modifier: "BETWEEN", value: 4 },
      group_count: { modifier: "BETWEEN", value: 5 },
    },
  },
  {
    list: "studio",
    label: "studio Aliases, Website and StashDB ID",
    state: { aliases: "Acme", url: "acme.test", stashId: "xyz" },
    request: {
      aliases: { value: "Acme", modifier: "INCLUDES" },
      url: { value: "acme.test", modifier: "INCLUDES" },
      stash_id: { value: "xyz", modifier: "EQUALS" },
    },
  },
  {
    list: "studio",
    label: "studio StashDB ID Has none",
    state: { stashIdModifier: "IS_NULL" },
    request: { stash_id: { modifier: "IS_NULL" } },
  },

  // ── Tags ────────────────────────────────────────────────────────────────
  {
    list: "tag",
    label: "tag Parent tags with sub-tags",
    state: { parentIds: [A], parentIdsDepth: -1 },
    request: { parents: { value: [A], modifier: "INCLUDES", depth: -1 } },
  },
  {
    list: "tag",
    label: "tag Child tags under Has NONE",
    state: { childIds: [A], childIdsModifier: "EXCLUDES" },
    request: { children: { value: [A], modifier: "EXCLUDES" } },
  },
  {
    list: "tag",
    label: "tag counts",
    state: {
      parentCount: { max: "0" },
      childCount: { min: "1" },
      imageCount: { min: "2" },
      galleryCount: { min: "3" },
      performerCount: { min: "4" },
      studioCount: { min: "5" },
      groupCount: { min: "6" },
      markerCount: { min: "7" },
    },
    request: {
      parent_count: { modifier: "BETWEEN", value2: 0 },
      child_count: { modifier: "BETWEEN", value: 1 },
      image_count: { modifier: "BETWEEN", value: 2 },
      gallery_count: { modifier: "BETWEEN", value: 3 },
      performer_count: { modifier: "BETWEEN", value: 4 },
      studio_count: { modifier: "BETWEEN", value: 5 },
      group_count: { modifier: "BETWEEN", value: 6 },
      marker_count: { modifier: "BETWEEN", value: 7 },
    },
  },
  {
    list: "tag",
    label: "tag Aliases and StashDB ID",
    state: { aliases: "Blond", stashId: "tag-1" },
    request: {
      aliases: { value: "Blond", modifier: "INCLUDES" },
      stash_id: { value: "tag-1", modifier: "EQUALS" },
    },
  },

  // ── Collections ─────────────────────────────────────────────────────────
  {
    list: "group",
    label: "collection Tags with sub-tags",
    state: { tagIds: [A], tagIdsModifier: "INCLUDES", tagIdsDepth: -1 },
    request: { tags: { value: [A], modifier: "INCLUDES", depth: -1 } },
  },
  {
    list: "group",
    label: "collection Tags Has none",
    state: { tagIdsModifier: "IS_NULL" },
    request: { tags: { modifier: "IS_NULL" } },
  },
  {
    list: "group",
    label: "collection Studio with sub-studios",
    state: { studioId: A, studioIdDepth: -1 },
    request: { studios: { value: [A], modifier: "INCLUDES", depth: -1 } },
  },
  {
    list: "group",
    label: "collection Studio Has NONE",
    state: { studioId: A, studioIdModifier: "EXCLUDES" },
    request: { studios: { value: [A], modifier: "EXCLUDES" } },
  },
  {
    list: "group",
    label: "collection Studio Has none",
    state: { studioIdModifier: "IS_NULL" },
    request: { studios: { modifier: "IS_NULL" } },
  },
  {
    list: "group",
    label: "collection Parent collection with sub-collections",
    state: { groupIds: [A], groupIdsDepth: -1 },
    request: {
      containing_groups: { value: [A], modifier: "INCLUDES", depth: -1 },
    },
  },
  {
    list: "group",
    label: "collection Sub-collections with every level above",
    state: { subGroupIds: [A], subGroupIdsDepth: -1 },
    request: { sub_groups: { value: [A], modifier: "INCLUDES", depth: -1 } },
  },
  {
    list: "group",
    label: "collection favourite performer Yes and No",
    state: { performerFavorite: "true" },
    request: { performer_favorite: true },
  },
  {
    list: "group",
    label: "collection favourite performer No",
    state: { performerFavorite: "false" },
    request: { performer_favorite: false },
  },
  {
    list: "group",
    label: "collection counts, O count and plays",
    state: {
      subGroupCount: { min: "1" },
      containingGroupCount: { max: "0" },
      tagCount: { min: "2" },
      oCounter: { min: "3" },
      playCount: { min: "4" },
    },
    request: {
      sub_group_count: { modifier: "BETWEEN", value: 1 },
      containing_group_count: { modifier: "BETWEEN", value2: 0 },
      tag_count: { modifier: "BETWEEN", value: 2 },
      o_counter: { modifier: "BETWEEN", value: 3 },
      play_count: { modifier: "BETWEEN", value: 4 },
    },
  },
  {
    list: "group",
    label: "collection Aliases and Links",
    state: { aliases: "Vol", url: "vol.test" },
    request: {
      aliases: { value: "Vol", modifier: "INCLUDES" },
      url: { value: "vol.test", modifier: "INCLUDES" },
    },
  },
];

const SHOWN = {
  perPage: 24,
  viewMode: "grid",
  zoomLevel: "medium",
  gridDensity: "medium",
} as const;

/** The state through the URL and back, as the list page reads it */
const throughUrl = (list: ListKind, state: State): State => {
  const options = filterOptionsOf(list);
  const written = writeListParams(
    new URLSearchParams(),
    { filters: state, page: 1 },
    { entity: list, filterOptions: options, shown: SHOWN }
  );
  return readListParams(written, list, options).filters as State;
};

describe("the metadata rows of the performer, studio, tag and collection panels", () => {
  it.each(CASES)("$label builds its request", ({ list, state, request }) => {
    expect(buildPanelFilter(list, state)).toEqual(request);
  });

  it.each(CASES)(
    "$label survives the URL and builds the same request",
    ({ list, state, request }) => {
      const read = throughUrl(list, state);

      expect(buildPanelFilter(list, read)).toEqual(request);
      expect(activeFieldCount(list, read)).toBe(activeFieldCount(list, state));
    }
  );

  it.each(CASES)("$label draws a chip", ({ list, state }) => {
    expect(activeFieldCount(list, state)).toBeGreaterThan(0);
  });

  it("a row for each of the keys the cases name exists on its list", () => {
    const missing = CASES.flatMap(({ list, state }) => {
      const rows: readonly PanelField[] = PANEL_FIELDS[list];
      const known = new Set(
        rows.flatMap((row) => [
          row.key,
          row.modifierKey,
          row.hierarchyKey,
          row.editor === "ref" ? row.excludeKey : undefined,
        ])
      );
      return Object.keys(state)
        .filter((key) => !known.has(key))
        .map((key) => `${list}.${key}`);
    });

    expect(missing).toEqual([]);
  });

  it("a three-state favourite writes a boolean key and Any sends nothing", () => {
    for (const [list, key] of [
      ["performer", "tagFavorite"],
      ["group", "performerFavorite"],
    ] as const) {
      const options = filterOptionsOf(list);
      const written = writeListParams(
        new URLSearchParams(),
        { filters: { [key]: "false" }, page: 1 },
        { entity: list, filterOptions: options, shown: SHOWN }
      );

      expect(written.get(key)).toBe("false");
      expect(buildPanelFilter(list, { [key]: "any" })).toEqual({});
      expect(buildPanelFilter(list, {})).toEqual({});
    }
  });

  it("the Gender preset a beta.7 user saved reads as one value, as a string and as a one-element list", () => {
    // The server's INCLUDES of one value is beta.7's EQUALS
    const request = { gender: { value: ["FEMALE"], modifier: "INCLUDES" } };

    expect(buildPanelFilter("performer", { gender: "FEMALE" })).toEqual(
      request
    );
    expect(buildPanelFilter("performer", { gender: ["FEMALE"] })).toEqual(
      request
    );
    // A default preset becomes list state without the URL reader
    expect(normalizePanelState("performer", { gender: "FEMALE" })).toEqual({
      gender: ["FEMALE"],
    });
    expect(throughUrl("performer", { gender: "FEMALE" })).toEqual({
      gender: ["FEMALE"],
    });
    const chips = chipsOf("performer", { gender: "FEMALE" });
    expect(chips).toHaveLength(1);
    expect(chips[0]?.parts).toMatchObject({
      label: "Gender",
      values: ["Female"],
    });
  });

  it("several genders read as their labels under the condition, and Has none alone", () => {
    expect(
      chipsOf("performer", {
        gender: ["MALE", "NON_BINARY"],
        genderModifier: "EXCLUDES",
      }).map((chip) => chip.parts)
    ).toEqual([
      { label: "Gender", condition: "none of", values: ["Male", "Non-Binary"] },
    ]);
    expect(
      chipsOf("performer", { genderModifier: "IS_NULL" }).map(
        (chip) => chip.parts
      )
    ).toEqual([{ label: "Gender", values: ["has none"] }]);
  });

  it("single-value fields stored before 9a read as one value", () => {
    // The collection Studio and the tag Studio keep their single value
    expect(buildPanelFilter("group", { studioId: A })).toEqual({
      studios: { value: [A], modifier: "INCLUDES" },
    });
    expect(buildPanelFilter("tag", { studioId: A })).toEqual({
      studios: { value: [A], modifier: "INCLUDES" },
    });
    // A stored Has NONE on the old studio and tag pickers still means none
    expect(
      buildPanelFilter("studio", { tagIds: ["1"], tagIdsModifier: "EXCLUDES" })
    ).toEqual({ tags: { value: ["1"], modifier: "EXCLUDES" } });
  });

  it("the new pickers sit after the existing ones: a card count still opens the page the same way", () => {
    const tag = { id: "5", instanceId: "inst-a" };

    expect(getFilteredListPath("/performers", "tags", tag, true)).toBe(
      "/performers?tagId=5&instance=inst-a"
    );
    expect(getFilteredListPath("/studios", "tags", tag, true)).toBe(
      "/studios?tagId=5&instance=inst-a"
    );
    expect(getFilteredListPath("/tags", "performers", tag, true)).toBe(
      "/tags?performerId=5&instance=inst-a"
    );
    expect(getFilteredListPath("/tags", "studios", tag, true)).toBe(
      "/tags?studioId=5&instance=inst-a"
    );
    expect(getFilteredListPath("/tags", "groups", tag, true)).toBe(
      "/tags?groupId=5&instance=inst-a"
    );
    expect(getFilteredListPath("/collections", "groups", tag, true)).toBe(
      "/collections?groupId=5&instance=inst-a"
    );
    expect(getFilteredListPath("/collections", "studios", tag, true)).toBe(
      "/collections?studioId=5&instance=inst-a"
    );
    expect(getFilteredListPath("/collections", "tags", tag, true)).toBe(
      "/collections?tagId=5&instance=inst-a"
    );
    expect(getFilteredListPath("/collections", "performers", tag, true)).toBe(
      "/collections?performerId=5&instance=inst-a"
    );
  });

  it("a ref row that offers Has none or Has any names it in the condition select", () => {
    const labelsOf = (list: ListKind, key: string) =>
      filterOptionsOf(list)
        .find((option) => option.key === key)
        ?.modifierOptions?.map((modifier) => modifier.label);

    expect(labelsOf("performer", "tagIds")).toEqual([
      "Has ALL of these",
      "Has ANY of these",
      "Has NONE of these",
      "Has none",
      "Has any",
    ]);
    expect(labelsOf("studio", "parentIds")).toContain("Has none");
    expect(labelsOf("group", "studioId")).toEqual([
      "Has ANY of these",
      "Has NONE of these",
      "Has none",
      "Has any",
    ]);
  });

  it("each hierarchy row names what its depth includes", () => {
    const labelOf = (list: ListKind, key: string) =>
      filterOptionsOf(list).find((option) => option.key === key)
        ?.hierarchyLabel;

    expect(labelOf("performer", "studioIds")).toBe("Include sub-studios");
    expect(labelOf("studio", "parentIds")).toBe("Include sub-studios");
    expect(labelOf("tag", "parentIds")).toBe("Include sub-tags");
    expect(labelOf("group", "tagIds")).toBe("Include sub-tags");
    expect(labelOf("group", "studioId")).toBe("Include sub-studios");
    expect(labelOf("group", "groupIds")).toBe("Include sub-collections");
  });
});
