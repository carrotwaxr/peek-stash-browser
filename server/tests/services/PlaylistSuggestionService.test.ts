/**
 * The weights a playlist's visible items give its suggestions
 * (services/PlaylistSuggestionService.ts, `suggestionWeights`). The
 * statements run against SQLite in
 * integration/services/PlaylistSuggestions.integration.test.ts.
 */
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  type RecommendationPreferences,
} from "@peek/shared-types/recommendationPreferences.js";
import { describe, expect, it, vi } from "vitest";
import {
  type InstanceSupport,
  SUGGESTION_TOP_PERFORMERS,
  SUGGESTION_TOP_STUDIOS,
  SUGGESTION_TOP_TAGS,
  TAG_ROW_BUDGET,
  boostCandidates,
  splitTagsByBudget,
  suggestionWeights,
} from "../../services/PlaylistSuggestionService.js";
import { tagIdf } from "../../services/RecommendationScoringService.js";
import {
  SIMILAR_PARTNER_WEIGHT,
  SIMILAR_PERFORMER_WEIGHT,
  SIMILAR_STUDIO_WEIGHT,
  SIMILAR_TAG_WEIGHT,
} from "../../services/SimilarScenesService.js";
import type { SimilarSceneCandidate } from "../../services/StashEntityService.js";
import { entityKey } from "../../utils/entityRef.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const INSTANCE = "inst-a";
const LIVE = 1000;

const support = (overrides: Partial<InstanceSupport>): InstanceSupport => ({
  instanceId: INSTANCE,
  performers: [],
  tags: [],
  studios: [],
  ...overrides,
});

const prefs = (
  overrides: Partial<RecommendationPreferences> = {}
): RecommendationPreferences => ({
  ...DEFAULT_RECOMMENDATION_PREFERENCES,
  ...overrides,
});

const ids = (list: Array<[string, number]>) => list.map(([id]) => id);

describe("suggestionWeights", () => {
  it("with 6 items, drops a tag on one item and weighs a tag on three by share, weight and rarity", () => {
    const weights = suggestionWeights(
      support({
        tags: [
          { id: "one-off", sceneCountAll: 10, support: 1 },
          { id: "theme", sceneCountAll: 40, support: 3 },
        ],
      }),
      6,
      prefs(),
      LIVE
    );
    expect(weights.tags).toEqual([
      ["theme", 0.5 * SIMILAR_TAG_WEIGHT * tagIdf(40, LIVE)],
    ]);
    expect(SIMILAR_TAG_WEIGHT).toBe(1.5);
  });

  it("with 3 items, keeps a tag on one item", () => {
    const weights = suggestionWeights(
      support({ tags: [{ id: "one-off", sceneCountAll: 10, support: 1 }] }),
      3,
      prefs(),
      LIVE
    );
    expect(weights.tags).toEqual([
      ["one-off", (1 / 3) * SIMILAR_TAG_WEIGHT * tagIdf(10, LIVE)],
    ]);
  });

  it("drops a one-off performer and studio from 5 items on, as it drops tags", () => {
    const weights = suggestionWeights(
      support({
        performers: [
          { id: "guest", gender: "FEMALE", support: 1 },
          { id: "regular", gender: "FEMALE", support: 5 },
        ],
        studios: [
          { id: "once", support: 1 },
          { id: "home", support: 2 },
        ],
      }),
      5,
      prefs(),
      LIVE
    );
    expect(weights.performers).toEqual([
      ["regular", 1 * SIMILAR_PERFORMER_WEIGHT],
    ]);
    expect(weights.studios).toEqual([["home", 0.4 * SIMILAR_STUDIO_WEIGHT]]);
  });

  it("weighs a partner under lead preferences at share times 1.5, a lead at share times 3", () => {
    const weights = suggestionWeights(
      support({
        performers: [
          { id: "partner", gender: "MALE", support: 4 },
          { id: "lead", gender: "FEMALE", support: 4 },
          { id: "unknown", gender: null, support: 4 },
        ],
      }),
      8,
      prefs({ leadGenders: ["FEMALE"], partnerGenders: ["MALE"] }),
      LIVE
    );
    expect(SIMILAR_PARTNER_WEIGHT).toBe(1.5);
    expect(weights.performers).toEqual([
      ["lead", 0.5 * SIMILAR_PERFORMER_WEIGHT],
      ["unknown", 0.5 * SIMILAR_PERFORMER_WEIGHT],
      ["partner", 0.5 * SIMILAR_PARTNER_WEIGHT],
    ]);
  });

  it("leaves out a tag the viewer ignores on this instance only", () => {
    const tags = [
      { id: "ignored", sceneCountAll: 10, support: 2 },
      { id: "kept", sceneCountAll: 10, support: 2 },
    ];
    const ignoring = prefs({ ignoredTagIds: [`ignored:${INSTANCE}`] });
    expect(
      ids(suggestionWeights(support({ tags }), 2, ignoring, LIVE).tags)
    ).toEqual(["kept"]);
    // The same id on another instance is another tag
    expect(
      ids(
        suggestionWeights(
          support({ instanceId: "inst-b", tags }),
          2,
          ignoring,
          LIVE
        ).tags
      )
    ).toEqual(["ignored", "kept"]);
  });

  it("keeps the top 30 tags of 40 that qualify, by weight then id", () => {
    // Supports 2..41 of 50 items: the 30 best are those on 12..41 items
    const tags = Array.from({ length: 40 }, (_, i) => ({
      id: `t${String(i).padStart(2, "0")}`,
      sceneCountAll: 10,
      support: i + 2,
    }));
    const weights = suggestionWeights(support({ tags }), 50, prefs(), LIVE);
    expect(SUGGESTION_TOP_TAGS).toBe(30);
    expect(weights.tags).toHaveLength(30);
    expect(ids(weights.tags)).toEqual(
      tags
        .slice(10)
        .reverse()
        .map((t) => t.id)
    );
  });

  it("caps performers at 30 and studios at 10, ties broken by id", () => {
    const performers = Array.from({ length: 35 }, (_, i) => ({
      id: `p${String(34 - i).padStart(2, "0")}`,
      gender: null,
      support: 2,
    }));
    const studios = Array.from({ length: 12 }, (_, i) => ({
      id: `s${String(11 - i).padStart(2, "0")}`,
      support: 2,
    }));
    const weights = suggestionWeights(
      support({ performers, studios }),
      4,
      prefs(),
      LIVE
    );
    expect(SUGGESTION_TOP_PERFORMERS).toBe(30);
    expect(SUGGESTION_TOP_STUDIOS).toBe(10);
    expect(ids(weights.performers)).toEqual(
      Array.from({ length: 30 }, (_, i) => `p${String(i).padStart(2, "0")}`)
    );
    expect(ids(weights.studios)).toEqual(
      Array.from({ length: 10 }, (_, i) => `s${String(i).padStart(2, "0")}`)
    );
  });
});

