/**
 * The one validated parser for list, clip, minimal and stored carousel
 * requests (item 38). Unknown or invalid input is answered with 400 naming
 * its path; stored carousel rules parse leniently and report what they
 * ignored.
 */
import { PER_PAGE_MAX } from "@peek/shared-types/filters/index.js";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import { ValidationError } from "../../middleware/errorHandler.js";
import type { ApiErrorIssue } from "../../types/api/index.js";
import type {
  ParsedFilter,
  PlaylistCriterion,
  RefCriterion,
  RefPresenceCriterion,
} from "../../types/parsedFilters.js";
import {
  logIgnoredStoredRule,
  parseCarouselRequest,
  parseClipQuery,
  parseListRequest,
  parseMinimalRequest,
  parsePlaylistItemsRequest,
  parsePlaylistQueueRequest,
  parseRecommendedRequest,
  parseSceneClipsRequest,
  parseSimilarScenesRequest,
  parseStashId,
  parseStoredSceneQuery,
  singleIdRef,
} from "../../utils/listRequest.js";
import { _resetLogThrottleForTesting } from "../../utils/logThrottle.js";
import { logger } from "../../utils/logger.js";
import { generateDailySeed } from "../../utils/seededRandom.js";
import { must } from "../helpers/must.js";

const USER_ID = 7;

const opts = () => ({ userId: USER_ID });

/** The issues of the ValidationError `fn` throws; fails when it throws nothing else. */
function issuesOf(fn: () => unknown): ApiErrorIssue[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return must(error.issues, "issues");
    throw error;
  }
  throw new Error("expected a ValidationError");
}

const paths = (issues: readonly { path: string }[]) =>
  issues.map((issue) => issue.path);

describe("parseListRequest: pagination", () => {
  it("clamps page below 1 to 1 and per_page to 1..250; absent per_page is 40", () => {
    const low = parseListRequest(
      "scene",
      { filter: { page: 0, per_page: -5 } },
      opts()
    );
    expect(low.page).toBe(1);
    expect(low.perPage).toBe(1);

    const high = parseListRequest(
      "scene",
      { filter: { page: -1, per_page: 1000 } },
      opts()
    );
    expect(high.page).toBe(1);
    expect(high.perPage).toBe(PER_PAGE_MAX);

    const absent = parseListRequest("scene", {}, opts());
    expect(absent.page).toBe(1);
    expect(absent.perPage).toBe(40);
    expect(absent.q).toBeUndefined();
    expect(absent.filter).toEqual({});
    expect(absent.specificInstanceId).toBeUndefined();
  });

  it("absent per_page is 24 for clips and 50 for minimal requests", () => {
    expect(parseClipQuery({}, opts()).perPage).toBe(24);
    expect(parseMinimalRequest("performer", {}, opts()).perPage).toBe(50);
  });

  it("a non-numeric page or per_page fails naming filter.per_page (reject)", () => {
    const issues = issuesOf(() =>
      parseListRequest(
        "scene",
        { filter: { page: "abc", per_page: "many" } },
        opts()
      )
    );
    expect(paths(issues)).toEqual(["filter.page", "filter.per_page"]);
  });

  it("numeric strings are read as numbers", () => {
    const parsed = parseListRequest(
      "scene",
      { filter: { page: "3", per_page: "25" } },
      opts()
    );
    expect(parsed.page).toBe(3);
    expect(parsed.perPage).toBe(25);
  });

  it("q is trimmed; empty is undefined; over 200 characters is invalid", () => {
    expect(
      parseListRequest("scene", { filter: { q: "  hello " } }, opts()).q
    ).toBe("hello");
    expect(
      parseListRequest("scene", { filter: { q: "   " } }, opts()).q
    ).toBeUndefined();
    const long = "x".repeat(201);
    expect(
      paths(
        issuesOf(() =>
          parseListRequest("scene", { filter: { q: long } }, opts())
        )
      )
    ).toEqual(["filter.q"]);
  });

  it("filter.count false asks for the page alone; true or absent counts; anything else is invalid", () => {
    expect(
      parseListRequest("scene", { filter: { count: false } }, opts()).count
    ).toBe(false);
    expect(
      parseListRequest("image", { filter: { count: true } }, opts()).count
    ).toBe(true);
    expect(parseListRequest("scene", {}, opts()).count).toBeUndefined();
    expect(
      paths(
        issuesOf(() =>
          parseListRequest("scene", { filter: { count: "false" } }, opts())
        )
      )
    ).toEqual(["filter.count"]);
  });

  it("an unknown key in filter is invalid", () => {
    expect(
      paths(
        issuesOf(() =>
          parseListRequest("scene", { filter: { per_pages: 10 } }, opts())
        )
      )
    ).toEqual(["filter.per_pages"]);
  });
});

describe("parseListRequest: sort", () => {
  it("a sort of the entity's own keys passes; another entity's key is invalid", () => {
    const ok = parseListRequest(
      "scene",
      { filter: { sort: "duration" } },
      opts()
    );
    expect(ok.sort).toEqual({
      field: "duration",
      direction: "DESC",
      seed: undefined,
    });

    const issues = issuesOf(() =>
      parseListRequest("scene", { filter: { sort: "name" } }, opts())
    );
    expect(paths(issues)).toEqual(["filter.sort"]);
  });

  it("constructor and __proto__ fail naming filter.sort", () => {
    for (const sort of ["constructor", "__proto__"]) {
      const issues = issuesOf(() =>
        parseListRequest("scene", { filter: { sort } }, opts())
      );
      expect(paths(issues)).toEqual(["filter.sort"]);
    }
  });

  it("each list has its own default sort and direction", () => {
    expect(parseListRequest("performer", {}, opts()).sort).toEqual({
      field: "name",
      direction: "ASC",
      seed: undefined,
    });
    expect(parseListRequest("gallery", {}, opts()).sort.field).toBe("title");
  });

  it("random_123 gives sort random with seed 123; random gets the daily seed; random_abc is invalid", () => {
    const seeded = parseListRequest(
      "scene",
      { filter: { sort: "random_123" } },
      opts()
    );
    expect(seeded.sort).toEqual({
      field: "random",
      direction: "DESC",
      seed: 123,
    });

    const daily = parseListRequest(
      "scene",
      { filter: { sort: "random" } },
      opts()
    );
    expect(daily.sort.field).toBe("random");
    expect(daily.sort.seed).toBe(generateDailySeed(USER_ID));

    const large = parseListRequest(
      "performer",
      { filter: { sort: "random_123456789012" } },
      opts()
    );
    expect(large.sort.seed).toBe(123456789012 % 1e8);

    expect(
      paths(
        issuesOf(() =>
          parseListRequest("scene", { filter: { sort: "random_abc" } }, opts())
        )
      )
    ).toEqual(["filter.sort"]);
  });

  it("scene_index needs an including groups criterion: a 400", () => {
    const body = (modifier?: string) => ({
      filter: { sort: "scene_index" },
      scene_filter:
        modifier === undefined
          ? {}
          : { groups: { value: ["7:inst"], modifier } },
    });
    for (const modifier of [undefined, "EXCLUDES"]) {
      expect(
        paths(issuesOf(() => parseListRequest("scene", body(modifier), opts())))
      ).toEqual(["filter.sort"]);
    }
    for (const modifier of ["INCLUDES", "INCLUDES_ALL"]) {
      const parsed = parseListRequest("scene", body(modifier), opts());
      expect(parsed.sort.field).toBe("scene_index");
    }
  });

  it("direction asc is ASC; sideways is invalid", () => {
    expect(
      parseListRequest("scene", { filter: { direction: "asc" } }, opts()).sort
        .direction
    ).toBe("ASC");
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { filter: { direction: "sideways" } },
            opts()
          )
        )
      )
    ).toEqual(["filter.direction"]);
  });
});

