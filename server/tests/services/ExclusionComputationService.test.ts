/**
 * Unit tests for ExclusionComputationService (item 13).
 *
 * The compute is raw SQL end to end: resolution (recursive CTE for tag and
 * studio descendants), inversion, cascades, content rules and the empty phase
 * all go through $queryRawUnsafe with bound JSON, and the closures and
 * exclusion sets live in TEMP tables filled through $executeRawUnsafe. These
 * tests route $queryRawUnsafe by table name (never by call order) and assert
 * on the rows the write phase receives.
 *
 * The compute runs on the single-connection compute client and the write
 * swap on the main client; both are the one mocked prisma here, so fakeRaw
 * routes the compute's queries whichever client issues them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  disconnectComputeClient,
  getComputeClient,
} from "../../prisma/computeClient.js";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";

// Mock UserInstanceService before importing service
vi.mock("../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["A"]),
  buildInstanceFilterClause: vi
    .fn()
    .mockImplementation((ids: string[], col: string = "s.stashInstanceId") => {
      if (ids.length === 0) return { sql: "1 = 0", params: [] };
      const placeholders = ids.map(() => "?").join(", ");
      return { sql: `${col} IN (${placeholders})`, params: ids };
    }),
}));

// Mock prisma before importing service
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    userExcludedEntity: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    userEntityStats: {
      upsert: vi.fn(),
    },
    userContentRestriction: {
      findMany: vi.fn(),
    },
    userHiddenEntity: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    // Only the stats phase uses Prisma delegates on entity tables (counts);
    // resolution, cascades, content rules and the empty phase are raw SQL.
    stashScene: { count: vi.fn() },
    stashPerformer: { count: vi.fn() },
    stashStudio: { count: vi.fn() },
    stashTag: { count: vi.fn() },
    stashGroup: { count: vi.fn() },
    stashGallery: { count: vi.fn() },
    stashImage: { count: vi.fn() },
    stashClip: { count: vi.fn() },
  },
}));

// The compute client resolves to the same mocked prisma
vi.mock("../../prisma/computeClient.js", async () => {
  const { default: mocked } = await import("../../prisma/singleton.js");
  return {
    getComputeClient: vi.fn(async () => mocked),
    disconnectComputeClient: vi.fn(async () => undefined),
  };
});

const mockPrisma = prisma as any;
const mockAllowedInstances = vi.mocked(getUserAllowedInstanceIds);

/** Route $queryRawUnsafe by SQL shape; unmatched queries return no rows. */
function fakeRaw(routes: Array<[RegExp, unknown[]]>) {
  mockPrisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
    const hit = routes.find(([re]) => re.test(sql));
    return hit ? hit[1] : [];
  });
}

/** Every $queryRawUnsafe call as [sql, ...params]. */
function rawCalls(): Array<[string, ...unknown[]]> {
  return mockPrisma.$queryRawUnsafe.mock.calls as Array<[string, ...unknown[]]>;
}

/** Every $executeRawUnsafe call as [sql, ...params] (temp-table fills). */
function execCalls(): Array<[string, ...unknown[]]> {
  return mockPrisma.$executeRawUnsafe.mock.calls as Array<
    [string, ...unknown[]]
  >;
}

function queriesMatching(re: RegExp) {
  return rawCalls().filter((c) => re.test(String(c[0])));
}

/** Rows handed to the write phase (createMany payloads, flattened). */
function createdRows(): Array<{
  userId: number;
  entityType: string;
  entityId: string;
  instanceId: string;
  reason: string;
}> {
  return mockPrisma.userExcludedEntity.createMany.mock.calls.flatMap(
    (c: any) => c[0].data || []
  );
}

function rowKeys(rows: ReturnType<typeof createdRows>): Set<string> {
  return new Set(
    rows.map(
      (r) => `${r.entityType}:${r.entityId}@${r.instanceId ?? ""}:${r.reason}`
    )
  );
}

/** Upsert payloads from addHiddenEntity as the same keys. */
function upsertKeys(): Set<string> {
  return new Set(
    mockPrisma.userExcludedEntity.upsert.mock.calls.map((c: any) => {
      const w = c[0].where.userId_entityType_entityId_instanceId;
      return `${w.entityType}:${w.entityId}@${w.instanceId}:${c[0].create.reason}`;
    })
  );
}

/** Default mocks for a full, empty recompute of a USER on instance A. */
function setupPipeline(allowed: string[] = ["A"]) {
  vi.clearAllMocks();
  mockAllowedInstances.mockResolvedValue(allowed);
  mockPrisma.user.findUnique.mockResolvedValue({ role: "USER" });
  mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
  mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
  mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
  mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
  mockPrisma.userEntityStats.upsert.mockResolvedValue({});
  mockPrisma.$queryRaw.mockResolvedValue([]);
  mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  mockPrisma.$executeRaw.mockResolvedValue(undefined);
  mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
  for (const model of [
    "stashScene",
    "stashPerformer",
    "stashStudio",
    "stashTag",
    "stashGroup",
    "stashGallery",
    "stashImage",
    "stashClip",
  ]) {
    mockPrisma[model].count.mockResolvedValue(0);
  }
  mockPrisma.$transaction.mockImplementation(async (callback: any) => {
    return callback(mockPrisma);
  });
}

function restriction(
  entityType: string,
  mode: string,
  entityIds: string[],
  restrictEmpty = false
) {
  return {
    userId: 1,
    entityType,
    mode,
    entityIds: JSON.stringify(entityIds),
    restrictEmpty,
  };
}

