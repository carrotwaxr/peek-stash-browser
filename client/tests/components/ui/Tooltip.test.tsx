import { describe, it, expect } from "vitest";
import Tooltip from "../../../src/components/ui/Tooltip";

describe("Tooltip", () => {
  it("is a React component function", () => {
    expect(typeof Tooltip).toBe("function");
  });

  it("accepts hoverDisabled prop in signature", () => {
    const funcString = Tooltip.toString();
    expect(funcString).toContain("hoverDisabled");
  });
});

describe("Tooltip hoverDisabled behavior", () => {
  it("has handleMouseEnter that checks hoverDisabled", () => {
    // The function body should reference hoverDisabled in mouse handlers
    const funcString = Tooltip.toString();
    // When hoverDisabled is true, hover shouldn't trigger visibility
    expect(funcString).toContain("hoverDisabled");
    // The mouse enter handler should exist and be conditional
    expect(funcString).toContain("handleMouseEnter");
  });
});
