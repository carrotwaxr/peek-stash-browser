/**
 * The image and gallery panels' rows beyond the first panel: the text, path,
 * URL and organized filters, resolution and orientation, the performer
 * filters (tags, favourites, count, age), the three date ranges, and "Has
 * none / Has any" on the ref pickers. Each row builds its request, goes
 * through the URL and back, and reads on its chip; the Images "To Review"
 * preset keeps sending what it sent in beta.7.
 */
import {
  FIELDS,
  type ListKind,
  PANEL_FIELDS,
  type PanelField,
} from "@peek/shared-types";
import { describe, expect, it } from "vitest";
import {
  GALLERY_FILTER_OPTIONS,
  IMAGE_FILTER_OPTIONS,
  buildGalleryFilter,
  buildImageFilter,
} from "@/utils/filterConfig";
import {
  chipsOf,
  filterOptionsOf,
  normalizePanelState,
  readPanelFilter,
} from "@/utils/filterFields";
import { buildSearchParams, parseSearchParams } from "@/utils/urlParams";

type State = Record<string, unknown>;

const LISTS = {
  image: { options: IMAGE_FILTER_OPTIONS, build: buildImageFilter },
  gallery: { options: GALLERY_FILTER_OPTIONS, build: buildGalleryFilter },
} as const;

/** The state's URL, read back as the list page reads it */
function throughUrl(list: "image" | "gallery", filters: State): State {
  const { options } = LISTS[list];
  const params = buildSearchParams({
    searchText: "",
    sortField: "",
    sortDirection: "",
    currentPage: 1,
    perPage: 24,
    filters,
    filterOptions: options,
    viewMode: "grid",
    zoomLevel: "medium",
    gridDensity: "medium",
    timelinePeriod: null,
  });
  return parseSearchParams(new URLSearchParams(params.toString()), options)
    .filters;
}

const rowOf = (kind: ListKind, key: string): PanelField | undefined =>
  PANEL_FIELDS[kind].find((row) => row.key === key);

/** Rows both lists gain: key, contract field, editor */
const SHARED_ROWS = [
  ["details", "details", "text"],
  ["code", "code", "text"],
  ["photographer", "photographer", "text"],
  ["path", "path", "text"],
  ["url", "url", "text"],
  ["organized", "organized", "choice"],
  ["date", "date", "date"],
  ["createdAt", "created_at", "date"],
  ["updatedAt", "updated_at", "date"],
  ["performerTagIds", "performer_tags", "ref"],
  ["performerFavorite", "performer_favorite", "choice"],
  ["studioFavorite", "studio_favorite", "choice"],
  ["tagFavorite", "tag_favorite", "choice"],
  ["performerCount", "performer_count", "number"],
  ["performerAge", "performer_age", "number"],
] as const;

const EXTRA_ROWS = {
  image: [
    ["title", "title", "text"],
    ["resolution", "resolution", "enum"],
    ["orientation", "orientation", "enum"],
  ],
  gallery: [["isZip", "is_zip", "choice"]],
} as const;

