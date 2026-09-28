import { describe, expect, it } from "vitest";
import { emptyToNull } from "../../utils/sqlHelpers.js";

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
