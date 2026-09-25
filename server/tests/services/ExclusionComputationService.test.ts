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
 * The compute and the swap run on the single-connection compute client and
 * the stats batch on the main client; both are the one mocked prisma here,
 * so fakeRaw routes the compute's queries whichever client issues them. The
 * rows the write phase stores are read from the _peek_result fills.
 */
import type { UserContentRestriction } from "@prisma/client";
import {
  type MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  disconnectComputeClient,
  withComputeConnection,
} from "../../prisma/computeClient.js";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import {
  getUserAllowedInstanceIds,
  getUserInstanceScope,
} from "../../services/UserInstanceService.js";
import { dbWrite } from "../../utils/dbWrite.js";
import type * as dbWriteModule from "../../utils/dbWrite.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

// Mock UserInstanceService before importing service
vi.mock("../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["A"]),
  getUserInstanceScope: vi.fn().mockResolvedValue(["A"]),
  buildInstanceFilterClause: vi
    .fn()
    .mockImplementation((ids: string[], col: string = "s.stashInstanceId") => {
      if (ids.length === 0) return { sql: "1 = 0", params: [] };
      const placeholders = ids.map(() => "?").join(", ");
      return { sql: `${col} IN (${placeholders})`, params: ids };
    }),
}));

// Mock prisma before importing service. Only the stats phase uses Prisma
// delegates on entity tables (counts); resolution, cascades, content rules,
// the empty phase and the write phase are raw SQL.
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// The compute client resolves to the same mocked prisma; the stand-ins in
// tests/helpers/computeClientMock.ts keep the real helpers' statement shape
vi.mock(
  "../../prisma/computeClient.js",
  () => import("../helpers/computeClientMock.js")
);

// The writer queue runs for real (its nesting guard included); the spy
// records the labels the service enqueues directly.
vi.mock("../../utils/dbWrite.js", async (importOriginal) => {
  const actual = await importOriginal<typeof dbWriteModule>();
  return { ...actual, dbWrite: vi.fn(actual.dbWrite) };
});

const mockPrisma = vi.mocked(prisma, true);
const mockAllowedInstances = vi.mocked(getUserAllowedInstanceIds);
const mockDbWrite = vi.mocked(dbWrite);
const mockWithComputeConnection = vi.mocked(withComputeConnection);

/** A row as the _peek_result fill binds it. */
interface FillRow {
  t: string;
  id: string;
  iid: string;
  r: string;
}

const FILL_RESULT = /INSERT OR IGNORE INTO _peek_result/;
const SWAP_DELETE =
  /^DELETE FROM UserExcludedEntity WHERE userId = \? AND NOT \(reason = 'pending' AND computedAt >= \?\)$/;
const SWAP_INSERT =
  /^INSERT OR IGNORE INTO UserExcludedEntity \(userId, entityType, entityId, instanceId, reason, computedAt\) SELECT \?, entityType, entityId, instanceId, reason, \? FROM _peek_result$/;

/** Route $queryRawUnsafe by SQL shape; unmatched queries return no rows. */
function fakeRaw(routes: Array<[RegExp, unknown[]]>) {
  mockPrisma.$queryRawUnsafe.mockImplementation(
    prismaImpl((sql: string) => {
      const hit = routes.find(([re]) => re.test(sql));
      return hit ? hit[1] : [];
    })
  );
}

/** Every $queryRawUnsafe call as [sql, ...params]. */
function rawCalls(): Array<[string, ...unknown[]]> {
  return mockPrisma.$queryRawUnsafe.mock.calls;
}

/** Every $executeRawUnsafe call as [sql, ...params] (temp-table fills). */
function execCalls(): Array<[string, ...unknown[]]> {
  return mockPrisma.$executeRawUnsafe.mock.calls;
}

function queriesMatching(re: RegExp) {
  return rawCalls().filter((c) => re.test(c[0]));
}

/** A row the write phase stores, as the service names its fields. */
interface WrittenRow {
  entityType: string;
  entityId: string;
  instanceId: string;
  reason: string;
}

/** The _peek_result fill payloads, parsed, in the order they were bound. */
function fillChunks(): FillRow[][] {
  return execCalls()
    .filter(([sql]) => FILL_RESULT.test(sql))
    .map(([, json]) => JSON.parse(String(json)) as FillRow[]);
}

/** Rows handed to the write phase: the fills, flattened. */
function createdRows(): WrittenRow[] {
  return fillChunks()
    .flat()
    .map((r) => ({
      entityType: r.t,
      entityId: r.id,
      instanceId: r.iid,
      reason: r.r,
    }));
}

function rowKeys(rows: WrittenRow[]): Set<string> {
  return new Set(
    rows.map((r) => `${r.entityType}:${r.entityId}@${r.instanceId}:${r.reason}`)
  );
}

