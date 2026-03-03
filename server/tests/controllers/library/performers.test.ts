import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockReq, mockRes } from "../../helpers/controllerTestUtils.js";
import { createMockPerformer } from "../../helpers/mockDataGenerators.js";

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock("../../../prisma/singleton.js", () => ({
  default: {
    performerRating: { findMany: vi.fn() },
  },
}));

vi.mock("../../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getAllPerformers: vi.fn(),
    getPerformerIdsByStudios: vi.fn().mockResolvedValue(new Set()),
    getPerformerIdsByGroups: vi.fn().mockResolvedValue(new Set()),
  },
}));

vi.mock("../../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    get: vi.fn(),
    getDefaultConfig: vi.fn().mockReturnValue({ id: "default" }),
  },
}));

vi.mock("../../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: { filterExcluded: vi.fn().mockImplementation((items) => items) },
}));

vi.mock("../../../services/PerformerQueryBuilder.js", () => ({
  performerQueryBuilder: { execute: vi.fn() },
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("../../../services/UserStatsService.js", () => ({
  userStatsService: {
    getPerformerStats: vi.fn().mockResolvedValue(new Map()),
  },
}));

vi.mock("../../../utils/entityInstanceId.js", () => ({
  getEntityInstanceId: vi.fn().mockResolvedValue("default"),
  disambiguateEntityNames: vi.fn().mockImplementation((entities) => entities),
}));

vi.mock("@peek/shared-types/instanceAwareId.js", () => ({
  coerceEntityRefs: vi.fn().mockImplementation((ids) => ids),
}));

vi.mock("../../../utils/hierarchyUtils.js", () => ({
  hydrateEntityTags: vi.fn().mockImplementation((items) => Promise.resolve(items)),
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../utils/seededRandom.js", () => ({
  parseRandomSort: vi.fn().mockImplementation((field) => ({ sortField: field, randomSeed: undefined })),
}));

vi.mock("../../../utils/stashUrl.js", () => ({
  buildStashEntityUrl: vi.fn().mockImplementation((_type, id) => `http://stash/performers/${id}`),
}));

// ---------------------------------------------------------------------------
// Imports AFTER mocks
// ---------------------------------------------------------------------------

import {
  parseCareerLength,
  mergePerformersWithUserData,
  applyPerformerFilters,
  findPerformers,
  findPerformersMinimal,
  updatePerformer,
} from "../../../controllers/library/performers.js";
import prisma from "../../../prisma/singleton.js";
import { performerQueryBuilder } from "../../../services/PerformerQueryBuilder.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import { stashInstanceManager } from "../../../services/StashInstanceManager.js";
import { userStatsService } from "../../../services/UserStatsService.js";
import { getEntityInstanceId } from "../../../utils/entityInstanceId.js";
import { entityExclusionHelper } from "../../../services/EntityExclusionHelper.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// 1. parseCareerLength  (pure function)
// ===========================================================================

describe("parseCareerLength", () => {
  it('parses "YYYY-present" as years from start to current year', () => {
    expect(parseCareerLength("2015-present")).toBe(CURRENT_YEAR - 2015);
  });

  it('parses "YYYY-" (trailing dash) same as present', () => {
    expect(parseCareerLength("2015-")).toBe(CURRENT_YEAR - 2015);
  });

  it("handles spaces around the dash", () => {
    expect(parseCareerLength("2015 - present")).toBe(CURRENT_YEAR - 2015);
  });

  it('handles alternate keywords: "current", "now"', () => {
    expect(parseCareerLength("2015-current")).toBe(CURRENT_YEAR - 2015);
    expect(parseCareerLength("2015-now")).toBe(CURRENT_YEAR - 2015);
  });

  it('parses "YYYY-YYYY" as a fixed range', () => {
    expect(parseCareerLength("2010-2018")).toBe(8);
  });

  it("handles spaces around dash in fixed range", () => {
    expect(parseCareerLength("2010 - 2018")).toBe(8);
  });

  it("parses a bare number as years", () => {
    expect(parseCareerLength("5")).toBe(5);
  });

  it('parses "N years" as years', () => {
    expect(parseCareerLength("5 years")).toBe(5);
  });

  it('parses "N yrs" as years', () => {
    expect(parseCareerLength("10 yrs")).toBe(10);
  });

  it("parses standalone 4-digit year as active from that year", () => {
    expect(parseCareerLength("2015")).toBe(CURRENT_YEAR - 2015);
  });

  it("returns null for null input", () => {
    expect(parseCareerLength(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseCareerLength(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseCareerLength("")).toBeNull();
  });

  it("returns null for invalid string", () => {
    expect(parseCareerLength("abc")).toBeNull();
  });

  it("returns null for a future year", () => {
    expect(parseCareerLength(`${CURRENT_YEAR + 5}-present`)).toBeNull();
  });
});

// ===========================================================================
// 2. mergePerformersWithUserData
// ===========================================================================

describe("mergePerformersWithUserData", () => {
  it("merges ratings and stats onto performers using composite keys", async () => {
    const performer = createMockPerformer({ id: "p1", instanceId: "inst1" });

    vi.mocked(prisma.performerRating.findMany).mockResolvedValue([
      { performerId: "p1", instanceId: "inst1", userId: 1, rating: 80, favorite: true } as any,
    ]);

    const statsMap = new Map();
    statsMap.set("p1\0inst1", {
      oCounter: 5,
      playCount: 12,
      lastPlayedAt: "2026-01-01T00:00:00Z",
      lastOAt: "2026-01-02T00:00:00Z",
    });
    vi.mocked(userStatsService.getPerformerStats).mockResolvedValue(statsMap);

    const result = await mergePerformersWithUserData([performer], 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      rating: 80,
      rating100: 80,
      favorite: true,
      o_counter: 5,
      play_count: 12,
      last_played_at: "2026-01-01T00:00:00Z",
      last_o_at: "2026-01-02T00:00:00Z",
    });
  });

  it("returns defaults when no rating or stats exist", async () => {
    const performer = createMockPerformer({ id: "p2", instanceId: "default" });

    vi.mocked(prisma.performerRating.findMany).mockResolvedValue([]);
    vi.mocked(userStatsService.getPerformerStats).mockResolvedValue(new Map());

    const result = await mergePerformersWithUserData([performer], 1);

    expect(result[0]!.o_counter).toBe(0);
    expect(result[0]!.play_count).toBe(0);
    expect(result[0]!.last_played_at).toBeNull();
  });

  it("returns empty array for empty input", async () => {
    vi.mocked(prisma.performerRating.findMany).mockResolvedValue([]);
    vi.mocked(userStatsService.getPerformerStats).mockResolvedValue(new Map());

    const result = await mergePerformersWithUserData([], 1);
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// 3. applyPerformerFilters
// ===========================================================================

describe("applyPerformerFilters", () => {
  it("returns all performers when filters is null", async () => {
    const performers = [createMockPerformer(), createMockPerformer()];
    const result = await applyPerformerFilters(performers, null);
    expect(result).toHaveLength(2);
  });

  it("returns all performers when filters is undefined", async () => {
    const performers = [createMockPerformer()];
    const result = await applyPerformerFilters(performers, undefined);
    expect(result).toHaveLength(1);
  });

  // --- ids ---
  it("filters by ids", async () => {
    const performers = [
      createMockPerformer({ id: "a" }),
      createMockPerformer({ id: "b" }),
      createMockPerformer({ id: "c" }),
    ];
    const result = await applyPerformerFilters(performers, {
      ids: { value: ["a", "c"], modifier: "INCLUDES" },
    });
    expect(result.map((p) => p.id)).toEqual(["a", "c"]);
  });

  // --- favorite ---
  it("filters by favorite=true", async () => {
    const performers = [
      createMockPerformer({ id: "fav", favorite: true }),
      createMockPerformer({ id: "nonfav", favorite: false }),
    ];
    const result = await applyPerformerFilters(performers, { favorite: true });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("fav");
  });

  // --- gender ---
  it("filters gender with EQUALS", async () => {
    const performers = [
      createMockPerformer({ id: "m", gender: "MALE" }),
      createMockPerformer({ id: "f", gender: "FEMALE" }),
    ];
    const result = await applyPerformerFilters(performers, {
      gender: { value: "FEMALE", modifier: "EQUALS" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("f");
  });

  it("filters gender with NOT_EQUALS", async () => {
    const performers = [
      createMockPerformer({ id: "m", gender: "MALE" }),
      createMockPerformer({ id: "f", gender: "FEMALE" }),
    ];
    const result = await applyPerformerFilters(performers, {
      gender: { value: "MALE", modifier: "NOT_EQUALS" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("f");
  });

  // --- tags ---
  it("filters tags with INCLUDES (any match)", async () => {
    const performers = [
      createMockPerformer({ id: "t1", tags: [{ id: "tag1", name: "A", image_path: null }] }),
      createMockPerformer({ id: "t2", tags: [{ id: "tag2", name: "B", image_path: null }] }),
    ];
    const result = await applyPerformerFilters(performers, {
      tags: { value: ["tag1"], modifier: "INCLUDES" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("t1");
  });

  it("filters tags with INCLUDES_ALL", async () => {
    const performers = [
      createMockPerformer({
        id: "both",
        tags: [
          { id: "tag1", name: "A", image_path: null },
          { id: "tag2", name: "B", image_path: null },
        ],
      }),
      createMockPerformer({ id: "one", tags: [{ id: "tag1", name: "A", image_path: null }] }),
    ];
    const result = await applyPerformerFilters(performers, {
      tags: { value: ["tag1", "tag2"], modifier: "INCLUDES_ALL" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("both");
  });

  it("filters tags with EXCLUDES", async () => {
    const performers = [
      createMockPerformer({ id: "has", tags: [{ id: "tag1", name: "A", image_path: null }] }),
      createMockPerformer({ id: "clean", tags: [] }),
    ];
    const result = await applyPerformerFilters(performers, {
      tags: { value: ["tag1"], modifier: "EXCLUDES" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("clean");
  });

  // --- studios (async dependency) ---
  it("filters by studios using stashEntityService", async () => {
    vi.mocked(stashEntityService.getPerformerIdsByStudios).mockResolvedValue(new Set(["p1"]));
    const performers = [
      createMockPerformer({ id: "p1" }),
      createMockPerformer({ id: "p2" }),
    ];
    const result = await applyPerformerFilters(performers, {
      studios: { value: ["studio1"], modifier: "INCLUDES" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("p1");
  });

  // --- groups (async dependency) ---
  it("filters by groups using stashEntityService", async () => {
    vi.mocked(stashEntityService.getPerformerIdsByGroups).mockResolvedValue(new Set(["p2"]));
    const performers = [
      createMockPerformer({ id: "p1" }),
      createMockPerformer({ id: "p2" }),
    ];
    const result = await applyPerformerFilters(performers, {
      groups: { value: ["group1"], modifier: "INCLUDES" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("p2");
  });

  // --- rating100 ---
  it("filters rating100 with GREATER_THAN", async () => {
    const performers = [
      createMockPerformer({ id: "high", rating100: 80 }),
      createMockPerformer({ id: "low", rating100: 40 }),
    ];
    const result = await applyPerformerFilters(performers, {
      rating100: { value: 50, modifier: "GREATER_THAN" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("high");
  });

  it("filters rating100 with BETWEEN", async () => {
    const performers = [
      createMockPerformer({ id: "in", rating100: 60 }),
      createMockPerformer({ id: "out", rating100: 90 }),
    ];
    const result = await applyPerformerFilters(performers, {
      rating100: { value: 50, value2: 70, modifier: "BETWEEN" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("in");
  });

  // --- scene_count ---
  it("filters scene_count with EQUALS", async () => {
    const performers = [
      createMockPerformer({ id: "match", scene_count: 10 }),
      createMockPerformer({ id: "no", scene_count: 5 }),
    ];
    const result = await applyPerformerFilters(performers, {
      scene_count: { value: 10, modifier: "EQUALS" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("match");
  });

  // --- name (text) ---
  it("filters name with INCLUDES (searches name + aliases)", async () => {
    const performers = [
      createMockPerformer({ id: "alice", name: "Alice", alias_list: ["Al"] }),
      createMockPerformer({ id: "bob", name: "Bob", alias_list: ["Bobby"] }),
    ];
    const result = await applyPerformerFilters(performers, {
      name: { value: "bob", modifier: "INCLUDES" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("bob");
  });

  it("filters name with EQUALS (exact match on name only)", async () => {
    const performers = [
      createMockPerformer({ id: "exact", name: "alice" }),
      createMockPerformer({ id: "alias", name: "Bob", alias_list: ["alice"] }),
    ];
    const result = await applyPerformerFilters(performers, {
      name: { value: "alice", modifier: "EQUALS" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("exact");
  });

  // --- eye_color (enum) ---
  it("filters eye_color with EQUALS (case-insensitive)", async () => {
    const performers = [
      createMockPerformer({ id: "blue", eye_color: "Blue" }),
      createMockPerformer({ id: "brown", eye_color: "Brown" }),
    ];
    const result = await applyPerformerFilters(performers, {
      eye_color: { value: "blue", modifier: "EQUALS" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("blue");
  });

  it("filters eye_color with NOT_EQUALS", async () => {
    const performers = [
      createMockPerformer({ id: "blue", eye_color: "Blue" }),
      createMockPerformer({ id: "brown", eye_color: "Brown" }),
    ];
    const result = await applyPerformerFilters(performers, {
      eye_color: { value: "blue", modifier: "NOT_EQUALS" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("brown");
  });

  // --- height (numeric) ---
  it("filters height with GREATER_THAN", async () => {
    const performers = [
      createMockPerformer({ id: "tall", height_cm: 185 }),
      createMockPerformer({ id: "short", height_cm: 160 }),
    ];
    const result = await applyPerformerFilters(performers, {
      height: { value: 170, modifier: "GREATER_THAN" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("tall");
  });

  // --- age (computed from birthdate) ---
  it("filters age with GREATER_THAN", async () => {
    const young = `${CURRENT_YEAR - 20}-06-15`;
    const old = `${CURRENT_YEAR - 40}-06-15`;
    const performers = [
      createMockPerformer({ id: "young", birthdate: young }),
      createMockPerformer({ id: "old", birthdate: old }),
    ];
    const result = await applyPerformerFilters(performers, {
      age: { value: 30, modifier: "GREATER_THAN" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("old");
  });

  // --- career_length (uses parseCareerLength) ---
  it("filters career_length with GREATER_THAN", async () => {
    const performers = [
      createMockPerformer({ id: "long", career_length: "2010-present" }),
      createMockPerformer({ id: "short", career_length: "2022-present" }),
    ];
    const result = await applyPerformerFilters(performers, {
      career_length: { value: 10, modifier: "GREATER_THAN" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("long");
  });

  // --- birth_year ---
  it("filters birth_year with BETWEEN", async () => {
    const performers = [
      createMockPerformer({ id: "in", birthdate: "1990-05-10" }),
      createMockPerformer({ id: "out", birthdate: "1975-01-01" }),
    ];
    const result = await applyPerformerFilters(performers, {
      birth_year: { value: 1985, value2: 1995, modifier: "BETWEEN" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("in");
  });

  // --- created_at (date) ---
  it("filters created_at with GREATER_THAN", async () => {
    const performers = [
      createMockPerformer({ id: "new", created_at: "2026-02-01T00:00:00Z" }),
      createMockPerformer({ id: "old", created_at: "2024-01-01T00:00:00Z" }),
    ];
    const result = await applyPerformerFilters(performers, {
      created_at: { value: "2025-01-01T00:00:00Z", modifier: "GREATER_THAN" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("new");
  });
});

// ===========================================================================
// 4. HTTP handlers
// ===========================================================================

describe("findPerformers", () => {
  it("returns paginated performers from query builder", async () => {
    const performers = [createMockPerformer({ id: "p1", name: "Alice" })];
    vi.mocked(performerQueryBuilder.execute).mockResolvedValue({ performers, total: 1 });

    const req = mockReq(
      { filter: { page: 1, per_page: 20 } },
      {},
      { id: 1, role: "USER" }
    );
    const res = mockRes();

    await findPerformers(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getBody();
    expect(body.findPerformers.count).toBe(1);
    expect(body.findPerformers.performers).toHaveLength(1);
    expect(body.findPerformers.performers[0].stashUrl).toBe("http://stash/performers/p1");
  });

  it("returns 400 for ambiguous single-ID lookup (multiple instances)", async () => {
    const performers = [
      createMockPerformer({ id: "p1", instanceId: "inst1" }),
      createMockPerformer({ id: "p1", instanceId: "inst2" }),
    ];
    vi.mocked(performerQueryBuilder.execute).mockResolvedValue({ performers, total: 2 });

    const req = mockReq(
      { ids: ["p1"] },
      {},
      { id: 1, role: "USER" }
    );
    const res = mockRes();

    await findPerformers(req, res);

    expect(res._getStatus()).toBe(400);
    expect(res._getBody()).toMatchObject({ error: "Ambiguous lookup" });
  });

  it("returns 500 when query builder throws", async () => {
    vi.mocked(performerQueryBuilder.execute).mockRejectedValue(new Error("DB down"));

    const req = mockReq({}, {}, { id: 1, role: "USER" });
    const res = mockRes();

    await findPerformers(req, res);

    expect(res._getStatus()).toBe(500);
    expect(res._getBody()).toMatchObject({ error: "Failed to find performers" });
  });
});

describe("findPerformersMinimal", () => {
  it("returns minimal performers with search and sort", async () => {
    const performers = [
      createMockPerformer({ id: "p1", name: "Alice" }),
      createMockPerformer({ id: "p2", name: "Bob" }),
    ];
    vi.mocked(stashEntityService.getAllPerformers).mockResolvedValue(performers);

    const req = mockReq(
      { filter: { q: "alice", sort: "name", direction: "ASC" } },
      {},
      { id: 1, role: "USER" }
    );
    const res = mockRes();

    await findPerformersMinimal(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getBody();
    expect(body.performers).toHaveLength(1);
    expect(body.performers[0].name).toBe("Alice");
  });

  it("applies count_filter to exclude performers below threshold", async () => {
    const performers = [
      createMockPerformer({ id: "p1", scene_count: 10 }),
      createMockPerformer({ id: "p2", scene_count: 0 }),
    ];
    vi.mocked(stashEntityService.getAllPerformers).mockResolvedValue(performers);

    const req = mockReq(
      { count_filter: { min_scene_count: 5 } },
      {},
      { id: 1, role: "USER" }
    );
    const res = mockRes();

    await findPerformersMinimal(req, res);

    expect(res._getStatus()).toBe(200);
    expect(res._getBody().performers).toHaveLength(1);
    expect(res._getBody().performers[0].id).toBe("p1");
  });

  it("skips exclusion filtering for admin users", async () => {
    vi.mocked(stashEntityService.getAllPerformers).mockResolvedValue([
      createMockPerformer({ id: "p1" }),
    ]);

    const req = mockReq({}, {}, { id: 1, role: "ADMIN" });
    const res = mockRes();

    await findPerformersMinimal(req, res);

    expect(entityExclusionHelper.filterExcluded).not.toHaveBeenCalled();
    expect(res._getStatus()).toBe(200);
  });

  it("returns 500 when service throws", async () => {
    vi.mocked(stashEntityService.getAllPerformers).mockRejectedValue(new Error("fail"));

    const req = mockReq({}, {}, { id: 1, role: "USER" });
    const res = mockRes();

    await findPerformersMinimal(req, res);

    expect(res._getStatus()).toBe(500);
    expect(res._getBody()).toMatchObject({ error: "Failed to find performers" });
  });
});

describe("updatePerformer", () => {
  it("updates a performer via the stash instance", async () => {
    const mockStash = {
      performerUpdate: vi.fn().mockResolvedValue({
        performerUpdate: { id: "p1", name: "Updated" },
      }),
    };
    vi.mocked(getEntityInstanceId).mockResolvedValue("default");
    vi.mocked(stashInstanceManager.get).mockReturnValue(mockStash as any);

    const req = mockReq({ name: "Updated" }, { id: "p1" }, { id: 1, role: "ADMIN" });
    const res = mockRes();

    await updatePerformer(req, res);

    expect(res._getStatus()).toBe(200);
    expect(res._getBody()).toMatchObject({ success: true });
    expect(mockStash.performerUpdate).toHaveBeenCalledWith({
      input: { id: "p1", name: "Updated" },
    });
  });

  it("returns 404 when stash instance is not found", async () => {
    vi.mocked(getEntityInstanceId).mockResolvedValue("missing");
    vi.mocked(stashInstanceManager.get).mockReturnValue(undefined as any);

    const req = mockReq({}, { id: "p1" }, { id: 1, role: "ADMIN" });
    const res = mockRes();

    await updatePerformer(req, res);

    expect(res._getStatus()).toBe(404);
    expect(res._getBody()).toMatchObject({ error: "Stash instance not found for performer" });
  });

  it("returns 500 when stash API throws", async () => {
    vi.mocked(getEntityInstanceId).mockResolvedValue("default");
    vi.mocked(stashInstanceManager.get).mockReturnValue({
      performerUpdate: vi.fn().mockRejectedValue(new Error("network error")),
    } as any);

    const req = mockReq({}, { id: "p1" }, { id: 1, role: "ADMIN" });
    const res = mockRes();

    await updatePerformer(req, res);

    expect(res._getStatus()).toBe(500);
    expect(res._getBody()).toMatchObject({ error: "Failed to update performer" });
  });
});
