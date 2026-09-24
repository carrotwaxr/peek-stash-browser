import { describe, expect, it } from "vitest";
import { must } from "./must.js";

describe("must", () => {
  it("returns the value when present", () => {
    const row = { id: "1" };

    expect(must(row)).toBe(row);
    expect(must([10, 20][1])).toBe(20);
  });

  it("throws a named error for undefined and null", () => {
    expect(() => must(undefined, "first call")).toThrow(
      "expected first call to be present"
    );
    expect(() => must(null, "row")).toThrow("expected row to be present");
    expect(() => must([][0])).toThrow("expected value to be present");
  });

  it("keeps falsy values such as 0 and an empty string", () => {
    expect(must(0)).toBe(0);
    expect(must("")).toBe("");
    expect(must(false)).toBe(false);
  });
});