// Route shapes (by table name, never by call order)
const RESOLVE_TAG = /CROSS JOIN StashTag t ON/;
const RESOLVE_STUDIO = /CROSS JOIN StashStudio t ON/;
const RESOLVE_GROUP = /CROSS JOIN StashGroup t ON/;
const RESOLVE_GALLERY = /CROSS JOIN StashGallery t ON/;
const RESOLVE_PERFORMER = /CROSS JOIN StashPerformer t ON/;
const RESOLVE_SCENE = /CROSS JOIN StashScene t ON/;
const RESOLVE_IMAGE = /CROSS JOIN StashImage t ON/;
const INVERT_TAG =
  /FROM StashTag t[\s\S]*NOT EXISTS \(SELECT 1 FROM _peek_refs/;
const INVERT_GALLERY =
  /FROM StashGallery t[\s\S]*NOT EXISTS \(SELECT 1 FROM _peek_refs/;
const INVERT_STUDIO =
  /FROM StashStudio t[\s\S]*NOT EXISTS \(SELECT 1 FROM _peek_refs/;
const EDGE_SCENE_TAG = /FROM SceneTag j/;
const EDGE_SCENE_PERFORMER = /FROM ScenePerformer j/;
const EDGE_GALLERY_TAG = /FROM GalleryTag j/;
const EDGE_IMAGE_TAG = /FROM ImageTag j/;
const EDGE_CLIP_TAG = /FROM ClipTag j/;
const EDGE_CLIP_PRIMARY = /FROM StashClip x/;
const EDGE_GALLERY_PERFORMER = /FROM GalleryPerformer j/;
const EDGE_IMAGE_PERFORMER = /FROM ImagePerformer j/;
const EDGE_STUDIO_SCENE =
  /FROM StashScene x[\s\S]*JOIN _peek_refs r ON r\.id = x\.studioId/;
const EDGE_STUDIO_GALLERY =
  /FROM StashGallery x[\s\S]*JOIN _peek_refs r ON r\.id = x\.studioId/;
const EDGE_STUDIO_IMAGE =
  /FROM StashImage x[\s\S]*JOIN _peek_refs r ON r\.id = x\.studioId/;
const EDGE_INHERITED =
  /FROM StashScene s[\s\S]*AND EXISTS \(SELECT 1 FROM json_each\(COALESCE\(s\.inheritedTagIds/;
const CONTENT_TAG_SCENE =
  /FROM StashScene s[\s\S]*NOT EXISTS \(SELECT 1 FROM SceneTag st/;
const CONTENT_GALLERY_SCENE = /FROM StashScene x[\s\S]*SceneGallery/;
const CONTENT_GALLERY_IMAGE = /FROM StashImage x[\s\S]*ImageGallery/;
const CONTENT_STUDIO =
  /x\.studioId IS NULL OR NOT EXISTS \(SELECT 1 FROM _peek_refs/;
const EMPTY_GALLERY = /FROM StashGallery g/;
const EMPTY_PERFORMER = /FROM StashPerformer p/;
const EMPTY_STUDIO = /FROM StashStudio st/;
const EMPTY_GROUP = /FROM StashGroup g/;
const EMPTY_TAG = /FROM StashTag t[\s\S]*FROM GalleryTag gt/;

describe("ExclusionComputationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ role: "USER" });
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  describe("recomputeForUser", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.recomputeForUser).toBe(
        "function"
      );
    });

    it("should re-run recompute when called while another is pending", async () => {
      // This tests the race condition fix: if a sync-triggered recompute is running
      // and the admin saves restrictions (triggering another recompute), the second
      // recompute should NOT be skipped - it must run to pick up the new restrictions.
      let computeCount = 0;
      let resolveFirst: () => void;
      const firstBlocker = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      // Mock the full computation pipeline
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
      mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
      mockPrisma.userEntityStats.upsert.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$executeRaw.mockResolvedValue(undefined);
      mockPrisma.stashScene.count.mockResolvedValue(0);
      mockPrisma.stashPerformer.count.mockResolvedValue(0);
      mockPrisma.stashStudio.count.mockResolvedValue(0);
      mockPrisma.stashTag.count.mockResolvedValue(0);
      mockPrisma.stashGroup.count.mockResolvedValue(0);
      mockPrisma.stashGallery.count.mockResolvedValue(0);
      mockPrisma.stashImage.count.mockResolvedValue(0);
      mockPrisma.stashClip.count.mockResolvedValue(0);

      // First call: block inside transaction to simulate slow recompute
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        computeCount++;
        if (computeCount === 1) {
          // First call: wait for blocker before completing
          await firstBlocker;
        }
        return callback(mockPrisma);
      });

      // Start first recompute (will block in transaction)
      const first = exclusionComputationService.recomputeForUser(1);

      // Wait a tick to ensure first recompute has started
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Start second recompute (should NOT just return after first completes)
      const second = exclusionComputationService.recomputeForUser(1);

      // Unblock the first recompute
      resolveFirst!();

      // Wait for both to complete
      await Promise.all([first, second]);

      // The transaction should have been called twice:
      // once for the first recompute, once for the second
      expect(computeCount).toBeGreaterThanOrEqual(2);
    });

    it("should coalesce 3+ concurrent callers to at most 2 recomputes", async () => {
      // When N callers arrive concurrently for the same user, the coalescing
      // mechanism should ensure at most 2 recomputes happen: the currently-
      // running one plus one queued recompute that picks up all pending changes.
      let computeCount = 0;
      let resolveFirst: () => void;
      const firstBlocker = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      // Mock the full computation pipeline
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
      mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
      mockPrisma.userEntityStats.upsert.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$executeRaw.mockResolvedValue(undefined);
      mockPrisma.stashScene.count.mockResolvedValue(0);
      mockPrisma.stashPerformer.count.mockResolvedValue(0);
      mockPrisma.stashStudio.count.mockResolvedValue(0);
      mockPrisma.stashTag.count.mockResolvedValue(0);
      mockPrisma.stashGroup.count.mockResolvedValue(0);
      mockPrisma.stashGallery.count.mockResolvedValue(0);
      mockPrisma.stashImage.count.mockResolvedValue(0);
      mockPrisma.stashClip.count.mockResolvedValue(0);

      // Block the first transaction to simulate a slow recompute
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        computeCount++;
        if (computeCount === 1) {
          await firstBlocker;
        }
        return callback(mockPrisma);
      });

      // Start first recompute (will block in transaction)
      const first = exclusionComputationService.recomputeForUser(2);

      // Wait a tick to ensure first recompute has started
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Start 4 more concurrent recomputes while first is running
      const second = exclusionComputationService.recomputeForUser(2);
      const third = exclusionComputationService.recomputeForUser(2);
      const fourth = exclusionComputationService.recomputeForUser(2);
      const fifth = exclusionComputationService.recomputeForUser(2);

      // Unblock the first recompute
      resolveFirst!();

      // Wait for all to complete
      await Promise.all([first, second, third, fourth, fifth]);

      // With coalescing: at most 2 recomputes (the running one + one queued).
      // Each recompute opens one transaction, the write swap (the compute
      // runs on the compute client). Without coalescing there would be 5.
      expect(computeCount).toBe(2);
    });

    it("should ensure the second recompute runs after the first completes", async () => {
      // The queued recompute must run after the first finishes, ensuring
      // it picks up the latest state (e.g., new restrictions saved mid-recompute).
      const executionOrder: string[] = [];
      let resolveFirst: () => void;
      const firstBlocker = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      let computeCount = 0;

      // Mock the full computation pipeline
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
      mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
      mockPrisma.userEntityStats.upsert.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$executeRaw.mockResolvedValue(undefined);
      mockPrisma.stashScene.count.mockResolvedValue(0);
      mockPrisma.stashPerformer.count.mockResolvedValue(0);
      mockPrisma.stashStudio.count.mockResolvedValue(0);
      mockPrisma.stashTag.count.mockResolvedValue(0);
      mockPrisma.stashGroup.count.mockResolvedValue(0);
      mockPrisma.stashGallery.count.mockResolvedValue(0);
      mockPrisma.stashImage.count.mockResolvedValue(0);
      mockPrisma.stashClip.count.mockResolvedValue(0);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        computeCount++;
        const currentRun = computeCount;
        executionOrder.push(`start-${currentRun}`);
        if (currentRun === 1) {
          await firstBlocker;
        }
        const result = await callback(mockPrisma);
        executionOrder.push(`end-${currentRun}`);
        return result;
      });

      // Start first recompute (will block)
      const first = exclusionComputationService.recomputeForUser(3);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Start second while first is running
      const second = exclusionComputationService.recomputeForUser(3);

      // Unblock the first
      resolveFirst!();

      await Promise.all([first, second]);

      // Verify sequencing: the first recompute must complete before the
      // second one starts.
      expect(executionOrder).toEqual(["start-1", "end-1", "start-2", "end-2"]);
    });

    it("should allow independent recomputes for different users", async () => {
      // Coalescing should only apply per-user; different users should
      // recompute independently and concurrently.
      let user1Count = 0;
      let user2Count = 0;

      // Mock the full computation pipeline
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
      mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
      mockPrisma.userEntityStats.upsert.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$executeRaw.mockResolvedValue(undefined);
      mockPrisma.stashScene.count.mockResolvedValue(0);
      mockPrisma.stashPerformer.count.mockResolvedValue(0);
      mockPrisma.stashStudio.count.mockResolvedValue(0);
      mockPrisma.stashTag.count.mockResolvedValue(0);
      mockPrisma.stashGroup.count.mockResolvedValue(0);
      mockPrisma.stashGallery.count.mockResolvedValue(0);
      mockPrisma.stashImage.count.mockResolvedValue(0);
      mockPrisma.stashClip.count.mockResolvedValue(0);

      // Track per-user invocations via userContentRestriction.findMany calls
      mockPrisma.userContentRestriction.findMany.mockImplementation(
        async (args: any) => {
          if (args?.where?.userId === 10) user1Count++;
          if (args?.where?.userId === 11) user2Count++;
          return [];
        }
      );

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });

      await Promise.all([
        exclusionComputationService.recomputeForUser(10),
        exclusionComputationService.recomputeForUser(11),
      ]);

      // Each user should get exactly 1 recompute
      expect(user1Count).toBe(1);
      expect(user2Count).toBe(1);
    });

    it("never interleaves two users' compute phases on the compute connection", async () => {
      // The TEMP table names are shared on the one compute connection, so
      // user 21's compute must wait until user 20's has ended its snapshot.
      setupPipeline();
      const events: string[] = [];
      let releaseFirst!: () => void;
      const firstBlocker = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      mockPrisma.$executeRawUnsafe.mockImplementation(async (sql: string) => {
        if (sql === "BEGIN" || sql === "ROLLBACK") events.push(sql);
        return 0;
      });
      mockPrisma.userContentRestriction.findMany.mockImplementation(
        async (args: any) => {
          events.push(`rules-${args.where.userId}`);
          if (args.where.userId === 20) await firstBlocker;
          return [];
        }
      );

      const first = exclusionComputationService.recomputeForUser(20);
      const second = exclusionComputationService.recomputeForUser(21);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // User 20 is parked inside its compute; user 21 has issued nothing
      expect(events).toEqual(["BEGIN", "rules-20"]);

      releaseFirst();
      await Promise.all([first, second]);

      expect(events).toEqual([
        "BEGIN",
        "rules-20",
        "ROLLBACK",
        "BEGIN",
        "rules-21",
        "ROLLBACK",
      ]);
    });

    it("computes in a deferred BEGIN on the compute client; only the write swap is a Prisma transaction", async () => {
      setupPipeline();
      const events: string[] = [];
      mockPrisma.$executeRawUnsafe.mockImplementation(async (sql: string) => {
        events.push(sql === "BEGIN" || sql === "ROLLBACK" ? sql : "exec");
        return 0;
      });
      mockPrisma.$queryRawUnsafe.mockImplementation(async () => {
        events.push("query");
        return [];
      });
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        events.push("transaction");
        return callback(mockPrisma);
      });

      await exclusionComputationService.recomputeForUser(1);

      expect(getComputeClient).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // A bare BEGIN is deferred; IMMEDIATE would take the write lock
      expect(events[0]).toBe("BEGIN");
      const end = events.indexOf("ROLLBACK");
      const compute = events.slice(1, end);
      expect(compute).toContain("query");
      expect(compute).not.toContain("transaction");
      expect(events.indexOf("transaction")).toBeGreaterThan(end);
    });

    it("a failed compute ends its snapshot and frees the connection", async () => {
      setupPipeline();
      mockPrisma.userHiddenEntity.findMany.mockRejectedValueOnce(
        new Error("DB read error")
      );

      await expect(
        exclusionComputationService.recomputeForUser(30)
      ).rejects.toThrow("DB read error");

      const sqls = execCalls().map(([sql]) => sql);
      expect(sqls[0]).toBe("BEGIN");
      expect(sqls[sqls.length - 1]).toBe("ROLLBACK");
      expect(sqls.some((sql) => /DROP TABLE IF EXISTS _peek_/.test(sql))).toBe(
        true
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(disconnectComputeClient).not.toHaveBeenCalled();

      // The next recompute gets the connection
      await exclusionComputationService.recomputeForUser(31);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("a snapshot that cannot be ended drops the compute connection", async () => {
      setupPipeline();
      mockPrisma.$executeRawUnsafe.mockImplementation(async (sql: string) => {
        if (sql === "ROLLBACK") throw new Error("cannot rollback");
        return 0;
      });

      // The computed rows are still written
      await exclusionComputationService.recomputeForUser(1);

      expect(disconnectComputeClient).toHaveBeenCalledTimes(1);
      expect(mockPrisma.userExcludedEntity.deleteMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("recomputeAllUsers", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.recomputeAllUsers).toBe(
        "function"
      );
    });
  });

  describe("addHiddenEntity", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.addHiddenEntity).toBe(
        "function"
      );
    });
  });

  describe("removeHiddenEntity", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.removeHiddenEntity).toBe(
        "function"
      );
    });
  });
});

