/**
 * The one read of a user's recommendation preferences, and their ignored
 * tags as (id, instance) refs and entity keys.
 */
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  type RecommendationPreferences,
} from "@peek/shared-types/recommendationPreferences.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  ignoredTagKeys,
  ignoredTagRefs,
  readUserRecommendationPreferences,
} from "../../services/userRecommendationPreferences.js";
import { entityKey } from "../../utils/entityRef.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const mockPrisma = vi.mocked(prisma, true);

const prefs = (
  overrides: Partial<RecommendationPreferences>
): RecommendationPreferences => ({
  ...DEFAULT_RECOMMENDATION_PREFERENCES,
  ...overrides,
});

describe("readUserRecommendationPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the user's own column, leniently", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      partialRow({
        recommendationPreferences: {
          leadGenders: ["FEMALE", 3],
          discovery: "sometimes",
        },
      })
    );

    const read = await readUserRecommendationPreferences(7);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { recommendationPreferences: true },
    });
    expect(read).toEqual(prefs({ leadGenders: ["FEMALE"] }));
  });

  it("is the defaults for a missing user or a NULL column", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    expect(await readUserRecommendationPreferences(7)).toEqual(
      DEFAULT_RECOMMENDATION_PREFERENCES
    );
  });
});

describe("ignored tags", () => {
  it("are (id, instance) refs and entity keys, on their own instance only", () => {
    const ignored = prefs({ ignoredTagIds: ["3:inst-a", "3:inst-b", "4:a"] });

    expect(ignoredTagRefs(ignored)).toEqual([
      { id: "3", instanceId: "inst-a" },
      { id: "3", instanceId: "inst-b" },
      { id: "4", instanceId: "a" },
    ]);
    expect(ignoredTagKeys(ignored)).toEqual(
      new Set([
        entityKey("3", "inst-a"),
        entityKey("3", "inst-b"),
        entityKey("4", "a"),
      ])
    );
  });

  it("leave out an entry without an instance or an id", () => {
    const ignored = prefs({ ignoredTagIds: ["3", ":inst-a", "5:"] });

    expect(ignoredTagRefs(ignored)).toEqual([]);
    expect(ignoredTagKeys(ignored).size).toBe(0);
  });
});
