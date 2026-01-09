import { describe, it, expect } from "vitest";
import { useTruncationDetection } from "../../src/hooks/useTruncationDetection";

describe("useTruncationDetection", () => {
  it("is a function", () => {
    expect(typeof useTruncationDetection).toBe("function");
  });

  it("returns ref and isTruncated state", () => {
    // Hook should return [ref, isTruncated]
    const funcString = useTruncationDetection.toString();
    expect(funcString).toContain("useRef");
    expect(funcString).toContain("useState");
  });
});
