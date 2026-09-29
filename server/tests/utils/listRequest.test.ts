/**
 * The one validated parser for list, clip, minimal and stored carousel
 * requests (item 38). Unknown or invalid input is answered with 400 in
 * `reject` mode and ignored with a record in `drop` mode; a body that is not
 * an object is a 400 in both.
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
  FilterPolicy,
  ParsedFilter,
  RefCriterion,
} from "../../types/parsedFilters.js";
import {
  filterPolicy,
  logDropped,
  parseCarouselRequest,
  parseClipQuery,
  parseListRequest,
  parseMinimalRequest,
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
const POLICIES: readonly FilterPolicy[] = ["drop", "reject"];

const opts = (policy: FilterPolicy) => ({ userId: USER_ID, policy });

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
  it.each(POLICIES)(
    "clamps page below 1 to 1 and per_page to 1..250; absent per_page is 40 (%s)",
    (policy) => {
      const low = parseListRequest(
        "scene",
        { filter: { page: 0, per_page: -5 } },
        opts(policy)
      );
      expect(low.page).toBe(1);
      expect(low.perPage).toBe(1);
      expect(low.dropped).toEqual([]);

      const high = parseListRequest(
        "scene",
        { filter: { page: -1, per_page: 1000 } },
        opts(policy)
      );
      expect(high.page).toBe(1);
      expect(high.perPage).toBe(PER_PAGE_MAX);

      const absent = parseListRequest("scene", {}, opts(policy));
      expect(absent.page).toBe(1);
      expect(absent.perPage).toBe(40);
      expect(absent.q).toBeUndefined();
      expect(absent.filter).toEqual({});
      expect(absent.specificInstanceId).toBeUndefined();
    }
  );

  it("absent per_page is 24 for clips and 50 for minimal requests", () => {
    expect(parseClipQuery({}, opts("reject")).perPage).toBe(24);
    expect(parseMinimalRequest("performer", {}, opts("reject")).perPage).toBe(
      50
    );
  });

  it("a non-numeric page or per_page fails naming filter.per_page (reject)", () => {
    const issues = issuesOf(() =>
      parseListRequest(
        "scene",
        { filter: { page: "abc", per_page: "many" } },
        opts("reject")
      )
    );
    expect(paths(issues)).toEqual(["filter.page", "filter.per_page"]);
  });

  it("a non-numeric page or per_page takes the default and records the drop (drop)", () => {
    const parsed = parseListRequest(
      "scene",
      { filter: { page: "abc", per_page: "many" } },
      opts("drop")
    );
    expect(parsed.page).toBe(1);
    expect(parsed.perPage).toBe(40);
    expect(paths(parsed.dropped)).toEqual(["filter.page", "filter.per_page"]);
  });

  it("numeric strings are read as numbers", () => {
    const parsed = parseListRequest(
      "scene",
      { filter: { page: "3", per_page: "25" } },
      opts("reject")
    );
    expect(parsed.page).toBe(3);
    expect(parsed.perPage).toBe(25);
  });

  it("q is trimmed; empty is undefined; over 200 characters is invalid", () => {
    expect(
      parseListRequest("scene", { filter: { q: "  hello " } }, opts("reject")).q
    ).toBe("hello");
    expect(
      parseListRequest("scene", { filter: { q: "   " } }, opts("reject")).q
    ).toBeUndefined();
    const long = "x".repeat(201);
    expect(
      paths(
        issuesOf(() =>
          parseListRequest("scene", { filter: { q: long } }, opts("reject"))
        )
      )
    ).toEqual(["filter.q"]);
    const dropped = parseListRequest(
      "scene",
      { filter: { q: long } },
      opts("drop")
    );
    expect(dropped.q).toBeUndefined();
    expect(paths(dropped.dropped)).toEqual(["filter.q"]);
  });

  it("an unknown key in filter is invalid", () => {
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { filter: { per_pages: 10 } },
            opts("reject")
          )
        )
      )
    ).toEqual(["filter.per_pages"]);
  });
});

describe("parseListRequest: sort", () => {
  it("only the entity's sort keys pass; constructor and __proto__ fall back to the default sort (drop)", () => {
    const ok = parseListRequest(
      "scene",
      { filter: { sort: "duration" } },
      opts("drop")
    );
    expect(ok.sort).toEqual({
      field: "duration",
      direction: "DESC",
      seed: undefined,
    });

    for (const sort of ["constructor", "__proto__", "name"]) {
      const parsed = parseListRequest(
        "scene",
        { filter: { sort } },
        opts("drop")
      );
      expect(parsed.sort).toEqual({
        field: "created_at",
        direction: "DESC",
        seed: undefined,
      });
      expect(paths(parsed.dropped)).toEqual(["filter.sort"]);
    }
  });

  it("constructor and __proto__ fail naming filter.sort (reject)", () => {
    for (const sort of ["constructor", "__proto__"]) {
      const issues = issuesOf(() =>
        parseListRequest("scene", { filter: { sort } }, opts("reject"))
      );
      expect(paths(issues)).toEqual(["filter.sort"]);
    }
  });

  it("each list has its own default sort and direction", () => {
    expect(parseListRequest("performer", {}, opts("reject")).sort).toEqual({
      field: "name",
      direction: "ASC",
      seed: undefined,
    });
    expect(parseListRequest("gallery", {}, opts("reject")).sort.field).toBe(
      "title"
    );
  });

  it("random_123 gives sort random with seed 123; random gets the daily seed; random_abc is invalid", () => {
    const seeded = parseListRequest(
      "scene",
      { filter: { sort: "random_123" } },
      opts("reject")
    );
    expect(seeded.sort).toEqual({
      field: "random",
      direction: "DESC",
      seed: 123,
    });

    const daily = parseListRequest(
      "scene",
      { filter: { sort: "random" } },
      opts("reject")
    );
    expect(daily.sort.field).toBe("random");
    expect(daily.sort.seed).toBe(generateDailySeed(USER_ID));

    const large = parseListRequest(
      "performer",
      { filter: { sort: "random_123456789012" } },
      opts("reject")
    );
    expect(large.sort.seed).toBe(123456789012 % 1e8);

    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { filter: { sort: "random_abc" } },
            opts("reject")
          )
        )
      )
    ).toEqual(["filter.sort"]);
    const dropped = parseListRequest(
      "scene",
      { filter: { sort: "random_abc" } },
      opts("drop")
    );
    expect(dropped.sort.field).toBe("created_at");
    expect(paths(dropped.dropped)).toEqual(["filter.sort"]);
  });

  it("direction asc is ASC; sideways is invalid", () => {
    expect(
      parseListRequest(
        "scene",
        { filter: { direction: "asc" } },
        opts("reject")
      ).sort.direction
    ).toBe("ASC");
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { filter: { direction: "sideways" } },
            opts("reject")
          )
        )
      )
    ).toEqual(["filter.direction"]);
    const dropped = parseListRequest(
      "scene",
      { filter: { direction: "sideways" } },
      opts("drop")
    );
    expect(dropped.sort.direction).toBe("DESC");
    expect(paths(dropped.dropped)).toEqual(["filter.direction"]);
  });
});

describe("parseListRequest: filter fields", () => {
  it("an unknown scene_filter key is dropped with its path (drop)", () => {
    const parsed = parseListRequest(
      "scene",
      {
        scene_filter: {
          bogus: { value: 1 },
          title: { value: "a", modifier: "INCLUDES" },
        },
      },
      opts("drop")
    );
    expect(parsed.filter).toEqual({
      title: { modifier: "INCLUDES", value: "a" },
    });
    expect(parsed.dropped).toEqual([
      { path: "scene_filter.bogus", reason: "Unknown filter field" },
    ]);
  });

  it("an unknown scene_filter key fails with its path (reject)", () => {
    const issues = issuesOf(() =>
      parseListRequest(
        "scene",
        { scene_filter: { bogus: { value: 1 } } },
        opts("reject")
      )
    );
    expect(issues).toEqual([
      { path: "scene_filter.bogus", message: "Unknown filter field" },
    ]);
  });

  it("an unknown top-level key and another entity's filter key are invalid", () => {
    const issues = issuesOf(() =>
      parseListRequest(
        "scene",
        { performer_filter: {}, extra: 1 },
        opts("reject")
      )
    );
    expect(paths(issues)).toEqual(["performer_filter", "extra"]);
  });

  const unknownModifiers = {
    scene_filter: {
      performers: { value: ["1:default"], modifier: "SOMETIMES" },
      title: { value: "x", modifier: "SOMETIMES" },
    },
  };

  it("an unknown modifier drops its whole criterion (drop)", () => {
    const parsed = parseListRequest("scene", unknownModifiers, opts("drop"));
    expect(parsed.filter).toEqual({});
    expect(paths(parsed.dropped)).toEqual([
      "scene_filter.performers.modifier",
      "scene_filter.title.modifier",
    ]);
  });

  it("an unknown modifier fails naming it (reject)", () => {
    expect(
      paths(
        issuesOf(() =>
          parseListRequest("scene", unknownModifiers, opts("reject"))
        )
      )
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
            opts("reject")
          )
        )
      )
    ).toEqual(["scene_filter.studios.modifier"]);
  });

  it("a null modifier takes the field's default", () => {
    const performer = parseListRequest(
      "performer",
      { performer_filter: { tags: { value: ["3:default"], modifier: null } } },
      opts("reject")
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
      opts("reject")
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
      opts("reject")
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

  it("1:bad id and abc are invalid refs; 1,001 values are invalid (reject)", () => {
    expect(
      paths(issuesOf(() => parseListRequest("scene", badRefs, opts("reject"))))
    ).toEqual([
      "scene_filter.performers.value.0",
      "scene_filter.performers.value.1",
    ]);
    expect(
      paths(
        issuesOf(() => parseListRequest("scene", tooManyRefs, opts("reject")))
      )
    ).toEqual(["scene_filter.tags.value"]);
  });

  it("1:bad id and abc are invalid refs; 1,001 values are invalid (drop)", () => {
    const parsedBad = parseListRequest("scene", badRefs, opts("drop"));
    expect(parsedBad.filter.performers).toBeUndefined();
    expect(paths(parsedBad.dropped)).toEqual([
      "scene_filter.performers.value.0",
      "scene_filter.performers.value.1",
    ]);
    const parsedMany = parseListRequest("scene", tooManyRefs, opts("drop"));
    expect(parsedMany.filter.tags).toBeUndefined();
    expect(paths(parsedMany.dropped)).toEqual(["scene_filter.tags.value"]);
  });

  it("1,000 values pass", () => {
    const parsed = parseListRequest(
      "scene",
      {
        scene_filter: {
          tags: { value: Array.from({ length: 1000 }, (_, i) => `${i + 1}`) },
        },
      },
      opts("reject")
    );
    expect(parsed.filter.tags?.refs).toHaveLength(1000);
  });

  it("top-level ids become filter.ids INCLUDES", () => {
    const parsed = parseListRequest(
      "scene",
      { ids: ["5:default", "6"] },
      opts("reject")
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
        issuesOf(() =>
          parseListRequest("scene", { ids: ["nope"] }, opts("reject"))
        )
      )
    ).toEqual(["ids.0"]);
  });

  it("top-level ids join an INCLUDES scene_filter.ids and conflict with an EXCLUDES one", () => {
    const joined = parseListRequest(
      "scene",
      { ids: ["5"], scene_filter: { ids: { value: ["6"] } } },
      opts("reject")
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
            opts("reject")
          )
        )
      )
    ).toEqual(["ids"]);
  });

  it("instance_id becomes specificInstanceId and must match INSTANCE_ID_PATTERN", () => {
    const parsed = parseListRequest(
      "scene",
      { scene_filter: { instance_id: "stash-2" } },
      opts("reject")
    );
    expect(parsed.specificInstanceId).toBe("stash-2");
    expect(parsed.filter).toEqual({});
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { scene_filter: { instance_id: "bad id!" } },
            opts("reject")
          )
        )
      )
    ).toEqual(["scene_filter.instance_id"]);
    // Not dropped either: the lookup would widen to every instance
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { scene_filter: { instance_id: "bad id!" } },
            opts("drop")
          )
        )
      )
    ).toEqual(["scene_filter.instance_id"]);
  });

  it("drop mode still refuses a bad id: ignoring it would answer a lookup with the whole list", () => {
    const refused = (body: unknown) =>
      paths(issuesOf(() => parseListRequest("performer", body, opts("drop"))));

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
    // Other bad input is still dropped
    const dropped = parseListRequest(
      "performer",
      { ids: ["5"], performer_filter: { tags: { value: ["abc"] } } },
      opts("drop")
    );
    expect(dropped.filter.ids?.refs).toEqual([
      { id: "5", instanceId: undefined },
    ]);
    expect(paths(dropped.dropped)).toEqual(["performer_filter.tags.value.0"]);
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
      opts("reject")
    );
    expect(parsed.filter.tags?.depth).toBe(-1);
    expect(parsed.filter.studios?.depth).toBe(2);
    expect(parsed.filter.performers).toEqual({
      refs: [{ id: "3", instanceId: undefined }],
      modifier: "INCLUDES",
      depth: 0,
    });
    expect(parsed.filter.groups?.depth).toBe(0);
    expect(parsed.dropped).toEqual([]);
    expect(
      parseListRequest(
        "scene",
        { scene_filter: { tags: { value: ["1"], depth: null } } },
        opts("reject")
      ).filter.tags?.depth
    ).toBe(0);
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { scene_filter: { tags: { value: ["1"], depth: -2 } } },
            opts("reject")
          )
        )
      )
    ).toEqual(["scene_filter.tags.depth"]);
  });

  it("BETWEEN with one bound is invalid; IS_NULL needs no value; an all-empty criterion is omitted with no record", () => {
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { scene_filter: { rating100: { modifier: "BETWEEN", value: 10 } } },
            opts("reject")
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
      opts("reject")
    );
    expect(parsed.filter).toEqual({
      rating100: { modifier: "BETWEEN", value: 10, value2: 20 },
      director: { modifier: "IS_NULL" },
      date: { modifier: "NOT_NULL" },
      title: { modifier: "IS_NULL" },
    });
    expect(parsed.dropped).toEqual([]);
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
        opts("reject")
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
      opts("reject")
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
            opts("reject")
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
      opts("reject")
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
        opts("reject")
      )
    );
    expect(paths(issues)).toEqual([
      "performer_filter.name.value",
      "performer_filter.hair_color.value",
      "performer_filter.eye_color.modifier",
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
      opts("reject")
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
        opts("reject")
      )
    );
    expect(paths(issues)).toEqual(["performer_filter.gender.value"]);
  });

  it("booleans stay boolean; a string is invalid", () => {
    const parsed = parseListRequest(
      "scene",
      { scene_filter: { favorite: true, organized: false } },
      opts("reject")
    );
    expect(parsed.filter).toEqual({ favorite: true, organized: false });
    expect(
      paths(
        issuesOf(() =>
          parseListRequest(
            "scene",
            { scene_filter: { favorite: "true" } },
            opts("reject")
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
      opts("reject")
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
        opts("reject")
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
            opts("reject")
          )
        )
      )
    ).toEqual(["tag_filter.scenes_filter"]);
  });

  it.each(POLICIES)("a body that is not an object fails (%s)", (policy) => {
    for (const body of ["scenes", null, 3, ["a"]]) {
      const issues = issuesOf(() =>
        parseListRequest("scene", body, opts(policy))
      );
      expect(issues).toEqual([{ path: "body", message: "Expected an object" }]);
    }
  });

  it("a filter object that is not an object is invalid, and null is absent", () => {
    expect(
      paths(
        issuesOf(() =>
          parseListRequest("scene", { scene_filter: [] }, opts("reject"))
        )
      )
    ).toEqual(["scene_filter"]);
    expect(
      paths(
        issuesOf(() =>
          parseListRequest("scene", { filter: "x" }, opts("reject"))
        )
      )
    ).toEqual(["filter"]);
    const parsed = parseListRequest(
      "scene",
      { filter: null, scene_filter: null, ids: null },
      opts("reject")
    );
    expect(parsed.filter).toEqual({});
    expect(parsed.dropped).toEqual([]);
  });
});

describe("parseClipQuery", () => {
  it("query strings coerce: perPage '1000' gives 250; page below 1 is 1", () => {
    const parsed = parseClipQuery(
      { page: "0", perPage: "1000" },
      opts("reject")
    );
    expect(parsed.page).toBe(1);
    expect(parsed.perPage).toBe(PER_PAGE_MAX);
    expect(parsed.sort).toEqual({
      field: "stashCreatedAt",
      direction: "DESC",
      seed: undefined,
    });
    expect(parsed.filter).toEqual({ isGenerated: true });
    expect(parsed.q).toBeUndefined();
    expect(parsed.specificInstanceId).toBeUndefined();
    expect(parsed.dropped).toEqual([]);
  });

  it("sortBy is whitelisted and sortDir is asc or desc", () => {
    const parsed = parseClipQuery(
      { sortBy: "seconds", sortDir: "asc" },
      opts("reject")
    );
    expect(parsed.sort).toEqual({
      field: "seconds",
      direction: "ASC",
      seed: undefined,
    });
    expect(
      parseClipQuery({ sortBy: "random_42" }, opts("reject")).sort
    ).toEqual({ field: "random", direction: "DESC", seed: 42 });
    expect(
      paths(
        issuesOf(() =>
          parseClipQuery(
            { sortBy: "created_at", sortDir: "sideways", perPage: "abc" },
            opts("reject")
          )
        )
      )
    ).toEqual(["sortBy", "sortDir", "perPage"]);
    const dropped = parseClipQuery(
      { sortBy: "created_at", sortDir: "sideways", perPage: "abc" },
      opts("drop")
    );
    expect(dropped.perPage).toBe(24);
    expect(dropped.sort.field).toBe("stashCreatedAt");
    expect(paths(dropped.dropped)).toEqual(["sortBy", "sortDir", "perPage"]);
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
      opts("reject")
    );
    expect(parsed.filter).toEqual({
      tagIds: {
        refs: [
          { id: "1", instanceId: "default" },
          { id: "2", instanceId: undefined },
        ],
        modifier: "EXCLUDES",
        depth: 0,
      },
      sceneTagIds: {
        refs: [{ id: "3", instanceId: undefined }],
        modifier: "INCLUDES",
        depth: 0,
      },
      performerIds: {
        refs: [{ id: "4", instanceId: "default" }],
        modifier: "INCLUDES_ALL",
        depth: 0,
      },
      studioId: {
        refs: [{ id: "5", instanceId: "default" }],
        modifier: "INCLUDES",
        depth: 0,
      },
      sceneId: {
        refs: [{ id: "6", instanceId: undefined }],
        modifier: "INCLUDES",
        depth: 0,
      },
      isGenerated: false,
    });
    expect(parsed.q).toBe("intro");
    expect(parsed.specificInstanceId).toBe("default");
  });

  it("an unknown modifier drops the criterion; a bad ref, a modifier for a single ref, an unknown key and a repeated key are invalid", () => {
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
        opts("reject")
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
    const dropped = parseClipQuery(
      { tagIds: "1", tagIdsModifier: "SOMETIMES", isGenerated: "maybe" },
      opts("drop")
    );
    expect(dropped.filter).toEqual({ isGenerated: true });
    expect(paths(dropped.dropped)).toEqual(["tagIdsModifier", "isGenerated"]);
  });

  it("an empty ref list is omitted; a query that is not an object fails", () => {
    const parsed = parseClipQuery({ tagIds: " , " }, opts("reject"));
    expect(parsed.filter).toEqual({ isGenerated: true });
    expect(issuesOf(() => parseClipQuery("x", opts("reject")))).toEqual([
      { path: "query", message: "Expected an object" },
    ]);
  });
  it.each([
    { query: { sceneId: "abc" }, path: "sceneId.0" },
    { query: { instanceId: "bad id!" }, path: "instanceId" },
  ])(
    "drop mode still refuses a bad $path: ignoring it would list every clip",
    ({ query, path }) => {
      expect(
        paths(issuesOf(() => parseClipQuery(query, opts("drop"))))
      ).toEqual([path]);
    }
  );
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
      opts("reject")
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
      dropped: [],
    });
    expect(parseMinimalRequest("tag", {}, opts("reject"))).toEqual({
      entity: "tag",
      q: undefined,
      perPage: 50,
      ids: undefined,
      countFilter: undefined,
      dropped: [],
    });
    expect(
      parseMinimalRequest("tag", { filter: { per_page: 0 } }, opts("reject"))
        .perPage
    ).toBe(1);
    // An empty list names nothing to look up: no ids filter
    expect(
      parseMinimalRequest("studio", { ids: [] }, opts("reject")).ids
    ).toBeUndefined();
  });

  it("sort, direction and page are unknown fields: the pickers list one page in name order", () => {
    const issues = issuesOf(() =>
      parseMinimalRequest(
        "performer",
        { filter: { sort: "name", direction: "ASC", page: 1 } },
        opts("reject")
      )
    );
    expect(paths(issues)).toEqual([
      "filter.sort",
      "filter.direction",
      "filter.page",
    ]);
    const dropped = parseMinimalRequest(
      "performer",
      { filter: { sort: "rating", direction: "DESC", q: "x" } },
      opts("drop")
    );
    expect(dropped.q).toBe("x");
    expect(paths(dropped.dropped)).toEqual(["filter.sort", "filter.direction"]);
  });

  it("a negative count, an unknown count key and an unknown body key are invalid", () => {
    const issues = issuesOf(() =>
      parseMinimalRequest(
        "performer",
        {
          count_filter: { min_scene_count: -1, min_tag_count: 1 },
          performer_filter: {},
        },
        opts("reject")
      )
    );
    expect(paths(issues)).toEqual([
      "count_filter.min_scene_count",
      "count_filter.min_tag_count",
      "performer_filter",
    ]);
    const dropped = parseMinimalRequest(
      "performer",
      { count_filter: { min_tag_count: 1 } },
      opts("drop")
    );
    expect(dropped.countFilter).toBeUndefined();
    expect(paths(dropped.dropped)).toEqual(["count_filter.min_tag_count"]);
  });

  it.each(POLICIES)(
    "ids that are not ids, or more than 100 of them, fail in both policies (%s)",
    (policy) => {
      expect(
        paths(
          issuesOf(() =>
            parseMinimalRequest(
              "tag",
              { ids: ["12:inst-a", "abc", "7:bad instance"] },
              opts(policy)
            )
          )
        )
      ).toEqual(["ids.1", "ids.2"]);
      const tooMany = Array.from({ length: 101 }, (_, i) => String(i + 1));
      expect(
        paths(
          issuesOf(() =>
            parseMinimalRequest("tag", { ids: tooMany }, opts(policy))
          )
        )
      ).toEqual(["ids"]);
      expect(
        paths(
          issuesOf(() =>
            parseMinimalRequest("tag", { ids: "12" }, opts(policy))
          )
        )
      ).toEqual(["ids"]);
      expect(
        parseMinimalRequest(
          "tag",
          { ids: Array.from({ length: 100 }, (_, i) => String(i + 1)) },
          opts(policy)
        ).ids
      ).toHaveLength(100);
    }
  );

  it.each(POLICIES)("a body that is not an object fails (%s)", (policy) => {
    expect(
      issuesOf(() => parseMinimalRequest("studio", 1, opts(policy)))
    ).toEqual([{ path: "body", message: "Expected an object" }]);
  });

  it("reads scope allEnabled; no scope is the user's own instances", () => {
    expect(
      parseMinimalRequest("tag", { scope: "allEnabled" }, opts("reject")).scope
    ).toBe("allEnabled");
    expect(
      parseMinimalRequest("tag", {}, opts("reject")).scope
    ).toBeUndefined();
    expect(
      parseMinimalRequest("tag", { scope: null }, opts("reject")).scope
    ).toBeUndefined();
  });

  it.each(POLICIES)(
    "any other scope fails in both policies: it names the instances the request looks in (%s)",
    (policy) => {
      for (const scope of ["all", "ALLENABLED", "", 1, true, ["allEnabled"]]) {
        expect(
          issuesOf(() => parseMinimalRequest("tag", { scope }, opts(policy)))
        ).toEqual([{ path: "scope", message: 'Expected "allEnabled"' }]);
      }
    }
  );
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
      opts("reject")
    );
    expect(parsed.filter).toEqual({
      birthdate: { modifier: "IS_NULL" },
      death_date: { modifier: "NOT_NULL" },
      height: { modifier: "GREATER_THAN", value: 170 },
    });
  });

  it("still leaves a comparison without its value", () => {
    const issues = issuesOf(() =>
      parseListRequest(
        "performer",
        {
          performer_filter: {
            birthdate: { value: "", value2: "2000-01-01", modifier: "BETWEEN" },
          },
        },
        opts("reject")
      )
    );
    expect(issues).toEqual([
      { path: "performer_filter.birthdate.value", message: "Required" },
    ]);
  });
});

describe("parseSceneClipsRequest", () => {
  it("reads the scene id, includeUngenerated and instanceId", () => {
    expect(
      parseSceneClipsRequest(
        "42",
        { includeUngenerated: "true", instanceId: "inst-1" },
        opts("reject")
      )
    ).toEqual({
      sceneId: "42",
      includeUngenerated: true,
      specificInstanceId: "inst-1",
      dropped: [],
    });
    expect(parseSceneClipsRequest("42", {}, opts("reject"))).toEqual({
      sceneId: "42",
      includeUngenerated: false,
      specificInstanceId: undefined,
      dropped: [],
    });
  });

  it("a bad value and an unknown parameter are invalid, or dropped", () => {
    const query = { includeUngenerated: "yes", page: "2" };
    expect(
      paths(
        issuesOf(() =>
          parseSceneClipsRequest(
            "42",
            { ...query, instanceId: "inst 1" },
            opts("reject")
          )
        )
      )
    ).toEqual(["includeUngenerated", "page", "instanceId"]);

    const dropped = parseSceneClipsRequest("42", query, opts("drop"));
    expect(dropped.includeUngenerated).toBe(false);
    expect(paths(dropped.dropped)).toEqual(["includeUngenerated", "page"]);
  });

  it("drop mode still refuses a bad instanceId: the scene's clips would come from every instance", () => {
    expect(
      paths(
        issuesOf(() =>
          parseSceneClipsRequest("42", { instanceId: "inst 1" }, opts("drop"))
        )
      )
    ).toEqual(["instanceId"]);
  });

  it.each(POLICIES)(
    "a scene id that is not a Stash id fails (%s)",
    (policy) => {
      expect(
        issuesOf(() => parseSceneClipsRequest("scene-1", {}, opts(policy)))
      ).toEqual([{ path: "id", message: "Expected an id" }]);
    }
  );
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
  const original = process.env.PEEK_FILTER_POLICY;
  afterEach(() => {
    if (original === undefined) delete process.env.PEEK_FILTER_POLICY;
    else process.env.PEEK_FILTER_POLICY = original;
  });

  it.each(POLICIES)(
    "stored carousel rules parse in drop mode whatever the policy (%s)",
    (policy) => {
      process.env.PEEK_FILTER_POLICY = policy;
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
      expect(paths(parsed.dropped)).toEqual([
        "rules.bogus",
        "rules.performers.modifier",
      ]);
    }
  );

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
    expect(paths(bad.dropped)).toEqual(["sort", "direction"]);
  });

  it("rules that are not an object give an empty filter with a record", () => {
    const parsed = parseStoredSceneQuery("x", "random", "DESC", {
      userId: USER_ID,
    });
    expect(parsed.filter).toEqual({});
    expect(parsed.dropped).toEqual([
      { path: "rules", reason: "Expected an object" },
    ]);
  });
});

describe("parseCarouselRequest", () => {
  const carouselOpts = (policy: FilterPolicy) => ({
    userId: USER_ID,
    policy,
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
      carouselOpts("reject")
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
      dropped: [],
    });
  });

  it("parts not sent stay out: no filter and the scene defaults", () => {
    const parsed = parseCarouselRequest({}, carouselOpts("reject"));
    expect(parsed.filter).toEqual({});
    expect(parsed.sort).toEqual({
      field: "created_at",
      direction: "DESC",
      seed: undefined,
    });
  });

  it("an unknown rule key, a bogus sort and direction sideways fail at their paths (reject)", () => {
    expect(
      paths(
        issuesOf(() =>
          parseCarouselRequest(
            {
              rules: { not_a_field: { value: 1 } },
              sort: "bogus",
              direction: "sideways",
            },
            carouselOpts("reject")
          )
        )
      )
    ).toEqual(["rules.not_a_field", "sort", "direction"]);
  });

  it("the same input is dropped with records (drop)", () => {
    const parsed = parseCarouselRequest(
      {
        rules: { not_a_field: { value: 1 }, favorite: true },
        sort: "constructor",
        direction: "DESC",
      },
      carouselOpts("drop")
    );
    expect(parsed.filter).toEqual({ favorite: true });
    expect(parsed.sort.field).toBe("created_at");
    expect(paths(parsed.dropped)).toEqual(["rules.not_a_field", "sort"]);
  });

  it("drop mode still refuses a bad rules.ids or rules.instance_id", () => {
    expect(
      paths(
        issuesOf(() =>
          parseCarouselRequest(
            { rules: { ids: { value: ["abc"] }, instance_id: "a b" } },
            carouselOpts("drop")
          )
        )
      )
    ).toEqual(["rules.ids.value.0", "rules.instance_id"]);
  });

  it.each(POLICIES)("rules that are not an object fail (%s)", (policy) => {
    for (const rules of [null, [], "x"]) {
      expect(
        issuesOf(() => parseCarouselRequest({ rules }, carouselOpts(policy)))
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
        opts("reject")
      )
    ).toEqual({
      sceneId: "42",
      page: 3,
      specificInstanceId: "inst-1",
      dropped: [],
    });
    expect(parseSimilarScenesRequest("42", {}, opts("reject"))).toEqual({
      sceneId: "42",
      page: 1,
      specificInstanceId: undefined,
      dropped: [],
    });
    expect(
      parseSimilarScenesRequest("42", { page: "0" }, opts("reject")).page
    ).toBe(1);
  });

  it("page abc and an unknown parameter are invalid, or dropped", () => {
    expect(
      paths(
        issuesOf(() =>
          parseSimilarScenesRequest(
            "42",
            { page: "abc", per_page: "5" },
            opts("reject")
          )
        )
      )
    ).toEqual(["page", "per_page"]);
    const dropped = parseSimilarScenesRequest(
      "42",
      { page: "abc", per_page: "5" },
      opts("drop")
    );
    expect(dropped.page).toBe(1);
    expect(paths(dropped.dropped)).toEqual(["page", "per_page"]);
  });

  it.each(POLICIES)(
    "a bad instanceId or scene id fails: the seed would be guessed (%s)",
    (policy) => {
      expect(
        paths(
          issuesOf(() =>
            parseSimilarScenesRequest(
              "42",
              { instanceId: "inst 1" },
              opts(policy)
            )
          )
        )
      ).toEqual(["instanceId"]);
      expect(
        issuesOf(() => parseSimilarScenesRequest("s1", {}, opts(policy)))
      ).toEqual([{ path: "id", message: "Expected an id" }]);
    }
  );
});

describe("parseRecommendedRequest", () => {
  it("reads page and per_page: 24 by default, held to 1..250", () => {
    expect(parseRecommendedRequest({}, opts("reject"))).toEqual({
      page: 1,
      perPage: 24,
      dropped: [],
    });
    expect(
      parseRecommendedRequest({ page: "2", per_page: "1000" }, opts("reject"))
    ).toEqual({ page: 2, perPage: PER_PAGE_MAX, dropped: [] });
    expect(
      parseRecommendedRequest({ page: "-1", per_page: "0" }, opts("reject"))
    ).toEqual({ page: 1, perPage: 1, dropped: [] });
  });

  it("page abc and an unknown parameter are invalid, or dropped", () => {
    expect(
      paths(
        issuesOf(() =>
          parseRecommendedRequest(
            { page: "abc", sort: "title" },
            opts("reject")
          )
        )
      )
    ).toEqual(["page", "sort"]);
    const dropped = parseRecommendedRequest(
      { page: "abc", per_page: ["1", "2"] },
      opts("drop")
    );
    expect(dropped).toEqual({
      page: 1,
      perPage: 24,
      dropped: [
        { path: "page", reason: "Expected a number" },
        { path: "per_page", reason: "Expected a number" },
      ],
    });
  });

  it.each(POLICIES)("a query that is not an object fails (%s)", (policy) => {
    expect(issuesOf(() => parseRecommendedRequest("x", opts(policy)))).toEqual([
      { path: "query", message: "Expected an object" },
    ]);
  });
});

describe("filterPolicy", () => {
  const original = process.env.PEEK_FILTER_POLICY;
  afterEach(() => {
    if (original === undefined) delete process.env.PEEK_FILTER_POLICY;
    else process.env.PEEK_FILTER_POLICY = original;
  });

  it("is reject only when PEEK_FILTER_POLICY says so, else drop", () => {
    process.env.PEEK_FILTER_POLICY = "reject";
    expect(filterPolicy()).toBe("reject");
    process.env.PEEK_FILTER_POLICY = "drop";
    expect(filterPolicy()).toBe("drop");
    process.env.PEEK_FILTER_POLICY = "bogus";
    expect(filterPolicy()).toBe("drop");
    delete process.env.PEEK_FILTER_POLICY;
    expect(filterPolicy()).toBe("drop");
  });

  it("parseListRequest reads it when no policy is given", () => {
    process.env.PEEK_FILTER_POLICY = "reject";
    expect(() =>
      parseListRequest("scene", { bogus: 1 }, { userId: USER_ID })
    ).toThrow(ValidationError);
    process.env.PEEK_FILTER_POLICY = "drop";
    expect(
      paths(
        parseListRequest("scene", { bogus: 1 }, { userId: USER_ID }).dropped
      )
    ).toEqual(["bogus"]);
  });
});

describe("logDropped", () => {
  beforeEach(() => {
    _resetLogThrottleForTesting();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns once per route and path, naming both and the reason", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const dropped = [
      { path: "scene_filter.bogus", reason: "Unknown filter field" },
      { path: "filter.sort", reason: "Unknown sort" },
    ];
    logDropped("POST /library/scenes", dropped);
    logDropped("POST /library/scenes", dropped);
    logDropped("POST /library/images", dropped.slice(0, 1));
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenNthCalledWith(1, "Unknown filter input ignored", {
      route: "POST /library/scenes",
      path: "scene_filter.bogus",
      reason: "Unknown filter field",
    });
    expect(warn).toHaveBeenNthCalledWith(3, "Unknown filter input ignored", {
      route: "POST /library/images",
      path: "scene_filter.bogus",
      reason: "Unknown filter field",
    });
  });

  it("logs nothing for an empty list", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    logDropped("POST /library/scenes", []);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("parsed types", () => {
  it("a ref field parses to a RefCriterion", () => {
    expectTypeOf<ParsedFilter<"scene">["performers"]>().toEqualTypeOf<
      RefCriterion | undefined
    >();
    expectTypeOf<ParsedFilter<"scene">["favorite"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<ParsedFilter<"tag">>().toHaveProperty("scenes");
    expectTypeOf<ParsedFilter<"scene">>().not.toHaveProperty("instance_id");
  });
});
