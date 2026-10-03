/**
 * The Scenes panel's rows F18 adds: playlists, galleries, path, URL, code,
 * captions, organized, markers, duplicates, watch state, performer tags,
 * three-state favourites, a multi-value Studio and Orientation, and "Has
 * none" and "Has any" on the pickers. Each round-trips state to request and
 * to the URL and back; the shapes stored before 9a keep their meaning.
 */
import { PANEL_FIELDS, type PanelField } from "@peek/shared-types";
import { describe, expect, it } from "vitest";
import { getFilteredListPath } from "@/utils/entityLinks";
import {
  CAROUSEL_FILTER_DEFINITIONS,
  SCENE_FILTER_OPTIONS,
  buildSceneFilter,
  carouselRulesToFilterState,
} from "@/utils/filterConfig";
import {
  chipsOf,
  codecOf,
  filterOptionsOf,
  normalizePanelState,
} from "@/utils/filterFields";
import { readListParams, writeListParams } from "@/utils/urlParams";

type State = Record<string, unknown>;

const SCENE_ROWS: readonly PanelField[] = PANEL_FIELDS.scene;
const rowOf = (key: string) => SCENE_ROWS.find((row) => row.key === key);

/** A state through the Scenes list's URL: written, then read back */
function throughUrl(state: State) {
  const params = writeListParams(
    new URLSearchParams(),
    { filters: state },
    {
      entity: "scene",
      filterOptions: SCENE_FILTER_OPTIONS,
      shown: {
        perPage: 24,
        viewMode: "grid",
        zoomLevel: "medium",
        gridDensity: "medium",
      },
    }
  );
  params.delete("filters");
  return {
    query: decodeURIComponent(params.toString()),
    read: readUrl(params.toString()),
  };
}

/** What the Scenes list reads from a query string */
const readUrl = (query: string) =>
  readListParams(new URLSearchParams(query), "scene", SCENE_FILTER_OPTIONS)
    .filters;

