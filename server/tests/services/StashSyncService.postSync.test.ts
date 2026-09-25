/**
 * Unit tests for the end of the post-sync steps (`runPostSyncSteps`): once a
 * run's steps have written, SQLite's planner statistics are refreshed
 * (`PRAGMA optimize=0x10002`) and the WAL is emptied into the database file
 * (`PRAGMA wal_checkpoint(TRUNCATE)`), each as its own writer-queue unit.
 *
 * The post-step services are mocked; Prisma is the shared mock, and the
 * writer queue runs for real with a spy that records which unit each
 * statement ran in. The steps themselves are covered with real SQLite in
 * integration/services/StashSyncService.postSync.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { SyncChangeSet, noChanges } from "../../services/SyncChangeSet.js";
import type * as dbWriteModule from "../../utils/dbWrite.js";
import { logger } from "../../utils/logger.js";
import { objectContaining, stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { prismaImpl } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: { get: vi.fn(), getAllEnabled: vi.fn(() => []) },
}));
vi.mock("../../services/MergeReconciliationService.js", () => ({
  mergeReconciliationService: {},
}));
vi.mock("../../services/ClipPreviewProber.js", () => ({
  clipPreviewProber: {},
}));

// The post-sync steps
vi.mock("../../services/SceneTagInheritanceService.js", () => ({
  sceneTagInheritanceService: {
    computeInheritedTags: vi.fn().mockResolvedValue(undefined),
    scenesInheritingFrom: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../../services/ImageGalleryInheritanceService.js", () => ({
  imageGalleryInheritanceService: {
    applyGalleryInheritance: vi.fn().mockResolvedValue(undefined),
    imagesInGalleries: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../../services/EntityImageCountService.js", () => ({
  entityImageCountService: {
    rebuildAllImageCounts: vi.fn().mockResolvedValue(undefined),
    countedThrough: vi
      .fn()
      .mockResolvedValue({ performers: [], studios: [], tags: [] }),
  },
}));
vi.mock("../../services/UserStatsService.js", () => ({
  userStatsService: { rebuildAllStats: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: {
    recomputeAllUsers: vi.fn(),
    recomputeUsersForInstances: vi.fn(),
    usersWithPendingHolds: vi.fn(),
  },
}));

/** The label of the writer-queue unit running now, if any. */
const unit = vi.hoisted(() => ({ running: undefined as string | undefined }));

// The writer queue runs for real; the spy notes each unit while it runs
vi.mock("../../utils/dbWrite.js", async (importOriginal) => {
  const actual = await importOriginal<typeof dbWriteModule>();
  function tracked<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return actual.dbWrite(label, async () => {
      unit.running = label;
      try {
        return await fn();
      } finally {
        unit.running = undefined;
      }
    });
  }
  return { ...actual, dbWrite: vi.fn(tracked) };
});

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockExclusions = vi.mocked(exclusionComputationService, true);
const mockLogger = vi.mocked(logger, true);

const INSTANCE = "inst-a";
const OPTIMIZE = "PRAGMA optimize=0x10002";
const CHECKPOINT = "PRAGMA wal_checkpoint(TRUNCATE)";

/** A raw statement as it reached Prisma, with the unit it ran in. */
interface Statement {
  sql: string;
  unit: string | undefined;
  order: number;
}

let statements: Statement[];
let order: number;

/** The SQL of a `$queryRaw` tagged-template call. */
function templateSql(query: unknown): string {
  if (Array.isArray(query)) return query.join("?");
  if (query !== null && typeof query === "object" && "sql" in query) {
    return String(query.sql);
  }
  return String(query);
}

/** The statements matching `sql`, in the order they ran. */
const ran = (sql: string) => statements.filter((s) => s.sql === sql);

/** The order of a mock's first call among every mock's calls. */
function callOrder(mock: { invocationCallOrder: number[] }): number {
  return must(mock.invocationCallOrder[0], "a call");
}

/** vitest's call order of the `$queryRawUnsafe` call that ran `sql`. */
function queryOrder(sql: string): number {
  const index = mockPrisma.$queryRawUnsafe.mock.calls.findIndex(
    ([query]) => query === sql
  );
  return must(mockPrisma.$queryRawUnsafe.mock.invocationCallOrder[index], sql);
}

/** A change set in which the cleanup soft-deleted one scene of INSTANCE. */
function oneDeletedScene(): SyncChangeSet {
  const changes = new SyncChangeSet();
  changes.addDeleted("scene", INSTANCE, ["5"]);
  return changes;
}

/** The one run of `sql`. */
function onlyRun(sql: string): Statement {
  const runs = ran(sql);
  expect(runs, sql).toHaveLength(1);
  return must(runs[0], sql);
}

