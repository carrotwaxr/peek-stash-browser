import { describe, it, expect } from "vitest";
import Tooltip from "../Tooltip";

describe("Tooltip", () => {
  it("is a React component function", () => {
    expect(typeof Tooltip).toBe("function");
  });

  it("accepts hoverDisabled prop in signature", () => {
    const funcString = Tooltip.toString();
    expect(funcString).toContain("hoverDisabled");
  });
});
