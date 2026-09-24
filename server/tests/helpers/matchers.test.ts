import { describe, expect, it } from "vitest";
import {
  anyOf,
  arrayContaining,
  objectContaining,
  stringContaining,
} from "./matchers.js";

describe("typed asymmetric matchers", () => {
  it("objectContaining matches a superset and rejects a different value", () => {
    expect({ id: 1, name: "a" }).toEqual(objectContaining({ id: 1 }));
    expect({ id: 1, name: "a" }).not.toEqual(objectContaining({ id: 2 }));
  });

  it("arrayContaining matches in any order and rejects a missing element", () => {
    expect([1, 2, 3]).toEqual(arrayContaining([3, 1]));
    expect([1, 2, 3]).not.toEqual(arrayContaining([4]));
  });

  it("stringContaining matches a substring only", () => {
    expect("synced 3 scenes").toEqual(stringContaining("3 scenes"));
    expect("synced 3 scenes").not.toEqual(stringContaining("4 scenes"));
  });

  it("anyOf matches by constructor and by primitive type", () => {
    expect({ at: new Date(0) }).toEqual({ at: anyOf(Date) });
    expect({ at: "2026-01-01" }).not.toEqual({ at: anyOf(Date) });
    expect({ name: "a", count: 2 }).toEqual({
      name: anyOf(String),
      count: anyOf(Number),
    });
    expect({ name: 1 }).not.toEqual({ name: anyOf(String) });
  });
});