describe("computeDirectExclusions", () => {
  beforeEach(() => setupPipeline());

  it("should process UserContentRestriction EXCLUDE mode", async () => {
    // Legacy bare ids resolve on the allowed instances before they are stored
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "EXCLUDE", ["tag1", "tag2"]),
    ]);
    fakeRaw([
      [
        RESOLVE_TAG,
        [
          { id: "tag1", instanceId: "A" },
          { id: "tag2", instanceId: "A" },
        ],
      ],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(mockPrisma.userExcludedEntity.createMany).toHaveBeenCalled();
    expect(createdRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 1,
          entityType: "tag",
          entityId: "tag1",
          instanceId: "A",
          reason: "restricted",
        }),
        expect.objectContaining({
          userId: 1,
          entityType: "tag",
          entityId: "tag2",
          instanceId: "A",
          reason: "restricted",
        }),
      ])
    );
  });

  it("should process UserHiddenEntity records", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "perf1", instanceId: "" },
      { userId: 1, entityType: "scene", entityId: "scene1", instanceId: "" },
    ]);
    fakeRaw([
      [RESOLVE_PERFORMER, [{ id: "perf1", instanceId: "A" }]],
      [RESOLVE_SCENE, [{ id: "scene1", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    // The stored hide keeps its "" instance; the resolved copy carries A.
    expect(rowKeys(createdRows())).toEqual(
      new Set([
        "performer:perf1@:hidden",
        "performer:perf1@A:hidden",
        "scene:scene1@:hidden",
        "scene:scene1@A:hidden",
      ])
    );
  });

  it("should delete existing exclusions before creating new ones", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "scene", entityId: "scene1", instanceId: "A" },
    ]);
    fakeRaw([[RESOLVE_SCENE, [{ id: "scene1", instanceId: "A" }]]]);
    const order: string[] = [];
    mockPrisma.userExcludedEntity.deleteMany.mockImplementation(async () => {
      order.push("delete");
      return { count: 1 };
    });
    mockPrisma.userExcludedEntity.createMany.mockImplementation(async () => {
      order.push("create");
      return { count: 1 };
    });

    await exclusionComputationService.recomputeForUser(1);

    expect(mockPrisma.userExcludedEntity.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1 },
    });
    expect(order).toEqual(["delete", "create"]);
  });

  it("should skip createMany when no exclusions computed", async () => {
    await exclusionComputationService.recomputeForUser(1);

    expect(mockPrisma.userExcludedEntity.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.userExcludedEntity.createMany).not.toHaveBeenCalled();
  });

  it("should combine restrictions and hidden entities", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("groups", "EXCLUDE", ["g1:A"]),
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "scene", entityId: "s9", instanceId: "A" },
    ]);
    fakeRaw([
      [RESOLVE_GROUP, [{ id: "g1", instanceId: "A" }]],
      [RESOLVE_SCENE, [{ id: "s9", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(
      new Set(["group:g1@A:restricted", "scene:s9@A:hidden"])
    );
  });

  it("a missing user computes nothing", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await exclusionComputationService.recomputeForUser(42);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.userExcludedEntity.deleteMany).not.toHaveBeenCalled();
  });
});

