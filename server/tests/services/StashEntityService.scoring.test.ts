import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
// Import after mocking
import { KEPT_MIN_SECONDS } from "../../services/RankingComputeService.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { must } from "../helpers/must.js";

// Mock prisma before importing the service
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const mockPrisma = vi.mocked(prisma, true);
const USER = 11;

describe("StashEntityService.getScenesForScoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the viewer's O count, never Stash's counter", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    await stashEntityService.getScenesForScoring(USER, ["inst-a"]);

    const [sql] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
    expect(sql).toContain("COALESCE(wh.oCount, 0) AS oCount");
    expect(sql).not.toContain("s.oCounter");
  });

  it("returns the scoring input with the user's watch data", async () => {
    const lastPlayedAt = new Date("2026-09-01T00:00:00Z");
    const mockRows = [
      {
        id: "scene-1",
        stashInstanceId: "inst-a",
        studioId: "studio-1",
        performerIds: "perf-1,perf-2",
        tagIds: "tag-1,tag-2,tag-3",
        inheritedTagIds: "tag-9",
        oCount: 5n,
        lastPlayedAt,
        hasHistory: 1n,
        kept: 1n,
      },
      {
        id: "scene-2",
        stashInstanceId: "inst-b",
        studioId: null,
        performerIds: null,
        tagIds: "tag-1",
        inheritedTagIds: null,
        oCount: 0n,
        lastPlayedAt: null,
        hasHistory: 0n,
        kept: 0n,
      },
    ];

    mockPrisma.$queryRawUnsafe.mockResolvedValue(mockRows);

    const result = await stashEntityService.getScenesForScoring(USER, [
      "inst-a",
      "inst-b",
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "scene-1",
      instanceId: "inst-a",
      studioId: "studio-1",
      performerIds: ["perf-1", "perf-2"],
      tagIds: ["tag-1", "tag-2", "tag-3"],
      inheritedTagIds: ["tag-9"],
      oCount: 5,
      kept: true,
      hasHistory: true,
      lastPlayedAt,
    });
    expect(result[1]).toEqual({
      id: "scene-2",
      instanceId: "inst-b",
      studioId: null,
      performerIds: [],
      tagIds: ["tag-1"],
      inheritedTagIds: [],
      oCount: 0,
      kept: false,
      hasHistory: false,
      lastPlayedAt: null,
    });
  });

  it("reads a last-played time stored as epoch milliseconds or as text as a Date", async () => {
    const at = Date.UTC(2026, 8, 1);
    const row = (id: string, lastPlayedAt: unknown) => ({
      id,
      stashInstanceId: "inst-a",
      studioId: null,
      performerIds: null,
      tagIds: null,
      inheritedTagIds: null,
      oCount: 0n,
      lastPlayedAt,
      hasHistory: 1n,
      kept: 1n,
    });
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      row("number", at),
      row("text", "2026-09-01T00:00:00.000Z"),
      row("unreadable", "yesterday-ish"),
    ]);

    const result = await stashEntityService.getScenesForScoring(USER, [
      "inst-a",
    ]);

    expect(result.map((s) => s.lastPlayedAt)).toEqual([
      new Date(at),
      new Date(at),
      null,
    ]);
  });

  it("applies the user's exclusions, allowed instances and watch history in SQL", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    await stashEntityService.getScenesForScoring(USER, ["inst-a"]);

    const [sql, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
    expect(sql).toContain("LEFT JOIN UserExcludedEntity e ON e.userId = ?");
    expect(sql).toContain("e.instanceId = s.stashInstanceId");
    expect(sql).toContain("e.id IS NULL");
    expect(sql).toContain("s.deletedAt IS NULL");
    expect(sql).toContain(
      "LEFT JOIN WatchHistory wh ON wh.userId = ? AND wh.instanceId = s.stashInstanceId AND wh.sceneId = s.id"
    );
    expect(sql).toContain("s.stashInstanceId IN (?)");
    expect(params).toEqual([KEPT_MIN_SECONDS, USER, USER, "inst-a"]);
  });

  it("reads the inherited tags from their junction and counts a kept scene as the rankings do", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    await stashEntityService.getScenesForScoring(USER, ["inst-a"]);

    const [sql] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
    expect(sql).toContain("FROM SceneInheritedTag it");
    expect(sql).toContain(
      "it.sceneId = s.id AND it.sceneInstanceId = s.stashInstanceId"
    );
    expect(sql).not.toContain("inheritedTagIds)");
    expect(sql).toContain("wh.id IS NOT NULL AS hasHistory");
    expect(sql).toContain(
      "wh.playCount > 0 OR wh.oCount > 0 OR wh.playDuration >= ?"
    );
  });

  it("matches no scene when the user has no allowed instance", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    const result = await stashEntityService.getScenesForScoring(USER, []);

    expect(result).toEqual([]);
    const [sql] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
    expect(sql).toContain("1 = 0");
  });
});