describe("parseListRequest: filter fields", () => {
  it("an unknown scene_filter key fails with its path (reject)", () => {
    const issues = issuesOf(() =>
      parseListRequest(
        "scene",
        { scene_filter: { bogus: { value: 1 } } },
        opts()
      )
    );
    expect(issues).toEqual([
      { path: "scene_filter.bogus", message: "Unknown filter field" },
    ]);
  });

  it("an unknown top-level key and another entity's filter key are invalid", () => {
    const issues = issuesOf(() =>
      parseListRequest("scene", { performer_filter: {}, extra: 1 }, opts())
    );
    expect(paths(issues)).toEqual(["performer_filter", "extra"]);
  });

  const unknownModifiers = {
    scene_filter: {
      performers: { value: ["1:default"], modifier: "SOMETIMES" },
      title: { value: "x", modifier: "SOMETIMES" },
    },
  };

  it("an unknown modifier fails naming it (reject)", () => {
    expect(
      paths(issuesOf(() => parseListRequest("scene", unknownModifiers, opts())))
    ).toEqual([
      "scene_filter.performers.modifier",
      "scene_filter.title.modifier",
    ]);
  });

  it("a single-valued ref field never takes INCLUDES_ALL", () => {
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            {
              scene_filter: {
                studios: { value: ["1:default"], modifier: "INCLUDES_ALL" },
              },
            },
            opts()
          )
        )
      )
    ).toEqual(["scene_filter.studios.modifier"]);
  });

  it("a null modifier takes the field's default", () => {
    const performer = parseListRequest(
      "performer",
      { performer_filter: { tags: { value: ["3:default"], modifier: null } } },
      opts()
    );
    expect(performer.filter.tags).toEqual({
      refs: [{ id: "3", instanceId: "default" }],
      modifier: "INCLUDES",
      depth: 0,
    });

    const scene = parseListRequest(
      "scene",
      {
        scene_filter: {
          rating100: { value: 50 },
          performer_count: { value: 2 },
          title: { value: "a" },
          date: { value: "2024-01-05" },
        },
      },
      opts()
    );
    expect(scene.filter.rating100).toEqual({
      modifier: "GREATER_THAN",
      value: 50,
    });
    expect(scene.filter.performer_count).toEqual({
      modifier: "EQUALS",
      value: 2,
    });
    expect(scene.filter.title).toEqual({ modifier: "INCLUDES", value: "a" });
    expect(scene.filter.date).toEqual({
      modifier: "GREATER_THAN",
      value: "2024-01-05",
    });
  });

  it("ref values parse to pairs; a bare id keeps instanceId undefined", () => {
    const parsed = parseListRequest(
      "scene",
      {
        scene_filter: {
          performers: {
            value: ["12:default", "7", "9:a-b_C"],
            modifier: "INCLUDES_ALL",
          },
        },
      },
      opts()
    );
    expect(parsed.filter.performers).toEqual({
      refs: [
        { id: "12", instanceId: "default" },
        { id: "7", instanceId: undefined },
        { id: "9", instanceId: "a-b_C" },
      ],
      modifier: "INCLUDES_ALL",
      depth: 0,
    });
  });

  const badRefs = {
    scene_filter: { performers: { value: ["1:bad id", "abc", "2"] } },
  };
  const tooManyRefs = {
    scene_filter: {
      tags: { value: Array.from({ length: 1001 }, (_, i) => `${i + 1}`) },
    },
  };

  it("1:bad id and abc are invalid refs; 1,001 values are invalid", () => {
    expect(
      paths(issuesOf(() => parseListRequest("scene", badRefs, opts())))
    ).toEqual([
      "scene_filter.performers.value.0",
      "scene_filter.performers.value.1",
    ]);
    expect(
      paths(issuesOf(() => parseListRequest("scene", tooManyRefs, opts())))
    ).toEqual(["scene_filter.tags.value"]);
  });

  it("1,000 values pass", () => {
    const parsed = parseListRequest(
      "scene",
      {
        scene_filter: {
          tags: { value: Array.from({ length: 1000 }, (_, i) => `${i + 1}`) },
        },
      },
      opts()
    );
    expect(parsed.filter.tags?.refs).toHaveLength(1000);
  });

  it("top-level ids become filter.ids INCLUDES", () => {
    const parsed = parseListRequest(
      "scene",
      { ids: ["5:default", "6"] },
      opts()
    );
    expect(parsed.filter.ids).toEqual({
      refs: [
        { id: "5", instanceId: "default" },
        { id: "6", instanceId: undefined },
      ],
      modifier: "INCLUDES",
      depth: 0,
    });
    expect(
      paths(
        issuesOf(() => parseListRequest("scene", { ids: ["nope"] }, opts()))
      )
    ).toEqual(["ids.0"]);
  });

  it("top-level ids join an INCLUDES scene_filter.ids and conflict with an EXCLUDES one", () => {
    const joined = parseListRequest(
      "scene",
      { ids: ["5"], scene_filter: { ids: { value: ["6"] } } },
      opts()
    );
    expect(joined.filter.ids?.refs).toEqual([
      { id: "6", instanceId: undefined },
      { id: "5", instanceId: undefined },
    ]);
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            {
              ids: ["5"],
              scene_filter: { ids: { value: ["6"], modifier: "EXCLUDES" } },
            },
            opts()
          )
        )
      )
    ).toEqual(["ids"]);
  });

  it("instance_id becomes specificInstanceId and must match INSTANCE_ID_PATTERN", () => {
    const parsed = parseListRequest(
      "scene",
      { scene_filter: { instance_id: "stash-2" } },
      opts()
    );
    expect(parsed.specificInstanceId).toBe("stash-2");
    expect(parsed.filter).toEqual({});
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { scene_filter: { instance_id: "bad id!" } },
            opts()
          )
        )
      )
    ).toEqual(["scene_filter.instance_id"]);
  });

  it("a bad id is refused with every other issue of the request", () => {
    const refused = (body: unknown) =>
      paths(issuesOf(() => parseListRequest("performer", body, opts())));

    expect(refused({ ids: ["abc"] })).toEqual(["ids.0"]);
    expect(
      refused({ performer_filter: { ids: { value: ["5:bad id!"] } } })
    ).toEqual(["performer_filter.ids.value.0"]);
    expect(
      refused({ performer_filter: { ids: { value: ["5"], extra: 1 } } })
    ).toEqual(["performer_filter.ids"]);
    // Every issue of the request is reported with it
    expect(
      refused({ ids: ["abc"], performer_filter: { not_a_field: 1 } })
    ).toEqual(["ids.0", "performer_filter.not_a_field"]);
    expect(
      refused({
        ids: ["5"],
        performer_filter: { tags: { value: ["abc"] } },
      })
    ).toEqual(["performer_filter.tags.value.0"]);
  });

  it("depth is kept on hierarchical fields and dropped elsewhere", () => {
    const parsed = parseListRequest(
      "scene",
      {
        scene_filter: {
          tags: { value: ["1"], depth: -1 },
          studios: { value: ["2:default"], depth: 2 },
          performers: { value: ["3"], depth: -1 },
          groups: { value: ["4"], depth: null },
        },
      },
      opts()
    );
    expect(parsed.filter.tags?.depth).toBe(-1);
    expect(parsed.filter.studios?.depth).toBe(2);
    expect(parsed.filter.performers).toEqual({
      refs: [{ id: "3", instanceId: undefined }],
      modifier: "INCLUDES",
      depth: 0,
    });
    expect(parsed.filter.groups?.depth).toBe(0);
    expect(
      parseListRequest(
        "scene",
        { scene_filter: { tags: { value: ["1"], depth: null } } },
        opts()
      ).filter.tags?.depth
    ).toBe(0);
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { scene_filter: { tags: { value: ["1"], depth: -2 } } },
            opts()
          )
        )
      )
    ).toEqual(["scene_filter.tags.depth"]);
  });

  it("NOT_BETWEEN with one bound is invalid; IS_NULL needs no value; an all-empty criterion is omitted with no record", () => {
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            {
              scene_filter: {
                rating100: { modifier: "NOT_BETWEEN", value: 10 },
              },
            },
            opts()
          )
        )
      )
    ).toEqual(["scene_filter.rating100.value2"]);

    const parsed = parseListRequest(
      "scene",
      {
        scene_filter: {
          rating100: { modifier: "BETWEEN", value: 10, value2: 20 },
          director: { modifier: "IS_NULL" },
          date: { modifier: "NOT_NULL", value: null },
          title: { modifier: "IS_NULL" },
          performers: { value: [] },
          tags: { value: [], modifier: "INCLUDES_ALL" },
          details: { value: "" },
          o_counter: { modifier: "BETWEEN" },
          play_count: {},
          bitrate: null,
          favorite: null,
        },
      },
      opts()
    );
    expect(parsed.filter).toEqual({
      rating100: { modifier: "BETWEEN", value: 10, value2: 20 },
      director: { modifier: "IS_NULL" },
      date: { modifier: "NOT_NULL" },
      title: { modifier: "IS_NULL" },
    });
  });

  it("a comparison without a value, a non-number and an unknown key in a criterion are invalid", () => {
    const issues = issuesOf(() =>
      parseListRequest(
        "scene",
        {
          scene_filter: {
            rating100: { modifier: "GREATER_THAN", value2: 5 },
            duration: { value: "long" },
            o_counter: { value: 1, modifer: "EQUALS" },
          },
        },
        opts()
      )
    );
    expect(paths(issues)).toEqual([
      "scene_filter.rating100.value",
      "scene_filter.duration.value",
      "scene_filter.o_counter",
    ]);
  });

  it("dates are YYYY-MM-DD or ISO date-times, not reinterpreted", () => {
    const parsed = parseListRequest(
      "scene",
      {
        scene_filter: {
          date: {
            modifier: "BETWEEN",
            value: "2024-01-05",
            value2: "2024-02-05T10:00:00Z",
          },
          created_at: { value: "2024-02-05T10:00:00.123+02:00" },
        },
      },
      opts()
    );
    expect(parsed.filter.date).toEqual({
      modifier: "BETWEEN",
      value: "2024-01-05",
      value2: "2024-02-05T10:00:00Z",
    });
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { scene_filter: { date: { value: "yesterday" } } },
            opts()
          )
        )
      )
    ).toEqual(["scene_filter.date.value"]);
  });

  it("text values are trimmed and held to 500 characters; the performer free-text fields to 100", () => {
    const parsed = parseListRequest(
      "performer",
      {
        performer_filter: {
          name: { value: "  Jane ", modifier: "EQUALS" },
          hair_color: { value: "blonde", modifier: "EQUALS" },
          ethnicity: { value: "Caucasian", modifier: "NOT_EQUALS" },
          eye_color: { value: "Hazel" },
          fake_tits: { value: "Natural" },
        },
      },
      opts()
    );
    expect(parsed.filter).toEqual({
      name: { modifier: "EQUALS", value: "Jane" },
      hair_color: { modifier: "EQUALS", value: "blonde" },
      ethnicity: { modifier: "NOT_EQUALS", value: "Caucasian" },
      eye_color: { modifier: "EQUALS", value: "Hazel" },
      fake_tits: { modifier: "EQUALS", value: "Natural" },
    });
    const issues = issuesOf(() =>
      parseListRequest(
        "performer",
        {
          performer_filter: {
            name: { value: "x".repeat(501) },
            hair_color: { value: "x".repeat(101) },
            eye_color: { value: "Hazel", modifier: "INCLUDES" },
          },
        },
        opts()
      )
    );
    expect(paths(issues)).toEqual([
      "performer_filter.name.value",
      "performer_filter.hair_color.value",
      "performer_filter.eye_color.modifier",
    ]);
  });

  it("scene path takes STARTS_WITH, no other text field does; groups keep a depth", () => {
    const parsed = parseListRequest(
      "scene",
      {
        scene_filter: {
          path: { value: " /a/ ", modifier: "STARTS_WITH" },
          groups: { value: ["4:x"], depth: -1 },
        },
      },
      opts()
    );
    expect(parsed.filter.path).toEqual({
      modifier: "STARTS_WITH",
      value: "/a/",
    });
    expect(parsed.filter.groups?.depth).toBe(-1);

    const issues = issuesOf(() =>
      parseListRequest(
        "scene",
        {
          scene_filter: {
            path: { modifier: "IS_NULL" },
            title: { value: "x", modifier: "STARTS_WITH" },
            captions: { value: "en", modifier: "INCLUDES" },
          },
        },
        opts()
      )
    );
    expect(paths(issues)).toEqual([
      "scene_filter.path.modifier",
      "scene_filter.title.modifier",
      "scene_filter.captions.modifier",
    ]);
  });

  it("enum values must be members; a multi-valued enum takes a list", () => {
    const parsed = parseListRequest(
      "scene",
      {
        scene_filter: {
          resolution: { value: "FULL_HD", modifier: "GREATER_THAN" },
          orientation: { value: ["PORTRAIT", "SQUARE"] },
        },
      },
      opts()
    );
    expect(parsed.filter.resolution).toEqual({
      modifier: "GREATER_THAN",
      value: "FULL_HD",
    });
    expect(parsed.filter.orientation).toEqual({
      modifier: "INCLUDES",
      values: ["PORTRAIT", "SQUARE"],
    });
    const issues = issuesOf(() =>
      parseListRequest(
        "performer",
        { performer_filter: { gender: { value: "female" } } },
        opts()
      )
    );
    expect(paths(issues)).toEqual(["performer_filter.gender.value"]);
  });

  it("a multi-valued enum offering presence takes IS_NULL and NOT_NULL with no value; one without refuses them", () => {
    const parsed = parseListRequest(
      "performer",
      {
        performer_filter: {
          circumcised: { modifier: "IS_NULL", value: ["CUT"] },
        },
      },
      opts()
    );
    expect(parsed.filter.circumcised).toEqual({ modifier: "IS_NULL" });
    expect(
      parseListRequest(
        "performer",
        { performer_filter: { circumcised: { modifier: "NOT_NULL" } } },
        opts()
      ).filter.circumcised
    ).toEqual({ modifier: "NOT_NULL" });
    const issues = issuesOf(() =>
      parseListRequest(
        "scene",
        { scene_filter: { orientation: { modifier: "IS_NULL" } } },
        opts()
      )
    );
    expect(paths(issues)).toEqual(["scene_filter.orientation.modifier"]);
  });

  it("booleans stay boolean; a string is invalid", () => {
    const parsed = parseListRequest(
      "scene",
      { scene_filter: { favorite: true, organized: false } },
      opts()
    );
    expect(parsed.filter).toEqual({ favorite: true, organized: false });
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { scene_filter: { favorite: "true" } },
            opts()
          )
        )
      )
    ).toEqual(["scene_filter.favorite"]);
  });

  it("a tag's scenes_filter.id and .groups parse to the flat scenes and groups fields", () => {
    const parsed = parseListRequest(
      "tag",
      {
        tag_filter: {
          scenes_filter: {
            id: { value: ["8:default"] },
            groups: { value: ["9"], modifier: "INCLUDES" },
          },
        },
      },
      opts()
    );
    expect(parsed.filter).toEqual({
      scenes: {
        refs: [{ id: "8", instanceId: "default" }],
        modifier: "INCLUDES",
        depth: 0,
      },
      groups: {
        refs: [{ id: "9", instanceId: undefined }],
        modifier: "INCLUDES",
        depth: 0,
      },
    });
    const issues = issuesOf(() =>
      parseListRequest(
        "tag",
        {
          tag_filter: {
            scenes_filter: { performers: { value: ["1"] } },
            scenes: { value: ["1"] },
          },
        },
        opts()
      )
    );
    expect(paths(issues)).toEqual([
      "tag_filter.scenes_filter.performers",
      "tag_filter.scenes",
    ]);
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "tag",
            { tag_filter: { scenes_filter: "all" } },
            opts()
          )
        )
      )
    ).toEqual(["tag_filter.scenes_filter"]);
  });

  it("a body that is not an object fails", () => {
    for (const body of ["scenes", null, 3, ["a"]]) {
      const issues = issuesOf(() => parseListRequest("scene", body, opts()));
      expect(issues).toEqual([{ path: "body", message: "Expected an object" }]);
    }
  });

  it("a filter object that is not an object is invalid, and null is absent", () => {
    expect(
      paths(
        issuesOf(() => parseListRequest("scene", { scene_filter: [] }, opts()))
      )
    ).toEqual(["scene_filter"]);
    expect(
      paths(issuesOf(() => parseListRequest("scene", { filter: "x" }, opts())))
    ).toEqual(["filter"]);
    const parsed = parseListRequest(
      "scene",
      { filter: null, scene_filter: null, ids: null },
      opts()
    );
    expect(parsed.filter).toEqual({});
  });
});

