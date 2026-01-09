import { describe, it, expect } from "vitest";
import { ExpandableDescription } from "../../../src/components/ui/ExpandableDescription";

describe("ExpandableDescription", () => {
  it("is a React component function", () => {
    expect(typeof ExpandableDescription).toBe("function");
  });

  it("accepts description and maxLines props", () => {
    const funcString = ExpandableDescription.toString();
    expect(funcString).toContain("description");
    expect(funcString).toContain("maxLines");
  });
});