/** Each new row: a panel state, the request it builds, the URL it writes */
const CASES: readonly {
  name: string;
  state: State;
  request: Record<string, unknown>;
  query: string;
}[] = [
  {
    name: "Playlists",
    state: { playlistIds: ["12", "7"], playlistIdsModifier: "INCLUDES_ALL" },
    request: { playlists: { value: [12, 7], modifier: "INCLUDES_ALL" } },
    query: "playlistIds=12,7&playlistIdsModifier=INCLUDES_ALL",
  },
  {
    name: "In any of my playlists: in",
    state: { inAnyPlaylist: "true" },
    request: { in_any_playlist: true },
    query: "inAnyPlaylist=true",
  },
  {
    name: "In any of my playlists: not in",
    state: { inAnyPlaylist: "false" },
    request: { in_any_playlist: false },
    query: "inAnyPlaylist=false",
  },
  {
    name: "Galleries",
    state: { galleryIds: ["3:a", "4:a"], galleryIdsModifier: "INCLUDES_ALL" },
    request: {
      galleries: { value: ["3:a", "4:a"], modifier: "INCLUDES_ALL" },
    },
    query: "galleryIds=3:a,4:a&galleryIdsModifier=INCLUDES_ALL",
  },
  {
    name: "Organized: yes",
    state: { organized: "true" },
    request: { organized: true },
    query: "organized=true",
  },
  {
    name: "Organized: no",
    state: { organized: "false" },
    request: { organized: false },
    query: "organized=false",
  },
  {
    name: "Path: Starts with",
    state: { path: "/media/new", pathModifier: "STARTS_WITH" },
    request: { path: { value: "/media/new", modifier: "STARTS_WITH" } },
    query: "path=/media/new&pathModifier=STARTS_WITH",
  },
  {
    name: "URL",
    state: { url: "example.com" },
    request: { url: { value: "example.com", modifier: "INCLUDES" } },
    query: "url=example.com",
  },
  {
    name: "Code",
    state: { code: "ABC-123" },
    request: { code: { value: "ABC-123", modifier: "INCLUDES" } },
    query: "code=ABC-123",
  },
  {
    name: "Captions: a language",
    state: { captions: "en" },
    request: { captions: { value: "en", modifier: "EQUALS" } },
    query: "captions=en",
  },
  {
    name: "Captions: not a language",
    state: { captions: "en", captionsModifier: "NOT_EQUALS" },
    request: { captions: { value: "en", modifier: "NOT_EQUALS" } },
    query: "captions=en&captionsModifier=NOT_EQUALS",
  },
  {
    name: "Captions: has none",
    state: { captionsModifier: "IS_NULL" },
    request: { captions: { modifier: "IS_NULL" } },
    query: "captionsModifier=IS_NULL",
  },
  {
    name: "Has markers",
    state: { hasMarkers: "true" },
    request: { has_markers: true },
    query: "hasMarkers=true",
  },
  {
    name: "Duplicated: no",
    state: { duplicated: "false" },
    request: { duplicated: false },
    query: "duplicated=false",
  },
  {
    name: "Watched",
    state: { watched: "true" },
    request: { watched: true },
    query: "watched=true",
  },
  {
    name: "In progress: no",
    state: { inProgress: "false" },
    request: { in_progress: false },
    query: "inProgress=false",
  },
  {
    name: "Performer tags with sub-tags and an exclusion",
    state: {
      performerTagIds: ["5:a"],
      performerTagIdsExclude: ["6:a"],
      performerTagIdsDepth: -1,
    },
    request: {
      performer_tags: {
        value: ["5:a"],
        excludes: ["6:a"],
        modifier: "INCLUDES",
        depth: -1,
      },
    },
    query:
      "performerTagIds=5:a&performerTagIdsExclude=6:a&performerTagIdsDepth=-1",
  },
  {
    name: "Favorite Performers: no",
    state: { performerFavorite: "false" },
    request: { performer_favorite: false },
    query: "performerFavorite=false",
  },
  {
    name: "Favorite Studios: yes",
    state: { studioFavorite: "true" },
    request: { studio_favorite: true },
    query: "studioFavorite=true",
  },
  {
    name: "Favorite Tags: no",
    state: { tagFavorite: "false" },
    request: { tag_favorite: false },
    query: "tagFavorite=false",
  },
  {
    name: "Favorite Scenes: no",
    state: { favorite: "false" },
    request: { favorite: false },
    query: "favorite=false",
  },
  {
    name: "Studios: several, Has NONE",
    state: { studioId: ["5:a", "6:a"], studioIdModifier: "EXCLUDES" },
    request: {
      studios: { value: ["5:a", "6:a"], modifier: "EXCLUDES" },
    },
    query: "studioId=5:a,6:a&studioIdModifier=EXCLUDES",
  },
  {
    name: "Studios: one include, one exclude, with sub-studios",
    state: {
      studioId: ["5:a"],
      studioIdExclude: ["6:a"],
      studioIdDepth: -1,
    },
    request: {
      studios: {
        value: ["5:a"],
        excludes: ["6:a"],
        modifier: "INCLUDES",
        depth: -1,
      },
    },
    query: "studioId=5:a&studioIdExclude=6:a&studioIdDepth=-1",
  },
  {
    name: "Orientation: several",
    state: { orientation: ["LANDSCAPE", "PORTRAIT"] },
    request: { orientation: { value: ["LANDSCAPE", "PORTRAIT"] } },
    query: "orientation=LANDSCAPE,PORTRAIT",
  },
  {
    name: "Collections with sub-collections",
    state: { groupIds: ["9:a"], groupIdsDepth: -1 },
    request: { groups: { value: ["9:a"], modifier: "INCLUDES", depth: -1 } },
    query: "groupIds=9:a&groupIdsDepth=-1",
  },
];

/** The pickers that offer Has none and Has any: row key, modifier key, field */
const PRESENCE_ROWS = [
  ["performerIds", "performerIdsModifier", "performers"],
  ["tagIds", "tagIdsModifier", "tags"],
  ["studioId", "studioIdModifier", "studios"],
  ["groupIds", "groupIdsModifier", "groups"],
  ["galleryIds", "galleryIdsModifier", "galleries"],
] as const;

