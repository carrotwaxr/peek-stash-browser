/**
 * stashDate: an entity date as Peek stores it. Stash answers a collection
 * with no date as "0001-01-01" (Go's zero time), which Peek showed as a
 * date; any date before year 2 is none, so cards, detail pages, sorts and
 * filters treat it as the collections with no date at all.
 */
import { describe, expect, it } from "vitest";
import { stashDate } from "../../utils/stashDate.js";

describe("stashDate", () => {
  it("a year-1 date is no date", () => {
    expect(stashDate("0001-01-01")).toBeNull();
    expect(stashDate("0001-12-31")).toBeNull();
    expect(stashDate("0000-01-01")).toBeNull();
  });

  it("a real date is kept as Stash returns it, an early one included", () => {
    expect(stashDate("2020-05-01")).toBe("2020-05-01");
    expect(stashDate("1970-01-01")).toBe("1970-01-01");
    expect(stashDate("0002-01-01")).toBe("0002-01-01");
  });

  it("a blank or missing date is no date", () => {
    expect(stashDate("")).toBeNull();
    expect(stashDate("  ")).toBeNull();
    expect(stashDate(null)).toBeNull();
    expect(stashDate(undefined)).toBeNull();
  });
});
