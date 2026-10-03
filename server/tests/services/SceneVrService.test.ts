/**
 * Unit tests for SceneVrService: where the instance's VR settings come from,
 * the statements' shape and bound values, the short-circuits that skip them,
 * and what reaches detectVrProjection. The SQL itself runs against real
 * SQLite in integration/api/scenes-vr.integration.test.ts (the effective
 * tag's rules, descendants, soft-deleted tags, another instance's tag).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { getSceneVr } from "../../services/SceneVrService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { stashInstanceRow } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getConfig: vi.fn(),
    getAllConfigs: vi.fn(),
  },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockManager = vi.mocked(stashInstanceManager, true);

/** The SQL text and bound params of the nth raw query. */
function call(n: number): { sql: string; params: unknown[] } {
  const [sql, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[n]) as [
    string,
    ...unknown[],
  ];
  return { sql, params };
}

/** One row of the sibling statement: the scene's file and one of its tags. */
interface TagRow {
  filePath: string | null;
  fileWidth: number | null;
  fileHeight: number | null;
  name: string | null;
  aliases: string | null;
}

function tagRow(fields: Partial<TagRow>): TagRow {
  return {
    filePath: null,
    fileWidth: null,
    fileHeight: null,
    name: null,
    aliases: null,
    ...fields,
  };
}

function instanceWith(vrTagId: string | null, stashVrTag: string | null) {
  mockPrisma.stashInstance.findUnique.mockResolvedValue(
    stashInstanceRow({ id: "inst-a", vrTagId, stashVrTag })
  );
}

describe("getSceneVr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  it("reads the instance's VR settings by primary key", async () => {
    instanceWith(null, "VR");

    await getSceneVr("42", "inst-a");

    expect(mockPrisma.stashInstance.findUnique).toHaveBeenCalledWith({
      where: { id: "inst-a" },
      select: { vrTagId: true, stashVrTag: true },
    });
  });

  it("an instance with no VR tag gives null without querying tags", async () => {
    instanceWith(null, null);

    await expect(getSceneVr("42", "inst-a")).resolves.toBeNull();
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("an unknown instance gives null without querying tags", async () => {
    mockPrisma.stashInstance.findUnique.mockResolvedValue(null);

    await expect(getSceneVr("42", "inst-a")).resolves.toBeNull();
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("the instance's VR settings are read from the database, not the instance manager", async () => {
    // The manager's copy is stale: sync does not reload it
    mockManager.getConfig.mockReturnValue(
      stashInstanceRow({ id: "inst-a", vrTagId: "5", stashVrTag: "VR" })
    );
    instanceWith(null, null);

    await expect(getSceneVr("42", "inst-a")).resolves.toBeNull();
    expect(mockManager.getConfig).not.toHaveBeenCalled();
    expect(mockManager.getAllConfigs).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("walks up from the scene's own live tags in one recursive statement, every value bound", async () => {
    instanceWith("7", "Virtual Reality");

    await getSceneVr("42", "inst-a");

    const { sql, params } = call(0);
    expect(sql).toMatch(/WITH RECURSIVE/);
    // UNION, not UNION ALL, ends a cycle in the tag hierarchy
    expect(sql).toMatch(/\bUNION\b(?!\s+ALL)/);
    expect(sql).not.toMatch(/UNION\s+ALL/);
    expect(sql).toContain("json_valid(t.parentIds)");
    // The override, then the lowest id named stashVrTag, as numbers
    expect(sql).toMatch(/ORDER BY CAST\(\w+\.id AS INTEGER\)/);
    // Every StashTag read keeps live tags only: the override, the name,
    // the scene's tags and each step up
    expect(sql.match(/deletedAt IS NULL/g)).toHaveLength(4);
    expect(sql).not.toContain("inst-a");
    expect(sql).not.toContain("Virtual Reality");
    expect(params).toEqual([
      "7",
      "inst-a",
      "Virtual Reality",
      "inst-a",
      "42",
      "inst-a",
      "inst-a",
      "inst-a",
    ]);
  });

  it("an override alone binds no name, and Stash's tag alone no override", async () => {
    instanceWith("7", null);
    await getSceneVr("42", "inst-a");
    expect(call(0).params.slice(0, 4)).toEqual(["7", "inst-a", null, "inst-a"]);

    mockPrisma.$queryRawUnsafe.mockClear();
    instanceWith(null, "VR");
    await getSceneVr("42", "inst-a");
    expect(call(0).params.slice(0, 4)).toEqual([
      null,
      "inst-a",
      "VR",
      "inst-a",
    ]);
  });

  it("a scene without the tag or a descendant of it gets null, reading nothing more", async () => {
    instanceWith("7", null);
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(getSceneVr("42", "inst-a")).resolves.toBeNull();
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("a VR scene reads its live tag names and aliases and file in a sibling statement", async () => {
    instanceWith("7", null);
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ hit: 1 }])
      .mockResolvedValueOnce([]);

    await getSceneVr("42", "inst-a");

    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    const { sql, params } = call(1);
    expect(sql).toContain("StashScene");
    expect(sql).toContain("SceneTag");
    expect(sql).toMatch(/deletedAt IS NULL/);
    expect(sql).not.toContain("42");
    expect(params).toEqual(["42", "inst-a"]);
  });

  it("a VR scene gets its projection from its tag names and aliases", async () => {
    instanceWith("7", null);
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ hit: 1 }])
      .mockResolvedValueOnce([
        tagRow({ filePath: "/v/scene_180_LR.mp4", name: "VR" }),
        tagRow({
          filePath: "/v/scene_180_LR.mp4",
          name: "Fisheye lens",
          aliases: JSON.stringify(["MKX200"]),
        }),
      ]);

    await expect(getSceneVr("42", "inst-a")).resolves.toEqual({
      projection: "FISHEYE_200_LR",
      source: "tag",
    });
  });

  it("without projection tags, the file name, then the frame's shape decide", async () => {
    instanceWith("7", null);
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ hit: 1 }])
      .mockResolvedValueOnce([
        tagRow({ filePath: "/v/x_360_TB.mkv", name: "VR" }),
      ]);
    await expect(getSceneVr("42", "inst-a")).resolves.toEqual({
      projection: "360_TB",
      source: "filename",
    });

    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ hit: 1 }])
      .mockResolvedValueOnce([
        tagRow({ filePath: "/v/x.mp4", fileWidth: 5760, fileHeight: 5760 }),
      ]);
    await expect(getSceneVr("42", "inst-a")).resolves.toEqual({
      projection: "360_TB",
      source: "shape",
    });
  });

  it("a row with no live tag and unreadable aliases feed nothing", async () => {
    instanceWith("7", null);
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ hit: 1 }])
      .mockResolvedValueOnce([
        // A scene with no live tag: the file alone, name null
        tagRow({ filePath: "/v/x.mp4", fileWidth: 8192, fileHeight: 4096 }),
        tagRow({
          filePath: "/v/x.mp4",
          fileWidth: 8192,
          fileHeight: 4096,
          name: "VR",
          aliases: "not json",
        }),
      ]);

    await expect(getSceneVr("42", "inst-a")).resolves.toEqual({
      projection: "180_LR",
      source: "shape",
    });
  });
});