describe("resolution of listed ids (Rules 2 and 8)", () => {
  beforeEach(() => setupPipeline());

  it("resolves a listed tag to its descendants on the same instance with one recursive CTE", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "EXCLUDE", ["471:A"]),
    ]);
    fakeRaw([
      [
        RESOLVE_TAG,
        [
          { id: "471", instanceId: "A" },
          { id: "480", instanceId: "A" },
        ],
      ],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const recursive = queriesMatching(/WITH RECURSIVE/);
    expect(recursive).toHaveLength(1);
    const [sql, ...params] = recursive[0];
    expect(sql).toContain("json_each(COALESCE(c.parentIds, '[]'))");
    expect(sql).toContain("CROSS JOIN StashTag t ON");
    // Bare ids, allowed instances and scoped refs are bound, never spliced
    expect(params[0]).toBe(JSON.stringify([]));
    expect(params).toContain("A");
    expect(params).toContain(JSON.stringify([{ id: "471", iid: "A" }]));

    expect(createdRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "tag",
          entityId: "471",
          instanceId: "A",
          reason: "restricted",
        }),
        expect.objectContaining({
          entityType: "tag",
          entityId: "480",
          instanceId: "A",
          reason: "restricted",
        }),
      ])
    );
  });

  it("resolves a listed studio through parentId", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("studios", "EXCLUDE", ["1:A"]),
    ]);
    fakeRaw([
      [
        RESOLVE_STUDIO,
        [
          { id: "1", instanceId: "A" },
          { id: "3", instanceId: "A" },
        ],
      ],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const recursive = queriesMatching(/WITH RECURSIVE/);
    expect(recursive).toHaveLength(1);
    expect(recursive[0][0]).toContain(
      "c.parentId = p.id AND c.stashInstanceId = p.inst"
    );
    expect(rowKeys(createdRows())).toEqual(
      new Set(["studio:1@A:restricted", "studio:3@A:restricted"])
    );
  });

  it("resolves groups and galleries without expansion", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("groups", "EXCLUDE", ["5:A"]),
      restriction("galleries", "EXCLUDE", ["g1:A"]),
    ]);
    fakeRaw([
      [RESOLVE_GROUP, [{ id: "5", instanceId: "A" }]],
      [RESOLVE_GALLERY, [{ id: "g1", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(queriesMatching(/WITH RECURSIVE/)).toHaveLength(0);
    expect(queriesMatching(RESOLVE_GROUP)).toHaveLength(1);
    expect(queriesMatching(RESOLVE_GALLERY)).toHaveLength(1);
    expect(rowKeys(createdRows())).toEqual(
      new Set(["group:5@A:restricted", "gallery:g1@A:restricted"])
    );
  });

  it("a bare listed id resolves to one ref per allowed instance", async () => {
    setupPipeline(["A", "B"]);
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("groups", "EXCLUDE", ["5"]),
    ]);
    fakeRaw([
      [
        RESOLVE_GROUP,
        [
          { id: "5", instanceId: "A" },
          { id: "5", instanceId: "B" },
        ],
      ],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const [, ...params] = queriesMatching(RESOLVE_GROUP)[0];
    expect(params[0]).toBe(JSON.stringify(["5"]));
    expect(rowKeys(createdRows())).toEqual(
      new Set(["group:5@A:restricted", "group:5@B:restricted"])
    );
    expect(createdRows().some((r) => r.instanceId === "")).toBe(false);
  });
});

describe("INCLUDE rules (Rules 4, 5 and 6)", () => {
  beforeEach(() => setupPipeline());

  it("INCLUDE tags: inverted tags are not cascade sources", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "INCLUDE", ["1:A"], true),
    ]);
    fakeRaw([
      [RESOLVE_TAG, [{ id: "1", instanceId: "A" }]],
      [
        INVERT_TAG,
        [
          { id: "2", instanceId: "A" },
          { id: "3", instanceId: "A" },
        ],
      ],
      [EDGE_SCENE_TAG, [{ id: "s2", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(createdRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "tag",
          entityId: "2",
          instanceId: "A",
          reason: "restricted",
        }),
        expect.objectContaining({
          entityType: "tag",
          entityId: "3",
          instanceId: "A",
          reason: "restricted",
        }),
      ])
    );
    // No cascade from the inversion: the SceneTag edge is never queried
    expect(queriesMatching(EDGE_SCENE_TAG)).toHaveLength(0);
    expect(createdRows().some((r) => r.reason === "cascade")).toBe(false);
  });

  it("INCLUDE tags: descendants of an included tag are neither inverted nor hidden", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "INCLUDE", ["1:A"], true),
    ]);
    fakeRaw([
      [
        RESOLVE_TAG,
        [
          { id: "1", instanceId: "A" },
          { id: "9", instanceId: "A" },
        ],
      ],
      [INVERT_TAG, [{ id: "2", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    // The closure (1 and its child 9) is what the inversion is bound with
    const fill = execCalls().find(
      ([sql, param]) =>
        /INSERT OR IGNORE INTO _peek_refs/.test(sql) &&
        String(param).includes('"9"')
    );
    expect(fill).toBeDefined();
    expect(fill![1]).toBe(
      JSON.stringify([
        { id: "1", iid: "A" },
        { id: "9", iid: "A" },
      ])
    );
    expect(createdRows().some((r) => r.entityId === "9")).toBe(false);
    expect(createdRows().some((r) => r.entityId === "1")).toBe(false);
  });

  it("INCLUDE tags: content query binds the closure and the restrictEmpty flag", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "INCLUDE", ["1:A"], true),
    ]);
    fakeRaw([
      [RESOLVE_TAG, [{ id: "1", instanceId: "A" }]],
      [CONTENT_TAG_SCENE, [{ id: "s3", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const content = queriesMatching(CONTENT_TAG_SCENE);
    expect(content).toHaveLength(1);
    const [sql, ...params] = content[0];
    expect(sql).toContain("FROM StashScene s");
    expect(sql).toContain("json_each(COALESCE(s.inheritedTagIds");
    expect(sql).toContain("JOIN _peek_refs r");
    expect(params[params.length - 1]).toBe(1);
    expect(createdRows()).toEqual(
      expect.arrayContaining([
        {
          userId: 1,
          entityType: "scene",
          entityId: "s3",
          instanceId: "A",
          reason: "restricted",
        },
      ])
    );
  });

  it("INCLUDE tags: restrictEmpty off binds 0", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "INCLUDE", ["1:A"], false),
    ]);
    fakeRaw([[RESOLVE_TAG, [{ id: "1", instanceId: "A" }]]]);

    await exclusionComputationService.recomputeForUser(1);

    const [, ...params] = queriesMatching(CONTENT_TAG_SCENE)[0];
    expect(params[params.length - 1]).toBe(0);
  });

  it("INCLUDE galleries: images and scenes are checked, galleries are inverted", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("galleries", "INCLUDE", ["g1:A"], true),
    ]);
    fakeRaw([
      [RESOLVE_GALLERY, [{ id: "g1", instanceId: "A" }]],
      [INVERT_GALLERY, [{ id: "g2", instanceId: "A" }]],
      [CONTENT_GALLERY_SCENE, [{ id: "s7", instanceId: "A" }]],
      [CONTENT_GALLERY_IMAGE, [{ id: "i3", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(queriesMatching(CONTENT_GALLERY_SCENE)).toHaveLength(1);
    expect(queriesMatching(CONTENT_GALLERY_IMAGE)).toHaveLength(1);
    expect(rowKeys(createdRows())).toEqual(
      new Set([
        "gallery:g2@A:restricted",
        "scene:s7@A:restricted",
        "image:i3@A:restricted",
      ])
    );
  });

  it("INCLUDE studios: NULL studio is hidden only when restrictEmpty", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("studios", "INCLUDE", ["1:A"], false),
    ]);
    fakeRaw([
      [RESOLVE_STUDIO, [{ id: "1", instanceId: "A" }]],
      [INVERT_STUDIO, [{ id: "2", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const studioContent = queriesMatching(CONTENT_STUDIO);
    // scenes, galleries and images
    expect(studioContent).toHaveLength(3);
    for (const [sql, ...params] of studioContent) {
      expect(sql).toContain(
        "x.studioId IS NULL OR NOT EXISTS (SELECT 1 FROM _peek_refs"
      );
      expect(sql).toContain("(? = 1 OR x.studioId IS NOT NULL)");
      expect(params[params.length - 1]).toBe(0);
    }
    expect(studioContent.some(([sql]) => /FROM StashScene x/.test(sql))).toBe(
      true
    );
    expect(
      studioContent.some(
        ([sql]) =>
          /FROM StashGallery x/.test(sql) && sql.includes("x.studioInstanceId")
      )
    ).toBe(true);
    expect(
      studioContent.some(
        ([sql]) =>
          /FROM StashImage x/.test(sql) && sql.includes("x.studioInstanceId")
      )
    ).toBe(true);
  });

  it("EXCLUDE with restrictEmpty issues the no-item query", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "EXCLUDE", ["2:A"], true),
    ]);
    fakeRaw([
      [RESOLVE_TAG, [{ id: "2", instanceId: "A" }]],
      [
        /FROM StashScene s[\s\S]*NOT EXISTS \(SELECT 1 FROM SceneTag st WHERE/,
        [{ id: "s4", instanceId: "A" }],
      ],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const noItem = queriesMatching(
      /FROM StashScene s[\s\S]*NOT EXISTS \(SELECT 1 FROM SceneTag st WHERE/
    );
    expect(noItem).toHaveLength(1);
    expect(noItem[0][0]).not.toContain("_peek_refs");
    expect(noItem[0][0]).toContain(
      "NOT EXISTS (SELECT 1 FROM json_each(COALESCE(s.inheritedTagIds, '[]')))"
    );
    expect(createdRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "scene",
          entityId: "s4",
          instanceId: "A",
          reason: "restricted",
        }),
        expect.objectContaining({
          entityType: "tag",
          entityId: "2",
          instanceId: "A",
          reason: "restricted",
        }),
      ])
    );
  });

  it("EXCLUDE without restrictEmpty issues no content query", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "EXCLUDE", ["2:A"], false),
    ]);
    fakeRaw([[RESOLVE_TAG, [{ id: "2", instanceId: "A" }]]]);

    await exclusionComputationService.recomputeForUser(1);

    expect(queriesMatching(CONTENT_TAG_SCENE)).toHaveLength(0);
    expect(
      queriesMatching(
        /FROM StashScene s[\s\S]*NOT EXISTS \(SELECT 1 FROM SceneTag/
      )
    ).toHaveLength(0);
  });

  it("restrictEmpty is the OR of a type's rows", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "INCLUDE", ["1:A"], false),
      restriction("tags", "EXCLUDE", ["2:A"], true),
    ]);
    fakeRaw([[RESOLVE_TAG, [{ id: "1", instanceId: "A" }]]]);

    await exclusionComputationService.recomputeForUser(1);

    const content = queriesMatching(CONTENT_TAG_SCENE);
    expect(content).toHaveLength(1);
    const [, ...params] = content[0];
    expect(params[params.length - 1]).toBe(1);
  });
});

