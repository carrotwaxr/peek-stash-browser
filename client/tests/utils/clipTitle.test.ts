import { describe, expect, it } from "vitest";
import { clipTitle } from "../../src/utils/clipTitle";

describe("clipTitle", () => {
  it("a clip with a title shows its title", () => {
    expect(clipTitle({ title: "Intro", primaryTag: { name: "Action" } })).toBe(
      "Intro"
    );
  });

  it("an untitled clip shows its primary tag's name", () => {
    expect(clipTitle({ title: null, primaryTag: { name: "Action" } })).toBe(
      "Action"
    );
    expect(clipTitle({ primaryTag: { name: "Action" } })).toBe("Action");
  });

  it("an empty or blank title counts as untitled", () => {
    expect(clipTitle({ title: "", primaryTag: { name: "Action" } })).toBe(
      "Action"
    );
    expect(clipTitle({ title: "   ", primaryTag: { name: "Action" } })).toBe(
      "Action"
    );
  });

  it("an untitled clip with no primary tag shows 'Untitled'", () => {
    expect(clipTitle({ title: "", primaryTag: null })).toBe("Untitled");
    expect(clipTitle({})).toBe("Untitled");
  });
});
