/**
 * Unit Tests for shared SQL filter builder utilities
 *
 * Tests buildNumericFilter, buildDateFilter, buildTextFilter, and buildFavoriteFilter
 * with all modifier branches and edge cases.
 */
import { describe, it, expect } from "vitest";
import {
  buildNumericFilter,
  buildDateFilter,
  buildTextFilter,
  buildFavoriteFilter,
} from "../../utils/sqlFilterBuilders.js";

describe("buildNumericFilter", () => {
  const col = "COALESCE(r.rating, 0)";

  it("returns empty for undefined filter", () => {
    expect(buildNumericFilter(undefined, col)).toEqual({ sql: "", params: [] });
  });

  it("returns empty for null filter", () => {
    expect(buildNumericFilter(null, col)).toEqual({ sql: "", params: [] });
  });

  it("returns empty for filter with null value", () => {
    expect(buildNumericFilter({ value: null }, col)).toEqual({ sql: "", params: [] });
  });

  it("returns empty for filter with undefined value", () => {
    expect(buildNumericFilter({ value: undefined }, col)).toEqual({ sql: "", params: [] });
  });

  it("handles EQUALS", () => {
    const result = buildNumericFilter({ value: 80, modifier: "EQUALS" }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) = ?");
    expect(result.params).toEqual([80]);
  });

  it("handles NOT_EQUALS", () => {
    const result = buildNumericFilter({ value: 80, modifier: "NOT_EQUALS" }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) != ?");
    expect(result.params).toEqual([80]);
  });

  it("handles GREATER_THAN", () => {
    const result = buildNumericFilter({ value: 50, modifier: "GREATER_THAN" }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) > ?");
    expect(result.params).toEqual([50]);
  });

  it("handles LESS_THAN", () => {
    const result = buildNumericFilter({ value: 50, modifier: "LESS_THAN" }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) < ?");
    expect(result.params).toEqual([50]);
  });

  it("handles BETWEEN with value2", () => {
    const result = buildNumericFilter({ value: 20, value2: 80, modifier: "BETWEEN" }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) BETWEEN ? AND ?");
    expect(result.params).toEqual([20, 80]);
  });

  it("handles BETWEEN without value2 (fallback to >=)", () => {
    const result = buildNumericFilter({ value: 20, modifier: "BETWEEN" }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) >= ?");
    expect(result.params).toEqual([20]);
  });

  it("handles NOT_BETWEEN with value2", () => {
    const result = buildNumericFilter({ value: 20, value2: 80, modifier: "NOT_BETWEEN" }, col);
    expect(result.sql).toBe("(COALESCE(r.rating, 0) < ? OR COALESCE(r.rating, 0) > ?)");
    expect(result.params).toEqual([20, 80]);
  });

  it("handles NOT_BETWEEN without value2 (fallback to <)", () => {
    const result = buildNumericFilter({ value: 20, modifier: "NOT_BETWEEN" }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) < ?");
    expect(result.params).toEqual([20]);
  });

  it("defaults to GREATER_THAN when no modifier", () => {
    const result = buildNumericFilter({ value: 50 }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) > ?");
    expect(result.params).toEqual([50]);
  });

  it("returns empty for unknown modifier", () => {
    const result = buildNumericFilter({ value: 50, modifier: "UNKNOWN" }, col);
    expect(result).toEqual({ sql: "", params: [] });
  });

  it("works with subquery expressions", () => {
    const subquery = "(SELECT COUNT(*) FROM ScenePerformer sp WHERE sp.sceneId = s.id)";
    const result = buildNumericFilter({ value: 2, modifier: "EQUALS" }, subquery);
    expect(result.sql).toBe(`${subquery} = ?`);
    expect(result.params).toEqual([2]);
  });

  it("handles value of 0", () => {
    const result = buildNumericFilter({ value: 0, modifier: "EQUALS" }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) = ?");
    expect(result.params).toEqual([0]);
  });
});