describe("parseClipQuery", () => {
  it("query strings coerce: perPage '1000' gives 250; page below 1 is 1", () => {
    const parsed = parseClipQuery({ page: "0", perPage: "1000" }, opts());
    expect(parsed.page).toBe(1);
    expect(parsed.perPage).toBe(PER_PAGE_MAX);
    expect(parsed.sort).toEqual({
      field: "stashCreatedAt",
      direction: "DESC",
      seed: undefined,
    });
    // No isGenerated: every clip (the Clips page sends true for its default)
    expect(parsed.filter).toEqual({});
    expect(parsed.q).toBeUndefined();
    expect(parsed.specificInstanceId).toBeUndefined();
  });

  it("isGenerated true or false narrows to clips with or without a preview; absent lists every clip", () => {
    expect(parseClipQuery({ isGenerated: "true" }, opts()).filter).toEqual({
      is_generated: true,
    });
    expect(parseClipQuery({ isGenerated: "false" }, opts()).filter).toEqual({
      is_generated: false,
    });
    expect(parseClipQuery({}, opts()).filter.is_generated).toBe(undefined);
  });

  it("count=false asks for the page alone; true or absent counts; anything else is invalid", () => {
    expect(parseClipQuery({ count: "false" }, opts()).count).toBe(false);
    expect(parseClipQuery({ count: "true" }, opts()).count).toBe(true);
    expect(parseClipQuery({}, opts()).count).toBeUndefined();
    expect(
      paths(issuesOf(() => parseClipQuery({ count: "no" }, opts())))
    ).toEqual(["count"]);
  });

  it("sortBy is whitelisted and sortDir is asc or desc", () => {
    const parsed = parseClipQuery(
      { sortBy: "seconds", sortDir: "asc" },
      opts()
    );
    expect(parsed.sort).toEqual({
      field: "seconds",
      direction: "ASC",
      seed: undefined,
    });
    expect(parseClipQuery({ sortBy: "random_42" }, opts()).sort).toEqual({
      field: "random",
      direction: "DESC",
      seed: 42,
    });
    expect(
      paths(
        issuesOf(() =>
          parseClipQuery(
            { sortBy: "created_at", sortDir: "sideways", perPage: "abc" },
            opts()
          )
        )
      )
    ).toEqual(["sortBy", "sortDir", "perPage"]);
  });

  it("tagIds is a comma list of refs with tagIdsModifier; single refs take INCLUDES", () => {
    const parsed = parseClipQuery(
      {
        tagIds: "1:default, 2 ,",
        tagIdsModifier: "EXCLUDES",
        sceneTagIds: "3",
        performerIds: "4:default",
        performerIdsModifier: "INCLUDES_ALL",
        studioId: "5:default",
        sceneId: "6",
        isGenerated: "false",
        instanceId: "default",
        q: " intro ",
      },
      opts()
    );
    // The GET's parameters map onto the clip filter's fields
    expect(parsed.filter).toEqual({
      tags: {
        refs: [
          { id: "1", instanceId: "default" },
          { id: "2", instanceId: undefined },
        ],
        modifier: "EXCLUDES",
        depth: 0,
      },
      scene_tags: {
        refs: [{ id: "3", instanceId: undefined }],
        modifier: "INCLUDES",
        depth: 0,
      },
      performers: {
        refs: [{ id: "4", instanceId: "default" }],
        modifier: "INCLUDES_ALL",
        depth: 0,
      },
      studios: {
        refs: [{ id: "5", instanceId: "default" }],
        modifier: "INCLUDES",
        depth: 0,
      },
      scenes: {
        refs: [{ id: "6", instanceId: undefined }],
        modifier: "INCLUDES",
        depth: 0,
      },
      is_generated: false,
    });
    expect(parsed.q).toBe("intro");
    expect(parsed.specificInstanceId).toBe("default");
  });

  it("an unknown modifier, a bad ref, a modifier for a single ref, an unknown key and a repeated key are invalid", () => {
    const issues = issuesOf(() =>
      parseClipQuery(
        {
          tagIds: "1",
          tagIdsModifier: "SOMETIMES",
          sceneTagIds: "abc",
          studioIdModifier: "EXCLUDES",
          isGenerated: "maybe",
          bogus: "1",
          performerIds: ["1", "2"],
        },
        opts()
      )
    );
    expect(paths(issues)).toEqual([
      "tagIdsModifier",
      "sceneTagIds.0",
      "studioIdModifier",
      "isGenerated",
      "bogus",
      "performerIds",
    ]);
  });

  it("an empty ref list is omitted; a query that is not an object fails", () => {
    const parsed = parseClipQuery({ tagIds: " , " }, opts());
    expect(parsed.filter).toEqual({});
    expect(issuesOf(() => parseClipQuery("x", opts()))).toEqual([
      { path: "query", message: "Expected an object" },
    ]);
  });
  it.each([
    { query: { sceneId: "abc" }, path: "sceneId.0" },
    { query: { instanceId: "bad id!" }, path: "instanceId" },
  ])("a bad $path is refused", ({ query, path }) => {
    expect(paths(issuesOf(() => parseClipQuery(query, opts())))).toEqual([
      path,
    ]);
  });
});

