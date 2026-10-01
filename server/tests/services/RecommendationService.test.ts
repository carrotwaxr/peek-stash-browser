/**
 * RecommendationService: one ranked list per user, kept while the user's
 * ratings, plays, hidden items and rankings and the scene sync are as they
 * were (a stamp, one query), keyed by user, day and allowed instances.
 */
import type { PerformerRating, UserEntityRanking } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  type ScoringScene,
  hasAnyCriteria,
} from "../../services/RecommendationScoringService.js";
import { recommendationService } from "../../services/RecommendationService.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
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

const scene = (
  id: string,
  instanceId: string,
  performerIds: string[],
  extra: Partial<ScoringScene> = {}
): ScoringScene => ({
  id,
  instanceId,
  studioId: null,
  performerIds,
  tagIds: [],
  oCounter: 0,
  playCount: 0,
  lastPlayedAt: null,
  ...extra,
});

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
  mockPrisma.$queryRawUnsafe.mockResolvedValue([stampRow()]);
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
    // The stamp is read for every page
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
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
    mockPrisma.$queryRawUnsafe.mockResolvedValue([stampRow(change)]);
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

  it("a user with no ratings but rankings at or above the 50th percentile has criteria and a scored list", async () => {
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.userEntityRanking.findMany.mockResolvedValue([
      partialRow<UserEntityRanking>({
        entityId: "p1",
        instanceId: A,
        entityType: "performer",
        engagementRate: 1,
        percentileRank: 100,
      }),
      partialRow<UserEntityRanking>({
        entityId: "p2",
        instanceId: A,
        entityType: "performer",
        engagementRate: 0.2,
        percentileRank: 50,
      }),
      partialRow<UserEntityRanking>({
        entityId: "p3",
        instanceId: A,
        entityType: "performer",
        engagementRate: 0.1,
        percentileRank: 49,
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

  it("rankings all below the 50th percentile still mean no criteria", async () => {
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.userEntityRanking.findMany.mockResolvedValue([
      partialRow<UserEntityRanking>({
        entityId: "p1",
        instanceId: A,
        entityType: "performer",
        engagementRate: 0.1,
        percentileRank: 49,
      }),
    ]);

    const ranked = await recommendationService.getRankedRefs(USER, [A]);

    expect(ranked.criteria.rankedEntities).toBe(0);
    expect(ranked.refs).toEqual([]);
    expect(mockScoring).not.toHaveBeenCalled();
  });

  it("marks a scene played today below zero and one played a month ago below an unwatched one", async () => {
    mockScoring.mockResolvedValue([
      scene("recent", A, ["p1"], {
        playCount: 1,
        lastPlayedAt: new Date(Date.now() - 60 * 60 * 1000),
      }),
      scene("old", A, ["p1"], {
        playCount: 1,
        lastPlayedAt: new Date(Date.now() - 30 * DAY_MS),
      }),
      scene("unwatched", A, ["p1"]),
    ]);

    const ranked = await recommendationService.getRankedRefs(USER, [A]);

    expect(keys(ranked.refs)).toEqual([`unwatched:${A}`, `old:${A}`]);
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
