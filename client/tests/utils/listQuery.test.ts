import { DEFAULT_SORT } from "@peek/shared-types";
import { describe, expect, it } from "vitest";
import { SCENE_FILTER_OPTIONS, buildSceneFilter } from "@/utils/filterConfig";
import {
  type ListQueryState,
  buildListQuery,
  listKeyOf,
  listKeyWithoutPageOf,
  lockedFieldsOf,
  withoutLockedFilters,
  withoutLockedOptions,
} from "@/utils/listQuery";

const state = (overrides: Partial<ListQueryState> = {}): ListQueryState => ({
  ready: true,
  filters: {},
  sort: { field: "date", direction: "DESC", seed: null },
  page: 1,
  perPage: 24,
  q: "",
  ...overrides,
});

const TIMELINE = { date: { start: "2024-03-01", end: "2024-03-31" } };

describe("buildListQuery", () => {
  it("a permanent filter wins over a preset naming the same field", () => {
    const query = buildListQuery(
      "scene",
      state({ filters: { date: { start: "2001-01-01" }, favorite: true } }),
      TIMELINE,
      "metric"
    );
    const expected = buildSceneFilter({ ...TIMELINE, favorite: true });
    expect(query).toEqual({
      filter: { page: 1, per_page: 24, q: "", sort: "date", direction: "DESC" },
      scene_filter: expected,
    });
  });

  it("a timeline period's date survives a sort change", () => {
    const byDate = buildListQuery("scene", state(), TIMELINE, "metric");
    const byTitle = buildListQuery(
      "scene",
      state({ sort: { field: "title", direction: "ASC", seed: null } }),
      TIMELINE,
      "metric"
    );
    const expected = buildSceneFilter(TIMELINE).date;
    expect(byDate?.filter.sort).toBe("date");
    expect(byTitle?.filter.sort).toBe("title");
    expect(
      byDate && "scene_filter" in byDate && byDate.scene_filter?.date
    ).toEqual(expected);
    expect(
      byTitle && "scene_filter" in byTitle && byTitle.scene_filter?.date
    ).toEqual(expected);
  });

  it("no query until presets resolve", () => {
    expect(
      buildListQuery("scene", state({ ready: false }), {}, "metric")
    ).toBeNull();
  });

  it("random with a seed sends random_<seed>", () => {
    const query = buildListQuery(
      "performer",
      state({ sort: { field: "random", direction: "ASC", seed: 12345678 } }),
      {},
      "metric"
    );
    expect(query?.filter.sort).toBe("random_12345678");
  });

  it("Scene Number without an including collection sends the scene default", () => {
    const sort = {
      field: "scene_index",
      direction: "ASC" as const,
      seed: null,
    };
    const bare = buildListQuery("scene", state({ sort }), {}, "metric");
    const inGroup = buildListQuery(
      "scene",
      state({ sort }),
      { groups: { value: ["3:abc"], modifier: "INCLUDES" } },
      "metric"
    );
    expect(bare?.filter.sort).toBe(DEFAULT_SORT.scene.field);
    expect(inGroup?.filter.sort).toBe("scene_index");
  });

  it("listKey includes the page and listKeyWithoutPage does not", () => {
    const one = buildListQuery("scene", state({ page: 1 }), {}, "metric");
    const two = buildListQuery("scene", state({ page: 2 }), {}, "metric");
    expect(listKeyOf(one)).not.toBe(listKeyOf(two));
    expect(listKeyWithoutPageOf(one)).toBe(listKeyWithoutPageOf(two));
    expect(listKeyOf(null)).toBe("");
  });
});

describe("locked fields", () => {
  it("lockedFieldsOf reads the top level keys and the entity's own filter", () => {
    expect(
      lockedFieldsOf("scene", { tags: {}, date: {}, sceneId: "3" })
    ).toEqual(["date", "sceneId", "tags"]);
    expect(
      lockedFieldsOf("performer", { performer_filter: { tags: {} } })
    ).toEqual(["performer_filter", "tags"]);
    expect(lockedFieldsOf("scene", {})).toEqual([]);
  });

  it("withoutLockedFilters drops a locked field's keys with their companions", () => {
    const filters = {
      tagIds: ["1:a"],
      tagIdsModifier: "EXCLUDES",
      tagIdsDepth: -1,
      favorite: true,
    };
    expect(withoutLockedFilters("scene", filters, ["tags"])).toEqual({
      favorite: true,
    });
    expect(withoutLockedFilters("scene", filters, [])).toBe(filters);
    expect(withoutLockedFilters("scene", filters, ["performers"])).toBe(
      filters
    );
  });

  it("withoutLockedOptions drops the option, and a section left empty", () => {
    const options = withoutLockedOptions("scene", SCENE_FILTER_OPTIONS, [
      "date",
    ]);
    expect(options.some((option) => option.key === "date")).toBe(false);
    expect(options.some((option) => option.key === "createdAt")).toBe(true);
    const headers = options.filter(
      (option) => option.type === "section-header"
    );
    for (const header of headers) {
      const next = options[options.indexOf(header) + 1];
      expect(next && next.type !== "section-header").toBe(true);
    }
  });
});