describe("parseListRequest: clips", () => {
  it("a clip_filter takes depth, a studio EXCLUDES, the duration and the dates", () => {
    const parsed = parseListRequest(
      "clip",
      {
        filter: { page: 2, sort: "seconds", direction: "ASC", q: " kiss " },
        clip_filter: {
          tags: { value: ["1:a"], depth: -1 },
          scene_tags: { value: ["3:a"], modifier: "INCLUDES_ALL", depth: 2 },
          studios: { value: ["2:a"], modifier: "EXCLUDES", depth: -1 },
          performers: { value: ["4:a"], excludes: ["5:a"] },
          scenes: { value: ["6:a", "7:b"] },
          duration: { modifier: "LESS_THAN", value: 30 },
          created_at: {
            modifier: "BETWEEN",
            value: "2021-10-12",
            value2: "2021-10-13",
          },
          updated_at: { modifier: "IS_NULL" },
          title: { modifier: "INCLUDES", value: "intro" },
          is_generated: true,
          instance_id: "a",
        },
      },
      opts()
    );
    expect(parsed).toEqual({
      page: 2,
      perPage: 24,
      q: "kiss",
      sort: { field: "seconds", direction: "ASC", seed: undefined },
      filter: {
        tags: {
          refs: [{ id: "1", instanceId: "a" }],
          modifier: "INCLUDES",
          depth: -1,
        },
        scene_tags: {
          refs: [{ id: "3", instanceId: "a" }],
          modifier: "INCLUDES_ALL",
          depth: 2,
        },
        studios: {
          refs: [{ id: "2", instanceId: "a" }],
          modifier: "EXCLUDES",
          depth: -1,
        },
        performers: {
          refs: [{ id: "4", instanceId: "a" }],
          modifier: "INCLUDES",
          depth: 0,
          excludes: [{ id: "5", instanceId: "a" }],
        },
        scenes: {
          refs: [
            { id: "6", instanceId: "a" },
            { id: "7", instanceId: "b" },
          ],
          modifier: "INCLUDES",
          depth: 0,
        },
        duration: { modifier: "LESS_THAN", value: 30 },
        created_at: {
          modifier: "BETWEEN",
          value: "2021-10-12",
          value2: "2021-10-13",
        },
        updated_at: { modifier: "IS_NULL" },
        title: { modifier: "INCLUDES", value: "intro" },
        is_generated: true,
      },
      specificInstanceId: "a",
    });
  });

  it("the old GET's parameters parse to the same criteria as the body (old callers keep working)", () => {
    const fromQuery = parseClipQuery(
      { tagIds: "1:a", tagIdsModifier: "INCLUDES_ALL", isGenerated: "true" },
      opts()
    );
    const fromBody = parseListRequest(
      "clip",
      {
        clip_filter: {
          tags: { value: ["1:a"], modifier: "INCLUDES_ALL" },
          is_generated: true,
        },
      },
      opts()
    );
    expect(fromQuery.filter).toEqual(fromBody.filter);
    expect(fromQuery.filter).toEqual({
      tags: {
        refs: [{ id: "1", instanceId: "a" }],
        modifier: "INCLUDES_ALL",
        depth: 0,
      },
      is_generated: true,
    });
    expect(fromQuery.perPage).toBe(fromBody.perPage);
  });

  it("the studio is single-valued, a depth needs a hierarchical field, and top-level ids or the GET's names are unknown", () => {
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "clip",
            {
              ids: ["1:a"],
              clip_filter: {
                studios: { value: ["2:a"], modifier: "INCLUDES_ALL" },
                tagIds: { value: ["1:a"] },
                duration: { modifier: "SOMETIMES", value: 3 },
              },
            },
            opts()
          )
        )
      )
    ).toEqual([
      "ids",
      "clip_filter.studios.modifier",
      "clip_filter.tagIds",
      "clip_filter.duration.modifier",
    ]);
  });

  it("an empty clip request lists every clip, newest first, 24 a page", () => {
    expect(parseListRequest("clip", {}, opts())).toEqual({
      page: 1,
      perPage: 24,
      q: undefined,
      sort: { field: "stashCreatedAt", direction: "DESC", seed: undefined },
      filter: {},
      specificInstanceId: undefined,
    });
  });
});

