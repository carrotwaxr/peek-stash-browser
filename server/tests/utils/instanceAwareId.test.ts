/**
 * Unit Tests for InstanceAwareId branded type utilities
 *
 * Tests the compile-time branded type system and runtime utilities for
 * composite entity keys ("entityId:instanceId" format).
 */
import { describe, it, expect } from "vitest";
import {
  makeEntityRef,
  parseEntityRef,
  isEntityRef,
  assertEntityRef,
  coerceEntityRefs,
  type InstanceAwareId,
} from "@peek/shared-types/instanceAwareId.js";

describe("makeEntityRef", () => {
  it("creates a composite key from string id and instanceId", () => {
    const ref = makeEntityRef("82", "abc-123");
    expect(ref).toBe("82:abc-123");
  });

  it("creates a composite key from numeric id", () => {
    const ref = makeEntityRef(42, "server-1");
    expect(ref).toBe("42:server-1");
  });

  it("handles UUID instance IDs containing hyphens", () => {
    const ref = makeEntityRef("10", "550e8400-e29b-41d4-a716-446655440000");
    expect(ref).toBe("10:550e8400-e29b-41d4-a716-446655440000");
  });

  it("handles empty instanceId", () => {
    const ref = makeEntityRef("82", "");
    expect(ref).toBe("82:");
  });

  it("returns a value assignable to string", () => {
    const ref: string = makeEntityRef("1", "inst");
    expect(typeof ref).toBe("string");
  });
});

describe("parseEntityRef", () => {
  it("parses a composite key into id and instanceId", () => {
    expect(parseEntityRef("82:abc-123")).toEqual({
      id: "82",
      instanceId: "abc-123",
    });
  });

  it("parses a bare id (no colon) with undefined instanceId", () => {
    expect(parseEntityRef("82")).toEqual({
      id: "82",
      instanceId: undefined,
    });
  });

  it("splits only on the first colon (UUID instanceId with colons)", () => {
    expect(parseEntityRef("10:some:colon:value")).toEqual({
      id: "10",
      instanceId: "some:colon:value",
    });
  });

  it("handles empty string", () => {
    expect(parseEntityRef("")).toEqual({
      id: "",
      instanceId: undefined,
    });
  });

  it("handles composite key with empty instanceId", () => {
    expect(parseEntityRef("82:")).toEqual({
      id: "82",
      instanceId: "",
    });
  });

  it("roundtrips with makeEntityRef", () => {
    const ref = makeEntityRef("99", "server-uuid-123");
    const parsed = parseEntityRef(ref);
    expect(parsed).toEqual({ id: "99", instanceId: "server-uuid-123" });
  });
});

describe("isEntityRef", () => {
  it("returns true for composite keys", () => {
    expect(isEntityRef("82:abc-123")).toBe(true);
  });

  it("returns false for bare ids", () => {
    expect(isEntityRef("82")).toBe(false);
  });

  it("returns true for keys with empty instanceId", () => {
    expect(isEntityRef("82:")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isEntityRef("")).toBe(false);
  });

  it("narrows the type to InstanceAwareId", () => {
    const value = "82:server-1";
    if (isEntityRef(value)) {
      // This assignment should compile — isEntityRef is a type guard
      const _ref: InstanceAwareId = value;
      expect(_ref).toBe("82:server-1");
    }
  });
});

describe("assertEntityRef", () => {
  it("returns the branded type for valid composite keys", () => {
    const ref = assertEntityRef("82:abc-123");
    expect(ref).toBe("82:abc-123");
  });

  it("throws for bare ids", () => {
    expect(() => assertEntityRef("82")).toThrow(
      'Expected composite key "id:instanceId", got "82"'
    );
  });

  it("throws for empty string", () => {
    expect(() => assertEntityRef("")).toThrow(
      'Expected composite key "id:instanceId", got ""'
    );
  });

  it("accepts keys with empty instanceId (colon present)", () => {
    expect(() => assertEntityRef("82:")).not.toThrow();
  });
});

describe("coerceEntityRefs", () => {
  it("returns the same array as InstanceAwareId[]", () => {
    const input = ["82:server-1", "83:server-2"];
    const result = coerceEntityRefs(input);
    expect(result).toBe(input); // same reference
  });

  it("works with empty arrays", () => {
    const result = coerceEntityRefs([]);
    expect(result).toEqual([]);
  });

  it("preserves mixed bare and composite keys", () => {
    const input = ["82:server-1", "83"];
    const result = coerceEntityRefs(input);
    expect(result).toEqual(["82:server-1", "83"]);
  });
});