describe("cascades (Rule 3)", () => {
  beforeEach(() => setupPipeline());

  it("tag exclusion cascades to galleries, images and clips", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "EXCLUDE", ["2:A"]),
    ]);
    fakeRaw([
      [RESOLVE_TAG, [{ id: "2", instanceId: "A" }]],
      [EDGE_GALLERY_TAG, [{ id: "g2", instanceId: "A" }]],
      [EDGE_IMAGE_TAG, [{ id: "i2", instanceId: "A" }]],
      [EDGE_CLIP_TAG, [{ id: "c1", instanceId: "A" }]],
      [EDGE_CLIP_PRIMARY, [{ id: "c9", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(
      new Set([
        "tag:2@A:restricted",
        "gallery:g2@A:cascade",
        "image:i2@A:cascade",
        "clip:c1@A:cascade",
        "clip:c9@A:cascade",
      ])
    );
    // The closure is bound into the temp refs table, and the primary-tag edge
    // joins it on the clip's own tag columns
    expect(queriesMatching(EDGE_CLIP_PRIMARY)[0][0]).toContain(
      "r.id = x.primaryTagId AND r.inst = x.primaryTagInstanceId"
    );
  });

  it("studio exclusion cascades to scenes, galleries and images", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("studios", "EXCLUDE", ["1:A"]),
    ]);
    fakeRaw([
      [RESOLVE_STUDIO, [{ id: "1", instanceId: "A" }]],
      [EDGE_STUDIO_SCENE, [{ id: "s1", instanceId: "A" }]],
      [EDGE_STUDIO_GALLERY, [{ id: "g1", instanceId: "A" }]],
      [EDGE_STUDIO_IMAGE, [{ id: "i7", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(
      new Set([
        "studio:1@A:restricted",
        "scene:s1@A:cascade",
        "gallery:g1@A:cascade",
        "image:i7@A:cascade",
      ])
    );
    expect(queriesMatching(EDGE_STUDIO_GALLERY)[0][0]).toContain(
      "r.inst = x.studioInstanceId"
    );
    expect(queriesMatching(EDGE_STUDIO_SCENE)[0][0]).toContain(
      "r.inst = x.stashInstanceId"
    );
  });

  it("performer hide cascades to scenes, galleries and images", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "p1", instanceId: "A" },
    ]);
    fakeRaw([
      [RESOLVE_PERFORMER, [{ id: "p1", instanceId: "A" }]],
      [EDGE_SCENE_PERFORMER, [{ id: "s1", instanceId: "A" }]],
      [EDGE_GALLERY_PERFORMER, [{ id: "g1", instanceId: "A" }]],
      [EDGE_IMAGE_PERFORMER, [{ id: "i1", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(
      new Set([
        "performer:p1@A:hidden",
        "scene:s1@A:cascade",
        "gallery:g1@A:cascade",
        "image:i1@A:cascade",
      ])
    );
  });

  it("tag exclusion cascades through inherited tags with the closure bound", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "EXCLUDE", ["2:A"]),
    ]);
    fakeRaw([
      [RESOLVE_TAG, [{ id: "2", instanceId: "A" }]],
      [EDGE_INHERITED, [{ id: "s5", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(queriesMatching(EDGE_INHERITED)).toHaveLength(1);
    expect(queriesMatching(EDGE_INHERITED)[0][0]).toContain(
      "JOIN _peek_refs r ON r.id = it.value AND r.inst = s.stashInstanceId"
    );
    expect(createdRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "scene",
          entityId: "s5",
          instanceId: "A",
          reason: "cascade",
        }),
      ])
    );
  });

  it("should not duplicate cascade exclusions from multiple sources", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "EXCLUDE", ["2:A"]),
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "p1", instanceId: "A" },
    ]);
    fakeRaw([
      [RESOLVE_TAG, [{ id: "2", instanceId: "A" }]],
      [RESOLVE_PERFORMER, [{ id: "p1", instanceId: "A" }]],
      [EDGE_SCENE_TAG, [{ id: "s1", instanceId: "A" }]],
      [EDGE_SCENE_PERFORMER, [{ id: "s1", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const sceneRows = createdRows().filter(
      (r) => r.entityType === "scene" && r.entityId === "s1"
    );
    expect(sceneRows).toHaveLength(1);
    expect(sceneRows[0].reason).toBe("cascade");
  });

  it("should handle empty cascade results gracefully", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("groups", "EXCLUDE", ["5:A"]),
    ]);
    fakeRaw([[RESOLVE_GROUP, [{ id: "5", instanceId: "A" }]]]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(new Set(["group:5@A:restricted"]));
  });

  it("a hide with an empty instance cascades on every allowed instance", async () => {
    setupPipeline(["A", "B"]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "p1", instanceId: "" },
    ]);
    fakeRaw([
      [
        RESOLVE_PERFORMER,
        [
          { id: "p1", instanceId: "A" },
          { id: "p1", instanceId: "B" },
        ],
      ],
      [
        EDGE_SCENE_PERFORMER,
        [
          { id: "s1", instanceId: "A" },
          { id: "s2", instanceId: "B" },
        ],
      ],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const [, ...resolveParams] = queriesMatching(RESOLVE_PERFORMER)[0];
    expect(resolveParams[0]).toBe(JSON.stringify(["p1"]));
    expect(rowKeys(createdRows())).toEqual(
      new Set([
        "performer:p1@:hidden",
        "performer:p1@A:hidden",
        "performer:p1@B:hidden",
        "scene:s1@A:cascade",
        "scene:s2@B:cascade",
      ])
    );
    // The cascade source is the resolved (scoped) set
    const fill = execCalls().find(([sql]) =>
      /INSERT OR IGNORE INTO _peek_refs/.test(sql)
    );
    expect(fill![1]).toBe(
      JSON.stringify([
        { id: "p1", iid: "A" },
        { id: "p1", iid: "B" },
      ])
    );
  });
});

