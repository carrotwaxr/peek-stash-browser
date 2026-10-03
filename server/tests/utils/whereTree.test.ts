/**
 * The where tree a list request carries beside its `<entity>_filter`: rows
 * and one level of groups, parsed with the filter's own schemas, refs kept
 * as (id, instance) pairs, limits counted after empty rows drop.
 */
import type { ListKind } from "@peek/shared-types/filters/index.js";
import { describe, expect, it } from "vitest";
import type {
  ParsedFilter,
  ParsedWhereGroup,
} from "../../types/parsedFilters.js";
import { type IgnoredInput, Problems } from "../../utils/listRequest.js";
import {
  isWhereShape,
  parseWhere,
  topLevelCriteria,
  topLevelLeaves,
  whereOfFlatFilter,
} from "../../utils/whereTree.js";
import { must } from "../helpers/must.js";

interface Parsed<E extends ListKind> {
  readonly where: ParsedWhereGroup<E> | undefined;
  readonly issues: readonly IgnoredInput[];
}

function parse<E extends ListKind>(entity: E, raw: unknown): Parsed<E> {
  const problems = new Problems();
  const where = parseWhere(entity, raw, "where", problems);
  return { where, issues: problems.ignored() };
}

/** The where of a tree that parses without a problem */
function parsed<E extends ListKind>(
  entity: E,
  raw: unknown
): ParsedWhereGroup<E> | undefined {
  const { where, issues } = parse(entity, raw);
  expect(issues).toEqual([]);
  return where;
}

const tagRow = (...value: string[]) => ({
  field: "tags",
  criterion: { value, modifier: "INCLUDES" },
});

