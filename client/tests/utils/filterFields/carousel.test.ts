/**
 * Custom carousels read the scene panel's table: the builder offers every
 * scene row, a stored rule reads back into panel state through each codec's
 * `fromCriterion`, and a rule no row can edit is kept as stored, so editing
 * a carousel never drops one.
 */
import {
  PANEL_FIELDS,
  type PanelField,
  SCENE_FIELDS,
} from "@peek/shared-types";
import { describe, expect, it } from "vitest";
import {
  CAROUSEL_FILTER_DEFINITIONS,
  buildSceneFilter,
  carouselRulesToFilterState,
} from "@/utils/filterConfig";
import { buildPanelFilter, readPanelFilter } from "@/utils/filterFields";
import { PATH_ROW, PLAYLISTS_ROW } from "../../helpers/editorRows";

const SCENE_ROWS: readonly PanelField[] = PANEL_FIELDS.scene;

/** A stored rule and the panel state it reads as, per scene row */
const ROUND_TRIPS: Record<
  string,
  { rules: Record<string, unknown>; state: Record<string, unknown> }
> = {
  title: {
    rules: { title: { value: "beach", modifier: "INCLUDES" } },
    state: { title: "beach" },
  },
  details: {
    rules: { details: { value: "sunset", modifier: "INCLUDES" } },
    state: { details: "sunset" },
  },
  performerIds: {
    rules: {
      performers: { value: ["1:inst-a", "2:inst-b"], modifier: "INCLUDES_ALL" },
    },
    state: {
      performerIds: ["1:inst-a", "2:inst-b"],
      performerIdsModifier: "INCLUDES_ALL",
    },
  },
  studioId: {
    rules: {
      studios: { value: ["7:inst-a"], modifier: "INCLUDES", depth: -1 },
    },
    state: { studioId: "7:inst-a", studioIdDepth: -1 },
  },
  tagIds: {
    rules: {
      tags: { value: ["3:inst-a"], modifier: "EXCLUDES", depth: -1 },
    },
    state: {
      tagIds: ["3:inst-a"],
      tagIdsModifier: "EXCLUDES",
      tagIdsDepth: -1,
    },
  },
  groupIds: {
    rules: { groups: { value: ["9:inst-a"], modifier: "EXCLUDES" } },
    state: { groupIds: ["9:inst-a"], groupIdsModifier: "EXCLUDES" },
  },
  rating: {
    rules: { rating100: { modifier: "BETWEEN", value: 60, value2: 90 } },
    state: { rating: { min: 60, max: 90 } },
  },
  oCount: {
    rules: { o_counter: { modifier: "BETWEEN", value: 3 } },
    state: { oCount: { min: 3 } },
  },
  duration: {
    rules: { duration: { modifier: "BETWEEN", value: 600, value2: 1800 } },
    state: { duration: { min: 10, max: 30 } },
  },
  favorite: { rules: { favorite: true }, state: { favorite: true } },
  performerFavorite: {
    rules: { performer_favorite: true },
    state: { performerFavorite: true },
  },
  studioFavorite: {
    rules: { studio_favorite: true },
    state: { studioFavorite: true },
  },
  tagFavorite: { rules: { tag_favorite: true }, state: { tagFavorite: true } },
  date: {
    rules: {
      date: { modifier: "BETWEEN", value: "2020-01-01", value2: "2020-12-31" },
    },
    state: { date: { start: "2020-01-01", end: "2020-12-31" } },
  },
  createdAt: {
    rules: { created_at: { modifier: "BETWEEN", value: "2024-01-01" } },
    state: { createdAt: { start: "2024-01-01" } },
  },
  updatedAt: {
    rules: { updated_at: { modifier: "BETWEEN", value2: "2025-06-30" } },
    state: { updatedAt: { end: "2025-06-30" } },
  },
  lastPlayedAt: {
    rules: {
      last_played_at: {
        modifier: "BETWEEN",
        value: "2024-01-01",
        value2: "2024-06-30",
      },
    },
    state: { lastPlayedAt: { start: "2024-01-01", end: "2024-06-30" } },
  },
  resolution: {
    rules: { resolution: { value: "FULL_HD", modifier: "GREATER_THAN" } },
    state: { resolution: "FULL_HD", resolutionModifier: "GREATER_THAN" },
  },
  bitrate: {
    rules: {
      bitrate: { modifier: "BETWEEN", value: 2_000_000, value2: 8_000_000 },
    },
    state: { bitrate: { min: 2, max: 8 } },
  },
  framerate: {
    rules: { framerate: { modifier: "BETWEEN", value2: 30 } },
    state: { framerate: { max: 30 } },
  },
  orientation: {
    rules: { orientation: { value: ["PORTRAIT"] } },
    state: { orientation: "PORTRAIT" },
  },
  videoCodec: {
    rules: { video_codec: { value: "hevc", modifier: "INCLUDES" } },
    state: { videoCodec: "hevc" },
  },
  audioCodec: {
    rules: { audio_codec: { value: "aac", modifier: "INCLUDES" } },
    state: { audioCodec: "aac" },
  },
  director: {
    rules: { director: { value: "Smith", modifier: "INCLUDES" } },
    state: { director: "Smith" },
  },
  playDuration: {
    rules: { play_duration: { modifier: "BETWEEN", value: 300 } },
    state: { playDuration: { min: 5 } },
  },
  playCount: {
    rules: { play_count: { modifier: "BETWEEN", value: 1, value2: 4 } },
    state: { playCount: { min: 1, max: 4 } },
  },
  performerCount: {
    rules: { performer_count: { modifier: "BETWEEN", value2: 2 } },
    state: { performerCount: { max: 2 } },
  },
  performerAge: {
    rules: { performer_age: { modifier: "BETWEEN", value: 20, value2: 30 } },
    state: { performerAge: { min: 20, max: 30 } },
  },
  tagCount: {
    rules: { tag_count: { modifier: "BETWEEN", value: 5 } },
    state: { tagCount: { min: 5 } },
  },
};