describe("computeEmptyExclusions", () => {
  beforeEach(() => setupPipeline());

  it("should exclude galleries with no visible images", async () => {
    fakeRaw([
      [
        EMPTY_GALLERY,
        [
          { galleryId: "gallery1", instanceId: "A" },
          { galleryId: "gallery2", instanceId: "A" },
        ],
      ],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(
      new Set(["gallery:gallery1@A:empty", "gallery:gallery2@A:empty"])
    );
  });

  it("empty-phase rows carry the entity's instance", async () => {
    fakeRaw([
      [EMPTY_GALLERY, [{ galleryId: "g1", instanceId: "B" }]],
      [EMPTY_PERFORMER, [{ performerId: "p1", instanceId: "B" }]],
      [EMPTY_STUDIO, [{ studioId: "st1", instanceId: "B" }]],
      [EMPTY_GROUP, [{ groupId: "gr1", instanceId: "B" }]],
      [EMPTY_TAG, [{ tagId: "t1", instanceId: "B" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(
      new Set([
        "gallery:g1@B:empty",
        "performer:p1@B:empty",
        "studio:st1@B:empty",
        "group:gr1@B:empty",
        "tag:t1@B:empty",
      ])
    );
    expect(createdRows().some((r) => r.instanceId === "")).toBe(false);
  });

  it("should consider already excluded content when determining if entity is empty", async () => {
    // A hidden gallery and a hidden image are loaded into the temp exclusion
    // sets the empty queries probe (indexed lookups, never a JSON rescan).
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "gallery", entityId: "g9", instanceId: "A" },
      { userId: 1, entityType: "image", entityId: "i9", instanceId: "A" },
      { userId: 1, entityType: "scene", entityId: "s9", instanceId: "" },
    ]);
    fakeRaw([
      [RESOLVE_GALLERY, [{ id: "g9", instanceId: "A" }]],
      [RESOLVE_IMAGE, [{ id: "i9", instanceId: "A" }]],
      [RESOLVE_SCENE, [{ id: "s9", instanceId: "A" }]],
      [EDGE_IMAGE_TAG, []],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const galleryFill = execCalls().find(([sql]) =>
      /INSERT OR IGNORE INTO _peek_ex_gallery/.test(sql)
    );
    expect(galleryFill).toBeDefined();
    expect(galleryFill![1]).toBe(JSON.stringify([{ id: "g9", iid: "A" }]));
    const imageFill = execCalls().find(([sql]) =>
      /INSERT OR IGNORE INTO _peek_ex_image/.test(sql)
    );
    expect(imageFill![1]).toBe(JSON.stringify([{ id: "i9", iid: "A" }]));
    // The "" scene hide reaches every allowed instance through its per-instance copy
    const sceneFill = execCalls().find(([sql]) =>
      /INSERT OR IGNORE INTO _peek_ex_scene/.test(sql)
    );
    expect(sceneFill![1]).toBe(JSON.stringify([{ id: "s9", iid: "A" }]));
    // The empty queries probe the temp sets, not a bound JSON array
    for (const [sql] of queriesMatching(
      /FROM Stash(Gallery g|Performer p|Studio st|Group g|Tag t)/
    )) {
      expect(sql).not.toContain("json_extract(je.value");
      expect(sql).toMatch(/_peek_ex_/);
    }
  });

  it("empty-tag query counts gallery and image tags", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "gallery", entityId: "g9", instanceId: "A" },
      { userId: 1, entityType: "image", entityId: "i9", instanceId: "A" },
    ]);
    fakeRaw([
      [RESOLVE_GALLERY, [{ id: "g9", instanceId: "A" }]],
      [RESOLVE_IMAGE, [{ id: "i9", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const tagQuery = queriesMatching(EMPTY_TAG);
    expect(tagQuery).toHaveLength(1);
    const [sql] = tagQuery[0];
    expect(sql).toContain("FROM GalleryTag gt");
    expect(sql).toContain("FROM ImageTag it");
    expect(sql).toContain("FROM _peek_ex_gallery");
    expect(sql).toContain("FROM _peek_ex_image");
    expect(
      execCalls().some(
        ([s, p]) =>
          /INSERT OR IGNORE INTO _peek_ex_gallery/.test(s) &&
          String(p).includes('"g9"')
      )
    ).toBe(true);
    expect(
      execCalls().some(
        ([s, p]) =>
          /INSERT OR IGNORE INTO _peek_ex_image/.test(s) &&
          String(p).includes('"i9"')
      )
    ).toBe(true);
  });

  it("empty-tag exemption needs a child tag on the same instance", async () => {
    await exclusionComputationService.recomputeForUser(1);

    const [sql] = queriesMatching(EMPTY_TAG)[0];
    expect(sql).toContain("json_each(COALESCE(child.parentIds, '[]'))");
    expect(sql).toContain("child.stashInstanceId = t.stashInstanceId");
    expect(sql).not.toContain("LIKE");
  });

  it("should handle multiple empty entity types in one pass", async () => {
    fakeRaw([
      [EMPTY_GALLERY, [{ galleryId: "g1", instanceId: "A" }]],
      [EMPTY_PERFORMER, [{ performerId: "p1", instanceId: "A" }]],
      [EMPTY_STUDIO, [{ studioId: "st1", instanceId: "A" }]],
      [EMPTY_GROUP, [{ groupId: "gr1", instanceId: "A" }]],
      [EMPTY_TAG, [{ tagId: "t1", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(createdRows().filter((r) => r.reason === "empty")).toHaveLength(5);
    // Temp tables are dropped at the end of the compute
    expect(
      execCalls().filter(([sql]) => /DROP TABLE IF EXISTS _peek_/.test(sql))
        .length
    ).toBeGreaterThanOrEqual(7);
  });

  it("should not exclude entities that have visible content", async () => {
    await exclusionComputationService.recomputeForUser(1);

    expect(mockPrisma.userExcludedEntity.createMany).not.toHaveBeenCalled();
  });
});

describe("reason precedence (restrictions before hides)", () => {
  beforeEach(() => setupPipeline());

  const EDGE_PERFORMER_TAG = /FROM PerformerTag j/;
  const EMPTY_UNDER_RESTRICTIONS = /FROM _peek_refs o CROSS JOIN Stash\w+ AS/;
  const EMPTY_PERFORMER_UNDER_RESTRICTIONS =
    /FROM _peek_refs o CROSS JOIN StashPerformer AS p ON/;

  it("a restriction cascade reaching a hidden entity stores cascade", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "EXCLUDE", ["2:A"]),
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "p1", instanceId: "A" },
    ]);
    fakeRaw([
      [RESOLVE_TAG, [{ id: "2", instanceId: "A" }]],
      [RESOLVE_PERFORMER, [{ id: "p1", instanceId: "A" }]],
      [EDGE_PERFORMER_TAG, [{ id: "p1", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(
      new Set(["tag:2@A:restricted", "performer:p1@A:cascade"])
    );
  });

  it("a content rule reaching a hidden scene stores restricted", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "EXCLUDE", ["2:A"], true),
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "scene", entityId: "s4", instanceId: "A" },
    ]);
    fakeRaw([
      [CONTENT_TAG_SCENE, [{ id: "s4", instanceId: "A" }]],
      [RESOLVE_TAG, [{ id: "2", instanceId: "A" }]],
      [RESOLVE_SCENE, [{ id: "s4", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(
      new Set(["tag:2@A:restricted", "scene:s4@A:restricted"])
    );
  });

  it("a hidden entity empty under the restrictions alone stores empty", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "p2", instanceId: "A" },
      { userId: 1, entityType: "scene", entityId: "s1", instanceId: "A" },
    ]);
    fakeRaw([
      [RESOLVE_PERFORMER, [{ id: "p2", instanceId: "A" }]],
      [RESOLVE_SCENE, [{ id: "s1", instanceId: "A" }]],
      [
        EMPTY_PERFORMER_UNDER_RESTRICTIONS,
        [{ performerId: "p2", instanceId: "A" }],
      ],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(
      new Set(["performer:p2@A:empty", "scene:s1@A:hidden"])
    );
    // Checked only for the hidden organisational entities, driving from them
    const targeted = queriesMatching(EMPTY_UNDER_RESTRICTIONS);
    expect(targeted).toHaveLength(1);
    expect(targeted[0][0]).toMatch(EMPTY_PERFORMER_UNDER_RESTRICTIONS);
    const refsFill = execCalls().find(
      ([sql, json]) =>
        sql.includes("INSERT OR IGNORE INTO _peek_refs") &&
        String(json).includes("p2")
    );
    expect(refsFill?.[1]).toBe(JSON.stringify([{ id: "p2", iid: "A" }]));
  });

  it("the empty check under the restrictions alone runs before the hides join the sets", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "gallery", entityId: "g1", instanceId: "A" },
      { userId: 1, entityType: "image", entityId: "i1", instanceId: "A" },
    ]);
    const events: string[] = [];
    mockPrisma.$executeRawUnsafe.mockImplementation(
      async (sql: string, json?: string) => {
        if (sql.includes("INSERT OR IGNORE INTO _peek_ex_image")) {
          events.push(`image set += ${json}`);
        }
        return 0;
      }
    );
    mockPrisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (/CROSS JOIN StashGallery AS g/.test(sql)) {
        events.push("empty check for the hidden gallery");
        return [];
      }
      if (RESOLVE_GALLERY.test(sql)) return [{ id: "g1", instanceId: "A" }];
      if (RESOLVE_IMAGE.test(sql)) return [{ id: "i1", instanceId: "A" }];
      return [];
    });

    await exclusionComputationService.recomputeForUser(1);

    // The hidden image joins the sets only after the check
    expect(events).toEqual([
      "empty check for the hidden gallery",
      `image set += ${JSON.stringify([{ id: "i1", iid: "A" }])}`,
    ]);
  });

  it("own hides stay hidden under their own cascades and emptiness", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "studio", entityId: "st1", instanceId: "A" },
      { userId: 1, entityType: "scene", entityId: "s1", instanceId: "A" },
    ]);
    fakeRaw([
      [RESOLVE_STUDIO, [{ id: "st1", instanceId: "A" }]],
      [RESOLVE_SCENE, [{ id: "s1", instanceId: "A" }]],
      [EDGE_STUDIO_SCENE, [{ id: "s1", instanceId: "A" }]],
      [EMPTY_STUDIO, [{ studioId: "st1", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(
      new Set(["studio:st1@A:hidden", "scene:s1@A:hidden"])
    );
  });

  it("no hides, no empty check under the restrictions alone", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "EXCLUDE", ["2:A"]),
    ]);
    fakeRaw([[RESOLVE_TAG, [{ id: "2", instanceId: "A" }]]]);

    await exclusionComputationService.recomputeForUser(1);

    expect(queriesMatching(EMPTY_UNDER_RESTRICTIONS)).toHaveLength(0);
  });
});

describe("admins (Rule 7)", () => {
  beforeEach(() => setupPipeline());

  it("admin: restriction rows are ignored, hides still cascade, no empty phase", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "INCLUDE", ["1:A"], true),
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "p1", instanceId: "A" },
    ]);
    fakeRaw([
      [RESOLVE_TAG, [{ id: "1", instanceId: "A" }]],
      [INVERT_TAG, [{ id: "2", instanceId: "A" }]],
      [RESOLVE_PERFORMER, [{ id: "p1", instanceId: "A" }]],
      [EDGE_SCENE_PERFORMER, [{ id: "s1", instanceId: "A" }]],
      [EMPTY_GALLERY, [{ galleryId: "g1", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(mockPrisma.userContentRestriction.findMany).not.toHaveBeenCalled();
    expect(rowKeys(createdRows())).toEqual(
      new Set(["performer:p1@A:hidden", "scene:s1@A:cascade"])
    );
    expect(createdRows().some((r) => r.reason === "restricted")).toBe(false);
    expect(createdRows().some((r) => r.reason === "empty")).toBe(false);
    expect(queriesMatching(EMPTY_GALLERY)).toHaveLength(0);
  });
});

describe("addHiddenEntity", () => {
  beforeEach(() => setupPipeline());

  it("addHiddenEntity uses the shared edges", async () => {
    fakeRaw([
      [RESOLVE_TAG, [{ id: "2", instanceId: "A" }]],
      [EDGE_GALLERY_TAG, [{ id: "g2", instanceId: "A" }]],
    ]);

    await exclusionComputationService.addHiddenEntity(1, "tag", "2", "A");

    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_entityType_entityId_instanceId: {
            userId: 1,
            entityType: "tag",
            entityId: "2",
            instanceId: "A",
          },
        },
        create: expect.objectContaining({ reason: "hidden", instanceId: "A" }),
        // An existing row keeps its reason: a hide never masks a restriction
        update: {},
      })
    );
    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_entityType_entityId_instanceId: {
            userId: 1,
            entityType: "gallery",
            entityId: "g2",
            instanceId: "A",
          },
        },
        create: expect.objectContaining({
          entityType: "gallery",
          entityId: "g2",
          instanceId: "A",
          reason: "cascade",
        }),
        update: {},
      })
    );
    // Hides of a tag expand to descendants through the same recursive resolve
    expect(queriesMatching(RESOLVE_TAG)[0][0]).toContain("WITH RECURSIVE");
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("hiding a tag writes hidden rows for its descendants", async () => {
    setupPipeline(["A", "B"]);
    fakeRaw([
      [
        RESOLVE_TAG,
        [
          { id: "2", instanceId: "A" },
          { id: "7", instanceId: "A" },
        ],
      ],
      [EDGE_SCENE_TAG, [{ id: "s7", instanceId: "A" }]],
    ]);

    await exclusionComputationService.addHiddenEntity(1, "tag", "2", "A");

    expect(upsertKeys()).toEqual(
      new Set(["tag:2@A:hidden", "tag:7@A:hidden", "scene:s7@A:cascade"])
    );
    // The cascade source carries both tags, and nothing lands on instance B
    const fill = execCalls().find(([sql]) =>
      /INSERT OR IGNORE INTO _peek_refs/.test(sql)
    );
    expect(fill![1]).toBe(
      JSON.stringify([
        { id: "2", iid: "A" },
        { id: "7", iid: "A" },
      ])
    );
    expect([...upsertKeys()].some((k) => k.includes("@B:"))).toBe(false);
  });

  it("should only upsert the stored row when there are no descendants or cascades", async () => {
    fakeRaw([[RESOLVE_PERFORMER, [{ id: "perf1", instanceId: "A" }]]]);

    await exclusionComputationService.addHiddenEntity(
      1,
      "performer",
      "perf1",
      "A"
    );

    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledTimes(1);
    expect(upsertKeys()).toEqual(new Set(["performer:perf1@A:hidden"]));
  });

  it("should scope performer cascade to the given instance", async () => {
    setupPipeline(["A", "B"]);
    fakeRaw([
      [RESOLVE_PERFORMER, [{ id: "perf1", instanceId: "A" }]],
      [EDGE_SCENE_PERFORMER, [{ id: "scene1", instanceId: "A" }]],
    ]);

    await exclusionComputationService.addHiddenEntity(
      1,
      "performer",
      "perf1",
      "A"
    );

    expect(upsertKeys()).toEqual(
      new Set(["performer:perf1@A:hidden", "scene:scene1@A:cascade"])
    );
    const fill = execCalls().find(([sql]) =>
      /INSERT OR IGNORE INTO _peek_refs/.test(sql)
    );
    expect(fill![1]).toBe(JSON.stringify([{ id: "perf1", iid: "A" }]));
  });

  it("a full recompute and addHiddenEntity write the same rows for the same hide", async () => {
    setupPipeline(["A", "B"]);
    const routes: Array<[RegExp, unknown[]]> = [
      [
        RESOLVE_TAG,
        [
          { id: "2", instanceId: "A" },
          { id: "7", instanceId: "A" },
          { id: "2", instanceId: "B" },
        ],
      ],
      [EDGE_GALLERY_TAG, [{ id: "g2", instanceId: "A" }]],
    ];
    fakeRaw(routes);

    await exclusionComputationService.addHiddenEntity(1, "tag", "2", "");
    const fromHide = upsertKeys();

    setupPipeline(["A", "B"]);
    fakeRaw(routes);
    mockPrisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "tag", entityId: "2", instanceId: "" },
    ]);

    await exclusionComputationService.recomputeForUser(1);
    const fromRecompute = rowKeys(createdRows());

    const expected = new Set([
      "tag:2@:hidden",
      "tag:2@A:hidden",
      "tag:7@A:hidden",
      "tag:2@B:hidden",
      "gallery:g2@A:cascade",
    ]);
    expect(fromHide).toEqual(expected);
    expect(fromRecompute).toEqual(expected);
  });
});

