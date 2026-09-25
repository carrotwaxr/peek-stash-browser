/**
 * Unit tests for StashSyncService.cleanupDeletedEntities, which soft-deletes
 * cached rows Stash no longer returns (deleted or merged there).
 *
 * The routine is raw SQL: one live count, one anti-join binding Stash's whole
 * id list as one JSON parameter, then 500-row soft-delete UPDATEs, each a
 * writer-queue unit. These tests route `$queryRawUnsafe` by statement shape
 * and read the UPDATEs from `$executeRawUnsafe`. Real-SQLite coverage is in
 * integration/services/StashSyncService.cleanup.integration.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StashClient } from "../../graphql/StashClient.js";
import type { FindSceneMarkersQuery } from "../../graphql/generated/graphql.js";
import prisma from "../../prisma/singleton.js";
import { mergeReconciliationService } from "../../services/MergeReconciliationService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import {
  SyncBusyError,
  stashSyncService,
} from "../../services/StashSyncService.js";
import { dbWrite } from "../../utils/dbWrite.js";
import type * as dbWriteModule from "../../utils/dbWrite.js";
import { stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";
import { untrusted } from "../helpers/untrusted.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: { get: vi.fn(), getDefault: vi.fn() },
}));

vi.mock("../../services/MergeReconciliationService.js", () => ({
  mergeReconciliationService: {
    reconcileDeletedScenes: vi.fn(),
    reconcileRecentDeletions: vi.fn(),
  },
}));

// The post-sync steps an admin's cleanup runs for what it soft-deleted
vi.mock("../../services/UserStatsService.js", () => ({
  userStatsService: { rebuildAllStats: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../services/EntityImageCountService.js", () => ({
  entityImageCountService: {
    rebuildAllImageCounts: vi.fn().mockResolvedValue(undefined),
    countedThrough: vi
      .fn()
      .mockResolvedValue({ performers: [], studios: [], tags: [] }),
  },
}));
vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: {
    usersWithPendingHolds: vi.fn().mockResolvedValue([]),
    recomputeUsersForInstances: vi
      .fn()
      .mockResolvedValue({ success: 0, failed: 0, errors: [] }),
  },
}));
vi.mock("../../services/ClipPreviewProber.js", () => ({
  clipPreviewProber: {},
}));

// The writer queue runs for real; the spy records the units cleanup enqueues
vi.mock("../../utils/dbWrite.js", async (importOriginal) => {
  const actual = await importOriginal<typeof dbWriteModule>();
  return { ...actual, dbWrite: vi.fn(actual.dbWrite) };
});

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockDbWrite = vi.mocked(dbWrite);
const mockReconcile = vi.mocked(mergeReconciliationService, true);

const INSTANCE = "inst-a";
const PAGE_SIZE = 5000;

/** Every type, its table and the Stash operation that lists its ids. */
const TYPES = [
  { type: "scene", table: "StashScene", method: "findSceneIDs" },
  { type: "performer", table: "StashPerformer", method: "findPerformerIDs" },
  { type: "studio", table: "StashStudio", method: "findStudioIDs" },
  { type: "tag", table: "StashTag", method: "findTagIDs" },
  { type: "group", table: "StashGroup", method: "findGroupIDs" },
  { type: "gallery", table: "StashGallery", method: "findGalleryIDs" },
  { type: "image", table: "StashImage", method: "findImageIDs" },
  { type: "clip", table: "StashClip", method: "findSceneMarkers" },
] as const;

type CleanupType = (typeof TYPES)[number]["type"];

type SceneMarkerRow =
  FindSceneMarkersQuery["findSceneMarkers"]["scene_markers"][number];

/** The stubbed Stash client: one mock per id operation. */
const client = {
  findSceneIDs: vi.fn<StashClient["findSceneIDs"]>(),
  findPerformerIDs: vi.fn<StashClient["findPerformerIDs"]>(),
  findStudioIDs: vi.fn<StashClient["findStudioIDs"]>(),
  findTagIDs: vi.fn<StashClient["findTagIDs"]>(),
  findGroupIDs: vi.fn<StashClient["findGroupIDs"]>(),
  findGalleryIDs: vi.fn<StashClient["findGalleryIDs"]>(),
  findImageIDs: vi.fn<StashClient["findImageIDs"]>(),
  findSceneMarkers: vi.fn<StashClient["findSceneMarkers"]>(),
  // A job scopes the client to its abort signal: the stub stays itself
  withSignal: vi.fn<StashClient["withSignal"]>(),
};