describe.each(["image", "gallery"] as const)("the %s panel's rows", (list) => {
  const { build, options } = LISTS[list];

  it("offers each new field", () => {
    for (const [key, field, editor] of [...SHARED_ROWS, ...EXTRA_ROWS[list]]) {
      expect(rowOf(list, key), `${list}.${key}`).toMatchObject({
        field,
        editor,
      });
      expect(
        options.some((option) => option.key === key),
        `${list}.${key} option`
      ).toBe(true);
    }
  });

  it("offers a date range for date, created and updated, which send S6's range", () => {
    expect(
      build({
        date: { start: "2020-01-01", end: "2024-12-31" },
        createdAt: { start: "2021-02-03" },
        updatedAt: { end: "2022-04-05" },
      })
    ).toEqual({
      date: { modifier: "BETWEEN", value: "2020-01-01", value2: "2024-12-31" },
      created_at: { modifier: "BETWEEN", value: "2021-02-03" },
      updated_at: { modifier: "BETWEEN", value2: "2022-04-05" },
    });
    const state = {
      date: { start: "2020-01-01", end: "2024-12-31" },
      createdAt: { start: "2021-02-03" },
    };
    expect(throughUrl(list, state)).toEqual(state);
  });

  it("sends Has none and Has any on every ref picker that takes them, with no ids", () => {
    expect(
      build({
        performerIdsModifier: "IS_NULL",
        studioIdsModifier: "NOT_NULL",
        tagIdsModifier: "IS_NULL",
      })
    ).toEqual({
      performers: { modifier: "IS_NULL" },
      studios: { modifier: "NOT_NULL" },
      tags: { modifier: "IS_NULL" },
    });
    expect(throughUrl(list, { performerIdsModifier: "IS_NULL" })).toEqual({
      performerIdsModifier: "IS_NULL",
    });
    const labels = (key: string) =>
      options
        .find((option) => option.key === key)
        ?.modifierOptions?.map((choice) => choice.label);
    expect(labels("performerIds")).toEqual([
      "Has ALL of these",
      "Has ANY of these",
      "Has NONE of these",
      "Has none",
      "Has any",
    ]);
    expect(labels("studioIds")).toEqual([
      "Has ANY of these",
      "Has NONE of these",
      "Has none",
      "Has any",
    ]);
  });

  it("filters by the performers' tags, with sub-tags and exclusions", () => {
    const state = {
      performerTagIds: ["3:a", "4:a"],
      performerTagIdsModifier: "INCLUDES",
      performerTagIdsDepth: -1,
      performerTagIdsExclude: ["9:a"],
    };
    expect(build(state)).toEqual({
      performer_tags: {
        value: ["3:a", "4:a"],
        excludes: ["9:a"],
        modifier: "INCLUDES",
        depth: -1,
      },
    });
    expect(throughUrl(list, state)).toEqual(state);
  });

  it("filters by the performers' count and age", () => {
    expect(
      build({
        performerCount: { min: "1", max: "3" },
        performerAge: { min: "25" },
      })
    ).toEqual({
      performer_count: { modifier: "BETWEEN", value: 1, value2: 3 },
      performer_age: { modifier: "BETWEEN", value: 25 },
    });
    const state = { performerCount: { min: "1", max: "3" } };
    expect(throughUrl(list, state)).toEqual(state);
  });

  it("filters by text: Details, Code, Photographer and URL contain, Path offers Starts with", () => {
    expect(
      build({
        details: "a_b",
        code: "X1",
        photographer: "Ann",
        url: "example.com",
      })
    ).toEqual({
      details: { value: "a_b", modifier: "INCLUDES" },
      code: { value: "X1", modifier: "INCLUDES" },
      photographer: { value: "Ann", modifier: "INCLUDES" },
      url: { value: "example.com", modifier: "INCLUDES" },
    });
    expect(build({ path: "/media/a", pathModifier: "STARTS_WITH" })).toEqual({
      path: { value: "/media/a", modifier: "STARTS_WITH" },
    });
    expect(build({ path: "/media/a" })).toEqual({
      path: { value: "/media/a", modifier: "INCLUDES" },
    });
    const state = { path: "/media/a", pathModifier: "STARTS_WITH" };
    expect(throughUrl(list, state)).toEqual(state);
    expect(
      options
        .find((option) => option.key === "path")
        ?.modifierOptions?.map((choice) => choice.value)
    ).toEqual(["INCLUDES", "EXCLUDES", "EQUALS", "NOT_EQUALS", "STARTS_WITH"]);
  });

  it("Organized and the three favourites are Yes, No or Any: No sends false, Any sends nothing", () => {
    for (const [key, field] of [
      ["organized", "organized"],
      ["performerFavorite", "performer_favorite"],
      ["studioFavorite", "studio_favorite"],
      ["tagFavorite", "tag_favorite"],
    ] as const) {
      expect(build({ [key]: "true" }), key).toEqual({ [field]: true });
      expect(build({ [key]: "false" }), key).toEqual({ [field]: false });
      expect(build({ [key]: "any" }), key).toEqual({});
      expect(build({}), key).toEqual({});
      // The URL keeps each value; Any filters nothing wherever it sits
      expect(throughUrl(list, { [key]: "false" }), key).toEqual({
        [key]: "false",
      });
      expect(throughUrl(list, { [key]: "true" }), key).toEqual({
        [key]: "true",
      });
      expect(build(throughUrl(list, { [key]: "any" })), key).toEqual({});
      // A preset or old link holding the boolean
      expect(build({ [key]: true }), key).toEqual({ [field]: true });
    }
  });

  it("reads a stored criterion back into each new row", () => {
    expect(
      readPanelFilter(list, {
        performer_favorite: false,
        organized: true,
        path: { value: "/a", modifier: "STARTS_WITH" },
        performers: { modifier: "NOT_NULL" },
      })
    ).toEqual({
      state: {
        performerFavorite: "false",
        organized: "true",
        path: "/a",
        pathModifier: "STARTS_WITH",
        performerIdsModifier: "NOT_NULL",
      },
      kept: {},
    });
  });

  it("chips name each new filter", () => {
    expect(
      chipsOf(list, { performerFavorite: "false" }).map((chip) => chip.parts)
    ).toEqual([{ label: "Favorite Performers", values: ["No"] }]);
    expect(chipsOf(list, { organized: "any" })).toEqual([]);
    expect(
      chipsOf(list, { performerIdsModifier: "IS_NULL" }).map(
        (chip) => chip.parts.values
      )
    ).toEqual([["has none"]]);
  });

  it("every new row fills a field the contract takes", () => {
    const specs = FIELDS[list] as Record<string, unknown>;
    for (const [, field] of [...SHARED_ROWS, ...EXTRA_ROWS[list]]) {
      expect(specs[field], `${list}.${field}`).toBeDefined();
    }
    expect(filterOptionsOf(list).length).toBeGreaterThan(0);
  });
});