/** The rows addHiddenEntity merges, as the same keys. */
function mergedKeys(): Set<string> {
  return rowKeys(createdRows());
}

/** Every $executeRawUnsafe SQL from the first `from` match on. */
function sqlFrom(from: RegExp): string[] {
  const sqls = execCalls().map(([sql]) => sql);
  const start = sqls.findIndex((sql) => from.test(sql));
  return start === -1 ? [] : sqls.slice(start);
}

/** Default mocks for a full, empty recompute of a USER on instance A. */
function setupPipeline(allowed: string[] = ["A"]) {
  vi.clearAllMocks();
  mockAllowedInstances.mockResolvedValue(allowed);
  mockPrisma.user.findUnique.mockResolvedValue(partialRow({ role: "USER" }));
  mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
  mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
  mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
  mockPrisma.userEntityStats.upsert.mockResolvedValue(partialRow({}));
  mockPrisma.$queryRaw.mockResolvedValue([]);
  mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  mockPrisma.$executeRaw.mockResolvedValue(0);
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
  ] as const) {
    mockPrisma[model].count.mockResolvedValue(0);
  }
}

/**
 * Park the first recompute at its first read until `release()`; later ones
 * run through. A recompute ends with its one stats batch, so
 * `mockPrisma.$transaction` counts the recomputes that finished.
 */
function parkFirstRecompute() {
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;
  mockPrisma.user.findUnique.mockImplementation(
    prismaImpl(async () => {
      started += 1;
      if (started === 1) await blocker;
      return partialRow({ role: "USER" });
    })
  );
  return { release, started: () => started };
}