const ids = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

/**
 * Stash answers `type`'s id query with `keepSet`, paged by the request's
 * filter, reporting `count` (default: the keep-set's size) as its total.
 */
function stashHas(type: CleanupType, keepSet: string[], count?: number): void {
  const total = count ?? keepSet.length;
  const pageOf = (filter: { page?: number | null; per_page?: number | null }) =>
    keepSet.slice(
      ((filter.page ?? 1) - 1) * (filter.per_page ?? 25),
      (filter.page ?? 1) * (filter.per_page ?? 25)
    );
  switch (type) {
    case "scene":
      client.findSceneIDs.mockImplementation((vars) =>
        Promise.resolve({
          findScenes: {
            count: total,
            scenes: pageOf(vars?.filter ?? {}).map((id) => ({ id })),
          },
        })
      );
      return;
    case "performer":
      client.findPerformerIDs.mockImplementation((vars) =>
        Promise.resolve({
          findPerformers: {
            count: total,
            performers: pageOf(vars?.filter ?? {}).map((id) => ({ id })),
          },
        })
      );
      return;
    case "studio":
      client.findStudioIDs.mockImplementation((vars) =>
        Promise.resolve({
          findStudios: {
            count: total,
            studios: pageOf(vars?.filter ?? {}).map((id) => ({ id })),
          },
        })
      );
      return;
    case "tag":
      client.findTagIDs.mockImplementation((vars) =>
        Promise.resolve({
          findTags: {
            count: total,
            tags: pageOf(vars?.filter ?? {}).map((id) => ({ id })),
          },
        })
      );
      return;
    case "group":
      client.findGroupIDs.mockImplementation((vars) =>
        Promise.resolve({
          findGroups: {
            count: total,
            groups: pageOf(vars?.filter ?? {}).map((id) => ({ id })),
          },
        })
      );
      return;
    case "gallery":
      client.findGalleryIDs.mockImplementation((vars) =>
        Promise.resolve({
          findGalleries: {
            count: total,
            galleries: pageOf(vars?.filter ?? {}).map((id) => ({ id })),
          },
        })
      );
      return;
    case "image":
      client.findImageIDs.mockImplementation((vars) =>
        Promise.resolve({
          findImages: {
            count: total,
            images: pageOf(vars?.filter ?? {}).map((id) => ({ id })),
          },
        })
      );
      return;
    case "clip":
      client.findSceneMarkers.mockImplementation((vars) =>
        Promise.resolve({
          findSceneMarkers: {
            count: total,
            scene_markers: pageOf(vars?.filter ?? {}).map((id) =>
              partialRow<SceneMarkerRow>({ id })
            ),
          },
        })
      );
      return;
  }
}

const LIVE_COUNT =
  /^SELECT COUNT\(\*\) AS n FROM "(\w+)" WHERE "stashInstanceId" = \? AND "deletedAt" IS NULL$/;
const DELETE_SET =
  /^SELECT "id"(, "phash")? FROM "(\w+)" WHERE "stashInstanceId" = \? AND "deletedAt" IS NULL AND "id" NOT IN \(SELECT value FROM json_each\(\?\)\)$/;
const SOFT_DELETE =
  /^UPDATE "(\w+)" SET "deletedAt" = \? WHERE "stashInstanceId" = \? AND "deletedAt" IS NULL AND "id" IN \(SELECT value FROM json_each\(\?\)\)$/;

/** Collapse whitespace so statement shapes compare on one line. */
const flat = (sql: string) => sql.replace(/\s+/g, " ").trim();

/**
 * The cache holds `live` rows of the type, of which `missing` are not in
 * Stash's list (the anti-join's answer). Each UPDATE reports its batch size.
 */
function cacheHas(
  live: number,
  missing: Array<{ id: string; phash?: string | null }>
): void {
  mockPrisma.$queryRawUnsafe.mockImplementation(
    prismaImpl((sql: string) => {
      if (LIVE_COUNT.test(flat(sql))) return [{ n: BigInt(live) }];
      if (DELETE_SET.test(flat(sql))) return missing;
      return [];
    })
  );
  mockPrisma.$executeRawUnsafe.mockImplementation(
    prismaImpl((_sql: string, ...values: unknown[]) => {
      const batch: unknown = JSON.parse(String(values[2]));
      return Array.isArray(batch) ? batch.length : 0;
    })
  );
}

