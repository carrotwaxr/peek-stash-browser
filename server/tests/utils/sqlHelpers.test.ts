import { describe, expect, it } from "vitest";
import { emptyToNull, likeContains } from "../../utils/sqlHelpers.js";

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