describe("parseWhere", () => {
  it("a root of leaves and one group parses with refs as pairs", () => {
    const where = parsed("scene", {
      match: "any",
      rules: [
        { field: "tags", criterion: { value: ["1:a"], modifier: "INCLUDES" } },
        {
          match: "all",
          rules: [
            { field: "favorite", criterion: true },
            {
              field: "rating100",
              criterion: { value: 60, modifier: "GREATER_THAN" },
            },
          ],
        },
      ],
    });
    expect(where).toEqual({
      match: "any",
      rules: [
        {
          field: "tags",
          criterion: {
            refs: [{ id: "1", instanceId: "a" }],
            modifier: "INCLUDES",
            depth: 0,
          },
        },
        {
          match: "all",
          rules: [
            { field: "favorite", criterion: true },
            {
              field: "rating100",
              criterion: { modifier: "GREATER_THAN", value: 60 },
            },
          ],
        },
      ],
    });
  });

  it("the instance stays after parsing", () => {
    const where = parsed("scene", {
      match: "all",
      rules: [tagRow("5:inst-b", "5")],
    });
    expect(where?.rules[0]).toEqual({
      field: "tags",
      criterion: {
        refs: [
          { id: "5", instanceId: "inst-b" },
          { id: "5", instanceId: undefined },
        ],
        modifier: "INCLUDES",
        depth: 0,
      },
    });
  });

  it("a group inside a group is refused", () => {
    const { issues } = parse("scene", {
      match: "all",
      rules: [
        { match: "any", rules: [{ match: "all", rules: [tagRow("1")] }] },
      ],
    });
    expect(issues).toEqual([
      { path: "where.rules[0].rules[0]", reason: "Groups nest one level" },
    ]);
  });

  it("limits", () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      field: "rating100",
      criterion: { value: i, modifier: "EQUALS" },
    }));
    expect(parse("scene", { match: "all", rules: rows }).issues).toEqual([
      { path: "where", reason: "At most 20 rows" },
    ]);

    const groups = Array.from({ length: 6 }, (_, i) => ({
      match: "any",
      rules: [tagRow(`${i}:a`)],
    }));
    expect(parse("scene", { match: "all", rules: groups }).issues).toEqual([
      { path: "where", reason: "At most 5 groups" },
    ]);

    const ids = (n: number) =>
      Array.from({ length: 700 }, (_, i) => `${n * 1000 + i}:a`);
    const wide = [tagRow(...ids(1)), tagRow(...ids(2)), tagRow(...ids(3))];
    expect(parse("scene", { match: "all", rules: wide }).issues).toEqual([
      { path: "where", reason: "At most 2000 values in where" },
    ]);
  });

  it("the limits count rows after empty rows drop", () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => ({
        field: "rating100",
        criterion: { value: i, modifier: "EQUALS" },
      })),
      { field: "tags", criterion: { value: [] } },
    ];
    expect(parse("scene", { match: "all", rules: rows }).issues).toEqual([]);
  });

  it("`ids` and `instance_id` are refused in where", () => {
    for (const [field, criterion] of [
      ["ids", { value: ["1:a"] }],
      ["instance_id", "a"],
    ] as const) {
      const { issues } = parse("scene", {
        match: "all",
        rules: [{ field, criterion }],
      });
      expect(issues).toEqual([
        { path: "where.rules[0].field", reason: "Not a row field" },
      ]);
    }
  });

  it("unknown fields and keys are problems with their path", () => {
    expect(
      parse("scene", { match: "all", rules: [{ field: "nope" }] }).issues
    ).toEqual([
      { path: "where.rules[0].field", reason: "Unknown filter field" },
    ]);
    expect(
      parse("scene", {
        match: "all",
        rules: [{ field: "favorite", criterion: true, x: 1 }],
      }).issues
    ).toEqual([{ path: "where.rules[0].x", reason: "Unknown row key" }]);
    expect(parse("scene", { match: "some", rules: [] }).issues).toEqual([
      { path: "where.match", reason: 'Expected "all" or "any"' },
    ]);
    expect(parse("scene", { match: "all", rules: [], y: true }).issues).toEqual(
      [{ path: "where.y", reason: "Unknown group key" }]
    );
    // A field the prototype holds is no field
    expect(
      parse("scene", {
        match: "all",
        rules: [{ field: "constructor", criterion: true }],
      }).issues
    ).toEqual([
      { path: "where.rules[0].field", reason: "Unknown filter field" },
    ]);
  });

  it("a criterion that fails its schema is a problem at its path", () => {
    expect(
      parse("scene", {
        match: "all",
        rules: [{ field: "tags", criterion: { value: ["x"] } }],
      }).issues.map((issue) => issue.path)
    ).toEqual(["where.rules[0].criterion.value.0"]);
  });

  it("empty rows and empty groups drop silently, and an empty root is no where", () => {
    expect(
      parsed("scene", {
        match: "all",
        rules: [
          { field: "tags", criterion: { value: [] } },
          { match: "any", rules: [] },
          {
            match: "all",
            rules: [{ field: "rating100", criterion: { value: null } }],
          },
        ],
      })
    ).toBeUndefined();
    expect(parsed("scene", undefined)).toBeUndefined();
    expect(parsed("scene", null)).toBeUndefined();
  });

  it("a presence criterion is not empty", () => {
    expect(
      parsed("scene", {
        match: "all",
        rules: [{ field: "tags", criterion: { modifier: "IS_NULL" } }],
      })
    ).toEqual({
      match: "all",
      rules: [
        {
          field: "tags",
          criterion: { refs: [], modifier: "IS_NULL", depth: 0 },
        },
      ],
    });
  });

  it("a tag leaf `scenes` (a nested-path field) parses", () => {
    expect(
      parsed("tag", {
        match: "all",
        rules: [{ field: "scenes", criterion: { value: ["3:a"] } }],
      })?.rules
    ).toEqual([
      {
        field: "scenes",
        criterion: {
          refs: [{ id: "3", instanceId: "a" }],
          modifier: "INCLUDES",
          depth: 0,
        },
      },
    ]);
  });

  it("a tag leaf `groups` parses", () => {
    expect(
      parsed("tag", {
        match: "all",
        rules: [{ field: "groups", criterion: { value: ["4:a"] } }],
      })?.rules
    ).toEqual([
      {
        field: "groups",
        criterion: {
          refs: [{ id: "4", instanceId: "a" }],
          modifier: "INCLUDES",
          depth: 0,
        },
      },
    ]);
  });

  it("a where that is not an object, or rules that are not a list, are problems", () => {
    expect(parse("scene", "x").issues).toEqual([
      { path: "where", reason: "Expected an object" },
    ]);
    expect(parse("scene", { match: "all", rules: "x" }).issues).toEqual([
      { path: "where.rules", reason: "Expected a list" },
    ]);
    expect(parse("scene", { match: "all", rules: [3] }).issues).toEqual([
      { path: "where.rules[0]", reason: "Expected a row or a group" },
    ]);
  });
});