function restriction(
  entityType: string,
  mode: string,
  entityIds: string[],
  restrictEmpty = false
) {
  return partialRow<UserContentRestriction>({
    userId: 1,
    entityType,
    mode,
    entityIds: JSON.stringify(entityIds),
    restrictEmpty,
  });
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
    mockPrisma.user.findUnique.mockResolvedValue(partialRow({ role: "USER" }));
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
      // If a sync-triggered recompute is running and the admin saves
      // restrictions (triggering another recompute), the second recompute
      // must NOT be skipped: it has to run to pick up the new restrictions.
      setupPipeline();
      const parked = parkFirstRecompute();

      const first = exclusionComputationService.recomputeForUser(1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = exclusionComputationService.recomputeForUser(1);

      parked.release();
      await Promise.all([first, second]);

      expect(parked.started()).toBeGreaterThanOrEqual(2);
      expect(mockPrisma.$transaction.mock.calls.length).toBeGreaterThanOrEqual(
        2
      );
    });

    it("should coalesce 3+ concurrent callers to at most 2 recomputes", async () => {
      // When N callers arrive concurrently for the same user, at most 2
      // recomputes happen: the running one plus one queued recompute that
      // picks up all pending changes. Without coalescing there would be 5.
      setupPipeline();
      const parked = parkFirstRecompute();

      const first = exclusionComputationService.recomputeForUser(2);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const rest = [2, 2, 2, 2].map((id) =>
        exclusionComputationService.recomputeForUser(id)
      );

      parked.release();
      await Promise.all([first, ...rest]);

      expect(parked.started()).toBe(2);
      // Each recompute ends with its one stats batch
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it("should ensure the second recompute runs after the first completes", async () => {
      // The queued recompute runs after the first finishes, so it sees the
      // latest state (new restrictions saved mid-recompute).
      setupPipeline();
      const executionOrder: string[] = [];
      let started = 0;
      let releaseFirst!: () => void;
      const firstBlocker = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      mockPrisma.user.findUnique.mockImplementation(
        prismaImpl(async () => {
          started += 1;
          executionOrder.push(`start-${started}`);
          if (started === 1) await firstBlocker;
          return partialRow({ role: "USER" });
        })
      );
      // The clip upsert is the last statement a recompute builds, right
      // before its stats batch
      mockPrisma.userEntityStats.upsert.mockImplementation(
        prismaImpl((args) => {
          if (args.where.userId_entityType_instanceId?.entityType === "clip") {
            executionOrder.push(`end-${started}`);
          }
          return partialRow({});
        })
      );

      const first = exclusionComputationService.recomputeForUser(3);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = exclusionComputationService.recomputeForUser(3);

      releaseFirst();
      await Promise.all([first, second]);

      expect(executionOrder).toEqual(["start-1", "end-1", "start-2", "end-2"]);
    });

    it("should allow independent recomputes for different users", async () => {
      // Coalescing applies per user: different users recompute independently.
      setupPipeline();
      let user1Count = 0;
      let user2Count = 0;
      mockPrisma.userContentRestriction.findMany.mockImplementation(
        prismaImpl((args) => {
          if (args?.where?.userId === 10) user1Count++;
          if (args?.where?.userId === 11) user2Count++;
          return [];
        })
      );

      await Promise.all([
        exclusionComputationService.recomputeForUser(10),
        exclusionComputationService.recomputeForUser(11),
      ]);

      expect(user1Count).toBe(1);
      expect(user2Count).toBe(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it("computes in a deferred BEGIN, swaps inside BEGIN IMMEDIATE on the compute client, then updates the stats in one batch on the main client", async () => {
      setupPipeline();

      await exclusionComputationService.recomputeForUser(1);

      expect(mockWithComputeConnection).toHaveBeenCalledTimes(1);
      const sqls = execCalls().map(([sql]) => sql);
      const execOrder = mockPrisma.$executeRawUnsafe.mock.invocationCallOrder;
      // A bare BEGIN is deferred; IMMEDIATE would take the write lock
      expect(sqls[0]).toBe("BEGIN");
      const snapshotEnd = sqls.indexOf("COMMIT");
      expect(snapshotEnd).toBeGreaterThan(0);
      // Every read ran inside the snapshot
      const queryOrder = mockPrisma.$queryRawUnsafe.mock.invocationCallOrder;
      expect(queryOrder.length).toBeGreaterThan(0);
      expect(
        queryOrder.every(
          (o) => o > must(execOrder[0]) && o < must(execOrder[snapshotEnd])
        )
      ).toBe(true);
      // The swap follows the snapshot, and the stats batch the swap's COMMIT
      const swapStart = sqls.indexOf("BEGIN IMMEDIATE");
      expect(swapStart).toBeGreaterThan(snapshotEnd);
      const swapEnd = sqls.indexOf("COMMIT", swapStart);
      expect(swapEnd).toBeGreaterThan(swapStart);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(
        must(mockPrisma.$transaction.mock.invocationCallOrder[0])
      ).toBeGreaterThan(must(execOrder[swapEnd]));
      expect(sqls).not.toContain("ROLLBACK");
    });

    it("the write phase is one DELETE and one INSERT ... SELECT FROM _peek_result inside BEGIN IMMEDIATE on the compute client, enqueued through dbWrite", async () => {
      setupPipeline();
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
        partialRow({
          userId: 7,
          entityType: "scene",
          entityId: "s1",
          instanceId: "A",
        }),
      ]);
      fakeRaw([[RESOLVE_SCENE, [{ id: "s1", instanceId: "A" }]]]);
      const before = Date.now();

      await exclusionComputationService.recomputeForUser(7);

      const swapStart = execCalls().findIndex(
        ([sql]) => sql === "BEGIN IMMEDIATE"
      );
      const swapEnd = execCalls().findIndex(
        ([sql], i) => i > swapStart && sql === "COMMIT"
      );
      const swap = execCalls().slice(swapStart, swapEnd + 1);
      expect(swap.map(([sql]) => sql)).toHaveLength(4);
      expect(must(swap[0])[0]).toBe("BEGIN IMMEDIATE");
      const [deleteSql, deleteUser, deleteSince] = must(swap[1]);
      expect(deleteSql).toMatch(SWAP_DELETE);
      expect(deleteUser).toBe(7);
      // The snapshot's start, as Prisma stores DateTime: epoch milliseconds
      expect(typeof deleteSince).toBe("number");
      expect(Number(deleteSince)).toBeGreaterThanOrEqual(before);
      expect(Number(deleteSince)).toBeLessThanOrEqual(Date.now());
      const [insertSql, insertUser, computedAt] = must(swap[2]);
      expect(insertSql).toMatch(SWAP_INSERT);
      expect(insertUser).toBe(7);
      expect(typeof computedAt).toBe("number");
      expect(must(swap[3])[0]).toBe("COMMIT");
      // The rows went through the TEMP table, not a Prisma createMany
      expect(rowKeys(createdRows())).toEqual(new Set(["scene:s1@A:hidden"]));
      expect(mockPrisma.userExcludedEntity.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.userExcludedEntity.deleteMany).not.toHaveBeenCalled();
      expect(mockDbWrite).toHaveBeenCalledTimes(1);
      expect(must(mockDbWrite.mock.calls[0])[0]).toBe("exclusions.swap");
    });

    it("fillResult binds the records as JSON in chunks of 20,000 and never splices an id", async () => {
      setupPipeline();
      const HOSTILE = "x') OR 1=1; DROP TABLE UserExcludedEntity; --";
      const records = Array.from({ length: 20_001 }, (_, i) => ({
        userId: 1,
        entityType: "scene",
        entityId: i === 0 ? HOSTILE : `s${i}`,
        instanceId: "A",
        reason: "restricted",
      }));

      await exclusionComputationService["fillResult"](mockPrisma, records);

      const sqls = execCalls().map(([sql]) => sql);
      expect(sqls[0]).toMatch(
        /^CREATE TEMP TABLE IF NOT EXISTS _peek_result \(entityType TEXT NOT NULL, entityId TEXT NOT NULL, instanceId TEXT NOT NULL, reason TEXT NOT NULL, PRIMARY KEY \(entityType, entityId, instanceId\)\) WITHOUT ROWID$/
      );
      expect(sqls[1]).toBe("DELETE FROM _peek_result");
      const fills = execCalls().filter(([sql]) => FILL_RESULT.test(sql));
      expect(fills).toHaveLength(2);
      const chunks = fills.map(
        ([, json]) => JSON.parse(String(json)) as FillRow[]
      );
      expect(chunks.map((c) => c.length)).toEqual([20_000, 1]);
      for (const sql of sqls) expect(sql).not.toContain(HOSTILE);
      expect(must(must(chunks[0])[0])).toEqual({
        t: "scene",
        id: HOSTILE,
        iid: "A",
        r: "restricted",
      });
      expect(must(must(chunks[1])[0]).id).toBe("s20000");
    });

    it("updateEntityStats runs after the swap's COMMIT as one dbWriteBatch of eight upserts, with the 16 counts read outside it", async () => {
      setupPipeline();
      const models = [
        "stashScene",
        "stashPerformer",
        "stashStudio",
        "stashTag",
        "stashGroup",
        "stashGallery",
        "stashImage",
        "stashClip",
      ] as const;
      for (const model of models) mockPrisma[model].count.mockResolvedValue(10);
      mockPrisma.userExcludedEntity.count.mockResolvedValue(3);

      await exclusionComputationService.recomputeForUser(1);

      const sqls = execCalls().map(([sql]) => sql);
      const swapCommit = must(
        mockPrisma.$executeRawUnsafe.mock.invocationCallOrder[
          sqls.lastIndexOf("COMMIT")
        ]
      );
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const batch = must(mockPrisma.$transaction.mock.invocationCallOrder[0]);
      expect(batch).toBeGreaterThan(swapCommit);
      // The 8 entity counts, the 8 excluded counts and the 8 upsert
      // statements are built between the swap's COMMIT and the batch
      const between = (orders: number[]) =>
        orders.length > 0 && orders.every((o) => o > swapCommit && o < batch);
      const totals = models.map((m) =>
        must(mockPrisma[m].count.mock.invocationCallOrder[0])
      );
      expect(
        models.every((m) => mockPrisma[m].count.mock.calls.length === 1)
      ).toBe(true);
      expect(between(totals)).toBe(true);
      const excluded =
        mockPrisma.userExcludedEntity.count.mock.invocationCallOrder;
      expect(excluded).toHaveLength(8);
      expect(between(excluded)).toBe(true);
      const upserts =
        mockPrisma.userEntityStats.upsert.mock.invocationCallOrder;
      expect(upserts).toHaveLength(8);
      expect(between(upserts)).toBe(true);
      // The batch is exactly those eight upserts
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        mockPrisma.userEntityStats.upsert.mock.results.map(
          (r): unknown => r.value
        )
      );
      expect(mockPrisma.userEntityStats.upsert).toHaveBeenCalledWith({
        where: {
          userId_entityType_instanceId: {
            userId: 1,
            entityType: "scene",
            instanceId: "",
          },
        },
        create: {
          userId: 1,
          entityType: "scene",
          instanceId: "",
          visibleCount: 7,
        },
        update: { visibleCount: 7 },
      });
    });

    it("a failing INSERT rolls the swap back and the user's old rows stay", async () => {
      setupPipeline();
      mockPrisma.$executeRawUnsafe.mockImplementation(
        prismaImpl((sql: string) =>
          SWAP_INSERT.test(sql)
            ? Promise.reject(new Error("disk I/O error"))
            : 0
        )
      );

      await expect(
        exclusionComputationService.recomputeForUser(1)
      ).rejects.toThrow("disk I/O error");

      const swap = sqlFrom(/^BEGIN IMMEDIATE$/);
      expect(swap[0]).toBe("BEGIN IMMEDIATE");
      expect(swap[1]).toMatch(SWAP_DELETE);
      expect(swap[2]).toMatch(SWAP_INSERT);
      expect(swap[3]).toBe("ROLLBACK");
      expect(swap).not.toContain("COMMIT");
      // No stats after a failed swap, and the connection stays
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(disconnectComputeClient).not.toHaveBeenCalled();
    });

    it("a failed compute rolls its snapshot back, writes nothing and frees the connection", async () => {
      setupPipeline();
      mockPrisma.userHiddenEntity.findMany.mockRejectedValueOnce(
        new Error("DB read error")
      );

      await expect(
        exclusionComputationService.recomputeForUser(30)
      ).rejects.toThrow("DB read error");

      // The ROLLBACK ends the snapshot and drops the TEMP tables it created;
      // nothing else is sent on the connection
      const sqls = execCalls().map(([sql]) => sql);
      expect(sqls[0]).toBe("BEGIN");
      expect(sqls[sqls.length - 1]).toBe("ROLLBACK");
      expect(sqls).not.toContain("BEGIN IMMEDIATE");
      expect(sqls).not.toContain("COMMIT");
      expect(mockDbWrite).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(disconnectComputeClient).not.toHaveBeenCalled();

      // The next recompute gets the connection
      await exclusionComputationService.recomputeForUser(31);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
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

    expect(createdRows()).not.toEqual([]);
    expect(createdRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "tag",
          entityId: "tag1",
          instanceId: "A",
          reason: "restricted",
        }),
        expect.objectContaining({
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
      partialRow({
        userId: 1,
        entityType: "performer",
        entityId: "perf1",
        instanceId: "",
      }),
      partialRow({
        userId: 1,
        entityType: "scene",
        entityId: "scene1",
        instanceId: "",
      }),
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

  it("should delete existing exclusions before inserting the new ones, in one swap", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      partialRow({
        userId: 1,
        entityType: "scene",
        entityId: "scene1",
        instanceId: "A",
      }),
    ]);
    fakeRaw([[RESOLVE_SCENE, [{ id: "scene1", instanceId: "A" }]]]);

    await exclusionComputationService.recomputeForUser(1);

    const swap = sqlFrom(/^BEGIN IMMEDIATE$/);
    expect(swap.findIndex((sql) => SWAP_DELETE.test(sql))).toBe(1);
    expect(swap.findIndex((sql) => SWAP_INSERT.test(sql))).toBe(2);
    expect(swap[3]).toBe("COMMIT");
  });

  it("an empty result still swaps the user's rows away and fills nothing", async () => {
    await exclusionComputationService.recomputeForUser(1);

    expect(execCalls().some(([sql]) => SWAP_DELETE.test(sql))).toBe(true);
    expect(createdRows()).toEqual([]);
  });

  it("should combine restrictions and hidden entities", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("groups", "EXCLUDE", ["g1:A"]),
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      partialRow({
        userId: 1,
        entityType: "scene",
        entityId: "s9",
        instanceId: "A",
      }),
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

    expect(mockWithComputeConnection).not.toHaveBeenCalled();
    expect(mockDbWrite).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
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
    const [sql, ...params] = must(recursive[0]);
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
    expect(must(recursive[0])[0]).toContain(
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

    const [, ...params] = must(queriesMatching(RESOLVE_GROUP)[0]);
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
    expect(must(fill)[1]).toBe(
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
    const [sql, ...params] = must(content[0]);
    expect(sql).toContain("FROM StashScene s");
    expect(sql).toContain("json_each(COALESCE(s.inheritedTagIds");
    expect(sql).toContain("JOIN _peek_refs r");
    expect(params[params.length - 1]).toBe(1);
    expect(createdRows()).toEqual(
      expect.arrayContaining([
        {
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

    const [, ...params] = must(queriesMatching(CONTENT_TAG_SCENE)[0]);
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
    expect(must(noItem[0])[0]).not.toContain("_peek_refs");
    expect(must(noItem[0])[0]).toContain(
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
    const [, ...params] = must(content[0]);
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
    expect(must(queriesMatching(EDGE_CLIP_PRIMARY)[0])[0]).toContain(
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
    expect(must(queriesMatching(EDGE_STUDIO_GALLERY)[0])[0]).toContain(
      "r.inst = x.studioInstanceId"
    );
    expect(must(queriesMatching(EDGE_STUDIO_SCENE)[0])[0]).toContain(
      "r.inst = x.stashInstanceId"
    );
  });

  it("performer hide cascades to scenes, galleries and images", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      partialRow({
        userId: 1,
        entityType: "performer",
        entityId: "p1",
        instanceId: "A",
      }),
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
    expect(must(queriesMatching(EDGE_INHERITED)[0])[0]).toContain(
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
      partialRow({
        userId: 1,
        entityType: "performer",
        entityId: "p1",
        instanceId: "A",
      }),
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
    expect(must(sceneRows[0]).reason).toBe("cascade");
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
      partialRow({
        userId: 1,
        entityType: "performer",
        entityId: "p1",
        instanceId: "",
      }),
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

    const [, ...resolveParams] = must(queriesMatching(RESOLVE_PERFORMER)[0]);
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
    expect(must(fill)[1]).toBe(
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
      partialRow({
        userId: 1,
        entityType: "gallery",
        entityId: "g9",
        instanceId: "A",
      }),
      partialRow({
        userId: 1,
        entityType: "image",
        entityId: "i9",
        instanceId: "A",
      }),
      partialRow({
        userId: 1,
        entityType: "scene",
        entityId: "s9",
        instanceId: "",
      }),
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
    expect(must(galleryFill)[1]).toBe(JSON.stringify([{ id: "g9", iid: "A" }]));
    const imageFill = execCalls().find(([sql]) =>
      /INSERT OR IGNORE INTO _peek_ex_image/.test(sql)
    );
    expect(must(imageFill)[1]).toBe(JSON.stringify([{ id: "i9", iid: "A" }]));
    // The "" scene hide reaches every allowed instance through its per-instance copy
    const sceneFill = execCalls().find(([sql]) =>
      /INSERT OR IGNORE INTO _peek_ex_scene/.test(sql)
    );
    expect(must(sceneFill)[1]).toBe(JSON.stringify([{ id: "s9", iid: "A" }]));
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
      partialRow({
        userId: 1,
        entityType: "gallery",
        entityId: "g9",
        instanceId: "A",
      }),
      partialRow({
        userId: 1,
        entityType: "image",
        entityId: "i9",
        instanceId: "A",
      }),
    ]);
    fakeRaw([
      [RESOLVE_GALLERY, [{ id: "g9", instanceId: "A" }]],
      [RESOLVE_IMAGE, [{ id: "i9", instanceId: "A" }]],
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const tagQuery = queriesMatching(EMPTY_TAG);
    expect(tagQuery).toHaveLength(1);
    const [sql] = must(tagQuery[0]);
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

    const [sql] = must(queriesMatching(EMPTY_TAG)[0]);
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

    expect(createdRows()).toEqual([]);
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
      partialRow({
        userId: 1,
        entityType: "performer",
        entityId: "p1",
        instanceId: "A",
      }),
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
      partialRow({
        userId: 1,
        entityType: "scene",
        entityId: "s4",
        instanceId: "A",
      }),
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
      partialRow({
        userId: 1,
        entityType: "performer",
        entityId: "p2",
        instanceId: "A",
      }),
      partialRow({
        userId: 1,
        entityType: "scene",
        entityId: "s1",
        instanceId: "A",
      }),
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
    expect(must(targeted[0])[0]).toMatch(EMPTY_PERFORMER_UNDER_RESTRICTIONS);
    const refsFill = execCalls().find(
      ([sql, json]) =>
        sql.includes("INSERT OR IGNORE INTO _peek_refs") &&
        String(json).includes("p2")
    );
    expect(refsFill?.[1]).toBe(JSON.stringify([{ id: "p2", iid: "A" }]));
  });

  it("the empty check under the restrictions alone runs before the hides join the sets", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      partialRow({
        userId: 1,
        entityType: "gallery",
        entityId: "g1",
        instanceId: "A",
      }),
      partialRow({
        userId: 1,
        entityType: "image",
        entityId: "i1",
        instanceId: "A",
      }),
    ]);
    const events: string[] = [];
    mockPrisma.$executeRawUnsafe.mockImplementation(
      prismaImpl((sql: string, json?: string) => {
        if (sql.includes("INSERT OR IGNORE INTO _peek_ex_image")) {
          events.push(`image set += ${json}`);
        }
        return 0;
      })
    );
    mockPrisma.$queryRawUnsafe.mockImplementation(
      prismaImpl((sql: string) => {
        if (/CROSS JOIN StashGallery AS g/.test(sql)) {
          events.push("empty check for the hidden gallery");
          return [];
        }
        if (RESOLVE_GALLERY.test(sql)) return [{ id: "g1", instanceId: "A" }];
        if (RESOLVE_IMAGE.test(sql)) return [{ id: "i1", instanceId: "A" }];
        return [];
      })
    );

    await exclusionComputationService.recomputeForUser(1);

    // The hidden image joins the sets only after the check
    expect(events).toEqual([
      "empty check for the hidden gallery",
      `image set += ${JSON.stringify([{ id: "i1", iid: "A" }])}`,
    ]);
  });

  it("own hides stay hidden under their own cascades and emptiness", async () => {
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      partialRow({
        userId: 1,
        entityType: "studio",
        entityId: "st1",
        instanceId: "A",
      }),
      partialRow({
        userId: 1,
        entityType: "scene",
        entityId: "s1",
        instanceId: "A",
      }),
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
    mockPrisma.user.findUnique.mockResolvedValue(partialRow({ role: "ADMIN" }));
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "INCLUDE", ["1:A"], true),
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      partialRow({
        userId: 1,
        entityType: "performer",
        entityId: "p1",
        instanceId: "A",
      }),
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

    expect(mergedKeys()).toEqual(
      new Set(["tag:2@A:hidden", "gallery:g2@A:cascade"])
    );
    // Hides of a tag expand to descendants through the same recursive resolve
    expect(must(queriesMatching(RESOLVE_TAG)[0])[0]).toContain(
      "WITH RECURSIVE"
    );
    // The compute runs in a read snapshot on the compute connection, then
    // one INSERT OR IGNORE ... SELECT merges the rows in one short unit: an
    // existing row keeps its reason, so a hide never masks a restriction.
    expect(mockWithComputeConnection).toHaveBeenCalledTimes(1);
    const sqls = execCalls().map(([sql]) => sql);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls).toContain("COMMIT");
    expect(sqls).not.toContain("BEGIN IMMEDIATE");
    const merges = execCalls().filter(([sql]) => SWAP_INSERT.test(sql));
    expect(merges).toHaveLength(1);
    expect(must(merges[0])[1]).toBe(1);
    expect(typeof must(merges[0])[2]).toBe("number");
    expect(sqls.some((sql) => SWAP_DELETE.test(sql))).toBe(false);
    expect(mockPrisma.userExcludedEntity.upsert).not.toHaveBeenCalled();
    expect(mockDbWrite).toHaveBeenCalledTimes(1);
    expect(must(mockDbWrite.mock.calls[0])[0]).toBe("exclusions.hide");
    // No stats update on a hide
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
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

    expect(mergedKeys()).toEqual(
      new Set(["tag:2@A:hidden", "tag:7@A:hidden", "scene:s7@A:cascade"])
    );
    // The cascade source carries both tags, and nothing lands on instance B
    const fill = execCalls().find(([sql]) =>
      /INSERT OR IGNORE INTO _peek_refs/.test(sql)
    );
    expect(must(fill)[1]).toBe(
      JSON.stringify([
        { id: "2", iid: "A" },
        { id: "7", iid: "A" },
      ])
    );
    expect([...mergedKeys()].some((k) => k.includes("@B:"))).toBe(false);
  });

  it("should merge only the stored row when there are no descendants or cascades", async () => {
    fakeRaw([[RESOLVE_PERFORMER, [{ id: "perf1", instanceId: "A" }]]]);

    await exclusionComputationService.addHiddenEntity(
      1,
      "performer",
      "perf1",
      "A"
    );

    expect(createdRows()).toHaveLength(1);
    expect(mergedKeys()).toEqual(new Set(["performer:perf1@A:hidden"]));
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

    expect(mergedKeys()).toEqual(
      new Set(["performer:perf1@A:hidden", "scene:scene1@A:cascade"])
    );
    const fill = execCalls().find(([sql]) =>
      /INSERT OR IGNORE INTO _peek_refs/.test(sql)
    );
    expect(must(fill)[1]).toBe(JSON.stringify([{ id: "perf1", iid: "A" }]));
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
    const fromHide = mergedKeys();

    setupPipeline(["A", "B"]);
    fakeRaw(routes);
    mockPrisma.user.findUnique.mockResolvedValue(partialRow({ role: "ADMIN" }));
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      partialRow({
        userId: 1,
        entityType: "tag",
        entityId: "2",
        instanceId: "",
      }),
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
    mockPrisma.user.findUnique.mockResolvedValue(partialRow({ role: "USER" }));
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
    mockPrisma.userEntityStats.upsert.mockResolvedValue(partialRow({}));
  });

  it("should queue async recompute via setImmediate", () => {
    // Spy on setImmediate
    const setImmediateSpy = vi.spyOn(global, "setImmediate");

    exclusionComputationService.removeHiddenEntity(1, "performer", "perf1");

    // Verify setImmediate was called
    expect(setImmediateSpy).toHaveBeenCalled();

    setImmediateSpy.mockRestore();
  });

  it("should call recomputeForUser asynchronously", async () => {
    // Use fake timers to control setImmediate
    vi.useFakeTimers();

    exclusionComputationService.removeHiddenEntity(1, "performer", "perf1");

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
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("Database error"));

    // This should not throw
    exclusionComputationService.removeHiddenEntity(1, "performer", "perf1");

    // Run the async callback - should not throw even if recompute fails
    await expect(vi.runAllTimersAsync()).resolves.not.toThrow();

    vi.useRealTimers();
  });
});

describe("recomputeAllUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks for a successful recompute pipeline
    mockPrisma.user.findUnique.mockResolvedValue(partialRow({ role: "USER" }));
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
    mockPrisma.userEntityStats.upsert.mockResolvedValue(partialRow({}));
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
  });

  it("should iterate all users and recompute exclusions for each", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      partialRow({ id: 1 }),
      partialRow({ id: 2 }),
      partialRow({ id: 3 }),
    ]);

    const result = await exclusionComputationService.recomputeAllUsers();

    expect(result.success).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
    // One transaction per user, the write swap (the compute runs on the
    // compute client, outside any Prisma transaction)
    // One compute and one stats batch per user
    expect(mockWithComputeConnection).toHaveBeenCalledTimes(3);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it("should continue processing other users when one fails", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      partialRow({ id: 1 }),
      partialRow({ id: 2 }),
      partialRow({ id: 3 }),
    ]);

    let callCount = 0;
    mockPrisma.userContentRestriction.findMany.mockImplementation(
      prismaImpl(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("DB error for user 2"));
        }
        return [];
      })
    );

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