/** A raw call as [flattened sql, ...params]. */
function flatCall(call: [string, ...unknown[]]): [string, ...unknown[]] {
  const [sql, ...values] = call;
  return [flat(sql), ...values];
}

/** Every raw query as [flattened sql, ...params]. */
function queries(): Array<[string, ...unknown[]]> {
  return mockPrisma.$queryRawUnsafe.mock.calls.map(flatCall);
}

/** Every soft-delete UPDATE as [flattened sql, ...params]. */
function updates(): Array<[string, ...unknown[]]> {
  return mockPrisma.$executeRawUnsafe.mock.calls
    .map(flatCall)
    .filter(([sql]) => SOFT_DELETE.test(sql));
}

const cleanup = (type: CleanupType, instanceId = INSTANCE) =>
  stashSyncService["cleanupDeletedEntities"](type, instanceId);

describe("StashSyncService.cleanupDeletedEntities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stashInstanceManager.get).mockReturnValue(
      partialRow<StashClient>(client)
    );
    client.withSignal.mockReturnValue(partialRow<StashClient>(client));
    mockReconcile.reconcileDeletedScenes.mockResolvedValue({
      merged: 0,
      ambiguous: 0,
    });
    mockReconcile.reconcileRecentDeletions.mockResolvedValue({
      merged: 0,
      ambiguous: 0,
    });
    cacheHas(0, []);
  });

  afterEach(() => {
    stashSyncService["abortController"] = null;
  });

  describe("Stash's id list", () => {
    it.each(TYPES)(
      "asks for $type ids with $method, 5,000 a page",
      async ({ type, method }) => {
        stashHas(type, ["1"]);
        cacheHas(1, []);

        await cleanup(type);

        expect(client[method]).toHaveBeenCalledWith({
          filter: { per_page: PAGE_SIZE, page: 1 },
        });
      }
    );

    it("pages until it holds Stash's count, then computes the delete set in one statement", async () => {
      stashHas("image", ids(1, 12_000));
      cacheHas(12_010, []);

      await cleanup("image");

      expect(client.findImageIDs).toHaveBeenCalledTimes(3);
      const deleteSets = queries().filter(([sql]) => DELETE_SET.test(sql));
      expect(deleteSets).toHaveLength(1);
      const keepSet: unknown = JSON.parse(String(must(deleteSets[0])[2]));
      expect(keepSet).toEqual(ids(1, 12_000));
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("returns the keep-set Stash returned as stashIds", async () => {
      stashHas("tag", ["1", "2", "3"]);
      cacheHas(3, []);

      const outcome = await cleanup("tag");

      expect(outcome).toEqual({
        deleted: 0,
        deletedIds: [],
        stashIds: ["1", "2", "3"],
      });
    });
  });

  describe("soft-delete", () => {
    it("soft-deletes the delete set in 500-row writer units, binding now, the instance and the ids", async () => {
      const now = new Date("2026-09-24T12:00:00.000Z");
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      try {
        stashHas("image", ids(1, 3000));
        const missing = ids(3001, 4100).map((id) => ({ id }));
        cacheHas(4100, missing);

        const outcome = await cleanup("image");

        expect(outcome.deleted).toBe(1100);
        const writes = updates();
        expect(writes.map((w): unknown => JSON.parse(String(w[3])))).toEqual([
          ids(3001, 3500),
          ids(3501, 4000),
          ids(4001, 4100),
        ]);
        for (const [sql, ms, instanceId] of writes) {
          expect(sql).toMatch(SOFT_DELETE);
          expect(must(SOFT_DELETE.exec(sql))[1]).toBe("StashImage");
          expect(ms).toBe(now.getTime());
          expect(instanceId).toBe(INSTANCE);
        }
        expect(mockDbWrite.mock.calls.map((c) => c[0])).toEqual([
          "sync.cleanup.images",
          "sync.cleanup.images",
          "sync.cleanup.images",
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it.each(TYPES)("writes $type rows to $table", async ({ type, table }) => {
      stashHas(type, ids(1, 9));
      cacheHas(10, [{ id: "10" }]);

      const outcome = await cleanup(type);

      expect(outcome.deleted).toBe(1);
      const [write] = updates();
      expect(must(SOFT_DELETE.exec(must(write)[0]))[1]).toBe(table);
      const [deleteSet] = queries().filter(([sql]) => DELETE_SET.test(sql));
      expect(must(DELETE_SET.exec(must(deleteSet)[0]))[2]).toBe(table);
    });

    it("returns the soft-deleted ids as deletedIds", async () => {
      stashHas("performer", ids(1, 10));
      cacheHas(12, [{ id: "11" }, { id: "12" }]);

      const outcome = await cleanup("performer");

      expect(outcome).toEqual({
        deleted: 2,
        deletedIds: ["11", "12"],
        stashIds: ids(1, 10),
      });
    });

    it("binds the instance id and the Stash ids, never splicing them into SQL", async () => {
      stashHas("scene", ["1", "x'y"]);
      cacheHas(3, [{ id: "z'z", phash: null }]);

      await cleanup("scene", "inst-'q");

      const statements = [...queries(), ...updates()];
      for (const [sql] of statements) {
        expect(sql).not.toContain("inst-'q");
        expect(sql).not.toContain("x'y");
        expect(sql).not.toContain("z'z");
      }
      const [deleteSet] = queries().filter(([sql]) => DELETE_SET.test(sql));
      expect(must(deleteSet).slice(1)).toEqual([
        "inst-'q",
        JSON.stringify(["1", "x'y"]),
      ]);
      const [count] = queries().filter(([sql]) => LIVE_COUNT.test(sql));
      expect(must(count).slice(1)).toEqual(["inst-'q"]);
      expect(must(updates()[0]).slice(2)).toEqual([
        "inst-'q",
        JSON.stringify(["z'z"]),
      ]);
    });

    it("writes nothing when every cached row is still in Stash", async () => {
      stashHas("gallery", ids(1, 5));
      cacheHas(5, []);

      const outcome = await cleanup("gallery");

      expect(outcome).toEqual({
        deleted: 0,
        deletedIds: [],
        stashIds: ids(1, 5),
      });
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(mockDbWrite).not.toHaveBeenCalled();
    });
  });

  describe("scenes and merges", () => {
    it("runs the catch-up first, soft-deletes, then reconciles the delete set", async () => {
      stashHas("scene", ids(1, 3));
      const missing = [
        { id: "4", phash: "abc" },
        { id: "5", phash: null },
      ];
      cacheHas(5, missing);

      const outcome = await cleanup("scene");

      expect(outcome.deleted).toBe(2);
      expect(mockReconcile.reconcileRecentDeletions).toHaveBeenCalledWith(
        INSTANCE
      );
      expect(mockReconcile.reconcileDeletedScenes).toHaveBeenCalledWith(
        INSTANCE,
        missing
      );
      const [deleteSet] = queries().filter(([sql]) => DELETE_SET.test(sql));
      expect(must(DELETE_SET.exec(must(deleteSet)[0]))[1]).toBe(', "phash"');
      // Catch-up, then Stash, then the soft-delete, then the merge: scenes
      // that left Stash together are deleted by then, so none is a target
      const order = [
        must(
          mockReconcile.reconcileRecentDeletions.mock.invocationCallOrder[0]
        ),
        must(client.findSceneIDs.mock.invocationCallOrder[0]),
        must(mockPrisma.$executeRawUnsafe.mock.invocationCallOrder[0]),
        must(mockReconcile.reconcileDeletedScenes.mock.invocationCallOrder[0]),
      ];
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("selects no phash and reconciles nothing for other types", async () => {
      stashHas("studio", ids(1, 3));
      cacheHas(4, [{ id: "4" }]);

      await cleanup("studio");

      const [deleteSet] = queries().filter(([sql]) => DELETE_SET.test(sql));
      expect(must(DELETE_SET.exec(must(deleteSet)[0]))[1]).toBeUndefined();
      expect(mockReconcile.reconcileRecentDeletions).not.toHaveBeenCalled();
      expect(mockReconcile.reconcileDeletedScenes).not.toHaveBeenCalled();
    });
  });

  describe("guards", () => {
    it("zero ids with live rows returns a skip reason", async () => {
      stashHas("scene", []);
      cacheHas(100, []);

      const outcome = await cleanup("scene");

      expect(outcome).toEqual({
        deleted: 0,
        deletedIds: [],
        skipped: stringContaining("100"),
      });
      expect(queries().filter(([sql]) => DELETE_SET.test(sql))).toEqual([]);
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it("zero ids and nothing cached is not a skip", async () => {
      stashHas("tag", []);
      cacheHas(0, []);

      const outcome = await cleanup("tag");

      expect(outcome).toEqual({ deleted: 0, deletedIds: [], stashIds: [] });
    });

    it.each([
      { what: "page 1", keepSet: [], count: 500, fetched: 0 },
      {
        what: "a later page",
        keepSet: ids(1, 5000),
        count: 5100,
        fetched: 5000,
      },
    ])(
      "skips when $what comes back empty before the reported count",
      async ({ keepSet, count, fetched }) => {
        stashHas("performer", keepSet, count);
        cacheHas(count, []);

        const outcome = await cleanup("performer");

        expect(outcome).toEqual({
          deleted: 0,
          deletedIds: [],
          skipped: stringContaining(`Stash returned ${fetched} of ${count}`),
        });
        expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
        expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
      }
    );

    it("refuses when more than half, and more than 50 rows, would go", async () => {
      stashHas("scene", ids(1, 40));
      cacheHas(
        120,
        ids(41, 120).map((id) => ({ id, phash: null }))
      );

      const outcome = await cleanup("scene");

      expect(outcome).toEqual({
        deleted: 0,
        deletedIds: [],
        skipped: stringContaining("80 of 120"),
      });
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(mockReconcile.reconcileDeletedScenes).not.toHaveBeenCalled();
    });

    it.each([
      { missing: 50, refused: false },
      { missing: 51, refused: true },
    ])(
      "with 60 live rows, $missing missing is refused: $refused",
      async ({ missing, refused }) => {
        stashHas("group", ids(1, 60 - missing));
        cacheHas(
          60,
          ids(61 - missing, 60).map((id) => ({ id }))
        );

        const outcome = await cleanup("group");

        expect(outcome.deleted).toBe(refused ? 0 : missing);
        expect(outcome.skipped !== undefined).toBe(refused);
      }
    );

    it("with ignoreRatioGuard, soft-deletes what the ratio guard refuses", async () => {
      stashHas("scene", ids(1, 40));
      cacheHas(
        120,
        ids(41, 120).map((id) => ({ id, phash: null }))
      );

      const outcome = await stashSyncService["cleanupDeletedEntities"](
        "scene",
        INSTANCE,
        { ignoreRatioGuard: true }
      );

      expect(outcome).toEqual({
        deleted: 80,
        deletedIds: ids(41, 120),
        stashIds: ids(1, 40),
      });
      expect(mockReconcile.reconcileDeletedScenes).toHaveBeenCalledTimes(1);
    });

    it.each([
      { what: "a partial list", keepSet: ids(1, 100), count: 120 },
      { what: "an empty list", keepSet: [], count: 0 },
    ])(
      "with ignoreRatioGuard, still skips $what",
      async ({ keepSet, count }) => {
        stashHas("performer", keepSet, count);
        cacheHas(120, []);

        const outcome = await stashSyncService["cleanupDeletedEntities"](
          "performer",
          INSTANCE,
          { ignoreRatioGuard: true }
        );

        expect(outcome).toEqual({
          deleted: 0,
          deletedIds: [],
          skipped: stringContaining("Cleanup skipped:"),
        });
        expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
      }
    );
  });

  describe("errors", () => {
    it("`Sync aborted` propagates", async () => {
      stashHas("image", ids(1, 10));
      cacheHas(10, []);
      const controller = new AbortController();
      controller.abort();
      stashSyncService["abortController"] = controller;

      await expect(cleanup("image")).rejects.toThrow("Sync aborted");
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it("a `Sync aborted` rejection from Stash propagates", async () => {
      client.findTagIDs.mockRejectedValue(new Error("Sync aborted"));

      await expect(cleanup("tag")).rejects.toThrow("Sync aborted");
    });

    it("a Stash error returns { deleted: 0, error }", async () => {
      client.findSceneIDs.mockRejectedValue(
        new Error("connect ECONNREFUSED 10.0.0.2:9999")
      );

      const outcome = await cleanup("scene");

      expect(outcome).toEqual({
        deleted: 0,
        deletedIds: [],
        error: "connect ECONNREFUSED 10.0.0.2:9999",
      });
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it("a response without a count is an error", async () => {
      client.findImageIDs.mockResolvedValue({
        findImages: { images: [{ id: "1" }], count: untrusted(undefined) },
      });

      const outcome = await cleanup("image");

      expect(outcome).toEqual({
        deleted: 0,
        deletedIds: [],
        error: stringContaining("count"),
      });
    });

    it("a database error in the soft-delete returns the error with the delete set it attempted", async () => {
      stashHas("clip", ids(1, 9));
      cacheHas(10, [{ id: "10" }]);
      mockPrisma.$executeRawUnsafe.mockRejectedValue(
        new Error("disk I/O error")
      );

      const outcome = await cleanup("clip");

      // Nothing is known to have changed, but the ids feed the run's change
      // set, since an earlier unit of the soft-delete may have committed
      expect(outcome).toEqual({
        deleted: 0,
        deletedIds: ["10"],
        error: "disk I/O error",
      });
    });

    it("a database error before the soft-delete returns no ids", async () => {
      stashHas("clip", ids(1, 9));
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error("disk I/O error"));

      const outcome = await cleanup("clip");

      expect(outcome).toEqual({
        deleted: 0,
        deletedIds: [],
        error: "disk I/O error",
      });
    });
  });
});

describe("StashSyncService.runCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stashInstanceManager.get).mockReturnValue(
      partialRow<StashClient>(client)
    );
    client.withSignal.mockReturnValue(partialRow<StashClient>(client));
    mockReconcile.reconcileDeletedScenes.mockResolvedValue({
      merged: 0,
      ambiguous: 0,
    });
    mockReconcile.reconcileRecentDeletions.mockResolvedValue({
      merged: 0,
      ambiguous: 0,
    });
    mockPrisma.syncState.updateMany.mockResolvedValue({ count: 1 });
    cacheHas(0, []);
  });

  it("applies a refused deletion and clears the type's lastError", async () => {
    stashHas("scene", ids(1, 40));
    cacheHas(
      120,
      ids(41, 120).map((id) => ({ id, phash: null }))
    );

    const outcome = await stashSyncService.runCleanup("scene", INSTANCE, {
      ignoreRatioGuard: true,
    });

    expect(outcome.deleted).toBe(80);
    expect(mockPrisma.syncState.updateMany.mock.calls).toEqual([
      [
        {
          where: { stashInstanceId: INSTANCE, entityType: "scene" },
          data: { lastError: null },
        },
      ],
    ]);
    expect(stashSyncService.isSyncing()).toBe(false);
  });

  it("records a skip in the type's lastError", async () => {
    stashHas("tag", ids(1, 100), 120);
    cacheHas(120, []);

    await stashSyncService.runCleanup("tag", INSTANCE, {
      ignoreRatioGuard: true,
    });

    expect(mockPrisma.syncState.updateMany.mock.calls).toEqual([
      [
        {
          where: { stashInstanceId: INSTANCE, entityType: "tag" },
          data: {
            lastError: stringContaining(
              "Cleanup skipped: Stash returned 100 of 120 tags"
            ),
          },
        },
      ],
    ]);
  });

  it("holds the lock while it runs: a sync or a second cleanup is refused", async () => {
    let answer: () => void = () => {};
    client.findTagIDs.mockReturnValue(
      new Promise((resolve) => {
        answer = () => resolve({ findTags: { count: 1, tags: [{ id: "1" }] } });
      })
    );

    const running = stashSyncService.runCleanup("tag", INSTANCE, {
      ignoreRatioGuard: true,
    });

    expect(stashSyncService.isSyncing()).toBe(true);
    expect(() =>
      stashSyncService.runCleanup("scene", INSTANCE, { ignoreRatioGuard: true })
    ).toThrow(SyncBusyError);
    await expect(stashSyncService.fullSync(INSTANCE)).rejects.toThrow(
      SyncBusyError
    );
    // Stash is asked once the lock is taken
    await vi.waitFor(() => {
      expect(client.findTagIDs).toHaveBeenCalled();
    });
    answer();
    await running;
    expect(stashSyncService.isSyncing()).toBe(false);
  });

  it("an abort rejects with `Sync aborted`, records nothing and frees the lock", async () => {
    client.findImageIDs.mockImplementation(() => {
      stashSyncService.abort();
      return Promise.reject(new Error("Sync aborted"));
    });

    await expect(
      stashSyncService.runCleanup("image", INSTANCE, { ignoreRatioGuard: true })
    ).rejects.toThrow("Sync aborted");

    expect(mockPrisma.syncState.updateMany).not.toHaveBeenCalled();
    expect(stashSyncService.isSyncing()).toBe(false);
  });
});
