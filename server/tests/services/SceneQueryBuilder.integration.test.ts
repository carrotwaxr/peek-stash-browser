import { describe, it, expect, beforeAll } from "vitest";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";

// Skip if no database connection
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDb("SceneQueryBuilder Integration", () => {
  beforeAll(() => {
    // Ensure database is available
  });

  it("should execute a basic query without filters", async () => {
    const result = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 10,
    });

    expect(result).toHaveProperty("scenes");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.scenes)).toBe(true);
    expect(result.scenes.length).toBeLessThanOrEqual(10);
  });

  it("should apply exclusions correctly", async () => {
    // Get some scene IDs first
    const initial = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 5,
    });

    if (initial.scenes.length < 2) {
      console.log("Skipping exclusion test - not enough scenes");
      return;
    }

    const excludeId = initial.scenes[0].id;

    const withExclusion = await sceneQueryBuilder.execute({
      userId: 1,
      excludedSceneIds: new Set([excludeId]),
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 5,
    });

    const excludedIds = withExclusion.scenes.map((s) => s.id);
    expect(excludedIds).not.toContain(excludeId);
  });

  it("should paginate correctly", async () => {
    const page1 = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 5,
    });

    const page2 = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "created_at",
      sortDirection: "DESC",
      page: 2,
      perPage: 5,
    });

    // Pages should have different scenes
    const page1Ids = new Set(page1.scenes.map((s) => s.id));
    const page2Ids = page2.scenes.map((s) => s.id);

    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }
  });

  it("should return consistent results with random sort and seed", async () => {
    const seed = 12345;

    const result1 = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "random",
      sortDirection: "DESC",
      page: 1,
      perPage: 10,
      randomSeed: seed,
    });

    const result2 = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "random",
      sortDirection: "DESC",
      page: 1,
      perPage: 10,
      randomSeed: seed,
    });

    // Same seed should give same order
    expect(result1.scenes.map((s) => s.id)).toEqual(
      result2.scenes.map((s) => s.id)
    );
  });

  it("should return different results with different random seeds", async () => {
    const seed1 = 11111111;
    const seed2 = 99999999;

    const result1 = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "random",
      sortDirection: "DESC",
      page: 1,
      perPage: 10,
      randomSeed: seed1,
    });

    const result2 = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "random",
      sortDirection: "DESC",
      page: 1,
      perPage: 10,
      randomSeed: seed2,
    });

    // Different seeds should give different orders (with enough scenes)
    if (result1.scenes.length >= 3 && result2.scenes.length >= 3) {
      const order1 = result1.scenes.map((s) => s.id).join(",");
      const order2 = result2.scenes.map((s) => s.id).join(",");
      expect(order1).not.toEqual(order2);
    }
  });

  it("should produce shuffled non-sequential IDs with random sort", async () => {
    // This test catches the SQLite integer overflow bug where random sort
    // produces sequential IDs due to floating-point conversion
    const result = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "random",
      sortDirection: "DESC",
      page: 1,
      perPage: 20,
      randomSeed: 12345,
    });

    if (result.scenes.length < 10) {
      console.log("Skipping shuffle test - not enough scenes");
      return;
    }

    const ids = result.scenes.map((s) => parseInt(s.id, 10));

    // Count how many consecutive pairs have sequential IDs
    // In a truly random order, very few should be sequential
    let sequentialPairs = 0;
    for (let i = 0; i < ids.length - 1; i++) {
      if (Math.abs(ids[i] - ids[i + 1]) === 1) {
        sequentialPairs++;
      }
    }

    // If more than half the pairs are sequential, the random sort is broken
    const maxAllowedSequential = Math.floor((ids.length - 1) / 2);
    expect(sequentialPairs).toBeLessThan(maxAllowedSequential);
  });

  it("should reverse order when direction changes with same seed", async () => {
    const seed = 12345678;

    const ascResult = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "random",
      sortDirection: "ASC",
      page: 1,
      perPage: 10,
      randomSeed: seed,
    });

    const descResult = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "random",
      sortDirection: "DESC",
      page: 1,
      perPage: 10,
      randomSeed: seed,
    });

    // Same seed with opposite directions should give reversed order
    if (ascResult.scenes.length >= 2 && descResult.scenes.length >= 2) {
      const ascIds = ascResult.scenes.map((s) => s.id);
      const descIds = descResult.scenes.map((s) => s.id);
      expect(ascIds).toEqual(descIds.reverse());
    }
  });

  it("should fetch scenes by IDs with full relations", async () => {
    // First get some scene IDs
    const initial = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 3,
    });

    if (initial.scenes.length < 2) {
      console.log("Skipping getByIds test - not enough scenes");
      return;
    }

    const idsToFetch = initial.scenes.slice(0, 2).map(s => s.id);

    const result = await sceneQueryBuilder.getByIds({
      userId: 1,
      ids: idsToFetch,
    });

    expect(result.scenes).toHaveLength(2);
    expect(result.scenes.map(s => s.id).sort()).toEqual(idsToFetch.sort());

    // Verify relations are populated
    for (const scene of result.scenes) {
      expect(scene).toHaveProperty("performers");
      expect(scene).toHaveProperty("tags");
      expect(scene).toHaveProperty("groups");
      expect(scene).toHaveProperty("galleries");
      expect(Array.isArray(scene.performers)).toBe(true);
      expect(Array.isArray(scene.tags)).toBe(true);
    }
  });
});
