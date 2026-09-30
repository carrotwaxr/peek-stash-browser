import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { must } from "../../tests/helpers/must.js";
import type { ParsedListRequest } from "../../types/parsedFilters.js";

// Skip if no database connection
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/** A parsed list request: the sort, the page and nothing else */
function request(
  sort: ParsedListRequest<"scene">["sort"],
  page: number,
  perPage: number
): ParsedListRequest<"scene"> {
  return {
    page,
    perPage,
    q: undefined,
    sort,
    filter: {},
    specificInstanceId: undefined,
  };
}

const byCreated = { field: "created_at", direction: "DESC" } as const;
const random = (seed: number, direction: "ASC" | "DESC" = "DESC") =>
  ({ field: "random", direction, seed }) as const;

/** Every synced instance: the builder takes the list, an empty one matches nothing */
let allInstances: string[];

describeWithDb("SceneQueryBuilder Integration", () => {
  beforeAll(async () => {
    const rows = await prisma.stashInstance.findMany({ select: { id: true } });
    allInstances = rows.map((row) => row.id);
  });

  it("an empty allowed list returns no rows and count 0", async () => {
    const result = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: [],
      request: request({ ...byCreated, seed: undefined }, 1, 10),
    });

    expect(result).toEqual({ items: [], total: 0 });
  });

  it("should execute a basic query without filters", async () => {
    const result = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: allInstances,
      applyExclusions: false,
      request: request({ ...byCreated, seed: undefined }, 1, 10),
    });

    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeLessThanOrEqual(10);
  });

  it("should apply exclusions correctly via pre-computed JOIN", async () => {
    // This test verifies the exclusion JOIN works when applyExclusions is true
    // Exclusions are now pre-computed in UserExcludedEntity table
    const result = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: allInstances,
      request: request({ ...byCreated, seed: undefined }, 1, 5),
    });

    // Just verify the query executes successfully with exclusion JOIN
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("should paginate correctly", async () => {
    const page1 = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: allInstances,
      applyExclusions: false,
      request: request({ ...byCreated, seed: undefined }, 1, 5),
    });

    const page2 = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: allInstances,
      applyExclusions: false,
      request: request({ ...byCreated, seed: undefined }, 2, 5),
    });

    // Pages should have different scenes
    const page1Ids = new Set(page1.items.map((s) => s.id));
    const page2Ids = page2.items.map((s) => s.id);

    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }
  });

  it("should return consistent results with random sort and seed", async () => {
    const seed = 12345;

    const result1 = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: allInstances,
      applyExclusions: false,
      request: request(random(seed), 1, 10),
    });

    const result2 = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: allInstances,
      applyExclusions: false,
      request: request(random(seed), 1, 10),
    });

    // Same seed should give same order
    expect(result1.items.map((s) => s.id)).toEqual(
      result2.items.map((s) => s.id)
    );
  });

  it("should return different results with different random seeds", async () => {
    const seed1 = 11111111;
    const seed2 = 99999999;

    const result1 = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: allInstances,
      applyExclusions: false,
      request: request(random(seed1), 1, 10),
    });

    const result2 = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: allInstances,
      applyExclusions: false,
      request: request(random(seed2), 1, 10),
    });

    // Different seeds should give different orders (with enough scenes)
    expect(result1.items.length).toBeGreaterThanOrEqual(3);
    expect(result2.items.length).toBeGreaterThanOrEqual(3);
    const order1 = result1.items.map((s) => s.id).join(",");
    const order2 = result2.items.map((s) => s.id).join(",");
    expect(order1).not.toEqual(order2);
  });

  it("should produce shuffled non-sequential IDs with random sort", async () => {
    // This test catches the SQLite integer overflow bug where random sort
    // produces sequential IDs due to floating-point conversion
    const result = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: allInstances,
      applyExclusions: false,
      request: request(random(12345), 1, 20),
    });

    if (result.items.length < 10) {
      console.log("Skipping shuffle test - not enough scenes");
      return;
    }

    const ids = result.items.map((s) => parseInt(s.id, 10));

    // Count how many consecutive pairs have sequential IDs
    // In a truly random order, very few should be sequential
    let sequentialPairs = 0;
    for (let i = 0; i < ids.length - 1; i++) {
      if (Math.abs(must(ids[i]) - must(ids[i + 1])) === 1) {
        sequentialPairs++;
      }
    }

    // If more than half the pairs are sequential, the random sort is broken
    const maxAllowedSequential = Math.floor((ids.length - 1) / 2);
    expect(sequentialPairs).toBeLessThan(maxAllowedSequential);
  });

  it("should produce consistent results with same seed", async () => {
    const seed = 12345678;

    // Run the same query twice with the same seed
    const result1 = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: allInstances,
      applyExclusions: false,
      request: request(random(seed, "ASC"), 1, 10),
    });

    const result2 = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: allInstances,
      applyExclusions: false,
      request: request(random(seed, "ASC"), 1, 10),
    });

    // Same seed should produce identical results
    expect(result1.items.length).toBeGreaterThanOrEqual(2);
    const ids1 = result1.items.map((s) => s.id);
    const ids2 = result2.items.map((s) => s.id);
    expect(ids1).toEqual(ids2);
  });

  it("should fetch scenes by (id, instance) refs with full relations", async () => {
    // First get some scene refs
    const initial = await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: allInstances,
      applyExclusions: false,
      request: request({ ...byCreated, seed: undefined }, 1, 3),
    });

    if (initial.items.length < 2) {
      console.log("Skipping getByRefs test - not enough scenes");
      return;
    }

    const refsToFetch = initial.items
      .slice(0, 2)
      .map((s) => ({ id: s.id, instanceId: s.instanceId }));

    const result = await sceneQueryBuilder.getByRefs({
      userId: 1,
      refs: refsToFetch,
      allowedInstanceIds: allInstances,
    });

    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id).sort()).toEqual(
      refsToFetch.map((r) => r.id).sort()
    );

    // Verify relations are populated
    for (const scene of result) {
      expect(scene).toHaveProperty("performers");
      expect(scene).toHaveProperty("tags");
      expect(scene).toHaveProperty("groups");
      expect(scene).toHaveProperty("galleries");
      expect(Array.isArray(scene.performers)).toBe(true);
      expect(Array.isArray(scene.tags)).toBe(true);
    }
  });

  it("should not leak Stash user data for users without watch history", async () => {
    // Use a high user ID that is unlikely to have any WatchHistory records
    // This simulates a new Peek user viewing scenes for the first time
    const newUserId = 999999;

    const result = await sceneQueryBuilder.execute({
      userId: newUserId,
      allowedInstanceIds: allInstances,
      applyExclusions: false,
      request: request({ ...byCreated, seed: undefined }, 1, 10),
    });

    // For a user with no watch history, ALL user-specific fields should be defaults
    // (not the Stash user's values which may be non-zero)
    for (const scene of result.items) {
      // These should be 0 for a user with no watch history, never Stash values
      expect(scene.o_counter).toBe(0);
      expect(scene.play_count).toBe(0);
      expect(scene.play_duration).toBe(0);
      expect(scene.resume_time).toBe(0);

      // Rating/favorite should be null/false for a user with no ratings
      expect(scene.rating).toBeNull();
      expect(scene.rating100).toBeNull();
      expect(scene.favorite).toBe(false);
    }
  });
});

