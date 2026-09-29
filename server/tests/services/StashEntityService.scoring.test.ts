import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
// Import after mocking
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
    expect(sql).toContain("COALESCE(wh.oCount, 0) AS oCounter");
    expect(sql).not.toContain("s.oCounter");
  });

  it("returns the scoring input with the user's watch data", async () => {
    const lastPlayedAt = new Date("2026-09-01T00:00:00Z");
    const mockRows = [
      {
        id: "scene-1",
        stashInstanceId: "inst-a",
        studioId: "studio-1",
        oCounter: 5n,
        performerIds: "perf-1,perf-2",
        tagIds: "tag-1,tag-2,tag-3",
        playCount: 3,
        lastPlayedAt,
      },
      {
        id: "scene-2",
        stashInstanceId: "inst-b",
        studioId: null,
        oCounter: 0n,
        performerIds: null,
        tagIds: "tag-1",
        playCount: null,
        lastPlayedAt: null,
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
      oCounter: 5,
      playCount: 3,
      lastPlayedAt,
    });
    expect(result[1]).toEqual({
      id: "scene-2",
      instanceId: "inst-b",
      studioId: null,
      performerIds: [],
      tagIds: ["tag-1"],
      oCounter: 0,
      playCount: 0,
      lastPlayedAt: null,
    });
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
    expect(params).toEqual([USER, USER, "inst-a"]);
  });

  it("matches no scene when the user has no allowed instance", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    const result = await stashEntityService.getScenesForScoring(USER, []);

    expect(result).toEqual([]);
    const [sql] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
    expect(sql).toContain("1 = 0");
  });
});