describe("parseMinimalRequest", () => {
  it("reads q, per_page held to 1..100, ids and count_filter; always name order", () => {
    const parsed = parseMinimalRequest(
      "gallery",
      {
        ids: ["12:inst-a", "13"],
        filter: { q: " a ", per_page: 1000 },
        count_filter: { min_scene_count: 1, min_image_count: 0 },
      },
      opts()
    );
    expect(parsed).toEqual({
      entity: "gallery",
      q: "a",
      perPage: 100,
      ids: [
        { id: "12", instanceId: "inst-a" },
        { id: "13", instanceId: undefined },
      ],
      countFilter: { min_scene_count: 1, min_image_count: 0 },
    });
    expect(parseMinimalRequest("tag", {}, opts())).toEqual({
      entity: "tag",
      q: undefined,
      perPage: 50,
      ids: undefined,
      countFilter: undefined,
    });
    expect(
      parseMinimalRequest("tag", { filter: { per_page: 0 } }, opts()).perPage
    ).toBe(1);
    // An empty list names nothing to look up: no ids filter
    expect(
      parseMinimalRequest("studio", { ids: [] }, opts()).ids
    ).toBeUndefined();
  });

  it("sort, direction and page are unknown fields: the pickers list one page in name order", () => {
    const issues = issuesOf(() =>
      parseMinimalRequest(
        "performer",
        { filter: { sort: "name", direction: "ASC", page: 1 } },
        opts()
      )
    );
    expect(paths(issues)).toEqual([
      "filter.sort",
      "filter.direction",
      "filter.page",
    ]);
  });

  it("a negative count, an unknown count key and an unknown body key are invalid", () => {
    const issues = issuesOf(() =>
      parseMinimalRequest(
        "performer",
        {
          count_filter: { min_scene_count: -1, min_tag_count: 1 },
          performer_filter: {},
        },
        opts()
      )
    );
    expect(paths(issues)).toEqual([
      "count_filter.min_scene_count",
      "count_filter.min_tag_count",
      "performer_filter",
    ]);
  });

  it("ids that are not ids, or more than 100 of them, fail", () => {
    expect(
      paths(
        issuesOf(() =>
          parseMinimalRequest(
            "tag",
            { ids: ["12:inst-a", "abc", "7:bad instance"] },
            opts()
          )
        )
      )
    ).toEqual(["ids.1", "ids.2"]);
    const tooMany = Array.from({ length: 101 }, (_, i) => String(i + 1));
    expect(
      paths(
        issuesOf(() => parseMinimalRequest("tag", { ids: tooMany }, opts()))
      )
    ).toEqual(["ids"]);
    expect(
      paths(issuesOf(() => parseMinimalRequest("tag", { ids: "12" }, opts())))
    ).toEqual(["ids"]);
    expect(
      parseMinimalRequest(
        "tag",
        { ids: Array.from({ length: 100 }, (_, i) => String(i + 1)) },
        opts()
      ).ids
    ).toHaveLength(100);
  });

  it("a body that is not an object fails", () => {
    expect(issuesOf(() => parseMinimalRequest("studio", 1, opts()))).toEqual([
      { path: "body", message: "Expected an object" },
    ]);
  });

  it("reads scope allEnabled; no scope is the user's own instances", () => {
    expect(
      parseMinimalRequest("tag", { scope: "allEnabled" }, opts()).scope
    ).toBe("allEnabled");
    expect(parseMinimalRequest("tag", {}, opts()).scope).toBeUndefined();
    expect(
      parseMinimalRequest("tag", { scope: null }, opts()).scope
    ).toBeUndefined();
  });

  it("scenes take q and per_page; scope allEnabled is refused for them (no scene is restricted)", () => {
    expect(
      parseMinimalRequest("scene", { filter: { q: " beach " } }, opts())
    ).toEqual({
      entity: "scene",
      q: "beach",
      perPage: 50,
      ids: undefined,
      countFilter: undefined,
      scope: undefined,
    });
    expect(
      issuesOf(() =>
        parseMinimalRequest("scene", { scope: "allEnabled" }, opts())
      )
    ).toEqual([
      { path: "scope", message: "Scenes are listed for the user only" },
    ]);
  });

  it("any other scope fails: it names the instances the request looks in", () => {
    for (const scope of ["all", "ALLENABLED", "", 1, true, ["allEnabled"]]) {
      expect(
        issuesOf(() => parseMinimalRequest("tag", { scope }, opts()))
      ).toEqual([{ path: "scope", message: 'Expected "allEnabled"' }]);
    }
  });
});

describe("parseListRequest: open-ended ranges and presence on numbers", () => {
  it("BETWEEN takes one side alone", () => {
    const parsed = parseListRequest(
      "performer",
      {
        performer_filter: {
          weight: { modifier: "BETWEEN", value2: 40 },
          height: { modifier: "BETWEEN", value: 160, value2: null },
        },
      },
      opts()
    );
    expect(parsed.filter).toEqual({
      weight: { modifier: "BETWEEN", value: undefined, value2: 40 },
      height: { modifier: "BETWEEN", value: 160, value2: undefined },
    });
  });

  it("BETWEEN with neither side is an unset option: omitted, no problem recorded", () => {
    const parsed = parseListRequest(
      "scene",
      { scene_filter: { rating100: { modifier: "BETWEEN" } } },
      opts()
    );
    expect(parsed.filter).toEqual({});
  });

  it("NOT_BETWEEN with one side present is refused", () => {
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            {
              scene_filter: {
                rating100: { modifier: "NOT_BETWEEN", value: 10 },
                duration: { modifier: "NOT_BETWEEN", value2: 600 },
              },
            },
            opts()
          )
        )
      )
    ).toEqual(["scene_filter.rating100.value2", "scene_filter.duration.value"]);
  });

  it("IS_NULL and NOT_NULL on a nullable number need no value", () => {
    const parsed = parseListRequest(
      "performer",
      {
        performer_filter: {
          rating100: { modifier: "IS_NULL" },
          height: { modifier: "NOT_NULL", value: null },
        },
      },
      opts()
    );
    expect(parsed.filter).toEqual({
      rating100: { modifier: "IS_NULL" },
      height: { modifier: "NOT_NULL" },
    });
  });

  it("IS_NULL on o_counter is refused (not nullable)", () => {
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { scene_filter: { o_counter: { modifier: "IS_NULL" } } },
            opts()
          )
        )
      )
    ).toEqual(["scene_filter.o_counter.modifier"]);
  });

  it("a date BETWEEN takes one side alone, and neither side is an unset option", () => {
    const parsed = parseListRequest(
      "scene",
      {
        scene_filter: {
          date: { modifier: "BETWEEN", value2: "2024-01-01" },
          created_at: { modifier: "BETWEEN", value: "2024-01-01" },
          updated_at: { modifier: "BETWEEN" },
        },
      },
      opts()
    );
    expect(parsed.filter).toEqual({
      date: { modifier: "BETWEEN", value: undefined, value2: "2024-01-01" },
      created_at: {
        modifier: "BETWEEN",
        value: "2024-01-01",
        value2: undefined,
      },
    });
  });

  it("a date NOT_BETWEEN still needs both sides", () => {
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            {
              scene_filter: {
                date: { modifier: "NOT_BETWEEN", value2: "2024-01-01" },
              },
            },
            opts()
          )
        )
      )
    ).toEqual(["scene_filter.date.value"]);
  });
});

describe("parseListRequest: an empty value", () => {
  it("is no value in a date or number criterion, as Stash's inputs send it", () => {
    const parsed = parseListRequest(
      "performer",
      {
        performer_filter: {
          birthdate: { value: "", modifier: "IS_NULL" },
          death_date: { value: "", value2: "", modifier: "NOT_NULL" },
          height: { value: 170, value2: "", modifier: "GREATER_THAN" },
        },
      },
      opts()
    );
    expect(parsed.filter).toEqual({
      birthdate: { modifier: "IS_NULL" },
      death_date: { modifier: "NOT_NULL" },
      height: { modifier: "GREATER_THAN", value: 170 },
    });
  });

  it("a date BETWEEN with only value2 is an open-ended range", () => {
    const parsed = parseListRequest(
      "performer",
      {
        performer_filter: {
          birthdate: { value: "", value2: "2000-01-01", modifier: "BETWEEN" },
        },
      },
      opts()
    );
    expect(parsed.filter).toEqual({
      birthdate: {
        modifier: "BETWEEN",
        value: undefined,
        value2: "2000-01-01",
      },
    });
  });

  it("still leaves a comparison without its value", () => {
    const issues = issuesOf(() =>
      parseListRequest(
        "performer",
        {
          performer_filter: {
            birthdate: {
              value: "",
              value2: "2000-01-01",
              modifier: "NOT_BETWEEN",
            },
          },
        },
        opts()
      )
    );
    expect(issues).toEqual([
      { path: "performer_filter.birthdate.value", message: "Required" },
    ]);
  });
});

