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
});