describe("carousel rules", () => {
  it("a Performer Age rule survives an edit", () => {
    const stored = {
      performer_age: { modifier: "BETWEEN", value: 20, value2: 30 },
    };

    const { state, kept } = carouselRulesToFilterState(stored);

    expect(state).toEqual({ performerAge: { min: 20, max: 30 } });
    expect(kept).toEqual({});
    expect(buildSceneFilter(state)).toEqual(stored);
  });

  it("every scene panel field round-trips through a stored rule", () => {
    // The table covers every row, the 7 the builder lacked included
    expect(Object.keys(ROUND_TRIPS).sort()).toEqual(
      SCENE_ROWS.map((row) => row.key).sort()
    );
    for (const [key, { rules, state }] of Object.entries(ROUND_TRIPS)) {
      const read = carouselRulesToFilterState(rules);
      expect(read, key).toEqual({ state, kept: {} });
      expect(buildSceneFilter(read.state), key).toEqual(rules);
    }
  });

  it("a bare id stays bare", () => {
    // Prod's carousel, stored before rules named their instance
    const stored = { tags: { value: ["284"], modifier: "INCLUDES_ALL" } };

    const { state, kept } = carouselRulesToFilterState(stored);

    expect(state).toEqual({ tagIds: ["284"], tagIdsModifier: "INCLUDES_ALL" });
    expect(kept).toEqual({});
    expect(buildSceneFilter(state)).toEqual(stored);
  });

  it("a rule with excludes reads back with its exclude companion and builds the same", () => {
    const stored = {
      tags: {
        value: ["1:a"],
        excludes: ["2:a", "3"],
        modifier: "INCLUDES_ALL",
        depth: -1,
      },
      performers: { value: [], excludes: ["9:a"], modifier: "INCLUDES" },
    };

    const { state, kept } = carouselRulesToFilterState(stored);

    expect(state).toEqual({
      tagIds: ["1:a"],
      tagIdsExclude: ["2:a", "3"],
      tagIdsModifier: "INCLUDES_ALL",
      tagIdsDepth: -1,
      performerIdsExclude: ["9:a"],
      performerIdsModifier: "INCLUDES",
    });
    expect(kept).toEqual({});
    expect(buildSceneFilter(state)).toEqual(stored);
  });

  it("the carousel offers the scene panel's fields and choices", () => {
    const offered = SCENE_ROWS.filter((row) => row.carousel !== false);

    expect(CAROUSEL_FILTER_DEFINITIONS.map((each) => each.key).sort()).toEqual(
      offered.map((row) => row.key).sort()
    );
    // Sorted by label, with no section headers
    const labels = CAROUSEL_FILTER_DEFINITIONS.map((each) => each.label ?? "");
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(
      CAROUSEL_FILTER_DEFINITIONS.some((each) => each.type === "section-header")
    ).toBe(false);

    const resolution = CAROUSEL_FILTER_DEFINITIONS.find(
      (each) => each.key === "resolution"
    );
    expect(resolution?.options).toHaveLength(14);
    expect(resolution?.defaultModifier).toBe("EQUALS");
  });

  it("keeps every rule no row can edit, as stored", () => {
    const stored = {
      organized: true,
      favorite: false,
      tags: { value: ["5"], modifier: "INCLUDES", depth: -1 },
      // No row edits a duration NOT_BETWEEN or a studio EXCLUDES yet
      duration: { modifier: "NOT_BETWEEN", value: 60, value2: 120 },
      studios: { value: ["3"], modifier: "EXCLUDES" },
      // Stash's VR resolution is no choice of the panel's
      resolution: { value: "VR_HD", modifier: "EQUALS" },
    };

    const { state, kept } = carouselRulesToFilterState(stored);

    expect(state).toEqual({
      tagIds: ["5"],
      tagIdsModifier: "INCLUDES",
      tagIdsDepth: -1,
    });
    expect(kept).toEqual({
      organized: true,
      favorite: false,
      duration: { modifier: "NOT_BETWEEN", value: 60, value2: 120 },
      studios: { value: ["3"], modifier: "EXCLUDES" },
      resolution: { value: "VR_HD", modifier: "EQUALS" },
    });
  });

  it("reads an old lone bound back and a lone id as a one-element list", () => {
    const { state, kept } = carouselRulesToFilterState({
      rating100: { value: 79, modifier: "GREATER_THAN" },
      bitrate: { value: 5_000_001, modifier: "LESS_THAN" },
      performers: { value: "12", modifier: "INCLUDES" },
    });

    expect(state).toEqual({
      rating: { min: 80 },
      bitrate: { max: 5 },
      performerIds: ["12"],
      performerIdsModifier: "INCLUDES",
    });
    expect(kept).toEqual({});
  });

  it("reads a one-sided BETWEEN back as a min or a max, decimals kept", () => {
    const { state, kept } = carouselRulesToFilterState({
      framerate: { modifier: "BETWEEN", value: 29.97 },
      o_counter: { modifier: "BETWEEN", value2: 9 },
      created_at: { modifier: "BETWEEN", value: "2024-05-15" },
      updated_at: { modifier: "BETWEEN", value2: "2024-05-20" },
    });

    expect(state).toEqual({
      framerate: { min: 29.97 },
      oCount: { max: 9 },
      createdAt: { start: "2024-05-15" },
      updatedAt: { end: "2024-05-20" },
    });
    expect(kept).toEqual({});
  });

  it("a decimal bound survives an edit", () => {
    const stored = { framerate: { modifier: "BETWEEN", value: 29.97 } };

    const { state } = carouselRulesToFilterState(stored);

    expect(buildSceneFilter(state)).toEqual(stored);
  });

  it("reads an old lone number bound back: GREATER_THAN 14 is a min of 15", () => {
    const { state, kept } = carouselRulesToFilterState({
      o_counter: { modifier: "GREATER_THAN", value: 14 },
      tag_count: { modifier: "LESS_THAN", value: 9 },
    });

    expect(state).toEqual({ oCount: { min: 15 }, tagCount: { max: 8 } });
    expect(kept).toEqual({});
  });

  it("reads an old calendar-date GREATER_THAN as the next day, a timestamp one as that day", () => {
    const { state, kept } = carouselRulesToFilterState({
      date: { modifier: "GREATER_THAN", value: "2024-05-15" },
      created_at: { modifier: "GREATER_THAN", value: "2024-05-15" },
      updated_at: { modifier: "GREATER_THAN", value: "2024-05-15" },
      last_played_at: { modifier: "GREATER_THAN", value: "2024-05-15" },
    });

    expect(state).toEqual({
      date: { start: "2024-05-16" },
      createdAt: { start: "2024-05-15" },
      updatedAt: { start: "2024-05-15" },
      lastPlayedAt: { start: "2024-05-15" },
    });
    expect(kept).toEqual({});
  });

  it("reads an old date LESS_THAN as the end day", () => {
    const { state } = carouselRulesToFilterState({
      date: { modifier: "LESS_THAN", value: "2024-05-20" },
    });

    expect(state).toEqual({ date: { end: "2024-05-20" } });
  });

  it("reads nothing from no rules", () => {
    expect(carouselRulesToFilterState(null)).toEqual({ state: {}, kept: {} });
    expect(carouselRulesToFilterState(undefined)).toEqual({
      state: {},
      kept: {},
    });
  });
});

describe("carousel rules of the F22b editors (test-local rows; F18 adds the real ones)", () => {
  const table = {
    rows: [...SCENE_ROWS, PATH_ROW, PLAYLISTS_ROW],
    specs: SCENE_FIELDS,
  };

  it("a Path condition and a playlist rule read back and build the same", () => {
    const stored = {
      path: { value: "/media/new", modifier: "STARTS_WITH" },
      playlists: { value: [12, 7], modifier: "INCLUDES_ALL" },
    };

    const { state, kept } = readPanelFilter("scene", stored, table);

    expect(state).toEqual({
      path: "/media/new",
      pathModifier: "STARTS_WITH",
      playlistIds: ["12", "7"],
      playlistIdsModifier: "INCLUDES_ALL",
    });
    expect(kept).toEqual({});
    expect(buildPanelFilter("scene", state, table)).toEqual(stored);
  });

  it("a condition the row does not offer is kept as stored", () => {
    const stored = {
      title: { value: "beach", modifier: "STARTS_WITH" },
      playlists: { value: [12], modifier: "IS_NULL" },
    };

    expect(readPanelFilter("scene", stored, table)).toEqual({
      state: {},
      kept: stored,
    });
  });
});