describe("parseListRequest: ref presence and excludes", () => {
  const scene = (scene_filter: Record<string, unknown>) =>
    parseListRequest("scene", { scene_filter }, opts());
  const sceneIssues = (scene_filter: Record<string, unknown>) =>
    paths(issuesOf(() => scene(scene_filter)));

  it("a ref takes IS_NULL with no value", () => {
    expect(scene({ performers: { modifier: "IS_NULL" } }).filter).toEqual({
      performers: { modifier: "IS_NULL", refs: [], depth: 0 },
    });
    expect(
      scene({ studios: { modifier: "NOT_NULL", value: [] } }).filter
    ).toEqual({
      studios: { modifier: "NOT_NULL", refs: [], depth: 0 },
    });
  });

  it("presence on a field without it is a 400 at its modifier", () => {
    expect(sceneIssues({ ids: { modifier: "IS_NULL" } })).toEqual([
      "scene_filter.ids.modifier",
    ]);
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "performer",
            { performer_filter: { scenes: { modifier: "NOT_NULL" } } },
            opts()
          )
        )
      )
    ).toEqual(["performer_filter.scenes.modifier"]);
  });

  it("excludes beside values stay on the one criterion", () => {
    expect(
      scene({
        tags: {
          value: ["1:a"],
          excludes: ["2:a"],
          modifier: "INCLUDES",
          depth: -1,
        },
      }).filter
    ).toEqual({
      tags: {
        refs: [{ id: "1", instanceId: "a" }],
        modifier: "INCLUDES",
        depth: -1,
        excludes: [{ id: "2", instanceId: "a" }],
      },
    });
  });

  it("excludes alone keep an empty value", () => {
    expect(
      scene({ performers: { value: [], excludes: ["2:a"] } }).filter
    ).toEqual({
      performers: {
        refs: [],
        modifier: "INCLUDES",
        depth: 0,
        excludes: [{ id: "2", instanceId: "a" }],
      },
    });
  });

  it("an EXCLUDES modifier with excludes merges both lists into one EXCLUDES", () => {
    expect(
      scene({
        tags: { value: ["1:a"], excludes: ["2:a"], modifier: "EXCLUDES" },
      }).filter
    ).toEqual({
      tags: {
        refs: [
          { id: "1", instanceId: "a" },
          { id: "2", instanceId: "a" },
        ],
        modifier: "EXCLUDES",
        depth: 0,
      },
    });
  });

  it("excludes on a field without them is a 400", () => {
    expect(
      sceneIssues({ groups: { value: ["1:a"], excludes: ["2:a"] } })
    ).toEqual(["scene_filter.groups.excludes"]);
  });

  it("more than MAX_REF_VALUES across value and excludes is a 400", () => {
    const ids = (n: number, from: number) =>
      Array.from({ length: n }, (_, i) => `${from + i}:a`);
    expect(
      sceneIssues({ tags: { value: ids(600, 1), excludes: ids(401, 1000) } })
    ).toEqual(["scene_filter.tags.excludes"]);
    expect(
      scene({ tags: { value: ids(600, 1), excludes: ids(400, 1000) } }).filter
        .tags?.refs
    ).toHaveLength(600);
  });

  it("isEmptyCriterion: empty value and excludes are omitted; excludes alone are not", () => {
    const empty = scene({ tags: { value: [], excludes: [] } });
    expect(empty.filter).toEqual({});
    expect(
      scene({ tags: { value: [], excludes: ["2:a"] } }).filter.tags
    ).toBeDefined();
  });
});

describe("parseListRequest: playlists", () => {
  const scene = (body: Record<string, unknown>) =>
    parseListRequest("scene", body, opts());
  const sceneIssues = (body: Record<string, unknown>) =>
    paths(issuesOf(() => scene(body)));

  it("playlists take Peek playlist ids with a ref modifier, INCLUDES when missing", () => {
    expect(
      scene({
        scene_filter: { playlists: { value: [12, 15], modifier: "INCLUDES" } },
      }).filter
    ).toEqual({ playlists: { ids: [12, 15], modifier: "INCLUDES" } });
    expect(
      scene({ scene_filter: { playlists: { value: [12] } } }).filter
    ).toEqual({ playlists: { ids: [12], modifier: "INCLUDES" } });
    for (const modifier of ["INCLUDES_ALL", "EXCLUDES"]) {
      expect(
        scene({ scene_filter: { playlists: { value: [3, 3, 4], modifier } } })
          .filter
      ).toEqual({ playlists: { ids: [3, 4], modifier } });
    }
  });

  it("a non-positive, non-integer or text id is a 400 at its value", () => {
    for (const value of [[0], [-2], [1.5], ["12"], ["12:inst"]]) {
      expect(sceneIssues({ scene_filter: { playlists: { value } } })).toEqual([
        "scene_filter.playlists.value.0",
      ]);
    }
  });

  it("more than 100 ids is a 400; 100 parse", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    expect(
      sceneIssues({ scene_filter: { playlists: { value: ids(101) } } })
    ).toEqual(["scene_filter.playlists.value"]);
    expect(
      scene({ scene_filter: { playlists: { value: ids(100) } } }).filter
        .playlists?.ids
    ).toHaveLength(100);
  });

  it("has none and has any are not offered: a 400 at the modifier", () => {
    for (const modifier of ["IS_NULL", "NOT_NULL"]) {
      expect(
        sceneIssues({ scene_filter: { playlists: { value: [1], modifier } } })
      ).toEqual(["scene_filter.playlists.modifier"]);
      expect(
        sceneIssues({ scene_filter: { playlists: { modifier } } })
      ).toEqual(["scene_filter.playlists.modifier"]);
    }
  });

  it("an empty value is omitted, as on every field", () => {
    expect(
      scene({
        scene_filter: { playlists: { value: [], modifier: "INCLUDES" } },
      }).filter
    ).toEqual({});
  });

  it("in_any_playlist is true or false", () => {
    expect(scene({ scene_filter: { in_any_playlist: true } }).filter).toEqual({
      in_any_playlist: true,
    });
    expect(scene({ scene_filter: { in_any_playlist: false } }).filter).toEqual({
      in_any_playlist: false,
    });
    expect(sceneIssues({ scene_filter: { in_any_playlist: "yes" } })).toEqual([
      "scene_filter.in_any_playlist",
    ]);
  });

  it("Playlist order needs exactly one included playlist: a 400 at filter.sort", () => {
    const body = (playlists?: Record<string, unknown>) => ({
      filter: { sort: "playlist_position" },
      scene_filter: playlists === undefined ? {} : { playlists },
    });
    for (const playlists of [
      undefined,
      { value: [12], modifier: "EXCLUDES" },
      { value: [12, 15], modifier: "INCLUDES" },
      { value: [12, 15], modifier: "INCLUDES_ALL" },
    ]) {
      expect(issuesOf(() => scene(body(playlists)))).toEqual([
        { path: "filter.sort", message: "Playlist order needs one playlist" },
      ]);
    }
    for (const modifier of ["INCLUDES", "INCLUDES_ALL"]) {
      expect(scene(body({ value: [12], modifier })).sort.field).toBe(
        "playlist_position"
      );
    }
  });

  it("a carousel's Playlist order needs one playlist rule too", () => {
    expect(
      paths(
        issuesOf(() =>
          parseCarouselRequest(
            { rules: {}, sort: "playlist_position", direction: "ASC" },
            opts()
          )
        )
      )
    ).toEqual(["sort"]);
    expect(
      parseCarouselRequest(
        {
          rules: { playlists: { value: [4] } },
          sort: "playlist_position",
          direction: "ASC",
        },
        opts()
      ).sort.field
    ).toBe("playlist_position");
  });
});

describe("parseSceneClipsRequest", () => {
  it("reads the scene id, includeUngenerated and instanceId", () => {
    expect(
      parseSceneClipsRequest(
        "42",
        { includeUngenerated: "true", instanceId: "inst-1" },
        opts()
      )
    ).toEqual({
      sceneId: "42",
      includeUngenerated: true,
      instanceId: "inst-1",
    });
    expect(
      parseSceneClipsRequest("42", { instanceId: "inst-1" }, opts())
    ).toEqual({
      sceneId: "42",
      includeUngenerated: false,
      instanceId: "inst-1",
    });
  });

  it("the instanceId is required", () => {
    expect(issuesOf(() => parseSceneClipsRequest("42", {}, opts()))).toEqual([
      { path: "instanceId", message: "Required" },
    ]);
  });

  it("a bad value and an unknown parameter are invalid", () => {
    const query = { includeUngenerated: "yes", page: "2" };
    expect(
      paths(
        issuesOf(() =>
          parseSceneClipsRequest(
            "42",
            { ...query, instanceId: "inst 1" },
            opts()
          )
        )
      )
    ).toEqual(["includeUngenerated", "page", "instanceId"]);
  });

  it("a scene id that is not a Stash id fails", () => {
    expect(
      issuesOf(() =>
        parseSceneClipsRequest("scene-1", { instanceId: "inst-1" }, opts())
      )
    ).toEqual([{ path: "id", message: "Expected an id" }]);
  });
});