describeWithDb("SceneQueryBuilder last_played_at filter", () => {
  let userId: number;
  let played: { id: string; stashInstanceId: string };
  let instances: string[];

  beforeAll(async () => {
    instances = (
      await prisma.stashInstance.findMany({ select: { id: true } })
    ).map((row) => row.id);
    played = must(
      await prisma.stashScene.findFirst({
        where: { deletedAt: null },
        select: { id: true, stashInstanceId: true },
      })
    );
    const user = await prisma.user.create({
      data: {
        username: "last-played-it-user",
        password: "not-a-real-hash",
        role: "USER",
      },
    });
    userId = user.id;
    // Prisma stores the DateTime as epoch milliseconds
    await prisma.watchHistory.create({
      data: {
        userId,
        sceneId: played.id,
        instanceId: played.stashInstanceId,
        playCount: 1,
        lastPlayedAt: new Date("2026-09-25T12:00:00Z"),
      },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  const found = async (
    last_played_at: NonNullable<
      ParsedListRequest<"scene">["filter"]["last_played_at"]
    >
  ): Promise<boolean> => {
    const { items } = await sceneQueryBuilder.execute({
      userId,
      allowedInstanceIds: instances,
      applyExclusions: false,
      request: {
        ...request({ ...byCreated, seed: undefined }, 1, 5),
        filter: {
          ids: {
            modifier: "INCLUDES",
            depth: 0,
            refs: [{ id: played.id, instanceId: played.stashInstanceId }],
          },
          last_played_at,
        },
      },
    });
    return items.some(
      (scene) =>
        scene.id === played.id && scene.instanceId === played.stashInstanceId
    );
  };

  it("GREATER_THAN matches a play after the date only", async () => {
    expect(await found({ modifier: "GREATER_THAN", value: "2026-09-01" })).toBe(
      true
    );
    expect(await found({ modifier: "GREATER_THAN", value: "2026-10-01" })).toBe(
      false
    );
  });

  it("LESS_THAN matches a play before the date only", async () => {
    expect(await found({ modifier: "LESS_THAN", value: "2026-09-01" })).toBe(
      false
    );
    expect(await found({ modifier: "LESS_THAN", value: "2026-10-01" })).toBe(
      true
    );
  });

  it("EQUALS matches the play's day", async () => {
    expect(await found({ modifier: "EQUALS", value: "2026-09-25" })).toBe(true);
    expect(await found({ modifier: "EQUALS", value: "2026-09-24" })).toBe(
      false
    );
    expect(await found({ modifier: "NOT_EQUALS", value: "2026-09-25" })).toBe(
      false
    );
  });

  it("BETWEEN includes the last day; NOT_BETWEEN is its complement", async () => {
    const between = (value: string, value2: string) =>
      ({ modifier: "BETWEEN", value, value2 }) as const;
    const notBetween = (value: string, value2: string) =>
      ({ modifier: "NOT_BETWEEN", value, value2 }) as const;
    expect(await found(between("2026-09-20", "2026-09-25"))).toBe(true);
    expect(await found(between("2026-09-26", "2026-09-30"))).toBe(false);
    expect(await found(notBetween("2026-09-20", "2026-09-25"))).toBe(false);
    expect(await found(notBetween("2026-09-26", "2026-09-30"))).toBe(true);
  });

  it("IS_NULL and NOT_NULL", async () => {
    expect(await found({ modifier: "NOT_NULL" })).toBe(true);
    expect(await found({ modifier: "IS_NULL" })).toBe(false);
  });
});
