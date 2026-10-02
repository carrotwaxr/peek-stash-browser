import { describe, expect, it } from "vitest";
import {
  emptyToNull,
  jsonListArm,
  likeContains,
} from "../../utils/sqlHelpers.js";
import { jsonListOrEmpty } from "../../utils/sqlJson.js";

describe("emptyToNull", () => {
  it("reads empty text and a missing value as null", () => {
    expect(emptyToNull("")).toBeNull();
    expect(emptyToNull(null)).toBeNull();
    expect(emptyToNull(undefined)).toBeNull();
  });

  it("keeps any other text, whitespace included", () => {
    expect(emptyToNull("a")).toBe("a");
    expect(emptyToNull(" ")).toBe(" ");
  });
});

describe("likeContains", () => {
  it("wraps the text in % for a match anywhere", () => {
    expect(likeContains("ann")).toBe("%ann%");
  });

  it("escapes %, _ and the escape character itself with a backslash", () => {
    expect(likeContains("100%")).toBe("%100\\%%");
    expect(likeContains("snake_case")).toBe("%snake\\_case%");
    expect(likeContains("a\\b")).toBe("%a\\\\b%");
  });
});

describe("jsonListArm", () => {
  it("is true when any element of the JSON list matches the bound pattern", () => {
    expect(jsonListArm("p.aliasList")).toBe(
      `EXISTS (SELECT 1 FROM json_each(${jsonListOrEmpty("p.aliasList")}) a WHERE a.value LIKE ? ESCAPE '\\')`
    );
  });

  it("takes the placeholder it binds the pattern to", () => {
    expect(jsonListArm("p.aliasList", ":pattern")).toContain(
      "a.value LIKE :pattern ESCAPE"
    );
  });

  it("reads a damaged column as an empty list", () => {
    expect(jsonListArm("t.aliases")).toContain("json_valid(t.aliases)");
  });
});
