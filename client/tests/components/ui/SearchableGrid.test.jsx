import { describe, it, expect } from "vitest";
import SearchableGrid from "../../../src/components/ui/SearchableGrid";

describe("SearchableGrid", () => {
  it("is defined as a component", () => {
    expect(SearchableGrid).toBeDefined();
    expect(typeof SearchableGrid).toBe("function");
  });

  it("has correct display name", () => {
    expect(SearchableGrid.name).toBe("SearchableGrid");
  });
});