describe("StashSyncService post-sync steps: planner statistics and the WAL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statements = [];
    order = 0;
    mockPrisma.$queryRawUnsafe.mockImplementation(
      prismaImpl((sql: string) => {
        statements.push({ sql, unit: unit.running, order: ++order });
        return [];
      })
    );
    mockPrisma.$queryRaw.mockImplementation(
      prismaImpl<typeof mockPrisma.$queryRaw>((query) => {
        statements.push({
          sql: templateSql(query),
          unit: unit.running,
          order: ++order,
        });
        return [{ busy: 0, log: 0, checkpointed: 0 }];
      })
    );
    mockPrisma.$executeRaw.mockResolvedValue(0);
    mockPrisma.stashInstance.findMany.mockResolvedValue([]);
    mockExclusions.recomputeAllUsers.mockResolvedValue({
      success: 1,
      failed: 0,
      errors: [],
    });
    mockExclusions.recomputeUsersForInstances.mockResolvedValue({
      success: 1,
      failed: 0,
      errors: [],
    });
    mockExclusions.usersWithPendingHolds.mockResolvedValue([]);
  });

  it("a sync ends by running PRAGMA optimize through dbWrite after the exclusion recompute", async () => {
    await stashSyncService["runPostSyncSteps"](oneDeletedScene(), {
      full: false,
    });

    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(OPTIMIZE);
    const optimize = onlyRun(OPTIMIZE);
    expect(optimize.unit).toBe("sync.optimize");
    expect(mockExclusions.recomputeUsersForInstances).toHaveBeenCalledWith([
      INSTANCE,
    ]);
    const recompute = callOrder(mockExclusions.recomputeUsersForInstances.mock);
    expect(queryOrder(OPTIMIZE)).toBeGreaterThan(recompute);
  });

  it("then empties the WAL into the database file in a unit of its own", async () => {
    await stashSyncService["runPostSyncSteps"](oneDeletedScene(), {
      full: false,
    });

    const optimize = onlyRun(OPTIMIZE);
    const checkpoint = onlyRun(CHECKPOINT);
    expect(checkpoint.unit).toBe("sync.checkpoint");
    expect(checkpoint.order).toBeGreaterThan(optimize.order);
    // Nothing runs after them
    expect(must(statements[statements.length - 1]).sql).toBe(CHECKPOINT);
  });

  it("a full sync runs both after recomputing every user", async () => {
    await stashSyncService["runPostSyncSteps"](new SyncChangeSet(), {
      full: true,
    });

    const recompute = callOrder(mockExclusions.recomputeAllUsers.mock);
    expect(queryOrder(OPTIMIZE)).toBeGreaterThan(recompute);
    expect(onlyRun(CHECKPOINT).order).toBeGreaterThan(onlyRun(OPTIMIZE).order);
  });

  it("a sync that changed nothing and holds no pending user runs neither", async () => {
    await stashSyncService["runPostSyncSteps"](new SyncChangeSet(), {
      full: false,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      "nothing changed, post-sync steps skipped"
    );
    expect(ran(OPTIMIZE)).toEqual([]);
    expect(ran(CHECKPOINT)).toEqual([]);
  });

  it("a sync that changed nothing but rewrote images runs both after re-applying gallery inheritance", async () => {
    const changes = new SyncChangeSet();
    changes.addBatch("image", {
      ...noChanges(),
      written: [{ id: "9", instanceId: INSTANCE }],
    });

    await stashSyncService["runPostSyncSteps"](changes, { full: false });

    expect(onlyRun(OPTIMIZE).unit).toBe("sync.optimize");
    expect(onlyRun(CHECKPOINT).unit).toBe("sync.checkpoint");
  });

  it("a busy checkpoint is logged and the steps finish", async () => {
    mockPrisma.$queryRaw.mockImplementation(
      prismaImpl<typeof mockPrisma.$queryRaw>(() => [
        { busy: 1, log: 12, checkpointed: 4 },
      ])
    );

    await expect(
      stashSyncService["runPostSyncSteps"](oneDeletedScene(), { full: false })
    ).resolves.toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      stringContaining("WAL checkpoint could not finish"),
      objectContaining({ walPages: 12, checkpointedPages: 4 })
    );
  });

  it("a failing PRAGMA optimize is logged, the checkpoint still runs and the steps finish", async () => {
    mockPrisma.$queryRawUnsafe.mockImplementation(
      prismaImpl((sql: string) => {
        statements.push({ sql, unit: unit.running, order: ++order });
        return Promise.reject(new Error("disk I/O error"));
      })
    );

    await expect(
      stashSyncService["runPostSyncSteps"](oneDeletedScene(), { full: false })
    ).resolves.toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      stringContaining("PRAGMA optimize failed"),
      objectContaining({ error: "disk I/O error" })
    );
    expect(ran(CHECKPOINT)).toHaveLength(1);
  });
});