describe("parseStashId", () => {
  it("returns a Stash id and refuses anything else", () => {
    expect(parseStashId("123", "id")).toBe("123");
    for (const raw of ["", "12a", "1:inst", "-1", 5, undefined]) {
      expect(issuesOf(() => parseStashId(raw, "id"))).toEqual([
        { path: "id", message: "Expected an id" },
      ]);
    }
  });
});

describe("singleIdRef", () => {
  const criterion = (
    refs: RefCriterion["refs"],
    modifier: RefCriterion["modifier"] = "INCLUDES"
  ): RefCriterion => ({ refs, modifier, depth: 0 });

  it("is the one ref of an INCLUDES ids criterion", () => {
    const ref = { id: "5", instanceId: undefined };
    expect(singleIdRef(criterion([ref]))).toBe(ref);
    const pair = { id: "5", instanceId: "a" };
    expect(singleIdRef(criterion([pair]))).toBe(pair);
  });

  it("is undefined for no criterion, several refs or EXCLUDES", () => {
    const ref = { id: "5", instanceId: undefined };
    expect(singleIdRef(undefined)).toBeUndefined();
    expect(
      singleIdRef(criterion([ref, { id: "6", instanceId: undefined }]))
    ).toBeUndefined();
    expect(singleIdRef(criterion([ref], "EXCLUDES"))).toBeUndefined();
  });
});

describe("parseStoredSceneQuery", () => {
  it("a stored carousel rule with an unknown key still runs, and its ignored path is reported", () => {
    const parsed = parseStoredSceneQuery(
      {
        tags: { value: ["284"], modifier: "INCLUDES_ALL" },
        bogus: { value: 1 },
        performers: { value: ["1"], modifier: "SOMETIMES" },
      },
      "rating",
      "asc",
      { userId: USER_ID, perPage: 12 }
    );
    expect(parsed.filter).toEqual({
      tags: {
        refs: [{ id: "284", instanceId: undefined }],
        modifier: "INCLUDES_ALL",
        depth: 0,
      },
    });
    expect(parsed.sort).toEqual({
      field: "rating",
      direction: "ASC",
      seed: undefined,
    });
    expect(parsed.page).toBe(1);
    expect(parsed.perPage).toBe(12);
    expect(parsed.ignored).toEqual([
      { path: "rules.bogus", reason: "Unknown filter field" },
      {
        path: "rules.performers.modifier",
        reason: expect.any(String) as string,
      },
    ]);
  });

  it("a random sort takes the given seed, else the daily one; a bad sort or direction takes the default", () => {
    const seeded = parseStoredSceneQuery({}, "random", "DESC", {
      userId: USER_ID,
      randomSeed: 99,
    });
    expect(seeded.sort).toEqual({
      field: "random",
      direction: "DESC",
      seed: 99,
    });
    expect(
      parseStoredSceneQuery({}, "random", "DESC", { userId: USER_ID }).sort.seed
    ).toBe(generateDailySeed(USER_ID));
    const bad = parseStoredSceneQuery({}, "bogus", "up", { userId: USER_ID });
    expect(bad.sort).toEqual({
      field: "created_at",
      direction: "DESC",
      seed: undefined,
    });
    expect(paths(bad.ignored)).toEqual(["sort", "direction"]);
  });

  it("rules that are not an object give an empty filter with a record", () => {
    const parsed = parseStoredSceneQuery("x", "random", "DESC", {
      userId: USER_ID,
    });
    expect(parsed.filter).toEqual({});
    expect(parsed.ignored).toEqual([
      { path: "rules", reason: "Expected an object" },
    ]);
  });
});

describe("parseCarouselRequest", () => {
  const carouselOpts = () => ({
    userId: USER_ID,
    perPage: 12,
    randomSeed: 99,
  });

  it("reads the rules against the scene contract, with the carousel's page and seed", () => {
    const parsed = parseCarouselRequest(
      {
        rules: {
          tags: { value: ["284:a"], modifier: "INCLUDES_ALL" },
          instance_id: "a",
        },
        sort: "random",
        direction: "asc",
      },
      carouselOpts()
    );
    expect(parsed).toEqual({
      page: 1,
      perPage: 12,
      q: undefined,
      sort: { field: "random", direction: "ASC", seed: 99 },
      filter: {
        tags: {
          refs: [{ id: "284", instanceId: "a" }],
          modifier: "INCLUDES_ALL",
          depth: 0,
        },
      },
      specificInstanceId: "a",
    });
  });

  it("parts not sent stay out: no filter and the scene defaults", () => {
    const parsed = parseCarouselRequest({}, carouselOpts());
    expect(parsed.filter).toEqual({});
    expect(parsed.sort).toEqual({
      field: "created_at",
      direction: "DESC",
      seed: undefined,
    });
  });

  it("an unknown rule key, a bogus sort and direction sideways fail at their paths", () => {
    expect(
      paths(
        issuesOf(() =>
          parseCarouselRequest(
            {
              rules: { not_a_field: { value: 1 } },
              sort: "bogus",
              direction: "sideways",
            },
            carouselOpts()
          )
        )
      )
    ).toEqual(["rules.not_a_field", "sort", "direction"]);
  });

  it("a bad rules.ids or rules.instance_id fails at its path", () => {
    expect(
      paths(
        issuesOf(() =>
          parseCarouselRequest(
            { rules: { ids: { value: ["abc"] }, instance_id: "a b" } },
            carouselOpts()
          )
        )
      )
    ).toEqual(["rules.ids.value.0", "rules.instance_id"]);
  });

  it("rules that are not an object fail", () => {
    for (const rules of [null, [], "x"]) {
      expect(
        issuesOf(() => parseCarouselRequest({ rules }, carouselOpts()))
      ).toEqual([{ path: "rules", message: "Expected an object" }]);
    }
  });
});

describe("parseSimilarScenesRequest", () => {
  it("reads the scene id, the page and the seed's instance", () => {
    expect(
      parseSimilarScenesRequest(
        "42",
        { page: "3", instanceId: "inst-1" },
        opts()
      )
    ).toEqual({
      sceneId: "42",
      page: 3,
      instanceId: "inst-1",
    });
    expect(
      parseSimilarScenesRequest("42", { instanceId: "inst-1" }, opts())
    ).toEqual({
      sceneId: "42",
      page: 1,
      instanceId: "inst-1",
    });
    expect(
      parseSimilarScenesRequest(
        "42",
        { page: "0", instanceId: "inst-1" },
        opts()
      ).page
    ).toBe(1);
  });

  it("page abc and an unknown parameter are invalid", () => {
    expect(
      paths(
        issuesOf(() =>
          parseSimilarScenesRequest(
            "42",
            { page: "abc", per_page: "5", instanceId: "inst-1" },
            opts()
          )
        )
      )
    ).toEqual(["page", "per_page"]);
  });

  it("a missing instanceId fails: the seed is never guessed", () => {
    expect(
      issuesOf(() => parseSimilarScenesRequest("42", { page: "2" }, opts()))
    ).toEqual([{ path: "instanceId", message: "Required" }]);
  });

  it("a bad instanceId or scene id fails", () => {
    expect(
      paths(
        issuesOf(() =>
          parseSimilarScenesRequest("42", { instanceId: "inst 1" }, opts())
        )
      )
    ).toEqual(["instanceId"]);
    expect(
      issuesOf(() =>
        parseSimilarScenesRequest("s1", { instanceId: "inst-1" }, opts())
      )
    ).toEqual([{ path: "id", message: "Expected an id" }]);
  });
});

describe("parseRecommendedRequest", () => {
  it("reads page and per_page: 24 by default, held to 1..250", () => {
    expect(parseRecommendedRequest({}, opts())).toEqual({
      page: 1,
      perPage: 24,
    });
    expect(
      parseRecommendedRequest({ page: "2", per_page: "1000" }, opts())
    ).toEqual({ page: 2, perPage: PER_PAGE_MAX });
    expect(
      parseRecommendedRequest({ page: "-1", per_page: "0" }, opts())
    ).toEqual({ page: 1, perPage: 1 });
  });

  it("page abc and an unknown parameter are invalid", () => {
    expect(
      paths(
        issuesOf(() =>
          parseRecommendedRequest({ page: "abc", sort: "title" }, opts())
        )
      )
    ).toEqual(["page", "sort"]);
    expect(
      paths(
        issuesOf(() =>
          parseRecommendedRequest({ page: "abc", per_page: ["1", "2"] }, opts())
        )
      )
    ).toEqual(["page", "per_page"]);
  });

  it("a query that is not an object fails", () => {
    expect(issuesOf(() => parseRecommendedRequest("x", opts()))).toEqual([
      { path: "query", message: "Expected an object" },
    ]);
  });
});

