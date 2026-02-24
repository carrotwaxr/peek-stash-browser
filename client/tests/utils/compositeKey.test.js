import { describe, it, expect } from "vitest";
import { makeCompositeKey, parseCompositeKey } from "../../src/utils/compositeKey.js";

describe("compositeKey utilities", () => {
  describe("makeCompositeKey", () => {
    it("returns 'id:instanceId' when instanceId is provided", () => {
      expect(makeCompositeKey("82", "inst-abc")).toBe("82:inst-abc");
    });

    it("returns bare id string when instanceId is undefined", () => {
      expect(makeCompositeKey("82", undefined)).toBe("82");
    });

    it("returns bare id string when instanceId is null", () => {
      expect(makeCompositeKey("82", null)).toBe("82");
    });

    it("returns bare id string when instanceId is empty string", () => {
      expect(makeCompositeKey("82", "")).toBe("82");
    });

    it("coerces numeric id to string", () => {
      expect(makeCompositeKey(42, undefined)).toBe("42");
    });

    it("coerces numeric id to string with instanceId", () => {
      expect(makeCompositeKey(42, "inst-1")).toBe("42:inst-1");
    });

    it("handles id that is already a string", () => {
      expect(makeCompositeKey("abc", "inst-1")).toBe("abc:inst-1");
    });
  });

  describe("parseCompositeKey", () => {
    it("parses 'id:instanceId' format", () => {
      expect(parseCompositeKey("82:inst-abc")).toEqual({
        id: "82",
        instanceId: "inst-abc",
      });
    });

    it("parses bare id (no colon)", () => {
      expect(parseCompositeKey("82")).toEqual({
        id: "82",
        instanceId: undefined,
      });
    });

    it("returns { id: null, instanceId: undefined } for null input", () => {
      expect(parseCompositeKey(null)).toEqual({
        id: null,
        instanceId: undefined,
      });
    });

    it("returns { id: undefined, instanceId: undefined } for undefined input", () => {
      expect(parseCompositeKey(undefined)).toEqual({
        id: undefined,
        instanceId: undefined,
      });
    });

    it("returns { id: '', instanceId: undefined } for empty string", () => {
      expect(parseCompositeKey("")).toEqual({
        id: "",
        instanceId: undefined,
      });
    });

    it("splits only on first colon (preserves colons in instanceId)", () => {
      expect(parseCompositeKey("82:inst:with:colons")).toEqual({
        id: "82",
        instanceId: "inst:with:colons",
      });
    });

    it("handles colon at start (empty id segment)", () => {
      expect(parseCompositeKey(":inst-abc")).toEqual({
        id: "",
        instanceId: "inst-abc",
      });
    });

    it("handles colon at end (empty instanceId segment)", () => {
      expect(parseCompositeKey("82:")).toEqual({
        id: "82",
        instanceId: "",
      });
    });

    it("coerces numeric input to string before parsing", () => {
      expect(parseCompositeKey(42)).toEqual({
        id: "42",
        instanceId: undefined,
      });
    });
  });

  describe("round-trip", () => {
    it("parseCompositeKey(makeCompositeKey(id, instanceId)) recovers both parts", () => {
      const result = parseCompositeKey(makeCompositeKey("82", "inst-abc"));
      expect(result).toEqual({ id: "82", instanceId: "inst-abc" });
    });

    it("round-trips bare id correctly", () => {
      const result = parseCompositeKey(makeCompositeKey("82", undefined));
      expect(result).toEqual({ id: "82", instanceId: undefined });
    });

    it("round-trips numeric id correctly", () => {
      const result = parseCompositeKey(makeCompositeKey(42, "inst-1"));
      expect(result).toEqual({ id: "42", instanceId: "inst-1" });
    });
  });
});
