import { describe, expect, it } from "vitest";
import {
  emptyToNull,
  jsonListArm,
  likeContains,
  searchTerms,
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

describe("searchTerms", () => {
  it("splits on whitespace, runs of it counting once", () => {
    expect(searchTerms("anna  blonde")).toEqual(["anna", "blonde"]);
    expect(searchTerms("  anna\tblonde \n")).toEqual(["anna", "blonde"]);
  });

  it("keeps a quoted phrase whole", () => {
    expect(searchTerms('"anna blonde" pov')).toEqual(["anna blonde", "pov"]);
    expect(searchTerms('pov "anna blonde"')).toEqual(["pov", "anna blonde"]);
  });

  it("reads an unmatched quote as a literal character", () => {
    expect(searchTerms('"anna blonde')).toEqual(['"anna', "blonde"]);
    expect(searchTerms('6" pov')).toEqual(['6"', "pov"]);
  });

  it("drops an empty phrase", () => {
    expect(searchTerms('"" anna')).toEqual(["anna"]);
    expect(searchTerms('"   "')).toEqual([]);
  });

  it("collapses duplicates", () => {
    expect(searchTerms("anna anna blonde anna")).toEqual(["anna", "blonde"]);
  });

  it("keeps the first 10 terms", () => {
    const words = Array.from({ length: 14 }, (_, i) => `w${i}`);
    expect(searchTerms(words.join(" "))).toEqual(words.slice(0, 10));
  });

  it("reads blank text as no terms", () => {
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms("   ")).toEqual([]);
  });

  it("keeps a term's case and its %, _ and backslash for likeContains to escape", () => {
    expect(searchTerms("Élodie 100%_x")).toEqual(["Élodie", "100%_x"]);
  });
});