describe("removeHiddenEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mocks for recomputeForUser which will be called async
    mockPrisma.user.findUnique.mockResolvedValue({ role: "USER" });
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    mockPrisma.stashScene.count.mockResolvedValue(0);
    mockPrisma.stashPerformer.count.mockResolvedValue(0);
    mockPrisma.stashStudio.count.mockResolvedValue(0);
    mockPrisma.stashTag.count.mockResolvedValue(0);
    mockPrisma.stashGroup.count.mockResolvedValue(0);
    mockPrisma.stashGallery.count.mockResolvedValue(0);
    mockPrisma.stashImage.count.mockResolvedValue(0);
    mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
    mockPrisma.userEntityStats.upsert.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });
  });

  it("should queue async recompute via setImmediate", async () => {
    // Spy on setImmediate
    const setImmediateSpy = vi.spyOn(global, "setImmediate");

    await exclusionComputationService.removeHiddenEntity(
      1,
      "performer",
      "perf1"
    );

    // Verify setImmediate was called
    expect(setImmediateSpy).toHaveBeenCalled();

    setImmediateSpy.mockRestore();
  });

  it("should call recomputeForUser asynchronously", async () => {
    // Use fake timers to control setImmediate
    vi.useFakeTimers();

    await exclusionComputationService.removeHiddenEntity(
      1,
      "performer",
      "perf1"
    );

    // Transaction should not have been called yet (async)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();

    // Run pending timers/immediate callbacks
    await vi.runAllTimersAsync();

    // Now recomputeForUser should have been called
    expect(mockPrisma.$transaction).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("should handle errors in async recompute gracefully", async () => {
    vi.useFakeTimers();

    // Make the transaction fail
    mockPrisma.$transaction.mockRejectedValue(new Error("Database error"));

    // This should not throw
    await exclusionComputationService.removeHiddenEntity(
      1,
      "performer",
      "perf1"
    );

    // Run the async callback - should not throw even if recompute fails
    await expect(vi.runAllTimersAsync()).resolves.not.toThrow();

    vi.useRealTimers();
  });
});