describe("the image panel", () => {
  it("resolution compares the shorter side, as the scene's does, and orientation takes several values", () => {
    expect(
      buildImageFilter({
        resolution: "FULL_HD",
        resolutionModifier: "GREATER_THAN",
      })
    ).toEqual({ resolution: { value: "FULL_HD", modifier: "GREATER_THAN" } });
    expect(buildImageFilter({ resolution: "FULL_HD" })).toEqual({
      resolution: { value: "FULL_HD", modifier: "EQUALS" },
    });
    expect(buildImageFilter({ orientation: "PORTRAIT" })).toEqual({
      orientation: { value: ["PORTRAIT"] },
    });
    expect(buildImageFilter({ orientation: ["PORTRAIT", "SQUARE"] })).toEqual({
      orientation: { value: ["PORTRAIT", "SQUARE"] },
    });
    const state = {
      resolution: "FOUR_K",
      resolutionModifier: "LESS_THAN",
      orientation: ["LANDSCAPE", "SQUARE"],
    };
    expect(throughUrl("image", state)).toEqual(state);
    // One orientation stored while the row took one value reads as a list
    expect(throughUrl("image", { orientation: "SQUARE" })).toEqual({
      orientation: ["SQUARE"],
    });
    expect(normalizePanelState("image", { orientation: "SQUARE" })).toEqual({
      orientation: ["SQUARE"],
    });
    expect(
      filterOptionsOf("image").find((option) => option.key === "orientation")
    ).toMatchObject({ multi: true, defaultValue: [] });
    expect(
      chipsOf("image", {
        resolution: "FOUR_K",
        resolutionModifier: "LESS_THAN",
      }).length
    ).toBe(1);
  });

  it("Title Search matches a name", () => {
    expect(buildImageFilter({ title: "sunset" })).toEqual({
      title: { value: "sunset", modifier: "INCLUDES" },
    });
  });

  it("the To Review preset sends what it sent in beta.7", () => {
    expect(
      buildImageFilter({
        studioIds: ["772", "971"],
        studioIdsModifier: "EXCLUDES",
        tagIds: ["30"],
        tagIdsModifier: "EXCLUDES",
      })
    ).toEqual({
      studios: { value: ["772", "971"], modifier: "EXCLUDES" },
      tags: { value: ["30"], modifier: "EXCLUDES" },
    });
  });
});

describe("the gallery panel", () => {
  it("Zip or Folder sends is_zip", () => {
    expect(buildGalleryFilter({ isZip: "true" })).toEqual({ is_zip: true });
    expect(buildGalleryFilter({ isZip: "false" })).toEqual({ is_zip: false });
    expect(buildGalleryFilter({ isZip: "any" })).toEqual({});
  });

  it("keeps the two favourite toggles it had", () => {
    expect(
      buildGalleryFilter({ favorite: true, hasFavoriteImage: true })
    ).toEqual({ favorite: true, hasFavoriteImage: true });
  });
});
