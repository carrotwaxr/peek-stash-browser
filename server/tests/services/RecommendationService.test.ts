/**
 * RecommendationService: one ranked list per user, kept while the user's
 * ratings, plays, hidden items and rankings and the scene sync are as they
 * were (a stamp, one query), keyed by user, day, allowed instances and
 * recommendation preferences.
 */
import { DEFAULT_RECOMMENDATION_PREFERENCES } from "@peek/shared-types/recommendationPreferences.js";
import type {
  PerformerRating,
  SceneRating,
  TagRating,
  User,
  UserEntityRanking,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import type * as scoringModule from "../../services/RecommendationScoringService.js";
import {
  type LibraryScoringScene,
  buildEntityAffinity,
  hasAnyCriteria,
  scoreScene,
} from "../../services/RecommendationScoringService.js";
import { recommendationService } from "../../services/RecommendationService.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { entityKey } from "../../utils/entityRef.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// The real scoring, watched: what compute hands it is the wiring under test
vi.mock(
  "../../services/RecommendationScoringService.js",
  async (importOriginal) => {
    const actual = await importOriginal<typeof scoringModule>();
    return {
      ...actual,
      buildEntityAffinity: vi.fn(actual.buildEntityAffinity),
      scoreScene: vi.fn(actual.scoreScene),
    };
  }
);

vi.mock("../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getScenesForScoring: vi.fn(),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockScoring = vi.mocked(stashEntityService.getScenesForScoring);
const mockAffinity = vi.mocked(buildEntityAffinity);
const mockScoreScene = vi.mocked(scoreScene);

const USER = 7;
const A = "inst-a";
const B = "inst-b";
const DAY_MS = 24 * 60 * 60 * 1000;

/** The stamp row as the one stamp query returns it */
const stampRow = (overrides: Partial<Record<string, string>> = {}) => ({
  ratings: "r0",
  plays: "p0",
  rankings: "k0",
  exclusions: "e0",
  sync: "s0",
  ...overrides,
});

interface RawRows {
  stamp?: Partial<Record<string, string>>;
  genders?: Array<{ id: string; stashInstanceId: string; gender: string }>;
  tags?: Array<{
    id: string;
    stashInstanceId: string;
    sceneCountAll: number;
    parentId: string | null;
  }>;
  studios?: Array<{ id: string; stashInstanceId: string; parentId: string }>;
}

/** Answers each raw statement by the table it reads */
function rawRows(rows: RawRows = {}) {
  mockPrisma.$queryRawUnsafe.mockImplementation(
    prismaImpl((sql: string) => {
      if (sql.includes("SyncState")) return [stampRow(rows.stamp)];
      if (sql.includes("FROM StashPerformer")) return rows.genders ?? [];
      if (sql.includes("FROM StashTag")) return rows.tags ?? [];
      if (sql.includes("FROM StashStudio")) return rows.studios ?? [];
      throw new Error(`unexpected statement: ${sql}`);
    })
  );
}

/** The raw statements sent that read `table`, as [sql, ...params] */
const statementsReading = (table: string) =>
  mockPrisma.$queryRawUnsafe.mock.calls.filter(([sql]) =>
    sql.includes(`FROM ${table}`)
  );

/** The user's stored preferences */
function storedPreferences(value: User["recommendationPreferences"]) {
  mockPrisma.user.findUnique.mockResolvedValue(
    partialRow<User>({ recommendationPreferences: value })
  );
}

const scene = (
  id: string,
  instanceId: string,
  performerIds: string[],
  extra: Partial<LibraryScoringScene> = {}
): LibraryScoringScene => ({
  id,
  instanceId,
  studioId: null,
  performerIds,
  tagIds: [],
  inheritedTagIds: [],
  oCount: 0,
  kept: false,
  hasHistory: false,
  lastPlayedAt: null,
  ...extra,
});

/** The input of the one affinity build */
const affinityInput = () => must(mockAffinity.mock.calls[0])[0];
/** The context of the first scene scored */
const scoringContext = () => must(mockScoreScene.mock.calls[0])[1];

const favoritePerformer = (performerId: string, instanceId: string) =>
  partialRow<PerformerRating>({
    performerId,
    instanceId,
    favorite: true,
    rating: null,
  });

const keys = (refs: ReadonlyArray<{ id: string; instanceId: string }>) =>
  refs.map((ref) => `${ref.id}:${ref.instanceId}`);

beforeEach(() => {
  vi.clearAllMocks();
  recommendationService.clear();
  rawRows();
  storedPreferences(null);
  mockPrisma.performerRating.findMany.mockResolvedValue([
    favoritePerformer("p1", A),
  ]);
  mockPrisma.studioRating.findMany.mockResolvedValue([]);
  mockPrisma.tagRating.findMany.mockResolvedValue([]);
  mockPrisma.sceneRating.findMany.mockResolvedValue([]);
  mockPrisma.userEntityRanking.findMany.mockResolvedValue([]);
  mockScoring.mockResolvedValue([
    scene("s1", A, ["p1"]),
    scene("s2", A, ["p2"]),
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RecommendationService", () => {
  it("ranks the scenes matching the user's favorites, by (id, instance)", async () => {
    const ranked = await recommendationService.getRankedRefs(USER, [A]);

    expect(keys(ranked.refs)).toEqual([`s1:${A}`]);
    expect(ranked.criteria.favoritedPerformers).toBe(1);
    expect(mockScoring).toHaveBeenCalledExactlyOnceWith(USER, [A]);
  });

  it("pages 2 and 3 reuse page 1's ranked list", async () => {
    const first = await recommendationService.getRankedRefs(USER, [A]);
    const second = await recommendationService.getRankedRefs(USER, [A]);
    const third = await recommendationService.getRankedRefs(USER, [A]);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(mockScoring).toHaveBeenCalledTimes(1);
    expect(mockPrisma.performerRating.findMany).toHaveBeenCalledTimes(1);
    // The stamp and the preferences are read for every page
    expect(statementsReading("SyncState")).toHaveLength(3);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(3);
  });

  it("reads the stamp for the user only", async () => {
    await recommendationService.getRankedRefs(USER, [A]);

    const [sql, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
    expect(sql).toContain("PerformerRating");
    expect(sql).toContain("WatchHistory");
    expect(sql).toMatch(/SUM\(oCount\)/);
    expect(sql).toContain("UserEntityRanking");
    expect(sql).toContain("UserExcludedEntity");
    expect(sql).toContain("SyncState");
    expect(params.length).toBeGreaterThan(0);
    expect(new Set(params)).toEqual(new Set([USER]));
  });

  it.each([
    ["rating or favorite", { ratings: "r1" }],
    ["play", { plays: "p1" }],
    ["ranking recompute", { rankings: "k1" }],
    ["hide (exclusion recompute)", { exclusions: "e1" }],
    ["scene sync", { sync: "s1" }],
  ])("a changed %s recomputes", async (_what, change) => {
    await recommendationService.getRankedRefs(USER, [A]);
    rawRows({ stamp: change });
    mockScoring.mockResolvedValue([scene("s3", A, ["p1"])]);

    const ranked = await recommendationService.getRankedRefs(USER, [A]);

    expect(mockScoring).toHaveBeenCalledTimes(2);
    expect(keys(ranked.refs)).toEqual([`s3:${A}`]);
  });

  it("an instance selection change recomputes for the new instances", async () => {
    await recommendationService.getRankedRefs(USER, [A]);

    await recommendationService.getRankedRefs(USER, [A, B]);

    expect(mockScoring).toHaveBeenCalledTimes(2);
    expect(mockScoring).toHaveBeenLastCalledWith(USER, [A, B]);
  });

  it("two concurrent first pages compute once", async () => {
    const [first, second] = await Promise.all([
      recommendationService.getRankedRefs(USER, [A]),
      recommendationService.getRankedRefs(USER, [A]),
    ]);

    expect(second).toBe(first);
    expect(mockScoring).toHaveBeenCalledTimes(1);
  });

  it("a new day's seed recomputes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
    await recommendationService.getRankedRefs(USER, [A]);
    await recommendationService.getRankedRefs(USER, [A]);
    expect(mockScoring).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-09-29T00:00:01Z"));
    await recommendationService.getRankedRefs(USER, [A]);

    expect(mockScoring).toHaveBeenCalledTimes(2);
  });

  it("a failed computation is not kept: the next page recomputes", async () => {
    mockScoring.mockRejectedValueOnce(new Error("DB down"));

    await expect(
      recommendationService.getRankedRefs(USER, [A])
    ).rejects.toThrow("DB down");
    const ranked = await recommendationService.getRankedRefs(USER, [A]);

    expect(keys(ranked.refs)).toEqual([`s1:${A}`]);
    expect(mockScoring).toHaveBeenCalledTimes(2);
  });

  it("never answers one user with another user's list", async () => {
    mockPrisma.performerRating.findMany.mockImplementation(
      prismaImpl((args) =>
        args?.where?.userId === USER
          ? [favoritePerformer("p1", A)]
          : [favoritePerformer("p2", A)]
      )
    );

    const forUser = await recommendationService.getRankedRefs(USER, [A]);
    const forOther = await recommendationService.getRankedRefs(USER + 1, [A]);
    const forUserAgain = await recommendationService.getRankedRefs(USER, [A]);

    expect(keys(forUser.refs)).toEqual([`s1:${A}`]);
    expect(keys(forOther.refs)).toEqual([`s2:${A}`]);
    expect(forUserAgain).toBe(forUser);
    expect(mockScoring).toHaveBeenCalledTimes(2);
  });

  it("forget drops one user's list: their next page rescores, another user's is kept", async () => {
    const before = await recommendationService.getRankedRefs(USER, [A]);
    const other = await recommendationService.getRankedRefs(USER + 1, [A]);

    recommendationService.forget(USER);
    const after = await recommendationService.getRankedRefs(USER, [A]);
    const otherAgain = await recommendationService.getRankedRefs(USER + 1, [A]);

    // Same stamp, key and day: only forget can make it rescore
    expect(after).not.toBe(before);
    expect(keys(after.refs)).toEqual(keys(before.refs));
    expect(otherAgain).toBe(other);
    expect(mockScoring).toHaveBeenCalledTimes(3);
  });

  it("forget during a computation: the next page rescores rather than reuse it", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockScoring.mockImplementationOnce(async () => {
      await gate;
      return [scene("s1", A, ["p1"])];
    });

    const running = recommendationService.getRankedRefs(USER, [A]);
    await vi.waitFor(() => {
      expect(mockScoring).toHaveBeenCalledTimes(1);
    });
    recommendationService.forget(USER);
    release();
    await running;
    await recommendationService.getRankedRefs(USER, [A]);

    expect(mockScoring).toHaveBeenCalledTimes(2);
  });

  it("forget of a user with no list changes nothing", async () => {
    const kept = await recommendationService.getRankedRefs(USER, [A]);

    recommendationService.forget(USER + 1);

    expect(await recommendationService.getRankedRefs(USER, [A])).toBe(kept);
    expect(mockScoring).toHaveBeenCalledTimes(1);
  });

  it("a user with no criteria gets no refs and no scoring pass", async () => {
    mockPrisma.performerRating.findMany.mockResolvedValue([]);

    const ranked = await recommendationService.getRankedRefs(USER, [A]);

    expect(ranked.refs).toEqual([]);
    expect(ranked.criteria.favoritedPerformers).toBe(0);
    expect(mockScoring).not.toHaveBeenCalled();
  });

  it("a user with no ratings but rankings with a positive affinity has criteria and a scored list", async () => {
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.userEntityRanking.findMany.mockResolvedValue([
      partialRow<UserEntityRanking>({
        entityId: "p1",
        instanceId: A,
        entityType: "performer",
        affinity: 0.8,
      }),
      partialRow<UserEntityRanking>({
        entityId: "p2",
        instanceId: A,
        entityType: "performer",
        affinity: 0.1,
      }),
      partialRow<UserEntityRanking>({
        entityId: "p3",
        instanceId: A,
        entityType: "performer",
        affinity: -0.4,
      }),
    ]);
    mockScoring.mockResolvedValue([
      scene("s1", A, ["p1"]),
      scene("s2", A, ["p3"]),
    ]);

    const ranked = await recommendationService.getRankedRefs(USER, [A]);

    expect(ranked.criteria.rankedEntities).toBe(2);
    expect(hasAnyCriteria(ranked.criteria)).toBe(true);
    expect(keys(ranked.refs)).toEqual([`s1:${A}`]);
    // The rankings are read once, for the criteria and the weights
    expect(mockPrisma.userEntityRanking.findMany).toHaveBeenCalledTimes(1);
  });

  it("rankings with no positive affinity still mean no criteria", async () => {
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.userEntityRanking.findMany.mockResolvedValue([
      partialRow<UserEntityRanking>({
        entityId: "p1",
        instanceId: A,
        entityType: "performer",
        affinity: -0.3,
      }),
      partialRow<UserEntityRanking>({
        entityId: "p2",
        instanceId: A,
        entityType: "performer",
        affinity: 0,
      }),
    ]);

    const ranked = await recommendationService.getRankedRefs(USER, [A]);

    expect(ranked.criteria.rankedEntities).toBe(0);
    expect(ranked.refs).toEqual([]);
    expect(mockScoring).not.toHaveBeenCalled();
  });

  it("drops a scene played today and ranks one played a month ago below an unwatched one", async () => {
    mockScoring.mockResolvedValue([
      scene("recent", A, ["p1"], {
        kept: true,
        hasHistory: true,
        lastPlayedAt: new Date(Date.now() - 60 * 60 * 1000),
      }),
      scene("old", A, ["p1"], {
        kept: true,
        hasHistory: true,
        lastPlayedAt: new Date(Date.now() - 30 * DAY_MS),
      }),
      scene("unwatched", A, ["p1"]),
    ]);

    // The final scores, before the day's shuffle within each window
    const { scored } = await recommendationService["score"](
      USER,
      [A],
      DEFAULT_RECOMMENDATION_PREFERENCES
    );
    const final = new Map(scored.map((s) => [s.id, s.final]));
    const ranked = await recommendationService.getRankedRefs(USER, [A]);

    expect([...final.keys()].sort()).toEqual(["old", "unwatched"]);
    expect(must(final.get("old"))).toBeLessThan(must(final.get("unwatched")));
    expect(keys(ranked.refs).sort()).toEqual([`old:${A}`, `unwatched:${A}`]);
  });

  it("one scored scene ranks it (a score range of zero)", async () => {
    mockScoring.mockResolvedValue([scene("only", A, ["p1"])]);

    const ranked = await recommendationService.getRankedRefs(USER, [A]);

    expect(keys(ranked.refs)).toEqual([`only:${A}`]);
  });

  it("keeps the top 500", async () => {
    mockScoring.mockResolvedValue(
      Array.from({ length: 600 }, (_, i) => scene(`s${i}`, A, ["p1"]))
    );

    const ranked = await recommendationService.getRankedRefs(USER, [A]);

    expect(ranked.refs).toHaveLength(500);
  });

  it("a preference change recomputes; unchanged preferences reuse the list", async () => {
    const first = await recommendationService.getRankedRefs(USER, [A]);
    expect(await recommendationService.getRankedRefs(USER, [A])).toBe(first);

    storedPreferences({ discovery: "rewatch" });
    const changed = await recommendationService.getRankedRefs(USER, [A]);
    const again = await recommendationService.getRankedRefs(USER, [A]);

    expect(changed).not.toBe(first);
    expect(again).toBe(changed);
    expect(mockScoring).toHaveBeenCalledTimes(2);
    expect(scoringContext().prefs.discovery).toBe("balanced");
    expect(must(mockScoreScene.mock.lastCall)[1].prefs.discovery).toBe(
      "rewatch"
    );
  });

  it("reads the user's own preferences, leniently", async () => {
    storedPreferences({ discovery: "sometimes", leadGenders: ["FEMALE", 3] });

    await recommendationService.getRankedRefs(USER, [A]);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: USER },
      select: { recommendationPreferences: true },
    });
    expect(scoringContext().prefs).toMatchObject({
      discovery: "balanced",
      leadGenders: ["FEMALE"],
    });
  });

  it("ignored tags reach the affinity and the scoring as entity keys, on their own instance only", async () => {
    storedPreferences({ ignoredTagIds: [`t1:${A}`] });
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.tagRating.findMany.mockResolvedValue(
      [A, B].map((instanceId) =>
        partialRow<TagRating>({
          tagId: "t1",
          instanceId,
          favorite: true,
          rating: null,
        })
      )
    );
    mockScoring.mockResolvedValue([
      scene("s1", A, [], { tagIds: ["t1"] }),
      scene("s2", B, [], { tagIds: ["t1"] }),
    ]);

    const ranked = await recommendationService.getRankedRefs(USER, [A, B]);

    const ignored = new Set([entityKey("t1", A)]);
    expect(affinityInput().ignoredTags).toEqual(ignored);
    expect(scoringContext().ignoredTags).toEqual(ignored);
    expect(keys(ranked.refs)).toEqual([`s2:${B}`]);
  });

  it("reads no genders without lead genders", async () => {
    await recommendationService.getRankedRefs(USER, [A]);

    expect(statementsReading("StashPerformer")).toHaveLength(0);
    expect(scoringContext().genders.size).toBe(0);
  });

  it("with lead genders, reads the live performers' genders on the allowed instances", async () => {
    storedPreferences({
      leadGenders: ["FEMALE"],
      partnerGenders: ["MALE"],
      noPartnerScenes: "less",
    });
    rawRows({
      genders: [
        { id: "p1", stashInstanceId: A, gender: "FEMALE" },
        { id: "p2", stashInstanceId: A, gender: "MALE" },
        { id: "p1", stashInstanceId: B, gender: "MALE" },
      ],
    });

    await recommendationService.getRankedRefs(USER, [A, B]);

    const [sql, ...params] = must(statementsReading("StashPerformer")[0]);
    expect(sql).toContain("deletedAt IS NULL");
    expect(sql).toContain("gender IS NOT NULL");
    expect(params).toEqual([A, B]);
    expect(scoringContext().genders).toEqual(
      new Map([
        [entityKey("p1", A), "FEMALE"],
        [entityKey("p2", A), "MALE"],
        [entityKey("p1", B), "MALE"],
      ])
    );
  });

  it("tag frequencies and the tag and studio parents, on the tag's own instance, reach the scoring", async () => {
    rawRows({
      tags: [
        { id: "t1", stashInstanceId: A, sceneCountAll: 4, parentId: "t0" },
        { id: "t1", stashInstanceId: A, sceneCountAll: 4, parentId: "t9" },
        { id: "t0", stashInstanceId: A, sceneCountAll: 10, parentId: null },
        { id: "t1", stashInstanceId: B, sceneCountAll: 2, parentId: null },
      ],
      studios: [{ id: "st1", stashInstanceId: A, parentId: "st0" }],
    });
    // A favorite parent tag reaches a scene of its child only through the tree
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.tagRating.findMany.mockResolvedValue([
      partialRow<TagRating>({
        tagId: "t0",
        instanceId: A,
        favorite: true,
        rating: null,
      }),
    ]);
    mockScoring.mockResolvedValue([
      scene("child", A, [], { tagIds: ["t1"] }),
      scene("elsewhere", B, [], { tagIds: ["t1"] }),
    ]);

    const ranked = await recommendationService.getRankedRefs(USER, [A, B]);

    const input = affinityInput();
    expect(input.tagParents).toEqual(
      new Map([[entityKey("t1", A), [entityKey("t0", A), entityKey("t9", A)]]])
    );
    expect(input.studioParents).toEqual(
      new Map([[entityKey("st1", A), entityKey("st0", A)]])
    );
    expect(scoringContext().tagDf).toEqual(
      new Map([
        [entityKey("t1", A), 4],
        [entityKey("t0", A), 10],
        [entityKey("t1", B), 2],
      ])
    );
    expect(scoringContext().sceneCount).toBe(2);
    expect(keys(ranked.refs)).toEqual([`child:${A}`]);
    for (const table of ["StashTag", "StashStudio"]) {
      const [sql, ...params] = must(statementsReading(table)[0], table);
      expect(sql).toContain("deletedAt IS NULL");
      expect(params).toEqual([A, B]);
    }
    expect(must(statementsReading("StashTag")[0])[0]).toContain("json_valid");
  });

  it("the user's scene ratings mark the scored scenes the affinity learns from", async () => {
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.sceneRating.findMany.mockResolvedValue([
      partialRow<SceneRating>({
        sceneId: "s1",
        instanceId: A,
        favorite: true,
        rating: null,
      }),
      // The same id on the other instance is another scene, not scored here
      partialRow<SceneRating>({
        sceneId: "s2",
        instanceId: B,
        favorite: false,
        rating: 90,
      }),
    ]);

    await recommendationService.getRankedRefs(USER, [A]);

    expect(
      affinityInput().ratedScenes.map((s) => [s.id, s.favorite, s.rating])
    ).toEqual([["s1", true, null]]);
  });

  it("a user with only abandoned opens and no ratings gets an empty list with no ranked entities", async () => {
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    // Opens shorter than two minutes push each entity's affinity below 0
    mockPrisma.userEntityRanking.findMany.mockResolvedValue(
      ["performer", "studio", "tag"].map((entityType) =>
        partialRow<UserEntityRanking>({
          entityId: "x1",
          instanceId: A,
          entityType,
          affinity: -0.2,
        })
      )
    );

    const ranked = await recommendationService.getRankedRefs(USER, [A]);

    expect(ranked.refs).toEqual([]);
    expect(ranked.criteria.rankedEntities).toBe(0);
    expect(hasAnyCriteria(ranked.criteria)).toBe(false);
    expect(mockScoring).not.toHaveBeenCalled();
    expect(statementsReading("StashTag")).toHaveLength(0);
  });

  it("keeps the 100 most recently used users' lists", async () => {
    for (let userId = 1; userId <= 101; userId++) {
      await recommendationService.getRankedRefs(userId, [A]);
    }
    expect(mockScoring).toHaveBeenCalledTimes(101);

    // User 101 is the newest and still kept; user 1 was evicted
    await recommendationService.getRankedRefs(101, [A]);
    expect(mockScoring).toHaveBeenCalledTimes(101);
    await recommendationService.getRankedRefs(1, [A]);
    expect(mockScoring).toHaveBeenCalledTimes(102);
  });
});