describe("splitTagsByBudget", () => {
  const counts = new Map([
    ["a", 30],
    ["b", 25],
    ["c", 15],
    ["d", 5],
  ]);

  it("fills the budget by weight, then boosts the rest", () => {
    const split = splitTagsByBudget(
      [
        ["c", 0.2],
        ["a", 0.9],
        ["b", 0.5],
      ],
      counts,
      true,
      55
    );
    expect(split.generating).toEqual([
      ["a", 0.9],
      ["b", 0.5],
    ]);
    expect(split.boosting).toEqual([["c", 0.2]]);
  });

  it("skips a tag that would overflow and keeps walking for a rarer one", () => {
    const split = splitTagsByBudget(
      [
        ["a", 0.9],
        ["b", 0.5],
        ["c", 0.2],
        ["d", 0.1],
      ],
      counts,
      true,
      50
    );
    // a (30) fits, b (55) would not, c (45) fits, d (50) fits
    expect(split.generating).toEqual([
      ["a", 0.9],
      ["c", 0.2],
      ["d", 0.1],
    ]);
    expect(split.boosting).toEqual([["b", 0.5]]);
  });

  it("with no performer or studio weights, the heaviest tag generates whatever its count", () => {
    const tags: Array<[string, number]> = [
      ["a", 0.9],
      ["b", 0.5],
    ];
    expect(splitTagsByBudget(tags, counts, false, 10)).toEqual({
      generating: [["a", 0.9]],
      boosting: [["b", 0.5]],
    });
    // With other weights, nothing over the budget generates
    expect(splitTagsByBudget(tags, counts, true, 10)).toEqual({
      generating: [],
      boosting: [
        ["a", 0.9],
        ["b", 0.5],
      ],
    });
  });

  it("breaks weight ties by id, and boosts a tag with no known count", () => {
    const split = splitTagsByBudget(
      [
        ["z", 0.5],
        ["b", 0.5],
        ["a", 0.5],
        ["unknown", 0.9],
      ],
      counts,
      true,
      55
    );
    expect(split.generating).toEqual([
      ["a", 0.5],
      ["b", 0.5],
    ]);
    expect(split.boosting).toEqual([
      ["unknown", 0.9],
      ["z", 0.5],
    ]);
  });

  it("defaults to TAG_ROW_BUDGET", () => {
    expect(TAG_ROW_BUDGET).toBe(25_000);
    const big = new Map([
      ["x", TAG_ROW_BUDGET],
      ["y", 1],
    ]);
    const split = splitTagsByBudget(
      [
        ["x", 0.9],
        ["y", 0.5],
      ],
      big,
      true
    );
    expect(split.generating).toEqual([["x", 0.9]]);
    expect(split.boosting).toEqual([["y", 0.5]]);
  });
});

describe("boostCandidates", () => {
  const candidate = (
    sceneId: string,
    weight: number,
    date: string | null = null,
    instanceId = INSTANCE
  ): SimilarSceneCandidate => ({ sceneId, instanceId, weight, date });

  it("adds each candidate's boost and re-sorts: a shared boosting tag lifts it past an equal one", () => {
    const boosted = boostCandidates(
      [
        candidate("1", 3, "2024-01-02"),
        candidate("2", 3, null),
        candidate("3", 2.5, "2024-01-01"),
      ],
      new Map([
        [entityKey("2", INSTANCE), 0.25],
        [entityKey("3", INSTANCE), 0.75],
      ])
    );
    // 2 and 3 tie at 3.25: the dated one first, as the SQL orders
    expect(boosted.map((c) => [c.sceneId, c.weight])).toEqual([
      ["3", 3.25],
      ["2", 3.25],
      ["1", 3],
    ]);
  });

  it("matches a boost by (id, instance)", () => {
    const boosted = boostCandidates(
      [candidate("1", 1), candidate("1", 1, null, "inst-b")],
      new Map([[entityKey("1", "inst-b"), 1]])
    );
    expect(boosted.map((c) => [c.instanceId, c.weight])).toEqual([
      ["inst-b", 2],
      [INSTANCE, 1],
    ]);
  });
});