describe("buildDateFilter", () => {
  const col = "s.date";

  it("returns empty for undefined filter", () => {
    expect(buildDateFilter(undefined, col)).toEqual({ sql: "", params: [] });
  });

  it("returns empty for null filter", () => {
    expect(buildDateFilter(null, col)).toEqual({ sql: "", params: [] });
  });

  it("handles IS_NULL (no value needed)", () => {
    const result = buildDateFilter({ modifier: "IS_NULL" }, col);
    expect(result.sql).toBe("s.date IS NULL");
    expect(result.params).toEqual([]);
  });

  it("handles NOT_NULL (no value needed)", () => {
    const result = buildDateFilter({ modifier: "NOT_NULL" }, col);
    expect(result.sql).toBe("s.date IS NOT NULL");
    expect(result.params).toEqual([]);
  });

  it("handles IS_NULL even when value is null", () => {
    const result = buildDateFilter({ value: null, modifier: "IS_NULL" }, col);
    expect(result.sql).toBe("s.date IS NULL");
    expect(result.params).toEqual([]);
  });

  it("returns empty for non-null modifier without value", () => {
    const result = buildDateFilter({ modifier: "EQUALS" }, col);
    expect(result).toEqual({ sql: "", params: [] });
  });

  it("handles EQUALS", () => {
    const result = buildDateFilter({ value: "2024-01-15", modifier: "EQUALS" }, col);
    expect(result.sql).toBe("date(s.date) = date(?)");
    expect(result.params).toEqual(["2024-01-15"]);
  });

  it("handles NOT_EQUALS", () => {
    const result = buildDateFilter({ value: "2024-01-15", modifier: "NOT_EQUALS" }, col);
    expect(result.sql).toBe("(s.date IS NULL OR date(s.date) != date(?))");
    expect(result.params).toEqual(["2024-01-15"]);
  });

  it("handles GREATER_THAN", () => {
    const result = buildDateFilter({ value: "2024-01-15", modifier: "GREATER_THAN" }, col);
    expect(result.sql).toBe("s.date > ?");
    expect(result.params).toEqual(["2024-01-15"]);
  });

  it("handles LESS_THAN", () => {
    const result = buildDateFilter({ value: "2024-01-15", modifier: "LESS_THAN" }, col);
    expect(result.sql).toBe("s.date < ?");
    expect(result.params).toEqual(["2024-01-15"]);
  });

  it("handles BETWEEN with value2", () => {
    const result = buildDateFilter(
      { value: "2024-01-01", value2: "2024-12-31", modifier: "BETWEEN" },
      col
    );
    expect(result.sql).toBe("s.date BETWEEN ? AND ?");
    expect(result.params).toEqual(["2024-01-01", "2024-12-31"]);
  });

  it("handles BETWEEN without value2 (fallback to >=)", () => {
    const result = buildDateFilter({ value: "2024-01-01", modifier: "BETWEEN" }, col);
    expect(result.sql).toBe("s.date >= ?");
    expect(result.params).toEqual(["2024-01-01"]);
  });

  it("handles NOT_BETWEEN with value2", () => {
    const result = buildDateFilter(
      { value: "2024-01-01", value2: "2024-12-31", modifier: "NOT_BETWEEN" },
      col
    );
    expect(result.sql).toBe("(s.date IS NULL OR s.date < ? OR s.date > ?)");
    expect(result.params).toEqual(["2024-01-01", "2024-12-31"]);
  });

  it("handles NOT_BETWEEN without value2 (fallback to <)", () => {
    const result = buildDateFilter({ value: "2024-01-01", modifier: "NOT_BETWEEN" }, col);
    expect(result.sql).toBe("s.date < ?");
    expect(result.params).toEqual(["2024-01-01"]);
  });

  it("defaults to GREATER_THAN when no modifier", () => {
    const result = buildDateFilter({ value: "2024-01-15" }, col);
    expect(result.sql).toBe("s.date > ?");
    expect(result.params).toEqual(["2024-01-15"]);
  });

  it("returns empty for unknown modifier", () => {
    const result = buildDateFilter({ value: "2024-01-15", modifier: "UNKNOWN" }, col);
    expect(result).toEqual({ sql: "", params: [] });
  });
});