describe("topLevelCriteria", () => {
  const groupsRow = (...value: string[]) => ({
    field: "groups",
    criterion: { value, modifier: "INCLUDES" },
  });

  it("topLevelCriteria takes the filter object's criterion, then the first root leaf of each field under an all root, nothing under any", () => {
    const filterGroups = {
      refs: [{ id: "9", instanceId: "f" }],
      modifier: "INCLUDES",
      depth: 0,
    } as const;
    const filter: ParsedFilter<"scene"> = { groups: filterGroups };

    const all = parsed("scene", {
      match: "all",
      rules: [
        {
          field: "groups",
          criterion: { value: ["1:a"], modifier: "EXCLUDES" },
        },
        groupsRow("2:a"),
        groupsRow("3:a"),
        { match: "all", rules: [tagRow("4:a")] },
        tagRow("5:a"),
      ],
    });
    // The filter object's criterion wins
    expect(topLevelCriteria(filter, all).groups).toBe(filterGroups);
    // Without it, the first root row of the field that names something
    const top = topLevelCriteria({}, all);
    expect(top.groups).toEqual({
      refs: [{ id: "2", instanceId: "a" }],
      modifier: "INCLUDES",
      depth: 0,
    });
    // A root row, never one inside a group
    expect(top.tags).toEqual({
      refs: [{ id: "5", instanceId: "a" }],
      modifier: "INCLUDES",
      depth: 0,
    });

    const any = parsed("scene", {
      match: "any",
      rules: [groupsRow("2:a"), tagRow("5:a")],
    });
    expect(topLevelCriteria({}, any)).toEqual({});
    expect(topLevelCriteria(filter, any)).toEqual(filter);
    expect(topLevelCriteria(filter, undefined)).toEqual(filter);
  });

  it("a field's first root row with a value names it; one with none does not", () => {
    const where = parsed("scene", {
      match: "all",
      rules: [
        { field: "rating100", criterion: { modifier: "IS_NULL" } },
        { field: "rating100", criterion: { value: 60, modifier: "EQUALS" } },
        { field: "favorite", criterion: false },
      ],
    });
    expect(topLevelCriteria({}, where)).toEqual({
      rating100: { modifier: "EQUALS", value: 60 },
      favorite: false,
    });
  });
});

describe("topLevelLeaves", () => {
  it("the filter's criteria as leaves, then every root leaf of an all root", () => {
    const where = parsed("scene", {
      match: "all",
      rules: [
        tagRow("1:a"),
        tagRow("2:a"),
        { match: "any", rules: [tagRow("3:a")] },
      ],
    });
    const filter: ParsedFilter<"scene"> = {
      favorite: true,
      ids: {
        refs: [{ id: "8", instanceId: "a" }],
        modifier: "INCLUDES",
        depth: 0,
      },
    };
    const leaves = topLevelLeaves({ filter, where });
    expect(leaves.map((leaf) => leaf.field)).toEqual([
      "favorite",
      "tags",
      "tags",
    ]);
    expect(must(leaves[2]).criterion).toEqual({
      refs: [{ id: "2", instanceId: "a" }],
      modifier: "INCLUDES",
      depth: 0,
    });

    const any = parsed("scene", { match: "any", rules: [tagRow("1:a")] });
    expect(topLevelLeaves({ filter, where: any }).map((l) => l.field)).toEqual([
      "favorite",
    ]);
  });
});

describe("whereOfFlatFilter and isWhereShape", () => {
  it("a flat filter becomes an all root of its rows, without ids and instance_id", () => {
    const flat = {
      tags: { value: ["1:a"] },
      favorite: true,
      ids: { value: ["2:a"] },
      instance_id: "a",
      nope: 1,
    };
    expect(whereOfFlatFilter(flat)).toEqual({
      match: "all",
      rules: [
        { field: "tags", criterion: { value: ["1:a"] } },
        { field: "favorite", criterion: true },
        { field: "nope", criterion: 1 },
      ],
    });
  });

  it("a where shape has exactly match and rules", () => {
    expect(isWhereShape({ match: "all", rules: [] })).toBe(true);
    expect(isWhereShape({ rules: [], match: "any" })).toBe(true);
    expect(isWhereShape({ match: "all" })).toBe(false);
    expect(isWhereShape({ match: "all", rules: [], tags: {} })).toBe(false);
    expect(isWhereShape({ tags: { value: ["1"] } })).toBe(false);
    expect(isWhereShape([])).toBe(false);
    expect(isWhereShape(null)).toBe(false);
  });
});
