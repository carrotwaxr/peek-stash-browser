/**
 * chipText: a chip's words from its parts and the names its ids resolved
 * to: the picks with their condition, then the exclusions, the first 3
 * names and how many more, or how many are selected while names load.
 */
import { describe, expect, it } from "vitest";
import { chipText, namesText } from "@/components/filter-bar/chipText";

const resolved = (names: string[], unavailable = 0) => ({
  names,
  unavailable,
});

describe("namesText", () => {
  it("lists the names, then how many the server did not return", () => {
    expect(namesText(["1", "2"], resolved(["Blonde"], 1))).toBe(
      "Blonde, 1 unavailable"
    );
  });

  it("past 3 ids, says how many more", () => {
    expect(
      namesText(["1", "2", "3", "4", "5"], resolved(["A", "B", "C"]))
    ).toBe("A, B, C +2 more");
  });
});

describe("chipText", () => {
  it("names the picks with their condition, then the exclusions and the suffix", () => {
    expect(
      chipText(
        {
          label: "Tags",
          condition: "any of",
          ids: ["1"],
          excludedIds: ["6"],
          suffix: ", with sub-tags",
        },
        resolved(["Blonde"]),
        resolved(["Redhead"])
      )
    ).toBe("Tags: any of Blonde; not Redhead, with sub-tags");
  });

  it("while names load, says how many are selected", () => {
    expect(
      chipText({ label: "Tags", ids: ["1", "2"] }, undefined, undefined)
    ).toBe("Tags: 2 selected");
  });

  it("a condition on nothing named is left out", () => {
    expect(
      chipText(
        { label: "Tags", condition: "any of", ids: ["9"] },
        resolved([], 1),
        undefined
      )
    ).toBe("Tags: 1 unavailable");
  });

  it("values read plainly; a row with none reads its label", () => {
    expect(
      chipText({ label: "Rating", values: ["40 to 80"] }, undefined, undefined)
    ).toBe("Rating: 40 to 80");
    expect(chipText({ label: "Organized" }, undefined, undefined)).toBe(
      "Organized"
    );
  });
});