describe("recomputeUsersForInstances", () => {
  const mockScope = vi.mocked(getUserInstanceScope);
  let recomputeForUser: MockInstance<
    typeof exclusionComputationService.recomputeForUser
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findMany.mockResolvedValue([
      partialRow({ id: 1 }),
      partialRow({ id: 2 }),
      partialRow({ id: 3 }),
    ]);
    mockPrisma.userExcludedEntity.findMany.mockResolvedValue([]);
    mockScope.mockImplementation((userId) =>
      Promise.resolve(
        { 1: ["A"], 2: ["B"], 3: ["A", "B"] }[userId] ?? ([] as string[])
      )
    );
    recomputeForUser = vi
      .spyOn(exclusionComputationService, "recomputeForUser")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    recomputeForUser.mockRestore();
  });

  const recomputed = () => recomputeForUser.mock.calls.map((call) => call[0]);

  it("recomputes the users whose scope holds a changed instance and skips the others", async () => {
    const result = await exclusionComputationService.recomputeUsersForInstances(
      ["A"]
    );

    expect(recomputed()).toEqual([1, 3]);
    expect(result).toEqual({ success: 2, failed: 0, errors: [] });
  });

  it("a user with a pending hold is recomputed even when no instance changed", async () => {
    mockPrisma.userExcludedEntity.findMany.mockResolvedValue([
      partialRow({ userId: 2 }),
    ]);

    await exclusionComputationService.recomputeUsersForInstances([]);

    expect(recomputed()).toEqual([2]);
    // No instance changed: nobody's scope was read
    expect(mockScope).not.toHaveBeenCalled();
  });

  it("a user with a pending hold on an unchanged instance is recomputed once", async () => {
    mockPrisma.userExcludedEntity.findMany.mockResolvedValue([
      partialRow({ userId: 2 }),
      partialRow({ userId: 3 }),
    ]);

    await exclusionComputationService.recomputeUsersForInstances(["A"]);

    expect(recomputed()).toEqual([1, 2, 3]);
  });

  it("usersWithPendingHolds asks for each user once", async () => {
    mockPrisma.userExcludedEntity.findMany.mockResolvedValue([
      partialRow({ userId: 5 }),
    ]);

    expect(await exclusionComputationService.usersWithPendingHolds()).toEqual([
      5,
    ]);
    expect(mockPrisma.userExcludedEntity.findMany).toHaveBeenCalledWith({
      where: { reason: "pending" },
      select: { userId: true },
      distinct: ["userId"],
    });
  });

  it("a failing user is counted and the next one still runs", async () => {
    recomputeForUser.mockImplementation((userId) =>
      userId === 1
        ? Promise.reject(new Error("compute failed"))
        : Promise.resolve()
    );

    const result = await exclusionComputationService.recomputeUsers([1, 2]);

    expect(result).toEqual({
      success: 1,
      failed: 1,
      errors: [{ userId: 1, error: "compute failed" }],
    });
  });
});

describe("error handling", () => {
  beforeEach(() => setupPipeline());

  it("should propagate errors from the stats batch", async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("SQLITE_BUSY"));

    await expect(
      exclusionComputationService.recomputeForUser(1)
    ).rejects.toThrow("SQLITE_BUSY");
  });

  it("should propagate errors from computeDirectExclusions phase", async () => {
    mockPrisma.userContentRestriction.findMany.mockRejectedValue(
      new Error("DB read error")
    );

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
      partialRow({
        userId: 1,
        entityType: "tag",
        entityId: HOSTILE,
        instanceId: "",
      }),
    ]);
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      restriction("tags", "EXCLUDE", [`${HOSTILE_LISTED}:A`]),
    ]);

    await exclusionComputationService.recomputeForUser(1);

    const allSql = [...rawCalls(), ...execCalls()].map((c) => c[0]);
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
      partialRow({
        userId: 1,
        entityType: "tag",
        entityId: HOSTILE,
        instanceId: "instB",
      }),
    ]);

    await exclusionComputationService.recomputeForUser(1);

    expect(rowKeys(createdRows())).toEqual(
      new Set([`tag:${HOSTILE}@instB:hidden`])
    );
  });
});
