/**
 * Unit tests for the recommendation preferences: the lenient reader of stored
 * JSON and the strict validator of a PUT body.
 */
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  readRecommendationPreferences,
  validateRecommendationPreferences,
} from "@peek/shared-types/recommendationPreferences.js";
import { describe, expect, it } from "vitest";
import { anyOf } from "../helpers/matchers.js";

const FULL = {
  leadGenders: ["FEMALE", "TRANSGENDER_FEMALE"],
  partnerGenders: ["MALE"],
  noPartnerScenes: "less",
  discovery: "new",
  ignoredTagIds: ["5:a", "6:b"],
};

describe("readRecommendationPreferences", () => {
  it.each([null, undefined, "text", 7, [], [1, 2]])(
    "returns the defaults for %j",
    (raw) => {
      expect(readRecommendationPreferences(raw)).toEqual(
        DEFAULT_RECOMMENDATION_PREFERENCES
      );
    }
  );

  it("returns fresh arrays, never the defaults' own", () => {
    const a = readRecommendationPreferences(null);
    a.leadGenders.push("FEMALE");
    expect(DEFAULT_RECOMMENDATION_PREFERENCES.leadGenders).toEqual([]);
  });

  it("fills missing keys with defaults", () => {
    expect(readRecommendationPreferences({ discovery: "rewatch" })).toEqual({
      ...DEFAULT_RECOMMENDATION_PREFERENCES,
      discovery: "rewatch",
    });
  });

  it("keeps a full valid value", () => {
    expect(readRecommendationPreferences(FULL)).toEqual(FULL);
  });

  it("drops unknown genders and duplicates", () => {
    const read = readRecommendationPreferences({
      ...FULL,
      leadGenders: ["FEMALE", "ALIEN", "FEMALE", 3],
    });
    expect(read.leadGenders).toEqual(["FEMALE"]);
  });

  it("drops malformed, bare and duplicate tag ids", () => {
    const read = readRecommendationPreferences({
      ...FULL,
      ignoredTagIds: ["5:a", "5:a", "7", "", ":x", "8:", 9, "6:b"],
    });
    expect(read.ignoredTagIds).toEqual(["5:a", "6:b"]);
  });

  it("removes from partnerGenders any gender also a lead", () => {
    const read = readRecommendationPreferences({
      ...FULL,
      leadGenders: ["FEMALE"],
      partnerGenders: ["FEMALE", "MALE"],
    });
    expect(read.partnerGenders).toEqual(["MALE"]);
  });

  it("empties partnerGenders when there are no leads", () => {
    const read = readRecommendationPreferences({
      ...FULL,
      leadGenders: [],
    });
    expect(read.partnerGenders).toEqual([]);
  });

  it("falls back per key for bad enum values", () => {
    const read = readRecommendationPreferences({
      ...FULL,
      noPartnerScenes: "never",
      discovery: "wild",
    });
    expect(read.noPartnerScenes).toBe("normal");
    expect(read.discovery).toBe("balanced");
    expect(read.leadGenders).toEqual(FULL.leadGenders);
  });

  it("falls back to [] for a non-array list", () => {
    const read = readRecommendationPreferences({
      ...FULL,
      leadGenders: "FEMALE",
      ignoredTagIds: { a: 1 },
    });
    expect(read.leadGenders).toEqual([]);
    expect(read.partnerGenders).toEqual([]);
    expect(read.ignoredTagIds).toEqual([]);
  });
});

describe("validateRecommendationPreferences", () => {
  it("accepts a full valid value and returns it", () => {
    expect(validateRecommendationPreferences(FULL)).toEqual({
      ok: true,
      value: FULL,
    });
  });

  it("accepts the defaults", () => {
    expect(
      validateRecommendationPreferences(DEFAULT_RECOMMENDATION_PREFERENCES)
    ).toEqual({ ok: true, value: DEFAULT_RECOMMENDATION_PREFERENCES });
  });

  const rejected: Array<[string, unknown]> = [
    ["null", null],
    ["an array", []],
    ["a string", "x"],
    ["an unknown gender", { ...FULL, leadGenders: ["ALIEN"] }],
    ["an unknown partner gender", { ...FULL, partnerGenders: ["ALIEN"] }],
    ["a gender in both lists", { ...FULL, partnerGenders: ["FEMALE"] }],
    [
      "partners without leads",
      { ...FULL, leadGenders: [], partnerGenders: ["MALE"] },
    ],
    ["a bad noPartnerScenes", { ...FULL, noPartnerScenes: "never" }],
    ["a bad discovery", { ...FULL, discovery: "wild" }],
    [
      "201 tags",
      {
        ...FULL,
        ignoredTagIds: Array.from({ length: 201 }, (_, i) => `${i}:a`),
      },
    ],
    ["a bare tag id", { ...FULL, ignoredTagIds: ["5"] }],
    ["a non-string tag id", { ...FULL, ignoredTagIds: [5] }],
    ["duplicate tag ids", { ...FULL, ignoredTagIds: ["5:a", "5:a"] }],
    ["duplicate genders", { ...FULL, leadGenders: ["FEMALE", "FEMALE"] }],
    ["a missing key", { leadGenders: [] }],
  ];

  it.each(rejected)("rejects %s", (_name, raw) => {
    const result = validateRecommendationPreferences(raw);
    expect(result).toEqual({ ok: false, error: anyOf(String) });
  });

  it("accepts exactly 200 tags", () => {
    const ignoredTagIds = Array.from({ length: 200 }, (_, i) => `${i}:a`);
    expect(
      validateRecommendationPreferences({ ...FULL, ignoredTagIds }).ok
    ).toBe(true);
  });
});
