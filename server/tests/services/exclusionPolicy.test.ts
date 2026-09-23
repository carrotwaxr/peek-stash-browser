/**
 * Unit tests for exclusionPolicy: the one place that says who exclusions
 * apply to and what a restriction row's restrictEmpty defaults to (item 13).
 */
import { describe, expect, it } from "vitest";
import {
  RESTRICTABLE_ENTITY_TYPES,
  RESTRICTION_MODES,
  defaultRestrictEmpty,
  restrictionsApplyTo,
} from "../../services/exclusionPolicy.js";

describe("exclusionPolicy", () => {
  it("restrictions apply to every role except ADMIN", () => {
    expect(restrictionsApplyTo("ADMIN")).toBe(false);
    expect(restrictionsApplyTo("USER")).toBe(true);
  });

  it("restrictEmpty defaults on for INCLUDE and off for EXCLUDE (owner decision Q4)", () => {
    expect(defaultRestrictEmpty("INCLUDE")).toBe(true);
    expect(defaultRestrictEmpty("EXCLUDE")).toBe(false);
  });

  it("lists the four restrictable types and the two modes", () => {
    expect([...RESTRICTABLE_ENTITY_TYPES]).toEqual([
      "groups",
      "tags",
      "studios",
      "galleries",
    ]);
    expect([...RESTRICTION_MODES]).toEqual(["INCLUDE", "EXCLUDE"]);
  });
});