describe("recomputeAllUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks for a successful recompute pipeline
    mockPrisma.user.findUnique.mockResolvedValue({ role: "USER" });
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
    mockPrisma.userEntityStats.upsert.mockResolvedValue({});
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    mockPrisma.stashScene.count.mockResolvedValue(0);
    mockPrisma.stashPerformer.count.mockResolvedValue(0);
    mockPrisma.stashStudio.count.mockResolvedValue(0);
    mockPrisma.stashTag.count.mockResolvedValue(0);
    mockPrisma.stashGroup.count.mockResolvedValue(0);
    mockPrisma.stashGallery.count.mockResolvedValue(0);
    mockPrisma.stashImage.count.mockResolvedValue(0);
    mockPrisma.stashClip.count.mockResolvedValue(0);
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });
  });

  it("should iterate all users and recompute exclusions for each", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);

    const result = await exclusionComputationService.recomputeAllUsers();

    expect(result.success).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
    // One transaction per user, the write swap (the compute runs on the
    // compute client, outside any Prisma transaction)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    expect(mockPrisma.userExcludedEntity.deleteMany).toHaveBeenCalledTimes(3);
  });

  it("should continue processing other users when one fails", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);

    let callCount = 0;
    mockPrisma.userContentRestriction.findMany.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error("DB error for user 2");
      }
      return [];
    });

    const result = await exclusionComputationService.recomputeAllUsers();

    expect(result.success).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({
      userId: 2,
      error: "DB error for user 2",
    });
  });

  it("should return zero counts when no users exist", async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await exclusionComputationService.recomputeAllUsers();

    expect(result.success).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe("error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ role: "USER" });
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
  });

  it("should propagate transaction errors from recomputeForUser", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("SQLITE_BUSY"));

    await expect(
      exclusionComputationService.recomputeForUser(1)
    ).rejects.toThrow("SQLITE_BUSY");
  });

  it("should propagate errors from computeDirectExclusions phase", async () => {
    mockPrisma.userContentRestriction.findMany.mockRejectedValue(
      new Error("DB read error")
    );
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await expect(
      exclusionComputationService.recomputeForUser(1)
    ).rejects.toThrow("DB read error");
  });
});

describe("hidden and restricted ids never reach SQL text", () => {
  const HOSTILE = "x') OR 1=1 OR je.value IN ('y";
  const HOSTILE_LISTED = "9') OR 1=1 --";

  beforeEach(() => setupPipeline());

  it("binds a hostile hidden id and a hostile listed id as JSON parameters", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "tag", entityId: HOSTILE, instanceId: "" },
    ]);
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "EXCLUDE", [`${HOSTILE_LISTED}:A`]),
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const allSql = [...rawCalls(), ...execCalls()].map((c) => String(c[0]));
    expect(allSql.length).toBeGreaterThan(0);
    for (const sql of allSql) {
      expect(sql).not.toContain(HOSTILE);
      expect(sql).not.toContain(HOSTILE_LISTED);
    }
    const resolves = queriesMatching(RESOLVE_TAG);
    expect(resolves.length).toBeGreaterThanOrEqual(2);
    const allParams = resolves.flatMap(([, ...params]) => params.map(String));
    expect(allParams).toContain(JSON.stringify([HOSTILE]));
    expect(allParams).toContain(
      JSON.stringify([{ id: HOSTILE_LISTED, iid: "A" }])
    );
  });

  it("a hostile id that matches nothing hides nothing beyond the stored row", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "tag", entityId: HOSTILE, instanceId: "instB" },
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(
      new Set([`tag:${HOSTILE}@instB:hidden`])
    );
  });
});