describe("the scene rows F18 adds", () => {
  it.each(CASES)("$name: state to request", ({ state, request }) => {
    expect(buildSceneFilter(state)).toEqual(request);
  });

  it.each(CASES)("$name: state to URL and back", ({ state, query }) => {
    const { query: written, read } = throughUrl(state);

    expect(written).toBe(query);
    expect(read).toEqual(state);
  });

  it.each(CASES)("$name: shows one chip", ({ state }) => {
    expect(chipsOf("scene", state)).toHaveLength(1);
  });

  it.each(PRESENCE_ROWS)(
    "%s offers Has none and Has any, sent with no ids",
    (key, modifierKey, field) => {
      const option = SCENE_FILTER_OPTIONS.find((each) => each.key === key);
      expect(option?.modifierOptions?.map((each) => each.value)).toEqual(
        expect.arrayContaining(["IS_NULL", "NOT_NULL"])
      );

      expect(buildSceneFilter({ [modifierKey]: "IS_NULL" })).toEqual({
        [field]: { modifier: "IS_NULL" },
      });
      expect(
        buildSceneFilter({ [key]: ["1:a"], [modifierKey]: "NOT_NULL" })
      ).toEqual({ [field]: { modifier: "NOT_NULL" } });
      expect(throughUrl({ [modifierKey]: "IS_NULL" })).toEqual({
        query: `${modifierKey}=IS_NULL`,
        read: { [modifierKey]: "IS_NULL" },
      });
    }
  );

  it("a three-state favourite offers Yes, No and Any, and Any sends nothing", () => {
    const option = SCENE_FILTER_OPTIONS.find((each) => each.key === "favorite");

    expect(option).toMatchObject({ type: "select", defaultValue: "any" });
    expect(option?.options?.map((each) => each.value)).toEqual([
      "true",
      "false",
      "any",
    ]);
    expect(buildSceneFilter({ favorite: "any" })).toEqual({});
    expect(buildSceneFilter({})).toEqual({});
    // Any is not written to the URL (the keys stay booleans)
    expect(throughUrl({ favorite: "any" }).query).toBe("");
    expect(chipsOf("scene", { favorite: "any" })).toEqual([]);
  });

  it("favourite No sends false", () => {
    expect(buildSceneFilter({ favorite: "false" })).toEqual({
      favorite: false,
    });
    expect(chipsOf("scene", { favorite: "false" })[0]?.parts).toEqual({
      label: "Favorite Scenes",
      values: ["No"],
    });
  });

  it("the new rows sit where the plan puts them", () => {
    const keys = filterOptionsOf("scene").map((option) => option.key);

    // Performer tags follow the Tags picker, so a tag count link still finds Tags first
    expect(keys.indexOf("performerTagIds")).toBe(keys.indexOf("tagIds") + 1);
    for (const key of CASES.flatMap(({ state }) => Object.keys(state))) {
      if (rowOf(key) !== undefined) expect(keys).toContain(key);
    }
  });

  it("In any of my playlists says your own playlists", () => {
    const option = SCENE_FILTER_OPTIONS.find(
      (each) => each.key === "inAnyPlaylist"
    );

    expect(option?.label).toBe("In any of my playlists");
    expect(option?.options?.map((each) => each.label).join(" ")).toMatch(
      /your own playlists/
    );
  });

  it("Captions offers the languages Stash uses and Has none", () => {
    const option = SCENE_FILTER_OPTIONS.find((each) => each.key === "captions");

    expect(option?.options?.map((each) => each.value)).toEqual(
      expect.arrayContaining(["en", "de", "fr", "ja"])
    );
    expect(option?.modifierOptions?.map((each) => each.label)).toEqual([
      "Equals",
      "Not Equals",
      "Has none",
      "Has any",
    ]);
  });

  it("Path offers Contains, Excludes, Equals and Starts with", () => {
    const option = SCENE_FILTER_OPTIONS.find((each) => each.key === "path");

    expect(option?.modifierOptions?.map((each) => each.label)).toEqual([
      "Contains",
      "Excludes",
      "Equals",
      "Starts with",
    ]);
  });

  it("Studios is multi with Has NONE, and the key stays studioId", () => {
    const option = SCENE_FILTER_OPTIONS.find((each) => each.key === "studioId");

    expect(option).toMatchObject({
      multi: true,
      excludeKey: "studioIdExclude",
      hierarchyKey: "studioIdDepth",
    });
    expect(option?.modifierOptions?.map((each) => each.value)).toEqual([
      "INCLUDES",
      "EXCLUDES",
      "IS_NULL",
      "NOT_NULL",
    ]);
  });

  it("the carousel builder offers every new row", () => {
    const offered = CAROUSEL_FILTER_DEFINITIONS.map((each) => each.key);

    expect(offered).toEqual(
      expect.arrayContaining([
        "playlistIds",
        "inAnyPlaylist",
        "galleryIds",
        "organized",
        "path",
        "url",
        "code",
        "captions",
        "hasMarkers",
        "duplicated",
        "watched",
        "inProgress",
        "performerTagIds",
      ])
    );
  });
});