describe("parsePlaylistItemsRequest", () => {
  /** The sort a request without one reads in: the playlist's own order */
  const POSITION = { field: "position", direction: "ASC", seed: undefined };

  it("without page and per_page, page 1 of 50: the list always pages", () => {
    expect(parsePlaylistItemsRequest({}, opts())).toEqual({
      paging: { page: 1, perPage: 50 },
      sort: POSITION,
    });
  });

  it("reads page and per_page: 50 by default, held to 1..100", () => {
    expect(
      parsePlaylistItemsRequest({ page: "2", per_page: "2" }, opts())
    ).toEqual({ paging: { page: 2, perPage: 2 }, sort: POSITION });
    expect(parsePlaylistItemsRequest({ page: "3" }, opts())).toEqual({
      paging: { page: 3, perPage: 50 },
      sort: POSITION,
    });
    expect(parsePlaylistItemsRequest({ per_page: "10" }, opts())).toEqual({
      paging: { page: 1, perPage: 10 },
      sort: POSITION,
    });
    expect(
      parsePlaylistItemsRequest({ page: "2", per_page: "500" }, opts())
    ).toEqual({ paging: { page: 2, perPage: 100 }, sort: POSITION });
    expect(
      parsePlaylistItemsRequest({ page: "-1", per_page: "0" }, opts())
    ).toEqual({ paging: { page: 1, perPage: 1 }, sort: POSITION });
  });

  it("no sort is position ASC", () => {
    expect(parsePlaylistItemsRequest({ page: "1" }, opts()).sort).toEqual(
      POSITION
    );
  });

  it("sort=title&direction=ASC parses", () => {
    expect(
      parsePlaylistItemsRequest(
        { page: "1", sort: "title", direction: "ASC" },
        opts()
      ).sort
    ).toEqual({ field: "title", direction: "ASC", seed: undefined });
    // A lower-case direction is read as the lists read it
    expect(
      parsePlaylistItemsRequest({ sort: "rating", direction: "desc" }, opts())
        .sort
    ).toEqual({ field: "rating", direction: "DESC", seed: undefined });
  });

  it("a sort or direction alone reads page 1 of 50, never the unpaged list", () => {
    expect(parsePlaylistItemsRequest({ sort: "title" }, opts()).paging).toEqual(
      { page: 1, perPage: 50 }
    );
    expect(
      parsePlaylistItemsRequest({ direction: "DESC" }, opts()).paging
    ).toEqual({ page: 1, perPage: 50 });
  });

  it("without a direction, position and added_at read ASC and a scene sort the scene list's default", () => {
    expect(
      parsePlaylistItemsRequest({ sort: "added_at" }, opts()).sort
    ).toEqual({ field: "added_at", direction: "ASC", seed: undefined });
    expect(
      parsePlaylistItemsRequest({ sort: "position" }, opts()).sort
    ).toEqual(POSITION);
    expect(parsePlaylistItemsRequest({ sort: "title" }, opts()).sort).toEqual({
      field: "title",
      direction: "DESC",
      seed: undefined,
    });
    expect(
      parsePlaylistItemsRequest({ direction: "DESC" }, opts()).sort
    ).toEqual({ field: "position", direction: "DESC", seed: undefined });
  });

  it("sort=random_42 keeps its seed", () => {
    expect(
      parsePlaylistItemsRequest({ sort: "random_42" }, opts()).sort
    ).toEqual({ field: "random", direction: "DESC", seed: 42 });
  });

  it("a bare random takes the user's daily seed", () => {
    expect(parsePlaylistItemsRequest({ sort: "random" }, opts()).sort).toEqual({
      field: "random",
      direction: "DESC",
      seed: generateDailySeed(USER_ID),
    });
  });

  it("sort=scene_index answers 400 Unknown sort", () => {
    expect(
      issuesOf(() => parsePlaylistItemsRequest({ sort: "scene_index" }, opts()))
    ).toEqual([{ path: "sort", message: "Unknown sort" }]);
    // The playlist's own order is `position`
    expect(
      issuesOf(() =>
        parsePlaylistItemsRequest({ sort: "playlist_position" }, opts())
      )
    ).toEqual([{ path: "sort", message: "Unknown sort" }]);
    expect(
      paths(
        issuesOf(() =>
          parsePlaylistItemsRequest(
            { sort: "toString", direction: "sideways" },
            opts()
          )
        )
      )
    ).toEqual(["sort", "direction"]);
  });

  it("page abc and an unknown parameter are invalid", () => {
    expect(
      paths(
        issuesOf(() =>
          parsePlaylistItemsRequest({ page: "abc", bogus: "1" }, opts())
        )
      )
    ).toEqual(["page", "bogus"]);
    expect(
      paths(
        issuesOf(() =>
          parsePlaylistItemsRequest({ page: ["1", "2"], per_page: "5" }, opts())
        )
      )
    ).toEqual(["page"]);
  });

  it("a query that is not an object fails", () => {
    expect(issuesOf(() => parsePlaylistItemsRequest("x", opts()))).toEqual([
      { path: "query", message: "Expected an object" },
    ]);
  });
});

describe("parsePlaylistQueueRequest", () => {
  it("reads sort and direction as the item page does; none is position ASC", () => {
    expect(parsePlaylistQueueRequest({}, opts())).toEqual({
      field: "position",
      direction: "ASC",
      seed: undefined,
    });
    expect(
      parsePlaylistQueueRequest({ sort: "title", direction: "ASC" }, opts())
    ).toEqual({ field: "title", direction: "ASC", seed: undefined });
    expect(parsePlaylistQueueRequest({ sort: "random_42" }, opts())).toEqual({
      field: "random",
      direction: "DESC",
      seed: 42,
    });
  });

  it("refuses paging, scene_index and unknown parameters", () => {
    expect(
      paths(
        issuesOf(() =>
          parsePlaylistQueueRequest(
            { page: "1", per_page: "50", sort: "scene_index", bogus: "1" },
            opts()
          )
        )
      )
    ).toEqual(["page", "per_page", "sort", "bogus"]);
  });
});

describe("PEEK_FILTER_POLICY", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("with no PEEK_FILTER_POLICY set, an unknown scene_filter key answers 400 naming its path", () => {
    vi.stubEnv("PEEK_FILTER_POLICY", undefined);
    const issues = issuesOf(() =>
      parseListRequest(
        "scene",
        { scene_filter: { bogus: { value: 1 } } },
        { userId: USER_ID }
      )
    );
    expect(paths(issues)).toEqual(["scene_filter.bogus"]);
  });

  it.each(["drop", "reject", "bogus"])(
    "the variable is dead: %s still answers 400",
    (policy) => {
      vi.stubEnv("PEEK_FILTER_POLICY", policy);
      expect(() =>
        parseListRequest("scene", { bogus: 1 }, { userId: USER_ID })
      ).toThrow(ValidationError);
    }
  );
});

describe("logIgnoredStoredRule", () => {
  beforeEach(() => {
    _resetLogThrottleForTesting();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns once per carousel and path, naming both and the reason", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const ignored = [
      { path: "rules.bogus", reason: "Unknown filter field" },
      { path: "sort", reason: "Unknown sort" },
    ];
    logIgnoredStoredRule("c1", ignored);
    logIgnoredStoredRule("c1", ignored);
    logIgnoredStoredRule("c2", ignored.slice(0, 1));
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenNthCalledWith(1, "Stored carousel rule ignored", {
      carouselId: "c1",
      path: "rules.bogus",
      reason: "Unknown filter field",
    });
    expect(warn).toHaveBeenNthCalledWith(3, "Stored carousel rule ignored", {
      carouselId: "c2",
      path: "rules.bogus",
      reason: "Unknown filter field",
    });
  });

  it("logs nothing for an empty list", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    logIgnoredStoredRule("c1", []);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("parsed types", () => {
  it("a ref field parses to a RefCriterion, and one with presence to a RefPresenceCriterion too", () => {
    expectTypeOf<ParsedFilter<"performer">["scenes"]>().toEqualTypeOf<
      RefCriterion | undefined
    >();
    expectTypeOf<ParsedFilter<"scene">["performers"]>().toEqualTypeOf<
      RefCriterion | RefPresenceCriterion | undefined
    >();
    expectTypeOf<ParsedFilter<"scene">["favorite"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<ParsedFilter<"tag">>().toHaveProperty("scenes");
    expectTypeOf<ParsedFilter<"scene">>().not.toHaveProperty("instance_id");
    expectTypeOf<ParsedFilter<"scene">["playlists"]>().toEqualTypeOf<
      PlaylistCriterion | undefined
    >();
  });
});
