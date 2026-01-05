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
      applyExclusions: false, // Skip exclusion JOIN for this test
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

  it("should apply exclusions correctly via pre-computed JOIN", async () => {
    // This test verifies the exclusion JOIN works when applyExclusions is true
    // Exclusions are now pre-computed in UserExcludedEntity table
    const result = await sceneQueryBuilder.execute({
      userId: 1,
      applyExclusions: true, // Use pre-computed exclusions
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 5,
    });

    // Just verify the query executes successfully with exclusion JOIN
    expect(result).toHaveProperty("scenes");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.scenes)).toBe(true);
  });

  it("should paginate correctly", async () => {
    const page1 = await sceneQueryBuilder.execute({
      userId: 1,
      applyExclusions: false,
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 5,
    });

    const page2 = await sceneQueryBuilder.execute({
      userId: 1,
      applyExclusions: false,
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
      applyExclusions: false,
      sort: "random",
      sortDirection: "DESC",
      page: 1,
      perPage: 10,
      randomSeed: seed,
    });

    const result2 = await sceneQueryBuilder.execute({
      userId: 1,
      applyExclusions: false,
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
      applyExclusions: false,
      sort: "random",
      sortDirection: "DESC",
      page: 1,
      perPage: 10,
      randomSeed: seed1,
    });

    const result2 = await sceneQueryBuilder.execute({
      userId: 1,
      applyExclusions: false,
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
      applyExclusions: false,
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

  it("should produce consistent results with same seed", async () => {
    const seed = 12345678;

    // Run the same query twice with the same seed
    const result1 = await sceneQueryBuilder.execute({
      userId: 1,
      applyExclusions: false,
      sort: "random",
      sortDirection: "ASC",
      page: 1,
      perPage: 10,
      randomSeed: seed,
    });

    const result2 = await sceneQueryBuilder.execute({
      userId: 1,
      applyExclusions: false,
      sort: "random",
      sortDirection: "ASC",
      page: 1,
      perPage: 10,
      randomSeed: seed,
    });

    // Same seed should produce identical results
    if (result1.scenes.length >= 2 && result2.scenes.length >= 2) {
      const ids1 = result1.scenes.map((s) => s.id);
      const ids2 = result2.scenes.map((s) => s.id);
      expect(ids1).toEqual(ids2);
    }
  });

  it("should fetch scenes by IDs with full relations", async () => {
    // First get some scene IDs
    const initial = await sceneQueryBuilder.execute({
      userId: 1,
      applyExclusions: false,
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

  it("should not leak Stash user data for users without watch history", async () => {
    // Use a high user ID that is unlikely to have any WatchHistory records
    // This simulates a new Peek user viewing scenes for the first time
    const newUserId = 999999;

    const result = await sceneQueryBuilder.execute({
      userId: newUserId,
      applyExclusions: false, // Skip exclusions since this user has no exclusion records
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 10,
    });

    // For a user with no watch history, ALL user-specific fields should be defaults
    // (not the Stash user's values which may be non-zero)
    for (const scene of result.scenes) {
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