describe("buildTextFilter", () => {
  const col = "p.name";

  it("returns empty for undefined filter", () => {
    expect(buildTextFilter(undefined, col)).toEqual({ sql: "", params: [] });
  });

  it("returns empty for null filter", () => {
    expect(buildTextFilter(null, col)).toEqual({ sql: "", params: [] });
  });

  it("handles IS_NULL (no value needed)", () => {
    const result = buildTextFilter({ modifier: "IS_NULL" }, col);
    expect(result.sql).toBe("(p.name IS NULL OR p.name = '')");
    expect(result.params).toEqual([]);
  });

  it("handles NOT_NULL (no value needed)", () => {
    const result = buildTextFilter({ modifier: "NOT_NULL" }, col);
    expect(result.sql).toBe("(p.name IS NOT NULL AND p.name != '')");
    expect(result.params).toEqual([]);
  });

  it("returns empty for non-null modifier without value", () => {
    const result = buildTextFilter({ modifier: "INCLUDES" }, col);
    expect(result).toEqual({ sql: "", params: [] });
  });

  it("handles INCLUDES (single column)", () => {
    const result = buildTextFilter({ value: "test", modifier: "INCLUDES" }, col);
    expect(result.sql).toBe("(LOWER(p.name) LIKE LOWER(?))");
    expect(result.params).toEqual(["%test%"]);
  });

  it("handles EXCLUDES (single column)", () => {
    const result = buildTextFilter({ value: "test", modifier: "EXCLUDES" }, col);
    expect(result.sql).toBe("((p.name IS NULL OR LOWER(p.name) NOT LIKE LOWER(?)))");
    expect(result.params).toEqual(["%test%"]);
  });

  it("handles EQUALS", () => {
    const result = buildTextFilter({ value: "exact", modifier: "EQUALS" }, col);
    expect(result.sql).toBe("LOWER(p.name) = LOWER(?)");
    expect(result.params).toEqual(["exact"]);
  });

  it("handles NOT_EQUALS", () => {
    const result = buildTextFilter({ value: "exact", modifier: "NOT_EQUALS" }, col);
    expect(result.sql).toBe("(p.name IS NULL OR LOWER(p.name) != LOWER(?))");
    expect(result.params).toEqual(["exact"]);
  });

  it("defaults to INCLUDES when no modifier", () => {
    const result = buildTextFilter({ value: "test" }, col);
    expect(result.sql).toBe("(LOWER(p.name) LIKE LOWER(?))");
    expect(result.params).toEqual(["%test%"]);
  });

  it("returns empty for unknown modifier", () => {
    const result = buildTextFilter({ value: "test", modifier: "UNKNOWN" }, col);
    expect(result).toEqual({ sql: "", params: [] });
  });

  // Multi-column tests (additionalColumns parameter)
  it("handles INCLUDES with additionalColumns", () => {
    const result = buildTextFilter(
      { value: "test", modifier: "INCLUDES" },
      "p.name",
      ["p.disambiguation", "p.aliasList"]
    );
    expect(result.sql).toBe(
      "(LOWER(p.name) LIKE LOWER(?) OR LOWER(p.disambiguation) LIKE LOWER(?) OR LOWER(p.aliasList) LIKE LOWER(?))"
    );
    expect(result.params).toEqual(["%test%", "%test%", "%test%"]);
  });

  it("handles EXCLUDES with additionalColumns", () => {
    const result = buildTextFilter(
      { value: "test", modifier: "EXCLUDES" },
      "p.name",
      ["p.aliasList"]
    );
    expect(result.sql).toBe(
      "((p.name IS NULL OR LOWER(p.name) NOT LIKE LOWER(?)) AND (p.aliasList IS NULL OR LOWER(p.aliasList) NOT LIKE LOWER(?)))"
    );
    expect(result.params).toEqual(["%test%", "%test%"]);
  });

  it("EQUALS only uses primary column even with additionalColumns", () => {
    const result = buildTextFilter(
      { value: "exact", modifier: "EQUALS" },
      "p.name",
      ["p.aliasList"]
    );
    expect(result.sql).toBe("LOWER(p.name) = LOWER(?)");
    expect(result.params).toEqual(["exact"]);
  });

  it("IS_NULL only checks primary column", () => {
    const result = buildTextFilter(
      { modifier: "IS_NULL" },
      "p.name",
      ["p.aliasList"]
    );
    expect(result.sql).toBe("(p.name IS NULL OR p.name = '')");
    expect(result.params).toEqual([]);
  });
});

describe("buildFavoriteFilter", () => {
  it("returns empty for undefined", () => {
    expect(buildFavoriteFilter(undefined)).toEqual({ sql: "", params: [] });
  });

  it("handles true (favorites only)", () => {
    const result = buildFavoriteFilter(true);
    expect(result.sql).toBe("r.favorite = 1");
    expect(result.params).toEqual([]);
  });

  it("handles false (non-favorites)", () => {
    const result = buildFavoriteFilter(false);
    expect(result.sql).toBe("(r.favorite = 0 OR r.favorite IS NULL)");
    expect(result.params).toEqual([]);
  });
});