describe("shapes stored before 9a keep their meaning", () => {
  it("a preset saved with `favorite: true` reads the same", () => {
    const stored = { favorite: true };

    expect(normalizePanelState("scene", stored)).toEqual({ favorite: "true" });
    expect(buildSceneFilter(stored)).toEqual({ favorite: true });
    expect(chipsOf("scene", stored)).toHaveLength(1);
    expect(throughUrl(stored).query).toBe("favorite=true");
  });

  it("an unchecked box saved as `favorite: false` still means no filter", () => {
    expect(buildSceneFilter({ favorite: false })).toEqual({});
    expect(chipsOf("scene", { favorite: false })).toEqual([]);
    expect(normalizePanelState("scene", { favorite: false })).toEqual({});
  });

  it('`studioId: "5:a"` and `orientation: "LANDSCAPE"` each read as one value, in a preset, a default preset, a carousel rule and a URL', () => {
    const request = {
      studios: { value: ["5:a"], modifier: "INCLUDES" },
      orientation: { value: ["LANDSCAPE"] },
    };
    const stored = { studioId: "5:a", orientation: "LANDSCAPE" };

    // A preset, read as state (a default preset goes through normalize)
    expect(buildSceneFilter(stored)).toEqual(request);
    const normalized = normalizePanelState("scene", stored);
    expect(normalized).toEqual({
      studioId: ["5:a"],
      orientation: ["LANDSCAPE"],
    });
    expect(buildSceneFilter(normalized)).toEqual(request);
    expect(chipsOf("scene", normalized).map((chip) => chip.key)).toEqual([
      "studioId",
      "orientation",
    ]);
    // Loaded into the URL
    expect(throughUrl(stored).query).toBe("studioId=5:a&orientation=LANDSCAPE");
    expect(readUrl("studioId=5:a&orientation=LANDSCAPE")).toEqual(normalized);
    // A carousel rule
    const { state, kept } = carouselRulesToFilterState({
      studios: { value: ["5:a"], modifier: "INCLUDES" },
      orientation: { value: "LANDSCAPE" },
    });
    expect(state).toMatchObject({
      studioId: ["5:a"],
      orientation: ["LANDSCAPE"],
    });
    expect(kept).toEqual({});
  });

  it("`?studioId=1:a,2:b` reads two refs; `?studioId=5&instance=x` reads one", () => {
    const read = readUrl;

    expect(read("studioId=1:a,2:b")).toEqual({ studioId: ["1:a", "2:b"] });
    expect(read("studioId=5&instance=x")).toEqual({ studioId: ["5:x"] });
    expect(read("studioId=5:y&instance=x")).toEqual({ studioId: ["5:y"] });
    const studios = rowOf("studioId");
    expect(
      studios &&
        codecOf(studios).readUrl(
          studios,
          new URLSearchParams("studioId=5&instance=x")
        )
    ).toEqual({ studioId: ["5:x"] });
  });

  it("the gallery card's Scenes count links to the scenes of that gallery", () => {
    const gallery = { id: "7", instanceId: "inst-a" };

    const link = getFilteredListPath("/scenes", "galleries", gallery, true);

    expect(link).toBe("/scenes?galleryId=7&instance=inst-a");
    expect(getFilteredListPath("/scenes", "galleries", gallery, false)).toBe(
      "/scenes?galleryId=7"
    );
    const query = (link ?? "").split("?")[1] ?? "";
    const filters = readUrl(query);
    expect(filters).toEqual({ galleryIds: ["7:inst-a"] });
    expect(buildSceneFilter(filters)).toEqual({
      galleries: { value: ["7:inst-a"], modifier: "INCLUDES" },
    });
  });

  it("a Studio rule with Has NONE and two Orientation values read back as editable", () => {
    const stored = {
      studios: { value: ["3:a", "4:a"], modifier: "EXCLUDES" },
      orientation: { value: ["LANDSCAPE", "SQUARE"] },
    };

    const { state, kept } = carouselRulesToFilterState(stored);

    expect(kept).toEqual({});
    expect(buildSceneFilter(state)).toEqual(stored);
  });
});
